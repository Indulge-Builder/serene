// Provider registry — resolves the llm_providers config row for a job type to a
// concrete adapter. Config is read per request (no module cache): switching the
// model or provider in the DB row changes the next message with no deploy.
//
// Adding a provider: write lib/elaya/adapters/<name>.ts implementing
// LlmProviderAdapter, add one case below, insert/update the llm_providers row.
//
// Metering (migration 0254, cost audit 2026-10-01 P0): the adapter every caller gets back is
// wrapped once here, so EVERY model request in the Node runtime writes one usage row, with the
// caller's `usage` context when it set one and the job type alone when it did not. The adapter
// itself stays a pure transport (it never touches the database); the ledger is this seam's job.

import { anthropicAdapter } from '@/lib/elaya/adapters/anthropic';
import type { LlmCompleteRequest, LlmCompleteResult, LlmProviderAdapter } from '@/lib/elaya/provider';
import { getLlmJobConfig } from '@/lib/services/llm-providers-service';
import { recordLlmUsage } from '@/lib/services/llm-usage-service';
import type { LlmJobType, LlmProviderName } from '@/lib/types/elaya';

export type ResolvedLlm = {
  adapter: LlmProviderAdapter;
  model: string;
  maxTokens: number;
};

function adapterFor(provider: LlmProviderName): LlmProviderAdapter {
  switch (provider) {
    case 'anthropic':
      return anthropicAdapter;
    case 'google':
    case 'openai':
      // Config rows may name these ahead of their adapters landing — fail loud,
      // never silently fall back to a different provider than configured.
      throw new Error(`[elaya-registry] provider '${provider}' has no adapter yet`);
  }
}

function toolResultChars(req: LlmCompleteRequest): number {
  let n = 0;
  for (const m of req.messages) if (m.role === 'tool') n += m.content.length;
  return n;
}

/** The same adapter, with one ledger row per request. Failures are recorded too, then re-thrown. */
function metered(base: LlmProviderAdapter, jobType: LlmJobType): LlmProviderAdapter {
  return {
    name: base.name,
    async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
      const common = {
        provider: base.name,
        modelRequested: req.model,
        jobType,
        ctx: req.usage,
        toolsOffered: req.tools?.length ?? 0,
        toolResultChars: toolResultChars(req),
      };
      try {
        const result = await base.complete(req);
        await recordLlmUsage({ ...common, usage: result.usage, stopReason: result.stopReason, ok: true });
        return result;
      } catch (err) {
        await recordLlmUsage({ ...common, usage: null, stopReason: null, ok: false, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    },
  };
}

export async function resolveLlmForJob(jobType: LlmJobType): Promise<ResolvedLlm> {
  const config = await getLlmJobConfig(jobType);
  return {
    adapter: metered(adapterFor(config.provider), jobType),
    model: config.model,
    maxTokens: config.max_tokens,
  };
}
