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
    ("has anyone shown interest?", "try now", "and the other one?") carries no subject words
    of its own; judged alone it landed on a specialist without the tools the conversation
    was using, and the model then disowned real numbers it could no longer see. So the
    router gets the last few USER messages and the start of the previous answer, and is
    told to classify the SUBJECT of the conversation. It is deliberately NOT told the
    previous category: anchoring on it kept a wrong route wrong ("try now that the bug is
    fixed" stayed on `leads` because the mistaken turn before it was `leads`)."""
    if not history:
        return current[:2000]
    users: list[str] = []
    prev_answer = ""
    seen_current = False
    for row in reversed(history):
        role = row.get("role")
        content = (row.get("content") or "").strip()
        if role == "user":
            if not seen_current and content == current.strip():
                seen_current = True
                continue
            if len(users) < 3:
                users.append(content[:300])
        elif role == "assistant" and not prev_answer:
            prev_answer = content[:240]
    if not users:
        return current[:2000]
    earlier = "\n".join(f"- {u}" for u in reversed(users))
    return (
        f"Earlier messages from the user in this conversation (oldest first):\n{earlier}\n"
        f"The previous answer began: {prev_answer}\n\n"
        f"Current message: {current[:1500]}\n\n"
        "Classify the SUBJECT of the conversation as a whole. If the current message is a "
        "follow-up that names no new subject ('try now', 'and?', 'anyone?', 'verify that', "
        "'more details', a pronoun), the subject is the one the earlier messages are about. "
        "If the previous answer was a refusal or an apology, ignore it: judge by the user's "
        "messages only."
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
