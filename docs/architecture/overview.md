# System Overview

> **Purpose:** the whole system in one read — what Serene is, the stack, how the services connect, what happens on a request, and where every code-layer concept is documented.
> **Audience:** engineers (new-engineer entry point; non-technical readers start at `../00-for-the-board.md`).
> **Source-of-truth scope:** topology, request flow, cross-page shell features, Realtime registry, client-pattern/hook index, service-file → home-doc map.
> **Last verified:** 2026-06-15.

---

## 1. What Serene is

Serene is the internal operating system for Indulge Global — India's premier luxury concierge
brand, based in Goa. It is a production platform, not a prototype: agents spend 8–12 hours a
day inside it. The architecture is modular — **Serene** is the base OS every team member logs
into; domain modules load on top for the right people, and adding a module never touches the
base layer.

| Name | What it is |
| ---- | ---------- |
| **Serene** | The OS — the shell, auth, theming, navigation, dashboard |
| **Elaya** | The agentic AI presence inside Serene — read tools + Phase 2 propose/execute writes, SSE chat + WhatsApp staff channel (`../modules/elaya.md` — live) |
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
| Elaya LLM | provider-neutral (Anthropic adapter live) | DB-configured per turn (`../modules/elaya.md`); `routing` job = Haiku |
| Voice transcription | Deepgram Nova-2 (`hi-Latn`) | inbound only, server-only (`transcription-service.ts`) |
| Web Push | VAPID via `web-push` (no SaaS) | second notification channel, Node-only (§7) |
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
   Storage)                (cache-     task reminders,    sends, in after())
                           aside)      revival sweep)

   Other external services (call-out, not in the core navigation path):
   • Elaya LLM provider (Anthropic adapter) — per-turn brain calls + revival/routing judge
   • Deepgram Nova-2 ──────── inbound: voice-note → transcript (server-only)
   • Web Push (VAPID) ─────── outbound: notification fan-out to subscribed devices
```

- **One direction of truth:** Postgres is the source of truth; Redis only caches reads; Realtime
  pushes inserts/updates to subscribed clients; Trigger.dev calls back into server actions.
- **No API routes** except the two webhooks, the auth callback, and two sanctioned carve-outs —
  `/api/elaya/chat` (SSE streaming) and `/api/manifest` (dynamic PWA manifest) (P-02) — all
  mutations are Server Actions.
- **Daily cron:** one Trigger.dev `schedules.task` (`src/trigger/lead-revival.ts`) runs at
  07:30 IST — the Lead Revival silence sweep (`../modules/revival.md`). Project's only cron task.
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
| `intelligence-service.ts` | `../modules/call-intelligence.md` |
| `transcription-service.ts` | §7 below (voice dictation — Deepgram) |
| `push-service.ts` | §7 below (Web Push fan-out — VAPID) |
| `revival-service.ts`, `revival-gate.ts` | `../modules/revival.md` |
| `lead-mutations.ts` | `../modules/elaya.md` (shared write cores — Elaya + UI) |
| `elaya-service.ts`, `elaya-actions-service.ts`, `elaya-whatsapp.ts`, `llm-providers-service.ts` | `../modules/elaya.md` |

(The directory's `CLAUDE.md` is the code-adjacent registry with per-function exports and Redis
TTLs — the authoritative file-by-file index.)

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
  `canAccessRoute` (never renders inaccessible links), Elaya glyph, user footer.
- **PageControls** (`src/components/layout/PageControls.tsx`, `TOP_BAR_ENABLED` in
  `constants/feature-flags.ts`) — the global **notification bell** + admin/founder **domain
  selector**, rendered INLINE on each page's title row (right side, beside the page CTA), so they
  read as part of the page — no separate bar. **Single bell mount** per page render; the Sidebar
  footer bell is gated off when on (no duplicate `notifications:${userId}` Realtime channel). Wired
  on every standard-title-row page (leads/deals/campaigns get the selector; the rest bell-only);
  dashboard rides its canvas header cluster; `/whatsapp` (full-bleed) has no bell. One revert hinge:
  `TOP_BAR_ENABLED` off → no title-row controls, bell back in the Sidebar footer exactly as before.
- **Global domain selector** (`src/components/layout/DomainSelector.tsx`, admin/founder only) —
  composes `FilterDropdown` + `useUrlFilters` to write the same `?domain=` param leads/deals/
  campaigns read, plus a `serene-domain` cookie for cross-page memory. **Reads `param ?? cookie`**
  (post-mount) so its value matches the page after a cross-page nav with no `?domain=` in the URL.
  Pages resolve scope via the ONE shared `resolveDomainParam(searchParams, cookieStore, role)`
  (`utils/domain-scope.ts`, server-only) — it owns param extraction + role gate + cookie fallback:
  admin/founder → `param ?? cookie ?? null`, manager/agent → always `null`. leads/deals/campaigns
  each call it in place of their old inline `parseGiaDomainParam` line; **cookie logic lives only
  there.** NOT a security boundary — it returns `null` for manager/agent regardless of input; the
  service role-gates remain the authority.
- **In-app notifications** — `notifications` table (`database.md`) + `notifications-service.ts`
  (`getUnreadNotifications`, `markNotificationRead`, `createNotification` — server-actions-only
  caller contract) + `NotificationBell`/`NotificationPanel` + `useNotifications` (state +
  Realtime) + `useNotificationSound` (chime). Notification creation in lead/task actions is
  fire-and-forget — a failed notification never fails the action.
- **Web Push (second notification channel)** — `dispatchPush` is fanned out *inside*
  `createNotification` after the in-app row insert, so every existing caller (lead-assignment,
  lead-mutations, SLA, tasks, task-reminders) gets push for free with zero call-site edits.
  `push-service.ts` (server/Node-only — `web-push` throws on Edge) reads the recipient's
  `push_subscriptions` (admin client, one row per device, owner-only RLS), sends to all devices
  in parallel, and **prunes** endpoints answering 404/410 in one batched delete. Non-fatal:
  never throws — the in-app row is the source of truth. Subscribe is gesture-gated
  (`usePushSubscription` → `push.ts` actions → `PushNotificationSettings` on `/profile`); push +
  `notificationclick` handlers live in `public/sw.js`. VAPID env is server-only (S-11) bar the
  public key. Migration 0120.
- **Voice dictation** — `DictationButton` is the single mic → transcribe → editable-draft
  cluster (never auto-sends); four surfaces — Elaya chat, WhatsApp conversation, lead notes,
  CalledModal (plus inbound Gupshup voice notes in `elaya-whatsapp.ts`). Recording via
  `useAudioRecorder` (codec negotiation, unmount discard); transcription is server-only through
  `transcription-service.ts` (Deepgram Nova-2, `hi-Latn`). Audio is transcribed in-memory and
  **never persisted**. Shipped 2026-06-13/14.
- **PWA install + app-icon picker** — `profiles.app_icon` (`'icon-1'..'icon-4'`, mirrors
  `profiles.theme`, rides the existing `updateProfile` action). `app-icons.ts` is the key→path
  resolver; `src/app/manifest.ts` + `/api/manifest` build the manifest from the
  `serene-app-icon` cookie (zero-flash, re-synced by `IconInitializer`). `/profile` shows the
  icon grid (`IconSelector`) + an `InstallPrompt` Add-to-Home-Screen card. Migration 0121.
- **Elaya presence** — SSE chat at `/api/elaya/chat` + a WhatsApp staff channel (routing gate
  on the whatsapp webhook: staff number → same brain/tools/daily-cap, one reply; unknown number
  → lead pipeline untouched). Phase 2 agentic writes go through the `elaya_actions` state
  machine: `add_lead_note`/`create_lead_task` execute inline, `update_lead_status`/`reassign_lead`
  are propose-only (a `proposed` row) and resolve on the *next* human message via the
  confirmation gate (English + Hinglish, reads only the human reply — injection-safe). Every
  write reuses the shared `lead-mutations.ts` cores (R-01). Full contract: `../modules/elaya.md`.
- **Toasts** — `ToastProvider`/`ToastItem` (`src/components/ui/`), singleton `toast` API via
  `useToast`; max 3 in DOM, danger never auto-dismisses. Design spec: DNA §13.
- **Theme system** — 5 themes on `data-theme` (html), stored on `profiles.theme`, zero-flash
  inline script in the dashboard layout. Law: `../design/DESIGN-DNA.md` §1–2.

## 8. Client-side patterns — hook index (`src/hooks/`)

| Hook | One-liner |
| ---- | --------- |
| `useDashboardLayout` | widget order/size per user — localStorage `serene:dashboard:layout:${userId}:v1` |
| `useLeadColumnPreferences` | leads column visibility/order — `serene:leads:columns:${userId}:v1`; THE pattern for any future column picker (Q-08) |
| `useDashboardCohortSync` | global dashboard date-cohort URL ↔ state sync |
| `useWidgetData` | THE dashboard-widget data lifecycle (RSC seed → deps auto-fetch → refetch) |
| `useUrlFilters` | THE URL-param filter plumbing for list filter bars |
| `useDebounce` | the only debounce utility |
| `usePortalAnchor` | THE floating-panel anchoring mechanism (pairs with `<FloatingPanel>`) |
| `useMountOnFirstOpen` | mount latch for `next/dynamic` modals that stay mounted |
| `useNotifications` | notification state + Realtime |
| `useNotificationSound` | inbound chime |
| `usePushSubscription` | gesture-gated Web Push subscribe (iOS standalone detection; never auto-prompts) |
| `useAudioRecorder` | THE voice-recording hook (codec negotiation, 2-min cap, unmount discard) |
| `useTaskCompletionToggle` | optimistic completion-circle toggle |
| `useCreateTriggerModal` | create-trigger modal open/close + draft |
| `useToast` | re-export of the toast singleton |

Deeper prop/behaviour contracts live code-adjacent in `src/components/CLAUDE.md` and
`src/lib/CLAUDE.md` — the docs tree does not duplicate them.
