# Eia — CLAUDE.md

## Read this before writing a single line of code

This file is the command layer. It tells you the non-negotiables,
where everything lives, and what to never do.
The full design reference is in `docs/design-dna.md`.
The full token values are in `src/styles/design-tokens.css`.

---

## What Eia Is

A luxury internal operating system for Indulge team members.
Two-layer shell: dark canvas + floating paper content area.
Five themes: Earth (default), Air, Water, Fire, Cosmos.
One AI presence: Lia — she is not a chatbot, she is a compass.

---

## The Surface Contract

Every text colour decision flows from this table.
Memorise it. Never deviate from it.

| Surface                                     | Text token               |
| ------------------------------------------- | ------------------------ |
| `--theme-paper` (content area)              | `--theme-text-primary`   |
| `--theme-paper-subtle` (inset areas)        | `--theme-text-primary`   |
| `--theme-canvas` (dark shell)               | `--theme-canvas-text`    |
| `--theme-accent` fills (buttons, badges)    | `--theme-accent-fg`      |
| `--color-success/danger/warning/info` fills | matching `*-text` token  |
| Secondary labels on paper                   | `--theme-text-secondary` |
| Placeholders, timestamps, muted             | `--theme-text-tertiary`  |
| Sidebar nav inactive                        | `--theme-sidebar-text`   |
| Sidebar nav active                          | `--theme-sidebar-active` |

**Never use `--theme-text-inverse` on accent fills. Use `--theme-accent-fg`.**
They are different tokens for different surfaces.

---

## File Locations — Find Before You Build

```text
src/lib/supabase/client.ts          ← browser Supabase client (only place)
src/lib/supabase/server.ts          ← server Supabase client (only place)
src/lib/supabase/middleware.ts      ← session refresh helper (only place)
src/proxy.ts                        ← Next.js 16 proxy (replaces middleware.ts)
src/lib/actions/                    ← ALL server actions live here
src/lib/services/                   ← ALL DB queries live here
src/lib/validations/                ← ALL Zod schemas live here
src/lib/constants/                  ← domain names, role names, status enums
src/lib/constants/motion.ts        ← shared Framer Motion constants (ENTER_DURATION, EASE_OUT_EXPO, etc.) — import here, never re-declare inline per component
src/lib/utils/sanitize.ts           ← sanitizeText() — the only sanitizer
src/lib/utils/phone.ts              ← normalizeToE164() — the only normalizer
src/lib/utils/dates.ts              ← formatDate() — the only date formatter
src/lib/utils/numbers.ts            ← formatCount(), formatCurrency() etc.
src/lib/utils/chart-tokens.ts       ← getChartTokens() — Recharts bridge
src/lib/utils/campaigns.ts          ← beautifyCampaignTitle() — the only campaign-title decorator
src/lib/utils/scroll.ts             ← scrollToBottom(), lockBodyScroll() etc.
src/lib/services/dashboard-service.ts ← ALL dashboard widget queries (never extend leads-service.ts)
src/lib/actions/dashboard.ts         ← ALL dashboard server actions (widget data refresh)
src/lib/constants/dashboard-widgets.ts ← widget registry (pure data, no component refs)
src/lib/constants/route-permissions.ts ← ALWAYS_ALLOWED_PREFIXES + DOMAIN_ROUTE_MAP (domain → permitted route prefixes)
src/lib/constants/domain-colors.ts    ← DOMAIN_LINE_COLORS record, one entry per AppDomain; values are var(--domain-*) strings resolved via resolveColorMap() before Recharts use
src/lib/utils/route-access.ts         ← canAccessRoute(profile, pathname) — pure function, safe in 'use client' components
src/hooks/useDebounce.ts              ← useDebounce<T>(value, delay) — the ONLY debounce utility; never recreate inline
src/hooks/useDashboardLayout.ts       ← localStorage layout hook (key: eia:dashboard:layout:${userId}:v1)
src/components/dashboard/            ← DashboardCanvas, DashboardWidgetSlot, WidgetSkeleton, widgets/
src/components/ui/                  ← shadcn primitives, zero feature imports
src/components/ui/lia-glyph.tsx     ← Lia's custom SVG mark (always breathing)
src/styles/design-tokens.css        ← ALL CSS variables, all themes
src/app/globals.css                 ← `.layout-canvas` dashboard shell (grain + gradient layers)
docs/design-dna.md                  ← full design reference
docs/changelog.md                   ← SINGLE SOURCE OF TRUTH for all changes (mandatory)
```

---

## The 12 Rules (Non-Negotiable)

```text
01  Every colour is a CSS variable. No hex values in components. Ever.

02  Every Server Action begins with Zod validation. First line. No exceptions.

03  No raw Supabase calls in components or actions.
    All queries go through lib/services/.

04  No component imports from another feature folder.
    Cross-feature data flows through lib/ only.

05  One Supabase client per context. Never instantiate elsewhere.

06  sanitizeText() on every user text before DB write.
    normalizeToE164() on every phone field before DB write.

07  Every new table has RLS enabled in its migration.

08  Log and activity tables are append-only. No UPDATE or DELETE. Ever.

09  Authorization reads only from public.profiles. JWT claims never trusted.

10  Server Actions return { data, error }. Never throw. Never void.
    Components handle both branches explicitly.

11  Async work over 3 seconds or needing retry → Trigger.dev.
    Never in route handlers.

12  Every meaningful change — feature, fix, migration, new package, refactor —
    gets an entry in docs/changelog.md before or alongside the code.
    docs/changelog.md is the single source of truth. The_Changelog.md is deleted.

```

---

## The Never-Do List

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
NEVER  use a coloured border on one edge of a card, row, or column as a category/status indicator (borderLeft/borderTop/borderRight/borderBottom accent strips) — use pills, dots, icons, or semantic badges instead
NEVER  add a package or meaningful change without a docs/changelog.md entry
NEVER  write to The_Changelog.md — it has been deleted; docs/changelog.md is the only changelog
NEVER  import a value symbol from lib/services/ in a 'use client' component — it pulls next/headers into the client bundle and hard-errors; use a Server Action in lib/actions/ instead
```

---

## Component Quick Reference

Before building anything, ask:

1. Does this already exist in `src/components/ui/`?
2. Can I compose it from the 12 core components?
3. Am I about to hardcode anything that should be a token?

**The 12 Core Components:**
Button, Input, Badge/Pill, Card, Avatar, Modal,
Table, Toggle, Dropdown/Select, Search Bar, Message Bar, Skeleton

**Auth-specific primitives:**
`PasswordStrengthBar` (`src/components/ui/PasswordStrengthBar.tsx`) — props: `password: string`; renders 4-segment bar with danger→warning→info→success colours; returns null when empty. Used on `/update-password` and `/profile`.

**Icon library:** `lucide-react` exclusively.
Default size: `w-4 h-4`, stroke: `1.5`.
Sidebar nav: `w-[15px] h-[15px]` (intentional exception).

**Page title dot:** Every primary navigation page `<h1>` ends with `<span className="page-title-dot">.</span>`.
This produces a slow accent-coloured blink (2.4s ease-in-out, `eia-page-dot-blink` keyframe).
Use `className="type-page-title"` on the `<h1>` and the dot class on the trailing span.
The dot is **only** on primary nav pages (the top-level `<h1>` the user lands on from the sidebar).
Detail pages (leads/[id], campaigns/[id], admin/users/[id]) are exempt — they show a back link instead.

**Empty states:** Always Playfair italic heading. Never "No data available."

**Form errors:** Always from `lib/validations/form-errors.ts`.
Never raw Zod messages. Never "Invalid input."

---

## Standard Page Layout Contract

### The Lead List Layout is the canonical template for all primary nav list pages

Every list page (leads, users, settings, campaigns, tasks, etc.) follows this exact structure:

```tsx
<main className="flex-1 p-8">
  {/* Row 1 — Page header */}
  <div className="flex items-center justify-between gap-4 mb-6">
    <h1 className="type-page-title m-0">Title<span className="page-title-dot">.</span></h1>
    <ActionButton />          {/* primary CTA — always top-right */}
  </div>

  {/* Row 2 — Filter bar */}
  <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
    <FiltersComponent />      {/* search + filters relevant to this page */}
  </div>

  {/* Row 3 — Content (table or card list) */}
  <Suspense fallback={<ContentSkeleton />}>
    <ContentAsync />
  </Suspense>
</main>
```

**Rules (non-negotiable):**

- The title row is always `flex items-center justify-between` — title left, action right.
- The filter bar is always a rounded bordered `--theme-paper` strip with `--shadow-1`, `mb-4`.
- The content area follows immediately below the filter bar. No extra wrappers.
- `Suspense` with a skeleton is mandatory for any async content component.

### Two content display modes

**Dense table** (high-volume pages: `/leads`, any page that can exceed 100 rows)

- Use the `<Table>` component or the leads table pattern.
- Filter bar runs server-side (URL params). Table is display-only.
- Column visibility + drag-to-reorder via `useLeadColumnPreferences` pattern (Q-08).

**Card list** (low-volume pages: `/admin/users`, `/settings`, `/campaigns`)

- Each row is a `motion.div` card with `--shadow-1` at rest → `--shadow-2` on hover.
- Cards animate in with staggered `opacity 0→1, y 4→0` at 250ms, `EASE_OUT_EXPO`.
- On hover: `translateY(-1px)` + `--shadow-2`. On leave: reset. Transition via CSS `transition` prop.
- Cards never exceed 500ms total entrance stagger (`Math.min(index * 80, 320)`).
- Framer Motion `motion.div` — transform and opacity only (never width/height/padding).

**Reference implementations:**

- Dense table: `src/components/leads/LeadsTable.tsx` + `src/app/(dashboard)/leads/page.tsx`
- Card list: `src/components/campaigns/CampaignCard.tsx` + `src/components/admin/UsersTable.tsx`

---

## Lia Quick Reference

```text
Lia is not a chatbot. She is a presence.
Her glyph ALWAYS breathes when she is present (liaBreathe animation).
A static glyph = Lia is not present.

Four surfaces: Panel, Conversation, Inline Suggestion, Action Proposal.
Inline suggestions always have a 400ms delay. Never instant.
Proposal cards always have exactly two actions: Approve and Dismiss.
Lia never shows a number badge. One dot or nothing.
Lia's colour is always --theme-accent. She belongs to the theme.

Cross-domain insights are always labelled with the source domain.
Lia never silently crosses domain boundaries.
```

---

## Theme Quick Reference

```text
data-theme="earth"   → gold accent (#D4AF37), warm canvas (#0d0c0a) + grain + radial washes
data-theme="air"     → steel blue accent (#7b9fc4), blue-black canvas
data-theme="water"   → teal accent (#2a9d8f), teal-black canvas
data-theme="fire"    → lava orange accent (#e05c1a), brown-black canvas
data-theme="cosmos"  → nebula violet accent (#8b6fd4), violet-black canvas

Default (no attribute) = Earth.
Theme attribute goes on the <html> element.
--theme-accent-fg on Earth is #0a0a0a (dark text on gold).
--theme-accent-fg on all other themes is #ffffff.
```

---

## Folder Structure

```text
eia/
├── CLAUDE.md                        ← this file
├── .cursorrules                     ← identical to this file
├── .env.local                       ← never committed
├── .env.example                     ← always committed
│
├── docs/
│   ├── The_Blueprint.md             ← project spec, phases, RBAC, decision log
│   ├── design-dna.md                ← full design reference
│   ├── The_Rules.md                 ← 50+ coded rules across 8 sections
│   └── changelog.md                 ← ALL changes logged here (single source of truth)
│
├── src/
│   ├── app/
│   │   ├── CLAUDE.md                ← App Router rules. Routes, pages, auth gate.
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── update-password/
│   │   ├── (dashboard)/             ← all authenticated pages
│   │   ├── api/
│   │   │   └── webhooks/            ← inbound webhooks only. No other API routes.
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                 ← redirects to /login or /dashboard
│   │
│   ├── components/
│   │   ├── CLAUDE.md                ← component rules. display-only. token usage.
│   │   ├── ui/                      ← shadcn primitives. zero feature imports.
│   │   └── layout/                  ← Sidebar, TopBar
│   │
│   ├── lib/
│   │   ├── CLAUDE.md                ← action patterns. util rules. type conventions.
│   │   ├── supabase/
│   │   │   ├── client.ts            ← browser client (only place)
│   │   │   ├── server.ts            ← server client (only place)
│   │   │   └── middleware.ts        ← session refresh (only place)
│   │   ├── actions/                 ← all server actions
│   │   ├── services/                ← all DB queries
│   │   ├── validations/             ← all Zod schemas + form-errors.ts
│   │   ├── constants/               ← typed enums: domains, roles, statuses
│   │   ├── utils/
│   │   │   ├── sanitize.ts          ← sanitizeText()
│   │   │   ├── phone.ts             ← normalizeToE164()
│   │   │   ├── dates.ts             ← formatDate(), toUTC()
│   │   │   ├── numbers.ts           ← formatCount(), formatCurrency()
│   │   │   ├── scroll.ts            ← scrollToBottom(), lockBodyScroll()
│   │   │   └── chart-tokens.ts      ← getChartTokens() — Recharts bridge
│   │   └── types/
│   │       ├── database.ts          ← auto-generated from Supabase
│   │       └── index.ts             ← shared types
│   │
│   ├── hooks/
│   │   └── useLeadColumnPreferences.ts  ← column pref hook (pattern for all future table pickers)
│   │
│   ├── styles/
│   │   └── design-tokens.css        ← ALL CSS variables, all five themes
│   │
│   └── middleware.ts
│
└── supabase/
    ├── migrations/
    │   └── CLAUDE.md                ← migration rules. RLS checklist. never edit after run.
    └── config.toml
```

---

## Phase Status

### Phase 0 — Complete (2026-05-26)

Foundation scaffolded. All 14 items from the Phase 0 checklist are in place.

### Phase 1 — Complete (2026-05-26)

Profiles system built. User creation flow live.

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table, RLS, `get_user_role()` / `get_user_domain()` helpers, `on_auth_user_created` trigger, `profile_audit_log` table + trigger
- `src/lib/supabase/admin.ts` — service-role client (user creation only)
- `src/lib/types/database.ts` — `Profile`, `UserRole`, `AppDomain`, `ActionResult`
- `src/lib/constants/roles.ts` — `USER_ROLES`, `ROLE_LABELS`
- `src/lib/constants/domains.ts` — `APP_DOMAINS` (user mgmt), `GIA_DOMAINS` (Gia module), `DOMAIN_LABELS` — Q-17 in `docs/The_Rules.md`
- `src/lib/validations/profile-schema.ts` — create/update/auth/deactivate schemas
- `src/lib/services/profiles-service.ts` — all profile DB queries
- `src/lib/actions/profiles.ts` — `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive`
- Dashboard layout: `src/app/(dashboard)/layout.tsx`
- Sidebar + TopBar: `src/components/layout/`
- Admin user list: `GET /admin/users`
- Create user form: `GET /admin/users/new`

### Phase 2 — Complete (2026-05-27)

User management fully operational. Agent routing config wired.

- Migration 0002: `agent_routing_config` table, RLS, `handle_agent_routing_config` trigger (auto-creates row when `role=agent`)
- `src/lib/types/database.ts` — `AgentRoutingConfig` type added
- `src/lib/services/agent-routing-service.ts` — `getAgentRoutingConfig`, `getActiveRoutingConfigs`, `setRoutingActive`
- `src/lib/actions/agent-routing.ts` — `toggleAgentRouting` (manager/admin/founder)
- `src/lib/actions/profiles.ts` — `inviteUser` action (magic-link invite via `inviteUserByEmail`)
- `src/lib/validations/profile-schema.ts` — `inviteUserSchema` added
- `src/components/admin/CreateUserForm.tsx` — mode switcher: "Set password" vs "Send invite link"
- `src/components/admin/UsersTable.tsx` — client-side filters (role, domain, search) + Edit link per row
- `src/components/admin/EditProfileForm.tsx` — edit name, job title, phone, username
- `src/components/admin/EditAuthorizationForm.tsx` — edit role + domain (admin/founder only)
- `src/components/admin/UserStatusControls.tsx` — is_active toggle + routing is_active toggle
- `src/app/(dashboard)/admin/users/[id]/page.tsx` — user detail page

Font variables in use:

- `--font-geist-sans` → mapped from `Inter` via `next/font/google` with `variable: "--font-geist-sans"`
- `--font-playfair` → mapped from `Playfair_Display` via `next/font/google` with `variable: "--font-playfair"`

These are set on the `<html>` element as className and consumed by `--font-sans` and `--font-serif` in `design-tokens.css`.

### Phase 3 — Complete (2026-05-27)

Gia module: lead ingestion, assignment, and lead list page.

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` tables with full RLS
- `src/lib/types/database.ts` — `Lead`, `LeadActivity`, `LeadNote`, `Task`, `TaskGiaMeta`, `LeadStatus`, `CallOutcome`, `TaskType` types added; all tables carry `Relationships: []`; `Views` key added; `server.ts` now typed `createServerClient<Database>`
- `src/lib/constants/lead-statuses.ts` — status enums + badge config
- `src/lib/constants/call-outcomes.ts` — outcome enums + labels
- `src/lib/constants/task-types.ts` — task type enums
- `src/lib/constants/campaign-domain-map.ts` — prefix → domain mapping + `resolveDomainFromCampaign()`
- `src/lib/validations/lead-schema.ts` — `LeadWebhookSchema`, `AddCallNoteSchema`, `UpdateLeadStatusSchema`, `AssignLeadSchema`, `UpdateScratchpadSchema`
- `src/lib/services/leads-service.ts` — `getLeadById`, `getLeadsForAgent`, `getLeadsForDomain`, `getAllLeads`, `getLeadsByRole`, `getLeadActivities`, `getLeadNotes`, `getNextRoundRobinAgent`
- `src/lib/services/lead-ingestion.ts` — `ingestLead()` (validate → sanitize → split name → resolve domain → round-robin assign → insert → log activities)
- `src/lib/actions/leads.ts` — `addLeadCallNote`, `updateLeadStatus`, `assignLead`, `updateScratchpad`
- `src/app/api/webhooks/leads/route.ts` — POST handler with Bearer auth + in-memory rate limiting
- `src/components/leads/LeadsTable.tsx` — client-side status filter + search, Playfair italic empty state
- `src/components/leads/LeadsTableSkeleton.tsx` — skeleton loading state
- `src/app/(dashboard)/leads/page.tsx` — role-aware lead list (agent → own leads, manager → domain, admin/founder → all)
- Sidebar: Leads nav link added

---

### Phase 4 — Complete (2026-05-27)

Lead dossier + lifecycle fully operational.

- `src/app/(dashboard)/leads/[id]/page.tsx` — server component dossier page; fetches lead, notes, activities, assignee in parallel; access-gates at page level (mirrors action-level logic)
- `src/components/leads/LeadInfoCard.tsx` — contact fields, UTM params, domain/platform/intent display
- `src/components/leads/StatusActionPanel.tsx` — Called/Won/Nurturing/Lost/Junk action buttons; owns CalledModal + ConfirmModal + ReasonModal; fires `updateLeadStatus` and `addLeadCallNote` via server actions; router.refresh() on success
- `src/components/leads/CalledModal.tsx` — call outcome dropdown + required note textarea; submits `addLeadCallNote`; auto-advances new → touched
- `src/components/leads/DynamicFormResponses.tsx` — renders `leads.form_data` JSONB as key/value pairs
- `src/components/leads/AgentScratchpad.tsx` — debounced auto-save (1s) to `updateScratchpad`; canEdit prop enforced at page level; visible to assigned agent + admin + founder
- `src/components/leads/LeadNotesSection.tsx` — chronological timeline with author names + call outcome badges; Playfair italic empty state
- `src/components/leads/LeadJourneyTimeline.tsx` — visual 4-stage path (new → touched → in_discussion → won); dwell times calculated from `lead_activities` timestamps; resolution status badge when not on journey path
- `src/components/leads/LeadDossierTasksAsync.tsx` — async server component showing next pending task; overdue state highlighted
- `src/lib/services/leads-service.ts` — added `getLeadNotesFull()`, `getLeadActivitiesFull()`, `getNextLeadTask()`; added `LeadNoteWithAuthor` and `LeadActivityWithActor` types

Won side-effect: client row creation deferred to Phase 5 (no `clients` table yet). Status update + activity log works.

### Raw payload logging added (2026-05-27)

- Migration 0004: `lead_raw_payloads` table — immutable JSONB log of every inbound webhook payload; `lead_id` FK backfilled after insert; admin/founder SELECT only; no UPDATE/DELETE ever
- `src/lib/services/lead-ingestion.ts` — logs raw payload as step 1 before any extraction; `lead_id` backfilled after lead insert; `raw_payload_id` threaded into `lead_created` activity details; logging failure is non-fatal (never blocks a lead)
- `src/lib/leads/adapters.ts` — `adaptMeta` rewritten to handle three payload shapes in priority order: (1) Meta native `field_data: [{name, values}]`, (2) Pabbly `raw_meta_fields: [{name, values}]`, (3) flat top-level keys; multi-key fallback for phone/email/ad fields; all non-standard keys captured into `form_data`

---

### Phase 5 — Complete (2026-05-27)

Profile page + theme system fully operational.

- `src/app/(dashboard)/profile/page.tsx` — server component; fetches own profile; 6 Card sections
- `src/components/profile/ProfileAvatarSection.tsx` — xl avatar with click-to-upload; Supabase Storage `avatars` bucket; hover overlay + spinner; initials fallback; role/domain badges; mono member-since timestamp
- `src/components/profile/ProfileDetailsForm.tsx` — 2-column grid (name/phone, job-title/username); read-only email; uses existing `updateProfile` action
- `src/components/profile/ThemeSelector.tsx` — 5 swatches via `data-theme` trick (preview tokens resolve without any hardcoded hex); instant DOM switch then async DB persist via `useTransition`
- `src/components/profile/PasswordChangeForm.tsx` — re-authenticates via `signInWithPassword` before `updateUser`; live 4-step strength bar; show/hide toggle; browser Supabase client only
- `src/components/profile/NotificationPreferences.tsx` — stubbed disabled toggles; "Coming soon" copy
- `src/lib/validations/profile-schema.ts` — `updateProfileAvatarSchema` added
- `src/lib/actions/profiles.ts` — `updateProfileAvatar` server action added
- `src/app/(dashboard)/layout.tsx` — inline `<script>` sets `data-theme` synchronously before paint; no flash
- `src/components/layout/Sidebar.tsx` — footer user block converted to `<Link href="/profile">` with active-state styling

Avatar upload requires: Supabase Storage bucket `avatars`, public read, authenticated write, RLS path `{user_id}`.

---

### Attribution refactor (2026-06-03)

7 flat ad/attribution columns consolidated. Migration `20260603000065_attribution_refactor.sql`.

- **Removed:** `platform`, `campaign_id`, `ad_name`, `utm_content`
- **Renamed:** `utm_source → source`, `utm_medium → medium`
- **Added:** `attribution jsonb` — stores `{ platform, campaign_id, ad_name, adset_name }` for webhook leads
- `utm_campaign` unchanged — has 4 indexes, drives campaign analytics RPC.
- `leads.source` is the manual/dossier-editable field. Action: `updateLeadSource`.
- `leads.attribution.platform` replaces the flat `platform` column. Display-only in `LeadInfoCard`.
- `LeadListItem` no longer includes `platform`; `attribution` is dossier-only (not in list SELECT).
- `idx_leads_utm_source` dropped; `idx_leads_source` created.

---

### Post-Phase 5 hardening (2026-05-27)

Atomic round-robin, lead deduplication, activity log improvements, and personal details enrichment.

- Migration 0007: `get_next_round_robin_agent()` DB function — atomic `SELECT FOR UPDATE SKIP LOCKED`; O(agents) not O(leads); `idx_leads_assigned_to_assigned_at` partial index
- Migration 0008: lead dedup by phone — `previous_lead_id` FK; `get_active_lead_by_phone()` function; `duplicate_submission` action type; `idx_leads_phone_active` partial index
- Migration 0009: `personal_details JSONB` column on `leads` — agent-collected enrichment; existing RLS covers it
- `src/lib/types/database.ts` — `Lead.previous_lead_id`, `duplicate_submission` action type, `Lead.personal_details` added
- `src/lib/validations/lead-schema.ts` — `UpdatePersonalDetailsSchema` added (company, occupation, interests, city, notes; all sanitized)
- `src/lib/actions/leads.ts` — `updatePersonalDetails` action: Zod → auth → access check → JSONB merge (preserves prior keys, strips empty strings)
- `src/lib/services/lead-ingestion.ts` — dedup check wired; `IngestionResult` union extended with `duplicate` flag
- `src/lib/services/leads-service.ts` — `LeadActivityWithActor` extended with `assignee_name`; `getLeadActivitiesFull` batch-resolves assignee UUIDs in single profile query
- `src/components/leads/LeadActivityLog.tsx` — `lead_created` → "Lead entered the system"; `agent_assigned` → "Assigned to [Name]"
- `src/components/leads/PersonalDetailsCard.tsx` — inline card in left column; dormant until clicked; 2-col grid (Company, Occupation, Interests, City) + full-width Details textarea; Save + Cancel footer appears only when active; editable by assigned agent, manager, admin, founder

---

### Error log + missing exports (2026-05-27)

Resolved all build errors left by the post-Phase 5 hardening session.

- `src/lib/services/leads-service.ts` — `getErroredPayloads()` added: queries `lead_raw_payloads` where `ingestion_error IS NOT NULL`, returns `LeadRawPayload[]`; `LeadRawPayload` import added
- `src/lib/types/database.ts` — `Lead.personal_details: Record<string, string> | null` confirmed present
- `src/lib/validations/lead-schema.ts` — `UpdatePersonalDetailsSchema` uses `z.record(z.string(), z.string())` (Zod v4 requires both key + value schema); `UpdatePersonalDetailsInput` type exported
- `src/lib/actions/leads.ts` — `updatePersonalDetails` action added; `sanitizeText` imported; merges into existing JSONB, strips empty strings
- `src/lib/services/lead-ingestion.ts` — `personal_details: null` added to lead insert object

---

### Phase 6 — Complete (2026-05-27)

`ui/Modal` primitive extracted. All existing modals refactored to consume it.

- `src/components/ui/modal.tsx` — chrome-only Modal primitive: backdrop (`fixed inset-0`, `rgba(0,0,0,0.5)`, `backdrop-blur-sm`, `z-[--z-overlay]`), container (`bg var(--theme-paper)`, `radius-lg`, `shadow-3`, `z-[--z-modal]`), header, body slot, footer slot; Framer Motion `AnimatePresence` — enter `{ opacity:0, y:10, scale:0.98 }→{ opacity:1, y:0, scale:1 }` at 350ms `ease-out-expo`, exit `{ opacity:0, scale:0.97 }` at 150ms; Escape key listener; backdrop click → `onClose`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId()`; zero hardcoded colour values
- `src/components/leads/CalledModal.tsx` — refactored to compose `Modal`; own chrome deleted; all business logic preserved
- `src/components/leads/StatusActionPanel.tsx` — `ConfirmModal` and `ReasonModal` refactored to compose `Modal`; own chrome deleted; hardcoded `#fff`/`#ffffff` violations replaced with `var(--color-success-text)` and `var(--theme-text-inverse)`
- `src/components/CLAUDE.md` — Modal props contract documented; rule established: every future modal composes `ui/modal.tsx`, never reimplements chrome

Props: `open: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `footer: React.ReactNode`, `maxWidth?: string` (default `max-w-lg`)

---

### Leads table — column visibility + drag-to-reorder (2026-05-28)

- `src/lib/constants/lead-columns.ts` — column registry: 11 columns (`status`, `name`, `phone`, `email`, `campaign`, `source`, `assigned_to`, `created_at`, `last_call_outcome`, `call_count`, `domain`); each entry has `id` (stable localStorage key — never rename), `label`, `defaultVisible`, `locked`; `status` and `name` are locked visible
- `src/hooks/useLeadColumnPreferences.ts` — `useLeadColumnPreferences(userId)` hook; reads/writes `localStorage` at key `eia:leads:columns:${userId}:v1`; validates stored ids against registry on load (unrecognised ids silently dropped); hydrates after mount to avoid SSR mismatch; locked columns always forced into `visibleColumns`; returns `{ visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults }`
- `src/components/leads/LeadColumnPicker.tsx` — popover panel (not a modal); `@dnd-kit/sortable` drag-to-reorder for visible columns; locked rows show `Lock` icon, not a checkbox; hidden columns appear below a divider in a disabled non-draggable state; "Reset to defaults" footer link; 200ms `opacity/y` entrance animation matching dropdown spec
- `src/components/leads/LeadsTable.tsx` — now accepts `userId` prop; "Columns" ghost button (`Columns` lucide icon) opens picker; table renders only `orderedVisible` columns in stored order; `LeadCell` switch covers all 11 column ids; no Supabase re-query on toggle — purely presentational
- `src/app/(dashboard)/leads/page.tsx` — passes `profile.id` as `userId` to `LeadsTable`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` added to `package.json`

**Conventions established (see Q-07, Q-08 in The_Rules.md):**

- `@dnd-kit` is the canonical drag library for all of Eia. Use it everywhere drag-to-reorder is needed. Never add an alternative.
- The `useLeadColumnPreferences` hook is the canonical pattern for per-user table column preferences. Replicate its signature and key format (`eia:[module]:columns:${userId}:v1`) for any future table that gains a column picker.

---

### Leads — server-side search + pagination (2026-05-28)

- Migration 0011: `idx_leads_phone_text` — `text_pattern_ops` partial index on `leads(phone)` for ILIKE substring matching without sequential scan
- `src/lib/types/database.ts` — `LeadFilters.search: string | null` added
- `src/lib/services/leads-service.ts` — `getLeadsByRole` now returns `LeadsResult = { leads, totalCount }`; single query with `{ count: 'exact', head: false }` — one round trip, never two queries; search applied via `.or(first_name.ilike,last_name.ilike,phone.ilike,email.ilike)` after role constraints, before `.range()`; term trimmed/lowercased in service
- `src/components/leads/LeadsFilters.tsx` — search input added (Section 5.10 spec: `pl-9`, Search icon, clear X, `caret-color: var(--theme-accent)`); 500ms debounce via `useEffect`+`setTimeout`; search changes push `page=1` via `buildParams`; `search` counted in `activeCount` badge; `clearAll` resets search local state + URL together
- `src/components/leads/LeadsTable.tsx` — client-side search state and `useMemo` filter removed entirely; table receives pre-filtered rows from server; `filtered` variable removed; empty state uses `hasActiveFilters` only
- `src/components/leads/LeadsPagination.tsx` — new `'use client'` component; "Showing X–Y of Z leads" + Prev/Next buttons; `useTransition` on navigation; `pointer-events: none` on disabled buttons (not just visual); absent when `totalCount <= pageSize`
- `src/components/leads/LeadsTableAsync.tsx` — destructures `{ leads, totalCount }` from `getLeadsByRole`; renders `LeadsTable` + conditional `LeadsPagination`; `search` counted in `hasActiveFilters`
- `src/components/leads/LeadsTableSkeleton.tsx` — 50 rows (matches `pageSize`) to prevent layout jump between skeleton and content on pagination
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` now includes `search` field
- `src/app/(dashboard)/leads/CLAUDE.md` — updated with search, count shape, pagination, debounce, and page-reset rules

**Four invariants that must never be violated (full spec in `src/app/(dashboard)/leads/CLAUDE.md`):**

- `getLeadsByRole` returns `{ leads: Lead[], totalCount: number }` — never `Lead[]` alone. Every call site destructures both fields.
- `totalCount` comes from `{ count: 'exact', head: false }` on the same query builder that has all role constraints, filters, and search applied. A second `SELECT COUNT(*)` is a bug — it returns the wrong number when any filter is active.
- Every URL param push that changes a filter or search must delete the `page` param. This is enforced in `buildParams()`. Never bypass it with a hand-built `router.push` string.
- Search lives in `LeadsFilters.tsx` (debounced 500ms, URL param). `LeadsTable.tsx` contains zero filtering, searching, or sorting logic — it renders what the server returns.

---

### Leads table — Suspense-split architecture + server-side filters (2026-05-28)

- Migration 0010: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` — three partial indexes (`WHERE archived_at IS NULL`)
- `src/lib/types/database.ts` — `LeadFilters` type: status[], last_call_outcome[], agent_id, source, campaign, date_from, date_to, page, pageSize
- `src/lib/services/leads-service.ts` — `getLeadsByRole` extended: single chained Supabase query, all filters applied conditionally, `.range()` always applied (page 1 default = 50 rows, never full table), agent role constraint applied before `LeadFilters.agent_id`, `date_to` transformed to `T23:59:59.999Z` in service; `getLeadFilterOptions(role, domain)` added — returns `{ campaigns, agents }`, called once at page level
- `src/lib/constants/lead-sources.ts` — `LEAD_SOURCES`, `LEAD_SOURCE_LABELS` constants
- `src/components/leads/LeadsFilters.tsx` — `'use client'` filter bar; URL read/write only; `useTransition` on all navigations; Status (multi), Outcome (multi), Source (single), Campaign (single), Agent (single, absent from DOM for agent role), Date range; active filter count badge
- `src/components/leads/LeadsTableAsync.tsx` — async server component; direct child of `Suspense`; calls `getLeadsByRole` with filters; renders `LeadsTable`
- `src/components/leads/LeadsTableSkeleton.tsx` — rebuilt: 5 rows (§11.3), staggered pulse 0/80/160/240/320ms (§11.4)
- `src/components/leads/LeadsTable.tsx` — `hasActiveFilters` prop; Framer Motion entrance (opacity 0→1, y 4→0, 250ms, 100ms delay, ease-out-expo, §11.5); empty state "Nothing matches these filters." (§8.6); internal status filter removed
- `src/app/(dashboard)/leads/page.tsx` — thin orchestrator: fetches `filterOptions` once, parses `searchParams` into `LeadFilters`, renders `<LeadsFilters>` + `<Suspense><LeadsTableAsync /></Suspense>`
- `src/app/(dashboard)/leads/CLAUDE.md` — created

---

### Campaign ad video preview modal (2026-05-28)

- Migration 0012: `ad_creatives` table — `campaign_key` (UNIQUE, normalised, CHECK constraint), `video_url`, `thumbnail_url`, `ad_name`, `notes`; RLS: SELECT all authenticated, INSERT/UPDATE/DELETE admin/founder; `idx_ad_creatives_campaign_key` index
- `src/lib/types/database.ts` — `AdCreative` type + `ad_creatives` Database table entry
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign(campaignName)`: normalises (toLowerCase + trim), returns `AdCreative | null`, never throws
- `src/components/leads/CampaignVideoModal.tsx` — modal composing `ui/modal.tsx`; `max-w-2xl`; native `<video>` autoPlay muted; `video.play()` via ref with silent catch
- `src/components/leads/LeadInfoCard.tsx` — converted to `'use client'`; `adCreative?: AdCreative | null` prop; campaign field → interactive `<span role="button">` when creative present; ad_name also interactive when matched
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativeForCampaign` in existing `Promise.all`; skipped when utm_campaign is null
- `src/components/leads/CLAUDE.md` — created: component inventory for all leads components

---

### Phase 7 — Complete (2026-05-28)

Dashboard widget system: canvas, registry, hook, and 5 Gia widgets.

- `src/lib/constants/dashboard-widgets.ts` — widget registry (pure data); 5 widgets: `agent-tasks`, `agent-activity`, `manager-lead-status`, `manager-lead-volume`, `manager-campaigns`; `DEFAULT_LAYOUT_BY_ROLE` per role; `WIDGET_MAP`, `isValidWidgetId`
- `src/hooks/useDashboardLayout.ts` — `useDashboardLayout(userId, role)` hook; localStorage key `eia:dashboard:layout:${userId}:v1`; validates stored ids against registry on load; hydrates after mount; returns `{ layout, isHydrated, addWidget, removeWidget, moveWidget, resizeWidget, reorderWidgets, resetToDefaults }`
- `src/components/dashboard/WidgetSkeleton.tsx` — shimmer skeleton sized by `WidgetSize` prop; respects V-08 (≥150ms)
- `src/components/dashboard/DashboardWidgetSlot.tsx` — `'use client'`; Suspense boundary wrapping `React.lazy`-loaded widgets; static import map (never dynamic string); edit mode overlay (dashed accent border + remove ×); `MinSkeletonBoundary` enforces 150ms minimum
- `src/components/dashboard/DashboardCanvas.tsx` — `'use client'`; 2-column CSS grid (full-canvas skeleton before hydration); `@dnd-kit/sortable` drag-to-reorder; edit mode toggle; reset layout button
- `src/lib/services/dashboard-service.ts` — dedicated dashboard queries: `getAgentTasksSummary`, `getAgentRecentActivity`, `getLeadStatusSummary`, `getLeadVolumeByPeriod`, `getLeadsByCampaign`; no dashboard queries added to `leads-service.ts`
- `src/lib/actions/dashboard.ts` — server actions: `getAgentTasksSummaryAction`, `getAgentRecentActivityAction`, `getLeadStatusSummaryAction`, `getLeadsByCampaignAction`, `getLeadVolumeByPeriodAction`; all re-verify via `getCurrentProfile()`; role guards on manager actions
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — `'use client'`; all 3 task categories (`personal`, `group_subtask`, `gia_followup`), active statuses only (`to_do/in_progress/in_review`); animated pulsing category dot (7px, `eia-cat-dot-pulse` keyframe, staggered delays); priority chip (urgent/high only); status chip (in_progress/in_review only); context label (lead name or group name); category legend footer; sorted overdue→priority→due_at; limit 30
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — `'use client'`; auto-scrolling live ticker: `translateY` loop via `setTimeout(16ms)`, speed `0.11px/frame`, pauses on hover, wraps to top; fixed `220px` viewport with top+bottom fade masks; Supabase Realtime filtered by `actor_id=eq.${userId}`; new event resets offset to 0; `note_added` rows filtered everywhere; state cap 25; action types: `call_logged` (Phone icon, outcome label), `status_changed` (ArrowRight, old→new status), `lead_created` (UserPlus), `agent_assigned` (User), `duplicate_submission` (Copy); subtitle "Live Lead Activity."
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `'use client'`; stacked bar pipeline + per-agent breakdown; semantic status colours (design-dna.md §16.4)
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `'use client'`; Recharts `LineChart`; period toggle Today/Week/Month/Quarter in local state; `useTransition` on toggle; all colours CSS vars — no hex
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — `'use client'`; Recharts stacked `BarChart`; top-radius only per §16.4 bar rules; legend; empty state
- `src/app/(dashboard)/dashboard/page.tsx` — replaced placeholder with `<DashboardCanvas>` server component wrapper
- `src/app/(dashboard)/CLAUDE.md` — created: widget registry location, hook key format, dynamic import pattern, Phase B widget list, data access rules
- `recharts@3.8.1` added to dependencies

### Dashboard RSC consolidation — perf-01 (2026-05-29)

Dashboard waterfall eliminated. 5 client-initiated server action calls → 1 cached RSC fetch.
GET /dashboard now delivers all summary widgets with data on first paint. Zero POST calls on initial load.

- Migration 0029: `get_dashboard_summary(p_role, p_domain, p_user_id)` RPC — single jsonb, 4 keys, SECURITY DEFINER, role-based CTEs, all COUNT cast `::int`
- `src/lib/types/index.ts` — `DashboardSummary` type + 7 constituent types; shape mirrors RPC output exactly
- `src/lib/services/dashboard-service.ts` — `getDashboardSummary(role, domain, userId)` with React `cache()` (per-request memoisation); `unstable_cache` not viable here — `createClient()` calls `cookies()` which Next.js forbids inside `unstable_cache` closures
- `src/app/(dashboard)/dashboard/page.tsx` — calls `getDashboardSummary()` once; passes `initialData` to `DashboardCanvas`
- `WidgetProps` extended with `initialData?: DashboardSummary`; threaded through `DashboardCanvas → SortableWidget → DashboardWidgetSlot → widget`
- `AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` — skip mount fetch when `initialData` present; refresh buttons remain for user-initiated refetch
- `ManagerLeadVolumeWidget` — unchanged; period selector keeps its own action fetch (volume intentionally excluded from RPC)

**Rule:** Dashboard summary data is RSC + cached. Do not split `getDashboardSummary` back into individual server action calls. `getLeadVolumeByPeriod` is the only individual dashboard service function still called (by the period toggle action).

**Cache key rule:** `['dashboard-summary', role, domain, userId]` — all three identifiers required. Omitting any one risks cross-user cache hits.

---

### Phase 7 — post-ship fix (2026-05-28)

`startTransition` called during render — three widgets patched.

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — initial fetch moved into `useEffect`; `cancelled` flag prevents stale state update on unmount
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — same fix
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same fix

**Rule:** Initial data fetch in a widget must always live in `useEffect`, never as a render-phase guard. Pattern:

```ts
useEffect(() => {
  let cancelled = false;
  startTransition(async () => {
    const result = await getSomeAction();
    if (!cancelled && result.data) setState(result.data);
  });
  return () => { cancelled = true; };
}, []);
```

**Limitation to know:** the `cancelled` flag only guards against `setState` on an unmounted component — it does not cancel the in-flight server action itself. This is acceptable for the current widgets, which are fast reads with no side effects. If a future widget triggers a slow or expensive action on mount, consider `AbortController` on the underlying fetch — but that requires the server action to accept a `signal`, which adds complexity. Do not pre-engineer this. Add it only when the specific widget warrants it.

### Manual lead creation — Add Lead modal (2026-05-28)

- `src/lib/services/leads-service.ts` — `getAgentsForDomain(domain)` added: queries `profiles` where `role='agent' AND domain=$domain AND is_active=true`, returns `{ id, full_name }[]`
- `src/lib/validations/lead-schema.ts` — `CreateManualLeadSchema` + `CreateManualLeadInput` added: validates first_name, last_name?, phone (→ E.164), email?, lead_intent?, domain (APP_DOMAINS enum), assigned_to? (uuid)
- `src/lib/actions/leads.ts` — `createManualLead` action: Zod → auth → domain enforcement (agent locked to own domain) → assignee domain verification → duplicate check via `get_active_lead_by_phone()` → INSERT leads + activities; returns `{ duplicate: true, leadId }` on dup, `{ leadId }` on success
- `src/lib/actions/leads.ts` — `listAgentsForDomain` read action: thin wrapper over `getAgentsForDomain`; called by `AddLeadModal` when domain select changes
- `src/components/leads/AddLeadModal.tsx` — `'use client'` modal composing `ui/modal.tsx`; RHF + zodResolver; fields: first name, last name, phone, email, source (optional select: WhatsApp / Website / Meta / Google / Referral / YPO / Events, stored in `form_data.manual_source`), domain select (manager+), agent assignee select (manager+) with domain-change refetch; agent read-only chip (agent role); inline duplicate warning banner with dossier link; `router.refresh()` on success; `lead_intent` always null on manual leads
- `src/components/leads/AddLeadButton.tsx` — thin `'use client'` wrapper holding `useState` for modal open; renders `+ Add Lead` primary button
- `src/app/(dashboard)/leads/page.tsx` — `AddLeadButton` wired into page header; `initialAgents` fetched at page level via `getAgentsForDomain`

**Domain enforcement:** `createManualLead` always overwrites `domain = caller.domain` when caller role is `agent`. This is enforced server-side — form payload is never trusted.

---

### Phase 9 — Complete (2026-05-28)

Team benchmarks layer on the performance page.

- `src/lib/services/performance-service.ts` — `TeamBenchmarks` type; `getTeamBenchmarks(callerDomain, period)`; agentCount < 2 guard; 3 flat queries (never N); `leadsWon` excluded by design
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — sixth Promise.all call; `domain` prop (server-verified)
- `src/app/(dashboard)/performance/page.tsx` — `domain={profile.domain}` forwarded to PerformanceAsync
- `src/components/performance/CoreFourGrid.tsx` — `benchmarks` prop; benchmark line (absent when null); accent pip for above-average; response time inverse comparison
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — benchmark skeleton lines on 3 cards
- `src/app/(dashboard)/performance/CLAUDE.md` — updated

---

### Phase 8 — Complete (2026-05-28)

Performance page: agent self-view with Core Four metrics, effort layer, call outcome breakdown, and period selector.

- Migration 0013: three partial indexes (`idx_lead_activities_actor_status`, `idx_lead_notes_author_outcome`, `idx_leads_assigned_status_created`)
- `src/lib/services/performance-service.ts` — dedicated service; `PerformancePeriod` type; `getCoreFourMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getPreviousPeriodCoreMetrics`; IST-correct period boundaries; null contract for avgResponseTime + conversionRate
- `src/lib/utils/dates.ts` — `formatDuration(minutes)` added: null → "—", < 60m → "48m", ≥ 60m → "2h 34m"
- `src/app/(dashboard)/performance/page.tsx` — agent-only; non-agent → redirect `/dashboard`; `PerformanceMotivationalFooter` (Playfair italic, Lia's quiet voice)
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — async server component; `Promise.all` over 5 service calls
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — Tier 1/2/3 skeletons; stagger 0/80/160/240ms
- `src/components/performance/PerformancePeriodSelector.tsx` — URL param; `useTransition`; tab-style ghost buttons
- `src/components/performance/CoreFourGrid.tsx` — 2×2 grid; Playfair serif; unicode delta arrows; null → "—"
- `src/components/performance/EffortGrid.tsx` — 4-col compact cards; live-state dots
- `src/components/performance/CallOutcomeBar.tsx` — horizontal segmented bar; CSS var colours; Playfair italic empty state
- `src/components/layout/Sidebar.tsx` — Performance nav item added (BarChart2, position: below Leads)
- `src/app/(dashboard)/performance/CLAUDE.md` — created

---

### Campaign Analytics Command Center — Complete (2026-05-28)

Campaign list + detail pages for manager / admin / founder.

- Migration 0014: `idx_leads_campaign_domain`, `idx_leads_campaign_status` partial indexes; `get_campaign_metrics` RPC (conditional aggregates — one round trip)
- `src/lib/types/database.ts` — `CampaignMetrics`, `CampaignFilters` types added
- `src/lib/services/leads-service.ts` — `getCampaignMetrics(role, callerDomain, filters)` added; manager domain enforced before RPC call; never two queries
- `src/components/campaigns/CampaignFilters.tsx` — domain filter (admin/founder only), date range, clear; `useTransition`
- `src/components/campaigns/CampaignCard.tsx` — interactive card; 7 metric pills; staggered Framer Motion entrance
- `src/components/campaigns/CampaignListSkeleton.tsx` — 5 skeleton rows, stagger §11.4
- `src/components/campaigns/CampaignListAsync.tsx` — async server component, direct child of Suspense
- `src/app/(dashboard)/campaigns/page.tsx` — thin orchestrator; agent/guest → redirect; manager domain pre-locked
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — detail page; `encodeURIComponent`/`decodeURIComponent` contract; reuses `LeadsTable`
- `src/components/layout/Sidebar.tsx` — "Campaigns" nav item (`TrendingUp`, `/campaigns`); visible manager/admin/founder; "Analytics" section label
- `src/app/(dashboard)/campaigns/CLAUDE.md` — created

---

### Migration 0017 — OS Tasks schema (2026-05-28)

`task_groups`, `task_messages`, `tasks` core extended.

- Migration 0017: `task_groups` table (priority, status, domain scope, RLS); `task_messages` table (append-only, Realtime); `tasks` extended with `title`, `description`, `priority`, `task_category`, `group_id`; status enum migrated (`pending`→`to_do`, `done`→`completed`); `notifications.type` CHECK expanded with `task_assigned`
- `src/lib/types/database.ts` — `TaskStatus` updated (full 6-value enum); `TaskPriority`, `TaskCategory` types added; `Task` extended; `TaskGroup`, `TaskMessage` types added; `NotificationType` extended with `task_assigned`; `Database` table entries added for `task_groups`, `task_messages`
- `src/components/notifications/NotificationItem.tsx` — `task_assigned` case added to exhaustive switch (Q-11 satisfied); maps to `CheckSquare` icon

**tasks status vocabulary (post-0017):** `to_do | in_progress | in_review | completed | error | cancelled`
Old values `pending` and `done` no longer exist. Any code referencing them fails at the DB constraint.

**task_messages is append-only.** No UPDATE, no DELETE — enforced at RLS level. Never add those policies.

**tasks_agent_select policy is correct for group_subtask.** An agent can only see subtasks assigned to themselves (`assigned_to = auth.uid()`). A subtask assigned to a colleague in the same group is invisible. The existing policy requires no change.

**Task reminder pattern (Trigger.dev):** `scheduleTaskReminder` passes `idempotencyKey: 'task-reminder-${taskId}'` to `tasks.trigger()`. Trigger.dev v3 deduplicates by idempotency key for all non-terminal run states including DELAYED — a second `tasks.trigger()` with the same key while a DELAYED run exists returns the existing run handle (`isCached: true`), never creates a new run. This closes the concurrent-update race window without storing run IDs in the DB. Evidence is in the comment block at the top of `src/trigger/task-reminders.ts`. Do not add a `reminder_run_id` column to `tasks` — it is not needed.

### Migrations 0018–0021 — OS Tasks hardening (2026-05-28)

RLS fixes, suppression, and audit log.

- Migration 0018: `task_groups` SELECT and UPDATE policies tightened — manager role now enforces `get_user_domain() = domain`; admin/founder retain full access.
- Migration 0019: `task_messages` SELECT and INSERT policies add `created_by = auth.uid()` (task creator was locked out of own chat); managers scoped via `task_groups.domain` join.
- Migration 0020: `get_group_task_summary` RPC added — aggregate subtask counts per group.
- Migration 0021: `task_messages` suppression columns (`is_suppressed`, `suppressed_by`, `suppressed_at`) + UPDATE RLS for admin/founder; `task_audit_log` append-only table + `log_task_changes()` trigger (AFTER UPDATE on `tasks`, watches exactly six fields: `title`, `description`, `status`, `priority`, `due_at`, `assigned_to` — all other columns intentionally excluded).

**`task_audit_log` trigger contract:** `log_task_changes()` fires AFTER UPDATE on `tasks` FOR EACH ROW. It logs changes to exactly six fields. `attachments`, `task_category`, `group_id`, `created_at`, `updated_at`, `completed_at` are all intentionally excluded. Never add `attachments` to this trigger — checklist toggles would flood the log.

### Migration 0022 — task_remarks (2026-05-29)

`task_messages` replaced with `task_remarks`.

- Migration 0022: `DROP TABLE task_messages CASCADE` (pre-production, no data loss); `CREATE TABLE task_remarks` with `status_change` nullable text column (CHECK values mirror `tasks.status` exactly — coupled, must stay in sync); ASC index on `(task_id, created_at)`; same suppression columns + UPDATE RLS pattern; Realtime enabled.
- `src/lib/types/database.ts` — `TaskRemark` type added; `Database` table entry added for `task_remarks`.

**`task_remarks` is append-only** with one narrow exception: the suppression UPDATE policy. No DELETE policy ever. `status_change` CHECK values are coupled to `tasks.status` CHECK — if `tasks.status` gains a new value, a new migration must extend `task_remarks.status_change` too.

### Migration 0023 — task attachments / checklist (2026-05-29)

Checklist stored as JSONB on `tasks`.

- Migration 0023: `ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'` to `tasks`; CHECK constraint `tasks_attachments_is_array` validates `jsonb_typeof = 'array'`; no index (never queried as a filter); intentionally excluded from `log_task_changes()` trigger.
- `src/lib/types/database.ts` — `ChecklistItem = { id: string; text: string; checked: boolean }` exported; `Task.attachments: ChecklistItem[]` added; `Database.tasks.Insert` updated to make `attachments` optional (has DB default).
- `src/lib/validations/task-schemas.ts` — `UpdateChecklistSchema` + `UpdateChecklistInput` added.
- `src/lib/actions/tasks.ts` — `updateChecklistAction` added: Zod → auth → `canMutateTask` → adminClient UPDATE on `attachments`; returns `ChecklistItem[]`; checklist updates do NOT trigger `log_task_changes`.

**Checklist item shape:** `{ id: string, text: string, checked: boolean }`. Shape validation beyond array-type is enforced at the application layer only.

### SubTaskModal — replaces TaskModal (2026-05-29)

`TaskModal.tsx` deleted. `SubTaskModal.tsx` is the canonical task detail modal.

- `src/components/tasks/SubTaskModal.tsx` — panel centering uses `left: 240px` (sidebar width) so the modal centers within the content area, not the full viewport. Panel background `var(--theme-paper)`. `currentUserName?: string` prop added and threaded to `TaskRemarksPanel`. Three bogus tokens fixed: `--theme-surface` → `--theme-paper`, `--theme-surface-secondary` → `--theme-paper-subtle`, `--theme-border` → `--theme-paper-border`. Backdrop `backdropFilter: blur` removed (not a sanctioned surface). Zone B background transparent + `position: relative` so ambient orbs clip to it.
- `src/components/tasks/TaskRemarksPanel.tsx` — Zone B of `SubTaskModal`. No panel header, no status-change pill row. Messages rendered as individual floating `var(--theme-paper)` + `var(--shadow-1)` cards. Ambient background: two CSS `@keyframes` orbs (`trp-orb-a` 18s, `trp-orb-b` 24s) using `--theme-accent` at ~4% opacity; GPU-only (`transform + opacity + will-change`); `pointer-events: none; aria-hidden`. Composer: floating `var(--theme-paper)` + `var(--shadow-2)` card, no top border. Realtime dedup: `seenIds` ref (seeded from `initialRemarks.map(r => r.id)`) is checked before any `setRemarks` — same row ID never appended twice regardless of how many subscriptions Strict Mode creates. Echo detection: `incoming.author_id === currentUserId AND optimisticIds.size > 0` — replaces oldest pending optimistic row without content-matching (content-match broke when `sanitizeText` altered the string server-side).
- `src/components/tasks/GroupTaskWorkspace.tsx` — `currentUserName` now passed to `SubTaskModal`.

**`SubTaskModal` props:**

```text
open:             boolean
onClose:          () => void
task:             Task
group?:           TaskGroup          — present for group subtasks, absent for personal
assignee?:        Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
initialRemarks:   TaskRemarkWithAuthor[]
callerProfile:    Pick<Profile, 'id' | 'role' | 'domain'>
currentUserName?: string             — caller's display name for optimistic remark author
```

**`AnimatePresence` at call site is mandatory.** The modal does not wrap its own `AnimatePresence` — if the call site omits it, the exit animation never plays.

### Tasks page — contextual header button (2026-05-29)

Single `+ My Task` / `+ Group Task` button top-right of the tasks page, changing label with the active tab.

- `src/app/(dashboard)/tasks/TasksShell.tsx` — `createTrigger: number` state; header row `flex + space-between` with `TabSelector` left and accent button right; button label: `+ My Task` (personal tab) / `+ Group Task` (group tab); button hidden on group tab for agents (mirrors server-side auth guard); clicking increments `createTrigger` which is passed to the active tab.
- `src/components/tasks/PersonalTasksTab.tsx` — toolbar div removed; `createTrigger?: number` prop; `useEffect` watches it and calls `setCreateModalOpen(true)` when `> 0`; `Plus` import removed (no longer rendered here).
- `src/components/tasks/GroupTasksTab.tsx` — same pattern as `PersonalTasksTab`; toolbar div removed; `createTrigger?: number` prop + `useEffect`.

### Task tags — DB persistence + tag filter (2026-05-29)

Tags are stored in `tasks.tags text[]` and filterable client-side in My Tasks.

- Migration 0024: `tags text[] NOT NULL DEFAULT '{}'` on `tasks`; GIN index `idx_tasks_tags_gin` (partial: `task_category = 'personal'`).
- `src/lib/types/database.ts` — `Task.tags: string[]` added; `Insert` type updated.
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema` includes `tags: z.array(...).max(10).default([])`; `UpdateTaskTagsSchema` + `UpdateTaskTagsInput` added.
- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.tags?: string[]` added; `getPersonalTasks` applies `.contains('tags', filters.tags)` (GIN `@>` operator); `getPersonalTaskTags(userId)` returns sorted distinct tags.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction` writes `tags`; `updateTaskTagsAction` (full replace, auth-gated via `canMutateTask`); `getPersonalTaskTagsAction` read wrapper.
- `src/components/tasks/CreatePersonalTaskModal.tsx` — "Saved locally only (DB column pending)" removed; `tags` passed to action and included in `syntheticTask`.
- `src/components/tasks/PersonalTasksTab.tsx` — `availableTags` + `selectedTags` state; tags loaded in parallel on mount; tag filter pill bar above task list; client-side filter applied in `tasksByPriority` grouping; empty state copy adapts to tag-filtered state.

---

### Earth canvas enhancement (2026-05-29)

Dashboard shell canvas upgraded for Earth theme — warmer base, grain texture, three radial washes.

- `src/styles/design-tokens.css` — `--theme-canvas` / `--theme-sidebar-bg` → `#0d0c0a`; Earth-only `--theme-canvas-grain-opacity` + `--theme-canvas-gradient-1/2/3` tokens (espresso top-left, olive bottom-right, umber left rail)
- `src/app/globals.css` — `html`/`body` base `#0d0c0a` (no load flash); `.layout-canvas` class composes grain SVG + theme-scoped gradient vars
- `src/app/(dashboard)/layout.tsx` — shell migrated from inline background to `layout-canvas min-h-screen`

**`.layout-canvas` contract:** grain opacity is hardcoded in the SVG data URI (cannot reference CSS vars). Gradient layers use `--theme-canvas-gradient-*` — only Earth defines these today; other themes show flat canvas until enhanced. See `docs/design-dna.md` §3.5 and §6.6.

---

### Micro-animation pass — UI primitives (2026-05-31)

Six `src/components/ui/` primitives gained GPU-only micro-animations. All use `transform` + `opacity` exclusively. `willChange: 'transform'` set only on elements that actually move. Zero layout properties animated. Zero impact on initial render or server-fetching paths.

- `BackButton.tsx` — converted to `motion(Link)`. Mount: `x -6 → 0, opacity 0 → 1` (150ms). Hover: `x -2, scale 1.05`; inner arrow nudges additional `x -1`. Tap: `scale 0.93`.
- `ChecklistItem.tsx` — Square ↔ CheckSquare icon crossfades via `AnimatePresence mode="wait"`, `scale 0.6 → 1` (150ms). Tap: `whileTap scale 0.85`.
- `InfoRow.tsx` — Copy ↔ Check icon crossfades via `AnimatePresence mode="wait"`, `scale 0.5 → 1` (150ms). Tap: `whileTap scale 0.8` on the copy button.
- `EditButton.tsx` — Pencil rotates `0 → -8°` on hover (150ms). Tap: `whileTap scale 0.88`. Props interface narrowed to explicit named props (no `...rest` spread — avoids Framer Motion type conflict).
- `ListRow.tsx` — Chevron wraps in `motion.span`, nudges `x 0 → 2` on hover (150ms). Background hover state moved from imperative `style.setProperty` to reactive `hovered` state.
- `SearchBar.tsx` — Clear × wrapped in `AnimatePresence`; `scale 0.7 → 1, opacity 0 → 1` on appear, reversed on exit. Tap: `whileTap scale 0.8`.

**`MotionButton` — first real consumers:**

- `AddLeadButton.tsx` and `TasksShell.tsx` header button switched from `Button` to `MotionButton + MOTION_BUTTON_DEFAULTS` (`scale 0.97` spring tap). These are standalone primary CTAs pressed repeatedly — tap animation is appropriate.
- All other `Button` callers (form submits, modal footers, auth pages) remain on plain `Button`. Never add `MotionButton` to a form submit — the animation adds Framer bundle cost and no perceptual value on a page-transition press.

**Rule:** `Button` (CSS hover, zero Framer cost) for form submits and modal actions. `MotionButton + MOTION_BUTTON_DEFAULTS` for standalone primary CTAs. Never merge.

---

## Before Writing Any Code — Mandatory Sequence

Every task, every time. No exceptions.

```text
1. Read the relevant authority files for this task:
   - CLAUDE.md (this file) and src/components/CLAUDE.md
   - docs/design-dna.md for any visual/layout decision
   - src/styles/design-tokens.css for token values
   - The feature-area CLAUDE.md if one exists

2. Search the codebase for existing implementations of every
   named concept in this task. Search by behaviour, not filename:
   "date picker" not just "DatePicker"
   "format duration" not just "formatDuration"
   "round robin" not just "getNextRoundRobinAgent"
   Document what you find. Only build what does not already exist. (Q-12)

3. Only then write code.
```

This sequence is not optional. Q-12 applies to components, hooks, utils,
service functions, constants, and Zod schemas. A duplicate created without
a prior search is a violation regardless of whether the names differ.

---

## Pattern Notes

### `unstable_cache` — domain-scoped queries

When wrapping a service function in `unstable_cache`, the cache key **must** include the caller's domain when the underlying query is domain-scoped. A manager in `concierge` must never receive a cached response intended for `finance`.

```ts
// ✅ Correct
unstable_cache(() => queryFn(), ['tag', domain, JSON.stringify(filters)], { revalidate: 60, tags: ['tag'] })

// ✗ Wrong — omits domain, cross-domain cache hit possible
unstable_cache(() => queryFn(), ['tag'], { revalidate: 60, tags: ['tag'] })
```

Reference implementation: `getGroupTasks` in `src/lib/services/tasks-service.ts`.
Revalidation in Server Actions uses `revalidateTag(tag, { expire: 0 })` (Next.js 16 requires second arg).

---

### `void redis.del().catch()` in server actions is a bug, not a pattern

`void Promise.all([redis.del(key)]).catch(() => {})` is fire-and-forget. In a Next.js server
action, the action's return value unblocks the caller before the promise settles. `revalidatePath`
makes the RSC subtree immediately eligible for re-render — if any request hits the route before
the del completes, the service function will repopulate Redis from the DB, then the late del
evicts a fresh entry and extends the stale-serving window.

The correct pattern for any Redis del that must precede a cache revalidation:

```ts
// ✅ Correct — dels complete before revalidatePath fires
try {
  await Promise.all([
    redis.del(REDIS_KEYS.leadRowId(leadId)),
    redis.del(REDIS_KEYS.leadActivities(leadId)),
  ]);
} catch (e) {
  console.warn('[leads-action] redis del failed on status update', e);
}
revalidatePath(`/leads/${(lead.slug as string | null) ?? leadId}`);

// ✗ Wrong — del races against revalidatePath; can evict a fresh entry
void Promise.all([redis.del(REDIS_KEYS.leadRowId(leadId))]).catch(() => {});
revalidatePath(`/leads/${slug}`);
```

**Rule:** Every `redis.del` in a server action must be `await`-ed inside a `try/catch` that logs
a `[module-action]`-prefixed warning. The `try/catch` keeps Redis failure non-fatal. The `await`
ensures the cache layer is consistent before the RSC layer is told it can re-render. These two
requirements are not in conflict.

**Lead row dual-key invariant:** Lead rows are cached under two keys — `leadRowSlug(slug)`
(primary: hit on every slug-based dossier load) and `leadRowId(leadId)` (hit on UUID fallback
only). Any action that mutates the lead row must delete both when `slug` is non-null. Deleting
only `leadRowId` is a silent no-op on normal dossier traffic.

Reference implementation: `updateLeadStatus`, `addLeadCallNote`, `addLeadNote` in
`src/lib/actions/leads.ts`.

---

## When in Doubt

1. Check `docs/design-dna.md` for the full spec on any section.
2. Check `src/styles/design-tokens.css` for the exact token value.
3. Check `src/lib/constants/` for domain names, roles, and status values.
4. Never invent a value. If it doesn't exist in the token system, ask before adding it.
