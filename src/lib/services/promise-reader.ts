// promise-reader.ts — THE promise tracker (migration 0255; the founder's update alert, 2026-10-03).
//
// Why a reader and not a word timer: a week of real chats showed a "Sure, let me check" is a
// commitment whose deadline depends on what was asked ("by EOD", "driver details by 12 PM",
// "asap, the visa is tomorrow"), one group can owe two or three things at once, a mid-way "we have
// reached out to the vendor" keeps the member informed, and half of the bare "Sure / Noted" lines
// promise nothing (the member said "I'll confirm Tuesday"). So Elaya reads the conversation and
// keeps one sia.promises row per thing Indulge owes the member: what, by when, waiting on whom,
// open / delivered / dropped, and whether the member chased.
//
// runPromiseSweep: the groups whose reply clock moved since their last read (a holding line, or new
// messages in a group that owes something) and have settled for a minute → per group, the newest
// messages through the profiler's vault (names never reach the model; a leak stops the read) → ONE
// routing-tier call, plain-text blocks, never JSON → rows written. Fails closed: a torn reply writes
// nothing and the group is read again next time. Every call is a sia.extraction_runs row.
// The alerts live in reply-alerts.ts (switch update_alerts_enabled). No `server-only`.

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { openVault, getBroadSenders } from "@/lib/services/member-profiler";
import { mapRows } from "@/lib/utils/rows";
import { IST_OFFSET_MS } from "@/lib/utils/ist";
import {
  PROMISE_DEFAULT_DUE_MINUTES, PROMISE_DUE_MAX_MINUTES, PROMISE_DUE_MIN_MINUTES, PROMISE_GROUPS_PER_RUN, PROMISE_LOOKBACK_HOURS,
  PROMISE_MAX_OUTPUT_TOKENS, PROMISE_MIN_GAP_SECONDS, PROMISE_PROMPT_VERSION, PROMISE_READ_MESSAGES, PROMISE_RUN_KIND,
  PROMISE_SETTLE_SECONDS, PROMISE_STALE_DAYS, PROMISE_TIMEOUT_MS, type PromiseStatus, type PromiseWaitingOn,
} from "@/lib/constants/promises";

const LOG = "[promise-reader]";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0253/0255 are not in the generated types until the next regen
const sia = () => createAdminClient().schema("sia") as any;

export type PromiseRow = {
  id: string; group_jid: string; member_id: string | null; queendom_id: string | null; what: string;
  waiting_on: PromiseWaitingOn; status: PromiseStatus; due_at: string | null; due_basis: "stated" | "inferred" | null;
  promised_at: string; promised_msg_id: string | null; promised_text: string | null; promiser_profile_id: string | null;
  last_update_at: string | null; chased_at: string | null; closed_at: string | null; steps: string[]; updated_at: string;
};
const PROMISE_COLS = "id, group_jid, member_id, queendom_id, what, waiting_on, status, due_at, due_basis, promised_at, promised_msg_id, promised_text, promiser_profile_id, last_update_at, chased_at, closed_at, steps, updated_at";

type Msg = { wa_message_id: string; sender_jid: string; text: string | null; wa_timestamp: string };

/** "Fri 03 Oct 14:30" in IST. */
function istStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${day} ${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}
/** "2026-10-03 18:00" read as IST → epoch ms, or null. */
function parseIst(s: string): number | null {
  const m = s.match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:00Z`);
  return Number.isFinite(t) ? t - IST_OFFSET_MS : null;
}

const SYSTEM = [
  "You read a WhatsApp group between a luxury concierge team (codes STAFF_n / STAFF_<ROLE>_n) and a member's household (MEMBER_n).",
  "Your job: list what the TEAM owes the member right now, so nothing promised is forgotten.",
  "",
  "A promise is the team accepting to come back with something specific: options, a price, a booking, details, a document, a check.",
  "- \"Sure, let me check\" answering a member's request IS a promise. \"Sure\" or \"Noted\" answering something the member will do themselves (\"I'll confirm Tuesday\") is NOT: that is waiting on the member.",
  "- A promise is DELIVERED when the team sends the thing itself (options, confirmation, details, the file), or the member says it is no longer needed (then DROPPED).",
  "- A mid-way update (\"we have reached out to the hotel, awaiting their reply\") keeps it OPEN; note it as an update.",
  "- The member asking \"any update?\" about it is a chase.",
  "- Several things can be owed at once; list each separately. A gentle reminder sent BY the team asking the member to decide is not a promise.",
  "",
  "DUE is the moment the member should have it, as an IST date and time.",
  "- Use what was said: \"in 10 mins\", \"by EOD\" (20:00 IST that day), \"by 12 PM tomorrow\", \"24-48 hours\" (the far end).",
  "- If nothing was said, judge from the request and urgency: a quick check or a restaurant table, 30 to 60 minutes; options for hotels, travel or gifts, a few hours, same day; something the member needs \"asap\" or for an early deadline, before that deadline; vendor-dependent sourcing, by the end of the day.",
  "- A mid-way update that names a new time moves DUE to it.",
  "",
  "You are given the promises already on file as P1, P2... Return every one of them with its current state, and any NEW ones.",
  "Answer only in blocks like this, one block per promise, separated by a line with ---. Plain text, no JSON, no commentary:",
  "PROMISE: P1 or NEW",
  "STATUS: open | delivered | dropped",
  "WHAT: <what is owed, under 15 words, using the codes as written>",
  "WAITING_ON: us | vendor | member",
  "DUE: <YYYY-MM-DD HH:MM> | none",
  "BASIS: stated | inferred",
  "PROMISED_MSG: #<n>",
  "UPDATE_MSG: #<n> | none",
  "CHASE_MSG: #<n> | none",
  "CLOSED_MSG: #<n> | none",
  "If the team owes nothing, answer exactly: NONE",
].join("\n");

export type ParsedPromise = {
  ref: string; status: PromiseStatus; what: string; waitingOn: PromiseWaitingOn; due: string | null; basis: "stated" | "inferred";
  promisedMsg: number | null; updateMsg: number | null; chaseMsg: number | null; closedMsg: number | null;
};

/** The reader's plain-text blocks (pure; exported for a bench). */
export function parsePromiseReply(text: string): ParsedPromise[] | null {
  if (/^\s*NONE\s*$/i.test(text)) return [];
  const out: ParsedPromise[] = [];
  for (const block of text.split(/^\s*---\s*$/m)) {
    const f = (k: string) => block.match(new RegExp(`^\\s*${k}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
    const num = (k: string) => { const m = f(k).match(/#?(\d+)/); return m ? Number(m[1]) : null; };
    const ref = f("PROMISE");
    if (!ref) continue;
    const status = f("STATUS").toLowerCase();
    const waiting = f("WAITING_ON").toLowerCase();
    if (!["open", "delivered", "dropped"].includes(status)) return null;
    out.push({
      ref: ref.toUpperCase(), status: status as PromiseStatus, what: f("WHAT").slice(0, 200),
      waitingOn: (["us", "vendor", "member"].includes(waiting) ? waiting : "us") as PromiseWaitingOn,
      due: /none/i.test(f("DUE")) ? null : f("DUE"), basis: /stated/i.test(f("BASIS")) ? "stated" : "inferred",
      promisedMsg: num("PROMISED_MSG"), updateMsg: num("UPDATE_MSG"), chaseMsg: num("CHASE_MSG"), closedMsg: num("CLOSED_MSG"),
    });
  }
  return out.length ? out : (text.trim() ? null : []);
}

type ClockRow = { group_jid: string; member_id: string | null; hold_started_at: string | null; updated_at: string; promises_read_at: string | null };

/** The groups worth reading now: a holding line or an open promise, new messages since the last read, settled. */
async function dueGroups(now: number): Promise<ClockRow[]> {
  const since = new Date(now - PROMISE_LOOKBACK_HOURS * 3_600_000).toISOString();
  const [{ data: clocks, error }, { data: open }] = await Promise.all([
    sia().from("reply_clocks").select("group_jid, member_id, hold_started_at, updated_at, promises_read_at").gt("updated_at", since).limit(1000),
    sia().from("promises").select("group_jid").eq("status", "open").limit(2000),
  ]);
  if (error) { console.error(`${LOG} clocks read failed:`, error.message); return []; }
  const owing = new Set(mapRows<{ group_jid: string }, string>(open, (r) => r.group_jid));
  return mapRows<ClockRow, ClockRow>(clocks, (r) => r)
    .filter((r) => r.member_id && (r.hold_started_at || owing.has(r.group_jid)))
    .filter((r) => now - new Date(r.updated_at).getTime() >= PROMISE_SETTLE_SECONDS * 1000)
    .filter((r) => !r.promises_read_at || (new Date(r.updated_at) > new Date(r.promises_read_at) && now - new Date(r.promises_read_at).getTime() >= PROMISE_MIN_GAP_SECONDS * 1000))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
}

export type GroupRead = { group_jid: string; status: "read" | "skipped" | "failed"; open: number; written: number; error?: string };

/** Read one group and write its promises. `apply: false` reads and parses but writes nothing. */
export async function readGroupPromises(groupJid: string, memberId: string, opts: { apply: boolean; broad?: Set<string> }): Promise<GroupRead> {
  const now = Date.now();
  const base: GroupRead = { group_jid: groupJid, status: "skipped", open: 0, written: 0 };
  const since = new Date(now - PROMISE_LOOKBACK_HOURS * 3_600_000).toISOString();
  const [{ data: rawMsgs }, { data: rawOpen }, { data: member }] = await Promise.all([
    sia().from("wag_messages_read").select("wa_message_id, sender_jid, text:text_read, wa_timestamp")
      .eq("chat_jid", groupJid).eq("is_revoked", false).gt("wa_timestamp", since).order("wa_timestamp", { ascending: false }).limit(PROMISE_READ_MESSAGES),
    sia().from("promises").select(PROMISE_COLS).eq("group_jid", groupJid).eq("status", "open").order("promised_at", { ascending: true }),
    createAdminClient().schema("member").from("members").select("queendom_id").eq("id", memberId).maybeSingle(),
  ]);
  const msgs = mapRows<Msg, Msg>(rawMsgs, (r) => r).reverse().filter((m) => (m.text ?? "").trim());
  const open = mapRows<PromiseRow, PromiseRow>(rawOpen, (r) => r);
  if (msgs.length === 0) return base;

  const vault = await openVault(groupJid, memberId, msgs.map((m) => m.sender_jid), opts.broad ?? (await getBroadSenders()));
  if (!vault) return { ...base, error: "no member" };
  const lines = msgs.map((m, i) => `[#${i + 1} ${istStamp(m.wa_timestamp)}] ${vault.codeOf(m.sender_jid)}: ${vault.mask((m.text ?? "").replace(/\s+/g, " ").slice(0, 600))}`);
  const onFile = open.map((p, i) => `P${i + 1}: ${vault.mask(p.what)} | waiting on ${p.waiting_on} | due ${p.due_at ? istStamp(p.due_at) : "none"} | promised ${istStamp(p.promised_at)}`);
  const userContent = [
    `NOW: ${istStamp(new Date(now).toISOString())} IST`,
    `PROMISES ON FILE:\n${onFile.length ? onFile.join("\n") : "none"}`,
    `THE CHAT (oldest first):\n${lines.join("\n")}`,
  ].join("\n\n");
  const leaks = vault.leaks(userContent);
  if (leaks.length) return { ...base, status: "failed", error: `name leak (${leaks.length}); not read` };

  const { data: runRow } = await sia().from("extraction_runs").insert({
    kind: PROMISE_RUN_KIND, prompt_version: PROMISE_PROMPT_VERSION, started_at: new Date().toISOString(), member_id: memberId,
    input_ref: { group_jid: groupJid, messages: msgs.length, open: open.length, apply: opts.apply },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => { if (runId) await sia().from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId); };

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({
      model: llm.model, maxTokens: PROMISE_MAX_OUTPUT_TOKENS, timeoutMs: PROMISE_TIMEOUT_MS,
      system: SYSTEM, messages: [{ role: "user", content: userContent }],
    });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    const parsed = result.stopReason === "max_tokens" ? null : parsePromiseReply(result.text);
    if (!parsed) { await finish(false, { ...usage, error: "torn reply", output: { raw: result.text.slice(0, 3000) } }); return { ...base, status: "failed", error: "torn reply" }; }
    await finish(true, { ...usage, output: { promises: parsed } });
    if (!opts.apply) return { ...base, status: "read", open: parsed.filter((p) => p.status === "open").length };

    const msgAt = (n: number | null) => (n && msgs[n - 1] ? msgs[n - 1] : null);
    const queendomId = (member as { queendom_id: string | null } | null)?.queendom_id ?? null;
    const staffJids = [...new Set(parsed.map((p) => msgAt(p.promisedMsg)?.sender_jid).filter((x): x is string => Boolean(x)))];
    const { data: staffRows } = staffJids.length ? await sia().from("wag_contacts").select("jid, staff_profile_id").in("jid", staffJids) : { data: [] };
    const staffOf = new Map(mapRows<{ jid: string; staff_profile_id: string | null }, [string, string | null]>(staffRows, (r) => [r.jid, r.staff_profile_id]));

    let written = 0;
    for (const p of parsed) {
      const promised = msgAt(p.promisedMsg);
      const promisedAt = promised ? new Date(promised.wa_timestamp).getTime() : null;
      const existing = /^P\d+$/.test(p.ref) ? open[Number(p.ref.slice(1)) - 1] : undefined;
      const anchor = existing ? new Date(existing.promised_at).getTime() : promisedAt;
      if (!anchor) continue;
      const dueRaw = p.due ? parseIst(p.due) : null;
      const due = p.waitingOn === "member" ? null
        : Math.min(Math.max(dueRaw ?? anchor + PROMISE_DEFAULT_DUE_MINUTES * 60_000, anchor + PROMISE_DUE_MIN_MINUTES * 60_000), anchor + PROMISE_DUE_MAX_MINUTES * 60_000);
      const update = msgAt(p.updateMsg);
      const chase = msgAt(p.chaseMsg);
      const closed = msgAt(p.closedMsg);
      const patch: Record<string, unknown> = {
        what: vault.unmask(p.what) || existing?.what, waiting_on: p.waitingOn, status: p.status,
        due_at: due ? new Date(due).toISOString() : null, due_basis: dueRaw ? p.basis : "inferred", run_id: runId, updated_at: new Date().toISOString(),
      };
      if (update) patch.last_update_at = update.wa_timestamp;
      if (chase) patch.chased_at = chase.wa_timestamp;
      if (p.status !== "open") { patch.closed_at = closed?.wa_timestamp ?? new Date().toISOString(); patch.closed_msg_id = closed?.wa_message_id ?? null; }
      if (existing) {
        // A due time that moved later (a mid-way update with a new time) starts the ladder again.
        if (due && existing.due_at && due > new Date(existing.due_at).getTime() + 5 * 60_000) patch.steps = [];
        const { error } = await sia().from("promises").update(patch).eq("id", existing.id).eq("status", "open");
        if (!error) written++;
      } else if (p.status === "open" && promised) {
        const { error } = await sia().from("promises").insert({
          ...patch, group_jid: groupJid, member_id: memberId, queendom_id: queendomId, promised_at: promised.wa_timestamp,
          promised_msg_id: promised.wa_message_id, promised_text: (promised.text ?? "").slice(0, 300), promiser_profile_id: staffOf.get(promised.sender_jid) ?? null,
        });
        if (!error) written++; else console.warn(`${LOG} insert failed:`, error.message);
      }
    }
    return { group_jid: groupJid, status: "read", open: parsed.filter((p) => p.status === "open").length, written };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`${LOG} read failed ${groupJid}:`, msg);
    await finish(false, { error: msg.slice(0, 300) });
    return { ...base, status: "failed", error: msg };
  }
}

export async function runPromiseSweep(opts: { apply: boolean; deadlineMs: number; limit?: number }): Promise<{ due: number; reads: GroupRead[]; dropped: number }> {
  const now = Date.now();
  const groups = (await dueGroups(now)).slice(0, opts.limit ?? PROMISE_GROUPS_PER_RUN);
  const broad = await getBroadSenders();
  const reads: GroupRead[] = [];
  for (const g of groups) {
    if (Date.now() > opts.deadlineMs) break;
    const r = await readGroupPromises(g.group_jid, g.member_id as string, { apply: opts.apply, broad });
    reads.push(r);
    // A failed read is tried again on the next new message, not every minute.
    if (opts.apply) await sia().from("reply_clocks").update({ promises_read_at: new Date().toISOString() }).eq("group_jid", g.group_jid);
  }
  let dropped = 0;
  if (opts.apply) {
    const stale = new Date(now - PROMISE_STALE_DAYS * 86_400_000).toISOString();
    const { data } = await sia().from("promises").update({ status: "dropped", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("status", "open").lt("updated_at", stale).select("id");
    dropped = Array.isArray(data) ? data.length : 0;
  }
  return { due: groups.length, reads, dropped };
}

/** Open promises (the alert pass and Elaya's open-loops read). Admin client; the CALLER scopes. null = the read failed. */
export async function listOpenPromises(limit = 500): Promise<PromiseRow[] | null> {
  const { data, error } = await sia().from("promises").select(PROMISE_COLS).eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) { console.error(`${LOG} open read failed:`, error.message); return null; }
  return mapRows<PromiseRow, PromiseRow>(data, (r) => r);
}
