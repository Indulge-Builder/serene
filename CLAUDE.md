# Eia — CLAUDE.md

## Read this before writing a single line of code.

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

```
src/lib/supabase/client.ts          ← browser Supabase client (only place)
src/lib/supabase/server.ts          ← server Supabase client (only place)
src/lib/supabase/middleware.ts      ← session refresh helper (only place)
src/proxy.ts                        ← Next.js 16 proxy (replaces middleware.ts)
src/lib/actions/                    ← ALL server actions live here
src/lib/services/                   ← ALL DB queries live here
src/lib/validations/                ← ALL Zod schemas live here
src/lib/constants/                  ← domain names, role names, status enums
src/lib/utils/sanitize.ts           ← sanitizeText() — the only sanitizer
src/lib/utils/phone.ts              ← normalizeToE164() — the only normalizer
src/lib/utils/dates.ts              ← formatDate() — the only date formatter
src/lib/utils/numbers.ts            ← formatCount(), formatCurrency() etc.
src/lib/utils/chart-tokens.ts       ← getChartTokens() — Recharts bridge
src/lib/utils/scroll.ts             ← scrollToBottom(), lockBodyScroll() etc.
src/components/ui/                  ← shadcn primitives, zero feature imports
src/components/ui/lia-glyph.tsx     ← Lia's custom SVG mark (always breathing)
src/styles/design-tokens.css        ← ALL CSS variables, all themes
docs/design-dna.md                  ← full design reference
```

---

## The 12 Rules (Non-Negotiable)

```
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

```

---

## The Never-Do List

```
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

**Icon library:** `lucide-react` exclusively.
Default size: `w-4 h-4`, stroke: `1.5`.
Sidebar nav: `w-[15px] h-[15px]` (intentional exception).

**Empty states:** Always Playfair italic heading. Never "No data available."

**Form errors:** Always from `lib/validations/form-errors.ts`.
Never raw Zod messages. Never "Invalid input."

---

## Lia Quick Reference

```
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

```
data-theme="earth"   → gold accent (#D4AF37), warm black canvas
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

```
eia/
├── CLAUDE.md                        ← this file
├── .cursorrules                     ← identical to this file
├── .env.local                       ← never committed
├── .env.example                     ← always committed
│
├── docs/
│   ├── The_Blueprint.md             ← project spec, phases, RBAC, decision log
│   ├── design-dna.md                ← full design reference
│   └── The_Rules.md                 ← 50+ coded rules across 8 sections
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

**Phase 0 — Complete (2026-05-26)**

Foundation scaffolded. All 14 items from the Phase 0 checklist are in place.

**Phase 1 — Complete (2026-05-26)**

Profiles system built. User creation flow live.

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table, RLS, `get_user_role()` / `get_user_domain()` helpers, `on_auth_user_created` trigger, `profile_audit_log` table + trigger
- `src/lib/supabase/admin.ts` — service-role client (user creation only)
- `src/lib/types/database.ts` — `Profile`, `UserRole`, `AppDomain`, `ActionResult`
- `src/lib/constants/roles.ts` — `USER_ROLES`, `ROLE_LABELS`
- `src/lib/constants/domains.ts` — `APP_DOMAINS`, `DOMAIN_LABELS`
- `src/lib/validations/profile-schema.ts` — create/update/auth/deactivate schemas
- `src/lib/services/profiles-service.ts` — all profile DB queries
- `src/lib/actions/profiles.ts` — `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive`
- Dashboard layout: `src/app/(dashboard)/layout.tsx`
- Sidebar + TopBar: `src/components/layout/`
- Admin user list: `GET /admin/users`
- Create user form: `GET /admin/users/new`

**Phase 2 — Complete (2026-05-27)**

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

**Phase 3 — Complete (2026-05-27)**

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

## When in Doubt

1. Check `docs/design-dna.md` for the full spec on any section.
2. Check `src/styles/design-tokens.css` for the exact token value.
3. Check `src/lib/constants/` for domain names, roles, and status values.
4. Never invent a value. If it doesn't exist in the token system, ask before adding it.
