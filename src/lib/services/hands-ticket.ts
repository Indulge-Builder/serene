// hands-ticket.ts — Elaya hands a ticket to the outside agent the moment it is worth it (2026-10-01).
// A new ticket (or the first time its page opens, or the "Ask Instinct" button) → ONE routing-tier
// read of the ticket as the disclosure filter would send it (no member name, phone, address; names
// masked) → HELPS yes/no, why, and the first message, written to the live guide → by the trust
// ladder of the ticket's category: L1 "open" and up, she opens the chat and sends it herself; L0
// "draft" (the default), the message waits on the ticket card for one click (Send / Not now).
//
// The agent is the ticket's vendor when that vendor is an agent, otherwise the allow-listed agent
// contact (openHandsThreadCore `via`): asking Instinct for help never makes it the vendor of record.
// Replies land on the ticket thread through the connector (ticket events hands_message), and the
// ticket card shows them as the WhatsApp page's bubbles.
//
// Every read is a sia.extraction_runs row (kind hands_ticket: the verdict and the draft live in its
// output, append-only); "Not now" is a row of kind hands_ticket_dismiss. Fails closed: a torn reply
// or a leak sends nothing. No `server-only` (the action's after() and the page call it).

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getHandsGuides, getHandsSettings, getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { getHandsThread, getHandsThreadForTicket, listAllowedContacts, signHandsMedia, type HandsThreadSummary } from "@/lib/services/hands-service";
import { openHandsThreadCore, queueHandsMessageCore } from "@/lib/services/hands-mutations";
import { buildHandsMessage, leakCheck, maskNames, memberNamesFor, trustAllows } from "@/lib/services/hands-draft";
import { ticketsAdminDb } from "@/lib/services/tickets-service";
import { HANDS_DEFAULT_TRUST_LEVEL, HANDS_IDENTITY_NAME, HANDS_MAX_OPEN_JOBS, type HandsTrustLevel } from "@/lib/constants/hands";
import { handsDb } from "@/lib/supabase/schemas";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/constants/tickets";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { HandsAllowedContactRow, HandsChatLine, HandsOutboxRow } from "@/lib/types/hands";
import type { TicketRow } from "@/lib/types/ticket";

const LOG = "[hands-ticket]";
const RUN_KIND = "hands_ticket";
const DISMISS_KIND = "hands_ticket_dismiss";
const PROMPT_VERSION = "hands-ticket-v1";
const MAX_TOKENS = 900;
const TIMEOUT_MS = 45_000;
/** Elaya steps in on her own only while a ticket is fresh and not yet being worked. */
const AUTO_STATUSES = new Set(["open", "sourcing"]);
const AUTO_WINDOW_MS = 72 * 3_600_000;
/** A read that started this recently and has not finished is still running. */
const WORKING_MS = 3 * 60_000;
const CLOSED = new Set(["resolved", "closed", "dropped", "proposed"]);
const CARD_LINES = 12;

export type HandsTicketPlan = { runId: string; at: string; helps: boolean; why: string; text: string; sent: string[]; heldBack: string[]; by: string | null };

export type HandsTicketView = {
  enabled: boolean;
  agent: { jid: string; label: string } | null;
  trust: HandsTrustLevel;
  sendsOnHerOwn: boolean;
  thread: HandsThreadSummary | null;
  messages: HandsChatLine[];
  outbox: HandsOutboxRow[];
  plan: HandsTicketPlan | null;
  dismissed: { at: string } | null;
  working: boolean;
  /** Elaya has read this ticket at least once (a failed read counts: she does not retry on her own). */
  attempted: boolean;
  autoEligible: boolean;
};

export type HandsTicketStart = { status: "sent" | "drafted" | "queued" | "not_suitable" | "skipped" | "failed"; reason?: string };

/** The agent a ticket talks to: its vendor when that vendor is an allow-listed agent, else the first active agent contact. */
export async function agentContactFor(ticket: Pick<TicketRow, "vendor_id">): Promise<HandsAllowedContactRow | null> {
  const contacts = (await listAllowedContacts()).filter((c) => c.is_active && c.vendor_id);
  return contacts.find((c) => c.vendor_id === ticket.vendor_id) ?? contacts[0] ?? null;
}

export function autoEligible(ticket: Pick<TicketRow, "status" | "created_at">): boolean {
  return AUTO_STATUSES.has(ticket.status) && Date.now() - new Date(ticket.created_at).getTime() < AUTO_WINDOW_MS;
}

/** Read the plain-text verdict (pure; exported for a bench). */
export function parseTicketPlan(text: string): { helps: boolean | null; why: string; message: string } {
  const helps = text.match(/^\s*HELPS:\s*(yes|no)\b/im)?.[1]?.toLowerCase();
  const why = text.match(/^\s*WHY:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const message = (text.split(/^\s*MESSAGE:\s*/im)[1] ?? "").trim();
  return { helps: helps === "yes" ? true : helps === "no" ? false : null, why, message };
}

async function loadTicket(ticketId: string): Promise<TicketRow | null> {
  const { data } = await ticketsAdminDb().from("tickets").select("*").eq("id", ticketId).maybeSingle();
  return (data as TicketRow | null) ?? null;
}

type RunRow = { id: string; kind: string; started_at: string; finished_at: string | null; ok: boolean | null; input_ref: Record<string, unknown>; output: Record<string, unknown> };

async function runsFor(ticketId: string): Promise<RunRow[]> {
  const { data } = await createAdminClient().schema("sia").from("extraction_runs")
    .select("id, kind, started_at, finished_at, ok, input_ref, output")
    .in("kind", [RUN_KIND, DISMISS_KIND]).eq("input_ref->>ticket_id", ticketId)
    .order("started_at", { ascending: false }).limit(10);
  return (data ?? []) as RunRow[];
}

function planFrom(r: RunRow): HandsTicketPlan | null {
  if (r.kind !== RUN_KIND || !r.ok) return null;
  const o = r.output as { helps?: boolean; why?: string; text?: string; sent?: string[]; held_back?: string[] };
  return { runId: r.id, at: r.started_at, helps: Boolean(o.helps), why: o.why ?? "", text: o.text ?? "", sent: o.sent ?? [], heldBack: o.held_back ?? [], by: (r.input_ref.by as string | undefined) ?? null };
}

/** Everything the ticket card shows, read through the admin client (the ticket page already gated the ticket). */
export async function getHandsTicketView(ticketId: string): Promise<HandsTicketView | null> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return null;
  const [settings, agent, threadRow, runs] = await Promise.all([getHandsSettings(), agentContactFor(ticket), getHandsThreadForTicket(ticket.id), runsFor(ticket.id)]);
  const full = threadRow ? await getHandsThread(threadRow.id, { queendomIds: null }) : null;
  const messages = full ? await Promise.all(full.messages.slice(-CARD_LINES).map(async (m) => ({ ...m, raw: {}, media_url: m.media_path ? await signHandsMedia(m.media_path) : null }))) : [];
  const trust = settings.trustByCategory[ticket.category] ?? HANDS_DEFAULT_TRUST_LEVEL;
  const latestRun = runs.find((r) => r.kind === RUN_KIND) ?? null;
  const latestDismiss = runs.find((r) => r.kind === DISMISS_KIND) ?? null;
  const plan = latestRun ? planFrom(latestRun) : null;
  const dismissed = latestDismiss && (!latestRun || latestDismiss.started_at > latestRun.started_at) ? { at: latestDismiss.started_at } : null;
  const working = Boolean(latestRun && !latestRun.finished_at && Date.now() - new Date(latestRun.started_at).getTime() < WORKING_MS);
  return {
    enabled: settings.enabled, agent: agent ? { jid: agent.jid, label: agent.label } : null, trust, sendsOnHerOwn: trustAllows(trust).openOnHerOwn,
    thread: full?.thread ?? null, messages, outbox: full?.outbox ?? [], plan, dismissed, working, attempted: Boolean(latestRun),
    autoEligible: autoEligible(ticket) && !CLOSED.has(ticket.status),
  };
}

/** One read of the ticket: can the agent help, and the first message to it. Recorded as a run; sends nothing. */
export async function planForTicket(ticket: TicketRow, agentLabel: string, actor: MutationActor, insist: boolean): Promise<HandsTicketPlan | { error: string }> {
  const [{ guide }, depth, names] = await Promise.all([getHandsGuides(), getPiiMaskingDepth(), memberNamesFor(ticket.member_id)]);
  const built = buildHandsMessage(ticket, {});
  const category = TICKET_CATEGORIES.labels[ticket.category as TicketCategory] ?? ticket.category;
  const system = [
    `You are Elaya, the assistant of the ${HANDS_IDENTITY_NAME} desk at a luxury concierge company. ${agentLabel} is an outside AI booking agent on WhatsApp: it researches, recommends, quotes and books hotels, flights, trains, restaurants, events, experiences, cars and products.`,
    `A member's request has become a ticket. Decide whether ${agentLabel} can help move it forward, and if so write the first message to it.`,
    `Say yes for anything ${agentLabel} could research, recommend, quote or book. Say no when only our own people or the member can do it: hiring staff, a complaint about our service, money owed to or by us, documents, or a question only the member can answer.`,
    insist ? `The team has asked to send it to ${agentLabel} anyway: answer HELPS: yes and write the best message you can.` : "",
    "Write the message to the guide below. Use only the facts in THE REQUEST. Never add a person's name, a phone number, an email, a card, an ID or an address; a member is never named. Bookings are in the name " + HANDS_IDENTITY_NAME + ".",
    `When facts are missing, still write it: ask ${agentLabel} for options with what is known and say what is still open.`,
    "Plain WhatsApp text, no markdown.",
    "",
    "Answer in exactly this shape:",
    "HELPS: yes or no",
    "WHY: <one short line for the team>",
    "MESSAGE:",
    `<the message to ${agentLabel}, ready to send; leave it empty when HELPS is no>`,
    "",
    "THE GUIDE:",
    guide.body,
  ].filter(Boolean).join("\n");
  const userContent = [
    `CATEGORY: ${category}${ticket.sub_category ? ` / ${ticket.sub_category}` : ""}`,
    `THE REQUEST (as our privacy filter allows it out):\n${maskPii(maskNames(built.text, names), depth)}`,
  ].join("\n\n");

  const admin = createAdminClient();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: RUN_KIND, prompt_version: `${PROMPT_VERSION}+G${guide.version}`, started_at: new Date().toISOString(),
    input_ref: { ticket_id: ticket.id, ticket_no: ticket.ticket_no, by: actor.userId, insist, guide_version: guide.version },
  }).select("id, started_at").single();
  const run = runRow as { id: string; started_at: string } | null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => {
    if (run) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", run.id);
  };

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({ usage: { feature: 'hands_ticket' }, model: llm.model, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS, system, messages: [{ role: "user", content: userContent }] });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    const parsed = parseTicketPlan(result.text);
    if (result.stopReason === "max_tokens" || parsed.helps === null || (parsed.helps && !parsed.message)) {
      await finish(false, { ...usage, error: "torn reply", output: { raw: result.text.slice(0, 2000) } });
      return { error: "Elaya could not read this ticket just now." };
    }
    const leaks = parsed.helps ? leakCheck(parsed.message, names) : [];
    if (leaks.length) {
      await finish(false, { ...usage, error: `leak (${leaks.length})` });
      return { error: "Elaya's message carried a name, phone or email, so it was thrown away." };
    }
    const output = { helps: parsed.helps, why: parsed.why, text: parsed.helps ? parsed.message : "", sent: built.sent.map((s) => s.field), held_back: built.heldBack.map((h) => h.field) };
    await finish(true, { ...usage, output });
    return { runId: run?.id ?? "", at: run?.started_at ?? new Date().toISOString(), helps: output.helps, why: output.why, text: output.text, sent: output.sent, heldBack: output.held_back, by: actor.userId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`${LOG} read failed for ${ticket.ticket_no}:`, msg);
    await finish(false, { error: msg.slice(0, 300) });
    return { error: "Elaya could not read this ticket just now." };
  }
}

/** Open the ticket's chat with the agent (never touching the ticket's vendor) and queue one line. The CALLER leak-checks typed text. */
export async function sendHandsTicketLineCore(ticketId: string, text: string, actor: MutationActor, opts: { source: "human" | "elaya"; disclosure: Record<string, unknown> }) {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { data: null, error: "Ticket not found." } as const;
  const agent = await agentContactFor(ticket);
  if (!agent) return { data: null, error: "No outside agent is set up in Hands settings." } as const;
  const thread = await openHandsThreadCore(ticket.id, actor, { via: { jid: agent.jid } });
  if (thread.data === null) return { data: null, error: thread.error } as const;
  return queueHandsMessageCore(thread.data.id, text, actor, opts);
}

/**
 * Elaya steps in on a ticket. Without `force` she does it once per ticket (any earlier read counts)
 * and only while Hands is on, an agent is set up and no chat exists yet. With trust L1+ for the
 * category she sends the first message herself; at L0 it waits on the card.
 */
export async function startHandsForTicket(ticketId: string, opts: { actor: MutationActor; force?: boolean; insist?: boolean }): Promise<HandsTicketStart> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { status: "skipped", reason: "Ticket not found." };
  if (CLOSED.has(ticket.status)) return { status: "skipped", reason: "The ticket is not live." };
  const [settings, agent, thread, runs] = await Promise.all([getHandsSettings(), agentContactFor(ticket), getHandsThreadForTicket(ticket.id), runsFor(ticket.id)]);
  if (!settings.enabled) return { status: "skipped", reason: "Hands is switched off in Settings." };
  if (!agent) return { status: "skipped", reason: "No outside agent is set up in Hands settings." };
  if (thread) return { status: "skipped", reason: "The chat with the agent is already open." };
  const running = runs.find((r) => r.kind === RUN_KIND && !r.finished_at && Date.now() - new Date(r.started_at).getTime() < WORKING_MS);
  if (running) return { status: "skipped", reason: "Elaya is already reading this ticket." };
  if (!opts.force && runs.some((r) => r.kind === RUN_KIND)) return { status: "skipped", reason: "Elaya already read this ticket." };

  const plan = await planForTicket(ticket, agent.label, opts.actor, Boolean(opts.insist));
  if ("error" in plan) return { status: "failed", reason: plan.error };
  if (!plan.helps) return { status: "not_suitable", reason: plan.why };
  const trust = settings.trustByCategory[ticket.category] ?? HANDS_DEFAULT_TRUST_LEVEL;
  if (!trustAllows(trust).openOnHerOwn) return { status: "drafted" };
  // At most HANDS_MAX_OPEN_JOBS jobs open with one agent: the rest wait, and the hands-router job
  // sends each the moment a slot frees (a person can still press Send on the card at any time).
  if ((await openJobCount(agent.jid)) >= HANDS_MAX_OPEN_JOBS) return { status: "queued", reason: `${agent.label} already has ${HANDS_MAX_OPEN_JOBS} jobs open.` };
  const sent = await sendHandsTicketLineCore(ticket.id, plan.text, opts.actor, { source: "elaya", disclosure: { from_draft: true, auto: true, run_id: plan.runId, sent: plan.sent, held_back: plan.heldBack, trust } });
  return sent.data ? { status: "sent" } : { status: "failed", reason: sent.error ?? "Could not queue the message." };
}

/** Open ticket threads with one agent (the jobs-at-once limit). */
export async function openJobCount(jid: string): Promise<number> {
  const { count } = await handsDb(createAdminClient()).from("threads").select("id", { count: "exact", head: true }).eq("jid", jid).eq("kind", "ticket").eq("status", "open");
  return Number(count ?? 0);
}

/**
 * Plans waiting for a slot: Elaya said the agent can help, the category sends on its own, no chat is
 * open, nobody pressed Not now, the ticket is live. Oldest first (the hands-router job releases them).
 */
export async function listQueuedPlans(sinceHours = 72): Promise<{ ticket: TicketRow; plan: HandsTicketPlan }[]> {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  const { data } = await createAdminClient().schema("sia").from("extraction_runs")
    .select("id, kind, started_at, finished_at, ok, input_ref, output").in("kind", [RUN_KIND, DISMISS_KIND]).gt("started_at", since)
    .order("started_at", { ascending: true }).limit(1000);
  const runs = (data ?? []) as RunRow[];
  const latest = new Map<string, RunRow>();
  const dismissedAt = new Map<string, string>();
  for (const r of runs) {
    const id = r.input_ref.ticket_id as string | undefined;
    if (!id) continue;
    if (r.kind === DISMISS_KIND) dismissedAt.set(id, r.started_at); else latest.set(id, r);
  }
  const settings = await getHandsSettings();
  const out: { ticket: TicketRow; plan: HandsTicketPlan }[] = [];
  for (const [ticketId, run] of latest) {
    const plan = planFrom(run);
    if (!plan?.helps || !plan.text) continue;
    const d = dismissedAt.get(ticketId);
    if (d && d > run.started_at) continue;
    const ticket = await loadTicket(ticketId);
    if (!ticket || CLOSED.has(ticket.status)) continue;
    if (!trustAllows(settings.trustByCategory[ticket.category] ?? HANDS_DEFAULT_TRUST_LEVEL).openOnHerOwn) continue;
    // Any thread at all, open or closed: a job someone already closed is never re-sent.
    const { count } = await handsDb(createAdminClient()).from("threads").select("id", { count: "exact", head: true }).eq("ticket_id", ticket.id);
    if (Number(count ?? 0) > 0) continue;
    out.push({ ticket, plan });
  }
  return out;
}

/** "Not now" on the card: the draft is set aside (an append-only row; the next read replaces it). */
export async function dismissHandsTicketDraftCore(ticketId: string, actor: MutationActor): Promise<void> {
  const now = new Date().toISOString();
  await createAdminClient().schema("sia").from("extraction_runs").insert({
    kind: DISMISS_KIND, prompt_version: PROMPT_VERSION, started_at: now, finished_at: now, ok: true, input_ref: { ticket_id: ticketId, by: actor.userId },
  });
}
