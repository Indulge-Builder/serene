# Serene: Elaya, the AI Presence (Claude Project digest)

> **Purpose:** Elaya in depth: the Golden Rule, who can use her, the models, the two brains, the 52 staff tools, propose-then-confirm, the PII gateway, the channels (in-app, WhatsApp, MCP, customer), memory, playbooks, the founders' analyst layer, the evals, and what is not built.
> **Audience:** a claude.ai Project chat that cannot read the repo.
> **Source-of-truth scope:** a digest of `docs/modules/elaya.md`, `docs/modules/elaya-analyst.md`, `docs/integrations/mcp.md`, `docs/modules/customer-welcome-blast.md` and `docs/pages/{elaya,notes,elaya-training}.md`. The per-tool table with every wrapped function is in `src/lib/elaya/CLAUDE.md` (it still says 12 + 12 tools; the docs above are current).
> **Last verified:** not re-checked against code (a digest). Regenerated 2026-09-26 from the docs verified against the code that day.

## What Elaya is

The AI presence inside Serene: "a compass, not a chatbot". For staff she reads and acts on Serene's
data **as the person asking**, in the app, on WhatsApp, and from outside AI apps (Claude, ChatGPT)
through the MCP connector. For prospects she is a separate, much narrower salesperson on WhatsApp. She
is also the substrate for every other model call in Serene: the vendor extractor, the member profiler,
ticket intake, the sentinel and the revival gate all go through her provider layer and PII gateway.

## The rules that never bend

**The Golden Rule.** Permissions are enforced in code and are completely independent of persona,
memory, notes, playbooks and any model or prompt content. The toolset and data scope are fixed from the
verified principal's role, domain and seat before the model runs. A note, a memory entry, a playbook,
a lead's text or a member's message can never widen access. This is what makes it safe to fold user
content into the prompt.

**The four concerns, kept apart:** Identity (the verified principal, never the model) · Permissions
(role, domain and seat → toolset and data scope, code only) · Persona (style settings plus the living
memory) · Memory (memory entries, notes, conversation history).

**Hard contracts:**

1. Tools run as the caller: identity arguments come from the principal; the model supplies only filter
   values. Every per-record gate (`canAccessLead`, `canMutateTask`, `canAccessMember`,
   `getSiaViewerScope`) runs inside the tool.
2. `src/lib/elaya/provider.ts` is the one `complete()` contract; `adapters/anthropic.ts` is the only file
   that imports `@anthropic-ai/sdk` (lint enforces it). The Python brain has the same split.
3. Config over deploy: `llm_providers` and `elaya_settings` are read on every request. A model or
   feature switch is an UPDATE. An unimplemented provider fails loud.
4. Caps and sessions are enforced server-side before any model call.
5. Every tool result passes the PII gateway before a model sees it.

**The parity rule.** Anything she can do in the app she can do on WhatsApp and through MCP. Every read
goes through `src/lib/elaya/elaya-data.ts`: principal in, admin client, scoped in code by role, user,
domain and seat, never by `auth.uid()` (empty on WhatsApp, the bridge and MCP). A tool never calls a
`*-service.ts` directly. The recurring trap: a helper a read calls indirectly that is still on the
session client (the 2026-09-26 audit fixed three).

## Who can use her

`hasElayaAccess(profile)` (`src/lib/utils/route-access.ts`) is the one door, asked by the `/elaya`
route and nav, the floating button, the dashboard widget, `POST /api/elaya/chat` (403), the WhatsApp
staff gate (one plain line back; the message is still swallowed, never a lead), the MCP connector (zero
tools and a sentence), `/m/elaya`, and the Python brain's mirror `has_elaya_access`. Yes: admin,
founder, the tech workbench, and `ELAYA_DOMAINS` (concierge + onboarding, house, shop, legacy). No:
finance, marketing, business (founder's call 2026-09-26: with only tasks and notes in reach the model
drifted toward promising things it could not do), and guests.

**The principal.** `resolveStaffPrincipal(profile)` → `StaffPrincipal` (user id, role, domain, display
name, `siaRole`, `queendomId`, and the role-gated toolset from `TOOLSET_BY_ROLE`). `ElayaPrincipal` is
a union with `CustomerPrincipal` (a lead, not a profile, with two customer tools), so staff code can
never be reached from a customer turn. Every tool re-reads the seat from the database at call time.

| Role | Read tools | Write tools | Total |
| --- | --- | --- | --- |
| agent | 27 | 14 | 41 |
| manager | 31 | 15 | 46 |
| admin, founder | 36 | 16 | 52 |
| guest | 0 | 0 | 0 |

The toolset is only the first gate; inside the tools the person decides the rows (agent own leads,
manager their domain, a concierge seat their queendom, the Joker head every queendom without members'
money).

## Models (a row per tier in `llm_providers`, read per call)

| Tier | Model (last recorded) | Used by |
| --- | --- | --- |
| `routing` | `claude-haiku-4-5` | the Python router; single judgements: memory reader, alert tone reads, deep-read judging, revival gate, vendor request reader and extractor, observation reader, ticket intake, sentinel |
| `reasoning` | `claude-sonnet-5` (flipped from `claude-sonnet-4-6` on 2026-08-27, measured 28 of 28 on the evals) | most Python specialists, the frozen Node brain, the customer brain, the brief writer, deep-read plan and answer, playbook drafter, member profiler and judgement, ticket drafts, lesson writer |
| `heavy` | `claude-opus-5` (0176) | Python only: the `analytics` and `analyst` specialists; falls back to `reasoning` |

The provider contract carries an optional `effort` (low, medium, high) because the Claude 5 models think
by default and thinking counts against `maxTokens`. A user turn may carry `files` (base64 + media type;
the vendor extractor sends bills). The router, the analyst, the background jobs and the profiler share
one Anthropic account, so a reached spend limit stops them all; the brain says so in plain words.

## The two brains

**Both channels think in the Python brain** (`backend/app/`, FastAPI on AWS ECS Fargate in
`ap-south-1`, behind CloudFront). The in-process Node brain (`src/lib/elaya/brain.ts`) is **frozen**,
kept only as the rollback, **retirement targeted 2026-10-16** (gated on thirty clean days). **"Python
thinks, Node mutates":** every write, and every read whose logic lives in Node, runs through a bridge
into the same Node registry.

**The switch:** `elaya_settings` rows `brain_whatsapp` = `"python"` (since 2026-09-03) and
`brain_in_app` = `"python"` (since 2026-09-04); missing or malformed reads as `node`. No automatic
fallback mid-turn. Rollback is one UPDATE. The transport is `src/lib/elaya/python-brain.ts` (bearer
`BRAIN_API_SECRET` to `ELAYA_BRAIN_URL/v1/elaya/chat`, https required in production, typed rejections:
cap 429, duplicate 409, unauthorized, unowned 404, unavailable). The SSE frame vocabulary
(`meta`/`delta`/`tool`/`done`/`error`) lives once in `src/lib/elaya/sse.ts`.

**Inside the Python brain:** `api/chat.py` (bearer → principal → daily cap → conversation → persist the
user message → resolver → turn → persist the reply → `done`; a provider failure becomes a plain saved
line) · `brain/router.py` (one routing call picks a specialist and a matching playbook per message) ·
`brain/specialists.py` (ten: leads, tasks, analytics (heavy), vendors, tickets, analyst (heavy,
admin/founder), freshdesk, groups, members, general; a specialist is a menu, never a permission) ·
`brain/loop.py` (up to 10 tool rounds, reads in parallel, writes in order, a 12,000-character result cap,
24,000 for `get_member_360`) · `brain/persona.py`, `resolver.py`, `confirmation.py`, `pii.py` (ports) ·
`tools/registry.py` (12 local reads plus the bridged names) · `tools/write_bridge.py`.

**Tool search (2026-09-24).** The router no longer decides what she may call. Every tool the role
allows is in the catalog on every turn: the specialist's tools load up front, the rest are deferred and
found by the provider's server-side tool search. A wrong route costs one search, not a dead turn. A name
outside the principal's toolset is never sent.

**The bridge** (`POST /api/elaya/bridge`, bearer, principal re-derived from `profiles` on every call):
`definitions` (the exact Node schemas for this role), `execute_tool` (one write or bridged read through
the same `executeTool` dispatch and PII seam), `execute_proposed` (run a proposal the Python resolver
confirmed). 24 reads and all 16 writes are bridged; 12 reads are ported locally (`search_leads`,
`get_cold_leads`, `get_lead_details`, `get_my_tasks`, `find_teammate`, `search_deals`,
`get_performance_snapshot`, `get_helpdesk_content`, `get_escalations`, `get_domain_health`,
`get_campaigns`, `get_budget`). A bridge outage degrades a turn to local reads. A new tool **name** must
be added to the Python lists and the brain redeployed (`copilot svc deploy` from `backend/`).

## The staff tools (36 read, 16 write)

"Inline" executes in its own turn and logs an `executed` row; "propose" records a proposal and waits for
a human yes.

| Area | Tools |
| --- | --- |
| Leads and deals | `search_leads`, `get_cold_leads`, `get_lead_details`, `get_lead_whatsapp_chat`, `search_deals` (reads); `add_lead_note`, `log_call` (sets the outcome, new→touched, arms the SLA cadence), `create_lead_task` (inline); `update_lead_status`, `reassign_lead` (manager+), `log_deal` (propose) |
| Tasks and people | `get_my_tasks`, `find_teammate` (the company directory; a sound-alike match carries no user id) (reads); `create_personal_task` (assigning someone else is manager+; repeat reminders), `create_group_task`, `create_subtask` (one assignee each), `update_task_status`, `update_task` (inline); `delete_task` (propose) |
| Oversight | `get_performance_snapshot` (all staff); `get_escalations`, `get_domain_health`, `get_campaigns`, `get_activity_feed` (manager+); `get_budget` (admin, founder) |
| Knowledge | `get_helpdesk_content` |
| Members | `get_member_360` (the first call for any member question; 24,000 characters), `get_member_overview`, `list_members`, `get_member_profile`, `get_member_finance` (never the Joker head), `get_member_recent_messages`, `search_member_history` |
| WhatsApp groups | `list_sia_groups`, `get_sia_group_messages`, `search_sia_messages` (all staff carry them; `sia-access.ts` decides; the model gets a letters-only handle, never a jid) |
| Freshdesk | `get_freshdesk_overview`, `search_freshdesk_tickets`, `get_freshdesk_ticket` (same scoping) |
| Sia tickets | `list_tickets`, `get_ticket` (reads); `add_ticket_note` (inline); `move_ticket_status` (propose) |
| Vendors | `find_vendors` (THE ranking), `get_vendor_details` (a merged-away id answers with the keeper); usable by admin, founder and the concierge domain (`canAskAboutVendors`) |
| Money | `get_books_overview` (admin, founder, live Zoho); `get_subscriptions` (admin, founder, finance, tech; never a password) |
| Analyst | `describe_database`, `query_database`, `get_live_pulse` (reads, admin/founder); `start_deep_read` (inline, admin/founder) |
| Self-correction | `raise_improvement_request` (inline, all staff) |
| Customer only | `get_company_material`, `note_customer_interest` (a separate registry and dispatch) |

Adding a read: a function in `elaya-data.ts`, then the tool. Adding a write: pick the tier, wrap an
existing core, gate with the principal before the core. Checklists: `src/lib/elaya/CLAUDE.md`.

## Writes and confirmation

- **Two tiers, split in code.** An inline tool calls its core in `run()`. A propose tool's `run()` has
  **no branch that reaches a core**: it supersedes older proposals, records a `proposed` row with a
  before-snapshot, and returns "awaiting confirmation". The five propose tools: `update_lead_status`,
  `reassign_lead`, `log_deal`, `delete_task`, `move_ticket_status`.
- **The resolver** runs first in every turn (Node `brain.ts`, Python `resolver.py`). It classifies the
  human's latest message with `classifyConfirmation` (a pure English and Hinglish allow-list,
  whole-message match, default `other` = cancel; ported word for word to Python). Only `affirmative`
  executes (through `executeProposedAction`, or the bridge's `execute_proposed`). A proposal older than
  15 minutes is dismissed. The executor re-resolves the target, re-checks access and the
  before-snapshot; the confirmation line is written by code, never the model.
- **The ledger** is `elaya_actions`: who, tool, target, channel, before and after. Proposed rows move
  once to executed, failed or dismissed.
- Writes wrap the same cores the UI calls (`lead-mutations.ts`, `task-mutations.ts`,
  `ticket-mutations.ts`), so caches, SLA, notifications and reminders behave identically. Lead text can
  at most cause a proposal, never an execution. Every `dueAt` without a zone is IST.
- **Repeat reminders** (0232): `remindEveryHours` (0.5 to 24) for up to 72 hours; a Trigger.dev nudge
  pings the assignee in-app and on WhatsApp until the task closes. The tools report how the assignee was
  reached and she must say when someone has no phone.

## The PII gateway

`maskPii(value, depth)` walks every tool result. Depth from `pii_masking_depth`: `off` (debug only),
`light` (default: phones keep the last 4 digits, emails the first letter and domain, names stay),
`strict`. An exact UUID is never masked. A WhatsApp group id looks like a phone, so tools hand the model
a handle that survives the mask (`siaGroupHandle()`). Background jobs mask their input too; the member
profiler adds its own name vault (`12-sia-concierge.md`).

## Channels

| Channel | Entry | Brain | Streams | Writes |
| --- | --- | --- | --- | --- |
| In-app | `POST /api/elaya/chat` from `/elaya`, the floating button, the dashboard widget, `/m/elaya` | Python (Node on rollback) | yes, SSE | yes |
| WhatsApp staff | Gupshup webhook → `tryHandleElayaWhatsAppMessage` | Python (Node on rollback) | no, one reply (split into parts when long) | yes |
| MCP | `/api/mcp` | none: the outside app's model thinks | n/a | no (read tools only) |
| Customer WhatsApp | the end of the lead pipeline | the separate Node customer brain | no | only the lead's own interests |

- **In-app:** session → `hasElayaAccess` → burst limit (20 a minute) → Zod → the brain switch. On Python
  the route proxies frames. `maxDuration` 180 s. After the reply is saved, the memory reader runs.
- **WhatsApp staff gate** (`services/elaya-whatsapp.ts`): the sender's number is matched to an active
  profile. A match is always handled by Elaya, so **a staff message never becomes a lead**; no match goes
  to the lead pipeline untouched, which is why **a blank `profiles.phone` turns a teammate's messages into
  a lead**. Dedup on the Gupshup message id. Voice notes transcribed first (Deepgram, staff names as
  keyword boosts), never stored. A turn still thinking after 15 s sends one holding line. Replies pass
  `markdownToWhatsApp()` and are split, never truncated. `waFreeTextWindowOpen()` is THE 24-hour-window
  check (the brief and alerts use it too).
- **One conversation per user across channels** (24-hour window). **The daily cap** is 200 user messages
  from IST midnight across both chat channels, checked before anything is persisted. MCP calls are not
  messages (their own limit: 60 tool calls a minute).

## The MCP connector (Elaya's third channel)

Serene is a remote MCP server at `https://<site>/api/mcp`. An AI app (Claude.ai, Claude Desktop, Claude
Code, ChatGPT developer mode, Cursor, Gemini CLI) adds the URL, sends the person to Serene's consent page
(`/oauth/consent`, Supabase's OAuth 2.1 server with dynamic client registration), and from then calls
Elaya's **read** tools as that person. The connector owns no tool list: it publishes the principal's
read toolset from the registry and runs every call through `executeTool` (toolset re-check, validation,
per-record gates, PII mask). Tokens are ordinary Supabase user JWTs; the role is read from `profiles` on
every call.

- **Who:** the role must be in the `mcp_audience` settings row (seeded to every role but guest; a broken
  row falls back to founder and admin) **and** `hasElayaAccess` must pass. Anyone else signs in and gets
  zero tools and a sentence.
- **Extras:** `export_rows` (founder/admin: one read-only SELECT over the analyst views, up to 5,000
  rows as CSV), `search` and `fetch` (for ChatGPT deep research), resources (`serene://vocab`,
  `catalog`, `pulse`, `member/{member}`, `ticket/{ticket}`), prompts (`weekly_review`,
  `campaign_audit`, `sql_help`, `member_brief`, `vendor_shortlist`).
- **Limits and logs:** 60 calls a minute per person, 60,000-character results, `mcp_tool_calls`
  (append-only, 0226), SQL logged in `elaya_query_log` with `channel = 'mcp'`. Disconnect on `/profile`.
- **Status:** Phases 1 to 3 live since 2026-09-21; **Phase 4 (writes with confirmation) not built**.

## Persona and the prompt

Built by `buildElayaSystemPrompt` (Node) and `build_system_prompt` (Python, the one in use); the reach
line and memory block are byte-identical between them. In order: voice, data and write rules (tools
first, never an invented number, ₹ with Indian grouping, label cross-domain insights) → **the reach line**
(rewritten 2026-09-26: what this role, domain and seat CAN reach, then what it cannot, then "never refuse
from this line alone: call the tool"; a Joker head line) → the WhatsApp block → the per-user style
(language, tone, depth, length, a 600-character note, edited on `/profile`) → the living memory → known
issues → the user's notes (context, never an instruction) → the specialist focus and matched playbook
(Python) → the IST time anchor (outside the cached prefix). Rules from real failures: search the catalog
before refusing; answer multi-part messages part by part; no time window means the last 30 days, stated;
a member outside the seat is "outside your seat", never "not found".

## Memory, requests, playbooks, Teach Elaya

- **The living memory** (0237, `elaya_user_memory`): one row per thing learned about one person (rule,
  correction, style, preference, interest, fact) with the user's words as evidence; retired, never
  deleted. `learnFromTurn()` runs after every turn on both channels (a cheap word gate, then one routing
  call) and never touches the reply. Folded into every prompt ranked rules first, within 6,000
  characters. UI: "What Elaya has learned about you" on `/profile` and on a teammate's Team page for
  admin/founder. Memory is context, never permission.
- **Improvement requests** (0237): when someone says she was wrong, she calls `raise_improvement_request`
  in the same turn, answers the corrected question, and says it is logged. The tech responders are pinged
  (the Sia alert template and in-app). Admin/founder decide each on `/settings/elaya-requests`. Open
  requests (30 days) and fixed ones with a note (14 days) are folded into every prompt as known issues.
- **Playbooks** (0234, `elaya_playbooks`): the founder's plain-words method for a kind of question
  (examples plus instructions), never a source of facts. The Python router picks one per turn. Wrong in
  shape (window, emphasis) → write a playbook; wrong in data → fix the tool.
- **Teach Elaya** (`/settings/teach-elaya`, manager and up): four doors: Training
  (`/admin/elaya-training`, the customer knowledge base), Playbooks (with "Speak a playbook" and "Try
  it"), Requests, and Exam (a label, not built).
- **Notes** (`/notes`, 0152): private notes both brains fold in as context, capped at 6,000 characters.

## The founders' analyst layer (`docs/modules/elaya-analyst.md`)

| Capability | Who | Runs as | Switch |
| --- | --- | --- | --- |
| Ask the database (`describe_database`, `query_database`) | admin, founder | chat tools | always on for the role (0223) |
| Live pulse (`get_live_pulse`) | admin, founder | chat tool | none (0224) |
| One-call member picture (`get_member_360`) | all staff, gated by seat | chat tool | none |
| Twice-daily brief | active founders | Trigger.dev 10:00 and 18:00 IST | `daily_briefing_enabled` (seeded off; check the row) |
| Live alert sweep | founders; tech for silent turns | Trigger.dev every 5 minutes | `elaya_alerts_enabled` (seeded off) |
| Deep read and saved labels (`start_deep_read`) | admin, founder | Trigger.dev job | spend cap `elaya_deep_read_spend_cap_usd` (default $50) |

- **Ask the database, four locks:** a login-less role `elaya_reader` that sees only `elaya_read`; **41
  clean views with explicit columns** (no phone, email, password or WhatsApp id; ids are md5); a runner in
  a READ ONLY transaction wrapped as a sub-select (one SELECT, no semicolons, a row cap, an 8-second
  timeout); one door (`public.elaya_run_query()`, service role only, every call logged to
  `elaya_query_log`, results masked again). Rehearsed on production in a rolled-back transaction:
  fourteen attacks refused. **Verified metrics** (`constants/elaya-metrics.ts`) give the same number to
  the same question (active members by queendom, members waiting on us, response time by queendom,
  Freshdesk by queendom, frustrated members, renewals with usage). New data = a new view in a migration.
- **The pulse:** sales today, work, members waiting for a reply (`getWaitingGroups`, THE read, looking
  back 30 days, ignoring "ok thanks"), Freshdesk. About 1.6 seconds.
- **The brief** (`elaya-briefing.ts`, prompt `briefing-v4`): the window's raw record through the
  read-only door (Freshdesk per queendom, every member and internal group message with reply gaps, who is
  waiting, tone, feedback, occasions, renewals, staff load, Zoho). Written short: **Needs you today**,
  **Going well**, **By queendom** ("30 new tickets, 12 went overdue", both numbers of the window), where
  service can be better, Team, **Internal team**, Money, Today. No Gia leads or deals by the founders'
  decision. Delivered into each founder's Elaya conversation, on WhatsApp (free text inside the 24-hour
  window, else a one-line template ping), and in-app. Falls back to a plain numbers version.
- **Alerts:** unanswered members (60 minutes, 08:00 to 23:00 IST), Freshdesk escalated or reopened, sour
  tone in a member group (routing read, severity 2 or 3), and Elaya's own silent turns (to the tech
  responders). Each alert is a row first (unique `dedupe_key`, 6-hour cooldown).
- **The deep read:** for questions no column answers. Plan (reusing saved label sets) → count → fetch
  through the read-only door → reuse verdicts whose evidence is unchanged → a money check against the
  cap (asks in chat above it) → judge 100 rows a call, 12 calls side by side behind a rate gate →
  continue in a new job near the time budget → answer with coverage and the cost in rupees. No row cap,
  no refusal for size. Verdicts land in `elaya_labels`, queryable later; a nightly top-up (05:30 IST)
  refreshes asked-about sets. Measured: 4,689 tickets in 31 seconds for about ₹21.

## The customer channel (`docs/modules/customer-welcome-blast.md`)

A different principal (the lead), persona, brain (Node, stays after the Node staff loop retires) and a
two-tool registry (`get_company_material`, `note_customer_interest`); it can never reach staff code.
First touch must be an approved Gupshup template, then she answers from the curated knowledge base only
(₹ only, no invented services or prices, no AI reveal). One welcome per lead ever (`welcomed_at`). The
lead pipeline still runs; an agent's reply takes over. **Status:** built 2026-06-26; it no-ops until
`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set (not confirmed in production).

## Evals

`evals/` drives the real app from outside: signs in an eval user, posts each case to `/api/elaya/chat`,
checks the reply, the persisted tool calls and the `elaya_actions` rows, against either brain.
`golden/core.yaml` (35 cases from real messages: Hinglish, voice artifacts, confirmation flows, an
injection probe) and `golden/founders.yaml` (25 real founder questions). **No AI change ships without a
run; every real bug becomes a case first.** The eval account and test lead are hidden from real users.

## Data and settings

Tables: `elaya_conversations`, `elaya_messages` (append-only), `elaya_actions`, `user_context` (style +
the legacy learned blurb), `llm_providers`, `elaya_settings`, `elaya_notes`, `elaya_training_assets`,
`elaya_playbooks`, `elaya_user_memory`, `elaya_improvement_requests`, `elaya_query_log`, `elaya_jobs`,
`elaya_labels`, `elaya_alerts`, `mcp_tool_calls`. Settings rows: `daily_message_cap` (200),
`pii_masking_depth` (light), `session_expiry_hours` (24), `brain_whatsapp` / `brain_in_app`,
`mcp_audience`, the analyst switches above. Other modules keep their switches in the same table
(`member_profiler_enabled`, `ticket_intake_enabled`, `member_assessment_enabled`,
`intake_lessons_enabled`).

## Design language

A presence, not a chatbot. Her glyph always breathes when she is present; her colour is always
`--theme-accent`; inline suggestions wait 400 ms; proposal cards have exactly two actions (Approve,
Dismiss); one dot or nothing, never a number badge; cross-domain insights name their source domain; she
is the only presence allowed to animate text. Law: `docs/design/DESIGN-DNA.md` §15.

## Not built (do not assume these exist)

- The in-app Approve/Dismiss proposal card (confirmation is a typed yes on every channel).
- MCP writes (Phase 4).
- Semantic search or embeddings of any kind (topic search uses model-supplied related words).
- Voice replies (text to speech); voice is input only.
- Reading images, documents or video, and the voice notes in member groups (staff voice notes to
  Elaya are transcribed). The only file a model reads today is a vendor bill in the extractor; a
  staff image on WhatsApp gets a "text only" reply. Plan only:
  `docs/architecture/media-understanding-plan.md`.
- The Exam page on Teach Elaya.
- Hands: Elaya handing member jobs to outside agents from a second WhatsApp number. Step 1 is
  committed (migration 0245, not applied); no page, tool or traffic yet (`docs/architecture/hands-plan.md`).
- Elaya for finance, marketing and business.
- The Node brain's retirement (targeted 2026-10-16).
