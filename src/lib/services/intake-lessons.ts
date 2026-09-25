// intake-lessons.ts — THE lesson writer and the lessons the ticket AI follows (0240).
//
// The founder's rule for the training phase: every approval, rejection and correction must end
// up as an instruction the ticket AI follows, and a human approves the instruction, never the
// machine. sia.draft_reviews (0239) keeps the verdicts. This file:
//   * writeLessonDraft(kind)      reads the new verdicts since the last lesson, hands them (masked)
//                                 with the current approved lesson to the reasoning tier, and writes
//                                 ONE draft row per kind (a second run replaces the draft, never
//                                 stacks). Below LESSON_MIN_REVIEWS new verdicts it writes nothing.
//   * approve / update / discard  the founder's three moves on a draft (through the gated actions).
//   * lessonPromptBlock(kind)     the APPROVED lesson as the block the prompts fold in, with the
//                                 version suffix the prompt version carries ("intake-v1+L3"), so
//                                 the scoreboard can judge each lesson by its numbers.
//
// Names never reach the model: member names are replaced by MEMBER_n codes before maskPii, and a
// leak check refuses the writing (the profiler's posture). Fails closed: a torn reply writes no
// draft. Admin client throughout, no `server-only` chain (runs from Trigger.dev and the actions);
// the page read listIntakeLessons lives in intake-service.ts (session client).

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { mapRows } from "@/lib/utils/rows";
import {
  INTAKE_DISMISS_REASONS, LESSON_BODY_MAX, LESSON_CACHE_MS, LESSON_LABELS, LESSON_MAX_OUTPUT_TOKENS, LESSON_MAX_REVIEWS,
  LESSON_MIN_REVIEWS, LESSON_PROMPT_VERSION, LESSON_RUN_KIND, LESSON_TIMEOUT_MS,
} from "@/lib/constants/ticket-intake";
import type { DraftReview, DraftReviewScoreboardRow, IntakeLesson, LessonKind } from "@/lib/types/intake";
import type { Json } from "@/lib/types/database";

const LOG = "[intake-lessons]";
const COLS = "id, kind, version, status, body, summary, evidence, run_id, created_by, approved_by, approved_at, retired_at, created_at, updated_at";
const sia = () => createAdminClient().schema("sia");

// ─── The approved lesson, as the prompts read it ─────────────────────────────

const cache = new Map<LessonKind, { at: number; lesson: IntakeLesson | null }>();

/** The approved lesson for a kind, or null. Re-read at most every LESSON_CACHE_MS (the intake sweep asks many times a minute). */
export async function getApprovedLesson(kind: LessonKind): Promise<IntakeLesson | null> {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < LESSON_CACHE_MS) return hit.lesson;
  const { data, error } = await sia().from("intake_lessons").select(COLS).eq("kind", kind).eq("status", "approved").maybeSingle();
  if (error) { console.warn(`${LOG} approved read failed (prompt goes without a lesson):`, error.message); return hit?.lesson ?? null; }
  const lesson = (data as IntakeLesson | null) ?? null;
  cache.set(kind, { at: Date.now(), lesson });
  return lesson;
}

/** Drop the cache after an approval so the next prompt sees it at once. */
export function forgetLessonCache(): void { cache.clear(); }

/**
 * What a prompt appends to its system text, and the suffix its prompt version carries.
 * No approved lesson = empty block, empty suffix: the prompt is exactly what it was.
 */
export async function lessonPromptBlock(kind: LessonKind): Promise<{ block: string; suffix: string }> {
  const lesson = await getApprovedLesson(kind);
  if (!lesson) return { block: "", suffix: "" };
  return {
    block: `\n\nLESSONS FROM THE TEAM (approved, version ${lesson.version}). Follow them; where one contradicts a rule above, the lesson wins:\n${lesson.body}`,
    suffix: `+L${lesson.version}`,
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The verdicts by source and prompt version since a moment (the scoreboard on the settings page). Admin client; the page gates. */
export async function getDraftReviewScoreboard(since: string): Promise<DraftReviewScoreboardRow[]> {
  const { data, error } = await sia().rpc("draft_review_scoreboard", { p_since: since });
  if (error) { console.error(`${LOG} scoreboard failed`, error.message); return []; }
  return mapRows<Record<string, unknown>, DraftReviewScoreboardRow>(data, (r) => ({
    source: String(r.source) as DraftReviewScoreboardRow["source"], prompt_version: String(r.prompt_version),
    decided: Number(r.decided ?? 0), accepted: Number(r.accepted ?? 0), edited: Number(r.edited ?? 0), dismissed: Number(r.dismissed ?? 0), with_feedback: Number(r.with_feedback ?? 0),
  }));
}

async function latestLesson(kind: LessonKind): Promise<IntakeLesson | null> {
  const { data } = await sia().from("intake_lessons").select(COLS).eq("kind", kind).order("version", { ascending: false }).limit(1).maybeSingle();
  return (data as IntakeLesson | null) ?? null;
}

/** Which verdict rows teach which kind of lesson. */
function reviewFilter(kind: LessonKind): { sources: string[]; decisions: string[] } {
  if (kind === "intake") return { sources: ["intake_card"], decisions: ["accepted", "edited", "dismissed"] };
  if (kind === "ticket_creator") return { sources: ["intake_card", "ticket_creator"], decisions: ["accepted", "edited"] };
  return { sources: ["sentinel"], decisions: ["accepted", "dismissed"] };
}

async function readNewReviews(kind: LessonKind, since: string | null): Promise<DraftReview[]> {
  const f = reviewFilter(kind);
  let q = sia().from("draft_reviews").select("id, source, decision, member_id, queendom_id, proposal_id, ticket_id, run_id, prompt_version, draft, final, corrections, dismiss_reason, feedback, decided_by, decided_at")
    .in("source", f.sources).in("decision", f.decisions).order("decided_at", { ascending: false }).limit(LESSON_MAX_REVIEWS);
  if (since) q = q.gt("decided_at", since);
  const { data, error } = await q;
  if (error) { console.error(`${LOG} reviews read failed`, error.message); return []; }
  return mapRows<DraftReview, DraftReview>(data, (r) => ({ ...r, corrections: Array.isArray(r.corrections) ? r.corrections : [] }));
}

// ─── The writing ─────────────────────────────────────────────────────────────

const FOCUS: Record<LessonKind, string> = {
  intake: "The reader decides whether NEW WhatsApp messages from a member are a request (a ticket), an update to an open ticket, a question, feedback or chatter. Teach it what the team accepted as requests, what it dismissed and why (not a request, already handled, duplicate, wrong member), and which cards were edited before creating (a sign the reading was right but thin).",
  ticket_creator: "The creator turns a member's messages into a ticket draft: category, sub-category, title, priority, needed-by date and the brief fields. Teach it from every correction the team made (what was drafted, what was written instead, and the team's words) and from the drafts accepted untouched (what good looks like).",
  sentinel: "The sentinel watches one ticket and may suggest a status move (for example to resolved, or awaiting the member). Teach it from which suggestions the team approved and which it dismissed, so it suggests at the right moment and stays quiet otherwise.",
};

const SYSTEM = `You write the instruction document a ticket AI at Indulge (a luxury concierge) follows. You are given the CURRENT approved document (may be empty) and the team's NEW verdicts on the AI's recent drafts. Write the NEW full document that replaces the current one.

How to write it:
- Plain English. Numbered rules, grouped under short headings. Each rule says what to do, then "Because: ..." in one line, then "Example: ..." with ONE masked example taken from the verdicts (quote the draft and the correction or the reason).
- Keep every rule from the current document that the new verdicts do not contradict. Drop or rewrite a rule the verdicts contradict. Merge duplicates. Do not repeat the AI's general instructions; write only what the team has taught.
- A single verdict is a hint; three that agree are a rule. Say "often" when it is a tendency and "always" only when every verdict agrees.
- People appear as codes (MEMBER_3, STAFF_1, PERSON_2). Keep the codes exactly as written. Never invent a name, a phone number, an address or a fact that is not in the verdicts.
- The document is read by a model, not a person: no preamble, no praise, no "as an AI". Under ${LESSON_BODY_MAX} characters.

Answer in this exact shape and nothing else (plain text, no JSON, no code fence):
SUMMARY: one paragraph on what changed against the current document
---
the full new document`;

/** The reply is plain text: a SUMMARY line, a --- line, the document. JSON was tried first and a document full of quotes and newlines broke it. */
function parseReply(text: string): { summary: string; body: string } {
  const t = text.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  const sep = t.search(/\n-{3,}\s*\n/);
  if (sep < 0) return { summary: "", body: t.replace(/^SUMMARY:\s*/i, "") };
  const head = t.slice(0, sep).replace(/^SUMMARY:\s*/i, "").trim();
  const body = t.slice(sep).replace(/^\n-{3,}\s*\n/, "").trim();
  return { summary: head.slice(0, 2000), body };
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderReview(r: DraftReview, i: number, code: (memberId: string | null) => string): string {
  const who = code(r.member_id);
  const d = r.draft ?? {};
  const head = `#${i + 1} ${who} · ${r.source} · ${r.decision}${r.dismiss_reason ? ` (${INTAKE_DISMISS_REASONS.find((x) => x.id === r.dismiss_reason)?.label ?? r.dismiss_reason})` : ""}`;
  const lines: string[] = [head];
  if (r.source === "sentinel") {
    lines.push(`  suggested: ${fmt(d.suggested_status)} (from ${fmt(d.from_status)}) because: ${fmt(d.reason)}`);
  } else {
    const pick = (o: Record<string, unknown>) => ({ kind: o.kind, category: o.category, sub_category: o.sub_category, title: o.title, priority: o.priority, requested_for: o.requested_for, brief: o.brief, summary: o.summary, confidence: o.confidence });
    lines.push(`  draft: ${JSON.stringify(Object.fromEntries(Object.entries(pick(d)).filter(([, v]) => v !== undefined)))}`);
    if (r.corrections.length) lines.push(`  changed: ${r.corrections.map((c) => `${c.field}: ${fmt(c.from)} → ${fmt(c.to)}`).join("; ")}`);
  }
  if (r.feedback) lines.push(`  team said: "${r.feedback}"`);
  return lines.join("\n");
}

export type LessonWriteResult =
  | { status: "written"; lesson: IntakeLesson; reviews: number }
  | { status: "skipped"; reason: "disabled" | "too_few" | "none"; reviews: number }
  | { status: "failed"; error: string; reviews: number };

/**
 * Write (or replace) the draft lesson for a kind from the verdicts decided since the last lesson
 * of that kind. `force` writes even below LESSON_MIN_REVIEWS (the "Write a lesson now" button),
 * never with zero verdicts.
 */
export async function writeLessonDraft(kind: LessonKind, opts: { force?: boolean; dryRun?: boolean; reviewsOverride?: DraftReview[] } = {}): Promise<LessonWriteResult> {
  // `dryRun` + `reviewsOverride` = the bench (scripts/tickets/lesson-bench.ts): the model is asked
  // with hand-made verdicts, the run row says dry_run, and NO lesson row is written.
  const previous = await latestLesson(kind);
  const approved = previous?.status === "approved" ? previous : await getApprovedLesson(kind);
  const reviews = opts.reviewsOverride ?? (await readNewReviews(kind, previous?.created_at ?? null));
  if (reviews.length === 0) return { status: "skipped", reason: "none", reviews: 0 };
  if (reviews.length < LESSON_MIN_REVIEWS && !opts.force) return { status: "skipped", reason: "too_few", reviews: reviews.length };

  // Names: every member in the batch becomes MEMBER_n; the leak check below refuses the writing if a
  // full name survives anywhere in the text handed to the model.
  const memberIds = [...new Set(reviews.map((r) => r.member_id).filter((x): x is string => Boolean(x)))];
  const { data: members } = memberIds.length ? await memberDb(createAdminClient()).from("members").select("id, full_name").in("id", memberIds) : { data: [] as { id: string; full_name: string }[] };
  const names = new Map<string, { code: string; full: string }>();
  for (const m of mapRows<{ id: string; full_name: string }, { id: string; full_name: string }>(members, (x) => x)) names.set(m.id, { code: `MEMBER_${names.size + 1}`, full: m.full_name });
  const code = (id: string | null) => (id && names.get(id)?.code) || "MEMBER_?";
  const nameParts = [...names.values()].flatMap((n) => [n.full, ...n.full.split(/\s+/).filter((p) => p.length >= 4)]);
  const maskNames = (text: string) => nameParts.reduce((t, p) => t.split(p).join("PERSON"), text);

  const depth = await getPiiMaskingDepth();
  const rendered = maskPii(maskNames(reviews.map((r, i) => renderReview(r, i, code)).join("\n\n")), depth);
  const currentBody = approved ? maskPii(maskNames(approved.body), depth) : "(none yet)";
  const leaked = [...names.values()].filter((n) => rendered.includes(n.full) || currentBody.includes(n.full));
  if (leaked.length) return { status: "failed", error: `name leak (${leaked.length}); nothing written`, reviews: reviews.length };

  const userContent = `KIND: ${LESSON_LABELS[kind]}\n${FOCUS[kind]}\n\nCURRENT APPROVED DOCUMENT${approved ? ` (version ${approved.version})` : ""}:\n${currentBody}\n\nNEW VERDICTS (${reviews.length}, newest first):\n${rendered}`;

  const admin = createAdminClient();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: LESSON_RUN_KIND, prompt_version: LESSON_PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { lesson_kind: kind, reviews: reviews.length, since: previous?.created_at ?? null, review_ids: reviews.map((r) => r.id), forced: Boolean(opts.force), dry_run: Boolean(opts.dryRun) },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => { if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId); };

  try {
    const llm = await resolveLlmForJob("reasoning");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: LESSON_MAX_OUTPUT_TOKENS, timeoutMs: LESSON_TIMEOUT_MS, system: SYSTEM, messages: [{ role: "user", content: userContent }] });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    if (result.stopReason === "max_tokens") { await finish(false, { ...usage, error: "answer cut off at the token limit" }); return { status: "failed", error: "cut off", reviews: reviews.length }; }
    const { summary, body } = parseReply(result.text);
    if (body.length < 20) { await finish(false, { ...usage, error: "no document", output: { text: result.text.slice(0, 2000) } }); return { status: "failed", error: "no document", reviews: reviews.length }; }
    if (body.length > LESSON_BODY_MAX) { await finish(false, { ...usage, error: "document too long" }); return { status: "failed", error: "too long", reviews: reviews.length }; }
    const leakedOut = [...names.values()].filter((n) => body.includes(n.full));
    if (leakedOut.length) { await finish(false, { ...usage, error: "name in output" }); return { status: "failed", error: "name in output; nothing written", reviews: reviews.length }; }
    await finish(true, { ...usage, output: { summary } as unknown as Json });

    const evidence = { reviews: reviews.length, since: previous?.created_at ?? null, from_version: approved?.version ?? null, review_ids: reviews.map((r) => r.id), model: llm.model };
    if (opts.dryRun) return { status: "written", lesson: { id: "dry-run", kind, version: (previous?.version ?? 0) + 1, status: "draft", body, summary, evidence, run_id: runId, created_by: null, approved_by: null, approved_at: null, retired_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, reviews: reviews.length };
    const { data: existing } = await sia().from("intake_lessons").select("id, version").eq("kind", kind).eq("status", "draft").maybeSingle();
    let row: IntakeLesson | null = null;
    if (existing) {
      const { data, error } = await sia().from("intake_lessons").update({ body, summary, evidence, run_id: runId, updated_at: new Date().toISOString() }).eq("id", (existing as { id: string }).id).select(COLS).single();
      if (error) return { status: "failed", error: error.message, reviews: reviews.length };
      row = data as IntakeLesson;
    } else {
      const version = (previous?.version ?? 0) + 1;
      const { data, error } = await sia().from("intake_lessons").insert({ kind, version, status: "draft", body, summary, evidence, run_id: runId }).select(COLS).single();
      if (error) return { status: "failed", error: error.message, reviews: reviews.length };
      row = data as IntakeLesson;
    }
    return { status: "written", lesson: row, reviews: reviews.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`${LOG} writing failed (nothing written):`, msg);
    await finish(false, { error: msg.slice(0, 300) });
    return { status: "failed", error: msg, reviews: reviews.length };
  }
}

// ─── The founder's moves (through the gated actions) ─────────────────────────

/** Approve a draft: the current approved lesson of that kind is retired first, then the draft is approved. */
export async function approveLessonCore(lessonId: string, actorId: string): Promise<{ data: IntakeLesson | null; error: string | null }> {
  const { data: cur } = await sia().from("intake_lessons").select(COLS).eq("id", lessonId).maybeSingle();
  const draft = cur as IntakeLesson | null;
  if (!draft) return { data: null, error: "That lesson is gone." };
  if (draft.status !== "draft") return { data: null, error: "Only a draft can be approved." };
  const now = new Date().toISOString();
  const { data: old } = await sia().from("intake_lessons").update({ status: "retired", retired_at: now, updated_at: now }).eq("kind", draft.kind).eq("status", "approved").select("id");
  const { data, error } = await sia().from("intake_lessons").update({ status: "approved", approved_by: actorId, approved_at: now, updated_at: now }).eq("id", lessonId).eq("status", "draft").select(COLS).single();
  if (error) {
    // Put the old one back so the prompts never run without the lesson they had.
    for (const o of (old ?? []) as { id: string }[]) await sia().from("intake_lessons").update({ status: "approved", retired_at: null }).eq("id", o.id);
    return { data: null, error: "Could not approve that lesson." };
  }
  forgetLessonCache();
  return { data: data as IntakeLesson, error: null };
}

/** The founder edits a draft's body before approving. Only a draft. */
export async function updateLessonBodyCore(lessonId: string, body: string): Promise<{ data: IntakeLesson | null; error: string | null }> {
  const { data, error } = await sia().from("intake_lessons").update({ body, updated_at: new Date().toISOString() }).eq("id", lessonId).eq("status", "draft").select(COLS).maybeSingle();
  if (error) return { data: null, error: "Could not save that lesson." };
  if (!data) return { data: null, error: "Only a draft can be edited." };
  return { data: data as IntakeLesson, error: null };
}

/** Discard a draft (retired, kept for the record). The approved lesson is untouched. */
export async function discardLessonCore(lessonId: string): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await sia().from("intake_lessons").update({ status: "retired", retired_at: now, updated_at: now }).eq("id", lessonId).eq("status", "draft").select("id").maybeSingle();
  if (error) return { error: "Could not discard that lesson." };
  if (!data) return { error: "Only a draft can be discarded." };
  return { error: null };
}
