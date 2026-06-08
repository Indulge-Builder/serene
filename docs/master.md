# Eia — Master Reference Document

> **This is the single file to read before touching anything.**
> It contains the complete operational picture of the Eia platform —
> what it is, how it is built, every rule, every migration, every file.
> For deep dives into individual surfaces, follow the page-doc links in §8.
>
> *Last verified: 2026-06-08 against the live codebase. Sources: The_Blueprint.md · The_Profile.md · context.md · changelog.md · CLAUDE.md (root + lib + app) · The_Rules.md · `package.json` · `supabase/migrations/`*

---

## Table of Contents

1. [What Eia Is](#1-what-eia-is)
2. [Tech Stack](#2-tech-stack)
3. [Naming System](#3-naming-system)
4. [Authorization Model](#4-authorization-model)
5. [Roles & Domains](#5-roles--domains)
6. [The profiles Foundation](#6-the-profiles-foundation)
7. [Build Phases — Complete History](#7-build-phases--complete-history)
8. [Route Map & Page Docs](#8-route-map--page-docs)
9. [Migration Index — 84 Migrations](#9-migration-index--84-migrations-ordered-by-timestamp-prefix)
10. [File Map — Where Everything Lives](#10-file-map--where-everything-lives)
11. [Services Registry](#11-services-registry)
12. [Actions Registry](#12-actions-registry)
13. [Constants & Utils Registry](#13-constants--utils-registry)
14. [Task System](#14-task-system)
15. [WhatsApp System](#15-whatsapp-system)
16. [SLA Engine](#16-sla-engine)
17. [Codebase Rules (A · S · V · Q · D)](#17-codebase-rules)
18. [The Never-Do List](#18-the-never-do-list)
19. [Decision Log](#19-decision-log)
20. [How to Fix Anything](#20-how-to-fix-anything)
21. [Design System Quick Reference](#21-design-system-quick-reference)
22. [Redis Caching Layer](#22-redis-caching-layer)
23. [Export System (CSV / XLSX)](#23-export-system-csv--xlsx)

---

## 1. What Eia Is

**Eia** is the internal operating system for Indulge Global — India's premier luxury concierge brand in Goa. It is a production-grade platform, not a prototype. Agents spend 8–12 hours a day inside it. Every visual and architectural decision is made for that reality.

The architecture is modular. **Eia** is the base OS every team member logs into. Domain-specific modules load on top for the right people. Adding a module never touches the base layer.

The previous build had too many things wired together incorrectly. This build starts from zero with explicit rules, clear boundaries, and no shortcuts.

---

## 2. Tech Stack

**Stack is final. Do not propose alternatives to any layer.**

| Layer | Tool | Version / Notes |
| ----- | ---- | --------------- |
| Framework | Next.js App Router | 16 — proxy (`src/proxy.ts`), **not** `middleware.ts` |
| Language | TypeScript | 5 — strict mode, no `any` |
| Styling | Tailwind CSS | v4 |
| UI primitives | shadcn/ui | latest |
| Database | Supabase (PostgreSQL) | 17 |
| Auth | Supabase Auth | — |
| Realtime | Supabase Realtime | — |
| Caching | Upstash Redis | `@upstash/redis` ^1.38 — cache-aside layer (see §22) |
| Animation | Framer Motion | ^12.40 |
| Charts | Recharts | ^3.8 — always via `useChartTokens()`, never raw CSS vars |
| Icons | lucide-react | ^1.16 — exclusive icon library |
| Forms | React Hook Form (^7.76) + Zod (^4.4) | — |
| Spreadsheet export | `xlsx` (SheetJS) | ^0.18 — client-side XLSX/CSV (see §23) |
| Async jobs | Trigger.dev | `@trigger.dev/sdk` ^4.4 (**v4**, not v3) |
| Deployment | Vercel | — |
| Package manager | pnpm | — |
| Drag-to-reorder | @dnd-kit | ^6 core / ^10 sortable — canonical, use everywhere |
| WhatsApp | Gupshup v1 | BSP provider |

> **No React Query, no Sentry, no virtualization library are dependencies.** Data fetching is Server-Components-first, with a Server-Action-in-`useEffect` pattern for client widgets (Q-15). Server logging is `[module]`-prefixed `console.warn`/`console.error`. Large lists use server-side `.range()` / cursor pagination. Do not assume any of these three libraries exist.

---

## 3. Naming System

| Name | What It Is |
| ---- | ---------- |
| **Eia** | The OS — the platform every Indulge team member logs into |
| **Lia** | The agentic AI model that lives inside Eia |
| **Gia** | The CRM module — loads for Gia domains (onboarding, concierge, b2b, house, legacy, shop) |
| **Sia** | The Concierge module — reserved for future use |

---

## 4. Authorization Model

### The Core Principle

Authorization in Eia reads from **one place only: `public.profiles`**.

Never from JWT claims. Never from session metadata. Never from any other table.

**Why:** JWT claims can be stale. A user's role gets updated in the database, but their JWT token still carries the old role until it expires. Reading from `profiles` directly means the moment an admin updates someone's role, that change is live immediately. No token expiry. No lag. No security gap.

**This principle is set on day one and never changed.**

### Two Helper Functions

These are the **only** functions any RLS policy should call:

```sql
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_domain()
RETURNS app_domain
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT domain FROM profiles WHERE id = auth.uid();
$$;
```

**Why `SECURITY DEFINER`:** These functions run with postgres privileges. This breaks the circular dependency — an RLS policy on `profiles` needs to call `get_user_role()`, but without `SECURITY DEFINER`, RLS on `profiles` would block the query inside `get_user_role()` before it could return anything.

**Why `SET search_path = public`:** Prevents search path injection attacks. Mandatory on all `SECURITY DEFINER` functions. No exceptions.

### The Cast Rule

`get_user_domain()` returns `app_domain` (enum). When comparing with a `text` column (e.g. `task_groups.domain`), always cast:

```sql
get_user_domain()::text
```

Never compare enum directly to text. This causes PostgreSQL error **42883** (operator does not exist). This bit us in migrations 0042–0044 — all fixed with explicit casts.

### Two-Layer Security (Rule A-09)

RLS enforces at DB level **AND** the Server Action enforces at application level. Never rely on one layer alone.

---

## 5. Roles & Domains

### Roles

Stored in `public.profiles`. Used in all authorization logic. Never derived from JWT claims.

| Role | What it means |
| ---- | ------------- |
| `founder` | Full access. All domains. All data. All actions. |
| `admin` | Full access. All domains. All data. All actions. |
| `manager` | Manage their domain. Full access within it. |
| `agent` | Work within their own domain only. |
| `guest` | Read-only. Scoped. Reserved for future use. |

### Domains

| Domain | Gia module? | Who uses it |
| ------ | ----------- | ----------- |
| `concierge` | Yes | Concierge Agents |
| `onboarding` | Yes | Onboarding Agents |
| `b2b` | Yes | Business Team |
| `house` | Yes | House (resort) team |
| `legacy` | Yes | Legacy team |
| `shop` | Yes | Shop team |
| `finance` | No | Finance team |
| `marketing` | No | Marketing team |
| `tech` | No | Tech team |

**`GIA_DOMAINS`** constant in `src/lib/constants/domains.ts` lists the 6 Gia-enabled domains. Any feature that gates on "is this a Gia domain" must use this constant — never a hardcoded list.

**One domain per user.** There is no grants table and no multi-domain assignment. If a user genuinely needs visibility across domains, that is handled operationally (admin temporarily changes their domain).

### SQL Enums (migration 0001)

```sql
CREATE TYPE user_role  AS ENUM ('founder','admin','manager','agent','guest');
CREATE TYPE app_domain AS ENUM ('concierge','onboarding','finance','marketing','tech','shop','b2b','house','legacy');
```

---

## 6. The profiles Foundation

> Every RLS policy in Eia reads from this table. If this table is wrong, everything built on top of it is wrong.
>
> → Deep dive: `docs/user-management-page.md`

### profiles Table (migration 0001)

```sql
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY
                      REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
  username            text UNIQUE CHECK (char_length(username) BETWEEN 3 AND 30),
  email               text NOT NULL UNIQUE,
  phone               text,                          -- E.164 format
  avatar_url          text CHECK (char_length(avatar_url) < 500),
  role                user_role  NOT NULL DEFAULT 'agent',
  domain              app_domain NOT NULL DEFAULT 'concierge',
  job_title           text CHECK (char_length(job_title) < 100),
  reports_to          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  is_on_leave         boolean NOT NULL DEFAULT false,
  theme               text NOT NULL DEFAULT 'earth'
                      CHECK (theme IN ('earth','air','water','fire','cosmos')),
  timezone            text NOT NULL DEFAULT 'Asia/Kolkata',
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role          ON profiles(role);
CREATE INDEX idx_profiles_domain        ON profiles(domain);
CREATE INDEX idx_profiles_domain_active ON profiles(domain) WHERE is_active = true;
```

**Critical column rules:**

- `id` — always matches `auth.users.id`. **Never create a profiles row manually — trigger only.**
- `email` — not editable after creation. Source of truth is `auth.users`.
- `phone` — E.164. `normalizeToE164()` before any write.
- `role` and `domain` — never updatable by the user themselves. Admin/founder only, enforced by `WITH CHECK`.
- `theme` — stored in DB (syncs across devices). Not localStorage. Default: `earth`.
- `last_seen_at` — updated by the proxy (`src/proxy.ts`) on every authenticated request, max once per minute per user.

### RLS Policies

```sql
-- All authenticated users can read all profiles (needed for assignee pickers etc.)
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- WITH CHECK blocks privilege escalation — users cannot change their own role/domain
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id OR get_user_role() IN ('admin', 'founder'))
  WITH CHECK (
    (get_user_role() IN ('admin', 'founder'))
    OR (
      auth.uid() = id
      AND role   = (SELECT role   FROM profiles WHERE id = auth.uid())
      AND domain = (SELECT domain FROM profiles WHERE id = auth.uid())
    )
  );
-- No INSERT (trigger only). No DELETE (soft-deactivate via is_active).
```

### on_auth_user_created Trigger

**This is the ONLY way profiles rows are created.** Fires when Supabase creates a new `auth.users` row.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, domain)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role,   'agent'::user_role),
    COALESCE((NEW.raw_user_meta_data->>'domain')::app_domain, 'concierge'::app_domain)
  );
  RETURN NEW;
END; $$;
```

**Two creation flows (both use this trigger):**

1. **Set password** — admin → `createUser` action → Supabase Admin API `createUser()` → trigger fires → profile created. `phone` and `job_title` require a second `updateProfileFields` call.
2. **Magic link invite** — admin → `inviteUser` action → `inviteUserByEmail()` → user clicks link → trigger fires → profile created with `role` and `domain` from metadata.

### profile_audit_log (migration 0001)

Append-only. Required for SOC 2 / ISO 27001 compliance. Fields audited: `role`, `domain`, `is_active`, `is_on_leave`, `full_name`, `email`, `username`. `theme` and `timezone` intentionally excluded (not authorization-relevant).

- `ON DELETE RESTRICT` on `profile_id` — profiles with audit history **cannot** be hard-deleted.
- Trigger: `log_profile_changes()` — uses `COALESCE(auth.uid(), NEW.id)` as `changed_by` so service-role migration writes still produce valid audit rows.

### agent_routing_config (migration 0002)

Auto-created alongside agent profiles. The on-duty switch for round-robin assignment.

```sql
CREATE TABLE agent_routing_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  shift_start time,    -- advisory: '09:00'
  shift_end   time,    -- advisory: '18:00'
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

- `is_active = false` → agent leaves round-robin pool instantly.
- `shift_start` / `shift_end` are advisory — ingestion service reads them; DB does not auto-enforce.
- Auto-created by `handle_agent_routing_config()` trigger — `AFTER INSERT OR UPDATE ON profiles WHERE role = 'agent'`. `ON CONFLICT DO NOTHING` (idempotent).

### Profile Edge Cases (must be respected everywhere)

- **Deactivating a user:** `is_active = false`. **Never delete a profiles row.** `ON DELETE RESTRICT` on `profile_audit_log` enforces this at DB level.
- **Role change is instant:** RLS reads `profiles` live. No token refresh needed.
- **Users cannot self-escalate:** `WITH CHECK` clause blocks writing a different `role` or `domain` onto their own row.
- **Domain change is not retroactive:** Records previously assigned to the user stay assigned.
- **theme null safety:** Always fall back to `earth`. Never crash on a missing theme preference.
- **username null:** UI always falls back to `full_name`. Never show null.
- **Concurrent username inserts:** UNIQUE constraint at DB level is the guarantee, not application-layer check.
- **42883 cast errors:** Always `get_user_domain()::text` when comparing to text columns.
- **Service-role writes:** `COALESCE(auth.uid(), NEW.id)` in the audit trigger handles these gracefully.

---

## 7. Build Phases — Complete History

| Phase | Status | Key Deliverable |
| ----- | ------ | --------------- |
| 0 | ✅ Complete | Foundation, design tokens, auth pages |
| 1 | ✅ Complete | Profiles, `get_user_role()` / `get_user_domain()`, admin user management |
| 2 | ✅ Complete | `agent_routing_config`, invite flow, user detail page |
| 3 | ✅ Complete | Gia: leads ingestion (Meta/Pabbly), round-robin assignment, lead list page |
| 4 | ✅ Complete | Lead dossier (`/leads/[id]`), full lifecycle Called → Won/Nurturing/Lost/Junk |
| 5 | ✅ Complete | Profile page, theme system (5 themes), zero-flash theme script |
| 6 | ✅ Complete | Modal primitive, Suspense-split filters, column picker, Add Lead, error log |
| 7 | ✅ Complete | Dashboard bento grid (5 widgets), `useDashboardLayout`, RSC consolidation |
| 8 | ✅ Complete | Performance page (agent self-view), Campaign Analytics command center |
| 9 | ✅ Complete | Toast + notification inbox, team benchmarks, SLA Engine (8 rules), Settings page |
| 10 | ✅ Complete | Performance page: manager & founder views, agent roster, domain tabs |
| UI Foundation | ✅ Complete | 26+ component library, component sweep, `TimePicker`, `MotionButton`, `BackButton`, `SectionCard`. `FilterDropdown` is now the canonical searchable single-select (`ComboboxDropdown` removed 2026-06-01) |
| OS Tasks | ✅ Complete | `task_groups`, `task_remarks`, `SubTaskModal` two-zone, group workspace, tags, checklist, `add_task_remark_with_status` RPC, `MyTasksCalendarView`, Gia tab (`get_gia_tasks`), `task_type`: call / whatsapp_message / other |
| Perf | ✅ Complete | DB indexes, RPC consolidation (leads, tasks, dashboard), Suspense streaming, cursor pagination |
| WhatsApp | ✅ Complete | Gupshup v1, `whatsapp_conversations/messages/reads/notification_logs`, `/whatsapp` page, 4 notification templates, `get_wa_unread_count` RPC |
| Lead Hardening | ✅ Complete | Inline reassignment, team notes, junk revival, won deal capture, lead slug URLs, domain enum normalization, per-field `LeadInfoCard` edits |
| Gia Deals | ✅ Complete | `/deals` page, `get_deals_summary` RPC (0052–0053), role-scoped filters, summary strip. **2026-06-05:** `public.deals` first-class table (0072–0074); walk-in deal creation; `DealWithRelations`; `recordDeal` now inserts deals row before status flip |
| Gia Lead Tasks | ✅ Complete | Dossier `LeadTasksCard` + `create_lead_gia_task` RPC (0054); `/tasks` Gia tab (0055–0056) |
| Ad Creatives Admin | ✅ Complete | `/admin/ad-creatives`, Storage bucket `ad-creatives`, multi-video per campaign (0058), carousel |
| Admin/Profile Redesign | ✅ Complete | Canonical wide two-column layout, `SectionCard`, `BackButton`, `NewUserClient` |
| Dashboard v2 | ✅ Complete | Widget resize, domain tab selectors, Lead Volume multi-line chart, role-scoped activity feed |
| Performance v2 | ✅ Complete | Agent KPI row: 4-across cards + Recharts sparklines + donut outcome breakdown (2026-06-01) |
| Attribution Refactor | ✅ Complete (2026-06-03) | 7 flat ad columns → `source`, `medium`, `utm_campaign` + `attribution jsonb`; migration 0065 |
| Domain Route Authorization | ✅ Complete (2026-06-03) | `canAccessRoute`, `DOMAIN_ROUTE_MAP`, layout guard, Sidebar filtering — non-Gia domains see only their permitted routes |

**Current focus:** Lia AI presence, client records (post-won flow).

---

## 8. Route Map & Page Docs

Every route has a dedicated intelligence document generated during the DRY audit pass. These are the deepest references for each surface.

### Authenticated Routes (`/dashboard` group)

| Route | Purpose | Page Doc |
| ----- | ------- | -------- |
| `/dashboard` | Bento grid dashboard — 5 widgets, role-scoped, RSC-first | `docs/dashboard-page.md` |
| `/leads` | Lead list — Suspense-split, server-side filters + pagination | `docs/lead-page.md` |
| `/leads/[slug]` | Lead dossier — full lifecycle management | `docs/lead-page.md` |
| `/deals` | Won leads with deal amount — all roles | `docs/deals-page.md` |
| `/tasks` | Gia Tasks + My Tasks + Group Tasks (tabbed) | `docs/tasks-page.md` |
| `/tasks/[id]` | Group task workspace — list + board views | `docs/tasks-page.md` |
| `/campaigns` | Campaign analytics list — manager/admin/founder | `docs/campaigns-page.md` |
| `/campaigns/[id]` | Campaign detail — metrics strip + lead table | `docs/campaigns-page.md` |
| `/performance` | Performance metrics — role-adaptive (agent/manager/founder) | *(see CLAUDE.md)* |
| `/whatsapp` | WhatsApp messaging — split layout, Realtime | `docs/whatsapp-page.md` |
| `/settings` | Agent roster + shift windows — manager/admin/founder | `docs/settings-page.md` |
| `/profile` | User self-edit — theme, password, avatar, details | `docs/auth-pages.md` |
| `/admin/users` | Team management list — admin/founder | `docs/user-management-page.md` |
| `/admin/users/new` | Create user (password or invite) | `docs/user-management-page.md` |
| `/admin/users/[id]` | User detail — edit profile + authorization | `docs/user-management-page.md` |
| `/admin/ad-creatives` | Campaign video upload + manage — admin/founder | `docs/ad-creatives-page.md` |
| `/error-log` | System error log | *(see CLAUDE.md)* |

### Auth Routes (`/auth` group — unauthenticated)

| Route | Purpose | Page Doc |
| ----- | ------- | -------- |
| `/login` | Email + password sign-in | `docs/auth-pages.md` |
| `/forgot-password` | Password reset email | `docs/auth-pages.md` |
| `/update-password` | New password (post magic link) | `docs/auth-pages.md` |

### API Routes (webhooks only — no other API routes exist)

| Route | Purpose |
| ----- | ------- |
| `POST /api/webhooks/leads` | Inbound lead webhook (Meta / Pabbly) — Bearer auth |
| `POST /api/webhooks/whatsapp` | Inbound WhatsApp webhook (Gupshup) — `x-gupshup-secret` auth |

### Design Reference

| Doc | What it covers |
| --- | -------------- |
| `docs/design-system.md` | Full design system — all tokens, all themes, all components, all motion rules |

---

## 9. Migration Index — 84 Migrations (ordered by timestamp prefix)

> **Numbering caveat:** migrations are applied in **filename-timestamp order** (`YYYYMMDD…`), not by the trailing serial. Two serials were reused on different days — `0058` (`ad_creatives_multi_video` on 06-01 **and** `task_groups_flat_visibility` on 06-05) and `0066` (`leads_city_column` on 06-03 **and** `domain_health_metrics` on 06-04). Always trust the date prefix, never the serial. The authoritative file list is `supabase/migrations/`.

| # | What it creates / changes |
| - | ------------------------- |
| 0001 | `user_role`, `app_domain` enums; `profiles` table; `profile_audit_log`; `get_user_role()`; `get_user_domain()`; `on_auth_user_created` trigger |
| 0002 | `agent_routing_config` table; round-robin helpers; `handle_agent_routing_config` auto-create trigger |
| 0003 | `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` |
| 0004 | `lead_raw_payloads` immutable log |
| 0005 | `ingestion_error` column on `lead_raw_payloads` |
| 0006 | RLS fix for `private_scratchpad` |
| 0007 | `get_next_round_robin_agent()` — atomic `SELECT FOR UPDATE SKIP LOCKED` |
| 0008 | Lead dedup by phone — `previous_lead_id` FK, `get_active_lead_by_phone()` |
| 0009 | `personal_details JSONB` on `leads` |
| 0010 | Three partial indexes: `idx_leads_utm_campaign`, `idx_leads_last_call_outcome`, and `idx_leads_utm_source` (renamed to `idx_leads_source` in migration 0065) |
| 0011 | `idx_leads_phone_text` (`text_pattern_ops`) for ILIKE search |
| 0012 | `ad_creatives` table (campaign_key UNIQUE — later dropped in 0058) |
| 0013 | Three partial indexes on `lead_activities`, `lead_notes`, `leads` (performance) |
| 0014 | `idx_leads_campaign_domain`, `idx_leads_campaign_status`, `get_campaign_metrics` RPC |
| 0015 | `get_campaign_detail_metrics` RPC, `get_campaign_agent_distribution` RPC |
| 0016 | `notifications` table, Realtime enabled |
| 0017 | `task_groups` table; `task_messages` (later replaced); `tasks` extended: title, description, priority, task_category, group_id; status migrated `pending→to_do`, `done→completed` |
| 0018 | `task_groups` RLS domain enforcement — manager scoped |
| 0019 | `task_messages` RLS creator visibility + manager domain scope |
| 0020 | `get_group_task_summaries` RPC — SECURITY DEFINER, self-enforcing domain scoping |
| 0021 | `task_messages` suppression columns + `task_audit_log` append-only + `log_task_changes()` trigger |
| 0022 | `DROP task_messages CASCADE` → `CREATE task_remarks` (adds `status_change` nullable column); Realtime enabled |
| 0023 | `attachments jsonb NOT NULL DEFAULT '[]'` on `tasks` (checklist) |
| 0024 | `tags text[] NOT NULL DEFAULT '{}'` on `tasks`, GIN index |
| 0025 | Task performance indexes (replace stale `pending`-filter indexes) |
| 0026 | `get_personal_tasks` RPC with keyset cursor pagination |
| 0027 | `status_changed_at`, `last_activity_at` on `leads`; SLA notification types |
| 0028 | `lead_sla_timers` table |
| 0029 | `get_dashboard_summary(p_role, p_domain, p_user_id)` RPC — single jsonb, 4 keys |
| 0030 | `add_lead_call_note(...)` RPC — single transaction replacing 9 sequential awaits |
| 0031 | `update_lead_status(...)` RPC — single transaction replacing 5 sequential awaits |
| 0032 | `whatsapp_conversations` table — `lead_id` FK, `agent_id` FK, phone, `last_message_at`, unread_count, RLS, Realtime |
| 0033 | `whatsapp_messages` table — append-only with delivery-receipt exception; `wa_message_id` partial unique index; Realtime |
| 0034 | `whatsapp_conversation_reads` — marks last-read per user per conversation |
| 0035 | `add_task_remark_with_status(...)` RPC — inline auth, conditional status update + remark insert in one transaction |
| 0036 | `get_wa_unread_count(p_user_id)` RPC — total unread conversations |
| 0037 | `wa_messages_outbound_insert` RLS policy — authenticated insert for outbound messages |
| 0038 | `whatsapp_notification_logs` table — logs every template notification attempt |
| 0039 | Fix `update_lead_status` RPC — adds `title` (NOT NULL) and `task_category='gia_followup'` to nurturing auto-task |
| 0040 | `add_lead_plain_note(...)` RPC — plain note without status change or call_count increment |
| 0041 | `normalize_lead_domain` — migrates `leads.domain` to `app_domain` enum; all TG_Global → `onboarding` |
| 0042 | Fix `get_group_task_summaries` domain type mismatch (42883) |
| 0043 | Fix `get_dashboard_summary` domain type mismatch (42883) |
| 0044 | Fix `get_campaign_metrics` domain type mismatch (42883) |
| 0045 | `leads.slug` column — URL-safe unique slugs; `generate_lead_slug()` trigger; backfill |
| 0046 | `generate_lead_slug` collision fix — appends `-2`, `-3` on collision; backfill ordered `created_at ASC` |
| 0047 | `get_dashboard_summary` — agent tasks CTE includes all 3 task categories |
| 0048 | `get_dashboard_summary` — activity limit raised to 25 |
| 0049 | `leads.deal_amount`, `deal_type`, `deal_duration` columns (migration description says `deal_duration` but adds all three deal fields) |
| 0050 | `get_dashboard_summary` — activity feed role-scoped (agent/manager/admin-founder) |
| 0051 | `add_task_remark_with_status` RPC auth fix — view = post gate; `tasks_agent_select` + `task_remarks` RLS aligned to creator/assignee |
| 0052 | `get_deals_summary` RPC — aggregates: `total_deals`, `total_revenue`, `membership_count`, `retail_count` |
| 0053 | `get_deals_summary` manager domain fix — `p_caller_domain` vs `p_filter_domain` split |
| 0054 | `create_lead_gia_task` RPC — atomic two-INSERT (`tasks` + `task_gia_meta`); prevents orphaned tasks |
| 0055 | `get_gia_tasks(p_user_id, p_role, p_domain app_domain)` RPC — Gia tab on `/tasks`; joined lead identity |
| 0056 | `get_gia_tasks` slug prereq — repairs DBs where 0055 ran before 0045 slug column |
| 0057 | `task_type_other` — backfills `email`/`general_follow_up` → `other`; nurturing auto-task uses `other` |
| 0058 | `ad_creatives_multi_video` — drops UNIQUE on `campaign_key`; multiple videos per campaign allowed |
| 0059 | `agent_routing_config.shift_days integer[]` — JS day-of-week array (0=Sun…6=Sat); NULL = use global `BUSINESS_HOURS`; stored/displayed Mon-first |
| 0060 | `leads.resolution_reason text` column + updated `update_lead_status` RPC to persist `p_reason`; revive path (→ `in_discussion`) sets it to NULL |
| 0061 | Drop `leads.private_scratchpad` column + `get_lead_scratchpad(uuid)` function |
| 0062 | `get_dashboard_summary` — adds `p_initial_domain` (4th param, default NULL); agents: only `agent_tasks` + `agent_activity` CTEs execute; managers: scoped to `p_domain` |
| 0063 | `get_agent_recent_activity(p_role, p_domain, p_user_id)` RPC — single SQL replacing two-step Node.js pattern (SELECT ids → .in()); LEFT JOIN for lead name |
| 0064 | Two dashboard refresh RPCs for per-widget refresh buttons — `get_lead_status_summary` + `get_campaign_performance`; CTE logic mirrors 0062; DB returns final jsonb shape |
| 0065 | Attribution refactor — removes `platform`, `campaign_id`, `ad_name`, `utm_content`; renames `utm_source → source`, `utm_medium → medium`; adds `attribution jsonb`; backfills flat columns into JSONB; drops `idx_leads_utm_source`, creates `idx_leads_source` |
| 0066a | *(06-03 `leads_city_column`)* `leads.city text` — dedicated column; backfilled from `personal_details->>'city'`; `city` key removed from `personal_details` JSONB on all existing rows |
| 0067 | *(06-03)* `whatsapp_notification_logs.type` CHECK extended with `lead_initiation`; `sendLeadInitiationMessage` now always logs |
| 0066b | *(06-04 `domain_health_metrics`)* domain-health aggregates RPC — per-domain lead/conversion metrics for founder/admin domain-health view |
| 0068 | *(06-04 `domain_health_add_calls_revenue`)* extends domain-health RPC with call volume + revenue columns |
| 0069 | *(06-04 `dashboard_date_filter`)* dashboard date-range filtering — Pipeline/Campaign/Volume scoped by `leads.created_at` cohort window (see Decision Log 2026-06-04) |
| 0070 | *(06-04 `fix_pipeline_agent_total`)* corrects agent-total double-count in the pipeline widget aggregate |
| 0058b | *(06-05 `task_groups_flat_visibility`)* flat group visibility — a user sees a group if they created it **or** are assigned a subtask in it; `task:group-list` key becomes user-scoped (not domain/role) |
| 0071 | *(06-05 `avatars_storage_bucket`)* public `avatars` Storage bucket + RLS (`avatars_public_read`, `avatars_insert_own`, `avatars_update_own`, `avatars_delete_own`) |
| 0072 | *(06-05)* `public.deals` first-class table — `lead_id` nullable (walk-ins), `contact_name/phone/email`, `domain app_domain`, `deal_amount/type/duration`, `assigned_to`, `won_at` immutable, `client_id` reserved; RLS 3 SELECT policies; 5 indexes; no write policies (admin client only) |
| 0073 | *(06-05)* idempotent backfill: `status='won' AND deal_amount IS NOT NULL` leads → `public.deals`; NOT EXISTS guard |
| 0074 | *(06-05)* `CREATE OR REPLACE get_deals_summary` — source now `public.deals`; structural WHERE → `archived_at IS NULL` only; date filters on `won_at`; two-domain split preserved |
| 0075 | *(06-05 `deals_add_source`)* `deals.source` column — attribution carried onto the deal row at close time |
| 0076 | *(06-05 `domain_health_revenue_from_deals`)* domain-health revenue now reads `public.deals` (not `leads.deal_amount`) — single source of truth for revenue |
| 0077 | *(06-06 `lead_health_column`)* `leads.lead_health` column — precomputed health score **[reverted by 0082]** |
| 0078 | *(06-06 `lead_health_rpc_hooks`)* RPC hooks to populate `lead_health` on mutation **[reverted by 0082]** |
| 0079 | *(06-06 `refresh_lead_health_rpc`)* batch refresh RPC for `lead_health` **[reverted by 0082]** |
| 0080 | *(06-06 `get_leads_status_counts`)* `get_leads_status_counts` RPC — status-bucket counts for the leads filter bar / dashboard |
| 0081 | *(06-06 `dashboard_cold_leads`)* dashboard cold-leads widget query — leads with no activity past threshold |
| 0082 | *(06-06 `revert_lead_health`)* **reverts 0077–0079** — drops the `lead_health` column, index, and refresh RPC; restores `add_lead_call_note` / `add_lead_plain_note` / `update_lead_status` to their pre-health bodies |
| 0083 | *(06-08 `status_counts_drop_health`)* removes the `p_health` param + `l.lead_health` predicate from `get_leads_status_counts` (the last DB remnant of the reverted feature); drops the 9-param overload, recreates with 8 params |

> **`lead_health` is fully removed (2026-06-08).** It was built as a stored DB column + refresh job + performance health-strip + leads filter (0077–0079), then the DB column was reverted (0082), and finally the entire feature — column, RPC param, util, trigger, performance strip, and leads filter — was deleted from code and docs (0083). There is **no** `lead_health` column, no `computeLeadHealth()` util, no `LeadHealthStrip`, no `health` lead filter. Any reference you find to any of these is stale and should be removed. (Unrelated: **Domain Health** — `DomainHealthCard` / `getDomainHealthMetrics` — is a separate, live feature and was not touched.)

---

## 10. File Map — Where Everything Lives

```text
eia/
├── CLAUDE.md                          ← root rules, never-do list, phase status
├── .cursorrules                       ← identical to CLAUDE.md
├── .env.local                         ← never committed
├── .env.example                       ← always committed
│
├── docs/
│   ├── The_Blueprint.md               ← architecture, stack, RBAC, decision log
│   ├── The_Rules.md                   ← 50+ coded rules across 8 sections
│   ├── The_Profile.md                 ← profiles system, auth model, admin UI
│   ├── The_Gia.md                     ← Gia CRM module spec
│   ├── design-dna.md                  ← full design reference
│   ├── context.md                     ← session bootstrap: phases, migrations, file map
│   ├── task-blueprint.md              ← OS Tasks module spec
│   ├── gia-workflow.md                ← lead pipeline audit
│   ├── changelog.md                   ← ALL changes logged here (single source of truth)
│   ├── master.md                      ← THIS FILE
│   ├── lead-page.md                   ← Leads module intelligence document
│   ├── dashboard-page.md              ← Dashboard module intelligence document
│   ├── tasks-page.md                  ← Tasks module intelligence document
│   ├── whatsapp-page.md               ← WhatsApp module intelligence document
│   ├── campaigns-page.md              ← Campaigns module intelligence document
│   ├── settings-page.md               ← Settings module intelligence document
│   ├── user-management-page.md        ← User management module intelligence document
│   ├── ad-creatives-page.md           ← Ad creatives module intelligence document
│   ├── auth-pages.md                  ← Auth + session + profile intelligence document
│   ├── deals-page.md                  ← Deals module intelligence document
│   └── design-system.md              ← Full design system reference manual
│
├── src/
│   ├── proxy.ts                       ← Next.js 16 proxy — session refresh + x-pathname header forwarding + webhook exclusion
│   │
│   ├── app/
│   │   ├── CLAUDE.md
│   │   ├── page.tsx                   ← root redirect → /login or /dashboard
│   │   ├── (auth)/                    ← unauthenticated route group
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── update-password/
│   │   ├── (dashboard)/               ← all authenticated pages
│   │   │   ├── layout.tsx             ← inline <script> for zero-flash theme
│   │   │   ├── dashboard/
│   │   │   ├── leads/ [id]/
│   │   │   ├── deals/
│   │   │   ├── tasks/ [id]/
│   │   │   ├── campaigns/ [id]/
│   │   │   ├── performance/
│   │   │   ├── whatsapp/
│   │   │   ├── settings/
│   │   │   ├── profile/
│   │   │   ├── admin/
│   │   │   │   ├── users/ new/ [id]/
│   │   │   │   └── ad-creatives/
│   │   │   └── error-log/
│   │   ├── api/webhooks/
│   │   │   ├── leads/route.ts         ← POST — Bearer auth + rate limit
│   │   │   └── whatsapp/route.ts      ← POST — x-gupshup-secret; GET 200
│   │   ├── globals.css                ← .layout-canvas, .eia-input, custom scrollbar
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── CLAUDE.md
│   │   ├── ui/                        ← 26+ display-only token-compliant primitives
│   │   ├── layout/                    ← Sidebar (domain-filtered nav), TopBar; CLAUDE.md documents canAccessRoute pattern
│   │   ├── admin/                     ← UsersTable, CreateUserForm, AdCreativesManager
│   │   ├── campaigns/                 ← CampaignCard, CampaignFilters, AdCreativeCarousel
│   │   ├── dashboard/widgets/         ← 5 Gia widgets
│   │   ├── deals/                     ← DealsFilters, DealCard, DealsSummaryStrip, AddDealButton, NewDealModal
│   │   ├── leads/                     ← LeadsTable, LeadsFilters, all dossier components
│   │   ├── notifications/             ← NotificationBell, NotificationPanel
│   │   ├── performance/               ← CoreFourGrid, EffortGrid, CallOutcomeBar
│   │   ├── profile/                   ← ProfileAvatarSection, ThemeSelector, PasswordChangeForm
│   │   ├── settings/                  ← AgentSettingsTable
│   │   ├── tasks/                     ← SubTaskModal, TaskRemarksPanel, GiaTasksTab
│   │   └── whatsapp/                  ← WhatsAppShell, ConversationPanel, MessageBubble
│   │
│   ├── lib/
│   │   ├── CLAUDE.md
│   │   ├── supabase/
│   │   │   ├── client.ts              ← browser client — ONLY place
│   │   │   ├── server.ts              ← server client — ONLY place
│   │   │   ├── admin.ts               ← service-role client — user creation only
│   │   │   └── middleware.ts          ← updateSession() — ONLY place
│   │   ├── actions/                   ← ALL server actions (see §12)
│   │   ├── services/                  ← ALL DB queries (see §11)
│   │   ├── validations/               ← ALL Zod schemas + form-errors.ts
│   │   ├── constants/                 ← (see §13)
│   │   ├── utils/                     ← (see §13)
│   │   └── types/
│   │       ├── database.ts            ← all DB types (Supabase CLI generated)
│   │       ├── index.ts               ← DashboardSummary + ActionResult + shared types
│   │       └── whatsapp.ts            ← WhatsApp-specific types
│   │
│   ├── hooks/
│   │   ├── useDashboardLayout.ts      ← key: eia:dashboard:layout:${userId}:v1
│   │   ├── useLeadColumnPreferences.ts← key: eia:leads:columns:${userId}:v1
│   │   ├── useNotifications.ts        ← owns all notification state + Realtime
│   │   └── useToast.ts                ← thin re-export of toast singleton
│   │
│   ├── styles/
│   │   └── design-tokens.css          ← ALL CSS variables, all five themes
│   │
│   ├── lib/redis.ts                  ← `redis = Redis.fromEnv()` — the ONLY Upstash client instance (§22)
│   └── trigger/
│       ├── lead-sla.ts                ← fireLeadSlaTask, scheduleLeadSlasTask, cancelLeadSlasByLeadTask
│       └── task-reminders.ts          ← scheduleTaskReminder, cancelTaskReminder
│
└── supabase/
    ├── migrations/                    ← 84 migrations (0001–0082; see §9 — numbering is by timestamp, two serials reused)
    │   └── CLAUDE.md
    └── config.toml
```

---

## 11. Services Registry

All queries go through `src/lib/services/`. **No raw Supabase calls in components or actions.**

> **Redis cache-aside is live across most read services** (leads, dashboard, performance, tasks, ad-creatives). Per-function TTLs, key schemas, and invalidation sites are documented in `src/lib/CLAUDE.md` (services registry) and §22 below. The exhaustive per-function TTL list is in `src/lib/CLAUDE.md`; this table lists exports only.

| File | Key Exports |
| ---- | ----------- |
| `ad-creatives-service.ts` | `getAdCreativesForCampaign`, `getAdCreativesForCampaigns` (batch → `Map<key, AdCreative[]>`), `getAllAdCreatives` |
| `agent-routing-service.ts` | `getAgentRoutingConfig`, `getActiveRoutingConfigs`, `setRoutingActive`, `getAgentRosterByDomain` (adminClient — RLS blocks cross-domain manager reads), `setAgentShift` |
| `dashboard-service.ts` | `getDashboardSummary` (React `cache()` — per-request memoisation), `getLeadVolumeByPeriod` |
| `deals-service.ts` | `getDealsByRole` (queries `public.deals`, joins `lead(slug)` + `assignee(full_name)`), `getDealsSummary` (RPC wrapper); exports `DealWithRelations` |
| `lead-assignment-notify.ts` | `notifyLeadAssigned` — the canonical WhatsApp-notification orchestrator for lead assignment; awaits Gupshup sends via `Promise.allSettled` and awaits the `logNotification` write in each `finally`. **Always invoked via `after()` (A-16), never `void`.** |
| `lead-ingestion.ts` | `ingestLead`, `validateAndSanitizeWebhookPayload`, `resolveDomainFromCampaign`, `assignLeadRoundRobin`, `createLeadFromWhatsApp` |
| `leads-service.ts` | `getLeadById`, `getLeadBySlug`, `getLeadsByRole` (returns `{leads, totalCount}`), `getLeadsByRoleCached`, `getLeadFilterOptions`, `getLeadNotesFull`, `getLeadActivitiesFull`, `getCampaignMetrics`, `getCampaignDetailMetrics`, `getCampaignAgentDistribution`, `getAgentsForDomain`, `searchLeadsForTask` |
| `notifications-service.ts` | `getUnreadNotifications`, `getNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `createNotification` |
| `performance-service.ts` | `getCoreFourMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getPreviousPeriodCoreMetrics`, `getTeamBenchmarks` |
| `profiles-service.ts` | `getProfileById`, `getAllProfiles`, `getProfilesByDomain`, `getProfilesByRole`, `getActiveAgentsByDomain`, `isUsernameTaken`, `getCurrentProfile`, `updateProfileFields`, `updateAuthorization`, `setProfileActive` |
| `sla-service.ts` | `getSlaTimersForLead`, `createSlaTimer`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain` — all writes use adminClient |
| `tasks-service.ts` | `getPersonalTasks` (RPC), `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskRemarks`, `getTaskGroupById`, `getPersonalTaskTags`, `getAllLeadTasks`, `getGiaTasksForUser` |
| `whatsapp-api.ts` | **SERVER ONLY.** `sendTextMessage` (Gupshup v1), `sendTemplateMessage`, `sendLeadAssignmentNotification`, `sendSlaAgentNotification`, `sendSlaManagerNotification`. All fire-and-forget safe. Never import in client components. |
| `whatsapp-ingestion.ts` | **SERVER ONLY, adminClient.** `processInboundMessage` (9-step pipeline), `processStatusUpdate` (delivery receipt — the ONLY UPDATE on whatsapp_messages), `getOrCreateConversation` |
| `whatsapp-service.ts` | `getConversations` (cursor paginated), `getMessages` (ASC, joins sender profile), `getUnreadCount` (RPC), `markConversationRead` (UPSERT), `searchConversations` (ILIKE, max 20) |

---

## 12. Actions Registry

All server actions live in `src/lib/actions/`. **Every action: Zod first → `getCurrentProfile()` → service call → `revalidatePath`.**

| File | Key Exports |
| ---- | ----------- |
| `agent-routing.ts` | `toggleAgentRouting`, `setAgentShiftAction` |
| `auth.ts` | (sign in/out helpers) |
| `ad-creatives.ts` | `upsertAdCreative` (admin/founder; normalises campaign_key; 23505 → friendly error), `deleteAdCreative` |
| `dashboard.ts` | 5 widget refresh actions (all re-verify via `getCurrentProfile()`) |
| `deals.ts` | `recordDeal` (canonical — inserts `public.deals` row then delegates `updateLeadStatus('won')`), `createWalkInDeal` (walk-in / direct sales; `lead_id=null`; agent domain-locked server-side), `listAgentsForDealDomain` |
| `leads.ts` | `addLeadCallNote`, `addLeadNote`, `updateLeadStatus`, `assignLead`, `createManualLead`, `createLeadTaskAction`, `recordDeal` (re-export from `deals.ts`), `updatePersonalDetails`, `updateLeadCity`, `updateScratchpad`, `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource`, `listAgentsForDomain`, `searchLeadsAction` |
| `notifications.ts` | `markNotificationReadAction`, `markAllReadAction` |
| `performance.ts` | `getAgentPerformanceAction`, `getAgentListForDomainAction` |
| `profiles.ts` | `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive`, `inviteUser`, `updateProfileAvatar`, `signOutUser` |
| `sla.ts` | `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` |
| `tasks.ts` | `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskRemarkAction`, `suppressTaskRemarkAction`, `updateChecklistAction`, `updateTaskTagsAction`, `getPersonalTaskTagsAction`, `getTaskRemarksAction`, `getGroupSubtasksAction`, `getPersonalTasksAction`, `getTaskGroupByIdAction` |
| `whatsapp.ts` | `sendMessageAction`, `markConversationReadAction`, `resolveConversation`, `reopenConversation`, `getConversationsAction`, `getMessagesAction`, `searchConversationsAction` |

---

## 13. Constants & Utils Registry

### Constants (`src/lib/constants/`)

| File | Contents |
| ---- | -------- |
| `call-outcomes.ts` | `CALL_OUTCOMES`, `CallOutcome`, outcome labels |
| `campaign-domain-map.ts` | `CAMPAIGN_DOMAIN_MAP` (prefix → domain), `DEFAULT_LEAD_DOMAIN = 'onboarding'`, `resolveDomainFromCampaign()` |
| `dashboard-greetings.ts` | Time-of-day greeting strings for the dashboard header |
| `dashboard-widgets.ts` | Widget registry (5 entries), `DEFAULT_LAYOUT_BY_ROLE`, `WIDGET_MAP`, `isValidWidgetId`, `WIDGET_HEIGHT_BY_SIZE`, `WIDGET_SIZE_LABELS` |
| `deal-types.ts` | `DEAL_TYPES`, `DealType`, `DEAL_TYPE_LABELS`, `DEAL_DURATIONS`, `DealDuration`, `DEAL_DURATION_LABELS` |
| `domain-colors.ts` | `DOMAIN_LINE_COLORS` — one `var(--domain-*)` entry per `AppDomain`; resolved via `resolveColorMap()` before Recharts use (V-12) |
| `domain-icons.ts` | `DOMAIN_ICONS` — lucide icon per domain (sidebar, domain-health, pickers) |
| `domains.ts` | `APP_DOMAINS`, `GIA_DOMAINS` (6 Gia-enabled), `DOMAIN_LABELS`, `GIA_DOMAIN_FILTER_ITEMS` |
| `export-columns.ts` | `LEAD_EXPORT_HEADERS`, `ACTIVITY_EXPORT_HEADERS`, `NOTE_EXPORT_HEADERS` — column maps for CSV/XLSX export (§23) |
| `lead-columns.ts` | `LEAD_COLUMNS` (11 columns), `DEFAULT_COLUMN_ORDER`, `LEAD_COLUMN_MAP` — `status` and `name` are locked |
| `lead-resolution-reasons.ts` | Lost/junk resolution reason enums + labels (persisted to `leads.resolution_reason`, migration 0060) |
| `lead-sources.ts` | `LEAD_SOURCES` (meta, google, website, whatsapp, referral, ypo, events), `LEAD_SOURCE_LABELS`, `LEAD_SOURCE_OPTIONS`, `getLeadSourceLabel()` |
| `lead-statuses.ts` | Status enums + badge config + `LEAD_STATUS_COLORS` |
| `leads.ts` | Shared leads-domain constants (page sizes, default filter shape) |
| `redis-keys.ts` | **`REDIS_KEYS`** (the ONLY source of Redis key strings), `buildLeadListKey()`, `REDIS_TTL`, `TASK_*_TTL`, `PERF_*_TTL`. No inline key strings or magic TTLs anywhere else (§22) |
| `motion.ts` | `ENTER_DURATION`, `EXIT_DURATION`, `BASE_DURATION`, `FAST_DURATION`, `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `SPRING_CONFIG`, `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `FADE_VARIANTS`, `MOTION_BUTTON_DEFAULTS` |
| `roles.ts` | `USER_ROLES`, `ROLE_LABELS`, `MANAGER_ROLES` |
| `route-permissions.ts` | `ALWAYS_ALLOWED_PREFIXES` (`['/dashboard', '/profile']`), `DOMAIN_ROUTE_MAP` — domain → permitted route prefixes; GIA domains built programmatically from `GIA_DOMAINS.reduce()` |
| `sla.ts` | `BUSINESS_HOURS` (IST, Mon–Sat 09:00–19:00), `SLA_RULES` (8 rules), `SLA_AUTO_TASK_TITLES` |
| `task-constants.ts` | `TASK_PRIORITY`, `TASK_STATUS` (+ pillBg/pillText/remarkBg tokens), `TASK_CATEGORY`, `TASK_REMARK_STATUS_LABELS`, `GROUP_TASK_ACCENT_COLORS`, `GROUP_TASK_ICONS` |
| `task-types.ts` | `TASK_TYPES` (call / whatsapp_message / other), `TASK_TYPE_LABELS` |
| `whatsapp.ts` | `WHATSAPP_CONVERSATIONS_PAGE_SIZE`, `WHATSAPP_MESSAGES_PAGE_SIZE`, message type / status / direction constants, `WHATSAPP_NOTIFICATION_TEMPLATES` |

### Utils (`src/lib/utils/`)

| File | Key Exports |
| ---- | ----------- |
| `assert-never.ts` | `assertNever(x: never): never` — canonical Q-11 exhaustive switch helper |
| `campaigns.ts` | `beautifyCampaignTitle(raw)` — the ONLY campaign-title decorator |
| `chart-tokens.ts` | `getChartTokens()` — MutationObserver-driven Recharts bridge; resolves CSS vars to computed hex (V-12) |
| `date-range.ts` | Date-range presets + IST-aware range helpers for the dashboard/leads date filters |
| `dates.ts` | `formatDate()`, `toUTC()`, `formatRelativeTime()`, `formatDuration()`, `normalizeTimeHHMM()` |
| `export.ts` | **CLIENT-SIDE ONLY.** `buildCSV()`, `buildLeadsCSV()`, `buildXLSXWorkbook()` (async — lazy-imports `xlsx`), `triggerBrowserDownload()`. Never import from server actions/services (§23) |
| `filter-params.ts` | `buildFilterParams()`, `dateFromUrlParam()`, `dateToUrlParam()`, `parseGiaDomainParam()` — shared filter URL helpers |
| `numbers.ts` | `formatCount()`, `formatCompact()`, `formatPercent()`, `formatCurrency()` |
| `performance-roster-display.ts` | Display/formatting helpers for the performance agent-roster table |
| `phone.ts` | `normalizeToE164()` — the ONLY phone normalizer |
| `route-access.ts` | `canAccessRoute(profile, pathname): boolean` — pure util; checks admin/founder bypass → `ALWAYS_ALLOWED_PREFIXES` → `DOMAIN_ROUTE_MAP` prefix match; safe in `'use client'` components |
| `sanitize.ts` | `sanitizeText()` — the ONLY sanitizer |
| `scroll.ts` | `scrollToBottom()`, `lockBodyScroll()` |
| `sla.ts` | `nextBusinessDeadline()`, `isWithinBusinessHours()`, `businessMinutesBetween()` — all IST-aware |
| `task-client-filters.ts` | Client-side filter functions for Tasks page (never server refetch on filter change) |
| `task-complete-auth.ts` | `canToggleTaskComplete()` — auth helper for TaskCompletionCircle |
| `whatsapp-period.ts` | `getWhatsAppPeriodRange()`, `parseWhatsAppPeriodFromSearchParams()` |

### Hooks (`src/hooks/`)

| Hook | localStorage key | Purpose |
| ---- | ---------------- | ------- |
| `useDashboardLayout` | `eia:dashboard:layout:${userId}:v1` | Widget order + size + colSpan per user |
| `useLeadColumnPreferences` | `eia:leads:columns:${userId}:v1` | 11 columns, status+name locked |
| `useNotifications` | — | All notification state + Realtime subscription |
| `useNotificationSound` | — | Plays the notification chime on new inbound notification |
| `useTaskCompletionToggle` | — | Optimistic completion circle toggle |
| `useToast` | — | Thin re-export of toast singleton |
| `useDebounce` | — | `useDebounce<T>(value, delay)` — the ONLY debounce utility; never recreate inline |
| `useDashboardCohortSync` | — | Syncs the dashboard global date-cohort filter across widgets (URL ↔ state) |
| `useCreateTriggerModal` | — | Open/close + draft state for the create-trigger modal flow |

---

## 14. Task System

> → Deep dive: `docs/tasks-page.md`

### Three Categories (discriminated by `task_category`)

| Category | `task_category` | Scope |
| -------- | --------------- | ----- |
| OS Personal | `personal` | Individual todos — one owner |
| OS Group | `group_subtask` | Subtasks under a `task_groups` parent |
| Gia Follow-up | `gia_followup` | System-created, attached to leads |

**All three share one `tasks` table and one `task_remarks` table.**

### Task Tables

- **`tasks`** — status: `to_do | in_progress | in_review | completed | error | cancelled` (old values `pending` and `done` do not exist); priority: `urgent | high | normal`; attachments: JSONB checklist array; tags: `text[]`
- **`task_groups`** — domain-scoped; manager RLS enforced
- **`task_remarks`** — append-only. Replaces `task_messages`. Has `status_change` nullable column (CHECK values **coupled** to `tasks.status` — adding a new status requires a migration on both)
- **`task_audit_log`** — append-only. Logs changes to 6 fields: title, description, status, priority, due_at, assigned_to. `attachments` intentionally excluded (checklist toggles would flood the log)
- **`task_gia_meta`** — one row per Gia follow-up task; `task_id` + `lead_id` + `call_outcome`

### Key RPCs

| RPC | Migration | What it does |
| --- | --------- | ------------ |
| `get_personal_tasks` | 0025, 0026 | DB-level sort PostgREST cannot express; keyset cursor pagination |
| `get_group_task_summaries` | 0020 | One round trip for group list + subtask counts + assignee ids; domain scoping self-enforced |
| `add_task_remark_with_status` | 0035, 0051 | Atomic remark insert + optional status update; SECURITY DEFINER; view = post auth gate |
| `get_gia_tasks` | 0055, 0056 | Gia tab on `/tasks`; role-scoped; returns task columns + joined lead identity |
| `create_lead_gia_task` | 0054 | Atomic `tasks` + `task_gia_meta` two-INSERT; prevents orphaned tasks |

### Task Critical Invariants

- `task_remarks` is append-only — the **ONLY** mutation allowed is the suppression UPDATE by admin/founder
- `task_remarks.status_change` CHECK is coupled to `tasks.status` — a new status requires a migration on **both**
- `task_audit_log` trigger excludes `attachments` — never add it (would flood with checklist toggles)
- Trigger.dev idempotency key `task-reminder-${taskId}` prevents double-scheduling; no `reminder_run_id` column needed
- `PersonalTasksTab` is legacy/unmounted — the active personal view is `MyTasksCalendarView`
- `addTaskRemarkAction` gates on a user-scoped `tasks` SELECT first, then calls RPC via `adminClient` (auth.uid() is NULL inside SECURITY DEFINER)

---

## 15. WhatsApp System

> → Deep dive: `docs/whatsapp-page.md`

**Provider:** Gupshup v1 (BSP). Auth: `x-gupshup-secret` header. Inbound: dual-format parser (Gupshup v2 active; Meta v3 dormant). Outbound: `sendTextMessage()` in `whatsapp-api.ts`.

### WhatsApp Tables

| Table | Purpose |
| ----- | ------- |
| `whatsapp_conversations` | One row per lead/phone; `wa_id` (E.164 without +) and `lead_id` both UNIQUE; bot columns (planned, not built); Realtime enabled |
| `whatsapp_messages` | Append-only with delivery-receipt exception; `wa_message_id` partial unique index (WHERE NOT NULL — allows NULL rows for optimistic pre-confirm inserts); Realtime enabled |
| `whatsapp_conversation_reads` | Per-user read position; UNIQUE(conversation_id, agent_id) |
| `whatsapp_notification_logs` | Every template send attempt; last-4 phone digits only — **full numbers never stored** |

### Service File Boundaries

| File | Client | Rule |
| ---- | ------ | ---- |
| `whatsapp-service.ts` | Session (RLS handles access) | UI queries only |
| `whatsapp-api.ts` | HTTP — Gupshup | SERVER ONLY; fire-and-forget; never import in client components |
| `whatsapp-ingestion.ts` | adminClient | SERVER ONLY; inbound pipeline; `processStatusUpdate` is the ONLY UPDATE on `whatsapp_messages` |

### Notification Templates

| Event | Recipient | Template ID | Params |
| ----- | --------- | ----------- | ------ |
| Agent lead assignment | Agent | `3bcebeb0` | 3: leadName, leadPhone, domain |
| Founder lead notification | Founder | `d5828042` | — |
| SLA breach (agent) | Agent | `54d5dd55` | 4: leadName, leadPhone, status, lastUpdatedAt |
| SLA breach (manager) | Manager | `682fd320` | 5: + agentName |

### WhatsApp Critical Invariants

- Webhook route always returns 200 — non-200 causes Meta retries
- `/api/webhooks/*` excluded from Next.js proxy session refresh
- `whatsapp_messages` delivery receipt update uses adminClient only (A-11 narrow exception)
- `wa_message_id` is a **partial** unique index (WHERE NOT NULL) — not a column UNIQUE constraint
- `can_access_wa_conversation()` SECURITY DEFINER helper is coupled to `leads` RLS — if leads RLS changes, review this function
- Vercel `after()` wraps async processing — prevents function termination before DB writes complete

---

## 16. SLA Engine

> Business hours: IST (Asia/Kolkata), Mon–Sat, 09:00–19:00. Constants in `src/lib/constants/sla.ts`.

### 8 Rules

| Code | Status Trigger | Threshold | Recipient | Auto-task? |
| ---- | -------------- | --------- | --------- | ---------- |
| SLA-01A | `new` | 15 min | Agent | Yes (urgent) |
| SLA-01B | `new` | 30 min | Manager | No |
| SLA-02A | `touched` | 24h | Agent | Yes (high) |
| SLA-02B | `touched` | 36h | Manager | No |
| SLA-03A | `in_discussion` | 24h | Agent | Yes (high) |
| SLA-03B | `in_discussion` | 36h | Manager | No |
| SLA-04A | `nurturing` | 4 biz-days | Agent | Yes (high) |
| SLA-04B | `nurturing` | 4 biz-days | Manager | No |

### Rules

- **Idempotency key:** `lead-sla-${leadId}-${ruleCode}` — Trigger.dev deduplicates DELAYED runs. Double-scheduling is structurally impossible.
- **Terminal statuses** (`won`, `lost`, `junk`) → cancel all SLA timers, schedule none.
- **Stale-fire guard:** Job re-reads lead status on execution; exits with `outcome: 'stale_fire'` if status no longer matches trigger.
- **Trigger.dev files:** `src/trigger/lead-sla.ts` — `fireLeadSlaTask`, `scheduleLeadSlasTask`, `cancelLeadSlasByLeadTask`

---

## 17. Codebase Rules

**Non-negotiable. Changing any rule requires a Decision Log entry.**

### A — Authorization & Architecture

| Code | Rule |
| ---- | ---- |
| A-01 | Authorization reads only from `public.profiles`. JWT claims are never trusted. |
| A-02 | Client components mutate data via Server Actions only. No direct DB calls from client-side code. |
| A-03 | All DB queries go through service functions in `lib/services/`. No raw Supabase in components or actions. |
| A-04 | Feature folders own their code. Cross-feature data flows through `lib/` only. Never import from another feature folder. |
| A-05 | One Supabase client per context. Instantiated only in `lib/supabase/client.ts`, `server.ts`, `admin.ts`, and `middleware.ts`. Never elsewhere. |
| A-06 | Components in `src/components/ui/` are display-only. Zero business logic. Zero DB calls. |
| A-08 | Every new table has RLS enabled in its migration. No exceptions. |
| A-09 | Two-layer security always: RLS at DB level AND application check in the Server Action. Never rely on one layer alone. |
| A-10 | All `SECURITY DEFINER` functions must have `SET search_path = public`. |
| A-11 | Async work over 3 seconds or needing retry → Trigger.dev. Never in route handlers. |
| A-14 | Never edit a migration that has already run in production. Write a new one. |

### S — Security & Sanitization

| Code | Rule |
| ---- | ---- |
| S-01 | Every Server Action Zod-validates first, before any DB call. No exceptions. |
| S-02 | `sanitizeText()` on every user text before DB write. `normalizeToE164()` on every phone field before DB write. |
| S-03 | All `SECURITY DEFINER` functions must have `SET search_path = public`. |
| S-06 | Never trust client-supplied IDs without verifying ownership at the application layer. |

### V — Visual

| Code | Rule |
| ---- | ---- |
| V-01 | Every colour is a CSS variable from `src/styles/design-tokens.css`. No hex values in components. Ever. |
| V-02 | `--theme-accent-fg` on accent fills (buttons, badges). Never `--theme-text-inverse`. They are different tokens. |
| V-05 | z-index values only from the `--z-*` token scale. No arithmetic on tokens. No `z-[999]`. |
| V-08 | Never show a skeleton for less than 150ms. |
| V-09 | Empty states always use Playfair italic heading. Never "No data available." |
| V-10 | Form field labels use `label-micro` style (`--text-2xs`, widest tracking, tertiary colour). |

### Q — Quality

| Code | Rule |
| ---- | ---- |
| Q-03 | Server Actions return `{ data, error }`. Never throw. Never void. Components handle both branches explicitly. |
| Q-05 | Log every new package addition in `docs/changelog.md` with rationale. |
| Q-09 | Cast `bigint` COUNT fields to `Number()` in the service/action layer before use. |
| Q-11 | Every switch over a union type is exhaustive — use `assertNever()` from `src/lib/utils/assert-never.ts`. No `default` branch. |
| Q-12 | Search the codebase for an existing equivalent before creating any component, hook, util, or service function. Search by behaviour, not filename. |
| Q-17 | Domain display names come from `DOMAIN_LABELS` in `domains.ts` only. Never hardcode inline. |

### D — Data

| Code | Rule |
| ---- | ---- |
| D-01 | Log and activity tables (`profile_audit_log`, `lead_activities`, `lead_notes`, `task_remarks`, `task_audit_log`) are append-only. No UPDATE or DELETE. The only permitted exception: suppression columns on `task_remarks` — admin/founder only via `suppressTaskRemarkAction`. |
| D-02 | No magic strings. Domain names, role names, and status values live in `lib/constants/` as typed enums. Never hardcoded inline. |
| D-03 | Server Actions return `{ data, error }`. Never throw. Never void. |
| D-04 | `@dnd-kit` is the canonical drag library. Use it everywhere drag-to-reorder is needed. Never add an alternative. |

### Migration Rules

- Never edit a migration that has already run in production (A-14). Write a new one.
- Every new table: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`.
- Reuse `update_updated_at()` — never recreate it. Defined in migration 0001.
- All SECURITY DEFINER RPCs: domain scoping enforced inside the RPC body, never via caller-supplied parameter.

---

## 18. The Never-Do List

```text
NEVER  hardcode a colour value in a component
NEVER  use text-gray-* or bg-gray-* or bg-white — use tokens
NEVER  use z-index values not in the --z-* scale
NEVER  animate width, height, padding, or margin — only transform and opacity
NEVER  put backdrop-filter/blur on cards, dropdowns, or modals
       (sanctioned only on: TopBar, mobile sidebar overlay, command palette)
NEVER  use font-bold (700) — --weight-semibold (600) is the maximum
NEVER  create a component that both fetches data and renders UI
NEVER  duplicate a component that already exists — extend it instead
NEVER  let a Zod default error message reach the user interface
NEVER  clear a form field on validation error
NEVER  use "No data available" as empty state copy
NEVER  use more than 3 colours in a single chart
NEVER  show a skeleton for less than 150ms
NEVER  add backdrop-blur outside the three sanctioned surfaces
NEVER  use a coloured border on one edge of a card/row as a category indicator
       — use pills, dots, icons, or semantic badges instead
NEVER  add a package or meaningful change without a docs/changelog.md entry
NEVER  import a value symbol from lib/services/ in a 'use client' component
       — it pulls next/headers into the client bundle and hard-errors
       — use a Server Action in lib/actions/ instead
NEVER  call startTransition during the render phase — use useEffect
NEVER  use ComboboxDropdown — it was deleted 2026-06-01; use FilterDropdown
NEVER  use getAdCreativeForCampaign (singular) — it was renamed to
       getAdCreativesForCampaign which returns AdCreative[] (array)
NEVER  assume one video per campaign_key — UNIQUE dropped in migration 0058
NEVER  put Supabase Realtime channels without a useId() mount nonce
       — Strict Mode double-mounts will collide on bare channel names
NEVER  use SVG fill/stroke directly with CSS variables in Recharts
       — use useChartTokens() (MutationObserver-driven, resolves via getComputedStyle)
NEVER  fire an outward network send (WhatsApp/Gupshup, external fetch) as void fn().catch()
       in a route or action — use after() from next/server with an awaited send inside (A-16)
NEVER  void redis.del().catch() before revalidatePath — await it in try/catch first;
       delete BOTH lead cache keys (slug + id) when slug is non-null (P-08, §22)
NEVER  recreate src/middleware.ts — the proxy is src/proxy.ts (Next.js 16)
NEVER  add React Query / @tanstack or assume Sentry exists — neither is a dependency
NEVER  use a coloured one-edge border as a category/status indicator
       — use pills, dots, icons, or semantic badges instead
```

---

## 19. Decision Log

Every architectural decision that deviates from or extends the rules above.

| Date | Decision | Chosen | Why |
| ---- | -------- | ------ | --- |
| 2026-05-28 | task_remarks suppression: column restriction is application-layer only. PostgreSQL RLS UPDATE policies cannot restrict which columns a permitted user may write. | Application-layer enforcement only in `suppressTaskRemarkAction`. | Trigger option adds complexity with no user-visible benefit — admin/founder are trusted actors. |
| 2026-05-28 | `log_task_changes()` fallback: when `auth.uid()` is NULL (service-role context), attribute the change to `NEW.assigned_to`. | Accept the imperfection; no new column on `tasks`. | Service-role writes mutating `assigned_to` are rare. Adding a `changed_by` parameter to every task mutation widens every call site. |
| 2026-05-28 | `task_audit_log` uses `ON DELETE CASCADE` on `task_id` FK. Deleting a task removes its audit trail. | `ON DELETE CASCADE`. | Task deletion is admin/founder-only. Retaining orphaned audit rows adds schema complexity with no compliance benefit. |
| 2026-05-29 | `task_messages` renamed to `task_remarks` (migration 0022). Pre-production — zero data to preserve. | DROP + CREATE. | Rename-in-place has higher inconsistency risk. The name `remarks` better reflects what the records represent. |
| 2026-05-29 | `addLeadCallNote` and `updateLeadStatus` collapsed to single-transaction RPCs (migrations 0030–0031). | SECURITY DEFINER RPCs. | Sequential awaits leave partial state visible between steps. SLA side-effects remain fire-and-forget (Trigger.dev cannot roll back). |
| 2026-05-29 | Dashboard summary collapsed to a single cached RSC fetch (perf-01). `unstable_cache` not viable — `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures. | React `cache()` in the service function. | Zero POST calls on initial dashboard load. `ManagerLeadVolumeWidget` still fires a server action on period toggle — volume intentionally excluded from the RPC. |
| 2026-05-29 | `get_group_task_summaries` SECURITY DEFINER: domain scoping enforced inside RPC body, not via caller-supplied parameter. | Self-enforcing WHERE clause using `get_user_role()` / `get_user_domain()`. | SECURITY DEFINER bypasses RLS entirely. Caller-supplied scope parameters on SECURITY DEFINER functions are a security hole. **All future SECURITY DEFINER RPCs follow this pattern.** |
| 2026-05-30 | WhatsApp provider: Gupshup v1 BSP (not Meta Cloud API direct). Initial implementation used Meta Cloud API. Reverted. | Gupshup v1. | Gupshup handles WABA compliance, template registration, and delivery receipts. Meta direct requires WABA setup we do not control. |
| 2026-05-30 | Lead slugs (migrations 0045–0046): collision resolved by appending `-2`, `-3`, etc. | Numeric suffix. Backfill ordered `created_at ASC` so earliest lead wins the undecorated slug. | Numeric suffixes are human-readable and URL-safe. UUID suffixes defeat the readability purpose of slugs. |
| 2026-05-30 | `app_domain` enum cast rule codified. Any RLS policy comparing `get_user_domain()` to a `text` column must cast `get_user_domain()::text`. | Explicit `::text` cast at every comparison site. | PostgreSQL does not implicitly cast enum to text. Root cause of 42883 in migrations 0042–0044. |
| 2026-05-31 | `add_task_remark_with_status` auth: view = post. Migration 0051 removed the broken inline `auth.uid()` gate (NULL under service-role). | Action-layer SELECT check + RPC via `adminClient`. | `auth.uid()` is NULL when the action uses `adminClient`; RLS on the pre-flight SELECT is the real gate. |
| 2026-05-31 | ~~Deals page without a `deals` table.~~ **REVERSED 2026-06-05 — see entry below.** | ~~`/deals` lists won `leads` rows; aggregates via `get_deals_summary` RPC over `leads`.~~ | Reversed: one lead has one terminal `won` and cannot hold repeat/renewal deals; walk-in sales have no lead lifecycle at all. |
| 2026-06-05 | `public.deals` promoted to a first-class table (reverses 2026-05-31 entry above). | `public.deals` is the source of truth for all closed deals. `lead_id` nullable — walk-ins have no lead. `won_at` immutable after insert. `client_id` column reserved; FK deferred to the clients module. `/deals` gains a New Deal write path (`createWalkInDeal`). `recordDeal` now inserts a `deals` row before delegating `updateLeadStatus('won')`. `get_deals_summary` RPC rewritten over `public.deals` (migration 0074). `DealWithAssignee` replaced by `DealWithRelations` (includes nullable `lead.slug`). | One lead has exactly one terminal `won`; it cannot hold repeat/renewal deals. Walk-in sales (shop purchases) have no lead lifecycle. Both are now real requirements. The clients table will own these deals next — `client_id` is the hook. |
| 2026-05-31 | Lead Gia tasks via `create_lead_gia_task` RPC — atomic two-INSERT. | Two-INSERT transaction (`tasks` + `task_gia_meta`). | Orphan `tasks` rows without `task_gia_meta` are invisible on all Gia surfaces. |
| 2026-06-01 | `task_type` narrowed to call / whatsapp_message / other. Migration 0057 backfills legacy values. | Three options matching agent workflow. | Legacy types `email` and `general_follow_up` were unused in practice. |
| 2026-06-01 | Lead source on `utm_source`. `form_data.manual_source` retired. | `leads.utm_source` is the canonical source field. | Source is attribution data, not form payload — belongs with UTM fields. |
| 2026-06-01 | Multiple ad creatives per campaign. Migration 0058 drops UNIQUE on `ad_creatives.campaign_key`. | One row per video; `getAdCreativesForCampaign` returns `AdCreative[]` newest-first. | Campaigns run multiple ad variants. |
| 2026-06-01 | `ComboboxDropdown` removed. | All searchable single-select surfaces use `FilterDropdown`. | Duplicate primitive. One dropdown contract reduces maintenance. |
| 2026-06-03 | Domain-scoped route authorization. Non-Gia domains had no route restriction — agents could navigate to `/leads` despite having no data there. | `canAccessRoute(profile, pathname)` pure util + `DOMAIN_ROUTE_MAP` constant + server-side layout guard (`redirect('/dashboard')`) + Sidebar nav filter. Admin/founder bypass all domain checks. `/dashboard` and `/profile` are in `ALWAYS_ALLOWED_PREFIXES` — redirect loop impossible. Two independent gates: layout guard redirects before the page renders; Sidebar never renders the link. | Defense-in-depth: neither gate trusts the other. Page-level privilege checks (`isPrivileged`) remain unchanged — `canAccessRoute` is additive, not a replacement. |
| 2026-06-03 | Attribution refactor (migration 0065): 7 flat ad columns → `source`, `medium`, `utm_campaign` + `attribution jsonb`. `utm_source` renamed `source`; `utm_medium` renamed `medium`; `platform`, `campaign_id`, `ad_name`, `utm_content` folded into `attribution` JSONB. `source` is indexed and queryable (`WHERE source = 'whatsapp'`); `attribution` is the unindexed platform-specific extras bag. `createLeadFromWhatsApp` sets both `source: 'whatsapp'` and `attribution: { platform: 'whatsapp' }`. `updateLeadSource` replaces `updateLeadUtmSource`. URL-param `source` validated against `LEAD_SOURCES` at the route handler before reaching ingestion. | Migration 0065. | Flat columns per ad platform don't scale. JSONB bag absorbs new platforms without schema migrations while `source` stays flat for analytics. |
| 2026-06-03 | `leads.city` promoted from `personal_details JSONB` to a dedicated `text` column (migration 0066). Backfilled on existing rows. `city` key removed from JSONB. `PersonalDetailsCard` fires `updateLeadCity` in parallel with `updatePersonalDetails` on save. `LeadInfoCard` displays city as an `InfoRow` with `MapPin` icon. Webhook ingestion extracts `city` from `form_data` into the column, removing it from the JSONB bag to avoid duplication. | Migration 0066 + `updateLeadCity` action + `UpdateLeadCitySchema`. | A top-level column is indexable, directly queryable, and displays without JSONB extraction. `personal_details` is a bag for enrichment that doesn't need its own index — `city` clearly does not belong there long-term. |
| 2026-06-04 | Domain Health metrics (migrations 0066b/0068/0076). Per-domain founder/admin view of lead volume, conversion, calls, and revenue. Revenue source moved to `public.deals` (0076). | Dedicated domain-health RPC + `getDomainHealth` in `performance-service.ts` + `domain-colors.ts` / `domain-icons.ts`. | Founders needed a cross-domain health snapshot; revenue must read the deals table (single source of truth), not `leads.deal_amount`. |
| 2026-06-05 | Redis cache-aside layer adopted (Upstash). | Read-through caching on leads, dashboard, performance, tasks, ad-creatives. `src/lib/redis.ts` single client; `redis-keys.ts` sole key/TTL source; version-counter invalidation for lead lists; dual-key invalidation for lead rows; P-08 `await del` before revalidate. | Agents live in the app 8–12h/day; repeated list/dossier/dashboard reads were hitting Postgres every time. Cache-aside cuts read latency while Postgres stays the source of truth (cold cache always correct). |
| 2026-06-06 | Export system (CSV / XLSX) via SheetJS (`xlsx`). | `src/lib/utils/export.ts` (client-only) + `export-columns.ts`; `buildXLSXWorkbook` lazy-imports `xlsx` to keep it out of the initial bundle. | Managers/founders need to pull leads/activity/notes into spreadsheets. Client-side keeps PII off any export endpoint and offloads work to the browser. |
| 2026-06-06 | `lead_health` precompute built (migrations 0077–0079), then the DB column reverted (0082). | Stored column + hourly refresh job abandoned. | A trigger-refreshed health column added write-path complexity and staleness for a value cheaply derivable at read time. |
| 2026-06-08 | **`lead_health` feature removed entirely** (migration 0083 + code/doc sweep). | Deleted: `lead_health` column remnant in `get_leads_status_counts` (0083), `computeLeadHealth()` util, `refresh-lead-health.ts` trigger, `LeadHealthStrip` component, `getAgentLeadHealthBreakdown` service + `getAgentLeadHealthAction`, the performance health strip, and the `health` leads filter (UI + URL param + schema + service + types). | The reverted column left dead UI/filter/RPC code querying a non-existent column. The feature was dropped from the product; the half-removed state was a correctness hazard. **Domain Health is a separate feature and was untouched.** |

---

## 20. How to Fix Anything

1. **Read the relevant CLAUDE.md and spec files before writing a single line.** Never assume from memory.
2. **Search the codebase for the existing pattern — extend it, do not duplicate it.** Search by behaviour, not filename (Rule Q-12).
3. **New migrations only — never edit an existing one (Rule A-14).** New file. Always.
4. **After every fix: `pnpm tsc --noEmit` must pass with zero errors.**
5. **Update the relevant CLAUDE.md** with what changed and any new patterns introduced.
6. **Add one line to `docs/changelog.md`** — what shipped, date, phase. The changelog is the single source of truth. Never `The_Changelog.md` (deleted).
7. **If a new package was added, log it in the changelog** with the reason (Rule Q-05).

**The five authority files to read first, every session:**

```text
1. /CLAUDE.md              ← root rules, file locations, never-do list
2. /docs/The_Rules.md      ← all non-negotiable rules (A-· S-· P-· V-· Q-· D-·)
3. /docs/The_Blueprint.md  ← architecture, stack, RBAC model
4. /docs/master.md         ← THIS FILE — complete operational picture
5. /supabase/migrations/CLAUDE.md ← migration rules and RLS checklist
```

---

## 21. Design System Quick Reference

> → Full reference: `docs/design-system.md`

### The Surface Contract

Every text colour decision flows from this table. **Memorise it. Never deviate.**

| Surface | Text token |
| ------- | ---------- |
| `--theme-paper` (content area) | `--theme-text-primary` |
| `--theme-paper-subtle` (inset areas) | `--theme-text-primary` |
| `--theme-canvas` (dark shell) | `--theme-canvas-text` |
| `--theme-accent` fills (buttons, badges) | `--theme-accent-fg` |
| `--color-success/danger/warning/info` fills | matching `*-text` token |
| Secondary labels on paper | `--theme-text-secondary` |
| Placeholders, timestamps, muted | `--theme-text-tertiary` |
| Sidebar nav inactive | `--theme-sidebar-text` |
| Sidebar nav active | `--theme-sidebar-active` |

**Never use `--theme-text-inverse` on accent fills. Use `--theme-accent-fg`.** They are different tokens for different surfaces.

### Five Themes

| Theme | `data-theme` | Canvas | Accent | Character |
| ----- | ------------ | ------ | ------ | --------- |
| Earth (default) | `earth` | `#0d0c0a` | `#d4af37` gold | Warm, grounded, espresso + olive grain |
| Air | `air` | `#07090f` | `#7b9fc4` steel blue | Cool, precise, blue-tinted paper |
| Water | `water` | `#060d0f` | `#2a9d8f` teal | Calm, teal undertone paper |
| Fire | `fire` | `#0c0905` | `#e05c1a` lava orange | Warm, amber paper, high energy |
| Cosmos | `cosmos` | `#07060f` | `#8b6fd4` nebula violet | Deep, violet-tinted paper |

**Theme switches via `data-theme` on `<html>`. Zero-flash: inline `<script>` in `(dashboard)/layout.tsx` reads `profile.theme` and sets the attribute before paint.**

### Standard Page Layout

Every list page follows this exact structure:

```jsx
<main className="flex-1 p-8">
  {/* Row 1 — Page header */}
  <div className="flex items-center justify-between gap-4 mb-6">
    <h1 className="type-page-title m-0">
      Title<span className="page-title-dot">.</span>
    </h1>
    <ActionButton />
  </div>

  {/* Row 2 — Filter bar */}
  <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border)
                  bg-(--theme-paper) shadow-(--shadow-1)">
    <FiltersComponent />
  </div>

  {/* Row 3 — Content */}
  <Suspense fallback={<ContentSkeleton />}>
    <ContentAsync />
  </Suspense>
</main>
```

### Page Title Dot

Every primary navigation `<h1>` ends with a blinking accent period:

```jsx
<h1 className="type-page-title">
  Leads<span className="page-title-dot">.</span>
</h1>
```

Keyframe: `eia-page-dot-blink` — 2.4s ease-in-out. **Detail pages with back links are exempt.**

### Motion Constants

Import from `src/lib/constants/motion.ts`. **Never re-declare inline.**

| Constant | Value | When |
| -------- | ----- | ---- |
| `EASE_OUT_EXPO` | `[0.16, 1, 0.3, 1]` | Entrances — fast in, settles with authority |
| `EASE_IN_EXPO` | `[0.7, 0, 0.84, 0]` | Exits — disappears with intent |
| `EASE_SPRING` | `[0.22, 1, 0.36, 1]` | Interactive responses — tap, toggle, click |
| `SPRING_CONFIG` | `{type:'spring', stiffness:400, damping:30}` | Tab indicators |
| `ENTER_DURATION` | `400ms` | Arrivals |
| `EXIT_DURATION` | `250ms` | Departures (always faster than entering) |
| `MODAL_VARIANTS` | `{initial:{opacity:0,y:10,scale:0.98},…}` | Modal enter/exit |
| `DROPDOWN_VARIANTS` | `{initial:{opacity:0,y:-4},…}` | Dropdown/popover |

**Only transform and opacity are animated. Never width, height, padding, or margin.**

### Z-Index Scale

| Token | Value | Usage |
| ----- | ----- | ----- |
| `--z-base` | 0 | Document flow |
| `--z-raised` | 10 | Cards on hover, sticky headers |
| `--z-dropdown` | 20 | Dropdowns, popovers, tooltips |
| `--z-sticky` | 30 | TopBar, sticky section headers |
| `--z-sidebar` | 40 | Sidebar |
| `--z-overlay` | 50 | **Standalone confirm dialog backdrops** (sits below `--z-modal`) |
| `--z-modal` | 60 | Modals, drawers, confirm dialog panels |
| `--z-modal-overlay` | 61 | Backdrop of a **nested** modal stacked above an existing `--z-modal` |
| `--z-modal-nested` | 62 | Nested modal panel (e.g. `AssigneePickerModal` above `SubTaskModal`) |
| `--z-toast` | 70 | Toasts, notifications |
| `--z-cursor` | 80 | Lia floating cursor, drag handles |

**Confirm dialog stacking rule:** standalone confirm dialogs (not nested inside another modal) use `--z-overlay` (50) for the backdrop and `--z-modal` (60) for the panel. This ensures the backdrop is always below the panel. `--z-modal-overlay` (61) is reserved for the backdrop of a dialog that itself sits above an existing modal.

### Realtime Channel Pattern

Always include a mount-scoped nonce in channel names:

```typescript
const mountId = useId(); // React 18 unique ID per mount
const channel = `table-name-${recordId}-${mountId}`;
```

Strict Mode double-mounts **will collide** on bare channel names. Never use bare names.

### Recharts / SVG Fill

CSS variables do not resolve inside SVG attributes in all browsers. Use the MutationObserver bridge:

```typescript
// Never: fill={var(--theme-accent)}
// Always:
const tokens = useChartTokens(); // re-resolves on data-theme change
// tokens.accent, tokens.accentMuted, tokens.success, etc.
```

### Empty States

#### Copy rules

Always Playfair italic heading. Never "No data available."

```jsx
<div className="flex flex-col items-center py-12 text-center">
  <Icon className="w-12 h-12 mb-4 opacity-60" style={{color:'var(--theme-text-tertiary)'}} strokeWidth={1.5} />
  <p style={{fontFamily:'var(--font-serif)', fontStyle:'italic', color:'var(--theme-text-secondary)'}}>
    Nothing here yet.
  </p>
</div>
```

### Backdrop-Filter — Three Sanctioned Surfaces Only

1. TopBar (paper bleeds through on scroll)
2. Mobile sidebar overlay
3. Command palette

**Never on cards, dropdowns, or modals.**

---

## 22. Redis Caching Layer

> **Provider:** Upstash Redis (`@upstash/redis`). **Client:** `src/lib/redis.ts` exports a single `redis = Redis.fromEnv()` — the only instance. **Key + TTL schema:** `src/lib/constants/redis-keys.ts` is the **only** source of key strings and TTL values. No inline key strings, no magic TTL numbers anywhere else. Per-service TTL detail lives in `src/lib/CLAUDE.md`.

### The pattern — cache-aside, read-through

Read services check Redis first; on a miss they query Postgres, write the result back with a TTL, and return it. The cache is **never** the source of truth — Postgres is. A cold cache is always correct, just slower.

### What is cached (by namespace)

| Namespace | Service | TTL | Invalidation |
| --------- | ------- | --- | ------------ |
| `lead:list:*` | `leads-service.getLeadsByRole` | 30s | **Version counter** — `INCR lead:list:v:{role}:{domain}` on any lead mutation atomically voids all list pages (no SCAN). Key includes `role + callerDomain + userId + filterHash + v{N}` |
| `lead:row:id` / `lead:row:slug` | `getLeadById` / `getLeadBySlug` | 120s | **Explicit `del` of BOTH keys** on every lead-row mutation when slug is non-null (dual-key invariant) |
| `lead:notes` / `lead:activities` | `getLeadNotesFull` / `getLeadActivitiesFull` | 120s | Explicit `del` on note/activity write |
| `lead:filter-options` | `getLeadFilterOptions` | 300s | TTL-only |
| `dashboard:*` | `dashboard-service` (status, volume, multi, campaigns, agent-tasks) | 30–120s | TTL-only; keys are date-range-namespaced (`from:to`) |
| `perf:*` | `performance-service` (all 6 fns) | 30–120s | TTL-only; `domain` excluded from `perf:agent-detail` (auth-only) |
| `task:*` | `tasks-service` (gia, group-list, personal page-1, subtasks, remarks) | 30–120s | Explicit `del` on task writes; `task:group-list` is user-scoped (flat-visibility 0058b) |
| `campaign:ad-creative` | `ad-creatives-service` | 300s | Explicit `del` on upsert/delete |

### Non-negotiable rules

- **P-08 — `del` before revalidate:** every `redis.del` in a Server Action is `await`-ed inside a `try/catch` that logs a `[module-action]` warning, **before** `revalidatePath`/`revalidateTag`. A `void redis.del().catch()` races the cache revalidation and can evict a fresh entry (see Decision Log + `CLAUDE.md` Pattern Notes).
- **Lead dual-key invariant:** lead rows are cached under `leadRowSlug(slug)` (primary, hit on every dossier load) **and** `leadRowId(leadId)` (UUID fallback). Any action mutating the lead row deletes **both** when slug is non-null. Deleting only `leadRowId` is a silent no-op on normal traffic.
- **Domain in every scoped key (Q-16 sibling):** a manager in `concierge` must never receive a cached response built for `finance`. List keys use the **session-verified `callerDomain`**, not `filters.domain`.
- **Redis failure is non-fatal:** every Redis call is wrapped so a cache outage degrades to direct Postgres reads, never an error to the user.
- **Reference implementations:** `getLeadsByRole` (version-counter list cache), `updateLeadStatus` / `addLeadCallNote` (dual-key `del` + version `INCR`), `buildLeadListKey` (deterministic key construction).

---

## 23. Export System (CSV / XLSX)

> **All export code is client-side only.** `src/lib/utils/export.ts` and `src/lib/constants/export-columns.ts` must **never** be imported from a server action or service — they run in the browser and trigger a file download from the user's machine.

### Building blocks

| Export | Function (`src/lib/utils/export.ts`) | Format |
| ------ | ------------------------------------ | ------ |
| Generic CSV | `buildCSV(rows, headers)` | string |
| Leads CSV | `buildLeadsCSV(leads)` | string (uses `LEAD_EXPORT_HEADERS`) |
| XLSX workbook | `buildXLSXWorkbook(...)` — **async**, lazy-imports `xlsx` so SheetJS isn't in the initial bundle | Blob |
| Download trigger | `triggerBrowserDownload(content, filename, mime)` | — |

### Column maps (`src/lib/constants/export-columns.ts`)

`LEAD_EXPORT_HEADERS`, `ACTIVITY_EXPORT_HEADERS`, `NOTE_EXPORT_HEADERS` — the single source of export column order/labels. Add or reorder columns here, never inline at the call site.

### Rules

- Never import `export.ts` server-side (it has no `'use server'` and assumes browser APIs for the download).
- `buildXLSXWorkbook` is `async` because `xlsx` is dynamically imported — `await` it.
- Export respects the user's current filter/scope: export what the table currently shows, not the whole table.

---

*Eia Master Reference — Indulge Global · Last updated: 2026-06-08*
*Sources: The_Blueprint.md · The_Profile.md · context.md · changelog.md · CLAUDE.md (root + lib + app) · The_Rules.md · all page-doc audits + live codebase verification*
