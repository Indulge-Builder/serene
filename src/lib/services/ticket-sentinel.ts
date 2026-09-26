// ticket-sentinel.ts — THE sentinel: one small watcher per ticket (member-ticket-plan.md 7.6,
// migration 0199). Not a process per ticket: an actor whose identity is the ticket row, whose
// memory is sentinel_state, whose mailbox is ticket_events + ticket_message_links (a trigger
// sets next_wake_at on every arrival) and whose alarm clock is next_wake_at. A shared pool
// (the Trigger.dev minute task, or the laptop loop) claims due tickets and runs one wake each.
//
// A wake, in order:
//   1. the RULE pass, no model — pure code over the ticket, its policy row and the clock:
//      first response due, update cadence due, vendor or member silent too long, requested time
//      passed, resolution target near or past, the 48-hour close window, a stale proposal. Each
//      rule fires ONCE per key (state.fired remembers); a fire = a ticket event + notifications
//      through the catalog, and the state is written in the SAME transaction as the event, before
//      any notification leaves, so a duplicate fire is impossible by construction.
//   2. the READING pass, routing tier, only when there is new text (a human note, a linked member
//      message) and the ticket's token budget allows: a refreshed summary, checklist items the note
//      completed, money figures, a changed request (proposed, never applied), the member's tone,
//      "the member says delivered" (proposed). Fails closed to rules only.
//   3. SLEEP: the next alarm is the earliest deadline ahead, never longer than SENTINEL_MAX_SLEEP.
//
// Every write goes through the two RPCs (apply_ticket_change for anything with an event,
// sentinel_sleep for the bookkeeping) — never a direct UPDATE on sia.tickets.

import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { createNotification } from "@/lib/services/notifications-service";
import { ticketsAdminDb, resolveSlaPolicy } from "@/lib/services/tickets-service";
import { moveTicketStatusCore, SENTINEL_ACTOR, ticketDeadline } from "@/lib/services/ticket-mutations";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQueendomSeats } from "@/lib/services/queendom-seats";
import { lessonPromptBlock } from "@/lib/services/intake-lessons";
import { mapRows } from "@/lib/utils/rows";
import { businessMinutesBetween } from "@/lib/utils/sla";
import {
  SENTINEL_BATCH, SENTINEL_CLOSE_AFTER_MIN, SENTINEL_LEASE_MIN, SENTINEL_MAX_SLEEP_MIN, SENTINEL_PROMPT_VERSION,
  SENTINEL_PROPOSAL_NUDGE_MIN, SENTINEL_READ_MAX_CHARS, SENTINEL_TOKEN_BUDGET, SENTINEL_WARN_BEFORE_MIN,
  TICKET_ACTIVE_STATUSES, TICKET_SLA_STOPPED_STATUSES, TICKET_STATUSES, TICKET_TRANSITIONS, TICKETS_PATH, type TicketStatus,
} from "@/lib/constants/tickets";
import type { SentinelState, TicketEventRow, TicketMessageLinkRow, TicketRow, TicketSlaPolicyRow } from "@/lib/types/ticket";
import type { NotificationType } from "@/lib/types/database";

const LOG = "[ticket-sentinel]";

// ─── State ───────────────────────────────────────────────────────────────────

export function normalizeState(raw: unknown): SentinelState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SentinelState>;
  return {
    version: 1,
    wakes: Number(r.wakes ?? 0),
    last_wake_at: r.last_wake_at,
    last_event_at: r.last_event_at,
    last_link_at: r.last_link_at,
    fired: r.fired && typeof r.fired === "object" ? { ...r.fired } : {},
    reads: Number(r.reads ?? 0),
    tokens_in: Number(r.tokens_in ?? 0),
    tokens_out: Number(r.tokens_out ?? 0),
    last_read_at: r.last_read_at,
    last_tone: r.last_tone,
    proposed_brief: r.proposed_brief,
    proposal: r.proposal && typeof r.proposal === "object" ? r.proposal : undefined,
  };
}

// ─── The plan (pure) ─────────────────────────────────────────────────────────

export type SentinelRecipient = "assignee" | "bishop" | "queen" | "founder";
export type SentinelNotify = { to: SentinelRecipient; type: NotificationType; key?: string; title: string; body: string };
export type SentinelFire = { key: string; event_type: string; body: string; meta: Record<string, unknown>; notify: SentinelNotify[] };

export type LinkedText = { link: TicketMessageLinkRow; text: string | null; at: string | null; from_member: boolean };

export type WakeInput = {
  ticket: TicketRow;
  policy: TicketSlaPolicyRow | null;
  state: SentinelState;
  now: Date;
  /** Non-sentinel events newer than state.last_event_at, oldest first. */
  newEvents: TicketEventRow[];
  /** Links newer than state.last_link_at, with the message text, oldest first. */
  newLinks: LinkedText[];
};

export type WakePlan = {
  fires: SentinelFire[];
  /** Columns to set alongside the first fire (or with a plain observation when nothing fires). */
  patch: Record<string, unknown>;
  state: SentinelState;
  nextWakeAt: Date;
  wakeReason: string;
  /** Close the ticket (resolved and quiet for the window). */
  autoClose: boolean;
  /** What the reading pass should look at; null when nothing new was said. */
  readInput: { notes: string[]; memberMessages: string[]; staffMessages: string[] } | null;
};

const MIN = 60_000;
const iso = (d: Date) => d.toISOString();
const plus = (d: Date, min: number) => new Date(d.getTime() + min * MIN);
const hours = (min: number) => (min >= 120 ? `${Math.round(min / 60)} hours` : `${min} minutes`);

function elapsedMin(from: string, now: Date, businessHours: boolean): number {
  const start = new Date(from);
  return businessHours ? businessMinutesBetween(start, now) : (now.getTime() - start.getTime()) / MIN;
}

/** The whole rule pass. No I/O: given the ticket, the policy, the memory and the clock, what fires and when to wake next. */
export function planWake(input: WakeInput): WakePlan {
  const { ticket: t, policy, now, newEvents, newLinks } = input;
  const state: SentinelState = { ...input.state, fired: { ...input.state.fired } };
  const fires: SentinelFire[] = [];
  const patch: Record<string, unknown> = {};
  const wakeCandidates: Date[] = [];
  const label = `${t.ticket_no} · ${t.title}`;
  const active = TICKET_ACTIVE_STATUSES.includes(t.status);
  const slaRunning = active && !TICKET_SLA_STOPPED_STATUSES.includes(t.status);
  const bh = policy?.business_hours ?? true;
  const ladder = Array.isArray(policy?.escalation) ? (policy!.escalation as { after_min?: number; to?: string }[]) : [];

  const fire = (key: string, event_type: string, body: string, meta: Record<string, unknown>, notify: SentinelNotify[]) => {
    if (state.fired[key]) return false;
    state.fired[key] = iso(now);
    fires.push({ key, event_type, body, meta, notify });
    return true;
  };
  const dueSoon = (dueIso: string | null, beforeMin: number) => dueIso ? plus(new Date(dueIso), -beforeMin) : null;
  const consider = (d: Date | null | undefined) => { if (d && d.getTime() > now.getTime()) wakeCandidates.push(d); };

  // ── What arrived since the last wake ─────────────────────────────────────
  const humanNotes = newEvents.filter((e) => e.event_type === "note" && e.actor_kind === "human" && e.body);
  const memberLinks = newLinks.filter((l) => l.from_member);
  const staffLinks = newLinks.filter((l) => !l.from_member && l.link.link_kind === "staff_reply");
  if (newEvents.length) state.last_event_at = newEvents[newEvents.length - 1].created_at;
  if (newLinks.length) state.last_link_at = newLinks[newLinks.length - 1].link.created_at;

  // First response: the first human note or staff reply after creation.
  if (!t.first_responded_at) {
    const first = [...humanNotes.map((e) => e.created_at), ...staffLinks.map((l) => l.at ?? l.link.created_at)].sort()[0];
    if (first) {
      patch.first_responded_at = first;
      fire("first_response", "observation", "First response recorded.", { at: first }, []);
    }
  }
  // A member reply: stamp it and tell the assignee (transactional, never muted).
  if (memberLinks.length) {
    const last = memberLinks[memberLinks.length - 1];
    patch.last_member_update_at = last.at ?? last.link.created_at;
    fire(`member_reply:${last.link.id}`, "observation", `Member replied${memberLinks.length > 1 ? ` (${memberLinks.length} messages)` : ""}.`, { links: memberLinks.map((l) => l.link.id) }, [
      { to: "assignee", type: "ticket_member_replied", title: `Member replied on ${t.ticket_no}`, body: (last.text ?? "").slice(0, 140) || label },
    ]);
  }

  // ── The clock rules ──────────────────────────────────────────────────────
  if (t.status === "proposed") {
    const nudgeAt = plus(new Date(t.created_at), SENTINEL_PROPOSAL_NUDGE_MIN);
    if (now >= nudgeAt) {
      fire("proposal_stale", "reminder_sent", `Proposed ${hours(Math.round((now.getTime() - new Date(t.created_at).getTime()) / MIN))} ago and still waiting for approval.`, {}, [
        { to: "bishop", type: "ticket_proposed", key: "ticket_proposed_for_approval", title: `${t.ticket_no} still waits for your approval`, body: label },
      ]);
    } else consider(nudgeAt);
  }

  if (slaRunning && t.first_response_due_at && !t.first_responded_at && !patch.first_responded_at) {
    const due = new Date(t.first_response_due_at);
    const warnAt = dueSoon(t.first_response_due_at, SENTINEL_WARN_BEFORE_MIN.first_response)!;
    if (now >= due) {
      fire("fr_breach", "sla_breached", `No first response by ${due.toISOString()}.`, { which: "first_response", due: t.first_response_due_at }, [
        { to: "assignee", type: "ticket_sla_breach", title: `${t.ticket_no} missed its first response`, body: label },
      ]);
      for (const step of ladder) {
        const at = plus(due, Number(step.after_min ?? 0));
        const to = (step.to ?? "bishop") as SentinelRecipient;
        if (now >= at) fire(`fr_esc:${to}`, "escalated", `First response ${hours(Number(step.after_min ?? 0))} past due; escalated to the ${to}.`, { which: "first_response", to }, [
          { to, type: "ticket_sla_breach", key: "ticket_sla_breach_manager", title: `${t.ticket_no} has had no first response`, body: `${label} · ${hours(Number(step.after_min ?? 0))} past due` },
        ]);
        else consider(at);
      }
    } else {
      if (now >= warnAt) fire("fr_warn", "sla_warning", `First response due in ${SENTINEL_WARN_BEFORE_MIN.first_response} minutes.`, { which: "first_response", due: t.first_response_due_at }, [
        { to: "assignee", type: "ticket_sla_warning", key: "ticket_sla_warning", title: `${t.ticket_no}: first response due in ${SENTINEL_WARN_BEFORE_MIN.first_response} min`, body: label },
      ]);
      else consider(warnAt);
      consider(due);
    }
  }

  if (slaRunning && t.next_update_due_at && policy) {
    const due = new Date(t.next_update_due_at);
    if (now >= due) {
      const quiet = elapsedMin(t.next_update_due_at, now, bh) + policy.update_cadence_min;
      if (fire(`update:${t.next_update_due_at}`, "reminder_sent", `No update for about ${hours(Math.round(quiet))}; the member deserves a line.`, { which: "update", due: t.next_update_due_at }, [
        { to: "assignee", type: "ticket_sla_warning", key: "ticket_sla_warning", title: `${t.ticket_no}: no update for ${hours(Math.round(quiet))}`, body: label },
      ])) {
        patch.next_update_due_at = ticketDeadline(now, policy.update_cadence_min, bh);
        consider(new Date(patch.next_update_due_at as string));
      }
    } else consider(due);
  }

  if (active && policy) {
    // Vendor silent: nothing from anyone on a ticket waiting on a vendor.
    if (t.status === "awaiting_vendor") {
      const lastActivity = state.last_event_at ?? t.updated_at;
      const silent = elapsedMin(lastActivity, now, bh);
      if (silent >= policy.vendor_silence_min) {
        fire(`vendor_silent:${lastActivity}`, "reminder_sent", `Waiting on the vendor for ${hours(Math.round(silent))}; chase them.`, { which: "vendor_silence", since: lastActivity }, [
          { to: "assignee", type: "ticket_sla_warning", key: "ticket_sla_warning", title: `${t.ticket_no}: vendor silent for ${hours(Math.round(silent))}`, body: label },
        ]);
      } else consider(new Date(ticketDeadline(new Date(lastActivity), policy.vendor_silence_min, bh)));
    }
    // Member silent: we asked, they have not answered.
    if (t.status === "awaiting_member") {
      const since = (patch.last_member_update_at as string | undefined) ?? t.last_member_update_at ?? t.updated_at;
      const silent = elapsedMin(since, now, bh);
      if (silent >= policy.member_silence_min) {
        fire(`member_silent:${since}`, "reminder_sent", `The member has not answered for ${hours(Math.round(silent))}; a gentle nudge is due.`, { which: "member_silence", since }, [
          { to: "assignee", type: "ticket_sla_warning", key: "ticket_sla_warning", title: `${t.ticket_no}: member quiet for ${hours(Math.round(silent))}`, body: label },
        ]);
      } else consider(new Date(ticketDeadline(new Date(since), policy.member_silence_min, bh)));
    }
    // The requested time came and went.
    if (t.requested_for && !["in_delivery", "payment_due"].includes(t.status)) {
      const at = new Date(t.requested_for);
      if (now >= at) fire(`requested_for:${t.requested_for}`, "reminder_sent", "The requested date and time has passed and the ticket is not in delivery.", { which: "requested_for", at: t.requested_for }, [
        { to: "assignee", type: "ticket_sla_warning", key: "ticket_sla_warning", title: `${t.ticket_no}: the requested time has passed`, body: label },
      ]);
      else consider(at);
    }
  }

  if (slaRunning && t.resolve_due_at) {
    const due = new Date(t.resolve_due_at);
    const warnAt = dueSoon(t.resolve_due_at, SENTINEL_WARN_BEFORE_MIN.resolve)!;
    if (now >= due) {
      fire("res_breach", "sla_breached", `Resolution target ${due.toISOString()} missed.`, { which: "resolve", due: t.resolve_due_at }, [
        { to: "assignee", type: "ticket_sla_breach", title: `${t.ticket_no} missed its resolution target`, body: label },
      ]);
      for (const step of ladder) {
        const at = plus(due, Number(step.after_min ?? 0));
        const to = (step.to ?? "bishop") as SentinelRecipient;
        if (now >= at) fire(`res_esc:${to}`, "escalated", `Resolution ${hours(Number(step.after_min ?? 0))} past target; escalated to the ${to}.`, { which: "resolve", to }, [
          { to, type: "ticket_sla_breach", key: "ticket_sla_breach_manager", title: `${t.ticket_no} is past its resolution target`, body: `${label} · ${hours(Number(step.after_min ?? 0))} past` },
        ]);
        else consider(at);
      }
    } else {
      if (now >= warnAt) fire("res_warn", "sla_warning", `Resolution due in ${hours(SENTINEL_WARN_BEFORE_MIN.resolve)}.`, { which: "resolve", due: t.resolve_due_at }, [
        { to: "assignee", type: "ticket_sla_warning", key: "ticket_sla_warning", title: `${t.ticket_no}: resolve within ${hours(SENTINEL_WARN_BEFORE_MIN.resolve)}`, body: label },
      ]);
      else consider(warnAt);
      consider(due);
    }
  }

  // Resolved and quiet for the window → closed. A member reply in the window keeps it open.
  let autoClose = false;
  if (t.status === "resolved" && t.closed_at) {
    const closeAt = plus(new Date(t.closed_at), SENTINEL_CLOSE_AFTER_MIN);
    const repliedSince = memberLinks.some((l) => (l.at ?? l.link.created_at) > t.closed_at!);
    if (now >= closeAt && !repliedSince) autoClose = true;
    else consider(closeAt);
  }

  // ── Sleep ────────────────────────────────────────────────────────────────
  const cap = plus(now, SENTINEL_MAX_SLEEP_MIN);
  const earliest = wakeCandidates.sort((a, b) => a.getTime() - b.getTime())[0];
  const nextWakeAt = earliest && earliest < cap ? new Date(Math.max(earliest.getTime(), now.getTime() + MIN)) : cap;
  const wakeReason = earliest && earliest < cap ? "deadline" : "routine";

  state.wakes += 1;
  state.last_wake_at = iso(now);

  const notes = humanNotes.map((e) => e.body!);
  const memberMessages = memberLinks.map((l) => l.text ?? "").filter(Boolean);
  const staffMessages = staffLinks.map((l) => l.text ?? "").filter(Boolean);
  const readInput = notes.length || memberMessages.length ? { notes, memberMessages, staffMessages } : null;

  return { fires, patch, state, nextWakeAt, wakeReason, autoClose, readInput };
}

// ─── The reading pass ────────────────────────────────────────────────────────

type Reading = {
  summary: string | null;
  checklist_done: number[];
  tone: "praise" | "neutral" | "frustrated" | "angry" | "none";
  asks_status: boolean;
  brief_changes: Record<string, unknown>;
  money: Record<string, unknown>;
  delivered: boolean;
  observation: string | null;
  /** The judgement: a legal next status the text clearly supports, or null. A human decides. */
  suggested_status: TicketStatus | null;
  suggested_reason: string | null;
};

const READ_SYSTEM = `You are the sentinel on ONE concierge ticket at Indulge (luxury concierge for wealthy members). New text arrived: internal notes by the team and/or WhatsApp messages from the member. Read it against the ticket and answer ONLY a JSON object, no prose, no code fence:

{
  "summary": 2 to 4 plain sentences on where the ticket stands now (what was asked, what has been done, what is next), or null if nothing changed,
  "checklist_done": [indexes of checklist items the new text clearly shows as completed],
  "tone": one of [praise, neutral, frustrated, angry, none] — the CLIENT's tone in their messages; none when the member said nothing,
  "asks_status": true when the member asks where things stand,
  "brief_changes": { field: new value } for details the CLIENT changed (a new date, a different count, a cancellation); {} when nothing changed. Never invent.
  "money": { "cost_inr": number, "price_inr": number, "quote_inr": number, "payment_status": "unpaid"|"partial"|"paid" } — only the fields the notes state plainly (e.g. "Cost 8250, selling 9500, paid via card"); {} otherwise,
  "delivered": true only when the member confirms they received or enjoyed the thing,
  "observation": one short line worth keeping in the diary, or null,
  "suggested_status": one of the LEGAL NEXT STATUSES listed with the ticket, or null,
  "suggested_reason": one plain sentence quoting what in the new text supports it, or null
}

Rules: quote the notes, never guess; a note about another ticket is ignored; a team note does not carry the member's tone.
On suggested_status: you only SUGGEST, a person decides, so suggest only when the new text plainly says it. "Sent the options, waiting for sir to pick" supports awaiting_member. "Vendor will confirm by evening" supports awaiting_vendor. "Out for delivery" supports in_delivery. "Delivered, member happy" or the member confirming receipt supports resolved. "Invoice sent, payment pending" supports payment_due. The member cancelling supports dropped. When nothing plainly supports a move, or the ticket is already there, answer null. Never suggest a status that is not in the legal list.`;

function parseReading(raw: string, checklistLen: number, legalNext: readonly TicketStatus[]): Reading | null {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = fenced.indexOf("{"); const b = fenced.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(fenced.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
  const tones = new Set(["praise", "neutral", "frustrated", "angry", "none"]);
  const money: Record<string, unknown> = {};
  const m = (o.money && typeof o.money === "object" ? o.money : {}) as Record<string, unknown>;
  for (const k of ["cost_inr", "price_inr", "quote_inr"]) if (typeof m[k] === "number" && m[k] as number > 0) money[k] = m[k];
  if (typeof m.payment_status === "string" && ["unpaid", "partial", "paid"].includes(m.payment_status)) money.payment_status = m.payment_status;
  return {
    summary: typeof o.summary === "string" && o.summary.trim() ? o.summary.trim().slice(0, 800) : null,
    checklist_done: Array.isArray(o.checklist_done) ? [...new Set(o.checklist_done.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < checklistLen))] : [],
    tone: typeof o.tone === "string" && tones.has(o.tone) ? (o.tone as Reading["tone"]) : "none",
    asks_status: o.asks_status === true,
    brief_changes: o.brief_changes && typeof o.brief_changes === "object" && !Array.isArray(o.brief_changes) ? (o.brief_changes as Record<string, unknown>) : {},
    money,
    delivered: o.delivered === true,
    observation: typeof o.observation === "string" && o.observation.trim() ? o.observation.trim().slice(0, 300) : null,
    // Believed only when it is a move the state machine allows from here.
    suggested_status: typeof o.suggested_status === "string" && (legalNext as readonly string[]).includes(o.suggested_status) ? (o.suggested_status as TicketStatus) : null,
    suggested_reason: typeof o.suggested_reason === "string" && o.suggested_reason.trim() ? o.suggested_reason.trim().slice(0, 300) : null,
  };
}

export async function readNewText(t: TicketRow, input: NonNullable<WakePlan["readInput"]>, state: SentinelState): Promise<{ reading: Reading | null; runId: string | null }> {
  const admin = createAdminClient();
  const lesson = await lessonPromptBlock("sentinel"); // the approved lesson (0240), empty when none
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: "sentinel", member_id: t.member_id, prompt_version: SENTINEL_PROMPT_VERSION + lesson.suffix,
    input_ref: { ticket_id: t.id, notes: input.notes.length, member_messages: input.memberMessages.length },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = (ok: boolean, patch: Record<string, unknown>) => runId ? admin.schema("sia").from("extraction_runs").update({ finished_at: new Date().toISOString(), ok, ...patch }).eq("id", runId) : Promise.resolve();
  try {
    const [depth, llm] = await Promise.all([getPiiMaskingDepth(), resolveLlmForJob("routing")]);
    const clip = (xs: string[]) => xs.join("\n---\n").slice(-SENTINEL_READ_MAX_CHARS);
    const checklist = t.checklist.map((c, i) => `${i}. [${c.done_at ? "x" : " "}] ${c.label}`).join("\n");
    // The sentinel never suggests closing (the quiet-after-resolved rule owns that) or re-opening.
    const legalNext = (TICKET_TRANSITIONS[t.status] ?? []).filter((x) => x !== "closed" && x !== "open" && x !== "proposed");
    const user = maskPii(
      `Ticket ${t.ticket_no}: ${t.title}\nCategory: ${t.category}${t.sub_category ? ` / ${t.sub_category}` : ""} · status ${t.status} · priority ${t.priority}\nRequested for: ${t.requested_for ?? "not set"}\nLEGAL NEXT STATUSES from ${t.status}: ${legalNext.join(", ") || "(none)"}\nBrief: ${JSON.stringify(t.brief)}\nMoney so far: ${JSON.stringify(t.money)}\nChecklist:\n${checklist || "(none)"}\nSummary so far: ${t.summary ?? "(none)"}\n\nNEW TEAM NOTES:\n${clip(input.notes) || "(none)"}\n\nNEW CLIENT MESSAGES:\n${clip(input.memberMessages) || "(none)"}\n\nNEW STAFF REPLIES TO THE CLIENT:\n${clip(input.staffMessages) || "(none)"}\n\nReturn the JSON.`,
      depth,
    );
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: Math.min(llm.maxTokens, 900), system: READ_SYSTEM + lesson.block, messages: [{ role: "user", content: user }], cachePrefix: true });
    state.reads += 1;
    state.tokens_in += result.usage.inputTokens;
    state.tokens_out += result.usage.outputTokens;
    state.last_read_at = new Date().toISOString();
    const reading = parseReading(result.text, t.checklist.length, legalNext);
    await finish(Boolean(reading), { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens, output: reading ?? {}, error: reading ? null : "unparseable" });
    return { reading, runId };
  } catch (e) {
    console.error(`${LOG} reading failed on ${t.ticket_no} (rules only):`, e instanceof Error ? e.message : e);
    await finish(false, { error: e instanceof Error ? e.message : String(e) });
    return { reading: null, runId };
  }
}

// ─── One wake ────────────────────────────────────────────────────────────────

/** A queendom has one queen but can have several bishops (0242): a bishop alert reaches all of them. */
type Recipients = { assignee: string | null; bishops: string[]; queen: string | null; founders: string[] };

async function resolveRecipients(t: TicketRow): Promise<Recipients> {
  const admin = createAdminClient();
  // Seats come from profiles (0201), through the one shared read. The old read of
  // sia.queendoms.queen_id / bishop_id failed quietly after those columns were dropped.
  const [seats, f] = await Promise.all([
    getQueendomSeats(t.queendom_id),
    admin.from("profiles").select("id").eq("role", "founder").eq("is_active", true).limit(3),
  ]);
  return {
    assignee: t.assignee_id,
    // A ticket that names its own bishop keeps it; otherwise every bishop of the queendom.
    bishops: t.bishop_id ? [t.bishop_id] : seats.bishops,
    queen: seats.queen,
    founders: mapRows<{ id: string }, string>(f.data, (r) => r.id),
  };
}

function targets(n: SentinelNotify, r: Recipients): string[] {
  switch (n.to) {
    case "assignee": return r.assignee ? [r.assignee] : r.bishops;
    case "bishop": return r.bishops.length > 0 ? r.bishops : r.queen ? [r.queen] : [];
    case "queen": return r.queen ? [r.queen] : r.bishops;
    case "founder": return r.founders;
  }
}

async function loadMailbox(t: TicketRow, state: SentinelState): Promise<{ newEvents: TicketEventRow[]; newLinks: LinkedText[] }> {
  const db = ticketsAdminDb();
  let ev = db.from("ticket_events").select("*").eq("ticket_id", t.id).neq("actor_kind", "sentinel").order("created_at", { ascending: true }).limit(60);
  if (state.last_event_at) ev = ev.gt("created_at", state.last_event_at);
  let ln = db.from("ticket_message_links").select("*").eq("ticket_id", t.id).order("created_at", { ascending: true }).limit(60);
  if (state.last_link_at) ln = ln.gt("created_at", state.last_link_at);
  const [{ data: events }, { data: links }] = await Promise.all([ev, ln]);
  const linkRows = mapRows<TicketMessageLinkRow, TicketMessageLinkRow>(links, (r) => r);
  const newLinks: LinkedText[] = [];
  if (linkRows.length) {
    const sia = createAdminClient().schema("sia");
    const { data: msgs } = await sia.from("wag_messages").select("chat_jid, wa_message_id, text, wa_timestamp, from_me").in("wa_message_id", linkRows.map((l) => l.wa_message_id)).limit(120);
    const byId = new Map<string, { text: string | null; wa_timestamp: string; from_me: boolean }>();
    mapRows<{ chat_jid: string; wa_message_id: string; text: string | null; wa_timestamp: string; from_me: boolean }, void>(msgs, (m) => { byId.set(`${m.chat_jid}|${m.wa_message_id}`, m); });
    for (const l of linkRows) {
      const m = byId.get(`${l.chat_jid}|${l.wa_message_id}`);
      const fromMember = l.link_kind === "member_reply" || (l.link_kind !== "staff_reply" && m ? !m.from_me : l.link_kind === "update" || l.link_kind === "origin");
      newLinks.push({ link: l, text: m?.text ?? null, at: m?.wa_timestamp ?? null, from_member: fromMember });
    }
  }
  return { newEvents: mapRows<TicketEventRow, TicketEventRow>(events, (r) => r), newLinks };
}

export type WakeOutcome = { ticket_no: string; fires: string[]; read: boolean; closed: boolean; nextWakeAt: string; error?: string };

/** One wake of one (already claimed) ticket. Never throws; an error is returned and the alarm re-set. */
export async function wakeTicket(t: TicketRow): Promise<WakeOutcome> {
  const db = ticketsAdminDb();
  const now = new Date();
  const state = normalizeState(t.sentinel_state);
  try {
    const [policy, mailbox] = await Promise.all([resolveSlaPolicy(t), loadMailbox(t, state)]);
    // A suggestion is only about the status it was made in; once the ticket moved, it is stale.
    if (state.proposal && state.proposal.from_status !== t.status) state.proposal = undefined;
    const plan = planWake({ ticket: t, policy, state, now, ...mailbox });

    // 1. Fires: each one = an event + the state, one transaction; notifications after.
    const recipients = plan.fires.some((f) => f.notify.length) ? await resolveRecipients(t) : null;
    let patch = { ...plan.patch };
    for (const f of plan.fires) {
      const { error } = await db.rpc("apply_ticket_change", {
        p_ticket_id: t.id,
        p_patch: { ...patch, sentinel_state: plan.state },
        p_event: { actor_kind: "sentinel", event_type: f.event_type, body: f.body, meta: f.meta },
      });
      if (error) throw new Error(`apply ${f.key}: ${error.message}`);
      patch = {};
      for (const n of f.notify) {
        for (const id of targets(n, recipients!)) {
          await createNotification({ recipient_id: id, type: n.type, title: n.title, body: n.body, action_url: `${TICKETS_PATH}/${t.id}`, notificationKey: n.key });
        }
      }
    }

    // 2. The reading pass, when there is new text and budget.
    let read = false;
    if (plan.readInput && plan.state.tokens_in + plan.state.tokens_out < SENTINEL_TOKEN_BUDGET) {
      const { reading, runId } = await readNewText(t, plan.readInput, plan.state);
      read = Boolean(reading);
      if (reading) {
        const rp: Record<string, unknown> = { ...patch };
        patch = {};
        const events: { event_type: string; body: string; meta: Record<string, unknown>; notify: SentinelNotify[] }[] = [];
        if (reading.summary) rp.summary = reading.summary;
        const ticks = reading.checklist_done.filter((i) => !t.checklist[i]?.done_at);
        if (ticks.length) {
          rp.checklist = t.checklist.map((c, i) => (ticks.includes(i) ? { ...c, done_at: now.toISOString(), done_by: null } : c));
          events.push({ event_type: "checklist_ticked", body: ticks.map((i) => t.checklist[i].label).join(", "), meta: { indexes: ticks, done: true, by: "sentinel" }, notify: [] });
        }
        const newMoney: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(reading.money)) if ((t.money as Record<string, unknown>)[k] == null) newMoney[k] = v;
        if (Object.keys(newMoney).length) {
          rp.money = { ...t.money, ...newMoney };
          events.push({ event_type: "quote_added", body: Object.entries(newMoney).map(([k, v]) => `${k.replace(/_inr$/, "").replace(/_/g, " ")}: ${v}`).join(", "), meta: { fields: newMoney, by: "sentinel" }, notify: [] });
        }
        if (Object.keys(reading.brief_changes).length) {
          plan.state.proposed_brief = reading.brief_changes;
          const line = Object.entries(reading.brief_changes).map(([k, v]) => `${k.replace(/_/g, " ")} → ${String(v)}`).join(", ");
          events.push({ event_type: "observation", body: `The member seems to have changed the request: ${line}. Confirm and update the brief.`, meta: { proposed_brief: reading.brief_changes }, notify: [
            { to: "assignee", type: "ticket_member_replied", title: `${t.ticket_no}: the request changed`, body: line },
          ] });
        }
        if (reading.tone === "frustrated" || reading.tone === "angry") {
          plan.state.last_tone = reading.tone;
          events.push({ event_type: "observation", body: `The member sounds ${reading.tone}.`, meta: { tone: reading.tone }, notify: [
            { to: "bishop", type: "ticket_member_unhappy", key: "ticket_member_unhappy", title: `A member sounds ${reading.tone} on ${t.ticket_no}`, body: `${t.title} · ${(plan.readInput.memberMessages.at(-1) ?? "").slice(0, 120)}` },
          ] });
        } else if (reading.tone !== "none") plan.state.last_tone = reading.tone;
        if (reading.asks_status) events.push({ event_type: "reminder_sent", body: "The member is asking where things stand.", meta: { which: "member_asks_status" }, notify: [
          { to: "assignee", type: "ticket_member_replied", title: `${t.ticket_no}: the member asks for an update`, body: t.title },
        ] });
        // The judgement: a suggestion a human approves or dismisses on the ticket page. "Delivered"
        // from the member is the plainest case of it.
        const canResolve = (TICKET_TRANSITIONS[t.status] ?? []).includes("resolved");
        const suggest = reading.suggested_status ?? (reading.delivered && canResolve && TICKET_ACTIVE_STATUSES.includes(t.status) ? ("resolved" as TicketStatus) : null);
        if (suggest && suggest !== t.status && plan.state.proposal?.status !== suggest) {
          const reason = reading.suggested_reason ?? (reading.delivered ? "The member says it was delivered." : "The new text points there.");
          plan.state.proposal = { status: suggest, from_status: t.status, reason, at: now.toISOString(), run_id: runId };
          events.push({ event_type: "observation", body: `Suggests moving this to ${TICKET_STATUSES.labels[suggest]}: ${reason}`, meta: { proposal: suggest, from: t.status, run_id: runId }, notify: [
            { to: "assignee", type: "ticket_member_replied", title: `${t.ticket_no}: move to ${TICKET_STATUSES.labels[suggest]}?`, body: reason },
          ] });
        }
        if (reading.observation) events.push({ event_type: "observation", body: reading.observation, meta: { run_id: runId }, notify: [] });
        if (events.length === 0) events.push({ event_type: "observation", body: "Read the new text; nothing to change.", meta: { run_id: runId }, notify: [] });
        const rec = recipients ?? (events.some((e) => e.notify.length) ? await resolveRecipients(t) : null);
        let first = true;
        for (const e of events) {
          const { error } = await db.rpc("apply_ticket_change", { p_ticket_id: t.id, p_patch: first ? { ...rp, sentinel_state: plan.state } : { sentinel_state: plan.state }, p_event: { actor_kind: "sentinel", event_type: e.event_type, body: e.body, meta: e.meta, run_id: runId ?? "" } });
          first = false;
          if (error) throw new Error(`apply reading: ${error.message}`);
          for (const n of e.notify) for (const id of targets(n, rec!)) await createNotification({ recipient_id: id, type: n.type, title: n.title, body: n.body, action_url: `${TICKETS_PATH}/${t.id}`, notificationKey: n.key });
        }
      }
    }

    // 3. Close, or sleep.
    if (plan.autoClose) {
      const r = await moveTicketStatusCore(t.id, "closed" as TicketStatus, SENTINEL_ACTOR, { actorKind: "sentinel", note: `Quiet for ${hours(SENTINEL_CLOSE_AFTER_MIN)} after resolution.` });
      if (r.error) throw new Error(`close: ${r.error}`);
    }
    // Any patch left over (no fire, no reading) rides the sleep as a silent state write; the
    // stamps themselves need an event, so they go through one quiet observation.
    if (Object.keys(patch).length) {
      const { error } = await db.rpc("apply_ticket_change", { p_ticket_id: t.id, p_patch: { ...patch, sentinel_state: plan.state }, p_event: { actor_kind: "sentinel", event_type: "observation", body: "Stamps updated.", meta: { fields: Object.keys(patch) } } });
      if (error) throw new Error(`stamps: ${error.message}`);
    }
    const nextWakeAt = plan.autoClose ? null : plan.nextWakeAt.toISOString();
    const { error: sleepErr } = await db.rpc("sentinel_sleep", { p_ticket_id: t.id, p_state: plan.state, p_next_wake_at: nextWakeAt, p_wake_reason: plan.autoClose ? "closed" : plan.wakeReason });
    if (sleepErr) throw new Error(`sleep: ${sleepErr.message}`);
    return { ticket_no: t.ticket_no, fires: plan.fires.map((f) => f.key), read, closed: plan.autoClose, nextWakeAt: nextWakeAt ?? "closed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${LOG} wake failed on ${t.ticket_no}:`, msg);
    // Try again in a while; the lease would do the same, this just says why.
    await db.rpc("sentinel_sleep", { p_ticket_id: t.id, p_state: state, p_next_wake_at: new Date(now.getTime() + 10 * MIN).toISOString(), p_wake_reason: `error: ${msg.slice(0, 80)}` });
    return { ticket_no: t.ticket_no, fires: [], read: false, closed: false, nextWakeAt: "retry", error: msg };
  }
}

// ─── Wake one ticket now ─────────────────────────────────────────────────────

/**
 * The reactive path: the action that just wrote a note, a move or a link calls this inside
 * after(), so the sentinel reads it in the same request rather than at the next sweep.
 * Claims THIS ticket (leased like any other), wakes it, never throws.
 */
export async function wakeTicketNow(ticketId: string): Promise<WakeOutcome | null> {
  try {
    const { data, error } = await ticketsAdminDb().rpc("claim_sentinel_wakes", { p_limit: 1, p_lease_min: SENTINEL_LEASE_MIN, p_ticket_id: ticketId });
    if (error) { console.warn(`${LOG} wakeTicketNow claim failed (0199 applied?)`, error.message); return null; }
    const t = mapRows<TicketRow, TicketRow>(data, (r) => r)[0];
    return t ? await wakeTicket(t) : null;
  } catch (e) {
    console.error(`${LOG} wakeTicketNow threw`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── The pool ────────────────────────────────────────────────────────────────

export type SweepSummary = { claimed: number; woken: WakeOutcome[]; fires: number; reads: number; closed: number; errors: number };

/** One sweep: claim due tickets and wake each. Loops while there are due tickets and time remains. */
export async function runSentinelSweep(opts: { limit?: number; deadlineMs?: number } = {}): Promise<SweepSummary> {
  const db = ticketsAdminDb();
  const started = Date.now();
  const deadline = opts.deadlineMs ?? 45_000;
  const summary: SweepSummary = { claimed: 0, woken: [], fires: 0, reads: 0, closed: 0, errors: 0 };
  for (;;) {
    const { data, error } = await db.rpc("claim_sentinel_wakes", { p_limit: opts.limit ?? SENTINEL_BATCH, p_lease_min: SENTINEL_LEASE_MIN });
    if (error) throw new Error(`${LOG} claim failed (0199 applied?): ${error.message}`);
    const tickets = mapRows<TicketRow, TicketRow>(data, (r) => r);
    if (tickets.length === 0) break;
    summary.claimed += tickets.length;
    for (const t of tickets) {
      const o = await wakeTicket(t);
      summary.woken.push(o);
      summary.fires += o.fires.length;
      if (o.read) summary.reads += 1;
      if (o.closed) summary.closed += 1;
      if (o.error) summary.errors += 1;
    }
    if (Date.now() - started > deadline) break;
  }
  return summary;
}
