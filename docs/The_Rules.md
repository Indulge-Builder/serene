# The Rules
### Eia — Non-Negotiable Codebase Laws

> These rules cannot be broken under any circumstances.
> Not for speed. Not for deadlines. Not because it seems harmless.
> If a rule needs to change, it gets a Decision Log entry first.
> A rule changed without a log entry is not a rule change — it is a violation.

---

## Section 1 — Architecture

| # | Rule |
|---|---|
| A-01 | Authorization reads **only** from `public.profiles`. JWT claims are never trusted for permission decisions. |
| A-02 | Server Actions are the **only** path from components to DB mutations. No direct Supabase writes from client components. |
| A-03 | All DB queries go through service functions in `lib/services/`. No raw Supabase calls in components or actions. |
| A-04 | `components/ui/` imports types only — never functions, actions, hooks, or services from feature code. |
| A-05 | Feature folders own their code. `features/finance/` never imports from `features/concierge/`. Cross-feature data flows through `lib/` only. |
| A-06 | UI components are display-only. Zero business logic. Zero DB calls. Zero decisions. |
| A-07 | One table, one responsibility. No mixing domains in one table. |
| A-08 | Every new table has `ALTER TABLE x ENABLE ROW LEVEL SECURITY` in its migration. No exceptions. |
| A-09 | Two-layer security always. RLS enforces at DB level. Server action enforces at code level. Never rely on one layer alone. |
| A-10 | All `SECURITY DEFINER` functions must have `SET search_path = public`. |
| A-11 | Log and activity tables are **append-only**. No `UPDATE` or `DELETE`. Ever. |
| A-12 | All async work exceeding 3 seconds or requiring retry logic runs in Trigger.dev. Never in route handlers. |
| A-13 | Every dashboard route is protected by middleware. No authenticated page renders without a verified session. |
| A-14 | Never edit a migration that has already run in production. Write a new one. |

---

## Section 2 — Security

| # | Rule |
|---|---|
| S-01 | Every Server Action validates input with a Zod schema **before** touching the DB. First line. No exceptions. |
| S-02 | All user-supplied text passes through `sanitizeText()` before any DB write. Lives in `lib/utils/sanitize.ts`. |
| S-03 | All phone numbers stored as E.164. `normalizeToE164()` called on every phone field before any DB write. Lives in `lib/utils/phone.ts`. |
| S-04 | Never spread a raw request body or client-supplied object into a DB insert. Always whitelist fields via Zod schema. |
| S-05 | Never expose raw Postgres errors, stack traces, or Zod validation details to the UI. Log to Sentry server-side. Return a safe, human-readable message to the user. |
| S-06 | Never trust client-supplied IDs without verifying ownership. Always confirm the requesting user has access to the record. |
| S-07 | Sequential integer IDs are never exposed in URLs. UUIDs only. |
| S-08 | Sensitive data never appears in URL query parameters. |
| S-09 | Auth error messages never reveal whether an email address exists in the system. |
| S-10 | Session tokens, auth codes, and secrets are never written to any log. |
| S-11 | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and any variable ending in `_KEY`, `_SECRET`, or `_TOKEN` are server-only. Never in client code. Prefix with `NEXT_PUBLIC_` only if the value is genuinely public. |
| S-12 | Every webhook endpoint validates its signature before processing the payload. Reject with 401 before reading anything. |
| S-13 | No `dangerouslySetInnerHTML` anywhere. |
| S-14 | Users cannot update their own `role` or `domain`. These fields are server-controlled only. |
| S-15 | No single role can both perform a sensitive action and audit that same action. `admin` and `founder` have distinct, non-overlapping privileges. |
| S-16 | Sensitive privileged operations — role changes, domain changes, profile deactivation — require a second actor to confirm. No one approves their own privilege changes. |
| S-17 | All public-facing routes and webhook endpoints are rate-limited. |

---

## Section 3 — Data & Privacy

| # | Rule |
|---|---|
| D-01 | No raw PII ever reaches Claude, Gemini, or any external AI model. Data is pseudonymized before leaving the vault. Pseudonymization is reversible only by a vault function — never client-side. |
| D-02 | No hard deletes on leads, profiles, notes, or activity logs. Soft-delete with `archived_at` or `deleted_at` timestamps. |
| D-03 | Every lead status change, assignment, reassignment, note addition, domain/role change, and failed authentication attempt is logged to the relevant `*_activities` table. |
| D-04 | Full PII never appears in log messages or Sentry error context. Use record IDs in logs, never names or phone numbers. |
| D-05 | AI prompt contents containing client data are never logged. |
| D-06 | No session tokens or auth codes written to any log or error tracker. |

---

## Section 4 — Performance

| # | Rule |
|---|---|
| P-01 | No `useEffect` for data fetching. Use Server Components or React Query. |
| P-02 | No API routes except `/api/webhooks/`. All data mutations go through Server Actions. |
| P-03 | Any list that can exceed 100 items uses virtual rendering. Never render the full DOM. |
| P-04 | Images in scroll containers use `loading="lazy"`. |
| P-05 | No scroll event listeners for UI logic. Use `IntersectionObserver`. |
| P-06 | Supabase Realtime subscriptions always include a filter. Never subscribe to a full table. Always clean up subscriptions on component unmount. |
| P-07 | No `console.log`, `console.error`, or `console.warn` in production. Use Sentry only. |

---

## Section 5 — Design

| # | Rule |
|---|---|
| V-01 | Every colour is a CSS variable from `src/styles/design-tokens.css`. No hardcoded hex values in components. `text-gray-500` is a violation. `bg-white` is a violation. |
| V-02 | `--theme-accent-fg` on buttons and accent fills — never `--theme-text-inverse`. They are different tokens for different surfaces. |
| V-03 | No animation over 500ms except `liaBreathe` (3s, ambient). |
| V-04 | No `font-bold`. `--weight-semibold` (600) is the maximum weight in Eia. |
| V-05 | No `z-index` values outside the `--z-*` token scale defined in `design-tokens.css`. |
| V-06 | No `backdrop-filter` / blur except on three sanctioned surfaces: TopBar (sticky), mobile sidebar overlay, command palette overlay. |
| V-07 | No mixing radius values within a single component. One radius per component. |
| V-08 | No skeleton shown for less than 150ms. Fast skeletons that flash look more broken than no skeleton. |
| V-09 | Empty states always use Playfair italic heading. Never "No data available." |
| V-10 | Micro labels are always: `text-[10px] font-medium uppercase tracking-[0.12em] text-[--theme-text-tertiary]`. Never deviate. |

---

## Section 6 — Code Quality

| # | Rule |
|---|---|
| Q-01 | No `any` type anywhere. TypeScript strict mode is non-negotiable. |
| Q-02 | No magic strings. Domain names, role names, and status values live in `lib/constants/` as typed enums. |
| Q-03 | Server Actions return `{ data, error }`. Never throw. Never return void. Components handle both branches explicitly. |
| Q-04 | Error messages shown to users come from `lib/validations/form-errors.ts`. Never raw Zod messages. Never "Invalid input." |
| Q-05 | No npm package added without justification documented in `docs/The_Changelog.md`. |
| Q-06 | No production deployment without the security checklist passing. |

---

## Section 7 — File & Naming Conventions

```
Components:   PascalCase.tsx        → TaskCard.tsx, LeadDetail.tsx
Actions:      kebab-case.ts         → personal-tasks.ts, leads.ts
Services:     kebab-case.ts         → leads-service.ts, tasks-service.ts
Hooks:        camelCase.ts (use*)   → useGroupTasks.ts, useLeadStatus.ts
Utils:        kebab-case.ts         → sanitize.ts, dates.ts, phone.ts
Validations:  kebab-case.ts         → lead-schema.ts, task-schema.ts
Constants:    kebab-case.ts         → domains.ts, roles.ts, statuses.ts
Pages:        page.tsx              → Next.js convention, always
Layouts:      layout.tsx            → Next.js convention, always
```

---

## Section 8 — The Absolute Never-Do List

These patterns do not exist in this codebase. Not under pressure, not temporarily, not "just for now."

```
NEVER  hardcode a colour value in a component
NEVER  use text-gray-* or bg-gray-* or bg-white — use tokens
NEVER  write useEffect for data fetching
NEVER  call Supabase directly from a client component for mutations
NEVER  use JWT claims for authorization decisions
NEVER  skip RLS on a new table
NEVER  mix module concerns in one table
NEVER  import one feature module into another
NEVER  put business logic in a UI component
NEVER  use dangerouslySetInnerHTML
NEVER  expose sequential integer IDs in URLs
NEVER  spread raw client input into a DB insert
NEVER  let a Zod default error message reach the user
NEVER  clear a form field on validation error
NEVER  do background work in an API route handler
NEVER  send raw PII to any external AI model
NEVER  log names, phone numbers, or PII — use IDs
NEVER  write console.log in production code
NEVER  edit a migration that has already run in production
NEVER  use z-index values outside the --z-* scale
NEVER  animate layout properties (width, height, padding, margin)
NEVER  use backdrop-blur outside the three sanctioned surfaces
NEVER  use font-bold (700) — semibold (600) is the ceiling
NEVER  show a skeleton for less than 150ms
NEVER  add a package without a changelog entry
```

---

## Decision Log

When a rule must change or an exception must be granted, it is logged here.
A rule changed without a log entry is not a rule change. It is a violation.

| Date | Rule | Old | New | Why | Who |
|---|---|---|---|---|---|
| 2026-05-26 | — | — | Initial rules established | Foundation build | — |
