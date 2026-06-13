# Serene

Internal operating system for Indulge Global. Private repository — not public documentation.

---

## 1. What This Is

Serene is the internal operating system for Indulge Global — a production foundation, not a prototype — built to serve India's premier luxury concierge brand. Every team member logs into Serene as the single entry point to their work. The architecture is modular: the base layer (Serene) does not change when a new domain module is added. Domain modules load on top for the right people; cross-cutting AI presence (Elaya) and CRM (Gia) attach to the OS without rewriting the shell.

---

## 2. The Name System

| Name    | What It Is                                                |
| ------- | --------------------------------------------------------- |
| **Serene** | The OS — the platform every Indulge team member logs into |
| **Elaya** | The agentic AI model that lives inside Serene                |
| **Gia** | The CRM module — loads for the Onboarding domain          |
| **Sia** | The Concierge module — loads for the Concierge domain     |

---

## 3. Tech Stack

| Layer           | Tool                  | Version / Notes           |
| --------------- | --------------------- | ------------------------- |
| Framework       | Next.js App Router    | 16                        |
| Language        | TypeScript            | 5 — strict mode, no `any` |
| Styling         | Tailwind CSS          | v4                        |
| UI primitives   | shadcn/ui             | latest                    |
| Database        | Supabase (PostgreSQL) | 17                        |
| Auth            | Supabase Auth         | —                         |
| Realtime        | Supabase Realtime     | —                         |
| Animation       | Framer Motion         | 11                        |
| Forms           | React Hook Form + Zod | —                         |
| Async jobs      | Trigger.dev           | —                         |
| Deployment      | Vercel                | —                         |
| Package manager | pnpm                  | —                         |

---

## 4. RBAC — Roles & Domains

### Roles

Stored in the database. Used in all authorization logic. Never derived from JWT claims.

| Role      | Description                                                                             |
| --------- | --------------------------------------------------------------------------------------- |
| `agent`   | Base-level employee — works tasks, leads, and tickets                                   |
| `manager` | Oversees team, approves actions, reviews performance                                    |
| `founder` | Full visibility and editability across all domains                                      |
| `admin`   | User management, system configuration, root-level edit access on every module and field |
| `guest`   | Limited read access                                                                     |

### Domains

| Domain       | Module | Data Scope       |
| ------------ | ------ | ---------------- |
| `concierge`  | Sia    | Concierge data   |
| `onboarding` | Gia    | Onboarding data  |
| `finance`    | —      | Finance data     |
| `marketing`  | —      | Marketing data   |
| `tech`       | —      | Tech data        |
| `shop`       | —      | Shop data        |
| `b2b`        | —      | Indulge B2B data |
| `house`      | —      | House data       |
| `legacy`     | —      | Legacy data      |

### Cross-domain access

Roles are domain-scoped: one role, one domain per user. `founder` and `admin` are the only roles with cross-domain access. **There is no grants table** — when someone genuinely needs visibility outside their domain, an admin temporarily changes their domain (operational, audited via `profile_audit_log`). Full model: `docs/architecture/auth-and-rbac.md`.

---

## 5. Phase Status

Source of truth: `docs/changelog.md`. Only work listed there as shipped is marked complete below.

### Phase 0 — Foundation (2026-05-26)

- Next.js 16 App Router scaffolded; Supabase connected; Tailwind v4; shadcn/ui
- `design-tokens.css` — all CSS variables; five themes (Earth, Air, Water, Fire, Cosmos)
- Supabase client files: `client.ts`, `server.ts`, `middleware.ts`
- Auth pages: login, forgot-password, update-password
- Shared utilities: `sanitize.ts`, `phone.ts`, `dates.ts`, `numbers.ts`, `chart-tokens.ts`, `scroll.ts`

### Phase 1 — Profiles system + user creation (2026-05-26)

- Migrations: `user_role` / `app_domain` enums; `profiles` table, RLS, role/domain helpers, `on_auth_user_created` trigger, `profile_audit_log`
- Server actions: `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive`
- Dashboard layout; Sidebar; TopBar
- `GET /admin/users`, `GET /admin/users/new`

### Phase 2 — User management + agent routing (2026-05-27)

- `agent_routing_config` table; auto-created on `role=agent` via trigger
- `toggleAgentRouting` server action (manager/admin/founder)
- `inviteUser` — magic-link invite via `inviteUserByEmail`
- `UsersTable` with client-side filters; `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`
- `GET /admin/users/[id]` — user detail page

### Phase 3 — Gia: lead ingestion, assignment, lead list (2026-05-27)

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` with full RLS
- Webhook `POST /api/webhooks/leads` — Bearer auth + in-memory rate limiting
- `ingestLead()` — validate → sanitize → resolve domain → round-robin assign → insert → log activities
- `LeadsTable` — role-aware list; Sidebar Leads nav link

### Phase 4 — Lead dossier + full lifecycle (2026-05-27)

- `GET /leads/[id]` — parallel fetches; page-level access gate
- `LeadInfoCard`, `StatusActionPanel`, `CalledModal`, `AgentScratchpad`
- `LeadNotesSection`, `LeadJourneyTimeline`, `LeadActivityLog`, `LeadDossierTasksAsync`

### Raw payload logging + error log (2026-05-27)

- Migration 0004: `lead_raw_payloads` — immutable JSONB log; admin/founder SELECT only
- Migration 0005: `ingestion_error` column for failed ingestions
- `adaptMeta` — three payload shapes (Meta native, Pabbly, flat keys)
- `GET /error-log` — admin/founder errored payloads page

### Phase 5 — Profile page + theme system (2026-05-27)

- `GET /profile` — avatar, details, theme, password, notifications
- `ThemeSelector` — five swatches; synchronous `data-theme` before paint (no flash)
- `PasswordChangeForm` with re-auth; `NotificationPreferences` stubbed
- Sidebar footer → profile link with active state

### Post-Phase 5 hardening (2026-05-27)

- Atomic round-robin via `get_next_round_robin_agent()` (Migration 0007)
- Lead deduplication by phone; `duplicate_submission` activity (Migration 0008)
- `personal_details` JSONB on `leads`; `PersonalDetailsCard` on dossier (Migration 0009)
- Activity log assignee name resolution; improved copy for `lead_created` / `agent_assigned`

### Phase 6 — Modal primitive (2026-05-27)

- `src/components/ui/modal.tsx` — shared chrome, Framer Motion enter/exit, a11y
- `CalledModal`, `ConfirmModal`, `ReasonModal` refactored to compose `Modal`

---

## 6. What Is Planned (Not Built)

- **Elaya (AI presence)** + **client records (post-won flow)** — current focus; see `docs/01-vision.md`
- **WhatsApp AI chatbot** — auto lead engagement until the agent takes over; see `docs/integrations/whatsapp-gupshup.md` (the WhatsApp *page* shipped — `docs/pages/whatsapp.md`)
- **Sia (Concierge module)** — planned; not started — `docs/modules/sia.md`
- **Call intelligence / helpdesk** — spec complete — `docs/modules/call-intelligence.md`

> This section is a snapshot; `docs/changelog.md` (history) and `docs/01-vision.md` (roadmap) are the sources of truth.

---

## 7. Folder Structure

```text
serene/
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

## 8. Local Setup

```bash
pnpm install
cp .env.example .env.local
# Fill in Supabase keys
pnpm dev
```

Never commit `.env.local`. Required environment variables are documented in `.env.example`.

---

## 9. Authority Files

| File | Path | Contents |
| ---- | ---- | -------- |
| Docs index | `docs/README.md` | The map of all documentation + reading orders |
| Design DNA | `docs/design/DESIGN-DNA.md` | The design constitution |
| The Rules | `docs/rules/The_Rules.md` | Coded non-negotiable engineering rules + Decision Log |
| Changelog | `docs/changelog.md` | Single source of truth for what shipped and when |
| Gia module | `docs/modules/gia.md` | The CRM module: lifecycle, end-to-end flow, SLA engine |
| Architecture | `docs/architecture/overview.md` | System map; database/auth/caching/migrations live beside it |

Command-layer rules for day-to-day development live in `/CLAUDE.md` and `/.cursorrules` (identical).

---

## 10. Key Rules (Short Version)

- No `any` in TypeScript; strict mode is enforced
- No hardcoded colours — every value is a CSS token from `src/styles/design-tokens.css`
- Supabase client instantiated in exactly three places: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- All DB queries in `src/lib/services/`, all mutations in `src/lib/actions/`
- RLS is enabled on every table — no exceptions

For the full rule set, see `docs/rules/The_Rules.md` and `/CLAUDE.md`.
