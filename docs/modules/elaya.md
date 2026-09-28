# Elaya

> **Purpose:** the single as-built home for Elaya's core: who can use her, the models, the two brains, the tools, confirmation, the PII gateway, the channels, the daily cap, the persona, the living memory, playbooks, the Teach Elaya pages and the evals.
> **Audience:** engineers, and anyone who needs to know how Elaya really works.
> **Source-of-truth scope:** Elaya's architecture and contracts. The founder/admin intelligence layer (ask the database, pulse, brief, alerts, deep read) lives in [elaya-analyst.md](elaya-analyst.md). The per-tool table with every wrapped function lives in `src/lib/elaya/CLAUDE.md`.
> **Last verified:** 2026-09-26 against `src/lib/elaya/`, `src/lib/mcp/`, `src/app/api/elaya/`, `backend/app/` (the Python brain), the Elaya services and actions in `src/lib/`, and migrations through 0244.

---

## 1. What Elaya is

Elaya is the AI presence inside Serene. For staff she is an assistant that reads and acts on
Serene's data as the person asking, in the app, on WhatsApp, and from outside AI apps (Claude,
ChatGPT) through the MCP connector. For prospects she is a separate, much narrower salesperson on
WhatsApp.

Where each part is documented:

| Topic | Doc |
| --- | --- |
| Core: access, models, brains, tools, confirmation, PII, channels, persona, memory, playbooks, evals | this file |
| Founder/admin intelligence: ask the database, live pulse, twice-daily brief, alert sweep, deep read | [elaya-analyst.md](elaya-analyst.md) |
| Customer WhatsApp Elaya (welcome blast, prospect replies) | [customer-welcome-blast.md](customer-welcome-blast.md) |
| Speech-to-text (Deepgram) | [voice-dictation.md](voice-dictation.md) |
| The `/elaya` page, floating button, dashboard widget, `/m/elaya` | [../pages/elaya.md](../pages/elaya.md) |
| `/notes` (context Elaya reads) | [../pages/notes.md](../pages/notes.md) |
| `/admin/elaya-training` (customer knowledge base) | [../pages/elaya-training.md](../pages/elaya-training.md) |
| The MCP connector | [../integrations/mcp.md](../integrations/mcp.md), [../integrations/mcp-team-guide.md](../integrations/mcp-team-guide.md) |
| Per-tool detail and the non-negotiables for code | `src/lib/elaya/CLAUDE.md` |
| Plan (not built): Elaya hands jobs to outside agents | `../architecture/hands-plan.md` |

---

## 2. The rules that never bend

### The Golden Rule

> Permissions are enforced in code and are completely independent of persona, memory, notes,
> playbooks and any model or prompt content.

The toolset and data scope are fixed from the verified principal's role, domain and seat, in code,
before the model runs. A note, a memory entry, a playbook, a lead's text or a member's message can
never widen access. This is what makes it safe to fold user content into the prompt.

### The four concerns (kept apart)

| Concern | Meaning | Source of truth | Controlled by |
| --- | --- | --- | --- |
| Identity | Who are you? | the verified principal | the system, never the model |
| Permissions | What may you see and do? | role, domain and seat → toolset + data scope | code only |
| Persona | How should I talk to you? | style settings + the living memory | the user, and what Elaya learns |
| Memory | What do I know about you and your work? | memory entries, notes, conversation history | grows over time |

### The hard contracts

1. **Tools run as the caller.** Identity arguments are always taken from the principal; the model
   only supplies filter values. Every per-record gate (`canAccessLead`, `canMutateTask`,
   `canAccessMember`, `getSiaViewerScope`) runs inside the tool.
2. **No provider shape leaks past its adapter.** `src/lib/elaya/provider.ts` is the one
   `complete()` contract; `src/lib/elaya/adapters/anthropic.ts` is the only file that imports
   `@anthropic-ai/sdk` (lint enforces it). The Python brain has the same split
   (`backend/app/llm/provider.py`, `anthropic_adapter.py`).
3. **Config over deploy.** `llm_providers` and `elaya_settings` are read on every request, never
   cached in a module. A model switch or a feature switch is an UPDATE. An unimplemented provider
   fails loud, never a silent fallback.
4. **Caps and sessions are server-side.** The daily cap and the 24-hour session are enforced
   before any model call.
5. **Every tool result passes the PII gateway** before a model sees it (section 8).

### The parity rule

Anything Elaya can do in the app she can do on WhatsApp and through MCP, by construction. Every
read goes through `src/lib/elaya/elaya-data.ts`: it takes the principal, uses the admin client, and
scopes by role, user, domain and seat in code, never by `auth.uid()` (which is empty on WhatsApp,
on the Python bridge and on MCP). A tool never calls a `*-service.ts` directly. The trap that keeps
coming back: a helper that a read calls indirectly is still on the session client (the 2026-09-26
audit fixed three: ticket name maps and the Call Intelligence reads). Details and the fix pattern:
`src/lib/elaya/CLAUDE.md`.

---

## 3. Who can use her

**The door.** Elaya is switched on for admin, founder, the tech workbench, and the domains in
`ELAYA_DOMAINS` (`src/lib/constants/route-permissions.ts`): concierge plus the four Gia domains
(onboarding, house, shop, legacy). Finance, marketing and business have no Elaya for now: with only
tasks and notes in reach the model drifted toward promising things it could not do (founder's
call, 2026-09-26). Guests never have her.

`hasElayaAccess(profile)` in `src/lib/utils/route-access.ts` is the one predicate, asked at every
door:

| Door | What happens without access |
| --- | --- |
| `/elaya` page and the nav (`canAccessRoute`) | redirect to `/dashboard`, no nav item |
| Floating Elaya button (`src/app/(dashboard)/layout.tsx`) | not rendered |
| Dashboard Elaya widget (`domains: ELAYA_DOMAINS`) | not offered |
| `POST /api/elaya/chat` | 403 `formErrors.elayaNotEnabled` |
| WhatsApp staff gate (`elaya-whatsapp.ts`) | one plain line back; the message is still swallowed, never a lead |
| MCP connector (`src/lib/mcp/auth.ts`) | signed in, zero tools and a sentence |
| `/m/elaya` | redirect to `/m` |
| Python brain (`has_elaya_access` in `backend/app/brain/principal.py`) | no principal, no turn |

Opening a domain later is one entry in `ELAYA_DOMAINS` plus the Python mirror.

**The principal.** `resolveStaffPrincipal(profile)` (`src/lib/elaya/principal.ts`) turns the
verified profile into a `StaffPrincipal`: user id, role, domain, display name, the concierge seat
(`siaRole`) and `queendomId` (both used for the reach hint only; every tool re-reads the seat from
the database), and the role-gated `toolset` from `TOOLSET_BY_ROLE`. `ElayaPrincipal` is a
union with `CustomerPrincipal` (a lead, not a profile, with the two customer tools), so staff code
can never be reached from a customer turn. The Python brain builds the same principal from
`profiles` and refuses unknown or inactive users.

**Role toolsets** (Node `TOOLSET_BY_ROLE`, mirrored by names in `backend/app/tools/registry.py`):

| Role | Read tools | Write tools | Total |
| --- | --- | --- | --- |
| agent | 27 | 14 | 41 |
| manager | 31 | 15 | 46 |
| admin, founder | 36 | 16 | 52 |
| guest | 0 | 0 | 0 |

The toolset is only the first gate. Inside the tools, the person decides the rows: an agent sees
their own leads, a manager their domain, a seated concierge teammate their queendom (the Joker head
every queendom, without members' money), and `sia-access.ts` decides Sia groups and Freshdesk. See
[members.md](members.md), [sia.md](sia.md) and `../architecture/auth-and-rbac.md`.

---

## 4. Providers and model tiers

Model choice is a row in `llm_providers`, read per call. `resolveLlmForJob(jobType)`
(`src/lib/elaya/registry.ts`) returns the adapter, model and token budget; the Python twin is
`backend/app/llm/registry.py`.

The models below are the last recorded values; the live value is always the row (the repo cannot
see production data).

| Tier (`job_type`) | Model (last recorded) | Set by | Used by |
| --- | --- | --- | --- |
| `routing` | `claude-haiku-4-5` | 0116 seed | the Python router; Node single judgements: the memory reader, alert tone reads, deep-read judging, revival gate, vendor request reader and extractor, member observation reader, ticket intake, sentinel |
| `reasoning` | `claude-sonnet-5` | data edit 2026-08-27 (was `claude-sonnet-4-6`) | most Python specialists; the frozen Node brain; the customer brain; brief writer, deep-read plan and answer, playbook drafter, member profiler and judgement, ticket drafts, lesson writer |
| `heavy` | `claude-opus-5` | migration 0176 | Python only: the `analytics` and `analyst` specialists. Falls back to `reasoning` when the row is missing or inactive |

The Sonnet 5 flip was measured: full eval run before, one-row edit, full run after (28 of 28).
Node's `LlmJobType` knows only `routing` and `reasoning`. The provider contract carries an optional
`effort` (low, medium, high) because the Claude 5 models think by default and thinking counts
against `maxTokens`; a single structured judgement passes `low`. A user turn may carry `files`
(base64 plus media type, used by the vendor extractor for bills); an adapter that cannot show a
file drops it rather than failing.

The Python router, the analyst and the background jobs all share one Anthropic account with the
member profiler, so a reached spend limit stops them all. The brain says so plainly (section 5.2).

---

## 5. The two brains

Both channels think in the **Python brain** (`backend/app/`, FastAPI on AWS ECS Fargate in
`ap-south-1`, behind a CloudFront HTTPS front). The in-process **Node brain**
(`src/lib/elaya/brain.ts`) is frozen and kept only as the rollback. "Python thinks, Node mutates":
every write, and every read whose logic lives in Node, runs through a bridge into the same Node
registry.

### 5.1 The switch

Two `elaya_settings` rows (migration 0179) pick the brain per message, read per request:

| Row | Value | Since |
| --- | --- | --- |
| `brain_whatsapp` | `"python"` | 2026-09-03 |
| `brain_in_app` | `"python"` | 2026-09-04 |

Anything missing or malformed reads as `node`. There is no automatic fallback between brains
mid-turn (a half-persisted turn must never run twice). A `python` row on a server without
`ELAYA_BRAIN_URL` and `BRAIN_API_SECRET` answers from Node with a warning. Rollback is one line:
`UPDATE elaya_settings SET value = '"node"' WHERE key = 'brain_in_app';` (or `brain_whatsapp`).
Non-production builds honour `ELAYA_BRAIN_OVERRIDE_IN_APP` / `_WHATSAPP` so the eval harness can
point the real route at a local brain; production ignores them.

**The transport** is `src/lib/elaya/python-brain.ts`: `openPythonBrainStream()` (pre-flight
rejection or the live SSE stream, used by the in-app route as a frame proxy) and
`runPythonBrainTurn()` (pump to completion, used by the WhatsApp gate), bearer `BRAIN_API_SECRET`
to `ELAYA_BRAIN_URL/v1/elaya/chat`. It refuses a plain `http://` URL in production. Rejections are
typed: cap (429), duplicate WhatsApp id (409), unauthorized (401/403), unowned conversation (404),
unavailable. It passes only a verified profile id. The SSE frame vocabulary
(`meta`/`delta`/`tool`/`done`/`error`) lives once in `src/lib/elaya/sse.ts`.

### 5.2 The Python brain

| File | Role |
| --- | --- |
| `backend/app/api/chat.py` | `POST /v1/elaya/chat`: bearer check → principal → daily cap → conversation (ownership) → persist the user message → resolver → turn → persist the reply → `done` frame. `classify_turn_failure()` turns a provider error into a plain line saved as her reply (`model_limit`, `model_busy`, `model_timeout`, `failed`) |
| `backend/app/brain/principal.py` | profile → principal, `has_elaya_access` mirror |
| `backend/app/brain/router.py` | one `routing`-tier call picks a specialist per message and, in the same call, the matching playbook. A short subject-less follow-up ("try now", "anyone?") borrows the earlier user messages' subject. Validated in code; unknown → `general` |
| `backend/app/brain/specialists.py` | ten specialists: `leads`, `tasks`, `analytics` (heavy), `vendors`, `tickets`, `analyst` (heavy, admin/founder only), `freshdesk`, `groups`, `members`, `general`. Each is a hot tool set, a focus line and a tier. A specialist is a menu entry, never a permission |
| `backend/app/brain/loop.py` | the turn loop: up to 10 tool rounds, reads run in parallel, writes in call order, PII mask on every local result, 12,000-char result cap (24,000 for `get_member_360`) |
| `backend/app/brain/persona.py` | the system prompt, byte-identical in its shared blocks to `persona.ts` |
| `backend/app/brain/resolver.py`, `confirmation.py` | the confirmation resolver, ported with every invariant (section 7) |
| `backend/app/brain/pii.py` | the PII gateway port |
| `backend/app/tools/registry.py` | the 12 read tools ported locally, plus the names of the bridged reads and writes |
| `backend/app/tools/write_bridge.py` | the bridge client |
| `backend/app/core/elaya_store.py`, `supa.py` | persistence, the daily cap, persona, notes, memory and known-issues reads; `supa.py` maps every table moved to `gia` or `member` to its schema |

**The tool catalog (2026-09-24).** The router no longer decides what she may call. Every tool the
role allows is in the catalog on every turn. The chosen specialist's tools load up front (the hot
set); the rest are deferred and the model finds them with the provider's server-side tool search
(the BM25 variant). A wrong route costs one search instead of a dead turn. A name outside the
principal's toolset is never sent to the model. The assistant's own content blocks are replayed
untouched inside a turn so a discovered tool stays loaded.

**The bridge** (`POST /api/elaya/bridge`, bearer `BRAIN_API_SECRET`, a sanctioned P-02
exception). The profile is re-fetched and the principal re-derived on every call. Three ops:

- `definitions`: the write tools and bridged reads this role carries, so the model sees the exact
  Node schemas (Node is the single source of the tool surface).
- `execute_tool`: one write or bridged read through the same `executeTool` dispatch and PII seam.
- `execute_proposed`: run a still-live proposal the Python resolver has already confirmed.

24 reads run through the bridge (vendors, tickets, members, Freshdesk, books, Sia groups, the
analyst tools, lead WhatsApp chat, subscriptions, activity feed). All 16 writes do. The 12 ported
local reads are: `search_leads`, `get_cold_leads`, `get_lead_details`, `get_my_tasks`,
`find_teammate`, `search_deals`, `get_performance_snapshot`, `get_helpdesk_content`,
`get_escalations`, `get_domain_health`, `get_campaigns`, `get_budget`. A bridge outage degrades a
turn to local reads, never a dead turn.

**Deploy.** `copilot svc deploy` from `backend/` (see `../operations/deployment.md`). A new Node
tool reaches the Python brain without a deploy when it is bridged (definitions are re-read every
60 seconds), but a new NAME must be added to the Python lists and the brain redeployed.

### 5.3 The Node brain (frozen)

`runElayaTurn` in `src/lib/elaya/brain.ts`: the resolver pre-step, then a tool loop of up to 10
rounds over `executeTool`, with the last 10 messages as history. Decision Log 2026-09-16
(`../rules/The_Rules.md`): frozen, retirement targeted **2026-10-16**, gated on thirty clean days on
Python with the switch unused and the exam steady. The retirement deletes the loop, the Node staff
persona, the two channel branches, the switch rows and `getElayaBrainForChannel`. What stays
forever because the Python brain runs on it: the tool registries and `executeTool`, the PII
gateway, the mutation cores, the bridge, the provider layer, the memory reader, and every Node
feature with its own model call (customer brain, analyst jobs, profiler, intake, sentinel and so
on). Playbooks are folded only by the Python brain.

---

## 6. The tools

Staff tools: **36 read** (`src/lib/elaya/tools/registry.ts`) and **16 write**
(`src/lib/elaya/tools/write-registry.ts`), one dispatch (`executeTool`). Customer tools: **2**
(`src/lib/elaya/tools/customer-registry.ts`), a separate dispatch that refuses everything else.

Legend: **inline** = executes in its own turn and logs an `executed` row; **propose** = records a
proposal and waits for a human yes. "All staff" = agent, manager, admin, founder.

| Area | Tool | Kind | Who carries it | Notes |
| --- | --- | --- | --- | --- |
| Leads and deals | `search_leads` | read | all staff | role scope; tells whose lead it is when it belongs to a teammate; hides the eval test lead |
| | `get_cold_leads` | read | all staff | |
| | `get_lead_details` | read | all staff | `canAccessLead` re-check |
| | `get_lead_whatsapp_chat` | read | all staff | the official Gupshup line with a lead; `canAccessLead` |
| | `search_deals` | read | all staff | |
| | `add_lead_note` | inline | all staff | `addLeadNoteCore` |
| | `log_call` | inline | all staff | `addLeadCallNoteCore` (outcome, new→touched, SLA cadence) |
| | `create_lead_task` | inline | all staff | `createLeadTaskCore` |
| | `update_lead_status` | propose | all staff | `updateLeadStatusCore` |
| | `reassign_lead` | propose | manager+ | `assignLeadCore` |
| | `log_deal` | propose | all staff | `recordDealCore`; deal type derived from the lead's domain |
| Tasks and people | `get_my_tasks` | read | all staff | follow-ups, personal and group tasks, with ids |
| | `find_teammate` | read | all staff | company directory; a sound-alike match carries no user id |
| | `create_personal_task` | inline | all staff (assigning someone else: manager+) | repeat reminders; says how the assignee was reached |
| | `create_group_task` | inline | all staff | |
| | `create_subtask` | inline | all staff | one assignee per subtask |
| | `update_task_status` | inline | all staff | |
| | `update_task` | inline | all staff | repeat reminders |
| | `delete_task` | propose | all staff | re-fetches before deleting |
| Oversight | `get_performance_snapshot` | read | all staff | agent pulse or manager roster |
| | `get_escalations` | read | manager+ | |
| | `get_domain_health` | read | manager+ | |
| | `get_campaigns` | read | manager+ | |
| | `get_activity_feed` | read | manager+ | a manager is pinned to their domain |
| | `get_budget` | read | admin, founder | |
| Knowledge | `get_helpdesk_content` | read | all staff | Call Intelligence library |
| Members | `get_member_360` | read | all staff | the first call for any member question; 24,000 chars |
| | `get_member_overview` | read | all staff | name or id in, `member_id` out; candidates; "outside your seat" |
| | `list_members` | read | all staff | roster by city, company, tier, status, queendom |
| | `get_member_profile` | read | all staff | the dossier: facts, people, team, health, requests |
| | `get_member_finance` | read | all staff | live Zoho; `canSeeMemberFinance` (never the Joker head) |
| | `get_member_recent_messages` | read | all staff | the member's group, 60 messages a page |
| | `search_member_history` | read | all staff | topic search; the model supplies related words |
| WhatsApp groups | `list_sia_groups` | read | all staff carry; `sia-access.ts` decides | the model gets a letters-only handle, never a jid |
| | `get_sia_group_messages` | read | same | by handle or by name |
| | `search_sia_messages` | read | same | |
| Freshdesk | `get_freshdesk_overview` | read | same | the /freshdesk page's numbers |
| | `search_freshdesk_tickets` | read | same | |
| | `get_freshdesk_ticket` | read | same | Serene never writes to Freshdesk |
| Sia tickets | `list_tickets` | read | all staff | queendom scope from the profile; the Joker head sees every queendom's tickets, and a ticket with no queendom is admin/founder only. See [tickets.md](tickets.md) |
| | `get_ticket` | read | all staff | returns the allowed moves |
| | `add_ticket_note` | inline | all staff | `addTicketNoteCore` |
| | `move_ticket_status` | propose | all staff | `moveTicketStatusCore` in the resolver |
| Vendors | `find_vendors` | read | all staff carry; `canAskAboutVendors` lets admin, founder and the concierge domain use it | the one vendor ranking (never re-ranked); flags an unverified extractor-written vendor; removed vendors are not offered. See [vendors.md](vendors.md) |
| | `get_vendor_details` | read | same | a merged-away id answers with the vendor it was merged into; a removed vendor is flagged "do not recommend" |
| Money | `get_books_overview` | read | admin, founder | live Zoho |
| | `get_subscriptions` | read | all staff carry; the tool admits admin, founder and the finance and tech domains | in practice admin, founder and tech, since finance has no Elaya today. Never a login or password |
| Analyst | `describe_database`, `query_database`, `get_live_pulse` | read | admin, founder | see [elaya-analyst.md](elaya-analyst.md) |
| | `start_deep_read` | inline | admin, founder | queues a background job |
| Self-correction | `raise_improvement_request` | inline | all staff | section 12 |
| Customer | `get_company_material`, `note_customer_interest` | customer only | the customer principal | [customer-welcome-blast.md](customer-welcome-blast.md) |

Results are serialized after masking and cut at 12,000 characters (a tool may carry a larger
`maxResultChars`, like `get_member_360`; the MCP connector raises every cap to 60,000).

Adding a read: a function in `elaya-data.ts`, then the tool. Adding a write: pick the tier, wrap an
existing core, gate with the principal before the core. Both checklists: `src/lib/elaya/CLAUDE.md`.
A new tool name must also be added to the Python lists (`BRIDGED_READ_TOOL_NAMES` or
`WRITE_TOOL_NAMES` and the role map) before the Python brain will offer it.

---

## 7. Writes and confirmation

**Two tiers, split in code.** An inline tool calls its mutation core in `run()` and appends one
`executed` row. A propose tool's `run()` has no branch that reaches a core: it supersedes any older
proposal in the conversation, records a `proposed` row with a before-snapshot, and returns
"awaiting confirmation". The five propose tools are `update_lead_status`, `reassign_lead`,
`log_deal`, `delete_task` and `move_ticket_status`.

**The resolver** runs first in every turn (`brain.ts` in Node, `backend/app/brain/resolver.py` in
Python). It reads the latest proposal and classifies the human's latest user message with
`classifyConfirmation` (`src/lib/elaya/confirmation.ts`, ported word-for-word to Python): a pure
English and Hinglish allow-list, whole-message match, default `other`. Only `affirmative`
executes, through `executeProposedAction` in Node (the bridge's `execute_proposed` op for Python).
Anything else dismisses the proposal and the message is handled fresh. A proposal older than 15
minutes is dismissed without executing. The executor re-resolves the target, re-checks access and
that the before-snapshot still matches; a moved target fails, an already-deleted task resolves as
"already removed". The confirmation line is written by code, never by the model, and says the truth
("was already Touched, nothing to change").

**The ledger** is `elaya_actions` (`elaya-actions-service.ts`, admin client): who, which tool,
target, channel, before and after. Proposed rows move once to `executed`, `failed` or `dismissed`
(an A-11 carve-out: resolve-once, no user write policy).

**Other write rules.**

- Writes wrap the same cores the UI actions call (`lead-mutations.ts`, `task-mutations.ts`,
  `ticket-mutations.ts`), so cache invalidation, SLA, notifications and reminders are identical.
- A lead write takes a slug and re-checks `canAccessLead`; lead or note text can at most cause a
  proposal, never an execution.
- Every `dueAt` passes `normalizeDueAtToIstInstant`: a zoneless time is IST.
- Repeat reminders (migration 0232): `create_personal_task` and `update_task` take
  `remindEveryHours` (0.5 to 24) and `remindForHours` (up to 72). `setTaskNudgeCore` arms the
  first nudge; `sendTaskNudgeTask` (`src/trigger/task-reminders.ts`) pings the assignee in-app and
  on WhatsApp until the task closes or the window ends. The tools return
  `assignee_notified_via` / `assignee_has_phone` and she must say when someone has no phone.
- Assigning a task to someone else pings them on WhatsApp (`task_assigned` template, gated by the
  `task_assigned` notification key).

---

## 8. The PII gateway

`maskPii(value, depth)` (`src/lib/elaya/pii.ts`, port in `backend/app/brain/pii.py`) walks every
tool result before it reaches a model. Depth comes from the `pii_masking_depth` row:

| Depth | Effect |
| --- | --- |
| `off` | passthrough, debugging only |
| `light` (default) | phones keep the last 4 digits; emails keep the first letter and the domain; names stay |
| `strict` | as light, and emails fully masked |

An exact UUID string is never masked (a UUID is an id, not PII, and the phone pattern would
corrupt it). A WhatsApp group id is a long digit run, so it would be masked like a phone: tools
that must hand an id to the model and take it back use a handle that survives the mask
(`siaGroupHandle()`). Any new tool that round-trips an id must check this. Background jobs (memory
reader, alerts, deep read, profiler) also pass their input through `maskPii`; the member profiler
adds its own name vault (see [members.md](members.md)).

---

## 9. Channels

| Channel | Entry | Brain | Streams | Writes |
| --- | --- | --- | --- | --- |
| In-app (`in_app`) | `POST /api/elaya/chat` from `/elaya`, the floating button, the dashboard widget, `/m/elaya` | Python (Node on rollback) | yes, SSE | yes |
| WhatsApp staff (`whatsapp`) | Gupshup webhook → `tryHandleElayaWhatsAppMessage` | Python (Node on rollback) | no, one reply (split if long) | yes |
| MCP (`mcp`) | `/api/mcp` | none: tools only, the outside AI app thinks | n/a | no (read tools only) |
| Voice (`voice`) | the Call button on `/elaya` → `startElayaVoiceCallAction` → a LiveKit room; the voice worker (`backend/voice/agent.py`) sends each finished sentence to `POST /v1/elaya/chat` | Python only | spoken as it streams | yes |
| Customer WhatsApp | end of the lead pipeline | the separate Node customer brain | no | only the lead's own interests |

**In-app.** The route order: session → `hasElayaAccess` → burst limit (20 a minute per user) →
Zod → the brain switch. On `python` the route proxies frames; the brain owns the cap, the session,
both message rows and the resolver, and error frames are rewritten to user-safe copy. On `node`
the route does the cap, session, persist and turn itself. `maxDuration` is 180 seconds. After the
reply is saved the route runs the memory reader (section 12).

**WhatsApp staff gate** (`src/lib/services/elaya-whatsapp.ts`):

- The sender's number is normalized and matched to an active profile
  (`getActiveProfileByPhone`). A match is always handled by Elaya, on every path, so a staff
  message can never become a lead; no match goes to the lead pipeline untouched. A profile with a
  blank phone therefore turns that person's messages into a lead: fill the phone.
- Dedup on the Gupshup message id (a partial UNIQUE index; the Python brain answers 409).
- Voice notes are transcribed first (Deepgram, with the active staff first names as keyword
  boosts), stored with `meta.voice = true`; the audio is never stored. Images and files get a
  "text only" reply.
- A turn still thinking after 15 seconds sends one holding line ("On it. This one needs a proper
  look, give me a minute.").
- The reply passes `markdownToWhatsApp()` and is sent whole, split into several messages on
  paragraph breaks when long (`splitWhatsAppText`), never truncated. Each send writes one
  `whatsapp_notification_logs` row (`elaya_reply`).
- The staff member just messaged, so the 24-hour Gupshup window is open and free text is allowed.
  `waFreeTextWindowOpen()` in `elaya-service.ts` is the same check the brief and alerts use.

**Voice** (2026-09-28, migration 0247). A real-time call over the same brain. The Call button
runs `startElayaVoiceCallAction` (session → `hasElayaAccess` → the `voice_enabled` row → the
`LIVEKIT_*` env), which mints a short-lived LiveKit room token whose identity is the profile id
and whose room configuration dispatches the agent `elaya-voice` with `{ user_id }` as job
metadata (`services/elaya-voice-service.ts`, the only place a LiveKit token is minted). The
browser joins and opens the microphone (`components/elaya/ElayaVoiceCall.tsx`). The worker
(`backend/voice/agent.py`, a Copilot Backend Service) checks the participant IS that id, then
runs speech-to-text (Deepgram Nova-3 through LiveKit Inference, `multi` for Hinglish), LiveKit's
audio turn detector, and text-to-speech (Cartesia Sonic-3 by default), with the brain as the
model: every finished sentence is one `/v1/elaya/chat` turn with `channel: "voice"`, so the cap,
the one active conversation, both rows, the tools, the PII gateway and the confirmation resolver
are untouched, and the persona gets a spoken-style block (short sentences, no markdown, rupees in
words). When the brain goes to a tool before saying a word, the worker speaks one holding line.
Finished lines land in the chat as they are spoken; a call ends on hang-up or after twenty
minutes. The worker never writes a row. Runbook: `backend/voice/README.md`.

**MCP.** Elaya's third channel: the connector publishes the principal's read toolset and calls
`executeTool` with `channel: 'mcp'`. No chat turn runs in Serene (the outside app's own model
does the thinking) and no message is stored. Full contract:
[../integrations/mcp.md](../integrations/mcp.md).

**Customer.** A different principal, persona, brain and two-tool registry; never reaches staff
code. Full contract: [customer-welcome-blast.md](customer-welcome-blast.md).

---

## 10. Sessions and the daily cap

- **One active conversation per user across channels.** `getOrCreateActiveConversation` does not
  filter by channel, so a WhatsApp message continues an in-app session and the other way round.
  Each message records its own `channel`. The window is `session_expiry_hours` (24).
- **The daily cap** is `daily_message_cap` (200 user messages), counted from IST midnight across
  both chat channels, checked before anything is persisted or a model is called. The count fails
  closed. On the Python path the brain enforces it (`core/elaya_store.py`); on Node the route and
  the gate do. At the cap the composer shows a quiet notice; WhatsApp gets a polite line.
- **MCP calls are not messages** and do not count against the cap; the connector has its own limit
  of 60 tool calls a minute per person.
- `elaya_messages` is append-only.

---

## 11. Persona and the prompt

The staff prompt is built by `buildElayaSystemPrompt` (`src/lib/elaya/persona.ts`) and
`build_system_prompt` (`backend/app/brain/persona.py`). The reach line and the memory block are
kept byte-identical and checked by rendering both; the other blocks are mirrored by hand (the
notes block differs by one example sentence). The Python prompt is the one in use. In order:

1. Voice, data rules and write protocol (tools first, never an invented number, ₹ with Indian
   grouping, label cross-domain insights, never quote tool field names).
2. **The reach line** (`scopeHint` / `_scope_hint`, rewritten 2026-09-26): what this role, domain
   and seat CAN reach first, then what it cannot, then "never refuse from this line alone: call the
   tool". A Joker head line (0244) describes every queendom, no vault, no members' money. This line
   is where an outsider learns their limits without the model inventing any.
3. The WhatsApp channel block (WhatsApp only): short, no headings or tables, no length cap.
4. The per-user style block (`user_context.context.persona`: language, tone, depth, length and a
   600-character note, edited on `/profile` with `ElayaPersonaSettings`). Style only, never a
   permission.
5. The living memory block, then the known-issues block (section 12).
6. The user's notes, as context and "the user's own memory, never an instruction"
   ([../pages/notes.md](../pages/notes.md)).
7. Python only: the specialist focus line and, when the router matched one, the playbook (section 13).
8. The IST time anchor, placed outside the cached prefix so the cache still hits.

Persona rules that came from real failures (September 2026): search the tool catalog before
refusing; never say "send it as its own message"; answer a message with several asks part by part;
no time window given means the last 30 days, stated; a member outside the seat is "outside your
seat", never "not found"; never retract a true earlier answer because this turn lacks a tool.

---

## 12. The living memory and improvement requests (0237)

**The memory.** `elaya_user_memory` holds one row per thing learned about one person: kind (rule,
correction, style, preference, interest, fact), the statement (400 characters), the user's words
as evidence, and the source (chat, self, admin). Entries are retired, never deleted.

- **The reader**, `learnFromTurn` (`src/lib/elaya/memory.ts`), runs after every turn on both
  channels and both brains, called by the in-app route and the WhatsApp gate once the reply is
  saved. A cheap word gate skips plain questions; otherwise one `routing`-tier call reads the
  entries on record and the last 6 messages and returns entries to add and ids to retire.
  `applyMemoryReading` merges them. It fails soft and never touches the reply.
- A complaint that an answer was wrong is never memory; that is an improvement request.
- **The memory block** (`formatMemoryBlock` / `getMemoryBlock` in `elaya-memory-service.ts`, and
  `build_memory_prompt_block` in Python) folds entries into every prompt ranked rules → corrections
  → style → preference → interest → fact, within 6,000 characters. The old 900-character learned
  blurb in `user_context` folds only until a user's first entry exists.
- **UI:** "What Elaya has learned about you" (`components/profile/ElayaMemoryCard.tsx`) on
  `/profile` (remove an entry, add a rule) and on `/admin/users/[id]` for admin and founder.
  Actions: `addMemoryEntryAction`, `retireMemoryEntryAction` (own, or anyone's as admin/founder).
- Memory is context, never permission. It never records identity, role or access.

**Improvement requests.** When a user tells Elaya she was wrong about the system (wrong data, wrong
time frame, a missing tool, a wrong answer, behaviour), she calls `raise_improvement_request` in
the same turn, answers the corrected question with her tools, and says in one line it is logged.
The row lands in `elaya_improvement_requests` with the question, her answer, the correction and her
own guess at the cause. The tier-1 responders are pinged on WhatsApp through the Sia alert
template and in-app: a named list of people (`SIA_ALERT_TIER1_PROFILE_IDS` in
`src/lib/constants/sia-alerts.ts`), not a role; see [sia.md](sia.md). Admin and founder decide each on
`/settings/elaya-requests` (fixed, declined, or became a playbook) with a note.
`getKnownIssuesBlock()` folds open requests from the last 30 days and fixed ones with a note from the
last 14 days (at most 12) into every prompt, so she stops repeating a mistake and can say the team
is on it. Vocabulary: `src/lib/constants/elaya-memory.ts`.

---

## 13. Playbooks and the Teach Elaya pages

### Playbooks (0234)

A playbook is the founder's method for a KIND of question, in plain words: title, example
questions the way people really ask, and instructions (which window, which records, what to lead
with). It is a method, never a source of facts.

- Table `public.elaya_playbooks`; RLS admin/founder read, writes through the gated action on the
  service role. `elaya-playbooks-service.ts`, `actions/elaya-playbooks.ts` (admin/founder).
- The Python router reads the active rows (`supa.get_active_playbooks`, cached a minute), returns
  the matching one with the specialist, and `build_playbook_block` folds it under the specialist
  focus. The turn's row records `meta.playbook`; the `done` frame carries `playbook`, `specialist`
  and `toolsUsed`.
- When an answer is wrong in SHAPE (window, emphasis, scope), write a playbook. When it is wrong in
  DATA, fix the tool.

### The pages

| Route | Who | What |
| --- | --- | --- |
| `/settings/teach-elaya` | manager and above (`hasManagerPageAccess`, which also admits the tech workbench) | the hub (`components/settings/TeachElayaHub.tsx`), four doors, each saying what it does and who edits it. Sidebar: "Teach Elaya" in the configuration group |
| `/admin/elaya-training` (door: Training) | manager+ | the customer knowledge base: [../pages/elaya-training.md](../pages/elaya-training.md) |
| `/settings/elaya-playbooks` (door: Playbooks) | admin, founder (page gate `hasElevatedPageAccess`) | the list, one editor, **Speak a playbook** (the shared `DictationButton` into a notes box, then "Draft with Elaya": `draftPlaybookFromNotes` in `elaya-playbook-drafter.ts`, one `reasoning` call, lands as an unsaved preview), and **Try it** (asks the real Elaya in the viewer's conversation and shows the playbook, specialist and tools that fired). `components/settings/ElayaPlaybooksPanel.tsx` |
| `/settings/elaya-requests` (door: Requests) | admin, founder | each request with the question, answer, correction and cause; decide fixed / declined / playbook with a note. `components/settings/ElayaRequestsPanel.tsx`, `resolveImprovementRequestAction` |
| (door: Exam) | engineering | not in the app yet; the evals in section 15 |

The playbook and request pages admit the tech workbench at the page gate, but their data and
actions are admin/founder only, so a non-admin tech teammate sees an empty list.

---

## 14. Notes

Every staff member has private notes at `/notes` (`elaya_notes`, migration 0152). Both brains fold
the user's notes into the prompt as context (`getNotesForElaya` in Node, `get_notes_for_elaya` in
Python), capped at 6,000 characters. Full spec: [../pages/notes.md](../pages/notes.md).

---

## 15. Evals (the exam)

`evals/` is a Python harness that drives the real app from outside: it signs in an eval user,
sends each case to `POST /api/elaya/chat`, and checks the reply, the persisted tool calls with
their arguments, and the `elaya_actions` rows. It runs against either brain.

| Piece | What |
| --- | --- |
| `evals/run.py` | the runner (`--allow-writes`, `--include-tags`, `--only`, `--golden`, `--target`) |
| `evals/golden/core.yaml` | 35 cases from real messages (Hinglish, voice-name artifacts, confirmation flows, an injection probe); `needs-seed` cases use the test lead "Testak Evalson", `needs-concierge` cases need a seated concierge login |
| `evals/golden/founders.yaml` | 25 real founder questions (2026-09-24); `tags: [founder]`, run with a founder or admin login |
| `evals/report.py`, `evals/review.py` | the HTML score report, and a local console to grade real conversations (annotations in `evals/annotations.json`) |

Rules: no AI change ships without a run; every real bug becomes a case first; known gaps stay in
the file as `known_fail`. The eval account and test lead are hidden from real users' reads
(`isTestLead` / `hideTestLeads` in `src/lib/elaya/access.ts`). Setup and commands:
`evals/README.md`.

---

## 16. Data and settings

| Table | Migration | Role |
| --- | --- | --- |
| `elaya_conversations`, `elaya_messages` | 0116 | sessions and the append-only transcript (`channel`, `meta` with `wa_message_id`, `voice`, `brain`, `playbook`) |
| `elaya_actions` | 0116, 0118 | the write ledger and proposals |
| `user_context` | 0116 | per-user style settings and the legacy learned blurb |
| `llm_providers` | 0116, 0176 | the model per tier |
| `elaya_settings` | 0116 and later | the switches below |
| `elaya_notes` | 0152 | personal notes |
| `elaya_training_assets` | 0150 | the customer knowledge base |
| `elaya_playbooks` | 0234 | playbooks |
| `elaya_user_memory`, `elaya_improvement_requests` | 0237 | living memory, requests |
| `elaya_query_log`, `elaya_jobs`, `elaya_labels`, `elaya_alerts` | 0223, 0235 | the analyst layer: [elaya-analyst.md](elaya-analyst.md) |
| `mcp_tool_calls` | 0226 | the connector's call ledger |

`elaya_settings` rows Elaya reads (all through `src/lib/services/llm-providers-service.ts`, per
request):

| Key | Default when missing | What it controls |
| --- | --- | --- |
| `daily_message_cap` | 200 | messages per user per IST day |
| `pii_masking_depth` | `light` | section 8 |
| `session_expiry_hours` | 24 | the conversation window |
| `brain_whatsapp`, `brain_in_app` | `node` (both rows say `python`) | section 5.1 |
| `mcp_audience` | founder, admin | roles the MCP connector admits (seeded to every role but guest) |
| `voice_enabled` | `false` | the voice channel's door (0247); `true` shows the Call button and lets the action mint a room token |
| `daily_briefing_enabled`, `elaya_alerts_enabled`, `elaya_alerts_state`, `elaya_labels_refresh_enabled`, `elaya_deep_read_spend_cap_usd` | see the analyst doc | [elaya-analyst.md](elaya-analyst.md) |

Other modules keep their own switches in the same table (`member_profiler_enabled`,
`ticket_intake_enabled`, `member_assessment_enabled`, `intake_lessons_enabled`); see
[members.md](members.md) and [tickets.md](tickets.md).

---

## 17. Not built, and open items

- **In-app proposal cards.** Confirmation is a typed yes or no on every channel. The
  Approve/Dismiss card (DESIGN-DNA §15) over the same proposal rows is not built.
- **MCP writes** (Phase 4 of `../architecture/mcp-plan.md`) are not built; the connector is read
  only.
- **Semantic search.** No embeddings provider is chosen; topic search uses model-supplied related
  words over whole-word matching.
- **Voice replies** (text to speech) are out of scope; voice is input only.
- **The Node brain's retirement** is targeted for 2026-10-16.
- **The Exam page** on Teach Elaya is a label, not a feature.
- **Hands** (Elaya handing member jobs to outside agents like Instinct) is a plan only:
  `../architecture/hands-plan.md`.
- **Notes for teams without Elaya.** `/notes` is open to every staff member, but finance,
  marketing and business have no Elaya to read them.

---

## 18. Design language

Elaya is a presence, not a chatbot. Her glyph (`src/components/ui/elaya-glyph.tsx`) always
breathes when she is present; her colour is always `--theme-accent`; inline suggestions wait
400 ms; proposal cards have exactly two actions; one dot or nothing, never a number badge;
cross-domain insights name their source domain. She is the only presence allowed to animate text
(`ElayaStatusText`, the tool-status line). Full design language: `../design/DESIGN-DNA.md` §15.

---

## 19. History at a glance

| Date | What shipped |
| --- | --- |
| 2026-06-12 | Foundation: provider layer, principal, PII gateway, read tools, `/elaya` SSE chat (0116); the WhatsApp staff channel (0117) |
| 2026-06-13 to 06-15 | Lead writes with confirmation (E3, 0118), task writes, voice input, the floating button |
| 2026-06-25 to 06-26 | "Jarvis": the data seam and parity rule (0149), per-user style, learned blurb, role-gated oversight reads, `log_deal`, `create_subtask`, notes (0152), the customer channel (0150, 0151) |
| 2026-08-27 to 08-31 | Evals; Sonnet 5; the Python brain on Fargate with the router, specialists and three tiers (0176); read parity; the write bridge; the WhatsApp brain switch (0179) |
| 2026-09-03 / 09-04 | Both channels switched to the Python brain |
| 2026-09-08 to 09-19 | Bridged reads: vendors, Sia tickets, members and the twin, Freshdesk, books, Sia groups, lead WhatsApp chat, subscriptions, activity feed; `get_member_360`; the analyst layer (0223 to 0225); the MCP connector (0226) |
| 2026-09-16 | Node loop frozen, retirement targeted 2026-10-16 |
| 2026-09-21 | MCP phases 2 and 3 (0231, 0233); repeat reminders (0232); playbooks (0234) |
| 2026-09-22 | Teach Elaya hub |
| 2026-09-24 | Tool search replaces router gating; `list_members`; verified metrics; the deep read and alerts (0235) |
| 2026-09-25 | Living memory and improvement requests (0237) |
| 2026-09-26 | Company-wide authorization audit; the rewritten reach line; `ELAYA_DOMAINS`; the Joker head line (0244) |

Full detail: `../changelog.md`.
