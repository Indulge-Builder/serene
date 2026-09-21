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


_FOLLOWUP_WORDS = ("try", "now", "again", "and", "what", "about", "anyone", "any", "more", "details",
                   "verify", "check", "that", "this", "it", "them", "those", "these", "so", "ok", "okay",
                   "yes", "no", "why", "how", "many", "who", "else", "also", "then", "same", "both",
                   "please", "pls", "the", "a", "of", "for", "to", "on", "in", "with", "is", "are", "did",
                   "does", "do", "one", "ones", "other", "others", "he", "she", "they", "his", "her", "their")


def _is_followup(message: str) -> bool:
    """A message that names no subject of its own: short, and made only of filler / pointer
    words ("try now", "has anyone showed interest?", "and the other one?"). Deterministic on
    purpose: a clear question is routed on its own words exactly as before 2026-09-21, and only
    a follow-up borrows the subject of the earlier messages."""
    words = [w for w in "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in message.lower()).split() if w]
    if not words:
        return True
    if len(words) > 8:
        return False
    return sum(1 for w in words if w in _FOLLOWUP_WORDS) >= max(1, len(words) - 2)


def _context_block(history: list[dict] | None, current: str) -> str:
    """For a FOLLOW-UP only: the last few user messages, so the router classifies the subject
    they are about. Deliberately no previous category and no previous answer: anchoring on
    the category kept a wrong route wrong ("try now that the bug is fixed" stayed on `leads`
    because the mistaken turn before it was `leads`), and the previous answer biased a clear
    question towards whatever it was about."""
    if not history:
        return current[:2000]
    followup = _is_followup(current)
    users: list[str] = []
    seen_current = False
    for row in reversed(history):
        if row.get("role") != "user":
            continue
        content = (row.get("content") or "").strip()
        if not seen_current and content == current.strip():
            seen_current = True
            continue
        if len(users) < 3:
            users.append(content[:300])
    if not users:
        return current[:2000]
    earlier = "\n".join(f"- {u}" for u in reversed(users))
    if followup:
        return (
            f"The user's earlier messages in this conversation (oldest first):\n{earlier}\n\n"
            f"Current message (a follow-up that names no subject of its own): {current[:500]}\n\n"
            "Classify the subject the earlier messages are about; the current message continues it."
        )
    return (
        f"Current message: {current[:1500]}\n\n"
        f"For context only, the user's earlier messages (oldest first):\n{earlier}\n\n"
        "Classify the CURRENT message by its own words. Use the earlier messages only when the "
        "current one is vague about WHAT it refers to (a pronoun, 'anyone', 'more details'); "
        "then take the subject from them. A clear new subject in the current message wins."
    )


def _playbook_menu(playbooks: list[dict]) -> str:
    """The founder's playbooks (0233) as a second menu: id → the questions it covers. The router
    returns the matching id after the category, or `none`. Ids are short so the tiny reply stays tiny."""
    if not playbooks:
        return ""
    lines = []
    for i, pb in enumerate(playbooks):
        qs = " / ".join(str(q)[:90] for q in (pb.get("example_questions") or [])[:6])
        lines.append(f"- P{i + 1}: {pb.get('title', '')} — e.g. {qs}")
    return (
        "\n\nPlaybooks (how a KIND of question is answered). If the message is that kind of question, "
        "add the playbook id after the category, separated by a space; otherwise add `none`:\n" + "\n".join(lines)
    )


async def route(
    message: str,
    role: str | None = None,
    history: list[dict] | None = None,
    playbooks: list[dict] | None = None,
) -> tuple[str, int, dict | None]:
    """→ (specialist_id, latency_ms, playbook_row | None). Fail-open to 'general' and no playbook on
    any error — a routing hiccup must degrade to a broader brain, never to a dead turn."""
    started = time.monotonic()
    offered = set(_offered(role))
    pbs = playbooks or []
    picked = DEFAULT_SPECIALIST
    playbook: dict | None = None
    try:
        llm = await registry.resolve("routing")
        result = await llm.complete(
            CompleteRequest(
                model=llm.model,
                max_tokens=16,
                system=_system(role) + _playbook_menu(pbs),
                messages=[ChatMessage(role="user", content=_context_block(history, message))],
            )
        )
        parts = result.text.strip().lower().replace(",", " ").split()
        picked = parts[0] if parts else DEFAULT_SPECIALIST
        for tok in parts[1:]:
            if tok.startswith("p") and tok[1:].isdigit():
                idx = int(tok[1:]) - 1
                if 0 <= idx < len(pbs):
                    playbook = pbs[idx]
                break
    except Exception:
        picked = DEFAULT_SPECIALIST
    latency_ms = int((time.monotonic() - started) * 1000)
    return (picked if picked in offered else DEFAULT_SPECIALIST, latency_ms, playbook)
