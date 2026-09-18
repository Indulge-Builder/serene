"""The specialists — the orchestrator vision, right-sized (plan-elaya Phase 1.3).

We deliberately do NOT port the 24-tools-in-one-prompt design (a measured
weakness: more tools per prompt = more wrong picks). Each specialist is a
PROFILE — trimmed toolset + focused prompt + model tier — not a separate
trained model (that comes in Phase 6 by distillation).

The tier is a DB job_type (llm_providers): 'reasoning' (Sonnet 5 today) for
normal work, 'heavy' (Opus 5 today) for deep analytical turns. Swapping any
model is an UPDATE, never a deploy.

A specialist's toolset is intersected with the principal's ROLE-gated toolset
at turn time (loop.py) — a manager routed to analytics never sees get_budget,
because the role gate cuts it even though the specialist lists it.

Persona parity note: these prompts are focused seeds for the pilot spine.
Before the traffic flip, the full persona (persona.ts — language mirroring,
data-firmness, formatting laws, the propose-protocol block) ports verbatim
per specialist, and the eval suite is the judge of sameness.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.llm.registry import JobType

@dataclass(frozen=True)
class Specialist:
    id: str
    description: str  # what the router matches on
    focus: str  # the ONE line that varies per specialist inside the shared persona
    toolset: list[str] = field(default_factory=list)
    job: JobType = "reasoning"


SPECIALISTS: dict[str, Specialist] = {
    "leads": Specialist(
        id="leads",
        description=(
            "lead lookups, HOW MANY leads / lead counts, lead status/details/notes, cold or "
            "stale leads, member/prospect questions, talking points or case studies for pitching, "
            "logging a call on a lead, adding a note to a lead, changing a lead's status, "
            "reassigning a lead, recording/closing a deal, creating a follow-up or reminder for a "
            "lead — including mixed asks like 'note this on the lead and remind me tomorrow'"
        ),
        focus=("Focus for this conversation: LEAD questions and actions — finding leads, their "
               "details and notes, which are going cold, logging calls, notes, status changes, "
               "follow-ups, deals, and the Call Intelligence library for pitching."),
        toolset=[
            "search_leads",
            "get_lead_details",
            "get_cold_leads",
            "get_helpdesk_content",
            "find_teammate",
            "add_lead_note",
            "log_call",
            "create_lead_task",
            "update_lead_status",
            "reassign_lead",
            "log_deal",
        ],
    ),
    "tasks": Specialist(
        id="tasks",
        description=(
            "the user's tasks, to-dos, follow-ups, deadlines, reminders, what's due, "
            "creating/assigning/delegating a task or reminder, marking a task done, updating or "
            "deleting a task, team/group tasks, finding a teammate/colleague by name (BUT a "
            "note/call/reminder ABOUT A LEAD or after talking to a lead/member belongs to the "
            "leads category, even when it also asks for a reminder)"
        ),
        focus=("Focus for this conversation: the user's TASKS and follow-ups — open work, "
               "deadlines, creating and assigning tasks and reminders, updating or completing "
               "them, and resolving teammates by name."),
        toolset=[
            "get_my_tasks",
            "find_teammate",
            "create_personal_task",
            "create_group_task",
            "create_subtask",
            "update_task_status",
            "update_task",
            "delete_task",
        ],
    ),
    "analytics": Specialist(
        id="analytics",
        description=(
            "performance numbers, team roster, domain health scorecards, campaign performance, "
            "ad spend and budget, revenue and deals, escalations / SLA breaches / overdue follow-ups "
            "/ what needs attention or is slipping, trends, comparisons, reports (NOT simple "
            "lead lookups or lead counts — those are the leads category)"
        ),
        focus=("Focus for this conversation: ANALYTICAL questions over business data — "
               "performance, escalations, domain health, campaigns, budget, and deals. Ground "
               "every number in a tool call; never estimate."),
        toolset=[
            "get_escalations",
            "get_performance_snapshot",
            "get_domain_health",
            "get_campaigns",
            "get_budget",
            "search_deals",
        ],
        job="heavy",  # the Opus tier — deep reasoning turns (DB-switchable)
    ),
    "vendors": Specialist(
        id="vendors",
        description=(
            "suppliers and vendors: who do we use for something (a cake, a florist, a car, a "
            "visa, a hotel), the best vendor or supplier for a member request, a vendor's "
            "details, contacts, past jobs, score or rating, what a vendor offers or refuses"
        ),
        focus=("Focus for this conversation: VENDORS — who the team has used for a kind of "
               "request, the best supplier for a job, and one vendor's record. Every suggestion "
               "comes from find_vendors; quote the matching past job as evidence and never "
               "invent a supplier. A null score means unrated, not bad."),
        # Both vendor tools run in Node through the bridge (the one ranker);
        # admin/founder only — the role gate cuts them for everyone else.
        toolset=["find_vendors", "get_vendor_details", "find_teammate"],
    ),
    "tickets": Specialist(
        id="tickets",
        description=(
            "Sia tickets and member requests: what is open, what is late, where a ticket stands, "
            "a ticket number like T-000042, adding a note to a ticket, moving a ticket to another "
            "status (sourcing, awaiting member, awaiting vendor, in delivery, resolved), what the "
            "sentinel said, a member's pending requests"
        ),
        focus=("Focus for this conversation: TICKETS — the genie's queue and one ticket's story. "
               "Read with list_tickets / get_ticket before answering; a status move is a proposal "
               "the user confirms with a yes, never a done deed until the system says so."),
        toolset=["list_tickets", "get_ticket", "add_ticket_note", "move_ticket_status", "find_teammate"],
    ),
    "members": Specialist(
        id="members",
        description=(
            "a member of Indulge: what we know about them (preferences, dislikes, dietary, family, the "
            "people around them, their genie and queendom, their health score, their open requests, their "
            "renewal), what they said in their WhatsApp group (asked for lately, ever mentioned a topic, "
            "summarise the chat), and their money (owes anything, paid, invoice due)"
        ),
        focus=("Focus for this conversation: MEMBERS — one member's story from Serene's own records. "
               "Always call get_member_overview first to find the member and their member_id. Then pick by "
               "the question: get_member_profile for what we KNOW (saved facts, people, team, health, "
               "requests, what is coming up); get_member_recent_messages or search_member_history for what "
               "was SAID in their WhatsApp group; get_member_finance for money. A briefing uses the profile "
               "first and the recent messages second. Every statement must come from a returned field or "
               "message, with its date or source; if a tool returns nothing, say nothing is on record — never "
               "fill the gap from memory, and never describe a member the tool did not return. Several "
               "matching members means ask which one."),
        # All five run in Node through the bridge; Node scopes rows to the reader's queendom.
        toolset=["get_member_overview", "get_member_profile", "get_member_recent_messages",
                 "search_member_history", "get_member_finance", "find_teammate"],
    ),
    "general": Specialist(
        id="general",
        description="greetings, small talk, questions about Elaya/Serene itself, anything that fits nowhere else",
        focus=("Focus for this conversation: general — greetings, questions about Serene "
               "itself, and the user's day."),
        # The safety-net specialist: a mis-routed action message must still find
        # its tool, so general carries the full write surface + the resolvers.
        toolset=[
            "get_my_tasks",
            "find_teammate",
            "get_helpdesk_content",
            "search_leads",
            "get_member_overview",
            "get_member_profile",
            "get_member_finance",
            "get_member_recent_messages",
            "search_member_history",
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
            "find_vendors",
            "get_vendor_details",
            "list_tickets",
            "get_ticket",
            "add_ticket_note",
            "move_ticket_status",
        ],
    ),
}

DEFAULT_SPECIALIST = "general"
