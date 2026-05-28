# Eia — Tech Debt

Tracked violations and known shortcuts that must be resolved when the relevant file is next touched for any reason.
Do not let these become invisible. Every item here was a deliberate trade-off or a pre-existing issue identified during a later session.

Format per entry:
- **File** — exact path
- **Rule** — which rule it violates
- **What** — precise description of the problem
- **Fix** — exactly what to do
- **Logged** — date identified

---

## Open items

### TD-001 — `src/lib/actions/leads.ts` — Rule A-03 / Rule 04 duplication

- **File:** `src/lib/actions/leads.ts`
- **Rule:** A-03 (all DB queries through `lib/services/` — no raw Supabase in actions), Rule 04 (no duplication)
- **What:** `getCallerProfile()` is defined inline at lines 23–35. It is an exact duplicate of `getCurrentProfile()` exported from `src/lib/services/profiles-service.ts`. The inline version does `select('id, role, domain, full_name')` instead of `select('*')`, but both hit the same table and both return `null` on failure. The local definition adds a raw Supabase call inside an action file, bypassing the services layer.
- **Fix:** Delete the inline `getCallerProfile` function from `leads.ts`. Add `import { getCurrentProfile } from '@/lib/services/profiles-service'`. Replace all `getCallerProfile()` call sites in the file with `getCurrentProfile()`. The return type widens from the slim 4-field object to the full `Profile` — verify no call site depends on the slim shape before removing (all current uses only read `.id`, `.role`, `.domain`, `.full_name` which are present on `Profile`).
- **Logged:** 2026-05-28 (identified during tasks.ts hardening session; same fix already applied to tasks.ts in that session)

### TD-002 — `src/lib/services/tasks-service.ts` — Rule P-07 console.error

- **File:** `src/lib/services/tasks-service.ts`
- **Rule:** P-07 (no `console.log`, `console.error`, or `console.warn` in production — all error logging goes to Sentry only)
- **What:** `console.error('[tasks-service] getGroupTasks RPC error:', error)` at line ~179 (inside `getGroupTasks`). Pre-existing in the original build; not introduced by the RPC refactor.
- **Fix:** Replace with `Sentry.captureException(error, { extra: { context: 'getGroupTasks RPC' } })` once Sentry is wired up. Import `* as Sentry from '@sentry/nextjs'` at the top of the file.
- **Logged:** 2026-05-28

---

## Pattern notes (not debt — rules to carry forward)

### PN-001 — Client components that need lazy or paginated data must call a Server Action

**Established:** 2026-05-28 (during tasks module build; `GroupTasksTab` and `PersonalTasksTab` both had direct service imports that reached `next/headers` and broke the client bundle)

**Rule:** `lib/services/` modules import the server Supabase client, which imports `next/headers`. Any `'use client'` component that imports a value symbol from a service module will pull `next/headers` into the client bundle — a hard build error in Next.js App Router.

**Pattern to follow:**
1. The service function lives in `lib/services/` as normal.
2. A thin server action in `lib/actions/` wraps it: calls `getCurrentProfile()` first, passes `caller.id` to the service, returns `ActionResult<T>`.
3. The client component imports only from `lib/actions/` — never from `lib/services/`.

**S-06 corollary:** The server action must derive `userId` from `getCurrentProfile()` — never accept it as a parameter from the client. Client-supplied identifiers cannot be trusted (Rule S-06).

**`import type` is safe.** Type-only imports from service modules are erased at compile time and do not pull in the module at runtime. Only value imports (`import { fn }`, not `import type { T }`) create the bundle dependency.

**Reference implementations:**
- `getGroupSubtasksAction` / `getPersonalTasksAction` in `src/lib/actions/tasks.ts`

---

## Resolved items

| ID | File | Resolved | Notes |
|----|------|----------|-------|
| — | `src/lib/actions/tasks.ts` | 2026-05-28 | Same `getCallerProfile` duplicate; fixed by switching to `getCurrentProfile` import |
