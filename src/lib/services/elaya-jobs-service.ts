// elaya-jobs-service.ts — THE elaya_jobs + elaya_labels access (migration 0235). Admin client
// throughout: a job is created by a chat turn (any channel, sessionless on WhatsApp) and advanced
// by a Trigger.dev task; the caller gates (the write tool checks the principal, the task trusts the
// row it was handed). No `server-only` chain: it runs from Trigger.dev.
//
// Posture: a job row is written by the service role only and moves forward only
// (queued → running → done | failed). Labels are UPSERTED on (subject_kind, subject_id, label_set):
// a re-read of the same question replaces its verdicts, it never stacks them.

import { createAdminClient } from '@/lib/supabase/admin';
import { mapRows } from '@/lib/utils/rows';
import { runElayaQuery } from '@/lib/services/elaya-query-service';
import type { Json } from '@/lib/types/database';
import type { ElayaChannel } from '@/lib/types/elaya';
import { ELAYA_LABEL_SUBJECTS, type ElayaJobKind, type ElayaJobStatus, type ElayaLabelSubject } from '@/lib/constants/elaya-jobs';

export type ElayaJobRow = {
  id: string;
  kind: ElayaJobKind;
  status: ElayaJobStatus;
  requested_by: string;
  conversation_id: string | null;
  channel: ElayaChannel;
  question: string;
  plan: Record<string, unknown>;
  progress: Record<string, unknown>;
  result: Record<string, unknown> | null;
  answer: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0235 is not in the generated types until the next regen
const admin = () => createAdminClient() as any;

export async function createElayaJob(input: {
  kind: ElayaJobKind;
  requestedBy: string;
  conversationId: string | null;
  channel: ElayaChannel;
  question: string;
  plan?: Record<string, unknown>;
}): Promise<ElayaJobRow | null> {
  const { data, error } = await admin()
    .from('elaya_jobs')
    .insert({
      kind: input.kind,
      requested_by: input.requestedBy,
      conversation_id: input.conversationId,
      channel: input.channel,
      question: input.question,
      plan: (input.plan ?? {}) as Json,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[elaya-jobs] create failed:', error.message);
    return null;
  }
  return data as ElayaJobRow;
}

export async function getElayaJob(jobId: string): Promise<ElayaJobRow | null> {
  const { data, error } = await admin().from('elaya_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) {
    console.error('[elaya-jobs] read failed:', error.message);
    return null;
  }
  return (data as ElayaJobRow | null) ?? null;
}

/** Move a job forward. `patch` carries whichever of plan / progress / result / answer / error apply.
 *  Call it ONCE per status: `running` stamps started_at, `done` / `failed` stamp finished_at. A
 *  progress ping in the middle goes through updateElayaJobProgress, which stamps nothing. */
export async function advanceElayaJob(
  jobId: string,
  status: ElayaJobStatus,
  patch: Partial<Pick<ElayaJobRow, 'plan' | 'progress' | 'result' | 'answer' | 'error'>> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { status, ...patch };
  if (status === 'running') row.started_at = now;
  if (status === 'done' || status === 'failed') row.finished_at = now;
  const { error } = await admin().from('elaya_jobs').update(row).eq('id', jobId);
  if (error) console.error('[elaya-jobs] advance failed:', error.message);
}

/** A running job's progress (rows read, batches done, stage timings). Touches no timestamp and no status. */
export async function updateElayaJobProgress(jobId: string, progress: Record<string, unknown>, plan?: Record<string, unknown>): Promise<void> {
  const row: Record<string, unknown> = { progress };
  if (plan) row.plan = plan;
  const { error } = await admin().from('elaya_jobs').update(row).eq('id', jobId);
  if (error) console.error('[elaya-jobs] progress update failed:', error.message);
}

/** The jobs a person asked for lately (their own; admin/founder pass no filter to see all). */
export async function listRecentElayaJobs(requestedBy: string | null, limit = 10): Promise<ElayaJobRow[]> {
  let q = admin().from('elaya_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (requestedBy) q = q.eq('requested_by', requestedBy);
  const { data } = await q;
  return mapRows<ElayaJobRow, ElayaJobRow>(data, (r) => r);
}

/** The label sets with a job queued or running right now (the nightly top-up steps around them). */
export async function getActiveLabelSets(): Promise<Set<string>> {
  const { data } = await admin().from('elaya_jobs').select('plan').in('status', ['queued', 'running']).limit(200);
  const out = new Set<string>();
  mapRows<{ plan: Record<string, unknown> }, void>(data, (r) => {
    if (typeof r.plan?.label_set === 'string') out.add(r.plan.label_set as string);
  });
  return out;
}

export type ElayaLabelInput = {
  subjectKind: ElayaLabelSubject;
  subjectId: string;
  labelSet: string;
  label: string;
  confidence?: number | null;
  evidence?: string | null;
};

/** Upsert labels in chunks; a re-read replaces the previous verdict for the same subject and set. */
export async function upsertElayaLabels(jobId: string, labels: ElayaLabelInput[]): Promise<{ written: number; failed: number }> {
  let written = 0;
  let failed = 0;
  for (let i = 0; i < labels.length; i += 500) {
    const chunk = labels.slice(i, i + 500).map((l) => ({
      job_id: jobId,
      subject_kind: l.subjectKind,
      subject_id: l.subjectId,
      label_set: l.labelSet,
      label: l.label,
      confidence: l.confidence ?? null,
      evidence: l.evidence ? l.evidence.slice(0, 400) : null,
    }));
    const { error } = await admin().from('elaya_labels').upsert(chunk, { onConflict: 'subject_kind,subject_id,label_set' });
    if (error) {
      console.error('[elaya-jobs] labels upsert failed:', error.message);
      failed += chunk.length;
    } else {
      written += chunk.length;
    }
  }
  return { written, failed };
}

const sqlLit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** How a label set is distributed (the one-second answer the next time the question is asked).
 *  Counted in SQL through the read-only door: a plain select would stop at PostgREST's 1,000-row
 *  response cap and call that the total. */
export async function countElayaLabels(labelSet: string): Promise<{ label: string; count: number }[]> {
  const r = await runElayaQuery(`select label, count(*)::int as n from labels where label_set = ${sqlLit(labelSet)} group by label order by n desc`, 100);
  if (!r.ok) return [];
  return r.rows.map((row) => ({ label: String(row.label), count: Number(row.n) }));
}

export type ExistingLabel = { label: string; evidence: string | null };

/** Every saved verdict of one set, keyed by subject id, with the FULL evidence text (the door's view
 *  clips evidence at 200 characters, so this reads the table through the admin client in keyset pages
 *  under PostgREST's 1,000-row response cap). The deep read compares each row's whole text with the
 *  evidence its verdict rested on and re-judges anything that changed. */
export async function getExistingLabels(subjectKind: ElayaLabelSubject, labelSet: string): Promise<Map<string, ExistingLabel>> {
  const out = new Map<string, ExistingLabel>();
  const PAGE = 1000;
  let last: string | null = null;
  for (;;) {
    let q = admin().from('elaya_labels').select('id, subject_id, label, evidence').eq('subject_kind', subjectKind).eq('label_set', labelSet).order('id').limit(PAGE);
    if (last) q = q.gt('id', last);
    const { data, error } = await q;
    if (error) throw new Error(`Reading the saved labels failed: ${error.message}`);
    const rows = mapRows<{ id: string; subject_id: string; label: string; evidence: string | null }, { id: string; subject_id: string; label: string; evidence: string | null }>(data, (r) => r);
    for (const row of rows) out.set(row.subject_id, { label: row.label, evidence: row.evidence });
    if (rows.length < PAGE) break;
    last = rows[rows.length - 1].id;
  }
  return out;
}

export type ElayaLabelSetSummary = {
  label_set: string;
  subject_kind: ElayaLabelSubject;
  rows: number;
  first_at: string;
  last_at: string;
  /** From the latest finished ANSWER job that used the set (a refresh carries the same plan). */
  summary: string | null;
  labels: { name: string; meaning: string }[];
  rubric: string | null;
  fetch_sql: string | null;
  refresh_sql: string | null;
  text_columns: string[];
  breakdown_columns: string[];
  other_label: string | null;
  last_job_id: string | null;
  last_asked_at: string | null;
  requested_by: string | null;
  question: string | null;
};

/** Every label set on record, newest first, with the plan that made it: the planner reuses these
 *  so the same question keeps the same labels, describe_database lists them, the nightly top-up
 *  picks the ones asked about lately. */
export async function listLabelSets(): Promise<ElayaLabelSetSummary[]> {
  const counts = await runElayaQuery(
    'select label_set, subject_kind, count(*)::int as rows, min(created_at) as first_at, max(created_at) as last_at from labels group by label_set, subject_kind order by max(created_at) desc limit 100',
    100,
  );
  if (!counts.ok) {
    console.error('[elaya-jobs] label sets read failed:', counts.error);
    return [];
  }
  // The latest finished job per set, preferring the one a person asked (its plan carries the question).
  const { data } = await admin().from('elaya_jobs').select('id, requested_by, question, plan, created_at').eq('status', 'done').order('created_at', { ascending: false }).limit(400);
  type JobLite = { id: string; requested_by: string; question: string; plan: Record<string, unknown>; created_at: string };
  const latest = new Map<string, JobLite>();
  const latestAsked = new Map<string, JobLite>();
  mapRows<JobLite, void>(data, (j) => {
    const set = typeof j.plan?.label_set === 'string' ? (j.plan.label_set as string) : null;
    if (!set) return;
    if (!latest.has(set)) latest.set(set, j);
    if (j.plan.mode !== 'refresh' && !latestAsked.has(set)) latestAsked.set(set, j);
  });
  return counts.rows.map((row) => {
    const set = String(row.label_set);
    const job = latestAsked.get(set) ?? latest.get(set) ?? null;
    const plan = job?.plan ?? {};
    const labels = Array.isArray(plan.labels)
      ? (plan.labels as { name?: unknown; meaning?: unknown }[]).map((l) => ({ name: String(l.name ?? ''), meaning: String(l.meaning ?? '') })).filter((l) => l.name)
      : [];
    const kind = String(row.subject_kind);
    return {
      label_set: set,
      subject_kind: ((ELAYA_LABEL_SUBJECTS as readonly string[]).includes(kind) ? kind : 'freshdesk_ticket') as ElayaLabelSubject,
      rows: Number(row.rows),
      first_at: String(row.first_at),
      last_at: String(row.last_at),
      summary: typeof plan.summary === 'string' ? plan.summary : null,
      labels,
      rubric: typeof plan.rubric === 'string' ? plan.rubric : null,
      fetch_sql: typeof plan.fetch_sql === 'string' ? plan.fetch_sql : null,
      refresh_sql: typeof plan.refresh_sql === 'string' ? plan.refresh_sql : null,
      text_columns: Array.isArray(plan.text_columns) ? (plan.text_columns as unknown[]).map(String) : [],
      breakdown_columns: Array.isArray(plan.breakdown_columns) ? (plan.breakdown_columns as unknown[]).map(String) : [],
      other_label: typeof plan.other_label === 'string' ? plan.other_label : null,
      last_job_id: job?.id ?? null,
      last_asked_at: latestAsked.get(set)?.created_at ?? null,
      requested_by: job?.requested_by ?? null,
      question: latestAsked.get(set)?.question ?? null,
    };
  });
}
