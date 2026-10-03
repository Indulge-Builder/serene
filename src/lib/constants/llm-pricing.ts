// llm-pricing.ts — THE price table for every model call Serene makes (cost audit 2026-10-01, P0).
//
// One row per model family, matched by id PREFIX (most specific first), in US dollars per million
// tokens, for every token category the provider bills separately: uncached input, a five-minute
// cache write, a one-hour cache write, a cache read, and output. The usage ledger
// (`public.llm_usage_events`, migration 0254) stores the RAW token counts and the `price_version`
// it was priced with, so a wrong rate is a re-price, never a lost number.
//
// Rates checked against the provider's published list on 2026-10-01 (the audit) and the Claude API
// reference on 2026-10-02: cache writes are 1.25x (5 min) and 2x (1 h) of input; cache reads are
// 0.1x of input on every family here except Opus 5.5 (0.05x). An unknown model prices as null and the
// ledger row still lands with its tokens.
//
// MIRROR: backend/app/llm/pricing.py carries the same table. Change both together; the parity
// bench (scripts/elaya/pricing-parity.ts) diffs them.

export const LLM_PRICE_VERSION = 'prices-2026-10-01';

/** US dollars per million tokens. */
export type LlmPrice = {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
};

export const LLM_PRICES: ReadonlyArray<{ readonly match: string; readonly price: LlmPrice }> = [
  { match: 'claude-fable-5-1', price: { input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 0.25, output: 50 } },
  { match: 'claude-opus-5-5', price: { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 } },
  { match: 'claude-opus-5', price: { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 } },
  { match: 'claude-sonnet-5-5', price: { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 } },
  { match: 'claude-sonnet-5', price: { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 } },
  { match: 'claude-haiku-4-5', price: { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 } },
];

/** The price row for a model id, by the longest matching prefix; null for a model we do not know. */
export function priceForModel(model: string | null | undefined): LlmPrice | null {
  if (!model) return null;
  const m = model.toLowerCase();
  for (const row of LLM_PRICES) if (m.startsWith(row.match)) return row.price;
  return null;
}

/** Every token category one request can bill. Missing categories count as zero. */
export type LlmTokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** The part of `cacheWriteTokens` written with a one-hour lifetime (billed 2x, not 1.25x). */
  cacheWrite1hTokens?: number;
};

/** The dollars one request cost, or null when the model is not in the table. */
export function costUsdFor(model: string | null | undefined, t: LlmTokenCounts): number | null {
  const p = priceForModel(model);
  if (!p) return null;
  const write1h = Math.max(0, t.cacheWrite1hTokens ?? 0);
  const write5m = Math.max(0, (t.cacheWriteTokens ?? 0) - write1h);
  const usd =
    (Math.max(0, t.inputTokens) * p.input +
      write5m * p.cacheWrite5m +
      write1h * p.cacheWrite1h +
      Math.max(0, t.cacheReadTokens ?? 0) * p.cacheRead +
      Math.max(0, t.outputTokens) * p.output) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** The share of the context that came from the cache: reads over everything the prompt held. */
export function cacheReadShare(t: LlmTokenCounts): number {
  const total = Math.max(0, t.inputTokens) + Math.max(0, t.cacheWriteTokens ?? 0) + Math.max(0, t.cacheReadTokens ?? 0);
  return total === 0 ? 0 : Math.max(0, t.cacheReadTokens ?? 0) / total;
}
