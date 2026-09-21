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
    # Roles the ROUTER may offer this specialist to (None = everyone). A menu entry, not a
    # permission: the tool gate still decides what runs. It only stops the router from sending
    # a manager to a specialist whose every tool the role gate would then cut.
    roles: frozenset[str] | None = None


SPECIALISTS: dict[str, Specialist] = {
    "leads": Specialist(
        id="leads",
        description=(
            "what a lead said or we said on the official WhatsApp line with the lead, the chat with a lead, lead lookups, HOW MANY leads / lead counts, lead status/details/notes, cold or "
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
            "get_lead_whatsapp_chat",
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
            "/ what needs attention or is slipping, trends, comparisons, reports, and the "
            "organisation's books from Zoho (how much we are owed, overdue invoices, payables, cash, "
            "what was invoiced or received this month, profit this year), what the team did lately (the "
            "activity feed: what happened in the last hour, today's movement in a domain), and the software "
            "subscriptions and bills the company pays for (what renews, what is overdue) (NOT simple "
            "lead lookups or lead counts — those are the leads category; NOT one member's dues — "
            "that is the members category)"
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
            "get_books_overview",
            "get_activity_feed",
            "get_subscriptions",
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
    "analyst": Specialist(
        id="analyst",
        description=(
            "the founder's analyst: what is happening right now across the company (the pulse, how is "
            "today going, anything I should know, recent activity with nobody named), and any complex, "
            "unusual or cross-cutting question that has to be WORKED OUT from the data: rankings and top "
            "lists, trends over weeks or months, averages and how long things take, comparisons between "
            "people, queendoms, domains or months, which genie or agent did the most of something, "
            "questions that mix members, tickets, chats, vendors, tasks and sales together"
        ),
        focus=("Focus for this conversation: THE FOUNDER'S ANALYST. You are not limited to ready-made "
               "answers: you can work things out. For 'what is happening' use get_live_pulse. For anything "
               "that needs working out, read the catalog once with describe_database, then write your own "
               "read-only SQL with query_database. Think like a careful analyst: restate the question as "
               "what must be counted, over which dates and which filter; break a hard question into two "
               "or three small queries; look at each result before the next; when a query errors, read the "
               "error, fix it and retry. Check that a filter value exists before trusting a zero (status "
               "names, capitalisation). Give the answer first, then ONE line on how you worked it out "
               "(what was counted, the dates, the filter) so it can be sanity-checked, and say when a list "
               "was cut at the row cap. A number you did not get from a tool is never stated."),
        toolset=["get_live_pulse", "describe_database", "query_database", "get_books_overview",
                 "get_freshdesk_overview", "get_member_360", "get_member_overview", "get_activity_feed", "find_teammate"],
        job="heavy",  # the deepest tier: planning and writing queries is the hardest work she does
        roles=frozenset({"admin", "founder"}),
    ),
    "freshdesk": Specialist(
        id="freshdesk",
        description=(
            "Freshdesk, the helpdesk: what is happening in Freshdesk, how many tickets are open / "
            "pending / resolved / escalated, tickets by status, by queendom or group, by agent, by "
            "category, what came in today or this week, which tickets are overdue, finding a "
            "Freshdesk ticket by its number, subject or requester, one Freshdesk ticket's thread "
            "and movements (NOT Sia tickets like T-000042 — those are the tickets category)"
        ),
        focus=("Focus for this conversation: FRESHDESK — the helpdesk as mirrored in Serene. Numbers "
               "come from get_freshdesk_overview, rows from search_freshdesk_tickets, one ticket's "
               "story from get_freshdesk_ticket. Quote counts exactly, say which filters were applied, "
               "and say 'showing N of M' when the list is longer than what you were given. Serene never "
               "writes to Freshdesk: you can read, never change."),
        toolset=["get_freshdesk_overview", "search_freshdesk_tickets", "get_freshdesk_ticket",
                 "get_member_overview", "find_teammate"],
    ),
    "groups": Specialist(
        id="groups",
        description=(
            "a WhatsApp group by ITS NAME or kind rather than by a member: the internal team groups, "
            "vendor groups, groups not linked to any member, listing the groups Sia records, what was "
            "said in a named group, what is happening lately across the groups or the recent group "
            "activity when no member is named, a recent team discussion or talk about a topic (the "
            "talk we had about the app, what did the tech team discuss), and searching ALL groups at "
            "once for a topic (which members asked about something) (NOT one named member's chat — "
            "that is the members category)"
        ),
        focus=("Focus for this conversation: SIA GROUPS — the recorded WhatsApp groups themselves. When the "
               "user names a group, call get_sia_group_messages with that name AT ONCE and answer from the "
               "messages: do not list first, do not ask them to confirm a name they already gave, and never "
               "answer with a message count instead of the content. For a topic across groups use "
               "search_sia_messages (always pass related words). For 'what is happening lately' with no "
               "group named, list the groups and read the two or three most recently active ones. Ask a "
               "question ONLY when a tool returns several candidates, and then name them. If a read comes "
               "back empty for a group that should have messages, try the name once more through "
               "list_sia_groups before saying so. Answer only from returned messages, cite dates, name the "
               "group each line came from, and never invent a group."),
        toolset=["list_sia_groups", "get_sia_group_messages", "search_sia_messages",
                 "get_member_overview", "find_teammate"],
    ),
    "members": Specialist(
        id="members",
        description=(
            "a member of Indulge: what we know about them (preferences, dislikes, dietary, family, the "
            "people around them, their genie and queendom, their health score, their open requests, their "
            "renewal), what they said in their WhatsApp group (asked for lately, ever mentioned a topic, "
            "summarise the chat), and their money (owes anything, paid, invoice due)"
        ),
        focus=("Focus for this conversation: MEMBERS — one member's story from Serene's own records, LIVE. "
               "For ANY question about a member, call get_member_360 FIRST with the name the user said: it "
               "loads everything at once (who they are, health, the state of their WhatsApp chat right now, "
               "the latest messages, open Freshdesk requests, what is coming up, facts, people, timeline, "
               "vendor jobs, money). Answer from ALL of it: lead with what is live and actionable (waiting on "
               "us, open requests, what is coming up), then what matters for the question. Never ask which "
               "aspect they want; ask only when several members match, naming them. Go deeper only when the "
               "answer needs it: older chat with get_member_recent_messages and `before`, a topic across the "
               "whole history with search_member_history, every saved fact with get_member_profile. For a "
               "twisted or analytical question about the member (how often, how fast we reply, trends over "
               "months, compared with others) and you hold query_database: work it out with your own SQL, "
               "filtering by the member_id you were given, and say in one line how. Every statement must come "
               "from a returned field or message, with its date or source; if a tool returns nothing, say "
               "nothing is on record — never fill the gap from memory, and never describe a member the tool "
               "did not return."),
        # Founders and admins also carry the analyst's SQL here (the role gate cuts it for everyone else).
        toolset=["get_member_360", "get_member_overview", "get_member_profile", "get_member_recent_messages",
                 "search_member_history", "get_member_finance", "find_teammate", "describe_database", "query_database"],
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
            "get_member_360",
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
            "get_freshdesk_overview",
            "search_freshdesk_tickets",
            "get_freshdesk_ticket",
            "list_sia_groups",
            "get_sia_group_messages",
            "search_sia_messages",
            # A follow-up ("break that down by queendom") is routed on its own words and can land
            # here: the analyst's tools come along (the role gate cuts them for everyone else).
            "get_live_pulse",
            "describe_database",
            "query_database",
            "get_lead_whatsapp_chat",
            "get_subscriptions",
            "get_activity_feed",
        ],
    ),
}

DEFAULT_SPECIALIST = "general"
