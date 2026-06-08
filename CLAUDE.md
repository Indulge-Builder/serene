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
src/lib/utils/lead-health.ts        ← computeLeadHealth() — pure function, no DB imports; LeadHealth type
src/lib/utils/export.ts             ← buildCSV(), buildLeadsCSV(), buildXLSXWorkbook(), triggerBrowserDownload() — CLIENT-SIDE ONLY; never import from server actions or services
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
NEVER  fire an outward network send (WhatsApp/Gupshup, any external fetch that must complete) as bare void fn().catch() in a route or server action — Vercel freezes the lambda on response flush and orphans it. Use after() from next/server and await the send inside. See Pattern Notes.
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
│   │   │   ├── admin.ts             ← service-role client (only place)
│   │   │   └── middleware.ts        ← session refresh helper (only place)
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
│   └── proxy.ts                     ← Next.js 16 proxy (session refresh; replaces middleware.ts — there is NO src/middleware.ts)
│
└── supabase/
    ├── migrations/
    │   └── CLAUDE.md                ← migration rules. RLS checklist. never edit after run.
    └── config.toml
```

---

## Phase Status

> **Full build history lives in `docs/changelog.md` (chronological, single source of truth) and `docs/master.md §7` (phase table) + `§9` (migration index). This section is a pointer, not a duplicate — do not re-expand the per-feature history here.** When you ship something meaningful, add it to `docs/changelog.md`, not to this file.

| Phase / Module | Status | Headline |
| --- | --- | --- |
| 0–2 Foundation | ✅ | Design tokens, auth, `profiles`, `get_user_role()`/`get_user_domain()`, admin user mgmt, agent routing |
| 3–4 Gia leads | ✅ | Ingestion (Meta/Pabbly), round-robin, lead list + dossier, full lifecycle |
| 5 Profile/Theme | ✅ | Profile page, 5 themes, zero-flash theme script |
| 6 Primitives | ✅ | Modal primitive, Suspense-split filters, column picker, Add Lead |
| 7 Dashboard | ✅ | Bento grid (5 widgets), `useDashboardLayout`, RSC consolidation |
| 8–10 Performance/Campaigns | ✅ | Performance (agent/manager/founder), Campaign analytics, benchmarks, SLA engine, Settings |
| OS Tasks | ✅ | `task_groups`, `task_remarks`, `SubTaskModal`, group workspace, tags, checklist, Gia tab |
| WhatsApp | ✅ | Gupshup v1, conversations/messages, `/whatsapp`, 4 notification templates |
| Deals | ✅ | `public.deals` first-class table (0072–0074), walk-in creation |
| Attribution refactor | ✅ | `source`/`medium`/`attribution jsonb` (0065); `leads.city` column (0066) |
| Domain route authorization | ✅ | `canAccessRoute` + `DOMAIN_ROUTE_MAP` + layout guard + Sidebar filter |

**Current focus:** Lia AI presence, client records (post-won flow).

**UI primitive rule (kept here because it's a live convention):** `Button` (CSS hover, zero Framer cost) for form submits and modal actions; `MotionButton + MOTION_BUTTON_DEFAULTS` for standalone primary CTAs that are pressed repeatedly (`AddLeadButton`, `TasksShell` header). Never add `MotionButton` to a form submit. Never merge the two.

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

### Outward network sends (WhatsApp/Gupshup) — `void fetch().catch()` is a bug on Vercel, use `after()` + `await`

On Vercel the serverless function is **frozen/killed the instant the HTTP response (or server-action
return) is flushed.** Any `void fetch().catch()` still in flight at that moment is orphaned —
the request to the external service is severed mid-execution and any follow-up work (e.g. a log
insert) never runs. This is silent, intermittent loss: a send survives only when the lambda
happens to stay warm, so a fraction get through and the rest vanish **with no error and no log row.**

This bit the WhatsApp notification pipeline (2026-06-08): every code path used `void send().catch()`
fire-and-forget. Most notifications were lost; the `whatsapp_notification_logs` table showed only
the lucky survivors, all `delivered: true` — the failures left no row at all (missing rows, not
error rows).

**The rule for any outward network send that must complete:**

```ts
import { after } from 'next/server';

// ✅ Correct — response flushes immediately; lambda stays alive until the send settles
after(
  notifyLeadAssigned({ ... }).catch((err) =>
    console.error('[module] notify failed (non-fatal):', err),
  ),
);
return NextResponse.json({ ... }, { status: 201 });

// ✗ Wrong — orphaned when the lambda freezes after the response; lost on Vercel
void notifyLeadAssigned({ ... }).catch(() => {});
return NextResponse.json({ ... }, { status: 201 });
```

- `after()` is the **only** construct that satisfies both constraints: a bare `await` would delay
  the response by the send time; a bare `void` loses the work on freeze.
- The function passed to `after()` (or its internals) **must actually `await`** the send — wrapping
  a function that itself uses `void` inside defeats the entire purpose. `notifyLeadAssigned` awaits
  its Gupshup sends via `Promise.allSettled`; the `logNotification` calls in each send's `finally`
  are `await`-ed so the log row is durably written before the send resolves.
- Routes whose `after()` carries network sends export `maxDuration` (60s on the lead + whatsapp
  webhooks) so the lambda isn't killed before the send completes.
- Code already running inside an `after()` (e.g. `processInboundMessage` under the whatsapp route)
  uses a plain `await` — a `void` there detaches the send from the tracked chain and freezes it out.

Reference implementations: `notifyLeadAssigned` (`src/lib/services/lead-assignment-notify.ts`),
the 4 call sites in `src/app/api/webhooks/leads/route.ts`, `src/lib/actions/leads.ts`
(`assignLead`, `createManualLead`), `src/lib/services/whatsapp-ingestion.ts`. Full rule in
`src/lib/actions/CLAUDE.md` and `src/lib/services/CLAUDE.md`.

---

### Confirm dialog stacking — `--z-overlay` backdrop, `--z-modal` panel

Standalone confirm dialogs (not nested inside another modal) use:

- Backdrop: `--z-overlay` (50)
- Panel: `--z-modal` (60)

This keeps the backdrop below the panel. **`--z-modal-overlay` (61) is reserved for the backdrop of a nested modal** that itself sits above an existing `--z-modal` surface (e.g. `AssigneePickerModal` above `SubTaskModal`).

The bug of backdrop covering the panel happens when `--z-modal-overlay` (61) is accidentally used for a standalone dialog backdrop — it then sits above the panel at `--z-modal` (60) and blocks all clicks.

---

### Framer Motion `transform` + `position: fixed` — portal escape

Framer Motion entrance animations apply CSS `transform` to the animated element. A `transform` on an ancestor creates a new **containing block** for `position: fixed` descendants and a new **stacking context**. This means:

- `position: fixed` children are no longer fixed to the viewport — they are fixed to the transformed ancestor's paint area.
- `z-index` on the fixed children is evaluated within the ancestor's stacking context, not the document root.

**Result:** dialogs and dropdowns rendered inside a `motion.div` card appear clipped, washed out, or unresponsive even with correct z-index values.

**Fix:** portal overlays and dropdowns to `document.body` using `createPortal`. Capture the trigger element's position with `getBoundingClientRect()` at open time and position the portaled panel with `position: fixed` from `document.body`.

**Reference implementations:**

- `GroupTasksTab.tsx` — ⋯ dropdown and confirm delete dialog both portaled
- `GroupTaskWorkspace.tsx` — confirm delete dialog portaled (same bug, same fix)
- `LeadsFilters.tsx` — date range panel portaled (canonical reference)
- `TasksFilters.tsx` — Gia date range panel portaled (matches LeadsFilters pattern)

---

## When in Doubt

1. Check `docs/design-dna.md` for the full spec on any section.
2. Check `src/styles/design-tokens.css` for the exact token value.
3. Check `src/lib/constants/` for domain names, roles, and status values.
4. Never invent a value. If it doesn't exist in the token system, ask before adding it.
