// THE Trigger.dev cancel-by-tag helper (dry-audit 2026-06-20 D8). Both cancel
// paths (lead SLA timers, task reminders) locate pending runs via the tag index
// — no run IDs stored in the DB — and cancel them idempotently. One
// implementation so the status filter and settle semantics can never drift.
//
// Lives in src/lib/trigger (NOT src/trigger) deliberately: trigger.config.ts
// scans src/trigger for task entry points; this is a plain SDK helper.

import { runs } from '@trigger.dev/sdk/v3';

/** Cancel every DELAYED/QUEUED run carrying `tag`. Idempotent — already-cancelled
 *  or already-running runs are skipped/settled without throwing. */
export async function cancelRunsByTag(tag: string): Promise<void> {
  const page = await runs.list({ tag, status: ['DELAYED', 'QUEUED'] });
  const runIds = page.data.map((r) => r.id);

  if (runIds.length === 0) return;

  await Promise.allSettled(runIds.map((id) => runs.cancel(id)));
}
