"""Elaya conversation persistence — the faithful port of elaya-service.ts.

Same tables, same semantics, byte-comparable behavior:
  • ONE active session per user across channels — resolved by the last-message
    recency window (session_expiry_hours, config row), never by channel.
  • Messages are APPEND-ONLY (inserts, ever — A-11).
  • The daily cap counts USER-role messages since IST midnight across all the
    user's conversations, and FAILS CLOSED (a broken count never grants
    unlimited messages).

Plus the elaya_actions reads the confirmation resolver needs (the ledger's
writes happen inside the Node write registry, reached through the bridge —
except `dismissed`, which the resolver stamps directly, mirroring
markActionResolved's admin-client update).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core import supa

IST = timezone(timedelta(hours=5, minutes=30))


class DuplicateMessage(Exception):
    """The WhatsApp dedup index (idx_elaya_messages_wa_dedup, partial UNIQUE on
    meta->>wa_message_id) rejected the insert — a BSP redelivery raced past the
    caller's pre-check. The Node twin returns {duplicate: true}; here it is an
    exception so the endpoint can answer 409 and the gate stays silent (never a
    second brain turn, never a second cap burn, never a duplicate reply)."""


def _ist_midnight_utc_iso() -> str:
    """UTC instant of today's IST midnight — the Node toISTMidnight contract."""
    now_ist = datetime.now(IST)
    midnight_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_ist.astimezone(timezone.utc).isoformat()


# ── Conversations ────────────────────────────────────────────────────────


async def get_or_create_active_conversation(
    user_id: str, expiry_hours: int, origin_channel: str = "in_app"
) -> dict[str, Any]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=expiry_hours)).isoformat()
    existing = await supa.select_one(
        "elaya_conversations",
        {
            "select": "*",
            "user_id": f"eq.{user_id}",
            "archived_at": "is.null",
            "last_message_at": f"gte.{cutoff}",
            "order": "last_message_at.desc",
        },
    )
    if existing:
        return existing
    created = await supa.insert(
        "elaya_conversations", {"user_id": user_id, "channel": origin_channel}
    )
    if not created:
        raise RuntimeError("could not start an Elaya conversation")
    return created


async def get_owned_conversation(conversation_id: str, user_id: str) -> dict[str, Any] | None:
    """Ownership check for a caller-supplied id (S-06)."""
    return await supa.select_one(
        "elaya_conversations",
        {
            "select": "*",
            "id": f"eq.{conversation_id}",
            "user_id": f"eq.{user_id}",
            "archived_at": "is.null",
        },
    )


async def touch_conversation(conversation_id: str) -> None:
    try:
        await supa.update(
            "elaya_conversations",
            {"last_message_at": datetime.now(timezone.utc).isoformat()},
            {"id": f"eq.{conversation_id}"},
        )
    except Exception as e:  # non-fatal, like the Node twin
        print(f"[elaya-store] touch failed: {e}")


# ── Messages (append-only) ───────────────────────────────────────────────


async def get_model_context_messages(conversation_id: str, limit: int = 10) -> list[dict[str, Any]]:
    rows = await supa.select(
        "elaya_messages",
        {
            "select": "*",
            "conversation_id": f"eq.{conversation_id}",
            "order": "created_at.desc",
            "limit": str(limit),
        },
    )
    return list(reversed(rows))


async def insert_user_message(
    conversation_id: str,
    sender_id: str,
    content: str,
    channel: str = "in_app",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append one user message. `meta` carries the WhatsApp channel's
    {wa_message_id} (the dedup key); raises DuplicateMessage when the partial
    UNIQUE index rejects a redelivered id (PostgREST 409 / Postgres 23505)."""
    payload: dict[str, Any] = {
        "conversation_id": conversation_id,
        "sender_id": sender_id,
        "role": "user",
        "channel": channel,
        "content": content,
    }
    if meta:
        payload["meta"] = meta
    try:
        row = await supa.insert("elaya_messages", payload)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 409:
            raise DuplicateMessage() from e
        raise
    if not row:
        raise RuntimeError("could not save the message")
    return row


async def insert_assistant_message(
    conversation_id: str,
    content: str,
    tool_calls: list[dict[str, Any]],
    meta: dict[str, Any],
    channel: str = "in_app",
) -> dict[str, Any] | None:
    try:
        return await supa.insert(
            "elaya_messages",
            {
                "conversation_id": conversation_id,
                "sender_id": None,
                "role": "assistant",
                "channel": channel,
                "content": content,
                "tool_calls": tool_calls or None,
                "meta": meta,
            },
        )
    except Exception as e:  # the Node twin logs + returns null
        print(f"[elaya-store] assistant insert failed: {e}")
        return None


async def count_user_messages_today(user_id: str) -> int:
    """FAILS CLOSED — a broken count must never grant unlimited messages."""
    try:
        _, total = await supa.select_count(
            "elaya_messages",
            {
                "select": "id",
                "sender_id": f"eq.{user_id}",
                "role": "eq.user",
                "created_at": f"gte.{_ist_midnight_utc_iso()}",
                "limit": "1",
            },
        )
        return total
    except Exception as e:
        print(f"[elaya-store] cap count failed: {e}")
        return 2**53


# ── Per-user persona + notes (the prompt folds — Jarvis Phases 2/3 + Feature 3) ──
# Both are ADMIN-client reads scoped by the verified user id IN CODE (the
# elaya-data.ts parity rule — a WhatsApp turn has no session, so auth.uid()
# would blank them). Both fail SOFT: a missing fold never breaks a turn.

# THE total chars of notes folded into the cached prefix per turn — the Node
# ELAYA_NOTES_PROMPT_BUDGET (constants/elaya-notes.ts), kept identical so both
# brains read the same notes for the same user.
NOTES_PROMPT_BUDGET = 6000


async def get_user_persona(user_id: str) -> tuple[dict[str, Any] | None, str | None]:
    """user_context.context → (persona style prefs, Elaya-learned blurb) — the
    getUserPersona twin. (None, None) for a user who has tuned nothing."""
    try:
        row = await supa.select_one(
            "user_context", {"select": "context", "user_id": f"eq.{user_id}"}
        )
    except Exception as e:
        print(f"[elaya-store] user_context read failed: {e!r}")
        return None, None
    ctx = (row or {}).get("context") or {}
    if not isinstance(ctx, dict):
        return None, None
    persona = ctx.get("persona")
    learned = ctx.get("learned")
    return (
        persona if isinstance(persona, dict) else None,
        learned if isinstance(learned, str) else None,
    )


async def get_notes_for_elaya(user_id: str) -> list[str]:
    """The user's own notes as `title\\nbody` blocks, newest-edited first, running
    total capped at NOTES_PROMPT_BUDGET (the tail is dropped) — the
    getNotesForElaya twin. [] when none or on any failure."""
    if not user_id:
        return []
    try:
        rows = await supa.select(
            "elaya_notes",
            {
                "select": "title,body,updated_at",
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc",
            },
        )
    except Exception as e:
        print(f"[elaya-store] notes read failed: {e!r}")
        return []
    out: list[str] = []
    spent = 0
    for row in rows:
        title = (row.get("title") or "").strip()
        body = (row.get("body") or "").strip()
        text = f"{title}\n{body}" if title and body else (title or body)
        if not text:
            continue
        if spent + len(text) > NOTES_PROMPT_BUDGET:
            break  # budget spent — drop the (older) tail
        out.append(text)
        spent += len(text)
    return out


# ── elaya_actions (the confirmation resolver's reads + dismiss stamp) ────


async def get_latest_proposed_action(
    conversation_id: str, user_id: str
) -> dict[str, Any] | None:
    try:
        return await supa.select_one(
            "elaya_actions",
            {
                "select": "*",
                "conversation_id": f"eq.{conversation_id}",
                "user_id": f"eq.{user_id}",
                "status": "eq.proposed",
                "order": "created_at.desc",
            },
        )
    except Exception as e:
        print(f"[elaya-store] pending read failed: {e}")
        return None


async def mark_action_dismissed(action_id: str, resolved_by: str) -> None:
    """The resolver's own stamp (markActionResolved 'dismissed' twin). Only a
    still-live proposal flips — idempotent under races, like the Node update."""
    try:
        await supa.update(
            "elaya_actions",
            {
                "status": "dismissed",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolved_by": resolved_by,
            },
            {"id": f"eq.{action_id}", "status": "eq.proposed"},
        )
    except Exception as e:
        print(f"[elaya-store] dismiss failed: {e}")


# ── The living memory + known issues (0237, 2026-09-25) ────────────────────────
# The twins of elaya-memory-service.ts formatMemoryBlock / getKnownIssuesBlock: the same ranking,
# the same budget, the same line shape, so a user's prompt is byte-identical on both brains.
_MEMORY_KIND_RANK = {"rule": 0, "correction": 1, "style": 2, "preference": 3, "interest": 4, "fact": 5}
_MEMORY_PROMPT_BUDGET_CHARS = 6000
_KNOWN_ISSUES_OPEN_DAYS = 30
_KNOWN_ISSUES_FIXED_DAYS = 14
_KNOWN_ISSUES_MAX = 12


async def get_memory_block(user_id: str) -> str:
    """What this user has told Elaya about how they want things, ranked and budgeted. '' when none."""
    if not user_id:
        return ""
    try:
        rows = await supa.select(
            "elaya_user_memory",
            {"select": "kind,statement,updated_at", "user_id": f"eq.{user_id}", "retired_at": "is.null", "order": "updated_at.desc", "limit": "500"},
        )
    except Exception as e:
        print(f"[elaya-store] memory read failed: {e!r}")
        return ""
    # Same order as the TypeScript: by kind rank, then newest first inside a kind.
    by_kind: dict[str, list[dict]] = {}
    for r in rows:
        by_kind.setdefault(str(r.get("kind")), []).append(r)
    ordered: list[dict] = []
    for kind in sorted(by_kind, key=lambda k: _MEMORY_KIND_RANK.get(k, 9)):
        ordered.extend(sorted(by_kind[kind], key=lambda r: str(r.get("updated_at") or ""), reverse=True))
    lines: list[str] = []
    used = 0
    for r in ordered:
        line = f"- [{r.get('kind')}] {' '.join(str(r.get('statement') or '').split())}"
        if used + len(line) + 1 > _MEMORY_PROMPT_BUDGET_CHARS:
            break
        lines.append(line)
        used += len(line) + 1
    return "\n".join(lines)


async def get_known_issues_block() -> str:
    """What the team has raised as wrong and not fixed, and what was just fixed with a note. '' when none."""
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    open_since = (now - timedelta(days=_KNOWN_ISSUES_OPEN_DAYS)).isoformat()
    fixed_since = (now - timedelta(days=_KNOWN_ISSUES_FIXED_DAYS)).isoformat()
    try:
        opened = await supa.select(
            "elaya_improvement_requests",
            {"select": "kind,correction,admin_note", "status": "eq.open", "created_at": f"gte.{open_since}", "order": "created_at.desc", "limit": str(_KNOWN_ISSUES_MAX)},
        )
        fixed = await supa.select(
            "elaya_improvement_requests",
            {"select": "kind,correction,admin_note", "status": "eq.fixed", "admin_note": "not.is.null", "resolved_at": f"gte.{fixed_since}", "order": "resolved_at.desc", "limit": "6"},
        )
    except Exception as e:
        print(f"[elaya-store] known issues read failed: {e!r}")
        return ""
    out: list[str] = []
    for r in opened:
        note = f" — team: {str(r.get('admin_note'))[:160]}" if r.get("admin_note") else ""
        out.append(f"- OPEN ({r.get('kind')}): {' '.join(str(r.get('correction') or '').split())[:220]}{note}")
    for r in fixed:
        out.append(f"- FIXED ({r.get('kind')}): {' '.join(str(r.get('correction') or '').split())[:160]} — now: {str(r.get('admin_note') or '')[:200]}")
    return "\n".join(out)
