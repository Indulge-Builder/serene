// elaya-deep-read.ts — THE deep read (migration 0235, 2026-09-24): the question a chat turn cannot
// answer in a minute, because the answer is not in any column and something has to READ thousands
// of rows and judge each one ("how many tickets are health and wellness", "who sounds unhappy this
// month"). A turn queues a job (write tool start_deep_read); this runs it from Trigger.dev:
//
//   plan (reasoning tier: which rows, which labels, what rule) → fetch (the read-only query door,
//   paged) → judge (routing tier, 100 rows a call, side by side) → labels written back
//   (elaya_labels, so the next question counts in one second) → aggregate → answer (reasoning tier)
//   → delivered on the channel it was asked on (the conversation, WhatsApp, the in-app inbox).
//
// Every model call goes through the Elaya provider and maskPii; every row read comes through
// elaya_read.run(), so the job can see nothing the analyst tool cannot. One sia.extraction_runs row
// per job carries tokens and the estimated cost. No `server-only` chain: it runs from Trigger.dev.

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveLlmForJob } from '@/lib/elaya/registry';
import { maskPii } from '@/lib/elaya/pii';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import { runElayaQuery, getElayaCatalog, ELAYA_EXPORT_MAX_ROWS } from '@/lib/services/elaya-query-service';
import { getElayaJob, advanceElayaJob, upsertElayaLabels, type ElayaLabelInput } from '@/lib/services/elaya-jobs-service';
import { insertAssistantMessage } from '@/lib/services/elaya-service';
import { sendElayaWhatsAppReply } from '@/lib/services/whatsapp-api';
import { createNotification } from '@/lib/services/notifications-service';
import { markdownToWhatsApp, splitWhatsAppText } from '@/lib/utils/whatsapp-format';
import { mapWithConcurrency } from '@/lib/utils/concurrency';

import {
  DEEP_READ_ANSWER_PROMPT_VERSION, DEEP_READ_ANSWER_SAMPLES_PER_LABEL, DEEP_READ_BATCH_RETRIES, DEEP_READ_BATCH_ROWS,
  DEEP_READ_LABEL_PROMPT_VERSION, DEEP_READ_MAX_LABELS, DEEP_READ_MAX_MINUTES, DEEP_READ_MAX_ROWS, DEEP_READ_PAGE_ROWS,
  DEEP_READ_PARALLEL_CALLS, DEEP_READ_PLAN_PROMPT_VERSION, DEEP_READ_ROW_TEXT_CAP, DEEP_READ_RUN_KIND, ELAYA_LABEL_SUBJECTS,
  type ElayaLabelSubject,
} from '@/lib/constants/elaya-jobs';

const LOG = '[elaya-deep-read]';
const WA_PART_CHARS = 4000;

// ── The plan ─────────────────────────────────────────────────────────────────

type DeepReadPlan = {
  subject_kind: ElayaLabelSubject;
  label_set: string;
  fetch_sql: string;
  text_columns: string[];
  breakdown_columns: string[];
  labels: { name: string; meaning: string }[];
  other_label: string;
  rubric: string;
  summary: string;
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
  "fetch_sql": one PostgreSQL SELECT over the catalog views that returns the rows to judge. It MUST alias the subject's id column as subject_id (${Object.entries(SUBJECT_ID_COLUMNS).map(([k, v]) => `${k}: ${v}`).join('; ')}), MUST include the text column(s) to judge, MAY include a few small columns for the breakdown (a date as (col at time zone 'Asia/Kolkata')::date, a queendom name, a category), MUST NOT contain ORDER BY, LIMIT, a semicolon, a comment or a schema name. Filter to the rows the question is about (a time window when the question gives one; otherwise everything).
  "text_columns": the column names in fetch_sql whose text the judge reads, most telling first,
  "breakdown_columns": up to 3 column names in fetch_sql to count the labels by (e.g. ["queendom", "year"]); [] if none,
  "labels": 2 to ${DEEP_READ_MAX_LABELS} labels, each {"name": snake_case, "meaning": one plain sentence}. Include the "none of these" label (e.g. other) as the LAST one,
  "other_label": the name of that last label,
  "rubric": the rules a careful human would apply to the hard cases, as short lines (what counts, what does not, how to treat a product versus a service, a name that only sounds like the theme, etc.),
  "summary": one sentence saying what will be counted, in the founder's words
}
Rules: judge the REQUEST or the CONTENT, not the words in it. Keep the row set as small as the question allows (a window, a status, a kind). Never invent a view or column: use only what the catalog lists.`;

function extractJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

function cleanSql(sql: string): string {
  return sql.replace(/;+\s*$/g, '').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
}

async function planDeepRead(question: string, tokens: { in: number; out: number }): Promise<DeepReadPlan> {
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
    messages: [{ role: 'user', content: `The founder's question:\n${question}\n\nThe catalog (view — what it holds, then columns; name:type, text when no type):\n${catalogText}` }],
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
  if (!/\bsubject_id\b/i.test(fetchSql) || /\b(order\s+by|limit)\b/i.test(fetchSql)) throw new Error('The planner’s query must alias subject_id and carry no ORDER BY or LIMIT');
  const plan: DeepReadPlan = {
    subject_kind: subject as ElayaLabelSubject,
    label_set: String(j.label_set ?? 'deep_read').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60) || 'deep_read',
    fetch_sql: fetchSql,
    text_columns: Array.isArray(j.text_columns) ? (j.text_columns as unknown[]).map(String) : [],
    breakdown_columns: Array.isArray(j.breakdown_columns) ? (j.breakdown_columns as unknown[]).map(String).slice(0, 3) : [],
    labels,
    other_label: labels.some((l) => l.name === other) ? other : labels[labels.length - 1].name,
    rubric: String(j.rubric ?? '').trim(),
    summary: String(j.summary ?? '').trim(),
  };
  // Prove the query runs before paying for anything else.
  const probe = await runElayaQuery(`select * from (${plan.fetch_sql}) q limit 3`, 3, 3);
  if (!probe.ok) throw new Error(`The planner’s query failed: ${probe.error}`);
  const cols = Object.keys(probe.rows[0] ?? {});
  if (probe.rows.length && !cols.includes('subject_id')) throw new Error('The planner’s query returns no subject_id');
  if (!plan.text_columns.length) plan.text_columns = cols.filter((c) => c !== 'subject_id').slice(0, 2);
  return plan;
}

// ── The rows ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { subject_id: string | number };

async function fetchRows(plan: DeepReadPlan, onPage: (n: number) => Promise<void>): Promise<Row[]> {
  const all: Row[] = [];
  let last: string | number | null = null;
  for (let page = 0; page < Math.ceil(DEEP_READ_MAX_ROWS / DEEP_READ_PAGE_ROWS); page++) {
    const where = last === null ? '' : ` where q.subject_id > '${String(last).replace(/'/g, "''")}'`;
    const r = await runElayaQuery(`select * from (${plan.fetch_sql}) q${where} order by q.subject_id limit ${DEEP_READ_PAGE_ROWS}`, DEEP_READ_PAGE_ROWS, ELAYA_EXPORT_MAX_ROWS);
    if (!r.ok) throw new Error(`Reading the rows failed on page ${page + 1}: ${r.error}`);
    const rows = r.rows as Row[];
    if (rows.length === 0) break;
    all.push(...rows);
    last = rows[rows.length - 1].subject_id;
    await onPage(all.length);
    if (rows.length < DEEP_READ_PAGE_ROWS) break;
  }
  return all;
}

function rowText(row: Row, plan: DeepReadPlan): string {
  const parts = plan.text_columns.map((c) => row[c]).filter((v) => v !== null && v !== undefined && String(v).trim()).map((v) => String(v).replace(/\s+/g, ' ').trim());
  return parts.join(' | ').slice(0, DEEP_READ_ROW_TEXT_CAP);
}

// ── The judge ────────────────────────────────────────────────────────────────

function labelSystem(plan: DeepReadPlan): string {
  return `You label rows for Indulge, a luxury concierge service, for one question: ${plan.summary || plan.label_set}.

Labels:
${plan.labels.map((l) => `${l.name} - ${l.meaning}`).join('\n')}

Rules for the hard cases:
${plan.rubric || '- Judge what the row is really about, not the words in it.'}
- When nothing fits, answer ${plan.other_label}.

Answer with one line per row: its number, one space, one label. Nothing else.`;
}

async function judgeBatch(system: string, batch: { n: number; text: string }[], allowed: Set<string>, other: string, depth: Awaited<ReturnType<typeof getPiiMaskingDepth>>, tokens: { in: number; out: number }, attempt = 0): Promise<Map<number, string>> {
  const llm = await resolveLlmForJob('routing');
  const user = batch.map((b) => `${b.n}|${maskPii(b.text, depth)}`).join('\n');
  try {
    const r = await llm.adapter.complete({ model: llm.model, maxTokens: 1800, timeoutMs: 60_000, cachePrefix: true, system, messages: [{ role: 'user', content: user }] });
    tokens.in += r.usage.inputTokens;
    tokens.out += r.usage.outputTokens;
    const out = new Map<number, string>();
    for (const line of r.text.split('\n')) {
      const m = line.trim().match(/^(\d+)[\s:.\-|]+([a-z0-9_]+)$/i);
      if (m) out.set(Number(m[1]), allowed.has(m[2].toLowerCase()) ? m[2].toLowerCase() : other);
    }
    return out;
  } catch (e) {
    if (attempt < DEEP_READ_BATCH_RETRIES) {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      return judgeBatch(system, batch, allowed, other, depth, tokens, attempt + 1);
    }
    console.error(`${LOG} batch failed after retries:`, e instanceof Error ? e.message : e);
    return new Map();
  }
}

// ── The answer ───────────────────────────────────────────────────────────────

const ANSWER_SYSTEM = `You are Elaya, the analyst inside Indulge's operating system, reporting the result of a deep read you just finished: every relevant row was read and labelled, then counted. Write the answer for the founder who asked, in plain English, complete and specific, for WhatsApp: lead with the number that answers the question and its share, then the breakdown, then two or three things worth their eye, with names or examples from the samples. Then ONE line "How I worked it out": what was read, over which window, how many rows, the labels. Then one line saying the labels are saved under the set name, so "count them by month / by queendom" is now a quick question. Bold labels are fine; no headings, no tables, no emojis. Every number comes from the stats given; never estimate. Mention the share of rows that could not be judged if it is above 1%.`;

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

async function deliver(job: NonNullable<Awaited<ReturnType<typeof getElayaJob>>>, text: string, meta: Record<string, unknown>): Promise<Record<string, unknown>> {
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

export async function runDeepRead(jobId: string): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const job = await getElayaJob(jobId);
  if (!job) return { ok: false, error: 'no such job' };
  if (job.status !== 'queued') return { ok: false, error: `job is ${job.status}` };
  const started = Date.now();
  const deadline = started + DEEP_READ_MAX_MINUTES * 60_000;
  const admin = createAdminClient();
  const judgeTokens = { in: 0, out: 0 };
  const planTokens = { in: 0, out: 0 };
  await advanceElayaJob(jobId, 'running');

  // One ledger row per job (the profiler's posture: every background read is a run).
  const { data: runRow } = await admin.schema('sia').from('extraction_runs').insert({
    kind: DEEP_READ_RUN_KIND, prompt_version: DEEP_READ_LABEL_PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { job_id: jobId, question: job.question.slice(0, 500), plan_prompt: DEEP_READ_PLAN_PROMPT_VERSION, answer_prompt: DEEP_READ_ANSWER_PROMPT_VERSION },
  }).select('id').single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finishRun = async (ok: boolean, patch: Record<string, unknown>) => {
    if (!runId) return;
    await admin.schema('sia').from('extraction_runs').update({ ok, finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  };

  try {
    const plan = await planDeepRead(job.question, planTokens);
    await advanceElayaJob(jobId, 'running', { plan: plan as unknown as Record<string, unknown> });

    const rows = await fetchRows(plan, async (n) => { await advanceElayaJob(jobId, 'running', { progress: { rows_read: n } }); });
    if (rows.length === 0) throw new Error('The plan matched no rows');
    if (Date.now() > deadline) throw new Error('Out of time while reading rows');

    // Judge in batches, side by side; every batch's rows are numbered from 1 inside it.
    const system = labelSystem(plan);
    const allowed = new Set(plan.labels.map((l) => l.name));
    const depth = await getPiiMaskingDepth();
    const batches: { index: number; items: { n: number; text: string; row: Row }[] }[] = [];
    for (let i = 0; i < rows.length; i += DEEP_READ_BATCH_ROWS) {
      batches.push({ index: batches.length, items: rows.slice(i, i + DEEP_READ_BATCH_ROWS).map((row, k) => ({ n: k + 1, text: rowText(row, plan), row })) });
    }
    let done = 0;
    let unjudged = 0;
    const verdicts = new Map<string, string>();
    await mapWithConcurrency(batches, DEEP_READ_PARALLEL_CALLS, async (b) => {
      if (Date.now() > deadline) { unjudged += b.items.length; return; }
      const out = await judgeBatch(system, b.items.map(({ n, text }) => ({ n, text })), allowed, plan.other_label, depth, judgeTokens);
      for (const it of b.items) {
        const v = out.get(it.n);
        if (v) verdicts.set(String(it.row.subject_id), v); else unjudged++;
      }
      done++;
      if (done % 25 === 0) await advanceElayaJob(jobId, 'running', { progress: { rows_read: rows.length, batches_done: done, batches: batches.length, unjudged } });
    });

    // Write back: what was decided stays decided.
    const labelRows: ElayaLabelInput[] = [];
    for (const row of rows) {
      const v = verdicts.get(String(row.subject_id));
      if (!v) continue;
      labelRows.push({ subjectKind: plan.subject_kind, subjectId: String(row.subject_id), labelSet: plan.label_set, label: v, evidence: rowText(row, plan) });
    }
    const written = await upsertElayaLabels(jobId, labelRows);

    // Aggregate in code (the judged set is in memory; no second pass over the database).
    const total = rows.length;
    const byLabel: Record<string, number> = {};
    const byBreakdown: Record<string, Record<string, Record<string, number>>> = {};
    const samples: Record<string, string[]> = {};
    for (const row of rows) {
      const v = verdicts.get(String(row.subject_id)) ?? 'unjudged';
      byLabel[v] = (byLabel[v] ?? 0) + 1;
      if (v !== 'unjudged' && v !== plan.other_label && (samples[v] ??= []).length < DEEP_READ_ANSWER_SAMPLES_PER_LABEL) samples[v].push(rowText(row, plan).slice(0, 120));
      for (const col of plan.breakdown_columns) {
        const key = String(row[col] ?? '(none)');
        ((byBreakdown[col] ??= {})[key] ??= {})[v] = (byBreakdown[col][key][v] ?? 0) + 1;
      }
    }
    const inScope = Object.entries(byLabel).filter(([k]) => k !== plan.other_label && k !== 'unjudged').reduce((a, [, n]) => a + n, 0);
    const stats = {
      total_rows: total,
      matched_rows: inScope,
      matched_share_pct: total ? Math.round((inScope / total) * 1000) / 10 : 0,
      by_label: Object.fromEntries(Object.entries(byLabel).map(([k, n]) => [k, { count: n, share_pct: total ? Math.round((n / total) * 1000) / 10 : 0 }])),
      by_breakdown: byBreakdown,
      unjudged,
      labels_saved: written.written,
      label_set: plan.label_set,
      subject_kind: plan.subject_kind,
      minutes: Math.round((Date.now() - started) / 6000) / 10,
    };

    const answer = await writeAnswer(job.question, plan, stats, samples, planTokens);
    const delivered = await deliver(job, answer, { jobId, labelSet: plan.label_set, rows: total });
    await advanceElayaJob(jobId, 'done', { result: { stats, delivered } as Record<string, unknown>, answer, progress: { rows_read: total, batches_done: done, batches: batches.length, unjudged } });
    const routing = await resolveLlmForJob('routing');
    const reasoning = await resolveLlmForJob('reasoning');
    await finishRun(true, {
      tokens_in: judgeTokens.in + planTokens.in, tokens_out: judgeTokens.out + planTokens.out,
      cost_usd: Math.round((estimateCost(routing.model, judgeTokens) + estimateCost(reasoning.model, planTokens)) * 100000) / 100000,
      output: { label_set: plan.label_set, rows: total, by_label: byLabel, unjudged, delivered },
    });
    console.log(LOG, 'done', JSON.stringify({ jobId, rows: total, labels: byLabel, minutes: stats.minutes }));
    return { ok: true, rows: total };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG} job ${jobId} failed:`, message);
    await advanceElayaJob(jobId, 'failed', { error: message.slice(0, 500) });
    await finishRun(false, { error: message.slice(0, 500), tokens_in: judgeTokens.in + planTokens.in, tokens_out: judgeTokens.out + planTokens.out });
    try {
      await deliver(job, `I could not finish that read: ${message.split('\n')[0].slice(0, 200)}. Ask me again with a narrower window or a clearer rule, or ask the tech team if it keeps happening.`, { jobId, failed: true });
    } catch (d) {
      console.error(`${LOG} failure line not delivered:`, d instanceof Error ? d.message : d);
    }
    return { ok: false, error: message };
  }
}
