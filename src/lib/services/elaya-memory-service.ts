// elaya-memory-service.ts — THE elaya_user_memory + elaya_improvement_requests access (migration
// 0237, 2026-09-25). Admin client for every write and for the prompt folds (a turn runs sessionless
// on WhatsApp); the session client only for the pages, where RLS scopes the rows. No `server-only`
// chain: the reader runs inside the WhatsApp webhook's after() window and the SSE route.
//
// The memory is CONTEXT, never permission (the golden rule of memory.ts, kept): an entry tells Elaya
// how a person wants things, it can never widen what they may see or do. The block is ranked, rules
// and corrections first, and cut at ELAYA_MEMORY_PROMPT_BUDGET_CHARS so it rides the cached prefix.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapRows } from '@/lib/utils/rows';
import type { ElayaChannel } from '@/lib/types/elaya';
import {
  ELAYA_KNOWN_ISSUES_FIXED_DAYS, ELAYA_KNOWN_ISSUES_MAX, ELAYA_KNOWN_ISSUES_OPEN_DAYS, ELAYA_MEMORY_KINDS, ELAYA_MEMORY_KIND_RANK,
  ELAYA_MEMORY_PROMPT_BUDGET_CHARS, ELAYA_MEMORY_STATEMENT_MAX, ELAYA_REQUEST_KINDS,
  type ElayaMemoryKind, type ElayaMemorySource, type ElayaRequestKind, type ElayaRequestStatus,
} from '@/lib/constants/elaya-memory';

export type ElayaMemoryRow = {
  id: string;
  user_id: string;
  kind: ElayaMemoryKind;
  statement: string;
  evidence: string | null;
  source: ElayaMemorySource;
  created_at: string;
  updated_at: string;
  retired_at: string | null;
  retired_by: string | null;
};

export type ElayaImprovementRequestRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  channel: ElayaChannel;
  kind: ElayaRequestKind;
  question: string | null;
  answer: string | null;
  correction: string;
  diagnosis: string | null;
  status: ElayaRequestStatus;
  admin_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  /** Joined for the queue page. */
  requester?: string | null;
};

// 0237 is not in the generated types until the next regen; one loose handle per file (the convention).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const admin = () => createAdminClient() as unknown as Loose;
const LOG = '[elaya-memory-service]';

// ── Memory ───────────────────────────────────────────────────────────────────

/** Every live entry of one user, newest first. Admin client: the brains and the reader call this. */
export async function listUserMemory(userId: string): Promise<ElayaMemoryRow[]> {
  const { data, error } = await admin().from('elaya_user_memory').select('*').eq('user_id', userId).is('retired_at', null).order('updated_at', { ascending: false }).limit(500);
  if (error) { console.error(`${LOG} list failed:`, error.message); return []; }
  return mapRows<ElayaMemoryRow, ElayaMemoryRow>(data, (r) => r);
}

/** The same list on the SESSION client for a page: RLS admits the owner and admin/founder. */
export async function listUserMemoryForPage(userId: string): Promise<ElayaMemoryRow[]> {
  const supabase = (await createClient()) as unknown as Loose;
  const { data, error } = await supabase.from('elaya_user_memory').select('*').eq('user_id', userId).is('retired_at', null).order('updated_at', { ascending: false }).limit(500);
  if (error) { console.error(`${LOG} page list failed:`, error.message); return []; }
  return mapRows<ElayaMemoryRow, ElayaMemoryRow>(data, (r) => r);
}

export type MemoryEntryInput = { kind: ElayaMemoryKind; statement: string; evidence?: string | null; source: ElayaMemorySource };

export async function addMemoryEntryCore(userId: string, input: MemoryEntryInput): Promise<{ data: ElayaMemoryRow | null; error: string | null }> {
  const statement = input.statement.trim().slice(0, ELAYA_MEMORY_STATEMENT_MAX);
  if (statement.length < 3 || !(ELAYA_MEMORY_KINDS as readonly string[]).includes(input.kind)) return { data: null, error: 'That entry is not something Elaya can keep.' };
  const { data, error } = await admin().from('elaya_user_memory').insert({ user_id: userId, kind: input.kind, statement, evidence: input.evidence?.slice(0, 600) ?? null, source: input.source }).select('*').single();
  if (error) { console.error(`${LOG} add failed:`, error.message); return { data: null, error: 'The entry could not be saved just now.' }; }
  return { data: data as ElayaMemoryRow, error: null };
}

/** Retire, never delete: the row stays as the record of what she once believed. */
export async function retireMemoryEntryCore(id: string, by: string | null): Promise<{ error: string | null; userId: string | null }> {
  const { data, error } = await admin().from('elaya_user_memory').update({ retired_at: new Date().toISOString(), retired_by: by }).eq('id', id).is('retired_at', null).select('user_id').maybeSingle();
  if (error) { console.error(`${LOG} retire failed:`, error.message); return { error: 'The entry could not be removed just now.', userId: null }; }
  return { error: null, userId: (data as { user_id: string } | null)?.user_id ?? null };
}

/** The reader's write: new entries in, superseded entries retired, in that order, best effort. */
export async function applyMemoryReading(userId: string, reading: { add: MemoryEntryInput[]; retire: string[] }): Promise<{ added: number; retired: number }> {
  let added = 0;
  for (const e of reading.add) if ((await addMemoryEntryCore(userId, e)).data) added++;
  let retired = 0;
  for (const id of reading.retire) {
    const { error } = await admin().from('elaya_user_memory').update({ retired_at: new Date().toISOString(), retired_by: null }).eq('id', id).eq('user_id', userId).is('retired_at', null);
    if (!error) retired++;
  }
  return { added, retired };
}

/** The prompt block for one user: ranked, budgeted, '' when there is nothing. Both brains fold this. */
export function formatMemoryBlock(entries: ElayaMemoryRow[]): string {
  if (!entries.length) return '';
  const ranked = [...entries].sort((a, b) => (ELAYA_MEMORY_KIND_RANK[a.kind] - ELAYA_MEMORY_KIND_RANK[b.kind]) || (b.updated_at > a.updated_at ? 1 : -1));
  const lines: string[] = [];
  let used = 0;
  for (const e of ranked) {
    const line = `- [${e.kind}] ${e.statement.replace(/\s+/g, ' ').trim()}`;
    if (used + line.length + 1 > ELAYA_MEMORY_PROMPT_BUDGET_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

export async function getMemoryBlock(userId: string): Promise<string> {
  return formatMemoryBlock(await listUserMemory(userId));
}

// ── Improvement requests ─────────────────────────────────────────────────────

export async function createImprovementRequestCore(input: {
  userId: string;
  conversationId: string | null;
  channel: ElayaChannel;
  kind: ElayaRequestKind;
  question: string | null;
  answer: string | null;
  correction: string;
  diagnosis: string | null;
}): Promise<{ data: ElayaImprovementRequestRow | null; error: string | null }> {
  const kind = (ELAYA_REQUEST_KINDS as readonly string[]).includes(input.kind) ? input.kind : 'other';
  const { data, error } = await admin().from('elaya_improvement_requests').insert({
    user_id: input.userId, conversation_id: input.conversationId, channel: input.channel, kind,
    question: input.question?.slice(0, 2000) ?? null, answer: input.answer?.slice(0, 4000) ?? null,
    correction: input.correction.trim().slice(0, 2000), diagnosis: input.diagnosis?.slice(0, 600) ?? null,
  }).select('*').single();
  if (error) { console.error(`${LOG} request insert failed:`, error.message); return { data: null, error: 'The request could not be logged just now.' }; }
  return { data: data as ElayaImprovementRequestRow, error: null };
}

/** The queue for the settings page (SESSION client; RLS: admin/founder see all). Open first, newest first. */
export async function listImprovementRequestsForPage(limit = 200): Promise<ElayaImprovementRequestRow[]> {
  const supabase = (await createClient()) as unknown as Loose;
  const { data, error } = await supabase.from('elaya_improvement_requests').select('*, requester:profiles!elaya_improvement_requests_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error(`${LOG} request list failed:`, error.message); return []; }
  type Raw = Omit<ElayaImprovementRequestRow, 'requester'> & { requester: { full_name: string } | null };
  const rows = mapRows<Raw, ElayaImprovementRequestRow>(data, (r) => ({ ...r, requester: r.requester?.full_name ?? null }));
  return rows.sort((a, b) => (Number(b.status === 'open') - Number(a.status === 'open')) || (b.created_at > a.created_at ? 1 : -1));
}

export async function resolveImprovementRequestCore(id: string, status: ElayaRequestStatus, adminNote: string | null, by: string): Promise<{ error: string | null }> {
  const patch = status === 'open'
    ? { status, admin_note: adminNote, resolved_by: null, resolved_at: null }
    : { status, admin_note: adminNote, resolved_by: by, resolved_at: new Date().toISOString() };
  const { error } = await admin().from('elaya_improvement_requests').update(patch).eq('id', id);
  if (error) { console.error(`${LOG} request resolve failed:`, error.message); return { error: 'The request could not be updated just now.' }; }
  return { error: null };
}

/** Known issues for the prompt: what the team has told Elaya is wrong and is not yet fixed, and what
 *  was just fixed with a note. Company-wide, so every user's turn carries it. '' when none. */
export async function getKnownIssuesBlock(): Promise<string> {
  const openSince = new Date(Date.now() - ELAYA_KNOWN_ISSUES_OPEN_DAYS * 86_400_000).toISOString();
  const fixedSince = new Date(Date.now() - ELAYA_KNOWN_ISSUES_FIXED_DAYS * 86_400_000).toISOString();
  const [open, fixed] = await Promise.all([
    admin().from('elaya_improvement_requests').select('kind, correction, diagnosis, admin_note').eq('status', 'open').gte('created_at', openSince).order('created_at', { ascending: false }).limit(ELAYA_KNOWN_ISSUES_MAX),
    admin().from('elaya_improvement_requests').select('kind, correction, admin_note').eq('status', 'fixed').not('admin_note', 'is', null).gte('resolved_at', fixedSince).order('resolved_at', { ascending: false }).limit(6),
  ]);
  type R = { kind: string; correction: string; diagnosis?: string | null; admin_note: string | null };
  const o = mapRows<R, string>(open.data, (r) => `- OPEN (${r.kind}): ${r.correction.replace(/\s+/g, ' ').slice(0, 220)}${r.admin_note ? ` — team: ${r.admin_note.slice(0, 160)}` : ''}`);
  const f = mapRows<R, string>(fixed.data, (r) => `- FIXED (${r.kind}): ${r.correction.replace(/\s+/g, ' ').slice(0, 160)} — now: ${(r.admin_note ?? '').slice(0, 200)}`);
  return [...o, ...f].join('\n');
}
