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
6. [Phase 0 — Project Setup](#6-phase-0--project-setup)
7. [Folder Structure](#7-folder-structure)
8. [Codebase Rules](#8-codebase-rules)
9. [Decision Log](#9-decision-log)

---

## 1. What We Are Building

Indulge OS is a production-grade internal operating system for all Indulge teams. It is not a prototype. It is not an iteration of the previous codebase. It is a clean foundation built to last decades.

The previous build had too many things wired together in the wrong ways. This build starts from zero with explicit rules, clear boundaries, and no shortcuts.

**The architecture is modular by design.** The base layer — Eia — is the OS every team member logs into. On top of it, domain-specific modules load for the right people. Adding a new module never touches the base layer.

---

## 2. Tech Stack

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

## 3. Naming System

| Name    | What It Is                                                |
| ------- | --------------------------------------------------------- |
| **Eia** | The OS — the platform every Indulge team member logs into |
| **Lia** | The agentic AI model that lives inside Eia                |
| **Gia** | The CRM module — loads for the Onboarding domain          |
| **Sia** | The Concierge module — loads for the Concierge domain     |

---

## 4. Roles & Domains

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

---

## 5. Access Control Model

Roles are domain-scoped. A user has one role inside one domain. `founder` and `admin` are the only roles with multi-domain access — stored as `domain_id = *`.

When a user genuinely needs to see data outside their domain, a **grant** is issued — not a role change.

### Example

```
John's role:    Manager in Finance          ← permanent, role-based
John's grants:  read access to Tech         ← explicit, expires 2026-03-01
                read access to Concierge    ← explicit, expires 2026-03-01
```

John is still a Finance Manager. He has temporary, auditable, expiring visibility into two other domains.

### Key tables

```sql
-- Permanent role assignment
user_roles (
  user_id,
  role,        -- agent | manager | founder | admin | guest
  domain_id    -- specific domain, or * for founder/admin
)

-- Temporary cross-domain access
domain_access_grants (
  user_id,
  domain_id,
  permissions,   -- read | write
  granted_by,
  expires_at
)
```

### Access check logic

```
has_access = user has role-permission in domain
          OR user has an active, unexpired grant for domain
```

**No "global" role for regular users.** Every cross-domain access must have a name, a grantor, and an expiry.

---

## 6. Phase 0 — Project Setup

**Goal:** A Next.js project that runs locally. All tools installed and configured. A blank page loads. Nothing else.

**Done when:** `pnpm dev` runs without errors. Supabase is connected. Environment variables are set. Repo is on GitHub. CI runs on push.

---

### Step 1 — Create the Next.js project

---

### Step 2 — Install all dependencies

---

### Step 3 — Supabase project

---

### Step 4 — Environment variables

---

### Step 5 — Supabase client files

Three files. One for each context. Never instantiate the Supabase client anywhere else.

**`src/lib/supabase/client.ts`** — browser / client components

**`src/lib/supabase/server.ts`** — server components and server actions

## **`src/middleware.ts`** — session refresh on every request

### Step 6 — Folder structure

```
eia/                                   ← repo root
├── CLAUDE.md                          ← Root rules for Claude Code. Read before anything.
├── .cursorrules                       ← Same content as CLAUDE.md. Cursor reads this.
├── .env.local                         ← Never committed
├── .env.example                       ← Always committed
│
├── docs/
│   ├── The_Blueprint.md               ← This file. Single source of truth.
│   └── The_Rules.md                   ← The 19 non-negotiable codebase rules.
│
├── src/
│   ├── app/
│   │   ├── CLAUDE.md                  ← App Router rules. Routes, pages, auth gate.
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── update-password/
│   │   ├── (dashboard)/               ← All authenticated pages
│   │   ├── api/
│   │   │   └── webhooks/              ← Inbound webhooks only. No other API routes.
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                   ← Redirects to /login or /dashboard
│   │
│   ├── components/
│   │   ├── CLAUDE.md                  ← Component rules. Display-only. Token usage.
│   │   ├── ui/                        ← shadcn primitives. Zero feature imports.
│   │   └── layout/                    ← Sidebar, TopBar
│   │
│   ├── lib/
│   │   ├── CLAUDE.md                  ← Action patterns. Util rules. Type conventions.
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   ├── actions/                   ← All server actions live here
│   │   ├── services/                  ← All DB queries live here
│   │   ├── validations/               ← All Zod schemas, mirroring actions/
│   │   ├── constants/                 ← Typed enums: domains, roles, statuses
│   │   ├── utils/
│   │   │   ├── sanitize.ts
│   │   │   ├── phone.ts
│   │   │   └── dates.ts
│   │   └── types/
│   │       ├── database.ts            ← Auto-generated from Supabase
│   │       └── index.ts               ← Shared types
│   │
│   └── middleware.ts
│
└── supabase/
    ├── migrations/
    │   └── CLAUDE.md                  ← Migration rules. RLS checklist. Never edit after run.
    └── config.toml
```

**The CLAUDE.md files are not optional.** They are the first thing Claude Code reads when working in each area of the codebase. They contain the rules specific to that folder. The root `/CLAUDE.md` and `/.cursorrules` contain a summary of the 19 rules, the server action pattern, the RLS checklist, the never-do list, and references to `/docs/`.

Every Cursor session ends with an instruction to update the relevant CLAUDE.md if anything has changed.

---

### Step 7 — Shared utilities

**`src/lib/utils/sanitize.ts`**

**`src/lib/utils/phone.ts`**

**`src/lib/utils/dates.ts`**

---

### Step 8 — Security headers

**`next.config.ts`**

---

### Step 9 — Verify it runs

---

## 7. Folder Structure Reference

See Step 6 above. The structure is fixed. Do not reorganize it without a Decision Log entry.

---

## 8. Codebase Rules

Non-negotiable. Changing any rule requires a Decision Log entry with justification.

| #   | Rule                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Authorization reads only from `public.profiles`. JWT claims are never trusted.                                                                                                            |
| 2   | All `SECURITY DEFINER` functions must have `SET search_path = public`.                                                                                                                    |
| 3   | Log and activity tables are append-only. No `UPDATE` or `DELETE`. Ever.                                                                                                                   |
| 4   | `components/ui/` imports types only — never functions, actions, or hooks from feature code.                                                                                               |
| 5   | Client components may only mutate data via Server Actions. No direct DB calls from client-side code.                                                                                      |
| 6   | `sanitizeText()` lives in `lib/utils/sanitize.ts`, is the single canonical implementation, and must trim, strip HTML tags, and normalize whitespace. Never inline sanitization.           |
| 7   | All phone numbers are stored as E.164. `normalizeToE164()` must be called on every phone field before any DB write. It lives in `lib/utils/phone.ts`.                                     |
| 8   | Every new table must have RLS enabled in its migration. A migration with no RLS policy must not pass CI.                                                                                  |
| 9   | One table, one responsibility. No mixing domains in one table.                                                                                                                            |
| 10  | One Supabase client, one place. Instantiated only in `lib/supabase/client.ts`, `server.ts`, and `middleware.ts`. Never instantiate elsewhere.                                             |
| 11  | Any async work exceeding 3 seconds or requiring retry logic must use Trigger.dev. Route handlers handle only fast, synchronous responses.                                                 |
| 12  | Lia never sends raw UHNI PII to any external AI API. Data is pseudonymized before leaving the vault. Pseudonymization is reversible only by a vault function — never client-side.         |
| 13  | All Lia agentic actions require explicit agent approval before execution. Lia proposes — agents decide. Every approved action is logged with the approver, the proposal, and a timestamp. |
| 14  | No magic strings. Domain names, role names, and status values live in `lib/constants/` as typed enums. Never hardcoded inline.                                                            |
| 15  | Every Server Action validates input with a Zod schema before touching the DB. No exceptions.                                                                                              |
| 16  | Feature folders own their code. `features/finance/` never imports from `features/concierge/`. Cross-feature data flows through `lib/` only.                                               |
| 17  | All DB queries go through service functions in `lib/services/`. No raw Supabase calls in components or actions.                                                                           |
| 18  | Error handling is typed. Server Actions return `{ data, error }` — never throw. Components must handle both branches explicitly.                                                          |
| 19  | Never edit a migration that has already run in production. Write a new one.                                                                                                               |

---

## 9. Decision Log

Every architectural decision that deviates from or extends the rules above must be logged here before implementation.

| Date | Decision | Chosen | Why |
| ---- | -------- | ------ | --- |

---

_The Blueprint — Indulge OS. Last updated: 2026-05-26._
