// elaya-deep-read.ts — THE deep read (migration 0235, 2026-09-24): the question a chat turn cannot
// answer in a minute, because the answer is not in any column and something has to READ thousands
// of rows and judge each one ("how many tickets are health and wellness", "who sounds unhappy this
// month"). A turn queues a job (write tool start_deep_read); this runs it from Trigger.dev:
//
//   plan (reasoning tier: which rows, which labels, what rule; a set already on record is REUSED so
//   the numbers stay comparable) → count (how many rows exist; more than the cap is refused before
//   anything is paid for) → fetch (the read-only query door, keyset-paged; the rows read must cover
//   the count or the job fails) → reuse (a row whose text matches its saved verdict keeps it; only
//   new or changed rows are judged) → judge (routing tier, 100 rows a call, side by side behind a
//   rate gate that pauses everyone when the provider says slow down) → labels written back
//   (elaya_labels) → aggregate → answer (reasoning tier) → delivered on the channel it was asked on.
//
// Trust over speed: a read that did not cover the rows, or left more than a few percent unjudged,
// delivers NO number, only the reason. A `refresh` job (the nightly top-up, planLabelRefresh) runs
// the same pipeline over a saved set's new rows and delivers nothing: it keeps the labels current
// so "how many this week" is a plain query the next morning.
//
// Every model call goes through the Elaya provider and maskPii; every row read comes through
// elaya_read.run(), so the job can see nothing the analyst tool cannot. One sia.extraction_runs row
// per job carries tokens and the estimated cost. No `server-only` chain: it runs from Trigger.dev.

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveLlmForJob } from '@/lib/elaya/registry';
import { maskPii } from '@/lib/elaya/pii';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import { runElayaQuery, getElayaCatalog, ELAYA_EXPORT_MAX_ROWS } from '@/lib/services/elaya-query-service';
import {
  getElayaJob, advanceElayaJob, updateElayaJobProgress, upsertElayaLabels, getExistingLabels, listLabelSets,
  getActiveLabelSets, createElayaJob, type ElayaLabelInput, type ElayaLabelSetSummary, type ElayaJobRow,
} from '@/lib/services/elaya-jobs-service';
import { insertAssistantMessage } from '@/lib/services/elaya-service';
import { sendElayaWhatsAppReply } from '@/lib/services/whatsapp-api';
import { createNotification } from '@/lib/services/notifications-service';
import { markdownToWhatsApp, splitWhatsAppText } from '@/lib/utils/whatsapp-format';
import { mapWithConcurrency } from '@/lib/utils/concurrency';

import {
  DEEP_READ_ANSWER_PROMPT_VERSION, DEEP_READ_ANSWER_SAMPLES_PER_LABEL, DEEP_READ_BATCH_RETRIES, DEEP_READ_BATCH_ROWS,
  DEEP_READ_COVERAGE_MIN_PCT, DEEP_READ_LABEL_PROMPT_VERSION, DEEP_READ_MAX_LABELS, DEEP_READ_MAX_MINUTES, DEEP_READ_MAX_ROWS,
  DEEP_READ_MAX_UNJUDGED_PCT, DEEP_READ_PAGE_ROWS, DEEP_READ_PARALLEL_CALLS, DEEP_READ_PLAN_PROMPT_VERSION,
  DEEP_READ_RATE_PAUSE_MAX_MS, DEEP_READ_RATE_PAUSE_MS, DEEP_READ_RATE_RETRIES, DEEP_READ_ROW_TEXT_CAP, DEEP_READ_RUN_KIND,
  ELAYA_LABEL_SUBJECTS, LABELS_REFRESH_DAYS, LABELS_REFRESH_MAX_SETS, type DeepReadMode, type ElayaLabelSubject,
} from '@/lib/constants/elaya-jobs';

const LOG = '[elaya-deep-read]';
const WA_PART_CHARS = 4000;
const LETTERS = 'ABCDEFGHIJKLMNOP';
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** A deliberate stop with a line the founder can act on (too many rows, nothing matched). Delivered as-is. */
class DeepReadRefusal extends Error {}

// ── The plan ─────────────────────────────────────────────────────────────────

type DeepReadPlan = {
  mode: DeepReadMode;
  subject_kind: ElayaLabelSubject;
  label_set: string;
  fetch_sql: string;
  /** The same rows narrowed to the last few days: what the nightly top-up reads. */
  refresh_sql: string | null;
  text_columns: string[];
  breakdown_columns: string[];
  labels: { name: string; meaning: string }[];
  other_label: string;
  rubric: string;
  summary: string;
  /** True when the planner picked a set already on record (its labels and rule copied exactly). */
  reused_set: boolean;
};

/** The id column each subject kind is keyed on, in the catalog's views. */
const SUBJECT_ID_COLUMNS: Record<ElayaLabelSubject, string> = {
  freshdesk_ticket: 'freshdesk_tickets.ticket_id',
  member: 'members.member_id',
  whatsapp_group: 'whatsapp_groups.group_id',
  whatsapp_message: 'whatsapp_messages.message_id',
  lead: 'leads.lead_id',
  sia_ticket: 'sia_tickets.ticket_id',
  vendor: 'vendors.vendor_id',
};

const PLAN_SYSTEM = `You plan a deep read for Elaya, the analyst inside Indulge's operating system. A founder asked a question whose answer is not in any column: every relevant row must be read and judged by a model, then counted. You decide WHICH rows, WHAT to judge, and the LABELS.

Reply with ONE JSON object and nothing else:
{
  "subject_kind": one of ${ELAYA_LABEL_SUBJECTS.join(' | ')},
  "label_set": a short snake_case name for the question (e.g. health_wellness, member_mood_sep),
  "fetch_sql": one PostgreSQL SELECT over the catalog views that returns the rows to judge. It MUST alias the subject's id column as subject_id (${Object.entries(SUBJECT_ID_COLUMNS).map(([k, v]) => `${k}: ${v}`).join('; ')}), MUST include the text column(s) to judge, MAY include a few small columns for the breakdown (a date as (col at time zone 'Asia/Kolkata')::date, a queendom name, a category), MUST NOT contain ORDER BY, LIMIT, a semicolon, a comment or a schema name. Filter to the rows the question is about (a time window when the question gives one; otherwise everything). Write a window RELATIVE to now() when the founder says "last 30 days" / "this month" (created_at >= now() - interval '30 days'); write fixed dates only when the founder gives dates.
  "refresh_sql": the same SELECT restricted to rows created in the last 3 days (created_at >= now() - interval '3 days'), so a nightly top-up judges only what is new; null when the rows carry no creation time,
  "text_columns": the column names in fetch_sql whose text the judge reads, most telling first,
  "breakdown_columns": up to 3 column names in fetch_sql to count the labels by (e.g. ["queendom", "year"]); [] if none,
  "labels": 2 to ${DEEP_READ_MAX_LABELS} labels, each {"name": snake_case, "meaning": one plain sentence}. Include the "none of these" label (e.g. other) as the LAST one,
  "other_label": the name of that last label,
  "rubric": the rules a careful human would apply to the hard cases, as short lines (what counts, what does not, how to treat a product versus a service, a name that only sounds like the theme, etc.),
  "summary": one sentence saying what will be counted, in the founder's words
}
Rules: judge the REQUEST or the CONTENT, not the words in it. Keep the row set as small as the question allows (a window, a status, a kind). Never invent a view or column: use only what the catalog lists.

REUSE RULE. Label sets already on record are listed with the question. When the founder's question is the SAME question as one of them (the same thing counted, the same labels, the same rule), reply with THAT label_set name and copy its labels, other_label, rubric, text_columns and fetch_sql exactly, changing only the window or scope the founder asked for: rows already judged are then not read again and the numbers stay comparable over time. When the labels or the rule must differ, use a NEW name (the old name with _v2). Never reuse a name with different labels.`;

function extractJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

function cleanSql(sql: string): string {
  return sql.replace(/;+\s*$/g, '').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
}

function validSql(sql: string): boolean {
  return /\bsubject_id\b/i.test(sql) && !/\b(order\s+by|limit)\b/i.test(sql) && !/;/.test(sql);
}

function existingSetsBlock(sets: ElayaLabelSetSummary[]): string {
  const shown = sets.filter((s) => s.labels.length >= 2 && s.fetch_sql).slice(0, 20);
  if (!shown.length) return 'Label sets already on record: none yet.';
  return 'Label sets already on record (labels saved and counted; reuse keeps the numbers comparable):\n' + shown.map((s) =>
    `- ${s.label_set} (${s.subject_kind}, ${s.rows.toLocaleString('en-IN')} rows labelled, last ${s.last_at.slice(0, 10)}): ${s.summary ?? s.question ?? ''}\n` +
    `  labels: ${s.labels.map((l) => `${l.name} - ${l.meaning}`).join('; ')}\n` +
    `  other_label: ${s.other_label ?? s.labels[s.labels.length - 1].name}; text_columns: ${JSON.stringify(s.text_columns)}\n` +
    `  rule: ${(s.rubric ?? '').replace(/\s+/g, ' ').slice(0, 600)}\n` +
    `  fetch_sql: ${(s.fetch_sql ?? '').slice(0, 600)}`,
  ).join('\n');
}

async function planDeepRead(question: string, sets: ElayaLabelSetSummary[], tokens: { in: number; out: number }): Promise<DeepReadPlan> {
  const catalog = await getElayaCatalog();
  if (!catalog) throw new Error('The catalog could not be read');
  const catalogText = catalog.map((v) => `${v.view}${v.about ? ' — ' + v.about : ''}\n  ${v.columns}`).join('\n');
  const llm = await resolveLlmForJob('reasoning');
  const r = await llm.adapter.complete({
    model: llm.model,
    maxTokens: 3000,
    effort: 'low',
    timeoutMs: 120_000,
    system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: `The founder's question:\n${question}\n\n${existingSetsBlock(sets)}\n\nThe catalog (view — what it holds, then columns; name:type, text when no type):\n${catalogText}` }],
  });
  tokens.in += r.usage.inputTokens;
  tokens.out += r.usage.outputTokens;
  const j = extractJson(r.text);
  if (!j) throw new Error('The planner returned no plan');
  const subject = String(j.subject_kind ?? '');
  if (!(ELAYA_LABEL_SUBJECTS as readonly string[]).includes(subject)) throw new Error(`The planner picked an unknown subject "${subject}"`);
  const labels = Array.isArray(j.labels) ? (j.labels as { name?: unknown; meaning?: unknown }[]).map((l) => ({ name: String(l.name ?? '').trim().toLowerCase().replace(/\s+/g, '_'), meaning: String(l.meaning ?? '').trim() })).filter((l) => l.name) : [];
  if (labels.length < 2 || labels.length > DEEP_READ_MAX_LABELS) throw new Error(`The planner returned ${labels.length} labels`);
  const other = String(j.other_label ?? labels[labels.length - 1].name).trim().toLowerCase();
  const fetchSql = cleanSql(String(j.fetch_sql ?? ''));
  if (!validSql(fetchSql)) throw new Error('The planner’s query must alias subject_id and carry no ORDER BY or LIMIT');
  const refreshRaw = typeof j.refresh_sql === 'string' ? cleanSql(j.refresh_sql) : '';
  const refreshSql = refreshRaw && validSql(refreshRaw) ? refreshRaw : null;

  // A name already on record may be reused only with the SAME labels: a different vocabulary under the
  // same name would be counted together with the old verdicts. Otherwise the name gets a version.
  let labelSet = String(j.label_set ?? 'deep_read').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60) || 'deep_read';
  const names = labels.map((l) => l.name).sort().join(',');
  const taken = new Map(sets.map((s) => [s.label_set, s]));
  let reused = false;
  const onRecord = taken.get(labelSet);
  if (onRecord) {
    if (onRecord.labels.map((l) => l.name).sort().join(',') === names && onRecord.subject_kind === subject) {
      reused = true;
    } else {
      const base = labelSet.replace(/_v\d+$/, '');
      let v = 2;
      while (taken.has(`${base}_v${v}`)) v++;
      labelSet = `${base}_v${v}`.slice(0, 60);
    }
  }

  const plan: DeepReadPlan = {
    mode: 'answer',
    subject_kind: subject as ElayaLabelSubject,
    label_set: labelSet,
    fetch_sql: fetchSql,
    refresh_sql: refreshSql,
    text_columns: Array.isArray(j.text_columns) ? (j.text_columns as unknown[]).map(String) : [],
    breakdown_columns: Array.isArray(j.breakdown_columns) ? (j.breakdown_columns as unknown[]).map(String).slice(0, 3) : [],
    labels,
    other_label: labels.some((l) => l.name === other) ? other : labels[labels.length - 1].name,
    rubric: String(j.rubric ?? '').trim(),
    summary: String(j.summary ?? '').trim(),
    reused_set: reused,
  };
  // Prove the query runs before paying for anything else.
  const probe = await runElayaQuery(`select * from (${plan.fetch_sql}) q limit 3`, 3, 3);
  if (!probe.ok) throw new Error(`The planner’s query failed: ${probe.error}`);
  const cols = Object.keys(probe.rows[0] ?? {});
  if (probe.rows.length && !cols.includes('subject_id')) throw new Error('The planner’s query returns no subject_id');
  if (!plan.text_columns.length) plan.text_columns = cols.filter((c) => c !== 'subject_id').slice(0, 2);
  return plan;
}

/** A refresh job carries its plan in the row (planLabelRefresh wrote it); nothing is planned again. */
function planFromJob(job: ElayaJobRow): DeepReadPlan {
  const p = job.plan;
  const subject = String(p.subject_kind ?? '');
  const labels = Array.isArray(p.labels) ? (p.labels as { name?: unknown; meaning?: unknown }[]).map((l) => ({ name: String(l.name ?? ''), meaning: String(l.meaning ?? '') })).filter((l) => l.name) : [];
  const fetchSql = cleanSql(String(p.fetch_sql ?? ''));
  if (!(ELAYA_LABEL_SUBJECTS as readonly string[]).includes(subject) || labels.length < 2 || !validSql(fetchSql) || typeof p.label_set !== 'string') {
    throw new Error('The refresh job carries no usable plan');
  }
  const refreshRaw = typeof p.refresh_sql === 'string' ? cleanSql(p.refresh_sql) : '';
  const other = typeof p.other_label === 'string' && labels.some((l) => l.name === p.other_label) ? p.other_label : labels[labels.length - 1].name;
  return {
    mode: 'refresh',
    subject_kind: subject as ElayaLabelSubject,
    label_set: p.label_set,
    fetch_sql: fetchSql,
    refresh_sql: refreshRaw && validSql(refreshRaw) ? refreshRaw : null,
    text_columns: Array.isArray(p.text_columns) ? (p.text_columns as unknown[]).map(String) : [],
    breakdown_columns: Array.isArray(p.breakdown_columns) ? (p.breakdown_columns as unknown[]).map(String).slice(0, 3) : [],
    labels,
    other_label: other,
    rubric: typeof p.rubric === 'string' ? p.rubric : '',
    summary: typeof p.summary === 'string' ? p.summary : '',
    reused_set: true,
  };
}

// ── The rows ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { subject_id: string | number };

const TOO_BIG = (n: string) => `That question covers ${n} rows and I read up to ${DEEP_READ_MAX_ROWS.toLocaleString('en-IN')} in one go, so I have not started it. Narrow it (a shorter window, one queendom, one status) and ask again.`;

/** How many distinct subjects the query yields, before any is read. Two steps so a huge table can never
 *  stall here: a BOUNDED count that stops scanning one row past the cap (above it = refused), then the
 *  exact distinct count over a set now known to be small. A count that times out is itself the answer
 *  "too big", and says so in the founder's words rather than the database's. */
async function countSubjects(sql: string): Promise<number> {
  const bounded = await runElayaQuery(`select count(*)::int as n from (select 1 from (${sql}) q limit ${DEEP_READ_MAX_ROWS + 1}) b`, 1, 1);
  if (!bounded.ok) {
    if (/statement timeout|canceling statement/i.test(bounded.error)) throw new DeepReadRefusal(TOO_BIG('more'));
    throw new Error(`Counting the rows failed: ${bounded.error}`);
  }
  if (Number(bounded.rows[0]?.n ?? 0) > DEEP_READ_MAX_ROWS) throw new DeepReadRefusal(TOO_BIG(`more than ${DEEP_READ_MAX_ROWS.toLocaleString('en-IN')}`));
  const exact = await runElayaQuery(`select count(distinct q.subject_id)::int as ids from (${sql}) q`, 1, 1);
  if (!exact.ok) throw new Error(`Counting the rows failed: ${exact.error}`);
  return Number(exact.rows[0]?.ids ?? 0);
}

/** Keyset pages over subject_id until a short page. Rows are de-duplicated on subject_id (a join can
 *  return one subject twice) and a null subject_id is dropped (it can carry no label). */
async function fetchRows(sql: string, onPage: (n: number) => Promise<void>): Promise<{ rows: Row[]; duplicates: number; pages: number }> {
  const seen = new Set<string>();
  const rows: Row[] = [];
  let duplicates = 0;
  let last: string | number | null = null;
  let pages = 0;
  const maxPages = Math.ceil(DEEP_READ_MAX_ROWS / DEEP_READ_PAGE_ROWS) + 1;
  for (; pages < maxPages; pages++) {
    const where = last === null ? '' : ` where q.subject_id > '${String(last).replace(/'/g, "''")}'`;
    const r = await runElayaQuery(`select * from (${sql}) q${where} order by q.subject_id limit ${DEEP_READ_PAGE_ROWS}`, DEEP_READ_PAGE_ROWS, ELAYA_EXPORT_MAX_ROWS);
    if (!r.ok) throw new Error(`Reading the rows failed on page ${pages + 1}: ${r.error}`);
    const page = r.rows as Row[];
    if (page.length === 0) break;
    for (const row of page) {
      if (row.subject_id === null || row.subject_id === undefined) continue;
      const id = String(row.subject_id);
      if (seen.has(id)) { duplicates++; continue; }
      seen.add(id);
      rows.push(row);
    }
    last = page[page.length - 1].subject_id;
    await onPage(rows.length);
    if (page.length < DEEP_READ_PAGE_ROWS) { pages++; break; }
  }
  return { rows, duplicates, pages };
}

function rowText(row: Row, plan: DeepReadPlan): string {
  const parts = plan.text_columns.map((c) => row[c]).filter((v) => v !== null && v !== undefined && String(v).trim()).map((v) => String(v).replace(/\s+/g, ' ').trim());
  return parts.join(' | ').slice(0, DEEP_READ_ROW_TEXT_CAP);
}

// ── The rate gate ────────────────────────────────────────────────────────────
// The provider's "slow down" (429) or "overloaded" (529) pauses EVERY worker, not just the one that
// heard it, for the provider's retry-after or a doubling pause; a good reply halves the pause back.
// A rate limit never fails a batch on its own: the batch waits and asks again, up to
// DEEP_READ_RATE_RETRIES times, inside the job's deadline. Live Elaya chats share the account, so
// a job that keeps hammering would take the founders' own replies down with it.

function createRateGate() {
  let pausedUntil = 0;
  let pauseMs = DEEP_READ_RATE_PAUSE_MS;
  let hits = 0;
  return {
    async wait(deadline: number) {
      const d = Math.min(pausedUntil, deadline) - Date.now();
      if (d > 0) await sleep(d);
    },
    hit(retryAfterMs?: number) {
      const ms = Math.max(retryAfterMs ?? 0, pauseMs);
      pausedUntil = Math.max(pausedUntil, Date.now() + ms);
      pauseMs = Math.min(pauseMs * 2, DEEP_READ_RATE_PAUSE_MAX_MS);
      hits++;
    },
    ok() { pauseMs = Math.max(DEEP_READ_RATE_PAUSE_MS, Math.floor(pauseMs / 2)); },
    get hits() { return hits; },
  };
}

function errStatus(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
}

function isRateLimited(e: unknown): boolean {
  const s = errStatus(e);
  if (s === 429 || s === 529 || s === 503) return true;
  return /rate.?limit|overloaded|too many requests/i.test(e instanceof Error ? e.message : String(e));
}

function retryAfterMs(e: unknown): number | undefined {
  const h = (e as { headers?: unknown } | null)?.headers;
  let v: unknown;
  if (h && typeof (h as { get?: unknown }).get === 'function') v = (h as { get: (k: string) => string | null }).get('retry-after');
  else if (h && typeof h === 'object') v = (h as Record<string, unknown>)['retry-after'];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * 1000 : undefined;
}

// ── The judge ────────────────────────────────────────────────────────────────

function labelSystem(plan: DeepReadPlan): string {
  const otherIndex = Math.max(0, plan.labels.findIndex((l) => l.name === plan.other_label));
  return `You label rows for Indulge, a luxury concierge service, for one question: ${plan.summary || plan.label_set}.

Labels (answer with the letter):
${plan.labels.map((l, i) => `${LETTERS[i]}. ${l.name} - ${l.meaning}`).join('\n')}

Rules for the hard cases:
${plan.rubric || '- Judge what the row is really about, not the words in it.'}
- When nothing fits, answer ${LETTERS[otherIndex]} (${plan.other_label}).

Each input line is one row: its number, a bar, its text. Answer with exactly one line per row given, in the order given: the row's number, one space, one letter. Nothing else, no explanations.`;
}

type JudgeCtx = {
  system: string;
  letterToName: Map<string, string>;
  depth: Awaited<ReturnType<typeof getPiiMaskingDepth>>;
  tokens: { in: number; out: number };
  gate: ReturnType<typeof createRateGate>;
  deadline: number;
  counters: { format_retries: number };
};

/** Judge one batch. A row the reply skipped is asked again (only that row, same number); a rate limit
 *  pauses through the gate and asks again; any other failure retries with a short back-off. */
async function judgeBatch(ctx: JudgeCtx, items: { n: number; text: string }[], tries = { format: 0, rate: 0 }): Promise<Map<number, string>> {
  if (Date.now() > ctx.deadline || items.length === 0) return new Map();
  await ctx.gate.wait(ctx.deadline);
  const llm = await resolveLlmForJob('routing');
  const user = items.map((b) => `${b.n}|${maskPii(b.text, ctx.depth)}`).join('\n');
  let text: string;
  try {
    const r = await llm.adapter.complete({ model: llm.model, maxTokens: 1800, effort: 'low', timeoutMs: 60_000, cachePrefix: true, system: ctx.system, messages: [{ role: 'user', content: user }] });
    ctx.tokens.in += r.usage.inputTokens;
    ctx.tokens.out += r.usage.outputTokens;
    ctx.gate.ok();
    text = r.text;
  } catch (e) {
    if (isRateLimited(e)) {
      if (tries.rate < DEEP_READ_RATE_RETRIES && Date.now() < ctx.deadline) {
        ctx.gate.hit(retryAfterMs(e));
        return judgeBatch(ctx, items, { ...tries, rate: tries.rate + 1 });
      }
      console.error(`${LOG} batch gave up after ${tries.rate} rate-limit pauses`);
      return new Map();
    }
    if (tries.format < DEEP_READ_BATCH_RETRIES) {
      await sleep(1500 * (tries.format + 1));
      return judgeBatch(ctx, items, { ...tries, format: tries.format + 1 });
    }
    console.error(`${LOG} batch failed after retries:`, e instanceof Error ? e.message : e);
    return new Map();
  }
  const out = new Map<number, string>();
  const wanted = new Set(items.map((i) => i.n));
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d+)[\s:.\-|)]*([A-Za-z])$/);
    if (!m) continue;
    const n = Number(m[1]);
    const name = ctx.letterToName.get(m[2].toUpperCase());
    if (wanted.has(n) && name && !out.has(n)) out.set(n, name);
  }
  const missing = items.filter((i) => !out.has(i.n));
  if (missing.length && tries.format < DEEP_READ_BATCH_RETRIES) {
    ctx.counters.format_retries++;
    const more = await judgeBatch(ctx, missing, { ...tries, format: tries.format + 1 });
    for (const [k, v] of more) out.set(k, v);
  }
  return out;
}

// ── The answer ───────────────────────────────────────────────────────────────

const ANSWER_SYSTEM = `You are Elaya, the analyst inside Indulge's operating system, reporting the result of a deep read you just finished: every relevant row was read and labelled, then counted. Write the answer for the founder who asked, in plain English, complete and specific, for WhatsApp: lead with the number that answers the question and its share, then the breakdown, then two or three things worth their eye, with names or examples from the samples. Then ONE line "How I worked it out": what was read, over which window, how many rows, the labels; when reused_rows is above 0, say those rows kept the verdict of an earlier read (same labels, same rule) and only judged_now rows were read fresh. Then one line saying the labels are saved under the set name and new rows are labelled every night, so "count them by month / by queendom / this week" is a quick question from now on. Bold labels are fine; no headings, no tables, no emojis. Every number comes from the stats given; never estimate. Trust line, last, only when needed: if coverage_pct is below 100 or unjudged is above 1% of total_rows, say in one plain sentence what share was not read or not judged.`;

async function writeAnswer(question: string, plan: DeepReadPlan, stats: Record<string, unknown>, samples: Record<string, string[]>, tokens: { in: number; out: number }): Promise<string> {
  const llm = await resolveLlmForJob('reasoning');
  const r = await llm.adapter.complete({
    model: llm.model,
    maxTokens: 2500,
    effort: 'low',
    timeoutMs: 120_000,
    system: ANSWER_SYSTEM,
    messages: [{ role: 'user', content: `The question:\n${question}\n\nWhat was counted: ${plan.summary}\nLabel set: ${plan.label_set}\nLabels:\n${plan.labels.map((l) => `- ${l.name}: ${l.meaning}`).join('\n')}\n\nStats:\n${JSON.stringify(stats)}\n\nSample rows per label (text as read):\n${JSON.stringify(samples)}` }],
  });
  tokens.in += r.usage.inputTokens;
  tokens.out += r.usage.outputTokens;
  return r.text.trim();
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function deliver(job: ElayaJobRow, text: string, meta: Record<string, unknown>): Promise<Record<string, unknown>> {
  const delivered: Record<string, unknown> = {};
  if (job.conversation_id) {
    const row = await insertAssistantMessage({ conversationId: job.conversation_id, content: text, toolCalls: [], meta: { brain: 'deep_read', ...meta }, channel: job.channel });
    delivered.conversation_message_id = row?.id ?? null;
  }
  if (job.channel === 'whatsapp') {
    const { data } = await createAdminClient().from('profiles').select('phone').eq('id', job.requested_by).maybeSingle();
    const phone = (data as { phone: string | null } | null)?.phone ?? null;
    if (phone) {
      const parts = splitWhatsAppText(markdownToWhatsApp(text), WA_PART_CHARS);
      let sent = 0;
      for (const part of parts) if (await sendElayaWhatsAppReply(phone, part, job.requested_by)) sent++;
      delivered.whatsapp = { parts: parts.length, sent };
    } else {
      delivered.whatsapp = 'no_phone';
    }
  }
  const { error } = await createNotification({
    recipient_id: job.requested_by,
    type: 'system',
    action_url: '/elaya',
    title: 'Elaya finished reading',
    body: text.replace(/\*/g, '').split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 240),
  });
  delivered.in_app = !error;
  return delivered;
}

// ── The job ──────────────────────────────────────────────────────────────────

/** Rough provider list prices, dollars per million tokens, for the ledger's cost estimate only. */
const COST_PER_M: Record<string, [number, number]> = { haiku: [1, 5], sonnet: [3, 15], opus: [15, 75] };
function estimateCost(model: string, tokens: { in: number; out: number }): number {
  const key = Object.keys(COST_PER_M).find((k) => model.includes(k)) ?? 'sonnet';
  const [i, o] = COST_PER_M[key];
  return (tokens.in / 1e6) * i + (tokens.out / 1e6) * o;
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0);

export async function runDeepRead(jobId: string): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const job = await getElayaJob(jobId);
  if (!job) return { ok: false, error: 'no such job' };
  if (job.status !== 'queued') return { ok: false, error: `job is ${job.status}` };
  const started = Date.now();
  const deadline = started + DEEP_READ_MAX_MINUTES * 60_000;
  const admin = createAdminClient();
  const judgeTokens = { in: 0, out: 0 };
  const planTokens = { in: 0, out: 0 };
  const timings: Record<string, number> = {};
  const isRefresh = job.plan.mode === 'refresh';
  await advanceElayaJob(jobId, 'running');

  // One ledger row per job (the profiler's posture: every background read is a run).
  const { data: runRow } = await admin.schema('sia').from('extraction_runs').insert({
    kind: DEEP_READ_RUN_KIND, prompt_version: DEEP_READ_LABEL_PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { job_id: jobId, mode: isRefresh ? 'refresh' : 'answer', question: job.question.slice(0, 500), plan_prompt: DEEP_READ_PLAN_PROMPT_VERSION, answer_prompt: DEEP_READ_ANSWER_PROMPT_VERSION },
  }).select('id').single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finishRun = async (ok: boolean, patch: Record<string, unknown>) => {
    if (!runId) return;
    await admin.schema('sia').from('extraction_runs').update({ ok, finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  };
  const progress: Record<string, unknown> = { stage: 'planning' };
  const ping = async (patch: Record<string, unknown>) => { Object.assign(progress, patch, { timings_ms: timings }); await updateElayaJobProgress(jobId, progress); };

  try {
    // 1. The plan: a saved set is reused when the question is the same; a refresh brings its own.
    let t = Date.now();
    const plan = isRefresh ? planFromJob(job) : await planDeepRead(job.question, await listLabelSets(), planTokens);
    timings.plan = Date.now() - t;
    await updateElayaJobProgress(jobId, { ...progress, stage: 'counting', timings_ms: timings }, plan as unknown as Record<string, unknown>);

    // 2. Count first: nothing is paid for until the size is known, and a set above the cap is refused, never cut.
    t = Date.now();
    const sql = isRefresh && plan.refresh_sql ? plan.refresh_sql : plan.fetch_sql;
    const expected = { ids: await countSubjects(sql) };
    timings.count = Date.now() - t;
    if (expected.ids === 0 && !isRefresh) throw new DeepReadRefusal('That question matched no rows at all in the window you gave, so there was nothing to read. Widen the window or check the scope and ask again.');

    // 3. Fetch, then prove the read covered what the count said exists.
    t = Date.now();
    const fetched = expected.ids === 0 ? { rows: [] as Row[], duplicates: 0, pages: 0 } : await fetchRows(sql, async (n) => { await ping({ stage: 'reading', rows_read: n, expected_rows: expected.ids }); });
    timings.fetch = Date.now() - t;
    const rows = fetched.rows;
    const coverage = expected.ids ? pct(rows.length, expected.ids) : 100;
    if (coverage < DEEP_READ_COVERAGE_MIN_PCT) {
      throw new Error(`The read covered only ${rows.length.toLocaleString('en-IN')} of ${expected.ids.toLocaleString('en-IN')} rows, so no number was given`);
    }
    if (Date.now() > deadline) throw new Error('Out of time while reading rows');

    // 4. Reuse: a row whose text still matches its saved verdict keeps it; the rest are judged now.
    t = Date.now();
    const allowed = new Set(plan.labels.map((l) => l.name));
    const existing = rows.length ? await getExistingLabels(plan.subject_kind, plan.label_set) : new Map();
    const verdicts = new Map<string, string>();
    const texts = new Map<string, string>();
    const toJudge: Row[] = [];
    for (const row of rows) {
      const id = String(row.subject_id);
      const text = rowText(row, plan);
      texts.set(id, text);
      const prev = existing.get(id);
      if (prev && allowed.has(prev.label) && prev.evidence !== null && prev.evidence === text.slice(0, 200)) verdicts.set(id, prev.label);
      else toJudge.push(row);
    }
    const reusedRows = verdicts.size;
    timings.reuse = Date.now() - t;
    await ping({ stage: 'judging', rows_read: rows.length, expected_rows: expected.ids, reused_rows: reusedRows, to_judge: toJudge.length });

    // 5. Judge in batches, side by side, behind the rate gate; rows are numbered from 1 inside a batch.
    t = Date.now();
    const ctx: JudgeCtx = {
      system: labelSystem(plan),
      letterToName: new Map(plan.labels.map((l, i) => [LETTERS[i], l.name])),
      depth: await getPiiMaskingDepth(),
      tokens: judgeTokens,
      gate: createRateGate(),
      deadline,
      counters: { format_retries: 0 },
    };
    const batches: { n: number; text: string; row: Row }[][] = [];
    for (let i = 0; i < toJudge.length; i += DEEP_READ_BATCH_ROWS) {
      batches.push(toJudge.slice(i, i + DEEP_READ_BATCH_ROWS).map((row, k) => ({ n: k + 1, text: texts.get(String(row.subject_id)) ?? '', row })));
    }
    let done = 0;
    let unjudged = 0;
    const judgedNow: ElayaLabelInput[] = [];
    await mapWithConcurrency(batches, DEEP_READ_PARALLEL_CALLS, async (b) => {
      if (Date.now() > deadline) { unjudged += b.length; return; }
      const out = await judgeBatch(ctx, b.map(({ n, text }) => ({ n, text })));
      for (const it of b) {
        const v = out.get(it.n);
        const id = String(it.row.subject_id);
        if (v) {
          verdicts.set(id, v);
          judgedNow.push({ subjectKind: plan.subject_kind, subjectId: id, labelSet: plan.label_set, label: v, evidence: it.text });
        } else {
          unjudged++;
        }
      }
      done++;
      if (done % 10 === 0) await ping({ batches_done: done, batches: batches.length, unjudged, rate_limit_hits: ctx.gate.hits });
    });
    timings.judge = Date.now() - t;

    // 6. Write back what was decided now (the reused rows are already on record).
    t = Date.now();
    const written = judgedNow.length ? await upsertElayaLabels(jobId, judgedNow) : { written: 0, failed: 0 };
    timings.labels = Date.now() - t;

    const total = rows.length;
    const unjudgedPct = pct(unjudged, total);
    if (!isRefresh && unjudgedPct > DEEP_READ_MAX_UNJUDGED_PCT) {
      throw new Error(`${unjudgedPct}% of the rows could not be judged (the model kept failing), so no number was given. Ask again in a few minutes`);
    }

    // 7. Aggregate in code (the judged set is in memory; no second pass over the database).
    const byLabel: Record<string, number> = {};
    const byBreakdown: Record<string, Record<string, Record<string, number>>> = {};
    const samples: Record<string, string[]> = {};
    for (const row of rows) {
      const id = String(row.subject_id);
      const v = verdicts.get(id) ?? 'unjudged';
      byLabel[v] = (byLabel[v] ?? 0) + 1;
      if (v !== 'unjudged' && v !== plan.other_label && (samples[v] ??= []).length < DEEP_READ_ANSWER_SAMPLES_PER_LABEL) samples[v].push((texts.get(id) ?? '').slice(0, 120));
      for (const col of plan.breakdown_columns) {
        const key = String(row[col] ?? '(none)');
        ((byBreakdown[col] ??= {})[key] ??= {})[v] = (byBreakdown[col][key][v] ?? 0) + 1;
      }
    }
    const inScope = Object.entries(byLabel).filter(([k]) => k !== plan.other_label && k !== 'unjudged').reduce((a, [, n]) => a + n, 0);
    const stats = {
      total_rows: total,
      expected_rows: expected.ids,
      coverage_pct: coverage,
      duplicate_rows: fetched.duplicates,
      matched_rows: inScope,
      matched_share_pct: pct(inScope, total),
      by_label: Object.fromEntries(Object.entries(byLabel).map(([k, n]) => [k, { count: n, share_pct: pct(n, total) }])),
      by_breakdown: byBreakdown,
      reused_rows: reusedRows,
      judged_now: judgedNow.length,
      unjudged,
      unjudged_pct: unjudgedPct,
      labels_saved: written.written,
      labels_failed: written.failed,
      label_set: plan.label_set,
      subject_kind: plan.subject_kind,
      reused_set: plan.reused_set,
      rate_limit_hits: ctx.gate.hits,
      format_retries: ctx.counters.format_retries,
      minutes: Math.round((Date.now() - started) / 6000) / 10,
      timings_ms: timings,
    };

    // 8. The answer and its delivery (an answer job only; a refresh has nobody waiting).
    let answer: string | null = null;
    let delivered: Record<string, unknown> = {};
    if (!isRefresh) {
      t = Date.now();
      answer = await writeAnswer(job.question, plan, stats, samples, planTokens);
      timings.answer = Date.now() - t;
      t = Date.now();
      delivered = await deliver(job, answer, { jobId, labelSet: plan.label_set, rows: total });
      timings.deliver = Date.now() - t;
    }
    stats.minutes = Math.round((Date.now() - started) / 6000) / 10;
    await advanceElayaJob(jobId, 'done', {
      result: { stats, delivered } as Record<string, unknown>,
      answer,
      progress: { stage: 'done', rows_read: total, expected_rows: expected.ids, reused_rows: reusedRows, batches_done: done, batches: batches.length, unjudged, rate_limit_hits: ctx.gate.hits, timings_ms: timings },
    });
    const routing = await resolveLlmForJob('routing');
    const reasoning = await resolveLlmForJob('reasoning');
    await finishRun(true, {
      tokens_in: judgeTokens.in + planTokens.in, tokens_out: judgeTokens.out + planTokens.out,
      cost_usd: Math.round((estimateCost(routing.model, judgeTokens) + estimateCost(reasoning.model, planTokens)) * 100000) / 100000,
      output: { mode: plan.mode, label_set: plan.label_set, rows: total, reused: reusedRows, judged_now: judgedNow.length, by_label: byLabel, unjudged, rate_limit_hits: ctx.gate.hits, delivered, timings_ms: timings },
    });
    console.log(LOG, 'done', JSON.stringify({ jobId, mode: plan.mode, rows: total, reused: reusedRows, judged: judgedNow.length, labels: byLabel, seconds: Math.round((Date.now() - started) / 1000), timings }));
    return { ok: true, rows: total };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG} job ${jobId} failed:`, message);
    await advanceElayaJob(jobId, 'failed', { error: message.slice(0, 500), progress: { ...progress, stage: 'failed', timings_ms: timings } });
    await finishRun(false, { error: message.slice(0, 500), tokens_in: judgeTokens.in + planTokens.in, tokens_out: judgeTokens.out + planTokens.out });
    if (!isRefresh) {
      const line = e instanceof DeepReadRefusal
        ? message
        : `I could not finish that read: ${message.split('\n')[0].slice(0, 220)}. Ask me again with a narrower window or a clearer rule, or ask the tech team if it keeps happening.`;
      try {
        await deliver(job, line, { jobId, failed: true });
      } catch (d) {
        console.error(`${LOG} failure line not delivered:`, d instanceof Error ? d.message : d);
      }
    }
    return { ok: false, error: message };
  }
}

// ── The nightly top-up ───────────────────────────────────────────────────────

/** Queue one refresh job per label set a person asked about lately, carrying the set's own plan.
 *  Nothing is judged twice (the reuse step skips every row still matching its verdict), so a night
 *  costs a few calls per set. The caller fires the runs (src/trigger/elaya-labels-refresh.ts). */
export async function planLabelRefresh(opts: { days?: number; maxSets?: number } = {}): Promise<{ jobIds: string[]; skipped: { label_set: string; reason: string }[] }> {
  const days = opts.days ?? LABELS_REFRESH_DAYS;
  const max = opts.maxSets ?? LABELS_REFRESH_MAX_SETS;
  const since = Date.now() - days * 86_400_000;
  const [sets, active] = await Promise.all([listLabelSets(), getActiveLabelSets()]);
  const jobIds: string[] = [];
  const skipped: { label_set: string; reason: string }[] = [];
  for (const s of sets) {
    if (jobIds.length >= max) break;
    if (!s.last_asked_at || new Date(s.last_asked_at).getTime() < since) { skipped.push({ label_set: s.label_set, reason: 'not asked lately' }); continue; }
    if (active.has(s.label_set)) { skipped.push({ label_set: s.label_set, reason: 'a job is running' }); continue; }
    if (!s.fetch_sql || s.labels.length < 2 || !s.requested_by) { skipped.push({ label_set: s.label_set, reason: 'no plan on record' }); continue; }
    const plan = {
      mode: 'refresh' satisfies DeepReadMode,
      subject_kind: s.subject_kind,
      label_set: s.label_set,
      fetch_sql: s.fetch_sql,
      refresh_sql: s.refresh_sql,
      text_columns: s.text_columns,
      breakdown_columns: s.breakdown_columns,
      labels: s.labels,
      other_label: s.other_label ?? s.labels[s.labels.length - 1].name,
      rubric: s.rubric ?? '',
      summary: s.summary ?? '',
    };
    const job = await createElayaJob({ kind: 'deep_read', requestedBy: s.requested_by, conversationId: null, channel: 'in_app', question: `Refresh the labels of ${s.label_set}`, plan });
    if (job) jobIds.push(job.id); else skipped.push({ label_set: s.label_set, reason: 'job not created' });
  }
  return { jobIds, skipped };
}
