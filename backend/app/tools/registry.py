"""The tool registry — the read-tool parity port of lib/elaya/tools/registry.ts.

Eleven of the twelve Node read tools live here (get_escalations is DEFERRED on
purpose: its live SLA-breach predicates need a careful study pass, and wrong
breach data to a founder is the worst possible bug — a missing tool is honest,
a drifted one is not). Descriptions are copied from the Node registry verbatim
where behavior depends on them — the model's tool choice is part of parity.

Parity mechanics, in order of importance:
  • RPC-backed reads call the SAME SECURITY DEFINER RPCs (revoked tier,
    service key) the Node data layer calls — identical SQL, identical numbers.
  • Query-backed reads replicate the Node service predicates exactly (cold
    threshold, status exclusions, caps, ordering).
  • Identity args are PRINCIPAL-derived inside each tool; the model supplies
    filter values only. Dispatch refuses anything outside the principal's
    toolset. Every result is PII-masked by the loop before the model sees it.
  • Result shaping (keys, caps, truncation notes) mirrors the Node tools so
    the model reads the same world from either brain.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.brain.fuzzy import name_matches_fuzzy
from app.core import supa
from app.core.periods import OVERSIGHT_PERIODS, PERIODS, ist_midnight, period_range

COLD_LEAD_THRESHOLD_DAYS = 5  # pinned to constants/leads.ts — change both together
GIA_DOMAINS = ("onboarding", "house", "shop", "legacy")
DEFAULT_GIA_DOMAIN = "onboarding"
LEAD_STATUSES = (
    "new", "touched", "in_discussion", "nurturing", "won", "lost", "junk", "cold",
)
_SLUG_SAFE = re.compile(r"^[a-z0-9_-]+$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    run: Callable[[Any, dict[str, Any]], Awaitable[Any]]
    roles: frozenset[str] | None = None  # None = all staff


def _full_name(first: str | None, last: str | None) -> str:
    return " ".join(p for p in (first, last) if p) or "this lead"


# ═════════════════════════════════════════════
# Leads
# ═════════════════════════════════════════════


async def _search_leads(principal: Any, args: dict[str, Any]) -> Any:
    search = str(args.get("search", "") or "").strip()
    statuses = [s for s in (args.get("statuses") or []) if s in LEAD_STATUSES]
    page = max(1, min(int(args.get("page") or 1), 50))
    page_size = 30

    term = search if len(search) >= 3 else None
    search_too_short = bool(search) and len(search) < 3

    params: dict[str, str] = {
        "select": (
            "id, slug, first_name, last_name, status, phone, source, utm_campaign, "
            "call_count, last_call_outcome, created_at, domain, "
            "assignee:profiles!leads_assigned_to_fkey(full_name)"
        ),
        "archived_at": "is.null",
        "order": "created_at.desc",
        "offset": str((page - 1) * page_size),
        "limit": str(page_size),
    }
    if principal.role == "agent":
        params["assigned_to"] = f"eq.{principal.user_id}"
    elif principal.role == "manager":
        params["domain"] = f"eq.{principal.domain}"
    if term:
        params["search_text"] = f"ilike.*{term}*"
    if statuses:
        params["status"] = f"in.({','.join(statuses)})"

    rows, total = await supa.select_count("leads", params)
    has_more = page * page_size < total

    result: dict[str, Any] = {
        "totalCount": total,
        "page": page,
        "pageSize": page_size,
        "shownThisPage": len(rows),
        "hasMore": has_more,
        "leads": [
            {
                "leadId": r["id"],
                "name": _full_name(r.get("first_name"), r.get("last_name")),
                "slug": r.get("slug"),
                "status": r.get("status"),
                "phone": r.get("phone"),
                "source": r.get("source"),
                "campaign": r.get("utm_campaign"),
                "callCount": r.get("call_count"),
                "lastCallOutcome": r.get("last_call_outcome"),
                "createdAt": r.get("created_at"),
                "assignee": (r.get("assignee") or {}).get("full_name"),
            }
            for r in rows
        ],
    }
    if search_too_short:
        result["searchTooShort"] = True
        result["note"] = (
            "The search term was too short to match on — showing recent leads instead. "
            "Ask the user for the full name or phone number."
        )

    # Owner hint (agents only — the Node searchLeads protocol): an own-scoped
    # empty search may still match a TEAMMATE's lead in the agent's domain.
    # Name + owner only (no slug/id/phone) — informative, never access-widening.
    if principal.role == "agent" and not rows and term:
        owners = await supa.select(
            "leads",
            {
                "select": "first_name, last_name, assignee:profiles!leads_assigned_to_fkey(full_name)",
                "domain": f"eq.{principal.domain}",
                "archived_at": "is.null",
                "search_text": f"ilike.*{term.lower()}*",
                "order": "created_at.desc",
                "limit": "5",
            },
        )
        hints = [
            {
                "name": _full_name(o.get("first_name"), o.get("last_name")),
                "owner": (o.get("assignee") or {}).get("full_name") or "an unassigned queue",
            }
            for o in owners
        ]
        if hints:
            result["ownedByTeammate"] = hints
            result["note"] = (
                "No leads matching that are assigned to this agent. The following matching "
                "leads exist in their domain but belong to a teammate — the agent cannot act "
                "on these; tell them who owns it and suggest asking a manager to reassign."
            )
    return result


async def _get_cold_leads(principal: Any, _args: dict[str, Any]) -> Any:
    # The EXACT /leads going-cold predicate (sla-service getGoingColdLeads):
    # non-archived, non-terminal, last activity older than the threshold,
    # coldest first, cap 100. Scope: agent → own; manager → domain; else all.
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=COLD_LEAD_THRESHOLD_DAYS)).isoformat()
    params: dict[str, str] = {
        "select": (
            "id, slug, first_name, last_name, phone, domain, status, last_activity_at, "
            "assignee:profiles!leads_assigned_to_fkey(full_name)"
        ),
        "archived_at": "is.null",
        "status": 'not.in.("won","lost","junk")',
        "last_activity_at": f"lt.{cutoff}",
        "order": "last_activity_at.asc",
        "limit": "100",
    }
    if principal.role == "agent":
        params["assigned_to"] = f"eq.{principal.user_id}"
    elif principal.role == "manager":
        params["domain"] = f"eq.{principal.domain}"
    rows = await supa.select("leads", params)
    return {
        "thresholdDays": COLD_LEAD_THRESHOLD_DAYS,
        "totalCount": len(rows),
        "leads": [
            {
                "name": _full_name(r.get("first_name"), r.get("last_name")),
                "slug": r.get("slug"),
                "status": r.get("status"),
                "phone": r.get("phone"),
                "domain": r.get("domain"),
                "assignee": (r.get("assignee") or {}).get("full_name"),
                "lastActivityAt": r.get("last_activity_at"),
            }
            for r in rows
        ],
    }


def _can_access_lead(principal: Any, lead: dict[str, Any]) -> bool:
    """canAccessLead — THE per-lead security predicate (access.ts), verbatim."""
    if principal.role in ("admin", "founder"):
        return True
    if principal.role == "manager":
        return lead.get("domain") == principal.domain
    if principal.role == "agent":
        return lead.get("assigned_to") == principal.user_id
    return False


async def _get_lead_details(principal: Any, args: dict[str, Any]) -> Any:
    ref = str(args.get("leadId", "")).strip()
    if not ref:
        return {"error": "leadId is required"}
    key = "id" if _UUID.match(ref) else "slug"
    lead = await supa.select_one(
        "leads",
        {
            "select": (
                "id, slug, first_name, last_name, status, phone, email, city, domain, "
                "source, utm_campaign, service_interests, call_count, last_call_outcome, "
                "assigned_to, created_at, status_changed_at, last_activity_at, "
                "assignee:profiles!leads_assigned_to_fkey(full_name)"
            ),
            key: f"eq.{ref}",
        },
    )
    if lead is None or not _can_access_lead(principal, lead):
        # One message for both not-found and not-permitted (S-09 principle).
        return {"error": "Lead not found or you are not permitted to view it."}

    notes = await supa.select(
        "lead_notes",
        {
            "select": "content, created_at, author:profiles!lead_notes_author_id_fkey(full_name)",
            "lead_id": f"eq.{lead['id']}",
            "order": "created_at.desc",
            "limit": "5",
        },
    )
    return {
        "lead": {
            "name": _full_name(lead.get("first_name"), lead.get("last_name")),
            "slug": lead.get("slug"),
            "status": lead.get("status"),
            "phone": lead.get("phone"),
            "email": lead.get("email"),
            "city": lead.get("city"),
            "domain": lead.get("domain"),
            "source": lead.get("source"),
            "campaign": lead.get("utm_campaign"),
            "serviceInterests": lead.get("service_interests"),
            "callCount": lead.get("call_count"),
            "lastCallOutcome": lead.get("last_call_outcome"),
            "assignee": (lead.get("assignee") or {}).get("full_name"),
            "createdAt": lead.get("created_at"),
            "statusChangedAt": lead.get("status_changed_at"),
            "lastActivityAt": lead.get("last_activity_at"),
        },
        "recentNotes": [
            {
                "content": n.get("content"),
                "author": (n.get("author") or {}).get("full_name"),
                "createdAt": n.get("created_at"),
            }
            for n in notes
        ],
    }


# ═════════════════════════════════════════════
# Tasks (three kinds — the same RPC twins the Node data layer calls)
# ═════════════════════════════════════════════


async def _get_my_tasks(principal: Any, _args: dict[str, Any]) -> Any:
    import asyncio

    gia, personal, groups = await asyncio.gather(
        supa.rpc(
            "get_gia_tasks",
            {"p_user_id": principal.user_id, "p_role": principal.role, "p_domain": principal.domain},
        ),
        supa.rpc("get_personal_tasks", {"p_user_id": principal.user_id, "p_limit": 20}),
        supa.rpc("get_group_task_summaries_for_user", {"p_user_id": principal.user_id}),
        return_exceptions=True,
    )
    gia = gia if isinstance(gia, list) else []
    personal = personal if isinstance(personal, list) else []
    groups = groups if isinstance(groups, list) else []

    GIA_CAP, GROUP_CAP = 25, 25
    truncated = []
    if len(gia) > GIA_CAP:
        truncated.append("lead follow-ups")
    if len(groups) > GROUP_CAP:
        truncated.append("group workspaces")

    result: dict[str, Any] = {
        "followUps": [
            {
                "taskId": t.get("id"),
                "title": t.get("title"),
                "status": t.get("status"),
                "priority": t.get("priority"),
                "dueAt": t.get("due_at"),
                "taskType": t.get("task_type"),
                "leadName": _full_name(t.get("lead_first_name"), t.get("lead_last_name")),
                "leadSlug": t.get("lead_slug"),
                "leadPhone": t.get("lead_phone"),
            }
            for t in gia[:GIA_CAP]
        ],
        "personalTasks": [
            {
                "taskId": t.get("id"),
                "title": t.get("title"),
                "status": t.get("status"),
                "priority": t.get("priority"),
                "dueAt": t.get("due_at"),
                "tags": t.get("tags"),
            }
            for t in personal
        ],
        "groupTasks": [
            {
                "groupId": g.get("id"),
                "title": g.get("title"),
                "status": g.get("status"),
                "priority": g.get("priority"),
                "dueAt": g.get("due_at"),
                "subtaskCount": g.get("subtask_count"),
                "completedCount": g.get("completed_count"),
            }
            for g in groups[:GROUP_CAP]
        ],
    }
    if truncated:
        result["note"] = (
            f"Showing the first 25 of more {' and '.join(truncated)} — tell the user "
            "there are more in the Tasks page if they need the full list."
        )
    return result


# ═════════════════════════════════════════════
# Teammates — the name→userId STAFF lookup, with the structural fuzzy gate
# ═════════════════════════════════════════════


async def _find_teammate(principal: Any, args: dict[str, Any]) -> Any:
    term = str(args.get("search", "")).strip()
    if not term:
        return {"error": "search is required"}

    base = {
        "select": "id, full_name, role, domain",
        "is_active": "eq.true",
        "role": "neq.guest",
        "order": "full_name.asc",
    }
    exact = await supa.select("profiles", {**base, "full_name": f"ilike.*{term}*", "limit": "20"})
    fuzzy = False
    matches = exact
    if not exact:
        # Sound-alike fallback (voice-transcription artifacts). Staff table is
        # tiny; fetch all active and rank in code — same as the Node service.
        everyone = await supa.select("profiles", {**base, "limit": "200"})
        matches = [u for u in everyone if name_matches_fuzzy(u.get("full_name", ""), term)][:5]
        fuzzy = bool(matches)

    CAP = 15
    result: dict[str, Any] = {
        # STRUCTURAL fuzzy gate: a sound-alike match carries NO userId, so the
        # model CANNOT assign to it this turn — it must confirm the person and
        # re-look-up by the exact name. Capability withheld in code is the only
        # reliable gate (a prompt note alone was overridden — eval 2026-08-27).
        "teammates": [
            {
                **({} if fuzzy else {"userId": u["id"]}),
                "name": u.get("full_name"),
                "role": u.get("role"),
                "domain": u.get("domain"),
            }
            for u in matches[:CAP]
        ],
    }
    if fuzzy:
        result["fuzzyMatch"] = True
        result["note"] = (
            "No exact match — these are only closest-SOUNDING guesses (the name may be a "
            "voice-transcription artifact), so no userId is provided and assignment is "
            'impossible this turn. Ask the user "You mean <name>?" and wait. After they '
            "confirm, call find_teammate again with the confirmed exact name to get the "
            "userId, then assign."
        )
    elif not matches:
        result["note"] = (
            "No teammate matched that name, even by sound. Ask the user for the full name "
            "or who they mean — never guess a person to assign work to."
        )
    elif len(matches) > CAP:
        result["note"] = (
            f"Showing the first {CAP} matches — ask the user to narrow the name if the one "
            "they mean isn't here."
        )
    return result


# ═════════════════════════════════════════════
# Deals
# ═════════════════════════════════════════════


async def _search_deals(principal: Any, args: dict[str, Any]) -> Any:
    search = str(args.get("search", "") or "").strip()
    deal_type = args.get("deal_type")
    deal_category = args.get("deal_category")
    page = max(1, min(int(args.get("page") or 1), 50))
    page_size = 20

    params: dict[str, str] = {
        "select": (
            "contact_name, deal_amount, deal_type, deal_duration, deal_category, domain, "
            "source, won_at, assignee:profiles!deals_assigned_to_fkey(full_name), "
            "lead:leads!deals_lead_id_fkey(slug)"
        ),
        "order": "won_at.desc",
        "offset": str((page - 1) * page_size),
        "limit": str(page_size),
    }
    if principal.role == "agent":
        params["assigned_to"] = f"eq.{principal.user_id}"
    elif principal.role == "manager":
        params["domain"] = f"eq.{principal.domain}"
    if search:
        safe = search.replace(",", " ").replace("(", " ").replace(")", " ")
        params["or"] = f"(contact_name.ilike.*{safe}*,phone.ilike.*{safe}*)"
    if deal_type:
        params["deal_type"] = f"eq.{deal_type}"
    if deal_category:
        params["deal_category"] = f"eq.{deal_category}"

    rows, total = await supa.select_count("deals", params)
    return {
        "totalCount": total,
        "deals": [
            {
                "contactName": d.get("contact_name"),
                "amount": d.get("deal_amount"),
                "dealType": d.get("deal_type"),
                "duration": d.get("deal_duration"),
                "category": d.get("deal_category"),
                "domain": d.get("domain"),
                "source": d.get("source"),
                "wonAt": d.get("won_at"),
                "assignee": (d.get("assignee") or {}).get("full_name"),
                "leadSlug": (d.get("lead") or {}).get("slug"),
            }
            for d in rows
        ],
    }


# ═════════════════════════════════════════════
# Performance / oversight / budget — the RPC twins, verbatim
# ═════════════════════════════════════════════


async def _get_performance_snapshot(principal: Any, args: dict[str, Any]) -> Any:
    from datetime import datetime, timezone

    period = args.get("period") if args.get("period") in PERIODS else "this_week"
    frm, to = period_range(period)

    if principal.role == "agent":
        pulse = await supa.rpc(
            "get_agent_today_pulse_for_user",
            {
                "p_agent": principal.user_id,
                "p_date_from": frm,
                "p_date_to": to,
                "p_today_start": ist_midnight(datetime.now(timezone.utc)).isoformat(),
            },
        )
        row = pulse[0] if isinstance(pulse, list) and pulse else pulse
        return {"view": "agent_pulse", "period": period, **(row or {})}

    roster = await supa.rpc(
        "get_agent_roster_performance_for_elaya",
        {
            "p_date_from": frm,
            "p_date_to": to,
            **({"p_domain": principal.domain} if principal.role == "manager" else {}),
        },
    )
    roster = roster if isinstance(roster, list) else []
    ROSTER_CAP = 40
    result: dict[str, Any] = {"view": "roster", "period": period, "agents": roster[:ROSTER_CAP]}
    if len(roster) > ROSTER_CAP:
        result["note"] = (
            f"Showing {ROSTER_CAP} of {len(roster)} agents. Ask to narrow by domain or "
            "period for the rest."
        )
    return result


async def _get_domain_health(principal: Any, args: dict[str, Any]) -> Any:
    period = args.get("period") if args.get("period") in OVERSIGHT_PERIODS else "this_month"
    frm, to = period_range(period)
    domains = [principal.domain] if principal.role == "manager" else list(GIA_DOMAINS)
    cards = await supa.rpc(
        "get_domain_health_metrics",
        {"p_domains": domains, "p_date_from": frm, "p_date_to": to},
    )
    return {"period": period, "domains": cards if isinstance(cards, list) else []}


async def _get_campaigns(principal: Any, args: dict[str, Any]) -> Any:
    period = args.get("period") if args.get("period") in OVERSIGHT_PERIODS else "this_month"
    frm, to = period_range(period)
    rows = await supa.rpc(
        "get_campaign_metrics",
        {
            "p_date_from": frm,
            "p_date_to": to,
            **({"p_domain": principal.domain} if principal.role == "manager" else {}),
        },
    )
    rows = rows if isinstance(rows, list) else []
    rows.sort(key=lambda c: c.get("total_leads") or 0, reverse=True)
    CAP = 25
    result: dict[str, Any] = {
        "period": period,
        "campaigns": [
            {
                "campaign": c.get("campaign_name"),
                "domain": c.get("domain"),
                "totalLeads": c.get("total_leads"),
                "won": c.get("won"),
                "lost": c.get("lost"),
                "inDiscussion": c.get("in_discussion"),
                "nurturing": c.get("nurturing"),
                "converted": c.get("converted"),
            }
            for c in rows[:CAP]
        ],
    }
    if len(rows) > CAP:
        result["note"] = f"Showing the top {CAP} of {len(rows)} campaigns by lead volume."
    return result


async def _get_budget(_principal: Any, args: dict[str, Any]) -> Any:
    period = args.get("period") if args.get("period") in OVERSIGHT_PERIODS else "this_month"
    frm, to = period_range(period)
    rows = await supa.rpc("get_budget_summary", {"p_date_from": frm, "p_date_to": to})
    rows = rows if isinstance(rows, list) else []

    def num(v: Any) -> float:
        try:
            return float(v or 0)
        except (TypeError, ValueError):
            return 0.0

    mapped = [
        {
            "campaign": r.get("campaign_key"),
            "spend": num(r.get("total_spend")),
            "leads": int(num(r.get("lead_count"))),
            "deals": int(num(r.get("deal_count"))),
            "revenue": num(r.get("deal_revenue")),
        }
        for r in rows
    ]
    mapped.sort(key=lambda r: r["spend"], reverse=True)
    CAP = 25
    result: dict[str, Any] = {
        "period": period,
        "totals": {
            "spend": sum(r["spend"] for r in mapped),
            "leads": sum(r["leads"] for r in mapped),
            "deals": sum(r["deals"] for r in mapped),
            "revenue": sum(r["revenue"] for r in mapped),
        },
        "campaigns": [
            {
                **r,
                # "—" semantics: None at a zero denominator — NEVER ₹0.
                "costPerLead": (r["spend"] / r["leads"]) if r["leads"] else None,
                "costPerDeal": (r["spend"] / r["deals"]) if r["deals"] else None,
            }
            for r in mapped[:CAP]
        ],
    }
    if len(mapped) > CAP:
        result["note"] = f"Showing the top {CAP} of {len(mapped)} campaigns by spend."
    return result


# ═════════════════════════════════════════════
# Helpdesk / Call Intelligence
# ═════════════════════════════════════════════

_CASE_SELECT = "id, domain, category, tags, title, summary, outcome_note, city, country, is_featured, sort_order"
_HOOK_SELECT = "id, domain, category, hook, context, sort_order"


async def _get_helpdesk_content(principal: Any, args: dict[str, Any]) -> Any:
    interests = [
        i for i in (str(x).strip().lower() for x in (args.get("interests") or [])) if _SLUG_SAFE.match(i)
    ][:6]
    city = str(args.get("city", "") or "").strip().lower()
    has_city = bool(city) and bool(_SLUG_SAFE.match(city))

    remapped = principal.domain not in GIA_DOMAINS
    domain = DEFAULT_GIA_DOMAIN if remapped else principal.domain
    meta: dict[str, Any] = {"sourceDomain": domain}
    if remapped:
        meta["note"] = (
            f"These cases are from the {domain} library (this user's own domain has none) — "
            f"label them as {domain} material when you cite them."
        )

    if interests or has_city:
        case_params: dict[str, str] = {
            "select": _CASE_SELECT,
            "domain": f"eq.{domain}",
            "order": "is_featured.desc,sort_order.asc",
            "limit": "6",
        }
        if interests and has_city:
            case_params["or"] = f'(category.in.({",".join(interests)}),tags.cs.{{"{city}"}})'
        elif interests:
            case_params["category"] = f"in.({','.join(interests)})"
        else:
            case_params["tags"] = f'cs.{{"{city}"}}'
        hook_params: dict[str, str] = {
            "select": _HOOK_SELECT,
            "domain": f"eq.{domain}",
            "order": "sort_order.asc",
            "limit": "5",
        }
        if interests:
            hook_params["category"] = f"in.({','.join(interests)})"
        import asyncio

        cases, hooks = await asyncio.gather(
            supa.select("service_cases", case_params),
            supa.select("conversation_hooks", hook_params),
        )
        return {**meta, "cases": cases, "hooks": hooks}

    # No filters → a featured slice of the library, never the full dump.
    import asyncio

    cases, hooks = await asyncio.gather(
        supa.select(
            "service_cases",
            {
                "select": _CASE_SELECT,
                "domain": f"eq.{domain}",
                "order": "is_featured.desc,sort_order.asc",
                "limit": "10",
            },
        ),
        supa.select(
            "conversation_hooks",
            {"select": _HOOK_SELECT, "domain": f"eq.{domain}", "order": "sort_order.asc", "limit": "5"},
        ),
    )
    return {**meta, "cases": cases, "hooks": hooks}


# ═════════════════════════════════════════════
# Escalations — the live-breach read (port of sla-service getEscalatedLeads +
# getOverdueGiaTasks). Two truths, both computed the way the /escalations page
# computes them so Elaya and the page can never disagree:
#   • a breached lead = a non-cadence SLA timer that FIRED within the window,
#     OR is still `pending` with its deadline already past (the fire-job may
#     simply not have run) — kept ONLY while the policy's trigger status still
#     matches the lead (a moved-on lead is resolved, not a live breach).
#   • an overdue follow-up = an open gia task stamped overdue_at, OR whose
#     due_at is already past (the stamp job may not have run).
# ═════════════════════════════════════════════

_ESCALATION_WINDOW_DAYS = 7
_RECIPIENT_ORDER = {"agent": 0, "manager": 1, "founder": 2}


def _oversight_domain(principal: Any) -> str | None:
    return principal.domain if principal.role == "manager" else None


async def _breached_leads(domain: str | None) -> list[dict[str, Any]]:
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    window_start = (now - timedelta(days=_ESCALATION_WINDOW_DAYS)).isoformat()

    params: dict[str, str] = {
        "select": (
            "lead_id, rule_code, status, fired_at, scheduled_fire_at, "
            "leads!inner(id, slug, first_name, last_name, phone, domain, status, "
            "assignee:profiles!leads_assigned_to_fkey(full_name))"
        ),
        "status": "in.(fired,pending)",
        "or": f"(fired_at.gte.{window_start},and(status.eq.pending,scheduled_fire_at.lte.{now_iso}))",
        "leads.archived_at": "is.null",
        "leads.status": 'not.in.("won","lost","junk")',
        "order": "scheduled_fire_at.desc",
        "limit": "500",
    }
    if domain:
        params["leads.domain"] = f"eq.{domain}"

    import asyncio

    timers, policies = await asyncio.gather(
        supa.select("lead_sla_timers", params),
        supa.select(
            "sla_policies",
            {"select": "code, trigger_kind, trigger_value, recipient_role", "active": "eq.true"},
        ),
    )
    by_code = {p["code"]: p for p in policies}

    grouped: dict[str, dict[str, Any]] = {}
    recipient_sets: dict[str, set[str]] = {}
    for row in timers:
        lead = row.get("leads")
        if not lead:
            continue
        if str(row.get("rule_code", "")).startswith("CAD-"):
            continue
        breached_at = (
            row.get("fired_at")
            if row.get("status") == "fired"
            else row.get("scheduled_fire_at")
            if row.get("scheduled_fire_at") and row["scheduled_fire_at"] <= now_iso
            else None
        )
        if not breached_at or breached_at < window_start:
            continue
        policy = by_code.get(row.get("rule_code"))
        if not policy or policy.get("trigger_kind") != "status":
            continue
        if policy.get("trigger_value") != lead.get("status"):
            continue

        recipient_sets.setdefault(lead["id"], set()).add(policy.get("recipient_role"))
        existing = grouped.get(lead["id"])
        if existing:
            if breached_at > existing["breachedAt"]:
                existing["breachedAt"] = breached_at
        else:
            grouped[lead["id"]] = {
                "name": _full_name(lead.get("first_name"), lead.get("last_name")),
                "slug": lead.get("slug"),
                "status": lead.get("status"),
                "phone": lead.get("phone"),
                "domain": lead.get("domain"),
                "assignee": (lead.get("assignee") or {}).get("full_name"),
                "breachedAt": breached_at,
            }

    for lead_id, roles in recipient_sets.items():
        if lead_id in grouped:
            grouped[lead_id]["escalatesTo"] = sorted(roles, key=lambda r: _RECIPIENT_ORDER.get(r, 9))
    return sorted(grouped.values(), key=lambda r: r["breachedAt"], reverse=True)


async def _overdue_gia_tasks(domain: str | None) -> list[dict[str, Any]]:
    from datetime import datetime, timezone

    now_iso = datetime.now(timezone.utc).isoformat()
    params: dict[str, str] = {
        "select": (
            "id, title, due_at, overdue_at, priority, assigned_to, "
            "task_gia_meta!inner(lead_id, leads!inner(id, slug, first_name, last_name, domain))"
        ),
        "or": f"(overdue_at.not.is.null,and(due_at.not.is.null,due_at.lte.{now_iso}))",
        "status": "in.(to_do,in_progress,in_review)",
        "task_gia_meta.leads.archived_at": "is.null",
        "order": "due_at.desc",
        "limit": "100",
    }
    if domain:
        params["task_gia_meta.leads.domain"] = f"eq.{domain}"
    rows = await supa.select("tasks", params)

    shaped = []
    for r in rows:
        meta = r.get("task_gia_meta") or {}
        if isinstance(meta, list):  # !inner can come back as a 1-list
            meta = meta[0] if meta else {}
        lead = meta.get("leads")
        if not lead:
            continue
        overdue_at = r.get("overdue_at") or (
            r.get("due_at") if r.get("due_at") and r["due_at"] <= now_iso else None
        )
        if not overdue_at:
            continue
        shaped.append(
            {
                "title": r.get("title"),
                "priority": r.get("priority"),
                "dueAt": r.get("due_at"),
                "overdueSince": overdue_at,
                "_assigned_to": r.get("assigned_to"),
                "leadName": _full_name(lead.get("first_name"), lead.get("last_name")),
                "leadSlug": lead.get("slug"),
                "domain": lead.get("domain"),
            }
        )
    shaped.sort(key=lambda r: r["overdueSince"], reverse=True)

    assignee_ids = sorted({s["_assigned_to"] for s in shaped if s["_assigned_to"]})
    names: dict[str, str] = {}
    if assignee_ids:
        profiles = await supa.select(
            "profiles", {"select": "id, full_name", "id": f"in.({','.join(assignee_ids)})"}
        )
        names = {p["id"]: p["full_name"] for p in profiles}
    for s in shaped:
        s["assignee"] = names.get(s.pop("_assigned_to") or "", None)
    return shaped


async def _get_escalations(principal: Any, _args: dict[str, Any]) -> Any:
    import asyncio

    domain = _oversight_domain(principal)
    breached, overdue = await asyncio.gather(_breached_leads(domain), _overdue_gia_tasks(domain))
    return {
        "breachedLeads": breached[:25],
        "overdueTasks": overdue[:25],
        "totalBreachedLeads": len(breached),
        "totalOverdueTasks": len(overdue),
    }


# ═════════════════════════════════════════════
# Registry + role gates (mirrors readToolsForRole)
# ═════════════════════════════════════════════

_MANAGER_UP = frozenset({"manager", "admin", "founder"})
_FOUNDER_UP = frozenset({"admin", "founder"})

_PERIOD_PROP = {
    "period": {"type": "string", "enum": list(PERIODS), "description": "Defaults to this_week"}
}
_OVERSIGHT_PERIOD_PROP = {
    "period": {"type": "string", "enum": list(OVERSIGHT_PERIODS), "description": "Defaults to this_month"}
}


def _obj(props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "object", "properties": props, "additionalProperties": False}
    if required:
        schema["required"] = required
    return schema


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool(
            name="search_leads",
            description=(
                "Search the leads the current user is allowed to see (agents: own assigned leads; "
                "managers: their domain). Call this when the user asks about their leads, pipeline, "
                "or a lead by name/phone fragment. Returns a compact page of leads."
            ),
            input_schema=_obj(
                {
                    "search": {"type": "string", "description": "Name, phone, email or city fragment"},
                    "statuses": {
                        "type": "array",
                        "items": {"type": "string", "enum": list(LEAD_STATUSES)},
                        "description": "Filter by lead statuses",
                    },
                    "page": {"type": "integer", "minimum": 1, "description": "Page number (30 per page)"},
                }
            ),
            run=_search_leads,
        ),
        Tool(
            name="get_cold_leads",
            description=(
                "List the user's leads that are going cold — non-terminal leads (not won/lost/junk) "
                f"with no activity for over {COLD_LEAD_THRESHOLD_DAYS} days, coldest first. Call this "
                "when the user asks which of their leads are going cold, stale, dormant, or need "
                "attention. This is the SAME definition as the /leads going-cold view — do NOT "
                "improvise it from search_leads (which has no recency filter)."
            ),
            input_schema=_obj({}),
            run=_get_cold_leads,
        ),
        Tool(
            name="get_lead_details",
            description=(
                "Fetch one lead by its leadId (from search_leads results) with its 5 most recent "
                "notes. Refuses leads the current user is not permitted to see."
            ),
            input_schema=_obj(
                {"leadId": {"type": "string", "description": "The lead id or slug (from search_leads results)"}},
                required=["leadId"],
            ),
            run=_get_lead_details,
        ),
        Tool(
            name="get_my_tasks",
            description=(
                "The current user's open work across all three kinds: Gia lead follow-up tasks "
                "(managers see their domain's), personal tasks, and group/team task workspaces. "
                "Call when the user asks what to do next, what is due, about follow-ups, or about "
                "team/group work."
            ),
            input_schema=_obj({}),
            run=_get_my_tasks,
        ),
        Tool(
            name="find_teammate",
            description=(
                "Find a COLLEAGUE (a staff member / teammate) by name — NOT a customer or lead. Use "
                'this whenever you need a person to ASSIGN work to: "create a task for Arfam", '
                '"remind Pawani to call the client". It returns each match with their userId — the '
                "handle task tools need for assigneeId. NEVER use search_leads to find a person to "
                "assign work to — that searches customers/prospects, not staff. If the name matches "
                "no teammate, or more than one, ask the user which person — never guess."
            ),
            input_schema=_obj(
                {"search": {"type": "string", "description": "The teammate's name or a fragment of it"}},
                required=["search"],
            ),
            run=_find_teammate,
        ),
        Tool(
            name="search_deals",
            description=(
                "Search closed deals the current user is allowed to see (agents: own; managers: "
                "their domain). Call for questions about revenue, wins, memberships or retail sales."
            ),
            input_schema=_obj(
                {
                    "search": {"type": "string", "description": "Contact name or phone fragment"},
                    "deal_type": {"type": "string", "enum": ["membership", "retail", "sale"]},
                    "deal_category": {"type": "string", "description": "Retail product category (shop deals only)"},
                    "page": {"type": "integer", "minimum": 1, "description": "Page number (20 per page)"},
                }
            ),
            run=_search_deals,
        ),
        Tool(
            name="get_performance_snapshot",
            description=(
                "Performance numbers for a period. Agents get their own pulse (calls today, 14-day "
                "call trend, deals). Managers and above get the per-agent roster for their scope."
            ),
            input_schema=_obj(_PERIOD_PROP),
            run=_get_performance_snapshot,
        ),
        Tool(
            name="get_helpdesk_content",
            description=(
                "Call Intelligence library: proof-point service cases and conversation hooks for the "
                "user's domain. Call when the user wants talking points, case studies, or help "
                "pitching a service interest or city."
            ),
            input_schema=_obj(
                {
                    "interests": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Service-interest slugs (e.g. from a lead's serviceInterests)",
                    },
                    "city": {"type": "string", "description": "City to match case tags against"},
                }
            ),
            run=_get_helpdesk_content,
        ),
        Tool(
            name="get_escalations",
            roles=_MANAGER_UP,
            description=(
                "Managers and above: the live escalations in your scope — leads whose SLA has "
                "breached (going unworked past the deadline) AND lead follow-up tasks that are "
                "overdue. Call when the user asks what needs attention, what's slipping, what's "
                "breached or overdue, or how the team is keeping up. Manager → own domain; "
                "admin/founder → all domains."
            ),
            input_schema=_obj({}),
            run=_get_escalations,
        ),
        Tool(
            name="get_domain_health",
            roles=_MANAGER_UP,
            description=(
                "Managers and above: a health scorecard per domain for a period — leads in, won, "
                'lost, calls made, conversion rate, deals closed and revenue. Call for "how is my '
                'domain doing", "compare the domains", team-level health questions. Manager → own '
                "domain only; admin/founder → all domains. Money is in Indian Rupees."
            ),
            input_schema=_obj(_OVERSIGHT_PERIOD_PROP),
            run=_get_domain_health,
        ),
        Tool(
            name="get_campaigns",
            roles=_MANAGER_UP,
            description=(
                "Managers and above: lead performance broken down by marketing campaign for a period "
                "— leads per campaign and their pipeline mix (new/touched/in discussion/won/lost). "
                "Call for questions about which campaigns are working, campaign lead volume, or "
                "campaign conversion. Manager → own domain; admin/founder → all domains."
            ),
            input_schema=_obj(_OVERSIGHT_PERIOD_PROP),
            run=_get_campaigns,
        ),
        Tool(
            name="get_budget",
            roles=_FOUNDER_UP,
            description=(
                "Founders and admins only: ad spend per campaign for a period, joined to the leads "
                "and deals it produced — spend, leads, deals, revenue, cost-per-lead and "
                "cost-per-deal. Call for budget, ad spend, CPL/CPD, marketing ROI or \"what are we "
                'spending" questions. Org-wide (spend is not domain-scoped). All money is Indian '
                'Rupees; a "—" cost means zero in that denominator (never report it as ₹0).'
            ),
            input_schema=_obj(_OVERSIGHT_PERIOD_PROP),
            run=_get_budget,
        ),
    ]
}


def _tools_for_role(role: str) -> frozenset[str]:
    return frozenset(n for n, t in TOOLS.items() if t.roles is None or role in t.roles)


# ── Write tools (the bridge tranche, 2026-08-30) ─────────────────────────
# NAMES ONLY: definitions come from the Node bridge (op=definitions — Node is
# the single source of the model-facing schema) and execution goes through the
# bridge into the same write-registry/cores. This list mirrors Node's
# writeToolsForRole: reassign_lead is manager+, everything else all-staff.
# The assign-to-another policy on create_personal_task is enforced inside the
# Node tool run(), not here.

WRITE_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "add_lead_note",
        "log_call",
        "create_lead_task",
        "update_lead_status",
        "reassign_lead",
        "log_deal",
        "create_personal_task",
        "create_group_task",
        "create_subtask",
        "update_task_status",
        "update_task",
        "delete_task",
        # Ticket writes (Sia, 2026-09-15): a note executes inline, a move is a proposal —
        # both run through the Node bridge, exactly like the lead and task writes.
        "add_ticket_note",
        "move_ticket_status",
    }
)


def write_tools_for_role(role: str) -> frozenset[str]:
    if role == "guest":
        return frozenset()
    if role in _MANAGER_UP:
        return WRITE_TOOL_NAMES
    return WRITE_TOOL_NAMES - {"reassign_lead"}


# ── Bridged READ tools (2026-09-12) ──────────────────────────────────────
# NAMES ONLY, exactly like the writes: the two vendor tools run through the
# Node bridge (op=execute_tool) instead of being ported. The vendor ranker is
# THE one ranking in the codebase (vendors spec: Elaya's tool, the Sia ticket
# screen and the extension all call it, none re-rank); it already spends a
# model call reading the request and its score math lives in one TS file. A
# Python twin would be a second ranker that drifts within a week. Node keeps
# the schema (op=definitions) and the PII seam; this brain only decides WHEN
# to call. Gated admin/founder to mirror the vendor tables' SELECT policies.

BRIDGED_READ_TOOL_NAMES: frozenset[str] = frozenset({"find_vendors", "get_vendor_details", "list_tickets", "get_ticket"})

# The ticket pair (2026-09-15) is bridged for the same reason: the sentinel's ledger and the
# ticket cores live in Node; every staff role may read tickets (the DATABASE scopes rows to
# the reader's queendom), the vendor pair stays admin/founder.
_BRIDGED_READ_ROLES: dict[str, frozenset[str]] = {
    "find_vendors": _FOUNDER_UP,
    "get_vendor_details": _FOUNDER_UP,
    "list_tickets": frozenset({"agent", "manager", "admin", "founder"}),
    "get_ticket": frozenset({"agent", "manager", "admin", "founder"}),
}


def bridged_read_tools_for_role(role: str) -> frozenset[str]:
    return frozenset(name for name, roles in _BRIDGED_READ_ROLES.items() if role in roles)


def _toolset(role: str) -> frozenset[str]:
    return _tools_for_role(role) | write_tools_for_role(role) | bridged_read_tools_for_role(role)


TOOLSET_BY_ROLE: dict[str, frozenset[str]] = {
    "agent": _toolset("agent"),
    "manager": _toolset("manager"),
    "admin": _toolset("admin"),
    "founder": _toolset("founder"),
    "guest": frozenset(),  # guests converse but get zero data access
}


async def execute_tool(principal: Any, name: str, args: dict[str, Any]) -> Any:
    """THE single dispatch. Toolset membership here — not the prompt — is the
    hard gate; an ungated name gets a calm refusal, never an execution."""
    if name not in principal.toolset:
        return {"error": f"Tool '{name}' is not available to this user."}
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"Tool '{name}' is not available to this user."}
    try:
        return await tool.run(principal, args or {})
    except Exception as e:  # a tool failure is a result, never a crash
        print(f"[tools] '{name}' failed: {e}")
        return {"error": f"Tool '{name}' failed. Tell the user it could not be completed right now."}


def definitions_for(names: list[str]) -> list[dict[str, Any]]:
    return [
        {"name": TOOLS[n].name, "description": TOOLS[n].description, "input_schema": TOOLS[n].input_schema}
        for n in names
        if n in TOOLS
    ]
