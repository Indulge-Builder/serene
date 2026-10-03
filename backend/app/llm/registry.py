"""Model registry — llm_providers row → adapter + model, read per request.

The multi-model policy lives in the DATABASE, never in code (the founder's
requirement made structural): today routing=Haiku 4.5, reasoning=Sonnet 5,
heavy=Opus 5 — changing any of them is an UPDATE on llm_providers, applied on
the very next message, no deploy. `heavy` falls back to `reasoning` when its
row is missing or inactive, so the tier can be toggled off safely.

Metering (migration 0254, cost audit 2026-10-01 P0): ResolvedLlm.complete writes
ONE llm_usage_events row per provider request, with the caller's usage_ctx
(feature, channel, user, conversation, versions) or the job type alone. The
write is detached (this process lives; there is no lambda to freeze) and never
fails a turn. A provider failure is recorded too, then re-raised.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Literal

from app.core import supa
from app.llm import anthropic_adapter
from app.llm.pricing import LLM_PRICE_VERSION, cost_usd_for
from app.llm.provider import CompleteRequest, CompleteResult

JobType = Literal["routing", "reasoning", "heavy"]

_pending: set[asyncio.Task[None]] = set()
_last_warn = 0.0


def _tool_result_chars(req: CompleteRequest) -> int:
    return sum(len(m.content) for m in req.messages if m.role == "tool")


async def _record(row: dict[str, Any]) -> None:
    global _last_warn
    try:
        await supa.insert("llm_usage_events", row, returning=False)
    except Exception as exc:  # noqa: BLE001 — a ledger gap, never a failed call
        import time as _t

        now = _t.monotonic()
        if now - _last_warn > 60:
            _last_warn = now
            print(f"[llm-usage] insert failed: {exc}")


def _enqueue(row: dict[str, Any]) -> None:
    try:
        task = asyncio.create_task(_record(row))
        _pending.add(task)
        task.add_done_callback(_pending.discard)
    except RuntimeError:
        # No running loop (a bench): skip the ledger rather than block.
        pass


@dataclass
class ResolvedLlm:
    provider: str
    model: str
    max_tokens: int
    job_type: str = "reasoning"

    async def complete(self, req: CompleteRequest) -> CompleteResult:
        req.model = self.model
        if self.provider != "anthropic":
            # Config rows may name google/openai before their adapters exist —
            # fail loud, never silently substitute a different provider.
            raise RuntimeError(f"provider '{self.provider}' has no adapter yet")
        ctx = req.usage_ctx or {}
        base: dict[str, Any] = {
            "runtime": "python",
            "provider": self.provider,
            "model_requested": self.model,
            "feature": ctx.get("feature") or self.job_type,
            "job_type": self.job_type,
            "channel": ctx.get("channel"),
            "user_id": ctx.get("user_id"),
            "conversation_id": ctx.get("conversation_id"),
            "message_id": ctx.get("message_id"),
            "job_id": ctx.get("job_id"),
            "run_id": ctx.get("run_id"),
            "attempt": int(ctx.get("attempt") or 1),
            "prompt_version": ctx.get("prompt_version"),
            "behaviour_version": ctx.get("behaviour_version"),
            "tools_offered": len(req.tools),
            "tool_result_chars": _tool_result_chars(req),
        }
        try:
            result = await anthropic_adapter.complete(req)
        except Exception as exc:
            _enqueue({**base, "ok": False, "error": str(exc)[:500]})
            raise
        model = result.model or self.model
        cost = cost_usd_for(
            model,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cache_read_tokens=result.cache_read_tokens,
            cache_write_tokens=result.cache_write_tokens,
            cache_write_1h_tokens=result.cache_write_1h_tokens,
        )
        _enqueue(
            {
                **base,
                "model": result.model or None,
                "request_id": result.request_id,
                "input_tokens": result.input_tokens,
                "cache_write_tokens": result.cache_write_tokens,
                "cache_write_1h_tokens": result.cache_write_1h_tokens,
                "cache_read_tokens": result.cache_read_tokens,
                "output_tokens": result.output_tokens,
                "stop_reason": result.stop_reason,
                "latency_ms": result.latency_ms,
                "cost_usd": cost,
                "price_version": LLM_PRICE_VERSION if cost is not None else None,
                "ok": True,
            }
        )
        return result


async def resolve(job_type: JobType) -> ResolvedLlm:
    row = await supa.get_llm_job_config(job_type)
    if row is None and job_type == "heavy":
        row = await supa.get_llm_job_config("reasoning")
    if row is None:
        raise RuntimeError(f"no active llm_providers row for job '{job_type}'")
    return ResolvedLlm(provider=row["provider"], model=row["model"], max_tokens=row["max_tokens"], job_type=job_type)
