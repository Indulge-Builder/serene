# Serene: Mobile Layer and PWA (Claude Project digest)

> **Purpose:** everything about Serene on a phone: the `/m` pocket layer (four rooms plus the Elaya knob), the desktop app's phone behaviour and touch rules, and the installable PWA (manifest, icons, service worker, boot, push).
> **Audience:** a Claude Project chat that cannot read the repo, and the engineers who use it.
> **Source-of-truth scope:** a digest. The `/m` build contract is `docs/modules/mobile-ops.md`; the install guide is `docs/operations/pwa-install-guide.md`; push is `docs/modules/web-push.md`; the design rules are `docs/design/DESIGN-DNA.md` (§9, §12 and the 2026-09-26 touch notes) and `docs/design/design-system.md` §12; the phone audit is `docs/audits/2026-09-26-mobile-audit.md`. Token values: `10-design-system.md`.
> **Last verified:** digested 2026-09-26 from those docs as refreshed and verified against the code that day; the viewport and manifest settings were spot-checked in `src/app/layout.tsx` and `src/app/manifest.ts`.

There are **two** phone stories; never confuse them:

1. **`/m`, the Mobile Ops layer:** a separate route group (`src/app/(client)/m/`) with its own
   navigation, tokens and screens, for leadership on a phone.
2. **The desktop app on a phone:** the normal staff app, responsive, with shared touch rules.

---

## Part 1: `/m`, the pocket view

### What it is

The founder and leadership already have every number in Serene, spread across `/dashboard`,
`/tasks`, `/budget`, `/performance` and `/campaigns`. `/m` puts the month's most important ones in
one hand: four rooms, each swipeable across the Gia domains, with Elaya in the middle of the tab
bar. It landed on 2026-07-03 as a display-only mockup of the Indulge client-app design and went
functional on 2026-07-06 (real, domain-scoped reads and the real Elaya brain).

It is a staff surface. The `(client)` route group is named for the future customer app, but
customers have no login yet, so the whole group sits behind a staff session.

### Who sees what

| Who | What they get |
| --- | --- |
| Admin, founder on a phone | Sent to `/m` automatically from a bare `/dashboard` landing (below). All four Gia domains to swipe through |
| Manager in a Gia domain | Reaches `/m` by URL only (no auto-redirect). The same rooms, pinned to their own domain (no swipe) |
| Agent, or a manager outside the Gia domains | A calm "Your rooms are being prepared" card |
| Anyone without Elaya access | No Elaya knob; `/m/elaya` redirects to `/m` (`hasElayaAccess`, 2026-09-26) |

Gates in code: the `(client)` layout admits any active staff profile (else `/login`) and threads
`{ id, role, domain, fullName, email }` into `MobileSessionProvider` (`useMobileSession`), so client
files never import a service. `getMobileDomains(role, domain)` in
`src/lib/constants/mobile-rooms.ts` gives admin and founder all four Gia domains, a Gia manager their
own, everyone else none. Every room action in `src/lib/actions/mobile.ts` runs Zod →
`requireProfile(['manager','admin','founder'])` → pins a manager to their own domain server-side.
`/m/tasks/[agentId]` is manager and up; a manager only for their own domain's agents.

### Navigation: exactly four rooms plus the Elaya knob

`MOBILE_ROOMS_BY_ROLE` is typed as a four-tuple, so **a fifth tab is a compile error**. The Elaya
knob is navigation, not a room. Every role is registered with the same four today; per-role room
sets were planned and never built.

| Room | Route | Answers | Data (existing reads only) |
| --- | --- | --- | --- |
| Dashboard | `/m` | How is each domain doing this month? | `getMobileDashboardData`: a `Promise.all` over the lead status summary, leads by campaign, domain health, domain targets, the budget summary. A server-computed greeting, metric tiles (new leads, won, deals vs target, ad spend), a deals-vs-target `ProgressCard`, top agents, top campaigns (names raw) |
| Tasks | `/m/tasks` | How is each domain and agent doing on tasks? | `get_domain_task_summary` (0160, revoked tier): per assignee, created and completed in the month, open and overdue now. Tap an agent → `/m/tasks/[agentId]` (their open tasks) |
| Budget | `/m/budget` | Where is the money going? | the domain's campaign spend for the month, totals, cost per lead (an em-dash glyph at zero leads, never ₹0), deals vs target. The tech expense tracker is a Coming Soon card by design |
| Activity | `/m/activity` | What is happening, live? | `getActivityFeed(domain, cursor)` over `public.activity_events` (0159), 30 a page, "Earlier" for more; one Realtime channel per active domain, swapped on swipe |
| Elaya (knob) | `/m/elaya` | The chat | the real brain: the same seed as desktop (one 24-hour session across channels), streamed through `elaya-stream.ts`, the same transport as the desktop chat |

The month window is `mobileMonthRange()` (IST). Each room page seeds the first domain on the
server; swiping fetches another domain once through the room's action and caches it
(`useDomainRoomData`: seed, per-domain cache, error and retry). **There is no Recharts in the mobile
chunk** by decision.

**The activity stream** is one append-only table (cloned from `task_events`), not a merge of live
reads: one indexed read and one Realtime channel however large the sources grow. Lead and deal
cores emit directly; task events are derived inside `emitTaskEvent`, so a task write is never
counted twice. Never emit from an action or component.

### Shared pieces

| Piece | Job |
| --- | --- |
| `mobile-rooms.ts` | the room registry, `getMobileRooms`, `getMobileDomains`, `DOMAIN_VERTICALS` (domain → label, the domain icon, a pastel deep token), `FORCE_DESKTOP_COOKIE` |
| `DomainSwiper` | THE domain-paging wrapper every room composes: `ui/Carousel` with `hideControls` plus a domain header and a dot pager (dots have a 44px hit area) |
| `ui/Carousel` | one swipe engine for the whole app (also the founder performance deck). Since 2026-09-25 the track follows the finger 1:1 with direction lock and rubber-banding, projects release velocity to pick the slide, and springs at the finger's speed. Never fork a second track |
| `MobileTabBar` | the four rooms plus the Elaya knob (only with `hasElayaAccess`) |
| `MobileDrawer` | opened by `IndulgeMark` (the nine-circle mark; **never a hamburger**): the real profile, room navigation, "View desktop site" (admin/founder), Sign out; pads the bottom safe area |
| `rooms/room-bits.tsx` | `PaneLoader` (a centred `LogoSpinner`, only while a pane has no data), `PaneError`, `RoomEmpty` (composes `EmptyState`), `ComingSoonCard`, `MetricTile` |
| `app-bars`, `buttons`, `content`, `controls`, `fields`, `overlays` | pure, prop-driven primitives (`MobileBottomSheet`, `MobileActionSheet`, `MobileButton`, `IconKnob`, `Fab`) on `--neu-*` tokens only |
| `src/styles/serene-mobile.css` | `--neu-m-*` scrim, drawer, sheet and indicator tokens (with dark values), mobile idle loops, `.neu-m-touch` / `-knob` / `-quiet` press recipes; everything reduced-motion gated. Its drawer and sheet scrims use a 2px blur that is not on the sanctioned list (an open design decision) |

**Demo screens are off.** The mockup's Profile, Requests and Request detail screens (fed by
`demo-data.ts`) stay in the repo for the future client app but sit behind
`MOBILE_DEMO_SCREENS_ENABLED = false`: `/m/profile`, `/m/requests` and `/m/requests/[ref]` return
404 (before 2026-09-26 anyone signed in could open a fake persona and booking flow by URL).

**The 2026-09-26 audit fixes in `/m`:** the drawer lost its dead rows; the app bar lost a bell with
no handler; the Elaya screen's back button goes to `/m` (it used to leave the app), its date chips
follow the real day, its starter chips are 44px (prefill only, never auto-send) and its input is
16px; `lockBodyScroll` became a position-fixed lock.

### The auto-open on a phone

`src/app/(dashboard)/dashboard/page.tsx` redirects to `/m` when all hold: the role is admin or
founder (read from `profiles`, never the user agent), the request has no query params (a shared
`/dashboard?…` link or a back-navigation is never hijacked), the `serene-force-desktop` cookie is
not set, and `isMobileUserAgent()` (`src/lib/utils/device.ts`, server-only) says phone (phones and
small Android tablets; **iPads deliberately not**). It lives in the dashboard page, not the layout,
so deep links to other pages are never intercepted. "View desktop site" sets the cookie for a year
and hard-navigates, so the cookie is on the very request that renders.

### Touch scale and rules for changing `/m`

Touch scale by construction: primary actions 56, fields 52, knobs 44 minimum, list rows 64, the tab
bar 64, the FAB 60; 20px edge padding; one scroll axis per screen. Mobile radii: card 24, tile 18,
field 16, pill. Zero hex in `components/mobile/`.

1. Reuse first: the only new backend `/m` ever needed was one table (`activity_events`) and one RPC
   (`get_domain_task_summary`). A new tile uses an existing read.
2. Screens render, they never query (A-06); data enters through the page seed and
   `lib/actions/mobile.ts`.
3. `--neu-*` tokens only; one swipe engine; one Elaya transport; never a fifth tab; one
   append-only activity table fed only by the cores.

**Open:** per-role room sets for managers and agents; the tech expense tracker; the customer app
(waits on customer auth); `emitActivityEvent` still writes through an `as any` cast that the
regenerated types make unnecessary.

---

## Part 2: the desktop app on a phone

The rules are V-14 (`6-engineering-rules.md`) plus the touch rules the 2026-09-26 mobile audit
added (it scored the phone experience 10 of 20 and fixed most findings through shared pieces).

- **The shell:** below md the sidebar is an off-canvas drawer opened by a floating 40px round
  trigger on the page title's line (at `--z-sidebar`, so a stuck header never covers it); the
  workspace goes full-bleed; page padding `p-4 sm:p-6 lg:p-8`; full-height surfaces use `dvh`.
- **Title rows** keep the primary action and the bell from clipping (secondary labels hide, the
  icon stays). `CondensingPageHeader` moves the safe-area and rhythm padding into the bar below md
  so the stuck bar covers the status-bar strip.
- **Filter bars** become one scroll row below md (every `FilterDropdown` child passes
  `menuPortal`; the rail carries vertical padding with negative margins so chips keep their
  shadows). **Dense tables** (leads, members) become card stacks that ignore stored column prefs.
  **Detail grids** are one column below lg (`--aside-left` and `--side-first` order the aside).
  **Conversation pages** show one card at a time.
- **Dialogs** become bottom sheets (tight `--space-4` gutters, up to 90dvh, safe-area padding); a
  whole-form error sits above the footer (the `error` prop), never below the fold.
- **Touch rules:** text fields at least 16px on a coarse pointer (iOS zooms below that; enforced
  globally); buttons, filter triggers, compact fields and `.serene-selection` rows at least 44px;
  `.serene-touch-hit` gives a tiny drawn control (a tick, a dot, a grip) an invisible 44px target;
  two or three fields side by side compose `.serene-form-row`, which stacks; forms skip `autoFocus`
  on touch; in a composer a bare Enter is a newline and the send knob sends; the keyboard resizes the
  shell (`interactiveWidget: "resizes-content"` in the viewport); boards drag with a hold or offer a
  "Move to" menu; checklists offer Move up and Move down.
- **The dashboard** collapses below 768px to a derived, read-only single column built from the
  stored desktop placements; that layout is never persisted and edit mode is off there. The
  default grid depends on role and domain: a domain the Gia widgets do not serve gets My Tasks
  plus the Elaya widget (the latter only where Elaya is on).
- **Elaya:** the floating Elaya button (48px below md) opens the chat as a full sheet; the `/elaya`
  page is chat-only below lg. Scrolling pages reserve room for the button at their foot.
- **A route that renders a workspace has its own `loading.tsx`** in its shape, or navigation shows
  two skeletons in a row.

---

## Part 3: the PWA

- **Manifest:** `src/app/manifest.ts` plus its dynamic twin `/api/manifest?icon=<key>` (a sanctioned
  API route; the key is validated). `start_url` `/dashboard`, `display: standalone`, background and
  theme colour = the canvas for the current appearance, so the OS chrome tracks light and dark.
- **Icons:** four picks (`ICON_KEYS` in `src/lib/constants/app-icons.ts`, `profiles.app_icon`,
  mirrored to the `serene-app-icon` cookie). One square `public/icon-N.webp` per key covers the
  manifest sizes, maskable and apple-touch. `iconSrc(value)` is THE only key → path resolver (never
  interpolate a raw param into an icon path). Since 2026-09-26 the **default icon is the mark on a
  white plate** (a phone paints black or white behind a transparent icon); the other three sit on the
  cream `#ECE8E1` plate; the browser tab favicon is the bare mark. `scripts/pad-app-icons.mjs`
  renders every raster, including `apple-icon.png` and `public/icons/icon-192.png` /
  `icon-512.png` (used by push and the offline shell). Adding a pick = one `{ id, label }` line plus
  a CHECK migration.
- **Viewport:** `viewportFit: "cover"` (without it every `env(safe-area-inset-*)` is 0),
  `interactiveWidget: "resizes-content"`, and `themeColor` per appearance. iOS `statusBarStyle`
  follows the appearance cookie: dark → `black-translucent` (true edge to edge, white status text on
  charcoal); light and Auto stay `default` (white text would vanish on cream).
- **Service worker (`public/sw.js`):** registered in production only. Network-first; it **never**
  caches RSC payloads, Server Action responses or navigations, only the static shell, the offline
  page and icons. Offline shows `offline.html` ("The thread has slipped." with Retry). Bump
  `CACHE_VERSION` whenever a cached asset changes (now `serene-shell-v4`, for the white-plate
  icons). The proxy skips the manifest, `sw.js`, `offline.html`, `icons/` and `apple-icon`.
- **Boot:** `AppBootScreen` plays once per browser session (sessionStorage), on the same cream as
  the OS splash so the two loading moments read as one. The mark draws, then turns once every 24
  seconds under the SERENE / BY INDULGE lockup. No progress bar.
- **Install** (from the guide): Android in the real Chrome app (not an in-app browser), via the
  Profile page's **Add to Home Screen** card (`InstallPrompt`, shown only when Chrome is ready) or
  the ⋮ menu; iPhone only in Safari, Share → Add to Home Screen (the installed app asks for one fresh
  login). It works only on the deployed https site. Updates need nothing: the installed app is the
  live site.
- **The icon is baked at install time.** A new pick or an icon redesign reaches a phone only after
  the shortcut is removed and re-added (Android sometimes refreshes on its own; iPhone never).

### Web Push

`createNotification` inserts the in-app row (the source of truth), then `dispatchPush()` sends to
every device in `push_subscriptions` (one row per device, `endpoint` UNIQUE, owner-only RLS, no
UPDATE) through VAPID and the `web-push` library: server and Node only, never throws, and prunes any
404 / 410 endpoint at once. A muted category (the `notificationKey` gate) skips the row and the push
together; push rides the `in_app` channel. The payload is generic (`{ title, body?, url? }`, `url`
relative and re-checked on click, falling back to `/dashboard`). The notification icon is
`/icons/icon-192.png`. Callers include lead assignment, SLA fires, deals, tasks and nudges, tickets
(intake, sentinel, assignment), the Sia watcher alarm (unmutable), the founders' brief, alerts,
deep reads and resolved suggestions.

- **iOS delivers only inside the installed PWA.** `usePushSubscription` detects standalone mode and
  reports `ios-needs-install` otherwise, so the Profile → Notifications card shows an "Add to Home
  Screen" hint instead of Enable, and never fakes a subscribed state.
- **Subscribe is gesture-gated** (a click, never on mount).
- VAPID private keys are server-only and never rotated after deploy (rotation orphans every
  subscription). **Set the three server VAPID keys on the Trigger.dev worker too**, or every push a
  background job creates is silently off.

### Appearance wiring (light, dark, Auto)

`profiles.appearance` (`light` / `dark` / `system`) is mirrored to the `serene-appearance` cookie;
the root layout stamps `data-neu="dark"` on the server, and `system` gets a tiny pre-paint script.
`applyAppearanceToDom()` is the only place the attribute flips (it also rewrites
`<meta name="theme-color">` between `#ECE8E1` and `#28241C`). `ThemeInitializer` owns the live OS
listener for Auto; the Profile page's segmented Light · Dark · Auto control writes it through the
existing profile action. The theme (`serene-theme`) and the app icon (`serene-app-icon`) follow the
same cookie-mirror pattern, so nothing flashes on load.
