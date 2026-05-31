# The Blueprint

### Indulge OS — Eia Platform

> **This document is the single source of truth for the Indulge OS build.**
> Every AI assistant, every developer, and every cursor prompt reads this first.
> Do not contradict it. Do not work around it. If a rule needs to change, log it in the Decision Log.

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [Tech Stack](#2-tech-stack)
3. [Naming System](#3-naming-system)
4. [Roles & Domains](#4-roles--domains)
5. [Access Control Model](#5-access-control-model)
6. [Folder Structure](#6-folder-structure)
7. [Codebase Rules](#7-codebase-rules)
8. [Phase Status](#8-phase-status)
9. [Decision Log](#9-decision-log)

---

## 1. What We Are Building

Indulge OS is a production-grade internal operating system for all Indulge teams. It is not a prototype. It is not an iteration of the previous codebase. It is a clean foundation built to last decades.

The previous build had too many things wired together in the wrong ways. This build starts from zero with explicit rules, clear boundaries, and no shortcuts.

**The architecture is modular by design.** The base layer — Eia — is the OS every team member logs into. On top of it, domain-specific modules load for the right people. Adding a new module never touches the base layer.

---

## 2. Tech Stack

| Layer           | Tool                   | Version / Notes            |
| --------------- | ---------------------- | -------------------------- |
| Framework       | Next.js App Router     | 16                         |
| Language        | TypeScript             | 5 — strict mode, no `any`  |
| Styling         | Tailwind CSS           | v4                         |
| UI primitives   | shadcn/ui              | latest                     |
| Database        | Supabase (PostgreSQL)  | 17                         |
| Auth            | Supabase Auth          | —                          |
| Realtime        | Supabase Realtime      | —                          |
| Animation       | Framer Motion          | 11                         |
| Forms           | React Hook Form + Zod  | —                          |
| Async jobs      | Trigger.dev            | v3                         |
| Deployment      | Vercel                 | —                          |
| Package manager | pnpm                   | —                          |
| Drag-to-reorder | @dnd-kit               | canonical — use everywhere |
| WhatsApp        | Gupshup v1             | BSP provider               |

**Stack is final. Do not propose alternatives to any layer in this table.**

---

## 3. Naming System

| Name    | What It Is                                                |
| ------- | --------------------------------------------------------- |
| **Eia** | The OS — the platform every Indulge team member logs into |
| **Lia** | The agentic AI model that lives inside Eia                |
| **Gia** | The CRM module — loads for Gia domains (onboarding, concierge, b2b, house, legacy, shop) |
| **Sia** | The Concierge module — reserved for future use            |

---

## 4. Roles & Domains

### Roles

Stored in `public.profiles`. Used in all authorization logic. Never derived from JWT claims.

| Role      | Description                                                                             |
| --------- | --------------------------------------------------------------------------------------- |
| `founder` | Full visibility and editability across all domains                                      |
| `admin`   | User management, system configuration, root-level edit access on every module           |
| `manager` | Oversees their domain, reviews performance, approves actions                            |
| `agent`   | Works tasks, leads, and tickets within their own domain only                            |
| `guest`   | Limited read access — reserved for future use                                           |

### Domains

| Domain       | Gia module? | Data Scope          |
| ------------ | ----------- | ------------------- |
| `concierge`  | Yes         | Concierge leads     |
| `onboarding` | Yes         | Onboarding leads    |
| `b2b`        | Yes         | B2B leads           |
| `house`      | Yes         | House (resort) data |
| `legacy`     | Yes         | Legacy leads        |
| `shop`       | Yes         | Shop data           |
| `finance`    | No          | Finance data        |
| `marketing`  | No          | Marketing data      |
| `tech`       | No          | Tech data           |

**`GIA_DOMAINS`** constant in `src/lib/constants/domains.ts` lists the 6 Gia-enabled domains. Any feature that gates on "is this a Gia domain" must use this constant — never a hardcoded list.

---

## 5. Access Control Model

**Two axes:** every user has one `role` and one `domain`. That is it.

Authorization reads ONLY from `public.profiles`. Never from JWT claims (JWT can be stale; a profile update is live immediately).

Two helper functions are the only functions any RLS policy should call:
- `get_user_role()` — returns `user_role` enum
- `get_user_domain()` — returns `app_domain` enum

Both are `SECURITY DEFINER SET search_path = public`. Both are defined in migration 0001.

**Cast rule:** `get_user_domain()` returns `app_domain` enum. When comparing to a `text` column, always cast: `get_user_domain()::text`. Without the cast, PostgreSQL raises error 42883. This bit us in migrations 0042–0044 — all fixed with explicit casts.

**Two-layer security (Rule A-09):** RLS enforces at DB level AND the Server Action enforces at application level. Never rely on one layer alone.

**`founder` and `admin`** have full access to all domains. All other roles are domain-scoped — they can only read and write records that belong to their domain.

**One domain per user.** There is no grants table and no multi-domain assignment in the current implementation.

---

## 6. Folder Structure

```
eia/
├── CLAUDE.md                        ← root rules, phase status, never-do list
├── .cursorrules                     ← identical to CLAUDE.md
├── .env.local                       ← never committed
├── .env.example                     ← always committed
│
├── docs/
│   ├── The_Blueprint.md             ← this file — single source of truth
│   ├── The_Rules.md                 ← 50+ coded rules across 8 sections
│   ├── The_Profile.md               ← profiles system, auth model, admin UI
│   ├── The_Gia.md                   ← Gia CRM module spec
│   ├── design-dna.md                ← full design reference (typography, tokens, components)
│   └── changelog.md                 ← ALL changes logged here (single source of truth)
│
├── src/
│   ├── app/
│   │   ├── CLAUDE.md
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── update-password/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx           ← inline <script> for zero-flash theme
│   │   │   ├── dashboard/
│   │   │   ├── leads/
│   │   │   │   └── [id]/            ← lead dossier (slug-based URLs)
│   │   │   ├── tasks/
│   │   │   │   └── [id]/            ← group task workspace
│   │   │   ├── campaigns/
│   │   │   │   └── [id]/
│   │   │   ├── performance/
│   │   │   ├── whatsapp/
│   │   │   ├── settings/
│   │   │   ├── profile/
│   │   │   ├── admin/
│   │   │   │   └── users/
│   │   │   │       ├── new/
│   │   │   │       └── [id]/
│   │   │   └── error-log/
│   │   ├── api/
│   │   │   └── webhooks/
│   │   │       ├── leads/           ← inbound lead webhook (Meta / Pabbly)
│   │   │       └── whatsapp/        ← inbound WhatsApp webhook (Gupshup)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── CLAUDE.md
│   │   ├── ui/                      ← 26+ display-only token-compliant primitives
│   │   ├── layout/                  ← Sidebar, TopBar
│   │   ├── admin/
│   │   ├── campaigns/
│   │   ├── dashboard/
│   │   │   └── widgets/
│   │   ├── leads/
│   │   ├── notifications/
│   │   ├── performance/
│   │   ├── profile/
│   │   ├── settings/
│   │   ├── tasks/
│   │   └── whatsapp/
│   │
│   ├── lib/
│   │   ├── CLAUDE.md
│   │   ├── supabase/
│   │   │   ├── client.ts            ← browser client — only place
│   │   │   ├── server.ts            ← server client — only place
│   │   │   ├── admin.ts             ← service-role client — user creation only
│   │   │   └── middleware.ts        ← session refresh — only place
│   │   ├── actions/                 ← ALL server actions
│   │   ├── services/                ← ALL DB queries
│   │   ├── validations/             ← ALL Zod schemas + form-errors.ts
│   │   ├── constants/               ← typed enums: domains, roles, statuses, widgets
│   │   ├── utils/
│   │   │   ├── sanitize.ts          ← sanitizeText() — only sanitizer
│   │   │   ├── phone.ts             ← normalizeToE164() — only normalizer
│   │   │   ├── dates.ts             ← formatDate(), toUTC(), formatDuration()
│   │   │   ├── numbers.ts           ← formatCount(), formatCurrency() etc.
│   │   │   ├── scroll.ts
│   │   │   ├── chart-tokens.ts      ← getChartTokens() — Recharts bridge
│   │   │   ├── sla.ts               ← nextBusinessDeadline(), businessMinutesBetween()
│   │   │   └── whatsapp-period.ts
│   │   └── types/
│   │       ├── database.ts          ← all DB types (regenerated via Supabase CLI)
│   │       ├── index.ts             ← DashboardSummary + ActionResult + shared types
│   │       └── whatsapp.ts          ← WhatsApp-specific types
│   │
│   ├── hooks/
│   │   ├── useDashboardLayout.ts    ← key: eia:dashboard:layout:${userId}:v1
│   │   ├── useLeadColumnPreferences.ts ← key: eia:leads:columns:${userId}:v1
│   │   ├── useNotifications.ts      ← Realtime subscription
│   │   └── useToast.ts
│   │
│   ├── styles/
│   │   └── design-tokens.css        ← ALL CSS variables, all five themes
│   │
│   └── middleware.ts                ← session refresh; excludes /api/webhooks
│
└── supabase/
    ├── migrations/                  ← 51 migrations (0001–0051)
    │   └── CLAUDE.md
    └── config.toml
```

**The CLAUDE.md files are not optional.** They are the first thing any AI assistant reads when working in each area. Every session ends with an instruction to update the relevant CLAUDE.md if anything changed. `docs/changelog.md` receives an entry for every meaningful change — feature, fix, migration, new package.

---

## 7. Codebase Rules

Non-negotiable. Changing any rule requires a Decision Log entry with justification.

| Code | Rule |
| ---- | ---- |
| A-01 | Authorization reads only from `public.profiles`. JWT claims are never trusted. |
| A-02 | Client components mutate data via Server Actions only. No direct DB calls from client-side code. |
| A-03 | All DB queries go through service functions in `lib/services/`. No raw Supabase calls in components or actions. |
| A-04 | Feature folders own their code. Cross-feature data flows through `lib/` only. Never import from another feature folder. |
| A-05 | One Supabase client per context. Instantiated only in `lib/supabase/client.ts`, `server.ts`, `admin.ts`, and `middleware.ts`. Never elsewhere. |
| A-08 | Every new table has RLS enabled in its migration. No exceptions. |
| A-09 | Two-layer security always: RLS at DB level AND application check in the Server Action. |
| A-11 | Async work over 3 seconds or needing retry → Trigger.dev. Never in route handlers. |
| A-14 | Never edit a migration that has already run in production. Write a new one. |
| S-01 | Every Server Action Zod-validates first, before any DB call. No exceptions. |
| S-02 | `sanitizeText()` on every user text before DB write. `normalizeToE164()` on every phone field before DB write. |
| S-03 | All `SECURITY DEFINER` functions must have `SET search_path = public`. |
| S-06 | Never trust client-supplied IDs without verifying ownership at the application layer. |
| V-01 | Every colour is a CSS variable from `src/styles/design-tokens.css`. No hex values in components. Ever. |
| V-05 | z-index values only from the `--z-*` token scale. No arithmetic on tokens. No `z-[999]`. |
| Q-11 | Every switch over a union type is exhaustive — use `assertNever()` from `src/lib/utils/assert-never.ts`. No `default` branch. |
| Q-12 | Search the codebase for an existing equivalent before creating any component, hook, util, or service function. Search by behaviour, not filename. |
| D-01 | Log and activity tables (`profile_audit_log`, `lead_activities`, `lead_notes`, `task_remarks`, `task_audit_log`) are append-only. No `UPDATE` or `DELETE`. Ever. The only permitted exception: suppression columns on `task_remarks` — writable by admin/founder only via `suppressTaskRemarkAction`. |
| D-02 | No magic strings. Domain names, role names, and status values live in `lib/constants/` as typed enums. Never hardcoded inline. |
| D-03 | Server Actions return `{ data, error }`. Never throw. Never void. Components handle both branches explicitly. |
| D-04 | `@dnd-kit` is the canonical drag library. Use it everywhere drag-to-reorder is needed. Never add an alternative. |

---

## 8. Phase Status

| Phase | Status | Key Deliverable |
| ----- | ------ | --------------- |
| 0 | Complete | Foundation, design tokens, auth pages |
| 1 | Complete | Profiles, `get_user_role()` / `get_user_domain()`, admin user management |
| 2 | Complete | `agent_routing_config`, invite flow, user detail page |
| 3 | Complete | Gia: leads ingestion (Meta/Pabbly), round-robin assignment, lead list page |
| 4 | Complete | Lead dossier (`/leads/[id]`), full lifecycle Called → Won/Nurturing/Lost/Junk |
| 5 | Complete | Profile page, theme system (5 themes), zero-flash theme script |
| 6 | Complete | Modal primitive, Suspense-split filters, column picker, Add Lead, error log |
| 7 | Complete | Dashboard bento grid (5 widgets), `useDashboardLayout`, RSC consolidation |
| 8 | Complete | Performance page (agent self-view), Campaign Analytics command center |
| 9 | Complete | Toast + notification inbox, team benchmarks, SLA Engine (8 rules), Settings page |
| 10 | Complete | Performance page: manager & founder views (agent roster, domain tabs, custom date range) |
| UI Foundation | Complete | 26+ component library, component sweep, `ComboboxDropdown`, `TimePicker`, `BackButton`, `SectionCard` |
| OS Tasks | Complete | `task_groups`, `task_remarks`, `SubTaskModal` two-zone, group workspace, tags, checklist, `add_task_remark_with_status` RPC, `MyTasksCalendarView` |
| Perf | Complete | DB indexes, RPC consolidation (leads, tasks, dashboard), Suspense streaming, cursor pagination |
| WhatsApp | Complete | Gupshup v1, `whatsapp_conversations/messages/reads/notification_logs`, `/whatsapp` page, 4 notification templates, `get_wa_unread_count` RPC |
| Lead Hardening | Complete | Inline reassignment, team notes, junk revival, won deal capture, lead slug URLs, domain enum normalization |
| Admin/Profile Redesign | Complete | Canonical wide two-column layout on `/admin/users/[id]` and `/profile`, `SectionCard`, `BackButton`, `NewUserClient` |
| Dashboard v2 | Complete | Widget resize (height + width), domain tab selectors, Lead Volume multi-line chart, role-scoped activity feed |

**Current focus:** Lia AI presence, client records (post-won flow).

---

## 9. Decision Log

Every architectural decision that deviates from or extends the rules above must be logged here before implementation.

| Date | Decision | Chosen | Why |
| ---- | -------- | ------ | --- |
| 2026-05-28 | **task_remarks suppression: column restriction is application-layer only.** PostgreSQL RLS UPDATE policies cannot restrict which columns a permitted user may write — they only control row eligibility. Alternatives: (a) DB trigger that raises an exception if non-suppression columns change, (b) separate `suppression_requests` table. | Application-layer enforcement only — `suppressTaskRemarkAction` writes exactly `{is_suppressed, suppressed_by, suppressed_at}`. | Trigger option adds complexity with no user-visible benefit — admin/founder are trusted actors; the action is the single write path. Limitation documented in migration, Server Action, and `supabase/migrations/CLAUDE.md`. |
| 2026-05-28 | **`log_task_changes()` fallback: when `auth.uid()` is NULL (service-role context), attribute the change to `NEW.assigned_to`.** A service-role reassignment records the new assignee as the actor, not the initiator. Alternatives: (a) add `changed_by` column to `tasks`, (b) accept the imperfection. | Accept the imperfection; no new column on `tasks`. | Service-role writes mutating `assigned_to` are rare (Trigger.dev reminder callbacks only). Adding a `changed_by` parameter to every task mutation action widens every call site. Audit log is for manager-visible compliance review, not forensic attribution. Documented in trigger body and `supabase/migrations/CLAUDE.md`. |
| 2026-05-28 | **`task_audit_log` uses `ON DELETE CASCADE` on the `task_id` FK.** Deleting a task removes its audit trail. Alternatives: `ON DELETE RESTRICT` or `ON DELETE SET NULL`. | `ON DELETE CASCADE`. | Task deletion is admin/founder-only at the application layer. Retaining orphaned audit rows for deleted tasks adds schema complexity with no practical compliance benefit. |
| 2026-05-29 | **`task_messages` renamed to `task_remarks` (migration 0022).** Pre-production table, zero data to preserve. Adds `status_change` nullable column (CHECK values coupled to `tasks.status`). DROP CASCADE used. | DROP + CREATE. | Rename-in-place requires manual policy and index recreation with higher inconsistency risk. The rename better reflects what the records represent — contextual updates with optional status transitions, not chat messages. |
| 2026-05-29 | **`addLeadCallNote` and `updateLeadStatus` collapsed to single-transaction RPCs.** 9 and 5 sequential DB awaits respectively. | SECURITY DEFINER RPCs (migrations 0030–0031). | Sequential awaits leave partial state visible between steps. A single transaction is atomic. SLA side-effects remain fire-and-forget in the action layer (Trigger.dev calls cannot be rolled back transactionally). |
| 2026-05-29 | **Dashboard summary collapsed to a single cached RSC fetch (perf-01).** 5 client-initiated `startTransition` server action calls replaced with one `getDashboardSummary` RSC call using React `cache()`. `unstable_cache` not viable — `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures. | React `cache()` in the service function + RSC invocation at the page level. | Zero POST calls on initial dashboard load. `ManagerLeadVolumeWidget` still fires a server action on period toggle — volume was intentionally excluded from the RPC. |
| 2026-05-29 | **`get_group_task_summaries` SECURITY DEFINER: domain scoping enforced inside RPC body, not via caller-supplied parameter.** Initial implementation accepted `p_domain text` from the caller. | Self-enforcing WHERE clause using `get_user_role()` / `get_user_domain()` inside the function body. | SECURITY DEFINER bypasses RLS entirely. Caller-supplied scope parameters on SECURITY DEFINER functions are a security hole. **All future SECURITY DEFINER RPCs follow this pattern: replicate the RLS check inside the function body, never accept a scope parameter from the caller.** |
| 2026-05-30 | **WhatsApp provider: Gupshup v1 BSP (not Meta Cloud API direct).** Initial implementation used Meta Cloud API. Reverted to Gupshup. | Gupshup v1 with `x-gupshup-secret` auth, dual-format inbound parser, and template-based outbound. | Gupshup handles WABA compliance, template registration, and delivery receipts as a BSP. Meta direct requires WABA setup we do not control. Gupshup is already in use for agent/manager notifications. |
| 2026-05-30 | **Lead slugs (migrations 0045–0046): collision resolved by appending `-2`, `-3`, etc. in the DB function.** Alternative: UUID suffix. | Numeric suffix (`-2`, `-3`). Backfill re-run ordered by `created_at ASC` so the earliest lead wins the undecorated slug. | Numeric suffixes are human-readable and still URL-safe. UUID suffixes defeat the readability purpose of slugs. The DB function handles collision atomically. |
| 2026-05-30 | **`app_domain` enum cast rule codified.** Any RLS policy or SQL comparing `get_user_domain()` to a `text` column must cast `get_user_domain()::text`. Root cause of 42883 errors fixed in migrations 0042–0044. | Explicit `::text` cast at every comparison site. | PostgreSQL does not implicitly cast an enum to text in operator resolution. The fix must be applied consistently — every new migration that compares domain to a text column must use the cast. |
| 2026-05-31 | **`add_task_remark_with_status` RPC performs inline `auth.uid()` check rather than relying on caller-supplied auth.** Migration 0051. Previous version had an auth gap — `adminClient.rpc()` bypasses RLS, so the function accepted any authenticated caller's remark without verifying they had permission to post. | Inline `auth.uid()` check inside the SECURITY DEFINER function body. | Consistent with the `get_group_task_summaries` precedent (2026-05-29 decision above). SECURITY DEFINER functions must self-enforce authorization — never trust that the calling action has already done the check. |

---

_The Blueprint — Indulge OS. Last updated: 2026-05-31._
