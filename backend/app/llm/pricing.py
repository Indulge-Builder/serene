"""The price table — the Python mirror of src/lib/constants/llm-pricing.ts.

One row per model family, matched by id PREFIX (most specific first), in US dollars per
million tokens for every token category the provider bills separately. The usage ledger
(public.llm_usage_events, migration 0254) stores the RAW counts and the price_version, so
a wrong rate is a re-price, never a lost number. Change the TypeScript table and this one
together; scripts/elaya/pricing-parity.ts diffs them.
"""

from __future__ import annotations

from dataclasses import dataclass

LLM_PRICE_VERSION = "prices-2026-10-01"


@dataclass(frozen=True)
class LlmPrice:
    input: float
    cache_write_5m: float
    cache_write_1h: float
    cache_read: float
    output: float


LLM_PRICES: tuple[tuple[str, LlmPrice], ...] = (
    ("claude-fable-5-1", LlmPrice(10, 12.5, 20, 0.25, 50)),
    ("claude-opus-5-5", LlmPrice(4, 5, 8, 0.2, 20)),
    ("claude-opus-5", LlmPrice(5, 6.25, 10, 0.5, 25)),
    ("claude-sonnet-5-5", LlmPrice(2, 2.5, 4, 0.2, 10)),
    ("claude-sonnet-5", LlmPrice(2, 2.5, 4, 0.2, 10)),
    ("claude-haiku-4-5", LlmPrice(1, 1.25, 2, 0.1, 5)),
)


def price_for_model(model: str | None) -> LlmPrice | None:
    if not model:
        return None
    m = model.lower()
    for prefix, price in LLM_PRICES:
        if m.startswith(prefix):
            return price
    return None


def cost_usd_for(
    model: str | None,
    *,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    cache_write_1h_tokens: int = 0,
) -> float | None:
    """The dollars one request cost, or None when the model is not in the table."""
    p = price_for_model(model)
    if p is None:
        return None
    write_1h = max(0, cache_write_1h_tokens)
    write_5m = max(0, cache_write_tokens - write_1h)
    usd = (
        max(0, input_tokens) * p.input
        + write_5m * p.cache_write_5m
        + write_1h * p.cache_write_1h
        + max(0, cache_read_tokens) * p.cache_read
        + max(0, output_tokens) * p.output
    ) / 1_000_000
    return round(usd, 6)


def table_as_json() -> list[dict]:
    """For the parity bench: the table in the TypeScript file's shape."""
    return [
        {
            "match": prefix,
            "price": {
                "input": p.input,
                "cacheWrite5m": p.cache_write_5m,
                "cacheWrite1h": p.cache_write_1h,
                "cacheRead": p.cache_read,
                "output": p.output,
            },
        }
        for prefix, p in LLM_PRICES
    ]
