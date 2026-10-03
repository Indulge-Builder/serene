// llm-usage-service.ts — THE usage ledger writer and reader (migration 0254, cost audit P0).
//
// One row per model request, written by the registry's metering wrapper (lib/elaya/registry.ts)
// for every Node caller, and by backend/app/llm/registry.py for the Python brain. Best effort:
// a ledger failure never costs a turn (it logs, at most once a minute). No `server-only`: the
// profiler, the deep read and the alert sweep run from Trigger.dev and go through the same seam.

import { createAdminClient } from '@/lib/supabase/admin';
import { LLM_PRICE_VERSION, costUsdFor } from '@/lib/constants/llm-pricing';
import { CHAT_USAGE_FEATURES } from '@/lib/constants/elaya-cost';
import { toISTMidnight } from '@/lib/utils/ist';
import type { LlmUsage, LlmUsageContext } from '@/lib/elaya/provider';

const LOG = '[llm-usage]';
let lastWarnAt = 0;

export type LlmUsageEventInput = {
  provider: string;
  modelRequested: string;
  jobType: string | null;
  usage: LlmUsage | null;
  ctx: LlmUsageContext | undefined;
  stopReason: string | null;
  toolsOffered: number | null;
  toolResultChars: number | null;
  ok: boolean;
  error?: string | null;
};

/** Append one ledger row. Never throws; a failed insert is a warning, rate-limited. */
export async function recordLlmUsage(e: LlmUsageEventInput): Promise<void> {
  try {
    const u = e.usage;
    const model = u?.model ?? e.modelRequested;
    const cost = u
      ? costUsdFor(model, {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens ?? 0,
          cacheWriteTokens: u.cacheWriteTokens ?? 0,
          cacheWrite1hTokens: u.cacheWrite1hTokens ?? 0,
        })
      : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0254 is not in the generated types until the next regen
    const admin = createAdminClient() as any;
    const { error } = await admin.from('llm_usage_events').insert({
      runtime: 'node',
      provider: e.provider,
      model_requested: e.modelRequested,
      model: u?.model ?? null,
      request_id: u?.requestId ?? null,
      feature: e.ctx?.feature ?? e.jobType ?? 'unknown',
      job_type: e.jobType,
      channel: e.ctx?.channel ?? null,
      user_id: e.ctx?.userId ?? null,
      conversation_id: e.ctx?.conversationId ?? null,
      message_id: e.ctx?.messageId ?? null,
      job_id: e.ctx?.jobId ?? null,
      run_id: e.ctx?.runId ?? null,
      attempt: e.ctx?.attempt ?? 1,
      prompt_version: e.ctx?.promptVersion ?? null,
      behaviour_version: e.ctx?.behaviourVersion ?? null,
      input_tokens: u?.inputTokens ?? 0,
      cache_write_tokens: u?.cacheWriteTokens ?? 0,
      cache_write_1h_tokens: u?.cacheWrite1hTokens ?? 0,
      cache_read_tokens: u?.cacheReadTokens ?? 0,
      output_tokens: u?.outputTokens ?? 0,
      stop_reason: e.stopReason,
      latency_ms: u?.latencyMs ?? null,
      tools_offered: e.toolsOffered,
      tool_result_chars: e.toolResultChars,
      cost_usd: cost,
      price_version: cost === null ? null : LLM_PRICE_VERSION,
      ok: e.ok,
      error: e.error ? e.error.slice(0, 500) : null,
    });
    if (error) warn(`insert failed: ${error.message}`);
  } catch (err) {
    warn(`insert threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function warn(message: string): void {
  const now = Date.now();
  if (now - lastWarnAt < 60_000) return;
  lastWarnAt = now;
  console.warn(`${LOG} ${message} (a ledger gap, never a failed call)`);
}

/** Dollars spent since an instant, optionally for a set of features; null when the read failed. */
export async function getLlmSpendUsd(since: Date, features?: readonly string[]): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0254 is not in the generated types until the next regen
    const admin = createAdminClient() as any;
    const { data, error } = await admin.rpc('llm_spend_usd', { p_since: since.toISOString(), p_features: features ? [...features] : null });
    if (error) { warn(`spend read failed: ${error.message}`); return null; }
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    warn(`spend read threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** The chat features' spend since IST midnight; null when unknown (the cap then does not bite). */
export async function getChatSpendTodayUsd(now: Date = new Date()): Promise<number | null> {
  return getLlmSpendUsd(toISTMidnight(now), CHAT_USAGE_FEATURES);
}
