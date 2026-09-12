"""The write bridge — how the Python brain ACTS without ever re-implementing a
mutation ("NEVER re-implement a lead mutation outside a core", elaya CLAUDE.md).

Every write tool the model calls here is executed by the Next.js app's
/api/elaya/bridge route — the SAME write-registry run() paths, cores, gates,
PII masking, and elaya_actions ledger the Node brain uses. One mutation
authority; this brain is the thinking layer above it.

The tool DEFINITIONS come from the same route (op=definitions), so the model
sees byte-identical schemas on both brains — Node stays the single source of
truth for the tool surface. Definitions are cached per role for 60s (they only
change on a deploy).
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import settings

_client: httpx.AsyncClient | None = None
_defs_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_DEFS_TTL_S = 60.0


def _bridge() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.web_app_url.rstrip("/"),
            timeout=httpx.Timeout(55.0, connect=5.0),
            headers={"Authorization": f"Bearer {settings.brain_api_secret}"},
        )
    return _client


async def fetch_write_definitions(user_id: str, role: str) -> list[dict[str, Any]]:
    """The bridged-tool definitions for this principal's role: every write tool
    plus the bridged READ tools (the vendor pair, 2026-09-12). Cached per ROLE —
    the role fully determines the bridged surface (writeToolsForRole + the
    admin/founder gate on the vendor tools)."""
    now = time.monotonic()
    hit = _defs_cache.get(role)
    if hit and now - hit[0] < _DEFS_TTL_S:
        return hit[1]
    r = await _bridge().post(
        "/api/elaya/bridge", json={"op": "definitions", "userId": user_id}
    )
    r.raise_for_status()
    defs = r.json().get("definitions", [])
    _defs_cache[role] = (now, defs)
    return defs


async def execute_write_tool(
    user_id: str,
    conversation_id: str,
    channel: str,
    tool_name: str,
    tool_input: dict[str, Any],
) -> str:
    """Run ONE write tool. Returns the tool-result content string — ALREADY
    PII-masked by the Node executeTool seam (do not mask again here)."""
    r = await _bridge().post(
        "/api/elaya/bridge",
        json={
            "op": "execute_tool",
            "userId": user_id,
            "conversationId": conversation_id,
            "channel": channel,
            "toolName": tool_name,
            "input": tool_input,
        },
    )
    if r.status_code != 200:
        # An honest tool-level failure the model can relay — never a crash.
        return '{"error": "that action could not be completed right now"}'
    return r.json().get("content", "{}")


async def execute_bridged_read_tool(
    user_id: str,
    conversation_id: str,
    channel: str,
    tool_name: str,
    tool_input: dict[str, Any],
) -> str:
    """Run ONE bridged READ tool (BRIDGED_READ_TOOL_NAMES — the vendor pair) in
    Node, where the one ranker lives. Same op and same masking seam as a write;
    only the failure copy differs — a lookup that failed must not read like an
    action that was refused."""
    r = await _bridge().post(
        "/api/elaya/bridge",
        json={
            "op": "execute_tool",
            "userId": user_id,
            "conversationId": conversation_id,
            "channel": channel,
            "toolName": tool_name,
            "input": tool_input,
        },
    )
    if r.status_code != 200:
        return '{"error": "that lookup could not be completed right now"}'
    return r.json().get("content", "{}")


async def execute_proposed(user_id: str, action_id: str) -> tuple[str, str]:
    """Resolver-only: execute a still-live proposal. Returns (status, line) —
    the deterministic, code-generated line the user sees."""
    r = await _bridge().post(
        "/api/elaya/bridge",
        json={"op": "execute_proposed", "userId": user_id, "actionId": action_id},
    )
    if r.status_code != 200:
        return ("failed", "I couldn't complete that just now — tell me again what you'd like.")
    data = r.json()
    return (data.get("status", "failed"), data.get("line", ""))
