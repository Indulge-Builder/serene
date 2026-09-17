import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { giaDb } from '@/lib/supabase/schemas';
import { leadDisplayName } from '@/lib/elaya/access';
import type { AppDomain } from '@/lib/types/database';
import type { ActivityEventType, ActivitySubjectType } from '@/lib/types/activity';

/**
 * THE activity_events emit seam (migration 0159 — mobile-ops §8), modeled
 * exactly on emitTaskEvent. Best-effort, admin-client, never throws — a
 * failed activity emit must never fail the underlying write. Called beside
 * the writes in the mutation cores (lead-mutations.ts, deals) and derived
 * from the task-event seam (task-events.ts) — never from actions or UI.
 */

export type EmitActivityEventInput = {
  /** null → the emit is skipped (domain is a NOT NULL column) */
  domain: AppDomain | null;
  actorId: string | null;
  subjectType: ActivitySubjectType;
  subjectId: string | null;
  eventType: ActivityEventType;
  /** denormalized snapshot (lead name / task title) — the feed needs no join */
  title: string | null;
  meta?: Record<string, unknown>;
};

export async function emitActivityEvent(input: EmitActivityEventInput): Promise<void> {
  if (!input.domain) return;

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- activity_events not yet in generated database.ts (regen pending, migration 0159)
    const { error } = await (admin as any).from('activity_events').insert({
      domain: input.domain,
      actor_id: input.actorId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      event_type: input.eventType,
      title: input.title,
      meta: input.meta ?? {},
    });
    if (error) {
      console.warn('[activity-events] emit failed (non-fatal):', error.message);
    }
  } catch (err) {
    console.warn('[activity-events] emit threw (non-fatal):', err);
  }
}

/**
 * Lead-shaped convenience emit: several lead-mutation cores don't carry the
 * lead's domain or display name (their inputs are id-shaped). This resolves
 * both in one indexed read, then emits. Best-effort like emitActivityEvent.
 */
export async function emitLeadActivityEvent(input: {
  leadId: string;
  actorId: string | null;
  eventType: Extract<
    ActivityEventType,
    'call_logged' | 'note_added' | 'status_changed' | 'lead_assigned' | 'task_created'
  >;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: lead, error } = await giaDb(admin)
      .from('leads')
      .select('domain, first_name, last_name')
      .eq('id', input.leadId)
      .maybeSingle();
    if (error || !lead) {
      if (error) console.warn('[activity-events] lead resolve failed (non-fatal):', error.message);
      return;
    }

    await emitActivityEvent({
      domain: lead.domain,
      actorId: input.actorId,
      subjectType: 'lead',
      subjectId: input.leadId,
      eventType: input.eventType,
      title: leadDisplayName(lead),
      meta: input.meta,
    });
  } catch (err) {
    console.warn('[activity-events] lead emit threw (non-fatal):', err);
  }
}
