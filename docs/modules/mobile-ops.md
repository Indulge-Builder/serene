# Mobile Ops: the Pocket View at `/m`

> **Purpose:** the as-built reference for the `/m` mobile layer: four rooms of live numbers per Gia domain plus Elaya, for leadership on a phone. What it shows, who sees it, where every number comes from, and the rules for changing it.
> **Audience:** engineers working in `src/components/mobile/` or `src/app/(client)/m/`.
> **Source-of-truth scope:** the `/m` layer. The desktop dashboard is `../pages/dashboard.md`; the design of the mobile components is `../design/` and `src/components/CLAUDE.md`; the phone view of the desktop app (the responsive shell) is covered by `../audits/2026-09-26-mobile-audit.md` and `../design/`.
> **Last verified:** 2026-09-26 against `src/app/(client)/**`, `src/components/mobile/**`, `src/lib/constants/{mobile-rooms,feature-flags}.ts`, `src/lib/services/{mobile-service,activity-events,activity-service}.ts`, `src/lib/actions/mobile.ts`, `src/hooks/useDomainRoomData.ts`, `src/components/ui/Carousel.tsx`, `src/app/(dashboard)/dashboard/page.tsx`, migrations 0159/0160.

---

## 1. What it is

The founder and leadership already have every number in Serene, but spread across
`/dashboard`, `/tasks`, `/budget`, `/performance` and `/campaigns`. `/m` puts the month's most
important ones in the hand: four rooms, each swipeable across the Gia domains, and Elaya in the
middle of the tab bar.

History: the `/m` shell landed on 2026-07-03 as a display-only mockup of the Indulge client-app
design (`design_handoff_mobile_system`) running on `demo-data.ts`. On 2026-07-06 it went
functional: real, domain-scoped reads behind all four rooms and the real Elaya brain. The same
day, admin and founder phones started opening `/m` automatically.

It is a staff surface. The `(client)` route group was named for the future customer app, but
customers have no login yet, so the whole group sits behind a staff session.

## 2. Who sees what

| Who | What they get |
| --- | ------------- |
| Admin, founder on a phone | Sent to `/m` automatically from a bare `/dashboard` landing (§7). All four Gia domains to swipe through. |
| Manager in a Gia domain | Reaches `/m` by URL (no auto-redirect). The same four rooms, pinned to their own domain (no swipe). |
| Agent, or a manager outside the Gia domains | The rooms render a calm "Your rooms are being prepared" card. |
| Anyone without Elaya access | No Elaya knob on the tab bar; `/m/elaya` redirects to `/m` (`hasElayaAccess`, 2026-09-26). |

Gates in code:

- `src/app/(client)/layout.tsx`: any active staff profile, else `/login`. It threads
  `{ id, role, domain, fullName, email }` into `MobileSessionProvider` (`useMobileSession`), so
  client components read identity without a service import.
- `getMobileDomains(role, domain)` in `src/lib/constants/mobile-rooms.ts`: admin/founder get all
  four Gia domains; a manager in a Gia domain gets their own; everyone else gets none.
- Every room action in `src/lib/actions/mobile.ts`: Zod, `requireProfile(['manager','admin',
  'founder'])`, then the manager is pinned to their own Gia domain server-side.
- `/m/tasks/[agentId]`: manager+ only; a manager only for agents in their own domain.

## 3. The rooms

The tab bar is **exactly four rooms plus the Elaya knob** in the centre.
`MOBILE_ROOMS_BY_ROLE` is typed as a four-tuple, so a fifth tab is a compile error. Every role is
registered with the same four today; per-role room sets were planned and never built.

| Room | Route | Answers | Data (all existing reads, R-01) |
| ---- | ----- | ------- | ------------------------------- |
| Dashboard | `/m` | "How is each domain doing this month?" | `getMobileDashboardData` = `Promise.all` of `getLeadStatusSummary`, `getLeadsByCampaign`, `getDomainHealthMetrics`, `getDomainTargets`, `getBudgetSummary` + `filterBudgetRowsByDomain`. A greeting, metric tiles (new leads, won, deals vs target, ad spend), the deals-vs-target `ProgressCard`, top agents, top campaigns (names raw). |
| Tasks | `/m/tasks` | "How is each domain and agent doing on tasks?" | `get_domain_task_summary(p_domain, p_from, p_to)` (migration 0160, EXECUTE revoked, admin client via `getDomainTaskSummary` in `tasks-service.ts`): per assignee, created and completed in the month, open and overdue now. Tap an agent → `/m/tasks/[agentId]` (their open tasks via `getPersonalTasks`, `AgentTasksScreen`). |
| Budget | `/m/budget` | "Where is the money going in this domain?" | `getMobileBudgetData`: the domain's campaign spend rows for the month (no recharges; they carry no domain), totals, cost per lead ("—" at zero leads, never ₹0), deals vs target. The tech-team expense tracker is a Coming Soon card by design (no table, no service). |
| Activity | `/m/activity` | "What is happening in this domain, live?" | `getActivityFeed(domain, cursor)` over `public.activity_events` (migration 0159), keyset `(created_at, id)`, 30 a page, "Earlier" to load more; one Realtime channel per active domain (`domain=eq.<x>`), swapped on swipe. |
| Elaya (knob) | `/m/elaya` | The chat | The real brain. The page resolves the same seed as desktop (`resolveElayaChatSeed`, one 24-hour session across channels); `ElayaChatScreen` streams through `src/components/elaya/elaya-stream.ts`, the same transport as `ElayaChatShell`. |

The month window is `mobileMonthRange()` in `mobile-service.ts` (IST). Each room page (RSC)
seeds the first domain through the service; swiping to another domain fetches it once through
the room's action and caches it per domain (`src/hooks/useDomainRoomData.ts`: seed, per-domain
cache, error and retry).

### The activity stream

`public.activity_events` is one append-only table (cloned from `task_events`), not a merge of
live reads, so the feed is one indexed read and one Realtime channel however large the source
tables grow. RLS: admin/founder all, manager their own domain, agent their own actions; no write
policy ever (A-11). Backfilled 30 days on creation.

Writes come from one seam, `src/lib/services/activity-events.ts` (`emitActivityEvent`,
`emitLeadActivityEvent`; admin client, best effort, never throws). Lead and deal events are
emitted directly by the write cores (`addLeadNoteCore`, `addLeadCallNoteCore`,
`createLeadTaskCore`, `updateLeadStatusCore`, `assignLeadCore`, `recordDealCore`, and
`createWalkInDeal`). Task events are **derived** inside `emitTaskEvent` (created →
`task_created`, completed → `task_completed`), so a task write is never counted twice. Never
emit from an action or a component.

## 4. The shared pieces

| Piece | File | Job |
| ----- | ---- | --- |
| Room registry | `src/lib/constants/mobile-rooms.ts` | `MOBILE_ROOMS_BY_ROLE`, `getMobileRooms`, `getMobileDomains`, `DOMAIN_VERTICALS` (domain → label, `DOMAIN_ICONS` icon, pastel `-deep` token), `FORCE_DESKTOP_COOKIE` |
| Domain swiper | `src/components/mobile/DomainSwiper.tsx` | THE domain-paging wrapper every room uses: `ui/Carousel` with `hideControls`, plus its own domain header and dot pager |
| Swipe engine | `src/components/ui/Carousel.tsx` | One engine for the whole app (also the founder performance deck). Since 2026-09-25 the track follows the finger 1:1 (Framer drag with direction lock and rubber-banding), projects the release velocity to pick the landing slide (one slide per gesture), and springs on at the finger's speed. Hidden slides are inert. Never fork a second track |
| Tab bar | `MobileTabBar.tsx` | Four rooms from the registry; the Elaya knob only when `hasElayaAccess`; the active tile moves on tap |
| Drawer | `MobileDrawer.tsx` | The real profile, room navigation, "View desktop site" (admin/founder), Sign out. Opened by `IndulgeMark` (never a hamburger) |
| Room bits | `rooms/room-bits.tsx` | `PaneLoader` (the centred `LogoSpinner`, only while a pane has no data), `PaneError`, `RoomEmpty` (composes `ui/EmptyState`), `ComingSoonCard`, `MetricTile` |
| Primitives | `app-bars.tsx`, `buttons.tsx`, `content.tsx`, `controls.tsx`, `fields.tsx`, `overlays.tsx` | Pure, prop-driven, `--neu-*` tokens only |
| Styles | `src/styles/serene-mobile.css` | Mobile scrim, drawer and sheet tokens, idle loops, press recipes, all reduced-motion gated |

## 5. Demo screens

The mockup's Profile, Requests and Request detail screens (`ProfileScreen`, `RequestsScreen`,
`RequestDetailScreen`, fed by `demo-data.ts`) are still in the repo but behind
`MOBILE_DEMO_SCREENS_ENABLED = false` in `src/lib/constants/feature-flags.ts`: the routes
`/m/profile`, `/m/requests` and `/m/requests/[ref]` return 404. Before 2026-09-26 any signed-in
staff member could open a fake persona and a fake booking flow by URL. They stay for the future
client app.

## 6. The 2026-09-26 mobile audit

`../audits/2026-09-26-mobile-audit.md` read every screen at phone width. What changed in `/m`:
the demo screens went behind the flag (§5); the drawer lost its dead rows and pads the bottom
safe area; the app bar lost a bell with no handler; the Elaya screen's back button goes to `/m`
(it used to `router.back()` out of the app), its date chips follow the real day, its starter chips
are 44px and its input is 16px (iOS zooms below that); pager dots got a 44px hit area; and
`lockBodyScroll` became a position-fixed lock (iOS rubber-banded behind sheets).

The same pass fixed the desktop app on a phone through shared pieces (these are app-wide, owned
by `../design/`): `.serene-form-row` for form rows that stack on a phone, `.serene-touch-hit` for
a 44px invisible hit area around small controls, 16px text fields and 44px selections on touch
(`@media (pointer: coarse)`), the Dialog `error` prop, `interactiveWidget: resizes-content`, and
no marquee on touch in the dashboard's Recent Leads widget.

## 7. Auto-open on a phone

`src/app/(dashboard)/dashboard/page.tsx` redirects to `/m` when all of these hold: the role is
admin or founder, the request has no query params (a shared `/dashboard?…` link is never
hijacked), the `serene-force-desktop` cookie is not `1`, and `isMobileUserAgent()`
(`src/lib/utils/device.ts`; phones and small Android tablets, not iPads) says phone. The drawer's
"View desktop site" sets that cookie for a year and hard-navigates to `/dashboard`. This picks a
surface only; role still comes from `profiles`, never from the user agent.

## 8. Rules for changing it

1. **Reuse first.** Every number here already had a service function; the only new backend was
   one table (`activity_events`) and one RPC (`get_domain_task_summary`). A new tile uses an
   existing read or extends one.
2. **Screens render, they never query** (A-06). Data enters through the RSC page seed and the
   actions in `lib/actions/mobile.ts`. A `'use client'` file never imports a service (A-15).
3. **`--neu-*` tokens only** in `src/components/mobile/`.
4. **One swipe engine** (`ui/Carousel`), **one Elaya transport** (`elaya-stream.ts`).
5. **Never a fifth tab.** The Elaya knob is not a room.
6. **One append-only activity table**, fed only from the write cores.
7. Touch floor 44px everywhere; primary actions 56, fields 52.

## 9. Open items

- Per-role room sets for managers and agents (agents see only the coming-soon card; managers
  reach `/m` only by URL).
- The tech-team expense tracker (a `tech_expenses` table) is a placeholder.
- The customer app: the `(client)` group, the demo screens and the customer Elaya persona wait
  on customer auth.
- A follow-up from 2026-07-06, half done: `database.ts` now carries `activity_events`, but
  `emitActivityEvent` still writes through `(admin as any)`. The cast can be removed.
