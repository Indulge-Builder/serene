// elaya-playbooks-service.ts — THE elaya_playbooks access (migration 0234).
//
// A playbook is the founder's plain-words answer to "how should Elaya handle THIS kind of
// question": example questions people really ask + the instructions for that kind of ask. The
// Python router picks the matching playbook per turn (it reads the active rows with the service
// role); the settings page lists them on the session client (RLS: admin/founder); the writes go
// through the admin client behind the gated action. No Redis: a dozen rows, read per turn.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapRows } from '@/lib/utils/rows';
import type { UpsertElayaPlaybookInput } from '@/lib/validations/elaya-playbook-schema';

export type ElayaPlaybookRow = {
  id: string;
  title: string;
  example_questions: string[];
  instructions: string;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// 0234 is not in the generated types until the next regen; one loose handle per file (the convention).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };

/** The settings page list (session client; RLS admits admin/founder). Newest edit first. */
export async function listElayaPlaybooks(): Promise<ElayaPlaybookRow[]> {
  const supabase = (await createClient()) as unknown as Loose;
  const { data, error } = await supabase.from('elaya_playbooks').select('*').order('updated_at', { ascending: false });
  if (error) { console.error('[elaya-playbooks-service] list failed:', error.message); return []; }
  return mapRows<ElayaPlaybookRow, ElayaPlaybookRow>(data, (r) => r);
}

export async function upsertElayaPlaybookCore(actorId: string, input: UpsertElayaPlaybookInput): Promise<{ data: ElayaPlaybookRow | null; error: string | null }> {
  const admin = createAdminClient() as unknown as Loose;
  const row = { title: input.title, example_questions: input.example_questions, instructions: input.instructions, active: input.active, updated_by: actorId, updated_at: new Date().toISOString() };
  const q = input.id
    ? admin.from('elaya_playbooks').update(row).eq('id', input.id)
    : admin.from('elaya_playbooks').insert({ ...row, created_by: actorId });
  const { data, error } = await q.select('*').single();
  if (error) { console.error('[elaya-playbooks-service] upsert failed:', error.message); return { data: null, error: 'The playbook could not be saved just now.' }; }
  return { data: data as ElayaPlaybookRow, error: null };
}

export async function deleteElayaPlaybookCore(id: string): Promise<{ error: string | null }> {
  const { error } = await (createAdminClient() as unknown as Loose).from('elaya_playbooks').delete().eq('id', id);
  if (error) { console.error('[elaya-playbooks-service] delete failed:', error.message); return { error: 'The playbook could not be deleted just now.' }; }
  return { error: null };
}
