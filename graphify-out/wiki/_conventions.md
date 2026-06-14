# Conventions — the patterns that bite

> The cross-cutting laws, indexed by **where they apply** in a task. These are the same rules as the
> root `CLAUDE.md` 12 Rules and `docs/rules/The_Rules.md`, restated as "if you are doing X, this is
> the rule." Read this before touching any server action, outward send, cache, or animation.

Back to [index](index.md).

---

## 1. Server actions

Every server action in `src/lib/actions/`:

1. **Zod first line.** Validate the input before anything else (Rule 02). Never let a raw Zod default
   message reach the UI — map through `lib/validations/form-errors.ts`.
2. **`requireProfile(roles?)` is the session guard** (Rule 09 / A-18). It is the first thing after Zod
   for any session-based action. Returns `{ ok: true, profile }` or `{ ok: false, result }`. **Never**
   hand-roll `getCurrentProfile()` + role checks. Exceptions (sla.ts, loginAction, the 4 parallel-fetch
   task actions) are listed in `src/lib/actions/CLAUDE.md` — do not add to that list casually.
3. **Return `{ data, error }`, never throw, never void** (Rule 10). The component handles both branches.
4. **No raw Supabase in the action** (Rule 03). All queries go through `lib/services/`. The action
   orchestrates: guard → call service/core → invalidate cache → `revalidatePath` → `after(send)`.
5. **Access check after the guard.** `requireProfile` proves *who* you are; the action still checks
   *whether this profile may touch this row* (agent: `assigned_to` match; manager: domain match;
   admin/founder: unrestricted).

## 2. Services & data access

- **One Supabase client per context** (Rule 05): `lib/supabase/client.ts` (browser), `server.ts`
  (RSC/actions), `admin.ts` (service-role; jobs + scope-arg'd reads), `middleware.ts` (refresh). Never
  instantiate elsewhere.
- **Never import a value symbol from `lib/services/` into a `'use client'` component** (A-15) — it pulls
  `next/headers` into the client bundle and hard-errors. Go through a Server Action in `lib/actions/`.
- **`sanitizeText()` on every user text, `normalizeToE164()` on every phone, before DB write** (Rule 06).
- **Log & activity tables are append-only** (Rule 08): no UPDATE/DELETE, ever. (`lead_notes`,
  `lead_activities`, `task_remarks`, `task_audit_log`, `whatsapp_notification_logs`, `elaya_messages`.)
- **Untyped query results** (joined selects, untyped RPCs) cross the boundary via `mapRows<TRow,TOut>`
  (`lib/utils/rows.ts`) — never a new `as Record<string, unknown>` cast (Q-18).

## 3. Outward network sends → `after()`

**The single most expensive mistake in this codebase.** On Vercel the lambda is frozen the instant the
HTTP response / action return is flushed. A `void fetch().catch()` still in flight is **orphaned and
silently lost** — no error, no log row, only the lucky warm-lambda survivors get through.

```ts
import { after } from 'next/server';
// ✅ response flushes immediately; lambda stays alive until the send settles
after(notifyLeadAssigned({ ... }).catch(err => console.error('[module] notify failed (non-fatal):', err)));
return NextResponse.json({ ... }, { status: 201 });

// ✗ orphaned on freeze — lost on Vercel
void notifyLeadAssigned({ ... }).catch(() => {});
```

- The function inside `after()` **must actually `await`** the send (wrapping a `void`-using function
  defeats it). `notifyLeadAssigned` awaits its Gupshup sends via `Promise.allSettled`.
- Routes carrying sends in `after()` export `maxDuration` (60s on lead + whatsapp webhooks).
- Code already running *inside* an `after()` (e.g. `processInboundMessage`) uses a plain `await` — a
  `void` there detaches from the tracked chain. Rule: **A-16.**
- Reference: `lead-assignment-notify.ts`, `api/webhooks/leads/route.ts`, `actions/leads.ts`.

## 4. Redis invalidation (P-08)

Every `redis.del` in a server action must be **`await`-ed inside a `try/catch` that logs a
`[module-action]`-prefixed warning**, and must complete **before** `revalidatePath`. A fire-and-forget
`void redis.del().catch()` races the revalidation: a request can repopulate Redis from the DB, then the
late del evicts the *fresh* entry and extends the stale window.

- **Lead actions never hand-assemble a del block** — call
  `invalidateLeadCaches(site, { leadId, slug, domain }, scope)` (`lib/services/lead-cache.ts`). Scope
  flags: `row` (dual-key del — both `leadRowSlug(slug)` and `leadRowId(leadId)`), `notes`, `activities`,
  `lists` (version INCRs), `dashboard`.
- **Dual-key invariant:** a lead row is cached under `leadRowSlug(slug)` (primary, every dossier load)
  AND `leadRowId(leadId)` (UUID fallback). Deleting only `leadRowId` is a silent no-op on normal traffic.
- Dashboard *volume* keys embed an ISO range a del can't enumerate — freshness is TTL-only (120s), by design.

## 5. Caching: `unstable_cache` vs React `cache()`

- **A service that calls `createClient()` (reads `cookies()`) can NEVER be wrapped in `unstable_cache`**
  (P-09) — Next.js throws at runtime. Use React `cache()` for per-request memoisation instead.
- When `unstable_cache` *is* valid (admin-client query), **the key must include the caller's domain**
  if the query is domain-scoped (Q-16) — else a manager in `concierge` gets a `finance` cache hit.
- Revalidation in actions uses `revalidateTag(tag, { expire: 0 })` (Next.js 16 requires the 2nd arg).
- Reference: `getGroupTasks` in `tasks-service.ts`.

## 6. Z-index, portals & Framer Motion

- **Only `--z-*` scale values** for z-index — never a raw number.
- A Framer Motion entrance applies `transform` to the element, which creates a containing block +
  stacking context. `position: fixed` descendants (dropdowns, dialogs) then anchor to the card, not the
  viewport — they clip/wash out. **Fix:** anchored panels use `usePortalAnchor()` + `<FloatingPanel>`;
  centered confirms use `<ConfirmDialog>`. Both portal to `document.body`. Never re-implement inline.
- **Standalone confirm z-index:** backdrop `--z-overlay` (50), panel `--z-modal` (60). `--z-modal-overlay`
  (61) is reserved for a nested-modal backdrop only. Never `window.confirm`; compose `<ConfirmDialog>`.

## 7. Async work → Trigger.dev

- **>3s or needs retry → Trigger.dev** (Rule 11). Post-response sends → `after()`. Nothing heavier in route handlers.
- **Config is read per run, never module-cached** — `sla_policies`, `revival_policies`, `llm_providers`,
  `elaya_settings` are all re-read inside the job so an edit applies on the next fire with no deploy.
- **Idempotency keys** make re-runs safe: cadence ticks key on `(leadId, ruleCode, IST date)`; task
  reminders tag `task-reminder-${taskId}`; the revival sweep relies on a partial UNIQUE index +
  one-open-candidate guard.
- The 3 scheduled/queued tasks: `src/trigger/lead-sla.ts`, `task-reminders.ts`, `lead-revival.ts`.

## 8. Motion & colour (design)

- **Every colour is a CSS variable** (Rule 01) — no hex, no `text-gray-*`/`bg-white`. Follow the
  Surface Contract (see [design-system.md](design-system.md)).
- **Only animate `transform` and `opacity`** — never width/height/padding/margin. Expand/collapse
  composes `<CollapseReveal>` (grid-template-rows 0fr↔1fr), never `height: 0↔auto`.
- **`import { m as motion } from 'framer-motion'`** — never the bare `{ motion }` namespace
  (`MotionProvider`'s strict `LazyMotion` throws on it). Rule A-17.
- **No `backdrop-filter`/blur** except the 3 sanctioned surfaces (TopBar, mobile sidebar overlay,
  command palette). No one-edge coloured border as a status indicator — use pills/dots/badges.
- Max `--weight-semibold` (600); never `font-bold` (700).

## 9. Changelog (Rule 12)

Every meaningful change — feature, fix, migration, package, refactor — gets an entry in
`docs/changelog.md` before or alongside the code. It is the single source of truth. (`The_Changelog.md`
is deleted; never write to it.)

## 10. Migrations

- Every new table has **RLS enabled in its migration** (Rule 07). Append-only tables get no UPDATE/DELETE policy.
- **Never edit a migration after it has run.** Add a new one. (See `supabase/migrations/CLAUDE.md`.)
- Index: `docs/architecture/migrations.md`. Latest is `0120_push_subscriptions` (revival is `0119`).
