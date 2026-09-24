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
import type { Json } from '@/lib/types/database';
import type { ElayaChannel } from '@/lib/types/elaya';
import type { ElayaJobKind, ElayaJobStatus, ElayaLabelSubject } from '@/lib/constants/elaya-jobs';

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

/** Move a job forward. `patch` carries whichever of plan / progress / result / answer / error apply. */
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

/** The jobs a person asked for lately (their own; admin/founder pass no filter to see all). */
export async function listRecentElayaJobs(requestedBy: string | null, limit = 10): Promise<ElayaJobRow[]> {
  let q = admin().from('elaya_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (requestedBy) q = q.eq('requested_by', requestedBy);
  const { data } = await q;
  return mapRows<ElayaJobRow, ElayaJobRow>(data, (r) => r);
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

/** How a label set is distributed (the one-second answer the next time the question is asked). */
export async function countElayaLabels(labelSet: string): Promise<{ label: string; count: number }[]> {
  const { data, error } = await admin().from('elaya_labels').select('label').eq('label_set', labelSet).limit(100_000);
  if (error) return [];
  const tally = new Map<string, number>();
  mapRows<{ label: string }, void>(data, (r) => { tally.set(r.label, (tally.get(r.label) ?? 0) + 1); });
  return [...tally.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
