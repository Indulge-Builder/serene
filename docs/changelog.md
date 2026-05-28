# Eia — Changelog

All notable changes to the Eia platform are recorded here in reverse chronological order.
This is the **single source of truth** for all development changes.
Every meaningful change — feature, fix, refactor, migration, new package — must be logged here before or alongside the code that implements it.
Format: `[date] — [area] — [what changed]`

---

## 2026-05-28 — Gia — Won action restored on lead dossier (In Discussion)

`StatusActionPanel` — Won button + confirm modal when status is `in_discussion`; calls existing `updateLeadStatus('won')`. Restores spec behaviour removed during the Level Up refactor.

---

## 2026-05-28 — Gia — Leads table Assigned To column shows agent name

`getLeadsByRole` now joins `profiles!leads_assigned_to_fkey(full_name)` in the same query; `LeadWithAssignee` type added. `LeadsTable` Assigned To cell renders `assignee.full_name` instead of the raw UUID.

---

## 2026-05-28 — Layout — Sidebar logo: remove domain module label

Removed the italic module name (Gia, Hia, Sia, etc.) below the sidebar logo. Deleted unused `DOMAIN_MODULE_NAMES` from `src/lib/constants/domains.ts`.

---

## 2026-05-28 — Gia — Fix getNextLeadTask broken filter (Phase 6)

Inverted join direction in `getNextLeadTask` — now starts from `tasks` with `!inner` on `task_gia_meta` to filter by `lead_id`. Previous version started from `task_gia_meta` and used dot-notation (`.eq('tasks.status', ...)`, `.order('tasks.due_at', ...)`) which PostgREST / Supabase JS client silently drops, causing the status filter and ordering to be no-ops and `.limit(1)` to return an arbitrary row. Native column filters (`status`, `due_at`) are now applied directly on the root `tasks` table. Return type `Task | null` and `LeadDossierTasksAsync` unchanged.

---

## 2026-05-28 — Gia — Fix N+1 queries on lead dossier (Phase 6)

Repaired `Relationships` arrays in `database.ts` for `lead_notes`, `lead_activities`, `tasks`, and `task_gia_meta` — all were `[]` despite FK constraints existing in Postgres. Collapsed `getLeadNotesFull`, `getLeadActivitiesFull`, and `getNextLeadTask` from 5 sequential round trips to 3 parallel single-query joins using inline FK disambiguators. `getProfileNameMap` is no longer called from any lead service function (marked for future removal). Updated `LeadNoteWithAuthor` (`author.full_name`) and `LeadActivityWithActor` (`actor?.full_name`) types and all consumers (`LeadNotesSection`, `LeadActivityLog`). `pnpm tsc --noEmit` passes with zero errors.

---

## 2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

---

## 2026-05-28 — Gia — Leads page header: serif title + status summary pills

2026-05-28 — Gia — Leads page header: serif title + status summary pills (eyebrow removed per product)

---

## 2026-05-28 — Gia — LeadInfoCard contact fields redesign

LeadInfoCard contact fields redesigned — labelled datum row pattern with consistent icon rail, mono phone, micro-label typography; 2026-05-28, Phase 6.

---

## 2026-05-28 — Gia — Leads: server-side search, pagination, phone text index

Leads — server-side search (ilike across name/phone/email), pagination (50/page, URL-param driven), migration 0011 phone text index; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000011_lead_search_index.sql` — `idx_leads_phone_text` on `leads(phone text_pattern_ops) WHERE archived_at IS NULL`; enables ILIKE substring search without sequential scan.
- `src/components/leads/LeadsPagination.tsx` — `'use client'` component; "Showing X–Y of Z leads" count; Prev/Next buttons with `ChevronLeft`/`ChevronRight`; `useTransition` on all navigation; `pointer-events: none` on disabled state (not just `opacity`); rendered only when `totalCount > pageSize`.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters.search: string | null` added.
- `src/lib/services/leads-service.ts` — `getLeadsByRole` return type changed from `Lead[]` to `LeadsResult = { leads, totalCount }`. Count obtained via `{ count: 'exact', head: false }` on the same query builder — one round trip. Search applied as `.or(first_name.ilike.%term%,...,email.ilike.%term%)` after role constraints, before `.range()`. Term trimmed and lowercased in service.
- `src/components/leads/LeadsFilters.tsx` — search input added to filter bar (Section 5.10 spec); 500ms debounce via `useEffect`+`setTimeout`, no library; clear X button; `search` counted in active filter badge; `buildParams` deletes `page` on every change → automatic page-1 reset; `clearAll` clears search local state and URL simultaneously.
- `src/components/leads/LeadsTable.tsx` — all client-side search code removed (`useState`, `useMemo`, `Search` icon, search input, `filtered` variable). Table is now display-only — it renders what the server returned.
- `src/components/leads/LeadsTableAsync.tsx` — destructures `{ leads, totalCount }` from `getLeadsByRole`; renders `LeadsTable` + `LeadsPagination` (conditional on `totalCount > pageSize`); `search` filter included in `hasActiveFilters` check.
- `src/components/leads/LeadsTableSkeleton.tsx` — skeleton rows increased from 5 to 50 (matches `pageSize`); prevents layout height jump between skeleton and real content during pagination navigation.
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` now includes `search: getString('search')`.
- `src/app/(dashboard)/leads/CLAUDE.md` — updated with server-side search spec, `LeadsResult` return shape, pagination render condition, 500ms debounce rule, and page-reset contract.

---

## 2026-05-28 — Gia — Leads filter: Suspense-split architecture + server-side URL-param filters

Leads filter — Suspense-split architecture, server-side URL-param filters (status, outcome, source, campaign, agent, date range), migration 0010 indexes; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000010_lead_filter_indexes.sql` — three partial indexes on `leads`: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` (all `WHERE archived_at IS NULL`). `IF NOT EXISTS` on indexes only — no RLS changes.
- `src/lib/constants/lead-sources.ts` — `LEAD_SOURCES`, `LeadSource`, `LEAD_SOURCE_LABELS` constants. Values: `meta | google | website`. No inline literals in components.
- `src/components/leads/LeadsFilters.tsx` — `'use client'` filter bar. Reads/writes URL params only. Six controls: Status (multi), Outcome (multi), Source (single), Campaign (single, server prop), Agent (single, server prop, absent for `agent` role), Date range. Active filter badge. `useTransition` on all `router.push` calls. Never fetches data.
- `src/components/leads/LeadsTableAsync.tsx` — async server component. Calls `getLeadsByRole` with `LeadFilters`. Renders `<LeadsTable>`. No UI of its own. Direct child of `<Suspense>` in `page.tsx`.
- `src/app/(dashboard)/leads/CLAUDE.md` — documents the three-component split, `LeadFilters` type location, `showAgentFilter` contract, `date_to` end-of-day rule, `getLeadFilterOptions` call location, and `page`/`pageSize` pagination readiness.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters` type added (status, last_call_outcome, agent_id, source, campaign, date_from, date_to, page, pageSize).
- `src/lib/services/leads-service.ts` — `getLeadsByRole` extended to accept `LeadFilters`; builds a single chained Supabase query; `.range()` always applied (never conditional); agent role constraint enforced before `LeadFilters.agent_id`; `date_to` end-of-day transform (`T23:59:59.999Z`) in service, not component. New `getLeadFilterOptions(role, domain)` returns `{ campaigns, agents }` — called once at page level.
- `src/components/leads/LeadsTable.tsx` — accepts `hasActiveFilters` prop; internal `statusFilter` state removed (server-side now); Framer Motion entrance `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}` per Section 11.5 (250ms, 100ms delay, ease-out-expo); empty state updated to "Nothing matches these filters." (Section 8.6).
- `src/components/leads/LeadsTableSkeleton.tsx` — rebuilt to spec: 5 rows (Section 11.3), staggered pulse per Section 11.4 (0/80/160/240/320ms), column widths match spec.
- `src/app/(dashboard)/leads/page.tsx` — restructured as thin orchestrator: fetches `filterOptions` once, parses `searchParams` into `LeadFilters`, renders `<LeadsFilters>` (stable) + `<Suspense><LeadsTableAsync /></Suspense>`.

---

## 2026-05-28 — Gia — LeadInfoCard AttributionStrip

LeadInfoCard: UTM section redesigned as AttributionStrip with accent-tone treatment and campaign repatriated — 2026-05-28, Phase 6

---

## 2026-05-28 — Gia — Leads table column visibility picker + drag-to-reorder

### New packages (Q-05)

- `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` — drag-to-reorder in the column picker. Selected over `react-beautiful-dnd` (unmaintained) and hand-rolled pointer listeners (no accessible keyboard support). `@dnd-kit` is now the **canonical drag library for all of Eia** (see rule Q-07).

### Files added

- `src/lib/constants/lead-columns.ts` — column registry: 11 columns, each with a stable `id` (localStorage key — never rename after shipping), `label`, `defaultVisible`, `locked`. `status` and `name` are locked always-visible.
- `src/hooks/useLeadColumnPreferences.ts` — `useLeadColumnPreferences(userId)` reads/writes `localStorage` at `eia:leads:columns:${userId}:v1`; validates stored ids against registry on load (unrecognised ids silently dropped); locked columns always enforced in `visibleColumns`; hydrates after mount (no SSR mismatch). Returns `{ visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults }`. This hook is the **canonical pattern** for per-user table column preferences across Eia (see rule Q-08).
- `src/components/leads/LeadColumnPicker.tsx` — popover panel (not a modal); `@dnd-kit/sortable` for visible-column drag-to-reorder; locked rows show `Lock` icon and are excluded from the drag context; hidden columns shown below a divider, non-draggable; "Reset to defaults" footer; 200ms `opacity/y` entrance animation matching dropdown spec from design-dna.md §5.09.

### Files modified

- `src/components/leads/LeadsTable.tsx` — accepts `userId` prop; "Columns" ghost button (`Columns` lucide icon, `w-4 h-4`, stroke `1.5`) opens picker before filter controls; table renders only `orderedVisible` columns in stored order via a `LeadCell` switch covering all 11 ids; no Supabase re-query on toggle — purely presentational.
- `src/app/(dashboard)/leads/page.tsx` — passes `profile.id` as `userId` to `LeadsTable`.

### Conventions locked in

- Rule Q-07 added to `The_Rules.md`: `@dnd-kit` is the only drag library permitted in Eia.
- Rule Q-08 added to `The_Rules.md`: column preference hooks always follow the `useLeadColumnPreferences` signature and `eia:[module]:columns:${userId}:v1` key format.

## 2026-05-28 — Gia — Add Lead modal: removed E.164 hint and intent chips; added Source field (WhatsApp, Website, Meta, Google, Referral, YPO, Events) stored in form_data.manual_source

---

## 2026-05-28 — Gia — Add Lead modal: manual lead creation with phone dedup, domain enforcement, and agent assignment

---

## 2026-05-28 — Documentation

README.md created at repo root — project overview, phase status, stack, RBAC, planned modules. 2026-05-28.

---

## 2026-05-27 — Phase 6 complete

### `ui/Modal` primitive + modal refactor

- `src/components/ui/modal.tsx` — chrome-only Modal primitive: backdrop (`fixed inset-0`, `rgba(0,0,0,0.5)`, `backdrop-blur-sm`, `z-[--z-overlay]`), container (`bg var(--theme-paper)`, `radius-lg`, `shadow-3`, `z-[--z-modal]`), header, body slot, footer slot; Framer Motion `AnimatePresence` — enter `{ opacity:0, y:10, scale:0.98 }→{ opacity:1, y:0, scale:1 }` at 350ms `ease-out-expo`, exit `{ opacity:0, scale:0.97 }` at 150ms; Escape key listener; backdrop click → `onClose`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId()`; zero hardcoded colour values
- `CalledModal`, `ConfirmModal`, `ReasonModal` refactored to compose `Modal`; own chrome deleted; hardcoded `#fff`/`#ffffff` violations replaced with CSS tokens
- `src/components/CLAUDE.md` updated with props contract and the rule that every future modal composes the primitive

Props: `open: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `footer: React.ReactNode`, `maxWidth?: string` (default `max-w-lg`)

---

## 2026-05-27

### Personal details card on lead dossier

#### Personal details enrichment (Migration 0009)

- `personal_details JSONB` column added to `leads` — stores agent-collected enrichment keyed by field name; existing RLS covers it; no extra policies needed
- `Lead.personal_details: Record<string, string> | null` added to `database.ts`
- `UpdatePersonalDetailsSchema` added to `lead-schema.ts` — five fields (company, occupation, interests, city, notes); each passes through `sanitizeText()`
- `updatePersonalDetails` server action in `leads.ts` — Zod → auth → two-layer access check → merge into existing JSONB (preserves prior keys, strips empty strings)
- `PersonalDetailsCard` — inline card on the dossier left column; dormant read-only view until user clicks a field; 2-col grid (Company, Occupation, Interests, City) + full-width Details textarea; Save + Cancel footer appears only when active; follows `AgentScratchpad` card pattern
- Card is visible to all roles with dossier access; editable by assigned agent, manager (domain), admin, founder

---

### Post-Phase 5 hardening

#### Atomic round-robin agent assignment (Migration 0007)

- Replaced three-query application-layer round-robin with a single `get_next_round_robin_agent()` SECURITY DEFINER function
- `SELECT FOR UPDATE SKIP LOCKED` on `agent_routing_config` — two concurrent webhook calls cannot pick the same agent
- O(agents) not O(leads) — `MAX(assigned_at) GROUP BY` subquery, not a full table scan
- Two-step fallback for agents without a routing config row
- Added `idx_leads_assigned_to_assigned_at` partial index

#### Lead deduplication by phone (Migration 0008)

- Phone is the dedup key. Active lead (`new | touched | in_discussion | nurturing`) → log `duplicate_submission` activity, return existing lead, no new row created
- Terminal lead (`lost | junk | won`) → create new lead, set `previous_lead_id` FK to predecessor
- `get_active_lead_by_phone()` SECURITY DEFINER function with `idx_leads_phone_active` partial index
- `previous_lead_id` self-referential FK added to `leads` table (`ON DELETE RESTRICT`)
- `duplicate_submission` registered as valid `action_type` on `lead_activities`
- `Lead.previous_lead_id` and `duplicate_submission` added to `database.ts` types
- `IngestionResult` union extended with `duplicate: boolean` flag

#### Activity log — assignee name resolution

- `LeadActivityWithActor` type extended with `assignee_name: string | null`
- `getLeadActivitiesFull()` now batch-resolves `details.assigned_to` UUIDs alongside `actor_id` in a single `getProfileNameMap` call — zero extra DB queries
- `LeadActivityLog` component: `lead_created` now reads "Lead entered the system"; `agent_assigned` now reads "Assigned to [Name]"

---

## 2026-05-27 — Phase 5 complete

### Profile page + theme system

- `GET /profile` — server component; 6 card sections (avatar, details, theme, password, notifications)
- `ProfileAvatarSection` — click-to-upload via Supabase Storage `avatars` bucket; initials fallback; role/domain badges
- `ThemeSelector` — 5 swatches; instant DOM switch + async DB persist; no flash on load
- `PasswordChangeForm` — re-authenticates before `updateUser`; live 4-step strength bar
- `NotificationPreferences` — stubbed; "Coming soon"
- Inline `<script>` in dashboard layout sets `data-theme` synchronously before paint
- Sidebar footer → `<Link href="/profile">` with active-state styling

---

## 2026-05-27 — Raw payload logging

- Migration 0004: `lead_raw_payloads` table — immutable JSONB log; `lead_id` backfilled after insert; admin/founder only
- Migration 0005: `ingestion_error` column on `lead_raw_payloads` — marks failed ingestions for the error log
- `lead-ingestion.ts` — logs raw payload as step 1; logging failure is non-fatal
- `adapters.ts` — `adaptMeta` handles three payload shapes: Meta native, Pabbly, flat top-level keys; multi-key fallback for phone/email/ad fields
- `GET /error-log` — admin/founder page showing all errored raw payloads

---

## 2026-05-27 — Phase 4 complete

### Lead dossier + full lifecycle

- `GET /leads/[id]` — server component; parallel fetches; page-level access gate mirrors action-level
- `LeadInfoCard` — contact fields, UTM params, domain/platform/intent
- `StatusActionPanel` — Called/Won/Nurturing/Lost/Junk actions; owns CalledModal + ConfirmModal + ReasonModal
- `CalledModal` — call outcome dropdown + required note; auto-advances `new → touched`
- `AgentScratchpad` — debounced auto-save (1s); assigned agent + admin only
- `LeadNotesSection` — chronological notes timeline with author names + call outcome badges
- `LeadJourneyTimeline` — visual 4-stage path (`new → touched → in_discussion → won`); dwell times; resolution badge
- `LeadActivityLog` — append-only activity history; newest first
- `LeadDossierTasksAsync` — async server component; next pending task; overdue state highlighted

---

## 2026-05-27 — Phase 3 complete

### Gia module: lead ingestion, assignment, lead list

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` with full RLS
- Webhook `POST /api/webhooks/leads` — Bearer auth + in-memory rate limiting
- `ingestLead()` — validate → sanitize → resolve domain → round-robin assign → insert → log activities
- `LeadsTable` — client-side status filter + search; role-aware (agent/manager/admin/founder)
- Sidebar: Leads nav link added

---

## 2026-05-27 — Phase 2 complete

### User management + agent routing

- `agent_routing_config` table; auto-created on `role=agent` via trigger
- `toggleAgentRouting` server action (manager/admin/founder)
- `inviteUser` action — magic-link invite via `inviteUserByEmail`
- `UsersTable` — client-side filters (role, domain, search)
- `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`
- `GET /admin/users/[id]` — user detail page

---

## 2026-05-26 — Phase 1 complete

### Profiles system + user creation

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table; RLS; `get_user_role()` / `get_user_domain()`; `on_auth_user_created` trigger; `profile_audit_log`
- `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive` server actions
- Dashboard layout; Sidebar; TopBar
- `GET /admin/users` — user list
- `GET /admin/users/new` — create user form

---

## 2026-05-26 — Phase 0 complete

### Foundation

- Next.js 16 App Router scaffolded; Supabase connected; Tailwind v4; shadcn/ui
- `design-tokens.css` — all CSS variables; five themes (Earth, Air, Water, Fire, Cosmos)
- Supabase client files: `client.ts`, `server.ts`, `middleware.ts`
- Auth pages: login, forgot-password, update-password
- Shared utilities: `sanitize.ts`, `phone.ts`, `dates.ts`, `numbers.ts`, `chart-tokens.ts`, `scroll.ts`
