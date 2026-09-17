"""Supabase access — one thin PostgREST client, service-role, shared.

The brain reads with the SERVICE key and scopes in code from the verified
principal (the parity rule, plan-elaya law 4): a turn may run sessionless
(WhatsApp, jobs), so RLS-by-session can never be the mechanism. This mirrors
the Node side's admin-client convention (Q-13) exactly.

Deliberately httpx over a heavy SDK: the brain needs GET/POST/PATCH with
headers — nothing more. `schema` switches Accept-Profile; a table that moved out
of `public` (gia, member) is routed by _MOVED_TABLES below, so callers need not know.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings

_client: httpx.AsyncClient | None = None


# ── Where a table lives (schema restructure, 2026-09-17) ──────────────────
# `leads` and its family moved public → gia (migration 0210) and the member twin
# moved public → member (0211). A table's schema is a property of the TABLE, not of
# the call site, so it is resolved here, once: a caller that writes
# select("leads", …) cannot forget the schema and get a 404 back. An explicit
# schema= argument (sia, freshdesk) always wins. RPCs are unaffected — the functions
# stayed in public and their search_path was widened.
# Mirrors GIA_TABLES / MEMBER_TABLES in src/lib/supabase/schemas.ts.
_MOVED_TABLES: dict[str, str] = {
    **{
        t: "gia"
        for t in (
            "leads",
            "lead_activities",
            "lead_notes",
            "lead_raw_payloads",
            "lead_sla_timers",
            "lead_product_enquiries",
            "deals",
            "sla_policies",
            "agent_routing_config",
            "revival_candidates",
            "revival_policies",
            "domain_targets",
            "ad_creatives",
            "ad_spend_daily",
            "ad_account_recharges",
            "task_gia_meta",
            "whatsapp_conversations",
            "whatsapp_messages",
            "whatsapp_conversation_reads",
            "whatsapp_notification_logs",
            "service_cases",
            "conversation_hooks",
        )
    },
    **{
        t: "member"
        for t in (
            "members",
            "member_access_log",
            "member_anticipations",
            "member_chunks",
            "member_documents",
            "member_events",
            "member_facts",
            "member_health_events",
            "member_health_policy",
            "member_people",
            "member_relations",
            "member_snapshot",
        )
    },
}


def _resolve_schema(table: str, schema: str) -> str:
    """The caller's schema wins when it named one; otherwise the table's own home."""
    return _MOVED_TABLES.get(table, schema) if schema == "public" else schema


def _base_headers(schema: str) -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Accept-Profile": schema,
        "Content-Profile": schema,
    }


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=f"{settings.supabase_url}/rest/v1",
            timeout=httpx.Timeout(15.0, connect=5.0),
        )
    return _client


async def select(
    table: str,
    params: dict[str, str],
    *,
    schema: str = "public",
) -> list[dict[str, Any]]:
    """GET rows. `params` are raw PostgREST query params (select, filters, order, limit)."""
    r = await client().get(
        f"/{table}", params=params, headers=_base_headers(_resolve_schema(table, schema))
    )
    r.raise_for_status()
    return r.json()


async def select_count(
    table: str,
    params: dict[str, str],
    *,
    schema: str = "public",
) -> tuple[list[dict[str, Any]], int]:
    """GET rows + the exact total count (Prefer: count=exact / Content-Range)."""
    headers = {**_base_headers(_resolve_schema(table, schema)), "Prefer": "count=exact"}
    r = await client().get(f"/{table}", params=params, headers=headers)
    r.raise_for_status()
    total = 0
    content_range = r.headers.get("content-range", "")
    if "/" in content_range:
        tail = content_range.rsplit("/", 1)[-1]
        total = int(tail) if tail.isdigit() else 0
    return r.json(), total


async def insert(
    table: str,
    row: dict[str, Any],
    *,
    schema: str = "public",
    returning: bool = True,
) -> dict[str, Any] | None:
    """POST one row. Returns the created row (Prefer: return=representation)
    unless returning=False. Raises on any error — callers decide fatality."""
    headers = _base_headers(_resolve_schema(table, schema))
    headers["Prefer"] = "return=representation" if returning else "return=minimal"
    r = await client().post(f"/{table}", json=row, headers=headers)
    r.raise_for_status()
    if not returning:
        return None
    rows = r.json()
    return rows[0] if rows else None


async def update(
    table: str,
    patch: dict[str, Any],
    filters: dict[str, str],
    *,
    schema: str = "public",
) -> None:
    """PATCH rows matching raw PostgREST filters. Raises on error."""
    headers = _base_headers(_resolve_schema(table, schema))
    headers["Prefer"] = "return=minimal"
    r = await client().patch(f"/{table}", json=patch, params=filters, headers=headers)
    r.raise_for_status()


async def rpc(fn: str, args: dict[str, Any], *, schema: str = "public") -> Any:
    """Call a Postgres function via PostgREST — the SAME SECURITY DEFINER RPCs
    the Node brain uses (service-role, revoked tier). Parity by construction:
    identical SQL produces identical numbers on both brains."""
    r = await client().post(f"/rpc/{fn}", json=args, headers=_base_headers(schema))
    r.raise_for_status()
    return r.json()


async def select_one(
    table: str,
    params: dict[str, str],
    *,
    schema: str = "public",
) -> dict[str, Any] | None:
    rows = await select(table, {**params, "limit": "1"}, schema=schema)
    return rows[0] if rows else None


# ── Domain reads the brain foundation needs ──────────────────────────────


async def get_profile(user_id: str) -> dict[str, Any] | None:
    """The VERIFIED identity read — authorization only ever derives from
    public.profiles (the Golden Rule / rule 09), never from a request payload."""
    return await select_one(
        "profiles",
        {"select": "id, role, domain, full_name, is_active", "id": f"eq.{user_id}"},
    )


async def get_llm_job_config(job_type: str) -> dict[str, Any] | None:
    """llm_providers row for a tier — read PER REQUEST, never cached at module
    level (the sla_policies pattern): a model switch is a DB edit, no deploy."""
    return await select_one(
        "llm_providers",
        {
            "select": "job_type, provider, model, max_tokens, active",
            "job_type": f"eq.{job_type}",
            "active": "eq.true",
        },
    )


async def get_pii_masking_depth() -> str:
    """elaya_settings pii_masking_depth — 'light' is the shipped default."""
    row = await select_one(
        "elaya_settings", {"select": "value", "key": "eq.pii_masking_depth"}
    )
    value = (row or {}).get("value")
    return value if value in ("off", "light", "strict") else "light"


async def get_daily_message_cap() -> int:
    """elaya_settings daily_message_cap — the Node default (200) when unset."""
    row = await select_one(
        "elaya_settings", {"select": "value", "key": "eq.daily_message_cap"}
    )
    value = (row or {}).get("value")
    return value if isinstance(value, int) and value > 0 else 200


async def get_session_expiry_hours() -> int:
    """elaya_settings session_expiry_hours — the Node default (24) when unset."""
    row = await select_one(
        "elaya_settings", {"select": "value", "key": "eq.session_expiry_hours"}
    )
    value = (row or {}).get("value")
    return value if isinstance(value, int) and value > 0 else 24
