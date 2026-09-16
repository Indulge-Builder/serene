# Layout Components — CLAUDE.md

## Files

| File | Role |
| --- | --- |
| `Sidebar.tsx` | `'use client'`; primary nav, user footer. Notification bell ONLY when `TOP_BAR_ENABLED` is **off** (then it's the footer bell exactly as before); when **on**, the footer bell is not rendered (the bell lives in `PageControls` on each page's title row). Takes no notification seed — the bell reads state from `<NotificationsProvider>` (dashboard layout) via context. |
| `NotificationsProvider.tsx` | `'use client'`; **THE single mount that owns notification inbox state** (2026-07-10). Mounted ONCE in the dashboard layout wrapping the shell, so the Realtime subscription + chime + optimistic mark-read/all survive navigation (the fix for "notifications don't show up live" — the old `PageControls` bell remounted per route, tearing down the channel). Seeds UNREAD-only on mount via `getMyNotificationsAction`; exposes `{ notifications, unreadCount, markRead, markAllRead, isLoading }` via `NotificationsContext`. `useNotifications` is now `useContext` of this. Props: `{ userId, children }`. |
| `PageControls.tsx` | `'use client'`; **THE global controls cluster on the page title row** (`TOP_BAR_ENABLED`) — domain selector + notification bell, rendered INLINE in each page's `flex items-center justify-between` title row (right side, beside the page CTA), so they read as part of the page — **no separate bar, strip, or divider**. Prop: `isPrivileged` (admin/founder → the `DomainSelector` renders; bell-only otherwise). The bell reads state from the layout `<NotificationsProvider>` (no seed prop). The domain selector stays inline at every breakpoint (it used to hide below md, but the dashboard has no per-page filter bar to fall back to, so hiding it stranded admin/founder on mobile with the date filter but no domain scope — `DomainSelector`'s `<FilterDropdown menuPortal>` menu body-portals out, so it never clips on a narrow viewport). (Replaced the dead `TopBar` stub + the short-lived sticky in-paper bar — the bar read as separated from the page; controls-on-the-title-row is the merged design.) |
| `DomainSelector.tsx` | `'use client'`; admin/founder global domain scope picker (rendered by `PageControls`, gated on `isPrivileged`; only meaningful on the domain-aware pages leads/deals/campaigns). Composes `FilterDropdown` + `useUrlFilters` to write the SAME `?domain=` param those pages read (the DealsFilters mechanism), plus the `serene-domain` cookie (`persistDomainCookie`). **Reads `param ?? cookie`** (`readDomainCookie`, post-mount to avoid hydration mismatch) so its displayed value matches what the page renders even on a URL with no `?domain=` (the page resolves the same fallback server-side) — this is the fix for "selector resets on navigation". Shows the domain's own label when scoped, "All domains" (empty selection, no accent) otherwise. NOT a security boundary — pages ignore param + cookie for manager/agent. |
| `ThemeInitializer.tsx` | `'use client'`; corrective sync for the SSR theme + appearance cookies (`lib/constants/themes.ts` / `appearance.ts`). The root layout SSRs `data-theme` AND `data-neu` on `<html>` from the `serene-theme` / `serene-appearance` cookies (zero-flash first paint; `system` gets a pre-paint inline script); this component only flips the attributes when a cookie was missing/stale vs `profiles.theme` / `profiles.appearance` (via `applyAppearanceToDom` — also rewrites `<meta theme-color>`), re-writes the cookies for the next request, and owns the live `prefers-color-scheme` listener while the `system` appearance is active. |
| `IconInitializer.tsx` | `'use client'`; the `ThemeInitializer` twin for the SSR app-icon cookie (`lib/constants/app-icons.ts`). The root layout's `generateMetadata` builds the manifest `<link>` + apple-touch-icon from the `serene-app-icon` cookie; this component only re-writes the cookie from `profiles.app_icon` (new device / cleared cookie / choice made elsewhere) so the NEXT request's manifest link is right. No DOM mutation (the manifest link is metadata, and the installed icon is OS-owned) — cookie correctness for the next install is the whole job. Mounted in the dashboard layout beside `ThemeInitializer`. |
| `ServiceWorkerRegistration.tsx` | `'use client'`; registers `public/sw.js` in the **root** layout (production-only). The SW owns the offline shell AND (migration 0120) the additive Web Push `push`/`notificationclick` handlers. |

### Floating Elaya widget — `src/components/elaya/ElayaWidget.tsx` (mounted in the dashboard layout)

Lives in `components/elaya/`, but mounted **once in the dashboard layout** beside `<Sidebar>` /
`<ToastProvider>`, so it is a layout-level concern. `'use client'`; renders a circular `.serene-elaya-fab`
(globals.css — the `.serene-mobile-trigger` accent-washed-paper aesthetic, bottom-right = the corner
**opposite** the top-left nav hamburger) that opens a modal containing the **same `ElayaChatShell`** the
`/elaya` page renders. Contracts (never weaken):

- **Zero shell fork.** The widget renders `ElayaChatShell`, it does not reimplement chat. Seeding goes
  through `getElayaChatSeedAction()` → `resolveElayaChatSeed` (the SAME seed the `/elaya` RSC page uses,
  R-01) — same conversation, same daily cap.
- **Server boundary (A-15).** Imports only the `ElayaChatSeed` **type** from `elaya-service`; data comes
  from the action on each open. Never import a value symbol from a service into this client component.
- **Hidden on `/elaya`** (`pathname` check) — prevents two live shells on one conversation from
  double-streaming / double-counting the cap.
- **Portals to `document.body`** (button + modal) to escape any transformed shell ancestor (the Phase-6
  clipping fix — same rationale as `FloatingPanel`/`ConfirmDialog`). Heavy shell via `next/dynamic`
  (perf G-1). The desktop toast stack baseline is raised in `toast-provider.tsx` to clear the FAB.
- **Single-surface modal (DESIGN-DNA §15.3 Surface A — never re-nest).** The chat **is** the modal
  surface, not a card-in-a-card. The widget opens a `Dialog` with `bodyPadding={false}` +
  `hideCloseButton` and renders the shell with **`embedded`** (strips the card's own
  border/shadow/radius so it fills the panel flush) + **`onClose`** (the single close X lives in the
  shell's own refined presence header). Never wrap the shell back in the titled `Modal` — that
  reintroduces the double header. Full contract: `docs/modules/elaya.md` ("Floating chat widget").

### Web Push (PWA push notifications — migration 0120)

The notification **bell** (`NotificationBell`) is mounted in `PageControls` on each page's title row
when `TOP_BAR_ENABLED` (else the Sidebar footer — see the file table above). Its state comes from the
layout-mounted `<NotificationsProvider>` (seeds unread-only via `getMyNotificationsAction`). Web Push
is the bell's second delivery channel — fan-out lives
inside `createNotification` (see `src/components/notifications/CLAUDE.md` "Web Push — the second
channel" and `src/lib/services/CLAUDE.md`). The **mobile notification panel** is a docked bottom
sheet below md (portal-escaped from the transformed sidebar `<aside>`); the **subscribe control +
iOS install nudge** live in the profile "Notifications" SectionCard
(`components/profile/PushNotificationSettings.tsx`), not in the sidebar.

---

## canAccessRoute + Sidebar filtering

**Utility:** `src/lib/utils/route-access.ts` — `canAccessRoute(profile, pathname): boolean`

**Permission table:** `src/lib/constants/route-permissions.ts` — `DOMAIN_ROUTE_MAP` (domain → `string[]` of allowed route prefixes) and `ALWAYS_ALLOWED_PREFIXES`.

### Check order inside `canAccessRoute`

1. `admin` / `founder` → `true` immediately (full cross-domain access).
2. Workbench-domain member (`WORKBENCH_DOMAINS`, tech for now — every role) → `true` unless the path is in `WORKBENCH_BLOCKED_PREFIXES` (`/books`).
3. `ALWAYS_ALLOWED_PREFIXES` (`/dashboard`, `/profile`, …) → `true` for every authenticated user.
4. `DOMAIN_ROUTE_MAP[profile.domain]` prefix match → `true` when the pathname starts with an allowed prefix.
5. `false`.

### The other helpers in `route-access.ts` (2026-09-16)

| Helper | What it answers | Who calls it |
| --- | --- | --- |
| `hasElevatedPageAccess(profile)` | THE page-level "admin/founder only" gate. Admin, founder, or a workbench-domain member of any role. | Every admin/founder page redirect (`/sia`, `/freshdesk`, `/vendors`, `/admin/*`, `/settings/*`, `/error-log`). `/books` keeps a literal admin/founder check on purpose. |
| `hasManagerPageAccess(profile)` | THE page-level "manager and above" gate: manager, or anyone the elevated gate admits. | `/oversight`, `/campaigns`, `/budget`, `/settings`, `/admin/elaya-training`, `/admin/users/[id]`. |
| `isNavVisible(profile, href)` | Whether a nav entry is LISTED: `canAccessRoute` AND, for the founder, membership of `FOUNDER_NAV_PREFIXES`. Never an authorization check. | Sidebar (all four sections) and the command palette's Go-to pages. |

Server actions do NOT use these — they keep `requireProfile(roles)`. Widening page access for
the workbench never widens a write: a tech agent opens `/vendors`, and a save from it still
returns "unauthorized" until the action's role list says otherwise.

### Sidebar usage

`Sidebar.tsx` computes each section's list once with `isNavVisible`, on top of the role flags
(`isPrivileged = hasElevatedPageAccess`, `isManager = hasManagerPageAccess`), and renders a
section only when its list is non-empty (the founder's curated nav leaves Configuration empty —
no orphan header):

```tsx
const mainNav = MAIN_NAV.filter((item) => isNavVisible(profile, item.href));
const analyticsNav = profile.role === "guest" ? [] : ANALYTICS_NAV.filter(
  (item) => (isManager || item.href === "/performance" || item.href === "/escalations") && isNavVisible(profile, item.href),
);
const configurationNav = isManager ? getConfigurationNav(isPrivileged).filter((item) => isNavVisible(profile, item.href)) : [];
const adminNav = isPrivileged ? ADMIN_NAV.filter((item) => isNavVisible(profile, item.href)) : [];
```

**The founder's sidebar** is `FOUNDER_NAV_PREFIXES` in `route-permissions.ts` (Dashboard, Elaya,
Clients, Leads, Tasks, Vendors, Subscriptions, Notes, Performance, Oversight, Sia, Freshdesk,
Books, Suggestions). It is visibility only — the founder still reaches every route, so deep links
(a lead's deal, `/whatsapp`) keep working. Admins see everything.

**Rule:** `canAccessRoute` is a pure util — zero imports from `lib/services/`, `next/headers`, or `next/server`. It is safe to call inside `'use client'` components.

### Layout guard (server-side)

`src/app/(dashboard)/layout.tsx` enforces the same rule on the server:

```ts
const pathname = (await headers()).get('x-pathname') ?? '/';
if (!canAccessRoute(profile, pathname)) redirect('/dashboard');
```

`x-pathname` is forwarded by `src/proxy.ts` via `response.headers.set('x-pathname', request.nextUrl.pathname)`.

**Redirect loop prevention:** `/dashboard` is in `ALWAYS_ALLOWED_PREFIXES`, so a user redirected there always passes the check on the next render — no loop possible.

### Adding a new route to a domain

Edit `DOMAIN_ROUTE_MAP` in `src/lib/constants/route-permissions.ts`. No other file changes needed — the layout guard and Sidebar filtering both read from that map. To change what the founder sees, edit `FOUNDER_NAV_PREFIXES`; to end the tech workbench arrangement, remove `'tech'` from `WORKBENCH_DOMAINS`.

### Adding a new domain

1. Add the domain to the DB enum + `APP_DOMAINS` in `src/lib/constants/domains.ts`.
2. Add its allowed prefixes to `DOMAIN_ROUTE_MAP` in `src/lib/constants/route-permissions.ts`.

---

## Page controls + global domain selector (`TOP_BAR_ENABLED`)

The global notification bell + the admin/founder domain selector are rendered **inline on each
page's title row** via `<PageControls>` (right side, beside the page CTA) — no separate bar; they
read as part of the page. The whole feature is one boolean — `TOP_BAR_ENABLED` in
`src/lib/constants/feature-flags.ts`. Flip it to revert.

> **History:** v1 mounted these in a persistent bar (first in the canvas gutter, then a sticky
> in-paper strip). Both read as *separated* from the page, so the bar was removed in favour of
> controls-on-the-title-row. There is no `TopBar.tsx` anymore.

### The single revert hinge

`TOP_BAR_ENABLED` gates the page-row controls and the Sidebar footer bell in lockstep, so exactly
one `NotificationBell` is ever alive:

| Flag | Title-row controls | Bell home | Sidebar footer bell |
| --- | --- | --- | --- |
| **on** | `<PageControls>` on each page | page title row (`PageControls`) | not rendered |
| **off** | none | Sidebar footer (as before) | rendered |

Each page does `{TOP_BAR_ENABLED && <PageControls isPrivileged={…} />}` in its title row;
`Sidebar.tsx` does `{!TOP_BAR_ENABLED && <footer bell>}`. Neither seeds — the bell reads state
from `<NotificationsProvider>` (mounted once in the dashboard layout). Both states render exactly
one bell.

### Single provider mount (the failure-mode guard, 2026-07-10)

Notification inbox state (Realtime subscription + chime + optimistic mark-read/all) is owned by ONE
`<NotificationsProvider userId={profile.id}>` (`src/components/layout/NotificationsProvider.tsx`)
mounted once in the dashboard layout — so the subscription SURVIVES navigation (before this the bell
lived in `PageControls`, which remounts on every route change, tearing down and recreating the
Realtime channel per navigation and dropping any INSERT that landed in the gap). `NotificationBell`
now takes no seed prop; `useNotifications` is `useContext(NotificationsContext)`. The channel is
still named `notifications:${userId}:${mountId}` (a `useId()` suffix, P-06 Strict-Mode safety) but
there is now only ONE subscription regardless of how many bells render. The provider seeds
UNREAD-only on mount via `getMyNotificationsAction`. Never add a second provider mount.

### Where PageControls is wired

Every primary page with a standard server title row renders `PageControls` (bell always; selector
when `isPrivileged`): leads, deals, campaigns (selector ON — domain-aware), tasks, performance (all
3 role branches), helpdesk, budget, escalations, settings, elaya, admin/users (bell-only). Dashboard
has no server title row — its bell rides the `DashboardCanvas` header cluster (`PageControls` reads
state from the layout provider, no seed threaded in). **`/whatsapp` is the one exception** —
full-bleed chat, no title row, no bell (reachable on every other page).

### Domain selector → `param ?? cookie` (the navigation-persistence fix)

`DomainSelector` (admin/founder only; rendered with `isPrivileged` on leads/deals/campaigns) writes
the SAME `?domain=` param those pages read — via `useUrlFilters` (`resetKeys: ['page']`), the
`DealsFilters` mechanism — so a pick re-scopes the current page immediately. It also writes the
`serene-domain` cookie (`persistDomainCookie` in `domains.ts`, mirrors `serene-theme`).

**The selector reads `param ?? cookie`** (`readDomainCookie`, applied post-mount via a `mounted`
flag to avoid a hydration mismatch — SSR/first paint use the param alone, matching the server). This
is the fix for "selector resets when navigating leads → deals": the URL often has no `?domain=` after
a cross-page nav, but the page renders the cookie scope, so the selector must read the same fallback
or it would wrongly show "All domains" while the data is scoped.

**Param-first, cookie-fallback (server) — ONE shared resolver:**
`resolveDomainParam(searchParams, cookieStore, role)` in `src/lib/utils/domain-scope.ts`
(server-only) is THE single domain-scope resolver. It owns the whole decision — searchParams
`domain` extraction, the role gate, and the cookie fallback: **admin/founder → `param ?? cookie ?? null`;
manager/agent → always `null`** (force-scoped server-side; neither param nor cookie is read for them).
`leads`/`deals`/`campaigns` each call it in place of their old inline
`parseGiaDomainParam(getString('domain'))` + admin/founder branch. **Cookie logic lives ONLY here —
never inline a `serene-domain` read in a page.** The caller passes the already-awaited
`searchParams` + `await cookies()` so the resolver is synchronous. **Not a security boundary:** it
returns `null` for manager/agent regardless of input, and the page parsers + service role-gates
remain the authority (campaigns also re-locks manager to `callerDomain` at the page layer — its
two-layer lock). (Replaced the earlier `resolveAdminFounderDomain(paramValue)`, which took a
pre-extracted string and left the extraction + role branch inline per page.)

A per-page filter-bar domain change (`DealsFilters`/`LeadsFilters`) writes the same param and
overrides the selector for that page only; navigating away drops it back to the cookie value.
