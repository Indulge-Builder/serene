# System Overview

> **Purpose:** the whole system in one read — what Eia is, the stack, how the services connect, what happens on a request, and where every code-layer concept is documented.
> **Audience:** engineers (new-engineer entry point; non-technical readers start at `../00-for-the-board.md`).
> **Source-of-truth scope:** topology, request flow, cross-page shell features, Realtime registry, client-pattern/hook index, service-file → home-doc map.
> **Last verified:** 2026-06-11.

---

## 1. What Eia is

Eia is the internal operating system for Indulge Global — India's premier luxury concierge
brand, based in Goa. It is a production platform, not a prototype: agents spend 8–12 hours a
day inside it. The architecture is modular — **Eia** is the base OS every team member logs
into; domain modules load on top for the right people, and adding a module never touches the
base layer.

| Name | What it is |
| ---- | ---------- |
| **Eia** | The OS — the shell, auth, theming, navigation, dashboard |
| **Lia** | The agentic AI presence inside Eia (`../modules/lia.md` — in design) |
| **Gia** | The CRM module for the four sales domains (`../modules/gia.md` — live) |
| **Sia** | The Concierge module (`../modules/sia.md` — not started) |

## 2. Tech stack (final — do not propose alternatives)

| Layer | Tool | Notes |
| ----- | ---- | ----- |
| Framework | Next.js 16 App Router | proxy (`src/proxy.ts`), **not** `middleware.ts` |
| Language | TypeScript 5 | strict, no `any` (Q-01) |
| Styling | Tailwind CSS v4 + CSS variables | every colour a token (V-01) |
| UI primitives | shadcn/ui + bespoke library | `src/components/ui/` |
| Database / Auth / Realtime / Storage | Supabase (PostgreSQL 17) | `database.md`, `auth-and-rbac.md` |
| Caching | Upstash Redis | cache-aside (`caching.md`) |
| Async jobs | Trigger.dev SDK v4 (**not** v3) | `../integrations/trigger-dev.md` |
| WhatsApp | Gupshup v1 (BSP) | `../integrations/whatsapp-gupshup.md` |
| Animation | Framer Motion 12 | transform/opacity only |
| Charts | Recharts 3 | always via `useChartTokens()` |
| Forms | React Hook Form + Zod 4 | Zod-first actions (S-01) |
| Icons | lucide-react | exclusive |
| Drag | @dnd-kit | exclusive (Q-07) |
| Export | xlsx (SheetJS) | client-side only (`../pages/leads.md` § Export) |
| Deploy | Vercel | `../operations/deployment.md` |
| Package manager | pnpm | — |

**Not dependencies (never assume them):** React Query / @tanstack, Sentry, any virtualization
library. Data fetching is Server-Components-first with Server-Action-in-`useEffect` for client
widgets (P-01/Q-15); logging is `[module]`-prefixed `console.warn`/`error`; big lists paginate
server-side (P-03).

## 3. The system in words

```text
                         ┌─────────────────────────────┐
  Meta / Pabbly ────────▶│  Vercel — Next.js 16         │◀──────── Browser (agents)
  (lead webhooks)        │  ├ src/proxy.ts (sessions)   │
  Gupshup ──────────────▶│  ├ RSC pages + Server Actions│
  (WhatsApp webhooks)    │  └ api/webhooks/* only       │
                         └──────┬──────────┬────────────┘
                                │          │
              ┌─────────────────┤          ├──────────────────┐
              ▼                 ▼          ▼                  ▼
   Supabase (Postgres 17,  Upstash     Trigger.dev v4     Gupshup v1 API
   Auth, Realtime,         Redis       (SLA timers,       (outbound WhatsApp
   Storage)                (cache-     task reminders)     sends, in after())
                           aside)
```

- **One direction of truth:** Postgres is the source of truth; Redis only caches reads; Realtime
  pushes inserts/updates to subscribed clients; Trigger.dev calls back into server actions.
- **No API routes** except the two webhooks and the auth callback (P-02) — all mutations are
  Server Actions.
- **Outward sends** (Gupshup, any external fetch that must complete) run inside `after()` from
  `next/server` with the send awaited — never `void fetch().catch()` (A-16; Vercel freezes the
  lambda on response flush).
- **Regions:** TODO: verify (Vercel + Supabase + Upstash regions are not recorded in the repo).

## 4. Request flow — one navigation

1. **Proxy** (`src/proxy.ts`): webhook paths bypass; everything else gets a Supabase session
   refresh + `x-pathname` header.
2. **Dashboard layout** (`(dashboard)/layout.tsx`): server guard — no session →
   `redirect('/login')`; `canAccessRoute` domain gate → `redirect('/dashboard')`; zero-flash
   theme `<script>` sets `data-theme` before paint.
3. **Page (RSC):** thin orchestrator — list pages render the filter bar (client) + a
   `<Suspense>`-wrapped async server child that calls `lib/services/` (Redis-first where
   cached). The dossier/dashboard use page-level `Promise.all` + streamed sections.
4. **Interaction:** client components mutate via Server Actions (`Zod → requireProfile →
   service → invalidate caches → revalidatePath`), returning `{ data, error }` (Q-03).
5. **Live updates:** Realtime subscriptions merge inserts into local state (registry below).

## 5. Service files → home doc

All DB access lives in `src/lib/services/` (A-03). Each file's owning doc:

| Service file | Home doc |
| ------------ | -------- |
| `leads-service.ts` | `../pages/leads.md` (+ dossier reads in `../pages/lead-dossier.md`) |
| `lead-ingestion.ts` | `../integrations/lead-ingestion.md` |
| `lead-cache.ts` | `caching.md` |
| `lead-assignment-notify.ts` | `../integrations/whatsapp-gupshup.md` |
| `deals-service.ts` | `../pages/deals.md` |
| `tasks-service.ts` | `../pages/tasks.md` |
| `dashboard-service.ts` | `../pages/dashboard.md` |
| `performance-service.ts` | `../pages/performance.md` |
| `profiles-service.ts` | `../pages/user-management.md` |
| `agent-routing-service.ts` | `../pages/settings.md` |
| `notifications-service.ts` | §7 below |
| `sla-service.ts` | `../modules/gia.md` § SLA Engine |
| `whatsapp-service.ts` | `../pages/whatsapp.md` |
| `whatsapp-api.ts` | `../integrations/whatsapp-gupshup.md` |
| `whatsapp-ingestion.ts` | `../integrations/whatsapp-gupshup.md` |
| `ad-creatives-service.ts` | `../pages/ad-creatives.md` |

(The 17th file is the directory's `CLAUDE.md` — the code-adjacent registry with per-function
exports and Redis TTLs.)

## 6. Realtime registry

Every subscription includes a filter and a mount-scoped `useId()` nonce in the channel name
(P-06/Q-14 — Strict Mode double-mounts collide on bare names), and cleans up via
`supabase.removeChannel(channel)` (never bare `unsubscribe()`).

| Surface | Table | Channel pattern |
| ------- | ----- | --------------- |
| Notification bell (`useNotifications`) | `notifications` | recipient-filtered |
| Task remarks panel | `task_remarks` | `task-remarks-${taskId}-${mountId}` |
| Group workspace | `tasks` (group subtasks) | `workspace-subtasks-${groupId}-${mountId}` |
| WhatsApp conversation list + open thread | `whatsapp_conversations`, `whatsapp_messages` | conversation-filtered |

## 7. Shell features (cross-page, owned here)

- **Sidebar** (`src/components/layout/Sidebar.tsx`) — canvas-dark nav, domain-filtered via
  `canAccessRoute` (never renders inaccessible links), Lia glyph, user footer.
- **TopBar** (`src/components/layout/`) — sticky, one of only three sanctioned
  `backdrop-filter` surfaces, page title, notification bell.
- **In-app notifications** — `notifications` table (`database.md`) + `notifications-service.ts`
  (`getUnreadNotifications`, `markNotificationRead`, `createNotification` — server-actions-only
  caller contract) + `NotificationBell`/`NotificationPanel` + `useNotifications` (state +
  Realtime) + `useNotificationSound` (chime). Notification creation in lead/task actions is
  fire-and-forget — a failed notification never fails the action.
- **Toasts** — `ToastProvider`/`ToastItem` (`src/components/ui/`), singleton `toast` API via
  `useToast`; max 3 in DOM, danger never auto-dismisses. Design spec: DNA §13.
- **Theme system** — 5 themes on `data-theme` (html), stored on `profiles.theme`, zero-flash
  inline script in the dashboard layout. Law: `../design/DESIGN-DNA.md` §1–2.

## 8. Client-side patterns — hook index (`src/hooks/`, 13)

| Hook | One-liner |
| ---- | --------- |
| `useDashboardLayout` | widget order/size per user — localStorage `eia:dashboard:layout:${userId}:v1` |
| `useLeadColumnPreferences` | leads column visibility/order — `eia:leads:columns:${userId}:v1`; THE pattern for any future column picker (Q-08) |
| `useDashboardCohortSync` | global dashboard date-cohort URL ↔ state sync |
| `useWidgetData` | THE dashboard-widget data lifecycle (RSC seed → deps auto-fetch → refetch) |
| `useUrlFilters` | THE URL-param filter plumbing for list filter bars |
| `useDebounce` | the only debounce utility |
| `usePortalAnchor` | THE floating-panel anchoring mechanism (pairs with `<FloatingPanel>`) |
| `useMountOnFirstOpen` | mount latch for `next/dynamic` modals that stay mounted |
| `useNotifications` | notification state + Realtime |
| `useNotificationSound` | inbound chime |
| `useTaskCompletionToggle` | optimistic completion-circle toggle |
| `useCreateTriggerModal` | create-trigger modal open/close + draft |
| `useToast` | re-export of the toast singleton |

Deeper prop/behaviour contracts live code-adjacent in `src/components/CLAUDE.md` and
`src/lib/CLAUDE.md` — the docs tree does not duplicate them.
