// LLM provider + Elaya settings config reads — sla_policies pattern (migration 0116):
// read per request via the admin client, NEVER module-cached. Editing the
// llm_providers row (or a settings row) changes behaviour on the next message
// with no deploy. Config SELECT RLS is admin/founder; the engine reads via the
// service-role client because every caller path is already session-authenticated
// (the chat route / page is the trust boundary, Q-13 convention).

import { createAdminClient } from '@/lib/supabase/admin';
import type { LlmJobType, LlmProviderRow } from '@/lib/types/elaya';

const DEFAULT_DAILY_MESSAGE_CAP = 200;
const DEFAULT_SESSION_EXPIRY_HOURS = 24;

export type PiiMaskingDepth = 'off' | 'light' | 'strict';

/** Active provider config for a job type. Throws when no active row exists. */
export async function getLlmJobConfig(jobType: LlmJobType): Promise<LlmProviderRow> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('llm_providers')
    .select('*')
    .eq('job_type', jobType)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('[llm-providers-service] getLlmJobConfig failed:', error.message);
    throw new Error(`No LLM provider config readable for job '${jobType}'`);
  }
  if (!data) throw new Error(`No active LLM provider configured for job '${jobType}'`);
  return data as LlmProviderRow;
}

async function getSettingValue(key: string): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('elaya_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.warn('[llm-providers-service] settings read failed:', error.message);
    return null;
  }
  return (data as { value: unknown } | null)?.value ?? null;
}

/**
 * Which brain answers a channel (config rows `brain_whatsapp` / `brain_in_app`,
 * value `"node"` | `"python"`; migration 0179). Read per request, never cached —
 * flipping a row moves the very next message, no deploy (the model-switch
 * posture). Anything missing, malformed, or failed → `'node'`: the incumbent
 * brain keeps answering, so a config hiccup can never silence Elaya.
 */
export type ElayaBrainKind = 'node' | 'python';

export async function getElayaBrainForChannel(
  channel: 'whatsapp' | 'in_app',
): Promise<ElayaBrainKind> {
  // Non-production test seam: ELAYA_BRAIN_OVERRIDE_IN_APP / _WHATSAPP short-circuit
  // the DB read so the eval harness can drive the real route against a local brain
  // without touching the shared config rows. Production ignores them by construction
  // — the config row stays the only switch there.
  if (process.env.NODE_ENV !== 'production') {
    const override =
      channel === 'whatsapp'
        ? process.env.ELAYA_BRAIN_OVERRIDE_WHATSAPP
        : process.env.ELAYA_BRAIN_OVERRIDE_IN_APP;
    if (override === 'node' || override === 'python') return override;
  }
  const value = await getSettingValue(channel === 'whatsapp' ? 'brain_whatsapp' : 'brain_in_app');
  return value === 'python' ? 'python' : 'node';
}

/** Server-enforced daily message cap (config row `daily_message_cap`). */
export async function getDailyMessageCap(): Promise<number> {
  const value = await getSettingValue('daily_message_cap');
  return typeof value === 'number' && value > 0 ? value : DEFAULT_DAILY_MESSAGE_CAP;
}

/** PII gateway depth (config row `pii_masking_depth`). Defaults to 'light'. */
export async function getPiiMaskingDepth(): Promise<PiiMaskingDepth> {
  const value = await getSettingValue('pii_masking_depth');
  return value === 'off' || value === 'light' || value === 'strict' ? value : 'light';
}

/** Conversation session expiry window in hours (config row `session_expiry_hours`). */
export async function getSessionExpiryHours(): Promise<number> {
  const value = await getSettingValue('session_expiry_hours');
  return typeof value === 'number' && value > 0 ? value : DEFAULT_SESSION_EXPIRY_HOURS;
}

/**
 * The member profiler's switch (row `member_profiler_enabled`, migration 0215). OFF unless the
 * row says exactly `true`: a missing row, a malformed value or a failed read all mean "do not
 * read anyone's chat". The cloud task asks on every run, so flipping the row is the whole
 * control — no deploy.
 */
export async function getMemberProfilerEnabled(): Promise<boolean> {
  try { return (await getSettingValue('member_profiler_enabled')) === true; } catch { return false; }
}
