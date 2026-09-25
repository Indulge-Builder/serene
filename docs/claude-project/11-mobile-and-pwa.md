# Serene — Mobile layer & PWA (Claude Project digest)

> **New file in the 2026-08-24 pack.** Digest of `docs/modules/mobile-ops.md` (the build contract),
> the `design_handoff_mobile_system` package, `src/components/mobile/**`,
> `src/lib/constants/mobile-rooms.ts`, `src/styles/serene-mobile.css`, and the PWA wiring in
> `src/app/layout.tsx` / `manifest.ts` / `public/sw.js`. Verified 2026-08-24.
>
> There are **two** distinct mobile stories and they must not be confused: (1) the **responsive
> dashboard** — the normal staff app behaving well on a small screen; and (2) **`/m`, the Mobile Ops
> layer** — a separate route group with its own navigation, its own token layer, and its own screens.

---

# Part 1 — `/m`, the Mobile Ops layer

## What it is

The founder's pocket operating system: the month's most important numbers in the hand, one thumb,
fast. It lives in the `(client)` route group (`src/app/(client)/m/**`), separate from the
`(dashboard)` staff shell. It shipped as a display-only specimen on 2026-07-03 and **went functional
on 2026-07-06** (phases 0–5 of the build contract), running on real reads with genuinely new backend
being just one table and one RPC.

Customer auth does not exist yet, so the `(client)` layout is **gated behind a staff session** — the
layer is an internal surface for now, with the customer app as its eventual destination.

## Navigation — exactly four rooms plus the Elaya knob

`src/lib/constants/mobile-rooms.ts` is the registry (pure data, the `dashboard-widgets` precedent):

- **`MobileRoomSet` is a readonly 4-tuple**, so a fifth tab is a *compile error*. The Elaya knob is
  navigation, **not** a room — it never enters the tuple.
- Rooms: **Dashboard** (`/m`) · **Tasks** (`/m/tasks`) · **Budget** (`/m/budget`) · **Activity**
  (`/m/activity`). Every role currently resolves to the same admin set; manager/agent sets are
  registered stubs to be refined in later phases.
- `getMobileDomains(role, domain)` is the swipe scope: **admin/founder page through all four Gia
  domains; a manager is pinned to their own (no swipe); everyone else gets none** (coming-soon).
  Mobile scope is **carousel state, not a URL param** — the `resolveDomainParam` posture, adapted.
- `DOMAIN_VERTICALS` maps each Gia domain to its label, its `DOMAIN_ICONS` icon, and a pastel
  `-deep` token. Never re-map a domain → icon or colour inline.

**Chrome:** `IndulgeMark` (the 9-circle stroked mark) is THE drawer button — **there is no hamburger
anywhere in this layer**. `MobileTabBar` renders the registry, with the active room as a raised
46×46 r16 accent tile and the Elaya knob as a 52Ø accent disc riding ~20px above the bar.
`MobileDrawer` is a 76% panel (r 0 30 30 0, 380ms soft-out, swipe-left + scrim dismiss) showing the
real profile, the rooms, THE HOUSE section, a "View desktop site" row for admin/founder, and Sign out.

## Data flow (the rules that keep it production-grade)

- **`MobileSessionProvider` / `useMobileSession`** — the `(client)` layout already fetched the
  profile for its gate, so it threads `{ id, role, domain, fullName, email }` into context. Screens
  read identity from context; **no client file imports a service** (A-15 holds).
- **`DomainSwiper`** — THE domain-paging wrapper every room composes. It is the existing
  `ui/Carousel` with an additive `hideControls` prop plus a neu header and dot pager: **one swipe
  engine, never forked**, and the desktop consumer was left byte-identical.
- **`useDomainRoomData`** — the room data lifecycle: RSC seed for the first domain, one action fetch
  per domain on swipe, a per-domain cache, and error + retry state.
- **`mobile-service.ts` is orchestration only — ZERO new queries.** `getMobileDashboardData` is a
  `Promise.all` over `getLeadStatusSummary` + `getLeadsByCampaign` + `getDomainHealthMetrics` +
  `getDomainTargets` + `getBudgetSummary`/`filterBudgetRowsByDomain`; `mobileMonthRange()` is the
  shared IST month window; `buildMobileGreeting()` is **server-computed so hydration agrees**.
  Refresh actions live in `lib/actions/mobile.ts` (Zod → `requireProfile(manager+)` → manager pinned
  server-side).
- Rooms are **display-only** (A-06) and RSC-seeded.

## The four rooms

| Room | What it shows | Backend |
| ---- | ------------- | ------- |
| **Dashboard** (`/m`) | greeting block, an Elaya search pill, then per-domain: 2×2 metric tiles (new leads / won / deals-vs-target / ad spend), a deals-vs-target meter, top agents, top campaigns (names raw) | zero new backend |
| **Tasks** (`/m/tasks`) | the four counts (created / completed / open / overdue) + the per-agent team list; tapping a member opens `/m/tasks/[agentId]` (an `AgentTasksScreen` over `getPersonalTasks`) | **`get_domain_task_summary`** (0160) |
| **Budget** (`/m/budget`) | spend / leads / deals / revenue tiles, the deals-vs-target meter, per-campaign spend rows (CPL renders "—" at zero leads, never ₹0), and the tech-expense tracker as a **Coming Soon placeholder by contract** | zero new backend |
| **Activity** (`/m/activity`) | the live feed: RSC-seeded, "Earlier" keyset load-more, and **one Realtime channel per active domain** (`domain=eq.<x>`, P-06 teardown + a `useId` nonce); swiping domains swaps the channel | **`activity_events`** (0159) |

**Decision worth remembering:** the deals-vs-target meter renders the neu `ProgressCard`, **not** a
Recharts wrapper — there is deliberately **no Recharts in the mobile chunk**.

## Elaya on mobile

`/m/elaya` resolves the **same** seed as the desktop page (`resolveElayaChatSeed` — one 24h session
across every channel) and `ElayaChatScreen` pumps **`streamElayaChat()`**, the shared SSE transport.
It handles the daily cap, 429s and errors identically (a rejected send restores the draft; hitting
the cap swaps the composer for a quiet serif note); assistant bubbles render `<ChatMarkdown>`; the
starter chips are the real `ELAYA_STARTER_PROMPTS` and are **prefill-only, never auto-send**. The
demo composer's decorative mic was removed — a dead control implying voice input.

## The auto-open redirect

A logged-in **admin/founder on a mobile browser** landing **bare** on `/dashboard` (no query params)
is redirected to `/m`. The details matter:

- The role comes from `public.profiles` via `getCurrentProfile()` (Rule 09) — **never** from the
  User-Agent. The UA test (`utils/device.ts` `isMobileUserAgent()`, server-only) only picks which
  fully-functional surface loads. Phones and small Android tablets match; **iPad deliberately does
  not**.
- It lives in the `/dashboard` **page**, not the shared layout, so deep links to `/leads`,
  `/tasks`, etc. are never intercepted; and the bare-landing condition keeps a shared
  `/dashboard?…` link or an in-app back-nav from being hijacked mid-flow.
- **Opt-out:** the drawer's "View desktop site" row sets `FORCE_DESKTOP_COOKIE`
  (`serene-force-desktop`, 1 year) and **hard-navigates** to `/dashboard` — a hard nav guarantees the
  cookie is on the server request that renders the page, so the redirect can't re-fire.
- Manager and agent stay on the responsive `/dashboard` until their room sets ship.

## The mobile token layer (`src/styles/serene-mobile.css`)

Imported **after** the neumorphic tokens. It ships only what the base layer lacks:

- `--neu-m-*` scrim / drawer / sheet / indicator tokens, with `data-neu="dark"` overrides.
- The halo ring keyframe and mobile idle-loop timings (breathe 2.2/2.6s, typing dots 1.3s with a
  0.18s stagger, halo 3/3.4s).
- `.neu-m-touch` / `-knob` / `-quiet` press recipes (220ms spring transform, 300ms soft-out shadow;
  press = pressed inset + `scale(0.98)`, knobs `0.94`).
- **Everything is `prefers-reduced-motion` gated.**

**Touch scale is enforced by construction:** primary 56 · secondary/field 52 · knob 44 floor · list
row 64 · tab bar 64 · FAB 60; 20px edge padding, 14px card gap, **one scroll axis per screen**.
Mobile radii: card 24 / tile 18 / field 16 / pill. Components consume `--neu-*` tokens exclusively —
**zero hex** in `components/mobile/`.

**Mobile loading standard:** the rooms' `PaneLoader` is a centred `LogoSpinner size="md"` (the
WhatsApp conversation-pane treatment), gated on `!data` so a revisit that already has data never
flashes it.

## What is genuinely new vs. reused

New: one table (`activity_events`), one RPC (`get_domain_task_summary`), the room registry, the
session provider, `DomainSwiper`, `useDomainRoomData`, and the screens. Everything else —
every metric, every read, the Elaya brain, the transport, the carousel — is the existing system.
`HomeScreen.tsx` and the demo `ActivityScreen.tsx` were retired; the `requests`/`profile` demo
routes still resolve but left the tab bar.

---

# Part 2 — The responsive staff dashboard

The normal app on a small screen. The rules are V-14 (see `6-engineering-rules.md`); the shipped
behaviour worth knowing:

- **Responsive shells live in shared primitives**, in `globals.css` under "RESPONSIVE SHELL":
  `.serene-shell*`, `.serene-sidebar*`, `.serene-dossier-grid` (+ the `--340` variant for 340px
  identity sidebars), `.serene-board` (the group-task board: a snap-scroll rail below lg, five
  columns at lg+), `.serene-touch`.
- **The dashboard canvas** collapses below 768px to a derived, read-only single column built from the
  stored desktop placements; that `xs` layout is **never persisted**, and edit mode is disabled
  there. Above, `.serene-dashboard-grid` caps at 1760px.
- **The sticky page header** (`.serene-condense-header`) condenses **paint-only**. Below md the
  safe-area and rhythm padding move *into* the bar, so the stuck bar covers the status-bar strip
  instead of sliding under the notch. The floating drawer trigger sits at `--z-sidebar` (40), not
  `--z-raised` (10) — at 10 the condensed bar frosted the Indulge mark **and swallowed its taps**.
- **FilterBar below md** becomes a single-row scroll rail, so every `FilterDropdown` child must pass
  `menuPortal`. The rail needs vertical padding + compensating negative margins or `overflow-x: auto`
  clips each chip's raised shadow. On `/tasks` the bar takes a full row of the strip below md
  (`flexBasis: 100%`) — with `flex-basis: 0` it never wrapped and the tab tray crushed it.
- **`Dialog` becomes a bottom sheet** below md with tightened `--space-4` gutters (the desktop
  `--space-6` inset ate ~13% of a 360px sheet).
- **Two labelled CTAs plus a bell don't fit** a phone header row — `/tasks` collapses
  `CompletedTasksButton` to icon-only below md.
- A route that renders a workspace gets its **own** `loading.tsx` with the matching skeleton;
  otherwise navigation paints the list skeleton first and then the workspace one ("two skeletons
  then the page").

---

# Part 3 — The PWA

- **Manifest:** `app/manifest.ts` plus the dynamic `/api/manifest?icon=<key>` twin (the sanctioned
  P-02 carve-out). `buildManifest(icon, appearance)` sets `background_color` / `theme_color` per
  appearance mode, so the OS chrome tracks light/dark.
- **Icons:** one square `/public/icon-N.webp` per key in `constants/app-icons.ts`, covering manifest
  192/512 + maskable + apple-touch. `iconSrc(value)` is THE only key→path resolver and validates
  against `ICON_KEYS` — **never interpolate a raw param into an icon path**. Adding an option is one
  `{ id, label }` line plus a CHECK-extending migration. `scripts/pad-app-icons.mjs` composites the
  umber→gold glyph onto a solid **`#ECE8E1` cream plate** (`NEU_CANVAS_LIGHT`) so the OS splash reads
  as the boot screen's canvas and the two loading moments merge into one; it also emits
  `apple-icon.png` and `public/icons/icon-192.png` / `icon-512.png` for push and the offline shell.
- **Viewport:** `generateViewport()` emits `viewport-fit=cover` — **without it every
  `env(safe-area-inset-*)` in the codebase evaluates to 0** and the app can never extend under the
  status bar. iOS `statusBarStyle` follows the appearance cookie: **dark → `black-translucent`**
  (true edge-to-edge, white status text on the charcoal canvas); light/system stays `default`
  (black-translucent's white text would vanish on cream).
- **Service worker (`public/sw.js`):** network-first; it **never** caches RSC payloads, Server Action
  responses, or navigation responses — only the static shell and icons. `CACHE_VERSION` must be
  bumped whenever a precached asset changes (it went to `serene-shell-v3` with the mark-on-cream
  icons, 2026-09-25).
- **Boot:** `AppBootScreen` plays once per hard load and merges visually with the OS splash. The
  progress bar was removed — the mandala draw is the progress indicator.
- **Push on iOS** works **only inside the installed PWA**; `usePushSubscription` reports
  `ios-needs-install` otherwise and `InstallPrompt` offers Add-to-Home-Screen. Subscribe is
  gesture-gated.
- **Known limitation:** the home-screen icon and splash are baked at **install** time, so a device
  installed before an icon change keeps the old icon until the user re-adds the app.
