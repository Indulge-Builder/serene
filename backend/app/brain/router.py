"""The router — the orchestrator's front door (plan-elaya Phase 1.3).

A fast small model (the 'routing' tier — Haiku 4.5 today) classifies each
message into one specialist id in a few hundred ms. The answer is validated
IN CODE against the registry: an unexpected token falls back to 'general' —
the router can never invent a specialist, and never widens anything (it picks
a prompt+toolset profile; permissions still come from the principal).

This is also Phase 6's seam: the distilled self-hosted router replaces one
llm_providers row when the evals say it matches.
"""

from __future__ import annotations

import time

from app.brain.specialists import DEFAULT_SPECIALIST, SPECIALISTS
from app.llm import registry
from app.llm.provider import ChatMessage, CompleteRequest

_PREAMBLE = (
    "Classify the user's message into exactly one category. Reply with ONLY "
    "the category id, nothing else.\n\nCategories:\n"
)


def _offered(role: str | None) -> list[str]:
    """The specialists this role's menu lists. A role-restricted one (the founder's analyst) is
    simply absent for everyone else, so the router cannot pick it for them."""
    return [s.id for s in SPECIALISTS.values() if s.roles is None or (role is not None and role in s.roles)]


def _system(role: str | None) -> str:
    offered = set(_offered(role))
    return _PREAMBLE + "\n".join(f"- {s.id}: {s.description}" for s in SPECIALISTS.values() if s.id in offered)


def _context_block(history: list[dict] | None, current: str) -> str:
    """What the router sees besides the message itself (2026-09-21). A short follow-up
    ("has anyone shown interest?", "verify that", "and the other one?") carries no subject
    words of its own; judged alone it landed on a specialist without the tools the
    conversation was using, and the model then disowned real numbers it could no longer
    see. So the router gets the previous category, the previous user message and the start
    of the previous answer, and is told to keep a follow-up where the conversation is."""
    if not history:
        return current[:2000]
    prev_user = ""
    prev_answer = ""
    prev_specialist = ""
    seen_current = False
    for row in reversed(history):
        role = row.get("role")
        content = (row.get("content") or "").strip()
        if role == "user":
            if not seen_current and content == current.strip():
                seen_current = True
                continue
            if not prev_user:
                prev_user = content
        elif role == "assistant" and not prev_answer:
            prev_answer = content
            meta = row.get("meta") or {}
            prev_specialist = str(meta.get("specialist") or "")
        if prev_user and prev_answer:
            break
    if not prev_user and not prev_answer:
        return current[:2000]
    return (
        f"Previous category: {prev_specialist or 'unknown'}\n"
        f"Previous user message: {prev_user[:400]}\n"
        f"Previous answer began: {prev_answer[:300]}\n\n"
        f"Current message: {current[:1500]}\n\n"
        "Rule: if the current message is a follow-up on the same subject (a pronoun, 'and', 'what "
        "about', 'verify that', 'anyone', 'more details', no new subject named), answer with the "
        "PREVIOUS category. Pick a different category only when the current message clearly names "
        "a new subject."
    )


async def route(message: str, role: str | None = None, history: list[dict] | None = None) -> tuple[str, int]:
    """→ (specialist_id, latency_ms). Fail-open to 'general' on any error —
    a routing hiccup must degrade to a broader brain, never to a dead turn."""
    started = time.monotonic()
    offered = set(_offered(role))
    try:
        llm = await registry.resolve("routing")
        result = await llm.complete(
            CompleteRequest(
                model=llm.model,
                max_tokens=8,
                system=_system(role),
                messages=[ChatMessage(role="user", content=_context_block(history, message))],
            )
        )
        picked = result.text.strip().lower()
    except Exception:
        picked = DEFAULT_SPECIALIST
    latency_ms = int((time.monotonic() - started) * 1000)
    return (picked if picked in offered else DEFAULT_SPECIALIST, latency_ms)
