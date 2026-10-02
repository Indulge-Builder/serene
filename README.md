# Serene

**The internal operating system of Indulge Global, a luxury concierge company.**

Private repository. This page is the front door: what Serene is, how it is built, how to run it,
and where to read next. It is written so it can be shared outside the tech team: it leaves out
credentials, infrastructure identifiers, schema detail, security specifics, commercial figures and
member information.

_Last updated: 30 September 2026. What is live right now is tracked in
[`docs/01-vision.md`](docs/01-vision.md); what shipped and when is in
[`docs/changelog.md`](docs/changelog.md)._

---

## 1. What Serene is

Serene is the one place the Indulge team logs into every morning. The sales pipeline, the member
relationships after the sale, the WhatsApp conversations, tasks, suppliers, money, performance
numbers and an AI assistant who knows the business all live inside it. It replaces spreadsheets,
chat threads, a generic CRM and a separate helpdesk tool with one system the company owns, built
around how the business actually runs.

It is built as a base OS with modules on top. Adding a module never touches the base. That
promise has held through every addition since May 2026.

| Name | What it is | Status |
| --- | --- | --- |
| **Serene** | The base OS: login, roles and seats, themes, navigation, dashboard, tasks, notes, notifications | Live |
| **Gia** | The sales CRM: a lead from first contact to closed deal, for the onboarding, house, shop and legacy teams | Live |
| **Sia** | The concierge floor: the members' WhatsApp groups, member records, Serene's own tickets, the supplier book | Live, running beside Freshdesk while the team moves over |
| **Elaya** | The AI presence who walks every floor: she answers, acts under supervision, remembers, and briefs the founders | Live in the app and on WhatsApp; her tools also reach Claude and ChatGPT |

Around those four sit the working modules: **Members** (the member twin), **Tickets**,
**Vendors**, **Subscriptions**, **Books** (Zoho Books, read live), **Revival**, **Helpdesk**,
**Oversight** and the **`/m` phone layer**. In progress: **Hands** (Elaya working with outside
agents from her own WhatsApp number), **Desks** (Elaya on the office speakers and TV boards),
**Finance** (the reimbursement invoice made straight from a ticket), Elaya's **voice** calls and
her **eyes** (reading the images, files and voice notes in chats).

**Scale of the build today:** about 975 TypeScript files and 174,000 lines in the web app, around
70 pages, 47 server-action modules, 109 data-service modules, 22 background jobs and 252 database
migrations, plus a small Python service on AWS and two WhatsApp connectors. In daily production
use since May 2026.

---

## 2. What the team sees

- **Dashboard**: a widget grid each person arranges for themselves; the widgets follow their team.
- **Leads and the lead dossier**: every prospect, with server-side search, filters, saved columns
  and export. Behind each name, one page with every call, note, message, status change and task,
  in order.
- **Deals**: the ledger of closed business with running totals, walk-ins included.
- **WhatsApp**: the sales team's shared inbox on the company number. A message from an unknown
  number becomes a lead; a known number lands in its thread. Media is kept private and served
  through short-lived links.
- **Tasks**: personal to-dos, team workspaces with sub-tasks, checklists, tags and remarks, and
  follow-ups the system books on its own.
- **Campaigns and Budget**: which ads bring leads and wins, and ad spend next to what it returned.
- **Performance, Oversight and Escalations**: scoreboards for an agent, a manager and a founder
  (the founder's as a swipeable deck of agents); a live control room with a three-level drill from
  business lines to teams to people, showing what everyone is working on now; and the leads and
  tasks that slipped their deadline.
- **Helpdesk**: the "can we arrange X?" library of cases and conversation hooks, surfaced on each
  lead's page.
- **Members**: one record per member that fills itself from chat, notes and imports, with a
  health number, Serene's weekly judgement, an encrypted card and ID vault, and live money.
- **Sia**: the members' WhatsApp groups in a WhatsApp Web style viewer, each person seeing only
  their own queendom.
- **Tickets**: member requests with a live board and deadlines, a small watcher on every ticket
  that suggests the next move, and cards Serene proposes from the groups for a person to confirm.
- **Freshdesk**: a read-only copy of the old helpdesk, kept in sync every minute.
- **Vendors**: the supplier book, one "best vendor for this request" ranking, and a queue of new
  suppliers read from ticket notes and bills for a person to confirm.
- **Books and Subscriptions**: the company ledger from Zoho Books, and the company's own tools and
  bills.
- **Elaya and Notes**: the AI chat, and each person's notepad, which Elaya reads as context.
- **Settings, Team and Admin**: routing, working hours, SLA and revival policies, ticket settings,
  accounts and seats, ad creatives, Teach Elaya, adoption usage, and the error log.
- **The phone layer (`/m`)**: a separate touch-first shell with four role-aware rooms, a
  swipe-paged carousel of business lines, and the Elaya knob. It is not a shrunk desktop; it has
  its own design.

---

## 3. Two journeys

### A lead, from ad to deal (the sales floor)

1. A prospect taps an ad, or enquires in the Indulge app, and submits their details.
2. Within seconds they exist in Serene. A webhook receives the payload, checks and cleans it,
   normalises the phone number, and creates a permanent record. If they have enquired before,
   the system knows them: one person never becomes two active leads in the same team.
3. They are assigned automatically. The router works like a fair taxi rank: whoever has waited
   longest gets the next lead, inside the right team. Nobody cherry-picks, nobody is overloaded,
   and people on leave are skipped with one switch.
4. The assigned agent gets a WhatsApp message and a push notification. Every notification
   category can be muted per person, except the transactional ones.
5. The agent calls, then logs the call. A note can be spoken instead of typed, Hinglish included.
   Audio is transcribed in the moment and never stored.
6. Serene watches the clock. If a new lead is not contacted inside the response window, the agent
   is nudged; if it slips further, the manager is alerted. These timers are durable background
   jobs, so they survive deploys and restarts.
7. Leads that go quiet are followed up automatically. A daily sweep finds silent leads, an AI gate
   reads each one's notes, a follow-up task is booked for the ones still worth chasing, and the
   borderline ones go to a person to review. It only ever adds a nudge; it never edits the lead.
8. When the prospect says yes, the deal is recorded and moves into the ledger.
9. Everyone sees exactly what their role allows, live.

### A member request (the concierge floor)

1. A member writes in their WhatsApp group with the concierge team.
2. Serene keeps a copy of every message in its own archive. It listens only; it never speaks in
   a member's group.
3. Within a minute Serene reads the conversation and, if it is a real request, proposes a ticket
   already filled in. A person decides. Nothing is created without a human.
4. The ticket has a deadline. A small watcher keeps an eye on it, nudges the team when it slips,
   and suggests the next step for a person to approve.
5. If a supplier is needed, Serene suggests the best ones, ranked from past jobs, with reasons.
   When the ticket closes, the team rates the job, so the ranking keeps learning.
6. The member's record fills itself in: preferences, family, occasions coming up. Once a week
   Serene gives its own judgement of how the relationship is going.
7. The founders get a short brief twice a day: who is waiting on a reply, what went wrong, what
   went well, team by team.

The longer, plain-English version of both journeys is [`docs/00-for-the-board.md`](docs/00-for-the-board.md).

---

## 4. Where it runs

```text
  Browser / installed app ──┐     Lead ads, shop app, Gupshup, Freshdesk ──┐
  Claude / ChatGPT (MCP) ───┤                              (webhooks in)   │
                            ▼                                              ▼
            ┌───────────────────────────────────────────────────────────────┐
            │  Vercel: the Next.js web app (pages, server actions, API)      │
            └───┬──────────┬──────────────┬───────────────┬─────────────┬───┘
                ▼          ▼              ▼               ▼             ▼
            Supabase    Upstash       Trigger.dev     Outside APIs    AWS (Python)
            Postgres,   Redis         background      Anthropic,      Elaya's brain
            Auth,       (read cache)  jobs            Deepgram,
            Realtime,                                 Zoho, Freshdesk
            Storage  ◀──── the Sia watcher on AWS: members' WhatsApp groups in, media to S3
```

(The voice worker is built to run on AWS beside the brain; today it has only run from a laptop.)

Postgres is the one source of truth. Redis only caches reads, Realtime only pushes changes, and
the Python brain writes back through the same write cores the web app uses. The full map, with
every service, route and job, is [`docs/architecture/overview.md`](docs/architecture/overview.md).

---

## 5. Tech stack

Deliberately small. Every choice is fixed and documented; alternatives are not re-argued per
feature.

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16, App Router, React 19, React Server Components |
| Language | TypeScript 5, strict, no `any`; Python 3.13 for the AI service |
| Styling | Tailwind CSS v4 plus a CSS-variable token system (the neumorphic layer) |
| UI | shadcn/ui primitives plus a bespoke component library; `cmdk`, `@number-flow/react`, `torph` inside our own components |
| Database, auth, realtime, storage | Supabase (PostgreSQL 17), including its OAuth server for outside AI apps |
| Caching | Upstash Redis, cache-aside, reads only |
| Background jobs | Trigger.dev v4 |
| AI | A provider-neutral layer with an Anthropic adapter; models are database rows, not code |
| AI service | FastAPI on AWS ECS Fargate (Elaya's brain), calling the Anthropic API directly |
| Voice | Deepgram Nova-2 for dictation (Hinglish-tuned); LiveKit, Deepgram and Cartesia for live voice calls with Elaya (built, not yet deployed) |
| WhatsApp | Gupshup for the company number; Baileys for reading the members' groups (and for Hands) |
| Outside systems | Freshdesk (mirrored), Zoho Books (read live), MCP for Claude and ChatGPT |
| Push | Web Push with VAPID, no SaaS layer |
| Animation | Framer Motion 12 (the slim `m` core, reduced motion respected app-wide) |
| Charts | Recharts 3 |
| Forms and validation | React Hook Form plus Zod 4 |
| Icons | lucide-react, exclusively |
| Drag and drop | dnd-kit, exclusively |
| Hosting | Vercel (web), AWS (Python service and WhatsApp connectors), Supabase, Trigger.dev cloud |
| Package manager | pnpm |

Not in the stack, on purpose: React Query, a state-management library, an ORM, a bigger
component kit, or an error-monitoring SaaS. Data fetching is server-components-first, so most of
what those tools solve does not come up.

---

## 6. How it is built

### The layering rule

Every feature moves through the same four layers, in the same direction:

```text
UI component  →  Server Action  →  Service  →  Database
(display only)   (validate,        (all queries    (row-level
                  authorise)        live here)      security)
```

- Components never fetch data and never touch the database. They render what they are given.
- Every server action starts with schema validation, then one shared session-and-role guard.
  There is no hand-rolled auth check anywhere.
- Every database query lives in one service directory. No query is written inline in a page or
  an action.
- Actions return a `{ data, error }` shape rather than throwing, so every caller handles both
  branches.
- Every business write has one "core" function. The page, Elaya's tools and the background jobs
  all call the same core, so there is exactly one way to, say, change a lead's status.

### Authorization at three layers

Role, team and seat access is enforced in the database itself through row-level security, in
the routing layer, and in the navigation. The database is the real boundary; the UI layers are
convenience. On the concierge floor a teammate's seat pins them to one queendom, and that pin is
applied again in every privileged read and in every Elaya tool. Authorization reads the profile
table, never a token claim.

There are five roles (founder, admin, manager, agent, guest) and nine teams, called domains
(concierge, onboarding, finance, marketing, tech, shop, business, house, legacy). Each person
has one role and one domain; only founders and admins reach across domains, and there is no
grants table. On the concierge floor a person also holds a seat: queen, bishop, genie, joker,
or the company-wide Joker head. The full model is
[`docs/architecture/auth-and-rbac.md`](docs/architecture/auth-and-rbac.md).

### The append-only rule

Calls, notes, status changes, task and ticket events, AI actions and the vendor job ledger are
append-only. Entries can be added; history cannot be quietly edited away. The audit trail is
structural, not a policy people are asked to respect. Outside data follows the same idea: the
WhatsApp archive and the webhooks store the raw event first and understand it second.

### Reuse before building

The largest single rule in the codebase is a ban on duplication. Before anything new is written,
the existing implementation must be searched for by behaviour, not by filename. A registry lists
the canonical modules (the one date formatter, the one phone normaliser, the one confirm dialog,
the one filter bar, the one AI transport, and many more), next to a repeat-offender table of
things that were duplicated before. Copying an existing module as the start of a "new" one counts
as the same violation. This is why a large codebase still behaves like one system.

### The design system

The visual layer is a soft, tactile "neumorphic" material: one warm surface, layered soft
shadows, generous radii, no hard borders. Every colour is a CSS variable; there are zero hex
values in components, enforced by a token check that runs before every build, and a control
audit checks that buttons, fields and selection controls follow one contract.

Eight themes ship. A theme changes only the accent family; surfaces, shadows, text and status
colours never re-tint. Every accent passes contrast on the base surface. Light and dark modes are
both supported, and theme, mode and home-screen icon are rendered server-side from a cookie, so
there is no flash on load.

Motion is constrained on purpose: transform and opacity only, never width, height or padding.
Shared durations and easings live in one file. The whole app respects the operating system's
reduced-motion setting.

### Async work

Anything that takes more than a few seconds, needs a retry, or has to fire later runs as a
background job. Response-time timers, task reminders, the lead revival sweep, the Freshdesk sync,
the member chat profiler, the ticket intake and watchers, the vendor extractor and the founders'
brief all run this way. Outbound sends that must complete are kept alive past the HTTP response
with the framework's post-response hook, a detail that silently loses messages on serverless
hosting if you get it wrong.

### Caching

Redis is a read cache only; Postgres is the single source of truth. Cache invalidation for the
hottest entity is centralised in one helper, so no feature can invent its own half-correct
version. Cache keys are scoped by team, so a cached answer can never leak across a boundary.

### Documentation as infrastructure

The repository carries its own documentation: one spec per page, one per module, one per outside
integration, an architecture set, a design constitution, an engineering rule book with a decision
log, and a dated changelog that is the single source of truth for what shipped and when. Every
meaningful change gets a changelog entry alongside the code. The codebase is also indexed as a
knowledge graph, so "what touches this?" is answered by a query instead of a grep.

---

## 7. The AI layer

Elaya is the AI presence inside Serene. She is not a chatbot bolted on the side; she is a
participant in the operating system.

- **Provider-neutral by design.** One adapter file per language is allowed to import an AI vendor
  SDK. Which model handles which job is a database row read on every turn, so swapping a model is
  a configuration change, not a deploy.
- **A brain built for tools.** Elaya thinks in a Python service on AWS. Instead of one huge prompt
  holding every tool, she searches a registry of about fifty role-gated tools and loads only what
  the question needs. Every tool wraps an existing service function; none writes a raw query and
  none accepts an identity from the model. Who you are comes from your verified session.
- **A privacy gateway.** Every tool result is masked before it reaches a model, and raw member
  and client details do not leave the system. Even internal notification logs keep only the last
  four digits of a phone number. When Serene reads member chats, names are swapped for stable code
  names first, so the model never learns who.
- **Propose and confirm.** Small writes (a note, a call log, a task) happen at once. Bigger ones
  (a status change, a reassignment, a won deal, a delete) are only proposed. A person replies, and
  a deterministic parser that understands English and Hinglish decides whether the reply was a
  yes. It defaults to "no" on anything unclear and never asks the model to judge its own approval.
- **A trust ledger.** Every action, proposed or executed, is written to an audit table with
  before-and-after snapshots.
- **Every channel, one set of rules.** The in-app chat and WhatsApp run on the same brain, and the
  voice calls being built use it too. Claude and ChatGPT reach the same tools through the MCP
  connector, signed in as the person, with exactly that person's permissions.
- **Memory that belongs to each person.** Elaya keeps a living record of how each person wants
  things done, reads their private notes as context (never as permission), follows founder-written
  playbooks for kinds of questions, and logs the team's corrections so they get fixed. Spoken input
  works on every voice surface through one shared dictation component.
- **A separate face for prospects.** A hard-capped customer persona on WhatsApp greets new
  enquiries and can only send curated company material and record what the person is interested
  in. It shares no code path with the staff brain.
- **An exam.** A set of real questions with answer keys (about sixty today) is the bar for prompt,
  tool and model changes. The move to the Python brain was switched on only after it passed.
- **An analyst for the founders.** Questions answered by read-only queries over a locked set of
  cleaned views, a live pulse, a twice-daily brief, live alerts, and background "deep reads" for
  questions no column can answer.

The same AI layer is reused, on purpose, for the jobs that are not chat: the lead revival gate,
the member chat profiler, the ticket intake and watchers, the vendor extractor and the weekly
member judgement all go through the same provider layer and the same privacy rules. They fail
closed: a bad model answer can never cause an automatic action.

---

## 8. Engineering discipline

A few practices explain the consistency more than any single choice:

- **A written constitution.** Twelve non-negotiable rules plus a longer rule book, organised by
  category, each rule with an ID that is cited in reviews and in the code comments themselves.
- **A never-do list.** Explicit, specific and enforced: no hardcoded colours, no animating layout
  properties, no hand-rolled confirm dialogs, no fetching inside a display component.
- **Machine enforcement where possible.** A deliberately small lint configuration holding only
  rules that prevent real bugs, plus the pre-build token check and the control audit.
- **A decision log.** Reversals are recorded with their reasons, so the same debate is not re-run
  six months later.
- **Documentation first at the seams.** Every module ships with a written contract before the code
  settles, and every plan opens with a note on where it stands.
- **Regular audits.** Dated design, security, accessibility and mobile audits, with the lasting
  rules folded back into the codebase's own instruction files so they cannot regress.

---

## 9. Vision

The arc has stayed the same, and each stage is the foundation for the next:

**Run the operation → add the intelligence layer → own the relationship → give Elaya hands.**

**Stage one, run the operation. Done.** The whole sales motion lives in owned software, from ad
click to closed deal, with fair distribution, enforced response times and correct reporting at
every level.

**Stage two, add the intelligence layer. Live and deepening.** Elaya answers, acts under
supervision, remembers, speaks the team's mixed-language register, and works on WhatsApp and
inside other AI apps as well as in Serene. Next here: live voice calls, meaning-based search over
the whole history, reading the images, files and voice notes in chats, writes through the outside
AI apps, and later small models trained on our own data for the easy, high-volume work.

**Stage three, own the relationship. Live, beside the old tools.** The concierge floor has its
WhatsApp archive, member records, its own tickets and its supplier book inside Serene. Next: move
the day-to-day ticket work off Freshdesk, and link a won deal straight to a member record so the
story continues past the sale.

**Stage four, give Elaya hands. Started.** Elaya works with outside agents from her own WhatsApp
number, treated like any other supplier, so she can get things done in the world, not only inside
Serene.

**Beyond that,** the direction is a system that does more of the routine work itself and asks a
person only where judgement is genuinely needed. The pieces already point there: timers that
escalate on their own, a revival sweep that decides what deserves a second try, tickets proposed
from the conversation itself, and an assistant who proposes the next step instead of waiting to
be asked. The goal is not to replace the people who use it, but to remove everything from their
day that is not the conversation itself.

The honest summary: the company's core operation runs on software it owns outright, built to
luxury-product standards, with privacy and record-keeping discipline most internal tools never
have, and an AI layer on top that both answers and acts.

---

## 10. Run it locally

```bash
pnpm install
cp .env.example .env.local   # fill in the keys; every variable is described in docs/operations/environments.md
pnpm dev                     # the web app
```

Never commit `.env.local`.

| Task | Command |
| --- | --- |
| Lint (correctness rules only) | `pnpm lint` |
| Token check, control audit and control tests | `npm run check:ui` |
| Production build (runs the token check first) | `pnpm build` |
| Background jobs against your machine | `pnpm trigger:dev` |

The other services each have their own README: [`backend/README.md`](backend/README.md) (Elaya's
Python brain), [`backend/voice/README.md`](backend/voice/README.md) (the voice worker),
[`connector/README.md`](connector/README.md) and [`connector/RUNBOOK.md`](connector/RUNBOOK.md) (the
Sia watcher), [`connector-hands/README.md`](connector-hands/README.md) (the Hands number) and
[`evals/README.md`](evals/README.md) (Elaya's exam). How to deploy each piece is in
[`docs/operations/deployment.md`](docs/operations/deployment.md).

---

## 11. The repository

```text
serene/
├── src/                 the web app: app routes, components, hooks, styles, Trigger.dev jobs,
│                        and lib/ (actions, services, elaya, constants, utils, validations, types)
├── supabase/            migrations: the schema's history, never edited after they run
├── backend/             the Python service on AWS: Elaya's brain (app/) and the voice worker (voice/)
├── connector/           the Sia watcher: reads the members' WhatsApp groups (Node, Baileys)
├── connector-hands/     the second WhatsApp process, for Hands
├── evals/               the exam that gates every Elaya change
├── scripts/             imports, benches, checks and one-off maintenance
├── docs/                all documentation; start at docs/README.md
├── public/              static files and the app icons
├── graphify-out/        the codebase knowledge graph
├── codebase-analysis-docs/  a generated codebase breakdown from June 2026 (a snapshot)
├── CLAUDE.md            the command layer: the 12 rules, the file registry, the never-do list
└── README.md            this page
```

---

## 12. Where to read next

| You want | Read |
| --- | --- |
| The map of all documentation, with reading orders | [`docs/README.md`](docs/README.md) |
| Serene in plain English, for a non-technical reader | [`docs/00-for-the-board.md`](docs/00-for-the-board.md) |
| What is live, what is next, what "done" means per module | [`docs/01-vision.md`](docs/01-vision.md) |
| What shipped, and when | [`docs/changelog.md`](docs/changelog.md) |
| The system map | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| The engineering rules and the decision log | [`docs/rules/The_Rules.md`](docs/rules/The_Rules.md) |
| The design constitution | [`docs/design/DESIGN-DNA.md`](docs/design/DESIGN-DNA.md) |
| Day-to-day working conventions and the file registry | [`CLAUDE.md`](CLAUDE.md) |

---

## 13. The key rules, short version

- No `any` in TypeScript; strict mode is on.
- No hardcoded colours: every value is a token from `src/styles/design-tokens.css` and the
  neumorphic layer.
- The Supabase client is made in exactly four places: `src/lib/supabase/client.ts`, `server.ts`,
  `admin.ts` and `middleware.ts`.
- All database queries live in `src/lib/services/`; all server actions in `src/lib/actions/`.
- Row-level security is on for every table, no exceptions.
- Every meaningful change gets an entry in `docs/changelog.md`.

The full set is in [`docs/rules/The_Rules.md`](docs/rules/The_Rules.md) and [`CLAUDE.md`](CLAUDE.md).
