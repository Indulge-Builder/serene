# System Overview

> **Purpose:** the whole system in one read: what Serene is, its modules, where each piece runs, which API routes exist, what runs in the background, how a request flows, and where every code-layer concept is documented.
> **Audience:** engineers (the new-engineer entry point; non-technical readers start at `../00-for-the-board.md`).
> **Source-of-truth scope:** topology and hosting, the API route list, the background-work summary, request flow, cross-page shell features, the Realtime registry, the hook index, and the service-file → home-doc map. Details live in the linked home docs; the code-adjacent registries (root `CLAUDE.md` File Locations, `src/lib/services/CLAUDE.md`, `src/lib/CLAUDE.md`, `src/components/CLAUDE.md`) carry the per-function detail.
> **Last verified:** 2026-09-26 against `package.json`, `src/proxy.ts`, `src/app/api/` and `src/app/.well-known/` (every route file), `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(client)/layout.tsx`, `src/trigger/` (all 18 files), `src/lib/services/` (all 93 files), `src/hooks/` (all 20 files), every `.channel(` in `src/`, `src/lib/supabase/schemas.ts`, `src/lib/constants/themes.ts`, `backend/app/`, `connector/`, and `docs/changelog.md` back to 2026-07-02.

---

## 1. What Serene is

Serene is the internal operating system for Indulge Global, a luxury concierge company. It is a
production platform: sales agents, the concierge floor and the founders work inside it all day
(73 accounts across nine domains as of 2026-09-26). **Serene** is the base every teammate logs
into (shell, auth, theming, navigation, dashboard, tasks, notes). Modules load on top for the
people who need them, and adding a module never changes the base.

| Module | What it is | Who uses it | Home doc |
| --- | --- | --- | --- |
| **Serene** (the OS) | Shell, auth, themes, navigation, dashboard, tasks, notes, notifications, profile, the Team page | Everyone | this doc, `auth-and-rbac.md`, `../pages/` |
| **Gia** | The sales CRM for the four Gia domains (onboarding, house, shop, legacy): leads, deals, campaigns, budget, performance, escalations, the sales WhatsApp inbox, the SLA engine | Gia domains, admin, founder | `../modules/gia.md` |
| **Elaya** | The AI presence: chat in-app, on WhatsApp and through outside AI apps (MCP); tools over every module; two brains (Node, Python); the analyst layer (ask the database, pulse, brief, alerts, deep read); living memory; playbooks | Admin, founder, the tech workbench, the Gia domains, concierge | `../modules/elaya.md`, `../modules/elaya-analyst.md`, `../integrations/mcp.md` |
| **Sia** | The concierge desk: a read-only archive of member and vendor WhatsApp groups (the Baileys watcher), queendoms and seats, the `/sia` viewer | Concierge floor (own queendom), admin, founder | `../modules/sia.md`, `../pages/sia.md`, `../integrations/sia-connector.md` |
| **Members** | The member twin: the spine, facts, people, events, the chat profiler, the pulse and Serene's judgement, the card and ID vault, the finance page | Concierge floor (own queendom), admin, founder | `../modules/members.md`, `../pages/members.md` |
| **Tickets** | Serene's own ticketing for member requests: the board, the per-ticket sentinel, the intake sweep that suggests tickets, the training loop | Concierge floor, admin, founder | `../modules/tickets.md`, `../pages/tickets.md` |
| **Freshdesk mirror** | A read-only copy of the Freshdesk account (schema `freshdesk`) and the `/freshdesk` page | Concierge floor (own queendom's group), admin, founder | `../integrations/freshdesk.md` |
| **Books** | Zoho Books, read only: `/books` for the organisation and the live ledger on each member's finance page | Admin, founder | `../integrations/zoho-books.md` |
| **Vendors** | The supplier book, the job ledger, the one ranking, the live extractor that reads Freshdesk notes | Concierge floor, admin, founder | `../modules/vendors.md` |
| **Subscriptions** | The company's subscriptions and bills tracker | Finance, tech, admin, founder | `../modules/subscriptions.md` |
| **Revival** | A daily sweep that turns silent leads back into tasks | Gia | `../modules/revival.md` |
| **Call intelligence** | The `/helpdesk` case and hook library | Everyone (hidden from the concierge nav) | `../modules/call-intelligence.md` |
| **Oversight** | `/oversight`, the three-tier live task drill | Managers and up | `../pages/oversight.md` |
| **Mobile** | The `/m` pocket layer: four rooms plus the Elaya knob; admin and founder phones open it by default | Every signed-in role reaches it; the rooms carry data for admin and founder (all Gia domains) and a Gia manager (own domain) | `../modules/mobile-ops.md` |

Not shipped: **Hands** (Elaya handing member jobs to an outside agent such as Instinct, from a
second WhatsApp number). Step 1 is committed (`a11f297`, 2026-09-26): schema `hands` (migration
0245, **not applied**), `hands-service.ts`, `hands-mutations.ts`, and a second Baileys process in
`connector-hands/`. There is no page, no Elaya tool and no traffic yet. Plan: `hands-plan.md`.

## 2. Where everything runs

```text
   Meta / Pabbly, shop app ──┐   Gupshup ──┐   Freshdesk ──┐        Browser / PWA (staff)
   (lead webhooks)           │  (WhatsApp) │  (webhook)    │        Outside AI apps (MCP, OAuth)
                             ▼             ▼               ▼                 │
                 ┌──────────────────────────────────────────────────────┐   │
                 │  Vercel: Next.js 16 (src/)                            │◀──┘
                 │  proxy.ts · RSC pages · server actions · API routes   │
                 └──┬───────────┬───────────┬───────────┬──────────┬────┘
                    │           │           │           │          │ HTTPS + bearer
                    ▼           ▼           ▼           ▼          ▼
               Supabase     Upstash     Trigger.dev   Gupshup,   Python brain (backend/)
               Postgres 17, Redis       v4 workers    Anthropic, ECS Fargate behind
               Auth + OAuth (cache)     (src/trigger) Deepgram,  CloudFront ──┐
               server,                                Freshdesk, │ writes and bridged
               Realtime,                              Zoho,      │ reads come back to
               Storage                                S3 (reads) │ /api/elaya/bridge
                    ▲                                            ▼
                    └──── Sia watcher (connector/, ECS Fargate): WhatsApp groups → sia.wag_*, media → S3
```

| Piece | Runs on | Code | Talks to | Home doc |
| --- | --- | --- | --- | --- |
| The web app (pages, server actions, API routes) | Vercel | `src/` | Supabase, Upstash, Trigger.dev, Gupshup, Anthropic, Deepgram, Freshdesk, Zoho, the Python brain, S3 (presigned reads of Sia media) | this doc |
| Database, Auth, Realtime, Storage | Supabase (Postgres 17) | `supabase/migrations/` | | `database.md`, `migrations.md` |
| Cache | Upstash Redis (REST) | `src/lib/redis.ts` | | `caching.md` |
| Background jobs | Trigger.dev v4 cloud workers | `src/trigger/` | Supabase, Upstash, Anthropic, Gupshup, Freshdesk | `../integrations/trigger-dev.md` |
| Elaya's Python brain | AWS ECS Fargate (Copilot app `serene`, env `prod`, service `api`, ap-south-1), a load balancer with a CloudFront distribution in front | `backend/` (FastAPI) | Supabase (its own PostgREST client, service role), Anthropic, the web app's `/api/elaya/bridge` | `../modules/elaya.md` |
| The Sia WhatsApp watcher | AWS ECS Fargate (Copilot service `watcher`, one arm64 task, recreate-only deploys) | `connector/` (Baileys) | WhatsApp (read only, never sends), Supabase (`sia` schema, service role; session keys in `sia.wag_auth_state`), S3 (media) | `../integrations/sia-connector.md` |

### External services

| Service | Used for | Direction | Home doc |
| --- | --- | --- | --- |
| Gupshup (WhatsApp BSP) | The Gia sales inbox, notification templates, Elaya's staff WhatsApp channel, the customer welcome | in (webhook) and out | `../integrations/whatsapp-gupshup.md` |
| Pabbly (Meta and Google lead ads), the website, the shop app | Lead ingestion | in (webhook) | `../integrations/lead-ingestion.md` |
| Freshdesk API | The mirror (minute poll + webhook). Serene never writes to Freshdesk | read | `../integrations/freshdesk.md` |
| Zoho Books API | `/books` and member finance. Read only; nothing from Zoho lands in Postgres | read | `../integrations/zoho-books.md` |
| Anthropic | Every model call, behind the provider-neutral layer (`src/lib/elaya/provider.ts`; `adapters/anthropic.ts` is the only file that imports the SDK). Models are `llm_providers` rows, not code | out | `../modules/elaya.md` |
| Deepgram | Voice transcription (Nova-2, `hi-Latn`); audio is never stored | out | `../modules/voice-dictation.md` |
| Web Push (VAPID, `web-push`) | Push notifications to subscribed devices | out | `../modules/web-push.md` |
| AWS S3 | Sia media: the watcher writes, the app mints 15-minute presigned reads | both | `../integrations/sia-connector.md` |
| Supabase OAuth server | Outside AI apps sign in as a Serene user for the MCP connector (consent page `/oauth/consent`) | in | `../integrations/mcp.md` |

**Regions.** Vercel, Supabase and Upstash are all in Mumbai (measured in the 2026-09-16
navigation trace, changelog); the AWS services are in ap-south-1 (Mumbai).

### The standing rules of the topology

- **Postgres is the one source of truth.** Redis only caches reads, Realtime only pushes changes,
  and a cold cache is always correct. Zoho data is read live (cached briefly), never stored.
- **Every mutation is a server action or a mutation core** (A-02). The only HTTP routes are the ones
  in §4 (P-02).
- **Outward sends that must finish run in `after()` with the send awaited** (A-16): Vercel freezes
  the lambda when the response flushes.
- **"Python thinks, Node mutates."** The Python brain never writes a table itself: writes (and the
  reads whose data layer lives in Node) go back through `/api/elaya/bridge`, which runs the same
  registry, cores, gates and PII seam as the Node brain. The Node thinking loop is frozen, with
  retirement targeted for 2026-10-16 (Decision Log, `../rules/The_Rules.md`).
- **The watcher never sends a WhatsApp message.** Exactly one watcher holds the session.

## 3. The data platform (Supabase)

**Schemas.** One database, several folders. Cross-schema joins and foreign keys work; PostgREST
embeds do not (PGRST200), which is why the cross-schema reads have their own helpers.

| Schema | Holds | How code reaches it |
| --- | --- | --- |
| `public` | Staff and platform: profiles, tasks and their events, notifications, Elaya's tables, vendors, subscriptions, usage, settings rows | plain `.from()` |
| `gia` | The 22 Gia tables (leads, deals, SLA, routing, revival, ad spend, the sales WhatsApp tables, the helpdesk library), moved 2026-09-17 (0210) | `giaDb(client)` in `src/lib/supabase/schemas.ts` |
| `member` | The member twin (the old `clients` tables, renamed and moved 2026-09-17, 0211) | `memberDb(client)` |
| `sia` | The WhatsApp group archive (`wag_*`), queendoms, tickets, sentinel state, intake proposals, draft reviews, lessons | `.schema('sia')`; `wag_*` are service-role only |
| `freshdesk` | The Freshdesk mirror (0193) | `freshdeskDb()` in `freshdesk-sync.ts`; service-role only |
| `elaya_read` | Cleaned views for Elaya's read-only SQL (0223) | only through `public.elaya_run_query()`, as the login-less role `elaya_reader` |
| `hands` | The hands layer's threads, messages and outbox (0245, committed, **not applied**) | `handsDb()`; nothing uses it in production yet |

`eslint.config.mjs` refuses an unscoped `.from()` on a moved table. Lead-task reads across
`public.tasks` and `gia.task_gia_meta` go through `gia-task-links.ts`; embeds of `profiles` from a
moved table resolve through the read-only `gia.profiles` / `member.profiles` views (0212/0213).
Full map: `database.md`; the move itself: `schema-restructure-plan.md`.

**Auth.** Supabase Auth: email and password, magic-link invites, and password reset by 6-digit
code. The same project runs the Supabase OAuth server that outside AI apps sign in through for
the MCP connector. Authorization never comes from the token: it is read from `public.profiles`
on every request (`auth-and-rbac.md`).

**Realtime.** See §8.

**Storage buckets.**

| Bucket | Holds | Read path |
| --- | --- | --- |
| `avatars` | Profile photos | public URL |
| `ad-creatives` | Campaign creatives | public URL |
| `elaya-training` | Customer-training material for the welcome blast | public URL |
| `whatsapp-media` | Gia WhatsApp inbox media | signed URL (`whatsapp-media.ts`) |
| `freshdesk-attachments` | Durable copies of Freshdesk files | signed URL (`freshdesk-media.ts`) |
| `vendor-invoices` | Vendor invoices | signed URL (`signVendorInvoiceAction`) |
| `subscription-invoices` | Subscription invoices | signed URL (`actions/subscriptions.ts`) |
| `suggestions` | Screenshots on staff suggestions | signed URL (`suggestions-service.ts`) |

Sia media is not in Supabase Storage: it lives in S3 (§2). The private `hands-media` bucket
arrives with migration 0245 (not applied).

## 4. API routes (P-02)

Everything else is a server action. These are the only routes, and each is a logged carve-out in
`../rules/The_Rules.md`.

| Route | Methods | Called by | Auth | Home doc |
| --- | --- | --- | --- | --- |
| `/api/webhooks/leads` | GET (health), POST | Pabbly, the website, the shop app (`?source=meta\|google\|website\|shop_app`) | Rate limit, then the raw payload is logged, then a Bearer secret per sender (`PABBLY_WEBHOOK_SECRET` or `SHOP_APP_WEBHOOK_SECRET`), timing-safe | `../integrations/lead-ingestion.md` |
| `/api/webhooks/whatsapp` | GET (Meta verify), POST | Gupshup | `x-gupshup-secret` header; staff numbers are routed to Elaya before the lead pipeline | `../integrations/whatsapp-gupshup.md` |
| `/api/webhooks/freshdesk` | GET, POST | Freshdesk automation rules | `x-freshdesk-webhook-secret` header; stores the event, acks, re-reads the ticket in `after()` | `../integrations/freshdesk.md` |
| `/api/auth/callback` | GET | legacy: old Supabase Auth links only | the auth code exchange; nothing in the app sends people here any more (invites land on the client page `/auth/callback`) | `../pages/auth.md` |
| `/api/elaya/chat` | POST (SSE) | The Elaya chat UI (page, floating widget, `/m/elaya`) | Session, `hasElayaAccess`, burst limit, daily cap | `../modules/elaya.md` |
| `/api/elaya/bridge` | POST | The Python brain | `BRAIN_API_SECRET` bearer; the principal is re-read from `profiles` | `../modules/elaya.md` |
| `/api/manifest` | GET | The browser (PWA install) | none: static JSON, `?icon=` validated | §9 |
| `/api/mcp` | GET, POST, DELETE | Outside AI apps (Claude, ChatGPT, others) | Supabase OAuth bearer → `verifyMcpBearer` → profile; the role must be in the `mcp_audience` row and Elaya must be on for the person; per-user rate limit | `../integrations/mcp.md` |
| `/.well-known/oauth-protected-resource` (also under `/api/mcp`) | GET, OPTIONS | MCP clients | public discovery document (RFC 9728) | `../integrations/mcp.md` |

`src/proxy.ts` skips session refresh for `/api/webhooks`, `/api/manifest`, `/api/elaya/bridge`,
`/api/mcp` and `/.well-known`: none of their callers carries a cookie.

## 5. Background work (Trigger.dev)

Nineteen files in `src/trigger/` define 28 tasks. The full inventory (ids, schedules, the settings
row that switches each one on, what it does) lives in **`../integrations/trigger-dev.md` §3**;
each module doc owns what its own task does. In short:

| Kind | What runs | Home doc |
| --- | --- | --- |
| Delayed, one run per record | the lead SLA timer; task reminders, due-soon, overdue and nudges | `../modules/gia.md`, `../pages/tasks.md` |
| Every minute | Freshdesk sync, ticket intake, the ticket sentinel, the Sia watcher alarm, the usage presence snapshot | `../integrations/freshdesk.md`, `../modules/tickets.md`, `../integrations/sia-connector.md`, `../pages/usage.md` |
| Every few minutes or hourly | the vendor extractor, Elaya's alert sweep, the member profiler, the staff WhatsApp link, the usage rollup, the member pulse | `../modules/vendors.md`, `../modules/elaya-analyst.md`, `../modules/members.md`, `../modules/sia.md`, `../pages/usage.md` |
| Daily or weekly (IST) | the lead revival sweep (02:00), the label refresh (05:30), the two briefs (10:00, 18:00), the nightly usage rollup (00:20), the weekly member judgement (Sunday 04:00), the weekly lesson writer (Monday 06:00) | `../modules/revival.md`, `../modules/elaya-analyst.md`, `../pages/usage.md`, `../modules/members.md`, `../modules/tickets.md` |
| On demand | the deep read, one member judgement, one lesson draft | `../modules/elaya-analyst.md`, `../modules/members.md`, `../modules/tickets.md` |

Most schedules read a settings row before doing anything, so a schedule can be deployed while its
work is switched off. IST schedules use `Asia/Calcutta` (Trigger.dev rejects `Asia/Kolkata`). The
revival sweep's cron is `0 2 * * *` in that zone, so it fires at 02:00 IST; the 07:30 in its code
comment is wrong.

## 6. Request flow: one navigation

1. **Proxy** (`src/proxy.ts`): the bypass paths in §4 return at once. Everything else runs
   `updateSession()` (`src/lib/supabase/middleware.ts`), which refreshes the session and checks the
   token with `auth.getClaims()` (a local signature check, no auth-server round trip), then sets an
   `x-pathname` header.
2. **Root layout** (`src/app/layout.tsx`): stamps `data-theme` and `data-neu` on `<html>` from the
   `serene-theme` and `serene-appearance` cookies (no flash of the wrong theme), mounts
   `<MotionProvider>` and the service worker registration.
3. **Dashboard layout** (`src/app/(dashboard)/layout.tsx`): `getCurrentProfile()` (identity from
   `getClaims()`, authorization from the `profiles` row, memoised per request). No profile or an
   inactive one → `/login`; `canAccessRoute()` says no → `/dashboard`. It then mounts the shell
   (§9). The `/m` layout (`src/app/(client)/layout.tsx`) checks the session and `is_active` only;
   each room decides what a role gets.
4. **Page (RSC)**: a thin orchestrator. List pages render the header and filter bar, then a
   `<Suspense>`-wrapped async child that calls `src/lib/services/` (Redis first where cached).
   The dashboard paints its shell first and streams the widgets through `ui/Await.tsx`.
5. **Interaction**: client components call server actions (`Zod → requireProfile → gate → core or
   service → invalidate caches → revalidatePath`), which return `{ data, error }`.
6. **Live updates**: Realtime channels (§8) or, where Realtime cannot see the rows, a short poll.

## 7. Service files → home doc

All database access lives in `src/lib/services/` (A-03). Every file, grouped by owner.
`src/lib/services/CLAUDE.md` is the per-function index.

| Area | Service files | Home doc |
| --- | --- | --- |
| Leads | `leads-service.ts` | `../pages/leads.md` (dossier reads: `../pages/lead-dossier.md`) |
| Lead writes | `lead-mutations.ts` (the shared lead cores; UI actions and Elaya tools both call them) | `../modules/gia.md` |
| Lead ingestion | `lead-ingestion.ts`, `lead-enquiries-service.ts` (shop-app product enquiries) | `../integrations/lead-ingestion.md` |
| Lead cache | `lead-cache.ts`, `cache-helpers.ts` | `caching.md` |
| Deals | `deals-service.ts` | `../pages/deals.md` |
| Dashboard | `dashboard-service.ts` | `../pages/dashboard.md` |
| Performance | `performance-service.ts` | `../pages/performance.md` |
| Budget | `ad-spend-service.ts`, `domain-targets-service.ts` | `../pages/budget.md` |
| Ad creatives | `ad-creatives-service.ts` | `../pages/ad-creatives.md` |
| Lead routing | `agent-routing-service.ts` | `../pages/settings.md` |
| SLA engine | `sla-service.ts` | `../modules/gia.md` |
| Revival | `revival-service.ts`, `revival-gate.ts` | `../modules/revival.md` |
| Call intelligence | `intelligence-service.ts` | `../modules/call-intelligence.md` |
| Sales WhatsApp | `whatsapp-service.ts` | `../pages/whatsapp.md` |
| Gupshup | `whatsapp-api.ts`, `whatsapp-ingestion.ts`, `whatsapp-media.ts`, `lead-assignment-notify.ts` | `../integrations/whatsapp-gupshup.md` |
| Tasks | `tasks-service.ts`, `task-mutations.ts` | `../pages/tasks.md` |
| Lead ↔ task across schemas | `gia-task-links.ts` | `database.md` (cross-schema reads) |
| Oversight | `oversight-service.ts`, `task-events.ts` | `../pages/oversight.md` |
| Mobile and the activity feed | `mobile-service.ts`, `activity-service.ts`, `activity-events.ts` | `../modules/mobile-ops.md` |
| Team and accounts | `profiles-service.ts`, `staff-account-mutations.ts` | `../pages/user-management.md` |
| Seats and access | `queendom-seats.ts`, `sia-access.ts` | `auth-and-rbac.md` |
| Notifications | `notifications-service.ts` | §9 below |
| Push | `push-service.ts` | `../modules/web-push.md` |
| Notification preferences | `notification-prefs-service.ts` | `../pages/profile.md` |
| Voice | `transcription-service.ts` | `../modules/voice-dictation.md` |
| Adoption tracking | `usage-service.ts` | `../pages/usage.md` |
| Staff suggestions | `suggestions-service.ts` | `../pages/suggestions.md` |
| Subscriptions | `subscriptions-service.ts` | `../modules/subscriptions.md` |
| RPC boundary | `rpc-helpers.ts` (`callAdminRpc`, `callAdminRpcChecked`, `callAdminRpcAll`) | `database.md` |
| Elaya core | `elaya-service.ts`, `elaya-actions-service.ts`, `elaya-whatsapp.ts`, `llm-providers-service.ts`, `elaya-memory-service.ts`, `elaya-playbooks-service.ts`, `elaya-playbook-drafter.ts` | `../modules/elaya.md` |
| Elaya notes | `elaya-notes-service.ts` | `../pages/notes.md` |
| Elaya customer channel | `elaya-customer.ts`, `elaya-training-service.ts` | `../modules/customer-welcome-blast.md` |
| Elaya analyst | `elaya-query-service.ts`, `pulse-service.ts`, `elaya-briefing.ts`, `elaya-alerts.ts`, `elaya-deep-read.ts`, `elaya-jobs-service.ts` | `../modules/elaya-analyst.md` |
| MCP connector | `mcp-log-service.ts`, `oauth-server-service.ts` | `../integrations/mcp.md` |
| Sia | `sia-service.ts`, `sia-staff-link.ts` | `../pages/sia.md`, `../modules/sia.md` |
| Members | `members-service.ts` | `../pages/members.md` |
| Member twin | `member-mutations.ts`, `member-relations.ts`, `member-observation-reader.ts`, `member-profiler.ts`, `member-assessment.ts`, `member-health.ts`, `member-vault.ts` | `../modules/members.md` |
| Tickets | `tickets-service.ts` | `../pages/tickets.md` |
| Ticket engine | `ticket-mutations.ts`, `ticket-draft-core.ts`, `ticket-creator.ts`, `ticket-intake.ts`, `ticket-sentinel.ts`, `ticket-vendor.ts`, `intake-service.ts`, `intake-lessons.ts`, `draft-reviews.ts` | `../modules/tickets.md` |
| Freshdesk mirror | `freshdesk-api.ts`, `freshdesk-sync.ts`, `freshdesk-media.ts`, `freshdesk-service.ts` | `../integrations/freshdesk.md` |
| Zoho Books | `zoho-api.ts`, `zoho-service.ts` | `../integrations/zoho-books.md` |
| Vendors | `vendors-service.ts`, `vendor-mutations.ts`, `vendor-search-intent.ts`, `vendor-extract.ts`, `vendor-extract-sync.ts` | `../modules/vendors.md` |
| Hands (not shipped) | `hands-service.ts`, `hands-mutations.ts` (step 1, migration 0245 not applied) | `hands-plan.md` |

Outside `lib/services/` but part of the same data layer: `src/lib/elaya/` (the brain, the tool
registries, `elaya-data.ts` the single Elaya read seam, `access.ts` the member and lead
predicates, `pii.ts`, `memory.ts`, `python-brain.ts`) → `../modules/elaya.md`; `src/lib/mcp/`
→ `../integrations/mcp.md`.

## 8. Realtime registry

Every subscription names a mount-scoped `useId()` nonce in its channel (Q-14) and cleans up with
`supabase.removeChannel(channel)` (P-06). Realtime respects RLS, so a user only receives rows they
could select.

| Surface | Table | Channel | Filter |
| --- | --- | --- | --- |
| Notification inbox (`NotificationsProvider`, one per session) | `public.notifications` | `notifications:${userId}:${mountId}` | `recipient_id` |
| Task remarks (`TaskRemarksPanel`) | `public.task_remarks` | `task-remarks-${taskId}-${mountId}` | task |
| Group workspace (`GroupTaskWorkspace`) | `public.tasks` | `workspace-subtasks-${groupId}-${mountId}` | `group_id` |
| Oversight rails (`OversightRail`) | `public.task_events` | `oversight-${channelKey}-${mountId}` | domain or subject |
| Mobile Activity room (`ActivityRoom`) | `public.activity_events` | `activity-${domain}-${mountId}` | `domain` |
| Sales WhatsApp list (`WhatsAppShell`) | `gia.whatsapp_conversations` | `wa-conversations-${userId}-${mountId}` | none (RLS scopes delivery) |
| Sales WhatsApp thread (`ConversationPanel`) and the lead dossier card (`LeadWhatsAppCard`) | `gia.whatsapp_messages` | `wa-messages-${conversationId}-${mountId}` | `conversation_id` |
| Ticket board (`TicketBoard`) | `sia.tickets` | `ticket-board:${queendomId ?? 'all'}:${mountId}` | `queendom_id` when one is picked; none for the all view |

Not Realtime: the `/sia` chat tails its group with a 4-second poll through a server action,
because the `wag_*` tables are service-role only and Realtime would deliver nothing to a browser
session. The Sia console polls watcher health the same way.

**Known gap: `public.tasks` is not in the `supabase_realtime` publication**, so the group
workspace's subscription to it never receives an event (its subtask list refreshes only on
reload or its own writes). Checked on production 2026-09-26: the publication holds
`gia.whatsapp_conversations`, `gia.whatsapp_messages`, `public.activity_events`,
`public.notifications`, `public.task_events`, `public.task_remarks` and `sia.tickets`. No
migration ever added `public.tasks`. The fix is a one-line migration, or dropping the dead
subscription.

## 9. Shell features (cross-page, owned here)

Mounted once in the dashboard layout unless noted.

- **Sidebar** (`layout/Sidebar.tsx`): three modes (full, icon rail, drawer on phones). A link shows
  only when `isNavVisible(profile, href)` says so: reachable by `canAccessRoute`, then the founder's
  curated list (`FOUNDER_NAV_PREFIXES`) and per-domain hidden pages (`DOMAIN_NAV_HIDDEN`). Visibility
  is not authorization (`auth-and-rbac.md`).
- **Page controls** (`layout/PageControls.tsx`, `TOP_BAR_ENABLED` in `constants/feature-flags.ts`):
  the notification bell and the admin/founder domain selector sit on each page's title row. There
  is no separate top bar. `CondensingPageHeader` is the sticky title row that condenses on scroll.
- **Global domain selector** (`layout/DomainSelector.tsx`, admin and founder): writes `?domain=`
  and the `serene-domain` cookie. Pages resolve scope through `resolveDomainParam()`
  (`utils/domain-scope.ts`): admin and founder get `param ?? cookie ?? null`; everyone else gets
  `null`. Narrowing only, never a security boundary.
- **Command palette** (`layout/CommandPaletteProvider.tsx` + `ui/CommandPalette.tsx`, built on
  `cmdk`): ⌘K or Ctrl-K from anywhere; lists only what `isNavVisible` allows; the panel chunk loads
  on first open.
- **Boot screen** (`layout/AppBootScreen.tsx`): the mark draws itself on the first hard load of a
  browser session only (sessionStorage), then fades. Route changes use each route's `loading.tsx`.
- **Themes and appearance**: eight accent themes (earth, air, water, fire, candy, rose, moss,
  lilac; earth is the default) on `data-theme`, and Light / Dark / Auto on `data-neu`. Both are
  stored on `profiles` (`theme`, `appearance`), mirrored in cookies for the server render, and kept
  in sync by `ThemeInitializer`. Law: `../design/DESIGN-DNA.md`.
- **In-app notifications**: `notifications` rows written by `createNotification()`
  (`notifications-service.ts`); `NotificationsProvider` owns the inbox state, the one Realtime
  channel and the chime; `useNotifications()` reads it. A failed notification never fails the
  action that caused it. Per-user channel preferences gate sends (`notification-prefs-service.ts`,
  `../pages/profile.md`).
- **Web Push**: `createNotification()` fans out to `push-service.ts` after the in-app row, so every
  caller gets push for free; dead endpoints are pruned. Home: `../modules/web-push.md`.
- **PWA**: `app/manifest.ts` + `/api/manifest` (per-user home-screen icon from the
  `serene-app-icon` cookie, kept in sync by `IconInitializer`), `public/sw.js` (network-first
  navigations, caches only the offline shell and icons), registered in the root layout in
  production. Install guide: `../operations/pwa-install-guide.md`.
- **Mobile hand-off**: on a phone, a bare `/dashboard` landing sends admin and founder to `/m`
  (the `serene-force-desktop` cookie opts out). Home: `../modules/mobile-ops.md`.
- **Elaya presence**: the floating Elaya button (`elaya/ElayaWidget.tsx`) mounts only when
  `hasElayaAccess(profile)` is true, and hides itself on `/elaya`. Chat, tools and brains:
  `../modules/elaya.md`.
- **Voice dictation**: `ui/DictationButton.tsx` is the one record → transcribe → editable draft
  cluster (never auto-sends). Home: `../modules/voice-dictation.md`.
- **Feedback**: `SuggestionFeedbackProvider` wraps the shell so the Sidebar's "Send feedback" and
  the mobile trigger share one composer (`../pages/suggestions.md`).
- **Adoption heartbeat**: `UsagePresence` beats every 60 s while the tab is visible and recently
  used; it writes Redis only (`caching.md`, `../pages/usage.md`).
- **Toasts**: `ToastProvider` + the `toast` singleton (`useToast`); at most three on screen; a
  danger toast never auto-dismisses.
- **Motion**: `<MotionProvider>` in the root layout (LazyMotion strict, `reducedMotion="user"`);
  every file imports `{ m as motion }` (A-17).

## 10. Hook index (`src/hooks/`)

| Hook | One line |
| --- | --- |
| `useAudioRecorder` | THE voice-recording hook (codec negotiation, 2-minute cap, releases the mic) |
| `useCreateTriggerModal` | Opens a create modal only when its trigger counter moves |
| `useDashboardCohortSync` | Applies the dashboard date-cohort payload instead of refetching per widget |
| `useDashboardLayout` | Widget order and size per user (`serene:dashboard:layout:${userId}:v1`) |
| `useDebounce` | The only debounce utility |
| `useDomainRoomData` | THE mobile-room per-domain data lifecycle (seed, fetch once per domain, keep) |
| `useLeadColumnPreferences` | Leads column visibility and order; THE pattern for any column picker (Q-08) |
| `useMediaQuery` | THE viewport hook (`MQ.mobile` / `tabletDown` / `touch`) |
| `useModalFocus` | The topmost modal owns focus; its portals stay inside its focus scope |
| `useMountOnFirstOpen` | Mount latch for `next/dynamic` modals that stay mounted |
| `useNotificationSound` | The inbound chime |
| `useNotifications` | Reads the inbox state from `NotificationsProvider` (context only now) |
| `usePopoverKeyboard` | Keyboard support for the older popovers |
| `usePortalAnchor` | THE floating-panel anchoring (pairs with `<FloatingPanel>`) |
| `usePushSubscription` | Gesture-gated Web Push subscribe (never auto-prompts) |
| `useTaskCompletionToggle` | Optimistic completion-circle toggle |
| `useToast` | Re-export of the toast singleton |
| `useUrlFilters` | THE URL-param filter plumbing for list filter bars (+ `useMultiSelectUrlParam`) |
| `useWidgetData` | THE dashboard-widget data lifecycle (RSC seed, auto-fetch, refetch) |
| `useWidgetDensity` | Resolves each dashboard widget cell to a density from its measured size |

Deeper prop and behaviour contracts live code-adjacent in `src/components/CLAUDE.md` and
`src/lib/CLAUDE.md`; this tree does not repeat them.
