// hands-router.ts — the many-jobs side of the Hands line (2026-10-03). One WhatsApp chat with an
// agent carries many jobs; the connector files a reply by its job code, its quote, or the only open
// thread. This pass, every minute (src/trigger/hands-router.ts), does the rest:
//
//   1. closes the chat of every job whose ticket is resolved, closed or dropped (a slot frees);
//   2. sends the plans waiting for a slot (Elaya wrote them, the category sends on its own, the
//      agent was at HANDS_MAX_OPEN_JOBS), oldest first, as slots allow;
//   3. places the replies the connector could not: a file sent within two minutes of a placed line
//      goes with it (the QR right after "#T42 Scan to pay"); the rest Elaya matches by what they say
//      against each open job (one routing-tier call per agent, plain text). Anything she is unsure of
//      stays 'unmatched' for a person on the /hands tray.
//
// Fails closed: a torn reply files nothing. Every match call is a sia.extraction_runs row (kind
// hands_match). No `server-only`.

import { createAdminClient } from "@/lib/supabase/admin";
import { handsDb } from "@/lib/supabase/schemas";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { ticketsAdminDb } from "@/lib/services/tickets-service";
import { closeHandsThreadCore, fileHandsMessageCore } from "@/lib/services/hands-mutations";
import { agentContactFor, listQueuedPlans, openJobCount, sendHandsTicketLineCore } from "@/lib/services/hands-ticket";
import { mapRows } from "@/lib/utils/rows";
import { HANDS_MAX_OPEN_JOBS, handsJobCode } from "@/lib/constants/hands";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { HandsMessageRow, HandsThreadRow } from "@/lib/types/hands";

const LOG = "[hands-router]";
const FINISHED = new Set(["resolved", "closed", "dropped"]);
const FOLLOW_ON_MS = 2 * 60_000;
const LOOKBACK_MS = 3 * 86_400_000;
const RUN_KIND = "hands_match";
const PROMPT_VERSION = "hands-match-v1";

/** Who a background act is recorded as: the person whose action led to it, never a made-up user. */
function actorFor(userId: string): MutationActor {
  return { userId, role: "agent", domain: "concierge", fullName: "Elaya" } as MutationActor;
}

async function closeFinishedJobs(apply: boolean): Promise<number> {
  const { data } = await handsDb(createAdminClient()).from("threads").select("id, ticket_id, opened_by").eq("kind", "ticket").eq("status", "open").limit(500);
  const threads = mapRows<{ id: string; ticket_id: string | null; opened_by: string | null }, { id: string; ticket_id: string | null; opened_by: string | null }>(data, (r) => r).filter((t) => t.ticket_id);
  if (threads.length === 0) return 0;
  const { data: tk } = await ticketsAdminDb().from("tickets").select("id, status").in("id", threads.map((t) => t.ticket_id as string));
  const statusOf = new Map(mapRows<{ id: string; status: string }, [string, string]>(tk, (r) => [r.id, r.status]));
  let closed = 0;
  for (const t of threads) {
    if (!FINISHED.has(statusOf.get(t.ticket_id as string) ?? "")) continue;
    if (apply) await closeHandsThreadCore(t.id, actorFor(t.opened_by ?? ""));
    closed++;
  }
  return closed;
}

async function releaseQueuedJobs(apply: boolean): Promise<number> {
  const queued = await listQueuedPlans();
  if (queued.length === 0) return 0;
  const slots = new Map<string, number>();
  let released = 0;
  for (const { ticket, plan } of queued) {
    const agent = await agentContactFor(ticket);
    if (!agent || !plan.by) continue;
    if (!slots.has(agent.jid)) slots.set(agent.jid, HANDS_MAX_OPEN_JOBS - (await openJobCount(agent.jid)));
    const free = slots.get(agent.jid) ?? 0;
    if (free <= 0) continue;
    if (apply) {
      const r = await sendHandsTicketLineCore(ticket.id, plan.text, actorFor(plan.by), {
        source: "elaya", disclosure: { from_draft: true, auto: true, queued: true, run_id: plan.runId, sent: plan.sent, held_back: plan.heldBack },
      });
      if (r.data === null) { console.warn(`${LOG} release failed for ${ticket.ticket_no}:`, r.error); continue; }
    }
    slots.set(agent.jid, free - 1);
    released++;
  }
  return released;
}

type JobCtx = { thread: HandsThreadRow; code: string; opening: string; recent: string[] };

async function matchUnmatched(apply: boolean): Promise<{ followOn: number; matched: number; left: number }> {
  const db = handsDb(createAdminClient());
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data } = await db.from("messages").select("*").eq("match_status", "unmatched").is("thread_id", null).eq("direction", "in").gt("wa_timestamp", since).order("wa_timestamp", { ascending: true }).limit(200);
  const waiting = mapRows<HandsMessageRow, HandsMessageRow>(data, (r) => r);
  if (waiting.length === 0) return { followOn: 0, matched: 0, left: 0 };

  let followOn = 0;
  const forModel: HandsMessageRow[] = [];
  for (const m of waiting) {
    // A file or a short line right after a placed reply from the same number belongs with it.
    const { data: prev } = await db.from("messages").select("thread_id, wa_timestamp").eq("jid", m.jid).eq("direction", "in").not("thread_id", "is", null)
      .lt("wa_timestamp", m.wa_timestamp).gt("wa_timestamp", new Date(new Date(m.wa_timestamp).getTime() - FOLLOW_ON_MS).toISOString())
      .order("wa_timestamp", { ascending: false }).limit(1);
    const prevThread = (prev?.[0] as { thread_id: string } | undefined)?.thread_id;
    if (prevThread && (!m.text || m.text.length < 40)) {
      if (apply) { const r = await fileHandsMessageCore(m.id, prevThread, "content", null); if (r.data) followOn++; } else followOn++;
      continue;
    }
    if (m.text && m.text.trim()) forModel.push(m);
  }

  let matched = 0;
  const byJid = new Map<string, HandsMessageRow[]>();
  for (const m of forModel) byJid.set(m.jid, [...(byJid.get(m.jid) ?? []), m]);
  const depth = await getPiiMaskingDepth();
  for (const [jid, msgs] of byJid) {
    const jobs = await jobsFor(jid);
    if (jobs.length === 0) continue;
    const system = [
      "An outside booking agent replies on ONE WhatsApp chat to several jobs at once. Each job has a code like #T42.",
      "For each reply below, say which job it answers, judging only by what it says (place, dates, product, people, the question it answers).",
      "If you are not sure, say NONE. Never guess between two similar jobs. TALK means the free chat, not any job.",
      "Answer one line per reply, exactly: R<n>: #T<number> | TALK | NONE",
    ].join("\n");
    const jobLines = jobs.map((j) => `${j.code}: ${j.opening}${j.recent.length ? `\n   recent: ${j.recent.join(" / ")}` : ""}`).join("\n");
    const user = `JOBS:\n${maskPii(jobLines, depth)}\n\nREPLIES:\n${msgs.map((m, i) => `R${i + 1}: ${maskPii((m.text ?? "").replace(/\s+/g, " ").slice(0, 500), depth)}`).join("\n")}`;
    const sia = createAdminClient().schema("sia");
    const { data: runRow } = await sia.from("extraction_runs").insert({ kind: RUN_KIND, prompt_version: PROMPT_VERSION, started_at: new Date().toISOString(), input_ref: { jid, replies: msgs.length, jobs: jobs.length } }).select("id").single();
    const runId = (runRow as { id: string } | null)?.id ?? null;
    try {
      const llm = await resolveLlmForJob("routing");
      const res = await llm.adapter.complete({ model: llm.model, maxTokens: 300, timeoutMs: 30_000, system, messages: [{ role: "user", content: user }] });
      const picks = new Map<number, string>();
      for (const line of res.text.split("\n")) {
        const mm = line.match(/^\s*R(\d+)\s*:\s*(#T\d+|TALK|NONE)/i);
        if (mm) picks.set(Number(mm[1]), mm[2].toUpperCase());
      }
      if (runId) await sia.from("extraction_runs").update({ ok: true, finished_at: new Date().toISOString(), model: llm.model, tokens_in: res.usage.inputTokens, tokens_out: res.usage.outputTokens, output: { picks: Object.fromEntries(picks) } }).eq("id", runId);
      for (const [n, pick] of picks) {
        const m = msgs[n - 1];
        if (!m || pick === "NONE") continue;
        const target = pick === "TALK" ? await talkThread(jid) : jobs.find((j) => j.code.toUpperCase() === pick)?.thread ?? null;
        if (!target) continue;
        if (apply) { const r = await fileHandsMessageCore(m.id, target.id, "content", null); if (r.data) matched++; } else matched++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      console.warn(`${LOG} match failed for ${jid}:`, msg);
      if (runId) await sia.from("extraction_runs").update({ ok: false, finished_at: new Date().toISOString(), error: msg.slice(0, 300) }).eq("id", runId);
    }
  }
  return { followOn, matched, left: waiting.length - followOn - matched };
}

async function talkThread(jid: string): Promise<HandsThreadRow | null> {
  const { data } = await handsDb(createAdminClient()).from("threads").select("*").eq("jid", jid).eq("kind", "talk").eq("status", "open").maybeSingle();
  return (data as HandsThreadRow | null) ?? null;
}

/** Each open job with this agent: its code, the opening line we sent, and the last few lines. */
export async function jobsFor(jid: string): Promise<JobCtx[]> {
  const db = handsDb(createAdminClient());
  const { data } = await db.from("threads").select("*").eq("jid", jid).eq("kind", "ticket").eq("status", "open");
  const threads = mapRows<HandsThreadRow, HandsThreadRow>(data, (r) => r);
  if (threads.length === 0) return [];
  const { data: tk } = await ticketsAdminDb().from("tickets").select("id, ticket_no").in("id", threads.map((t) => t.ticket_id as string));
  const noOf = new Map(mapRows<{ id: string; ticket_no: string }, [string, string]>(tk, (r) => [r.id, r.ticket_no]));
  const out: JobCtx[] = [];
  for (const t of threads) {
    const no = noOf.get(t.ticket_id as string);
    if (!no) continue;
    const { data: ms } = await db.from("messages").select("direction, text, wa_timestamp").eq("thread_id", t.id).order("wa_timestamp", { ascending: true }).limit(40);
    const rows = mapRows<{ direction: string; text: string | null }, { direction: string; text: string | null }>(ms, (r) => r).filter((r) => r.text);
    const opening = (rows.find((r) => r.direction === "out")?.text ?? "").replace(/\s+/g, " ").slice(0, 300);
    const recent = rows.slice(-3).map((r) => `${r.direction === "in" ? "agent" : "us"}: ${(r.text ?? "").replace(/\s+/g, " ").slice(0, 120)}`);
    out.push({ thread: t, code: handsJobCode(no), opening, recent });
  }
  return out;
}

export async function runHandsRouter(opts: { apply: boolean }): Promise<{ closed: number; released: number; followOn: number; matched: number; unmatchedLeft: number }> {
  const closed = await closeFinishedJobs(opts.apply);
  const released = await releaseQueuedJobs(opts.apply);
  const m = await matchUnmatched(opts.apply);
  return { closed, released, followOn: m.followOn, matched: m.matched, unmatchedLeft: m.left };
}
