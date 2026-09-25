// member-assessment.ts — THE member pulse refresh and THE member judgement (migration 0241).
//
// The founder's ask: score every member from everything we hold (the group chat, the Freshdesk
// history, the facts, the health signals, the membership) the way a very good head of member
// relations at a luxury concierge would, fairly and from the record only. Two layers:
//   * the PULSE: plain numbers, computed in SQL (member.compute_member_pulse) for every member,
//     refreshed hourly and before every judgement; the list sorts on activity_score.
//   * the JUDGEMENT: one reasoning-tier read per member (assessMember) over the masked record,
//     answering a score 0..100, engagement, satisfaction, risk, value, a one-line verdict,
//     strengths, concerns and the next actions, with confidence. Written into
//     member_snapshot.data->assessment (merged, never clobbering the pulse or the narrative) and
//     as an `assessment` event on the member's timeline (the history of what Serene thought).
//
// Names never reach the model: the profiler's vault masks the record when the member has a
// linked group (the same code names the profiler uses), a local masker otherwise; a leak check
// refuses the reading. Every call is a sia.extraction_runs row (kind `assessment`). Fails closed:
// a torn answer writes nothing. Admin client throughout, no `server-only` chain (Trigger.dev).

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { openVault, getBroadSenders } from "@/lib/services/member-profiler";
import { mapRows } from "@/lib/utils/rows";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { FD_STATUS_LABELS } from "@/lib/constants/freshdesk";
import {
  ASSESSMENT_EVENTS_LIMIT, ASSESSMENT_FACTS_LIMIT, ASSESSMENT_HEALTH_LIMIT, ASSESSMENT_MAX_OUTPUT_TOKENS, ASSESSMENT_MEMBER_STATUSES,
  ASSESSMENT_MIN_DAYS_BETWEEN, ASSESSMENT_PARALLEL, ASSESSMENT_PROMPT_VERSION, ASSESSMENT_RISKS, ASSESSMENT_RUN_KIND, ASSESSMENT_SWEEP_LIMIT,
  ASSESSMENT_TICKETS_LIMIT, ASSESSMENT_TIMEOUT_MS, ASSESSMENT_WINDOW_DAYS, type AssessmentRisk,
} from "@/lib/constants/member-assessment";
import type { MemberAssessment, MemberPulse } from "@/lib/types/member";
import type { Json } from "@/lib/types/database";

const LOG = "[member-assessment]";

// ─── The pulse ───────────────────────────────────────────────────────────────

/** Recompute the pulse for every member (one SQL statement, about 8 s for 600 members). Returns the rows written, or null on failure. */
export async function refreshMemberPulse(): Promise<number | null> {
  const { data, error } = await memberDb(createAdminClient()).rpc("compute_member_pulse");
  if (error) { console.error(`${LOG} pulse failed`, error.message); return null; }
  return Number(data ?? 0);
}

/** The snapshot's pulse and judgement for one member (admin client; the caller gates). */
export async function getMemberSnapshotData(memberId: string): Promise<{ pulse: MemberPulse | null; assessment: MemberAssessment | null }> {
  const { data } = await memberDb(createAdminClient()).from("member_snapshot").select("data").eq("member_id", memberId).maybeSingle();
  const d = ((data as { data?: Record<string, unknown> } | null)?.data ?? {}) as { pulse?: MemberPulse; assessment?: MemberAssessment };
  return { pulse: d.pulse ?? null, assessment: d.assessment ?? null };
}

// ─── The record, gathered ────────────────────────────────────────────────────

type Record_ = {
  member: { id: string; full_name: string; tier: string | null; membership_status: string | null; membership_type: string | null; membership_start: string | null; membership_end: string | null; membership_amount_inr: number | null; wa_group_jid: string | null; queendom_id: string | null };
  pulse: MemberPulse | null;
  facts: { facet: string; key: string; value: string; polarity: string | null }[];
  people: string[];
  events: { occurred_at: string; kind: string; summary: string; tone: string | null }[];
  health: { observed_at: string; signal: string; delta: number; note: string | null }[];
  fdTickets: { created: string; subject: string; category: string | null; status: string; priority: number | null; first_response_h: number | null; resolve_h: number | null; escalated: boolean; reopened: boolean }[];
  siaTickets: { created: string; title: string; category: string; status: string; resolved: string | null; satisfaction: number | null }[];
  anticipations: { title: string; kind: string; due_at: string }[];
};

const hours = (a: string | null, b: string | null): number | null => (a && b ? Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 10) / 10 : null);

async function gather(memberId: string): Promise<Record_ | null> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - ASSESSMENT_WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: m }, snap, { data: facts }, { data: people }, { data: events }, { data: health }, { data: fd }, { data: st }, { data: ant }] = await Promise.all([
    memberDb(admin).from("members").select("id, full_name, tier, membership_status, membership_type, membership_start, membership_end, membership_amount_inr, wa_group_jid, queendom_id").eq("id", memberId).maybeSingle(),
    getMemberSnapshotData(memberId),
    memberDb(admin).from("member_facts").select("facet, key, value, polarity").eq("member_id", memberId).is("superseded_by", null).neq("facet", "note").order("confidence", { ascending: false }).limit(ASSESSMENT_FACTS_LIMIT),
    memberDb(admin).from("member_people").select("name").eq("member_id", memberId).limit(40),
    memberDb(admin).from("member_events").select("occurred_at, kind, summary, tone").eq("member_id", memberId).neq("kind", "assessment").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(ASSESSMENT_EVENTS_LIMIT),
    memberDb(admin).from("member_health_events").select("observed_at, signal, delta, note").eq("member_id", memberId).gte("observed_at", since).order("observed_at", { ascending: false }).limit(ASSESSMENT_HEALTH_LIMIT),
    freshdeskDb().from("tickets").select("fd_created_at, subject, category, status, priority, first_responded_at, resolved_at, is_escalated, reopened_at").eq("member_id", memberId).eq("deleted", false).gte("fd_created_at", since).order("fd_created_at", { ascending: false }).limit(ASSESSMENT_TICKETS_LIMIT),
    admin.schema("sia").from("tickets").select("created_at, title, category, status, closed_at, satisfaction").eq("member_id", memberId).gte("created_at", since).order("created_at", { ascending: false }).limit(ASSESSMENT_TICKETS_LIMIT),
    memberDb(admin).from("member_anticipations").select("title, kind, due_at").eq("member_id", memberId).in("status", ["pending", "surfaced"]).order("due_at", { ascending: true }).limit(10),
  ]);
  if (!m) return null;
  return {
    member: m as Record_["member"],
    pulse: snap.pulse,
    facts: mapRows<Record_["facts"][number], Record_["facts"][number]>(facts, (r) => r),
    people: mapRows<{ name: string }, string>(people, (r) => r.name),
    events: mapRows<Record_["events"][number], Record_["events"][number]>(events, (r) => r),
    health: mapRows<{ observed_at: string; signal: string; delta: number; note: string | null }, Record_["health"][number]>(health, (r) => ({ ...r, delta: Number(r.delta) })),
    fdTickets: mapRows<{ fd_created_at: string; subject: string | null; category: string | null; status: number; priority: number | null; first_responded_at: string | null; resolved_at: string | null; is_escalated: boolean; reopened_at: string | null }, Record_["fdTickets"][number]>(fd, (t) => ({
      created: t.fd_created_at, subject: t.subject ?? "", category: t.category, status: FD_STATUS_LABELS[t.status] ?? String(t.status), priority: t.priority,
      first_response_h: hours(t.fd_created_at, t.first_responded_at), resolve_h: hours(t.fd_created_at, t.resolved_at), escalated: Boolean(t.is_escalated), reopened: Boolean(t.reopened_at),
    })),
    siaTickets: mapRows<{ created_at: string; title: string; category: string; status: string; closed_at: string | null; satisfaction: number | null }, Record_["siaTickets"][number]>(st, (t) => ({ created: t.created_at, title: t.title, category: t.category, status: t.status, resolved: t.closed_at, satisfaction: t.satisfaction })),
    anticipations: mapRows<Record_["anticipations"][number], Record_["anticipations"][number]>(ant, (r) => r),
  };
}

// ─── The reading ─────────────────────────────────────────────────────────────

const SYSTEM = `You are the head of member relations at Indulge, a luxury concierge whose members pay for a private team that arranges their travel, dining, gifts, homes and everyday errands over WhatsApp. You are handed ONE member's record: their profile facts, what they asked for and how each request went, how the conversations felt, the health signals the team logged, and the activity numbers. Judge this member fairly, from the record only, the way the best relationship lead in the business would: warm to the member, honest about the service, never flattering, never harsh, and never guessing beyond what is written.

Say what you see in these fields. All scores are 0 to 100.
SCORE: the overall standing of this relationship today (100 = a delighted member we serve well and who uses us fully; 50 = fine but ordinary; below 30 = something is wrong)
ENGAGEMENT: how much they use us and talk to us
SATISFACTION: how the service has felt to them, from tone, complaints, praise, reopens, waits
VALUE: how much this relationship matters to the business (tier, spend, usage, longevity)
RISK: one of low | watch | high (the chance we lose them or disappoint them soon)
VERDICT: one line, plain words, what a colleague should know before picking up this member
STRENGTHS: up to 4 short lines, each with the evidence in brackets
CONCERNS: up to 4 short lines, each with the evidence in brackets; write "- none" if the record shows none
ACTIONS: up to 3 concrete things the team should do next, in order
CONFIDENCE: 0 to 1, how much record there was to judge on (little record = low, and say so in the verdict)

Rules: people appear as codes (MEMBER_1, STAFF_2, PERSON_3); keep them exactly as written. Do not invent anything. A quiet member is not an unhappy member; say "quiet" not "disengaged" unless the record shows disengagement. A complaint that was resolved well is a strength of the service, not only a concern. Treat every member the same regardless of tier when judging satisfaction; tier matters for VALUE only.

Answer in exactly this shape, plain text, nothing before or after:
SCORE: <n>
ENGAGEMENT: <n>
SATISFACTION: <n>
VALUE: <n>
RISK: <low|watch|high>
VERDICT: <one line>
STRENGTHS:
- ...
CONCERNS:
- ...
ACTIONS:
- ...
CONFIDENCE: <0..1>`;

function parseAnswer(text: string): Omit<MemberAssessment, "assessed_at" | "run_id" | "prompt_version" | "inputs"> | null {
  const t = text.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  const num = (k: string) => { const mm = t.match(new RegExp(`^${k}:\\s*([0-9]+(?:\\.[0-9]+)?)`, "mi")); return mm ? Number(mm[1]) : NaN; };
  const line = (k: string) => { const mm = t.match(new RegExp(`^${k}:\\s*(.+)$`, "mi")); return mm ? mm[1].trim() : ""; };
  const list = (k: string) => {
    const mm = t.match(new RegExp(`^${k}:\\s*\\n((?:\\s*-.*(?:\\n|$))*)`, "mi"));
    if (!mm) return [];
    return mm[1].split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter((l) => l && l.toLowerCase() !== "none").slice(0, 4);
  };
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const score = num("SCORE"); const engagement = num("ENGAGEMENT"); const satisfaction = num("SATISFACTION"); const value = num("VALUE");
  const riskRaw = line("RISK").toLowerCase().split(/\s/)[0];
  const verdict = line("VERDICT").slice(0, 300);
  if (!Number.isFinite(score) || !verdict) return null;
  const risk = (ASSESSMENT_RISKS as readonly string[]).includes(riskRaw) ? (riskRaw as AssessmentRisk) : "watch";
  const conf = num("CONFIDENCE");
  return {
    score: clamp(score), engagement: Number.isFinite(engagement) ? clamp(engagement) : clamp(score), satisfaction: Number.isFinite(satisfaction) ? clamp(satisfaction) : clamp(score), value: Number.isFinite(value) ? clamp(value) : clamp(score),
    risk, verdict, strengths: list("STRENGTHS"), concerns: list("CONCERNS"), actions: list("ACTIONS"), confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
  };
}

function renderRecord(r: Record_, mask: (s: string) => string): string {
  const m = r.member; const p = r.pulse;
  const day = (s: string | null) => (s ? s.slice(0, 10) : "—");
  const lines: string[] = [];
  lines.push(`Today: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`MEMBER_1 · tier ${m.tier ?? "unknown"} · membership ${m.membership_status ?? "unknown"}${m.membership_type ? ` (${m.membership_type})` : ""} · from ${day(m.membership_start)} to ${day(m.membership_end)}${m.membership_amount_inr ? ` · ₹${Math.round(m.membership_amount_inr).toLocaleString("en-IN")} a year` : ""}`);
  if (p) lines.push(`Activity: last contact ${day(p.last_contact_at)}; last message from the member ${day(p.last_member_message_at)}; ${p.member_messages_30d} messages from them and ${p.staff_messages_30d} from us in 30 days; ${p.tickets_90d} requests in 90 days (${p.tickets_all} ever), ${p.open_tickets} open, ${p.escalated_90d} escalated; activity score ${p.activity_score}/100.`);
  else lines.push("Activity: no numbers yet.");
  lines.push(`\nPROFILE FACTS (${r.facts.length}):`);
  for (const f of r.facts) lines.push(`- ${f.facet}.${mask(f.key)}: ${f.polarity === "dislikes" ? "AVOIDS " : ""}${mask(f.value)}`);
  lines.push(`\nREQUESTS IN FRESHDESK, last ${ASSESSMENT_WINDOW_DAYS} days (${r.fdTickets.length}):`);
  for (const t of r.fdTickets) lines.push(`- ${day(t.created)} [${t.status}${t.escalated ? ", escalated" : ""}${t.reopened ? ", reopened" : ""}] ${t.category ?? "?"}: ${mask(t.subject).slice(0, 120)} · first reply ${t.first_response_h ?? "?"} h · resolved in ${t.resolve_h ?? "?"} h`);
  if (r.siaTickets.length) { lines.push(`\nREQUESTS IN SERENE (${r.siaTickets.length}):`); for (const t of r.siaTickets) lines.push(`- ${day(t.created)} [${t.status}] ${t.category}: ${mask(t.title).slice(0, 120)}${t.satisfaction != null ? ` · satisfaction ${t.satisfaction}` : ""}`); }
  lines.push(`\nCONVERSATIONS, as read by the profiler (${r.events.length}, newest first):`);
  for (const e of r.events) lines.push(`- ${day(e.occurred_at)} [${e.kind}${e.tone ? `, ${e.tone}` : ""}] ${mask(e.summary).slice(0, 240)}`);
  lines.push(`\nHEALTH SIGNALS LOGGED (${r.health.length}):`);
  for (const h of r.health) lines.push(`- ${day(h.observed_at)} ${h.signal} (${h.delta > 0 ? "+" : ""}${h.delta})${h.note ? `: ${mask(h.note).slice(0, 160)}` : ""}`);
  if (r.anticipations.length) { lines.push(`\nCOMING UP:`); for (const a of r.anticipations) lines.push(`- ${day(a.due_at)} ${a.kind}: ${mask(a.title)}`); }
  return lines.join("\n");
}

export type AssessOutcome =
  | { status: "assessed"; assessment: MemberAssessment }
  | { status: "skipped"; reason: "not_found" | "recent" }
  | { status: "failed"; error: string };

/** Judge one member. `force` ignores the "judged recently" skip (the page button). */
export async function assessMember(memberId: string, opts: { force?: boolean; broad?: Set<string> } = {}): Promise<AssessOutcome> {
  const admin = createAdminClient();
  const record = await gather(memberId);
  if (!record) return { status: "skipped", reason: "not_found" };
  const prior = (await getMemberSnapshotData(memberId)).assessment;
  if (!opts.force && prior?.assessed_at && Date.now() - new Date(prior.assessed_at).getTime() < ASSESSMENT_MIN_DAYS_BETWEEN * 86_400_000) return { status: "skipped", reason: "recent" };

  // The masker: the profiler's vault when a group is linked (the same code names), else a local one.
  let mask: (s: string) => string;
  let leaks: (s: string) => string[];
  if (record.member.wa_group_jid) {
    const vault = await openVault(record.member.wa_group_jid, memberId, [], opts.broad ?? (await getBroadSenders()));
    if (!vault) return { status: "failed", error: "vault could not open" };
    mask = vault.mask; leaks = vault.leaks;
  } else {
    const names = [record.member.full_name, ...record.people].filter((n) => n && n.trim().length >= 3);
    const parts = [...new Set(names.flatMap((n) => [n, ...n.split(/\s+/).filter((p) => p.length >= 4)]))];
    mask = (s) => parts.reduce((t, p) => t.split(p).join("PERSON"), s);
    leaks = (s) => names.filter((n) => s.includes(n));
  }
  // Our own people: Freshdesk notes, ticket subjects and the profiler's summaries name staff who are
  // not in this member's group, so the vault does not know them. Every active account's full name
  // and first name (4+ letters) becomes STAFF, and the leak check covers them too.
  const { data: staffRows } = await admin.from("profiles").select("full_name").eq("is_active", true);
  const staffNames = mapRows<{ full_name: string | null }, string>(staffRows, (r) => r.full_name ?? "").filter((n) => n.trim().length >= 3);
  const staffParts = [...new Set(staffNames.flatMap((n) => [n, ...n.split(/\s+/).filter((p) => p.length >= 4)]))].sort((a, b) => b.length - a.length);
  const staffRe = staffParts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${staffParts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  const maskStaff = (t: string) => (staffRe ? t.replace(staffRe, "STAFF") : t);
  const maskAll = (t: string) => maskStaff(mask(t));
  const leaksAll = (t: string) => [...leaks(t), ...(staffRe ? staffNames.filter((n) => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(t)) : [])];
  const depth = await getPiiMaskingDepth();
  const userContent = maskPii(renderRecord(record, maskAll), depth);
  const leaked = leaksAll(userContent);
  if (leaked.length) return { status: "failed", error: `name leak (${leaked.length}); nothing written` };

  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: ASSESSMENT_RUN_KIND, member_id: memberId, prompt_version: ASSESSMENT_PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { facts: record.facts.length, events: record.events.length, fd_tickets: record.fdTickets.length, sia_tickets: record.siaTickets.length, health: record.health.length, chars: userContent.length, forced: Boolean(opts.force) },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => { if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId); };

  try {
    const llm = await resolveLlmForJob("reasoning");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: ASSESSMENT_MAX_OUTPUT_TOKENS, effort: "low", timeoutMs: ASSESSMENT_TIMEOUT_MS, system: SYSTEM, messages: [{ role: "user", content: userContent }] });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    if (result.stopReason === "max_tokens") { await finish(false, { ...usage, error: "answer cut off at the token limit" }); return { status: "failed", error: "cut off" }; }
    const parsed = parseAnswer(result.text);
    if (!parsed) { await finish(false, { ...usage, error: "no judgement", output: { text: result.text.slice(0, 2000) } }); return { status: "failed", error: "no judgement" }; }
    const out = [parsed.verdict, ...parsed.strengths, ...parsed.concerns, ...parsed.actions].join("\n");
    if (leaksAll(out).length) { await finish(false, { ...usage, error: "name in output" }); return { status: "failed", error: "name in output; nothing written" }; }
    await finish(true, { ...usage, output: parsed as unknown as Json });

    const assessment: MemberAssessment = {
      ...parsed, assessed_at: new Date().toISOString(), run_id: runId, prompt_version: ASSESSMENT_PROMPT_VERSION,
      inputs: { facts: record.facts.length, events: record.events.length, tickets: record.fdTickets.length + record.siaTickets.length, health: record.health.length, window_days: ASSESSMENT_WINDOW_DAYS },
    };
    // Merge under our own key; the pulse and the narrative stay as they are.
    const { data: cur } = await memberDb(admin).from("member_snapshot").select("data, version").eq("member_id", memberId).maybeSingle();
    const curData = ((cur as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
    const next = { ...curData, assessment: assessment as unknown as Json };
    const { error: wErr } = cur
      ? await memberDb(admin).from("member_snapshot").update({ data: next as Json, built_at: new Date().toISOString(), version: ((cur as { version: number }).version ?? 0) + 1, run_id: runId }).eq("member_id", memberId)
      : await memberDb(admin).from("member_snapshot").insert({ member_id: memberId, data: next as Json, built_at: new Date().toISOString(), version: 1, run_id: runId });
    if (wErr) return { status: "failed", error: wErr.message };
    // The timeline keeps the history of what Serene thought (never a name: the verdict was checked above).
    await memberDb(admin).from("member_events").insert({ member_id: memberId, occurred_at: assessment.assessed_at, kind: "assessment", source: "serene", source_ref: { run_id: runId, score: assessment.score, risk: assessment.risk }, actor: "model", summary: `Serene's judgement: ${assessment.score}/100, ${assessment.risk}. ${assessment.verdict}`, tone: null, weight: 0.2 });
    return { status: "assessed", assessment };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`${LOG} failed (nothing written):`, msg);
    await finish(false, { error: msg.slice(0, 300) });
    return { status: "failed", error: msg };
  }
}

/** The weekly sweep: refresh the pulse, then judge the Active members not judged in ASSESSMENT_MIN_DAYS_BETWEEN days, oldest first. */
export async function runAssessmentSweep(opts: { deadlineMs: number; limit?: number }): Promise<{ pulse: number | null; considered: number; assessed: number; skipped: number; failed: number; stopped: boolean }> {
  const started = Date.now();
  const pulse = await refreshMemberPulse();
  const admin = createAdminClient();
  const { data } = await memberDb(admin).from("members_list").select("id, assessed_at").in("membership_status", [...ASSESSMENT_MEMBER_STATUSES]).order("assessed_at", { ascending: true, nullsFirst: true }).limit(opts.limit ?? ASSESSMENT_SWEEP_LIMIT);
  const cutoff = Date.now() - ASSESSMENT_MIN_DAYS_BETWEEN * 86_400_000;
  const due = mapRows<{ id: string; assessed_at: string | null }, { id: string; assessed_at: string | null }>(data, (r) => r).filter((r) => !r.assessed_at || new Date(r.assessed_at).getTime() < cutoff);
  const broad = await getBroadSenders();
  let assessed = 0, skipped = 0, failed = 0, stopped = false;
  await mapWithConcurrency(due, ASSESSMENT_PARALLEL, async (m) => {
    if (Date.now() - started > opts.deadlineMs) { stopped = true; return; }
    const r = await assessMember(m.id, { broad });
    if (r.status === "assessed") assessed++; else if (r.status === "skipped") skipped++; else failed++;
  });
  return { pulse, considered: due.length, assessed, skipped, failed, stopped };
}
