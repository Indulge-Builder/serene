// ticket-intake.ts — THE intake sweep (member-ticket-plan.md 7.8b, migration 0219): Serene reads
// the linked member groups as they happen and PROPOSES tickets, so the bishop does not have to
// spot every request. A proposal is a card with a fully drafted ticket; a human creates the
// ticket or dismisses the card. Nothing here creates work by itself.
//
// It does as little as it can, in this order, and stops at the first step that settles it:
//   1. only groups with something new since their bookmark (one indexed read)
//   2. only once the chat has gone quiet for a moment (a request often arrives in three messages)
//   3. no member-side message in the burst            -> nothing to do, no model
//   4. the member only said "ok thanks" / an emoji    -> chatter, no model
//   5. a genie already made a ticket from these messages -> nothing to do, no model
//   6. ONE cheap call (routing tier) says what the burst is
//   7. only a request gets the second, dearer call: the drafted ticket (ticket-draft-core.ts)
//
// Names never reach a model (the profiler's vault). Every call is a sia.extraction_runs row,
// chatter included, so "how good is intake" is a query and not an opinion. Fails closed: a burst
// that cannot be read keeps the bookmark; after INTAKE_MAX_ATTEMPTS it is stepped over and says
// so; a provider outage never counts.
//
// Free of `server-only` on purpose: it runs from Trigger.dev and from a laptop.

import { resolveLlmForJob } from "@/lib/elaya/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { getBroadSenders, isProviderSide, openVault, type Vault } from "@/lib/services/member-profiler";
import { draftTicketCore } from "@/lib/services/ticket-draft-core";
import { TICKET_TERMINAL_STATUSES } from "@/lib/constants/tickets";
import {
  INTAKE_ACK_WORDS, INTAKE_BURSTS_PER_RUN, INTAKE_BURST_GAP_MINUTES, INTAKE_CONTEXT_MESSAGES, INTAKE_FETCH_LIMIT,
  INTAKE_GROUPS_PER_RUN, INTAKE_KINDS, INTAKE_LOOKBACK_HOURS, INTAKE_MAX_ATTEMPTS, INTAKE_MEMBER_STATUSES,
  INTAKE_MESSAGE_CHAR_CAP, INTAKE_MIN_CONFIDENCE, INTAKE_OUTAGE_STOP, INTAKE_PARALLEL_GROUPS, INTAKE_PROMPT_VERSION,
  INTAKE_PROPOSAL_TTL_HOURS, INTAKE_RUN_KIND, INTAKE_SETTLE_SECONDS, INTAKE_TONES, type IntakeKind,
} from "@/lib/constants/ticket-intake";
import type { Json } from "@/lib/types/database";

const LOG = "[ticket-intake]";
const sia = () => createAdminClient().schema("sia");

type Msg = { id: string; wa_message_id: string; sender_jid: string; text: string; wa_timestamp: string };
type DueGroup = { group_jid: string; member_id: string; queendom_id: string | null; cursor_at: string; newest_at: string; fail_count: number | null };
type OpenTicket = { id: string; ticket_no: string; title: string; category: string };

export type IntakeVerdict = { kind: IntakeKind; confidence: number; ticket_no: string | null; tone: (typeof INTAKE_TONES)[number]; summary: string; request_messages: number[]; more_requests: boolean };
export type BurstOutcome = {
  group_jid: string; member_id: string; member_name: string; from_at: string; to_at: string; messages: number;
  /** skipped = settled without a model; read = classified; proposed = a card was filed; failed = try again. */
  status: "skipped" | "read" | "proposed" | "failed";
  why: string | null;
  verdict: IntakeVerdict | null;
  proposal_id: string | null;
  error: string | null;
  provider_side?: boolean;
};

// ─── Bursts ──────────────────────────────────────────────────────────────────

/** Cut the new messages on quiet gaps. The last burst is left out while the chat is still moving. */
export function buildBursts(msgs: Msg[], now: number): Msg[][] {
  const gapMs = INTAKE_BURST_GAP_MINUTES * 60_000;
  const out: Msg[][] = [];
  let cur: Msg[] = [];
  for (const m of msgs) {
    const prev = cur[cur.length - 1];
    if (prev && new Date(m.wa_timestamp).getTime() - new Date(prev.wa_timestamp).getTime() >= gapMs) { out.push(cur); cur = []; }
    cur.push(m);
  }
  if (cur.length && now - new Date(cur[cur.length - 1].wa_timestamp).getTime() >= INTAKE_SETTLE_SECONDS * 1000) out.push(cur);
  return out;
}

/** True when everything the member said is an acknowledgement or an emoji. Literal on purpose. */
export function isOnlyAcknowledgement(memberTexts: string[]): boolean {
  const all = memberTexts.join(" ");
  if (all.length > 60 || /\d/.test(all) || /\?/.test(all)) return false;
  const words = all.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  return words.every((w) => INTAKE_ACK_WORDS.has(w));
}

// ─── The reader (one cheap call) ─────────────────────────────────────────────

const SYSTEM = `You watch a luxury concierge's WhatsApp group with one member. You are given some earlier messages as CONTEXT and the NEW messages. Say what the NEW messages are. Return ONLY one JSON object, no prose, no code fence:
{
  "kind": "request" | "update" | "question" | "feedback" | "chatter",
  "confidence": 0 to 1,
  "ticket_no": the number of the open ticket this belongs to, or null,
  "tone": "neutral" | "happy" | "frustrated" | "angry",
  "summary": one plain sentence: what the member wants or said,
  "request_messages": [the NEW message numbers that make up the request or update],
  "more_requests": true if the NEW messages hold more than one separate request
}
Names are replaced by codes. MEMBER_n is the member or their household. STAFF_… is the concierge team. VENDOR_n is a supplier. Use codes exactly as written.

What each kind means:
- request: the MEMBER asks the concierge to DO or ARRANGE something new (book, buy, find, send, arrange, fix). This becomes a ticket.
- update: the MEMBER adds to, changes, confirms or cancels something ALREADY being handled. If it matches one of the open tickets listed, give its number.
- question: the member asks for information and nothing has to be arranged yet.
- feedback: praise or a complaint about something delivered.
- chatter: greetings, thanks, acknowledgements, staff talking among themselves, anything else.

Rules:
1. Only the MEMBER side makes a request. A staff or vendor message is never a request.
2. If the CONTEXT shows this was already asked and the NEW messages only continue it, it is an update, not a new request.
3. If staff in the NEW messages are already clearly handling it ("booked", "done, sir"), it is still a request when the member asked for something new: the ticket records the work.
4. When several separate requests arrive together, describe the FIRST one, list only its messages, and set more_requests true.
5. Be honest with confidence: 0.9 a plain ask; 0.7 probably an ask; 0.5 cannot tell. A wrong "request" wastes a bishop's time, a missed one loses a member's request; when torn, prefer request at a lower confidence.`;

function parseJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"); const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

export function validateVerdict(raw: Record<string, unknown>, newCount: number, tickets: OpenTicket[]): IntakeVerdict {
  const kind = (INTAKE_KINDS as readonly string[]).includes(String(raw.kind)) ? (raw.kind as IntakeKind) : "chatter";
  const tone = (INTAKE_TONES as readonly string[]).includes(String(raw.tone)) ? (raw.tone as IntakeVerdict["tone"]) : "neutral";
  const conf = typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0;
  const no = typeof raw.ticket_no === "string" ? raw.ticket_no.trim() : "";
  const nums = Array.isArray(raw.request_messages) ? [...new Set(raw.request_messages.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= newCount))].sort((x, y) => x - y) : [];
  return {
    kind, confidence: conf, tone,
    // A ticket number is only believed when it is one we offered.
    ticket_no: tickets.some((t) => t.ticket_no === no) ? no : null,
    summary: typeof raw.summary === "string" ? raw.summary.replace(/\s+/g, " ").trim().slice(0, 300) : "",
    request_messages: nums,
    more_requests: raw.more_requests === true,
  };
}

async function openTicketsFor(memberId: string): Promise<OpenTicket[]> {
  const { data } = await sia().from("tickets").select("id, ticket_no, title, category, status").eq("member_id", memberId)
    .not("status", "in", `(${TICKET_TERMINAL_STATUSES.join(",")})`).order("created_at", { ascending: false }).limit(8);
  return mapRows<OpenTicket, OpenTicket>(data, (r) => ({ id: r.id, ticket_no: r.ticket_no, title: r.title, category: r.category }));
}

type ReadDeps = { vault: Vault; broad: Set<string>; apply: boolean; queendomId: string | null };

/** One settled burst: decide what it is and, for a request, file the card. */
export async function readBurst(groupJid: string, memberId: string, context: Msg[], burst: Msg[], deps: ReadDeps): Promise<BurstOutcome> {
  const { vault } = deps;
  const base: BurstOutcome = { group_jid: groupJid, member_id: memberId, member_name: vault.ctx.full_name, from_at: burst[0].wa_timestamp, to_at: burst[burst.length - 1].wa_timestamp, messages: burst.length, status: "failed", why: null, verdict: null, proposal_id: null, error: null };
  const admin = createAdminClient();

  const memberMsgs = burst.filter((m) => vault.sideOf(m.sender_jid) === "member");
  if (memberMsgs.length === 0) return { ...base, status: "skipped", why: "no member message" };
  if (isOnlyAcknowledgement(memberMsgs.map((m) => m.text))) return { ...base, status: "skipped", why: "acknowledgement only" };

  // A genie may already have made the ticket by hand from these very messages.
  const { data: linked } = await sia().from("ticket_message_links").select("wa_message_id").eq("chat_jid", groupJid).in("wa_message_id", burst.map((m) => m.wa_message_id)).limit(1);
  if ((linked ?? []).length > 0) return { ...base, status: "skipped", why: "already on a ticket" };

  const tickets = await openTicketsFor(memberId);
  const line = (m: Msg, tag: string) => `[${tag} ${m.wa_timestamp.slice(0, 16).replace("T", " ")}] ${vault.codeOf(m.sender_jid)}: ${vault.mask(m.text.slice(0, INTAKE_MESSAGE_CHAR_CAP))}`;
  const userContent = [
    `Open tickets for this member:\n${tickets.map((t) => `- ${t.ticket_no}: ${vault.mask(t.title)} (${t.category})`).join("\n") || "- none"}`,
    `CONTEXT (earlier, already seen):\n${context.map((m) => line(m, "ctx")).join("\n") || "- none"}`,
    `NEW messages:\n${burst.map((m, i) => line(m, `#${i + 1}`)).join("\n")}`,
  ].join("\n\n");

  const leaked = vault.leaks(userContent);
  if (leaked.length) { console.warn(`${LOG} vault leak in ${groupJid}: ${leaked.length} known name(s) survived masking; burst not sent`); return { ...base, error: `vault leak (${leaked.length})` }; }

  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: INTAKE_RUN_KIND, member_id: memberId, prompt_version: INTAKE_PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { group_jid: groupJid, from_at: base.from_at, to_at: base.to_at, messages: burst.length, member_messages: memberMsgs.length, open_tickets: tickets.length, dry_run: !deps.apply, masked_window: userContent.slice(0, 12_000) },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => { if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId); };

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: 1500, effort: "low", timeoutMs: 30_000, cachePrefix: true, system: SYSTEM, messages: [{ role: "user", content: userContent }] });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    const raw = result.stopReason === "max_tokens" ? null : parseJson(result.text);
    if (!raw) { await finish(false, { ...usage, error: "no json", output: { text: result.text.slice(0, 1500) } }); return { ...base, error: "no json" }; }
    const verdict = validateVerdict(raw, burst.length, tickets);
    const shown = vault.unmask(verdict);

    const worthACard = (verdict.kind === "request" || (verdict.kind === "update" && verdict.ticket_no)) && verdict.confidence >= INTAKE_MIN_CONFIDENCE;
    if (!worthACard) { await finish(true, { ...usage, output: { verdict } as unknown as Json }); return { ...base, status: "read", verdict: shown }; }

    // The messages the card rests on: the ones the reader named, else every member message.
    const picked = (verdict.request_messages.length ? verdict.request_messages.map((n) => burst[n - 1]) : memberMsgs).filter(Boolean);
    const selection = picked.map((m) => ({ chat_jid: groupJid, wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, sender_name: null, from_member: vault.sideOf(m.sender_jid) === "member", at: m.wa_timestamp, text: m.text.slice(0, 4000) }));

    // The dearer call, only now, only for a request.
    const asDraft = (m: Msg) => ({ wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, at: m.wa_timestamp, text: m.text });
    const pickedIds = new Set(picked.map((m) => m.id));
    const around = [...context, ...burst.filter((m) => !pickedIds.has(m.id))].sort((x, y) => x.wa_timestamp.localeCompare(y.wa_timestamp));
    const draft = verdict.kind === "request" ? await draftTicketCore({ member_id: memberId, group_jid: groupJid, via: "intake", messages: picked.map(asDraft), context: around.map(asDraft), hint: verdict.summary }, deps.broad) : null;
    if (verdict.kind === "request" && !draft) { await finish(false, { ...usage, error: "draft failed", output: { verdict } as unknown as Json }); return { ...base, verdict: shown, error: "draft failed" }; }

    let proposalId: string | null = null;
    if (deps.apply) {
      const ticket = verdict.ticket_no ? tickets.find((t) => t.ticket_no === verdict.ticket_no) ?? null : null;
      const { data: row, error } = await sia().from("intake_proposals").upsert({
        member_id: memberId, queendom_id: deps.queendomId, group_jid: groupJid, kind: verdict.kind === "update" ? "update" : "request",
        confidence: Number(verdict.confidence.toFixed(2)), tone: verdict.tone, summary: shown.summary || draft?.title || "A request",
        draft: (draft ?? {}) as unknown as Json, messages: selection as unknown as Json,
        first_message_at: base.from_at, last_message_at: base.to_at, ticket_id: ticket?.id ?? null,
        classify_run_id: runId, draft_run_id: draft?.run_id ?? null,
      }, { onConflict: "group_jid,first_message_at", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) { await finish(false, { ...usage, error: `proposal insert: ${error.message}`.slice(0, 300) }); return { ...base, verdict: shown, error: error.message }; }
      proposalId = (row as { id: string } | null)?.id ?? null;
    }
    await finish(true, { ...usage, output: { verdict, proposal_id: proposalId, more_requests: verdict.more_requests } as unknown as Json });
    return { ...base, status: "proposed", verdict: shown, proposal_id: proposalId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish(false, { error: msg.slice(0, 500) });
    console.warn(`${LOG} burst failed`, groupJid, msg);
    return { ...base, error: msg, provider_side: isProviderSide(e, msg) };
  }
}

// ─── The sweep ───────────────────────────────────────────────────────────────

export type IntakeSweepOptions = { apply: boolean; maxGroups?: number; maxBursts?: number; deadlineMs?: number; /** Pilot only: read from this moment instead of each group's bookmark (never with apply). */ since?: string; onBurst?: (o: BurstOutcome) => void };

export async function runIntakeSweep(opts: IntakeSweepOptions): Promise<{ groups: number; outcomes: BurstOutcome[] }> {
  if (opts.apply && opts.since) throw new Error("`since` is a pilot option; it cannot be combined with apply");
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const maxBursts = opts.maxBursts ?? INTAKE_BURSTS_PER_RUN;
  const lookback = new Date(Date.now() - INTAKE_LOOKBACK_HOURS * 3600_000).toISOString();

  // Cards nobody touched in a day are no longer live requests.
  if (opts.apply) await sia().from("intake_proposals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("status", "open").lt("created_at", new Date(Date.now() - INTAKE_PROPOSAL_TTL_HOURS * 3600_000).toISOString());

  const [{ data: due, error }, broad] = await Promise.all([
    sia().rpc("intake_due_groups", { p_limit: opts.maxGroups ?? INTAKE_GROUPS_PER_RUN, p_statuses: [...INTAKE_MEMBER_STATUSES], p_since: opts.since ?? lookback }),
    getBroadSenders(),
  ]);
  if (error) throw new Error(`${LOG} due groups failed: ${error.message}`);
  const groups = (due ?? []) as DueGroup[];
  const outcomes: BurstOutcome[] = [];
  let sent = 0; let stop = false; let providerFails = 0;
  const state = (groupJid: string, patch: Record<string, unknown>) => sia().from("intake_group_state").upsert({ group_jid: groupJid, ...patch }, { onConflict: "group_jid" });

  const readGroup = async (g: DueGroup): Promise<void> => {
    if (stop || sent >= maxBursts || Date.now() >= deadline) return;
    const after = opts.since ?? g.cursor_at;
    const cols = "id, wa_message_id, sender_jid, text, wa_timestamp";
    const [{ data: fresh, error: mErr }, { data: before }] = await Promise.all([
      sia().from("wag_messages").select(cols).eq("chat_jid", g.group_jid).eq("is_revoked", false).not("text", "is", null).gt("wa_timestamp", after).order("wa_timestamp", { ascending: true }).limit(INTAKE_FETCH_LIMIT),
      sia().from("wag_messages").select(cols).eq("chat_jid", g.group_jid).eq("is_revoked", false).not("text", "is", null).lte("wa_timestamp", after).order("wa_timestamp", { ascending: false }).limit(INTAKE_CONTEXT_MESSAGES),
    ]);
    if (mErr) { console.warn(`${LOG} messages read failed`, g.group_jid, mErr.message); return; }
    const msgs = ((fresh ?? []) as Msg[]).filter((m) => m.text.trim().length > 0);
    // Only photos or stickers since the bookmark: nothing to read, ever. Move past them, or the
    // group stays "due" for good and holds a slot (the profiler's 2026-09-18 lesson).
    if (msgs.length === 0) { if (opts.apply) await state(g.group_jid, { last_message_at: g.newest_at }); return; }
    const bursts = buildBursts(msgs, Date.now());
    if (bursts.length === 0) return; // the chat is still moving: next minute
    let context = ((before ?? []) as Msg[]).filter((m) => m.text.trim().length > 0).reverse();

    const vault = await openVault(g.group_jid, g.member_id, [...context, ...msgs].map((m) => m.sender_jid), broad);
    if (!vault) { if (opts.apply) await state(g.group_jid, { last_message_at: bursts[bursts.length - 1][bursts[bursts.length - 1].length - 1].wa_timestamp, last_error: "member not found" }); return; }
    let failCount = Number(g.fail_count ?? 0);

    for (const burst of bursts) {
      if (stop || sent >= maxBursts || Date.now() >= deadline) break;
      const o = await readBurst(g.group_jid, g.member_id, context, burst, { vault, broad, apply: opts.apply, queendomId: g.queendom_id });
      outcomes.push(o); opts.onBurst?.(o);
      if (o.status !== "skipped") sent += 1;
      if (o.status !== "failed") providerFails = 0;
      const end = burst[burst.length - 1].wa_timestamp;

      if (o.status === "failed") {
        if (!opts.apply) break;
        if (o.provider_side) {
          await state(g.group_jid, { last_error: o.error?.slice(0, 300) ?? "failed" });
          providerFails += 1;
          if (providerFails >= INTAKE_OUTAGE_STOP) { console.warn(`${LOG} the provider looks down; stopping this run`); stop = true; }
          break;
        }
        failCount += 1;
        if (failCount < INTAKE_MAX_ATTEMPTS) { await state(g.group_jid, { fail_count: failCount, last_error: o.error?.slice(0, 300) ?? "failed" }); break; }
        console.warn(`${LOG} stepping over a burst after ${failCount} failed readings`, g.group_jid, burst[0].wa_timestamp, end);
        await state(g.group_jid, { last_message_at: end, fail_count: 0, last_error: `stepped over ${burst[0].wa_timestamp} to ${end}: ${o.error ?? "failed"}`.slice(0, 300) });
        failCount = 0;
      } else if (opts.apply) {
        const { data: st } = await sia().from("intake_group_state").select("bursts_done").eq("group_jid", g.group_jid).maybeSingle();
        await state(g.group_jid, { last_message_at: end, bursts_done: Number((st as { bursts_done: number } | null)?.bursts_done ?? 0) + 1, fail_count: 0, last_error: null });
      }
      context = [...context, ...burst].slice(-INTAKE_CONTEXT_MESSAGES);
    }
  };

  // One member's two groups never run together (they would race on the same open tickets).
  const seen = new Set<string>();
  const runnable = groups.filter((g) => (seen.has(g.member_id) ? false : (seen.add(g.member_id), true)));
  await mapWithConcurrency(runnable, opts.apply ? INTAKE_PARALLEL_GROUPS : 2, readGroup);
  return { groups: groups.length, outcomes };
}
