/**
 * refresh-lead-health.ts
 * Hourly Trigger.dev scheduled job that recomputes lead_health for all
 * active, non-terminal, non-archived leads via a single SQL UPDATE.
 *
 * The real work lives in the refresh_lead_health_bulk() SECURITY DEFINER RPC
 * (migration 079). This job is responsible only for scheduling and telemetry.
 *
 * Uses createAdminClient() (service role) so the RPC call is fully authoritative —
 * it updates every eligible lead regardless of domain or assignment.
 *
 * Logging: console.log only in non-production to satisfy P-07.
 */

import { schedules } from '@trigger.dev/sdk/v3';

export const refreshLeadHealthTask = schedules.task({
  id:   'refresh-lead-health',
  cron: '0 * * * *',   // top of every hour

  run: async () => {
    // Dynamic import keeps server-only modules out of the module-level bundle.
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const adminClient = createAdminClient();

    // Single RPC call — one round-trip, one UPDATE, SECURITY DEFINER.
    // The SQL CASE expression in the RPC mirrors computeLeadHealth() exactly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminClient as any).rpc('refresh_lead_health_bulk');

    if (error) {
      console.error('[refresh-lead-health] rpc failed:', error.message ?? error);
      throw error;
    }

    const updated = typeof data === 'number' ? data : 0;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[refresh-lead-health] updated ${updated} leads`);
    }
  },
});
