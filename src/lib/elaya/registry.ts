// Provider registry — resolves the llm_providers config row for a job type to a
// concrete adapter. Config is read per request (no module cache): switching the
// model or provider in the DB row changes the next message with no deploy.
//
// Adding a provider: write lib/elaya/adapters/<name>.ts implementing
// LlmProviderAdapter, add one case below, insert/update the llm_providers row.

import { anthropicAdapter } from '@/lib/elaya/adapters/anthropic';
import type { LlmProviderAdapter } from '@/lib/elaya/provider';
import { getLlmJobConfig } from '@/lib/services/llm-providers-service';
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

export async function resolveLlmForJob(jobType: LlmJobType): Promise<ResolvedLlm> {
  const config = await getLlmJobConfig(jobType);
  return {
    adapter: adapterFor(config.provider),
    model: config.model,
    maxTokens: config.max_tokens,
  };
}
