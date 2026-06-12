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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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
