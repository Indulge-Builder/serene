# Layout Components — CLAUDE.md

## Files

| File | Role |
| --- | --- |
| `Sidebar.tsx` | `'use client'`; primary nav, user footer, notification bell. |
| `TopBar.tsx` | `'use client'`; page-level topbar (breadcrumb, search). |
| `ThemeInitializer.tsx` | `'use client'`; corrective sync for the SSR theme cookie (`lib/constants/themes.ts`). The root layout SSRs `data-theme` on `<html>` from the `serene-theme` cookie (zero-flash first paint); this component only flips the attribute when the cookie was missing/stale vs `profiles.theme` and re-writes the cookie for the next request. |

---

## canAccessRoute + Sidebar filtering

**Utility:** `src/lib/utils/route-access.ts` — `canAccessRoute(profile, pathname): boolean`

**Permission table:** `src/lib/constants/route-permissions.ts` — `DOMAIN_ROUTE_MAP` (domain → `string[]` of allowed route prefixes) and `ALWAYS_ALLOWED_PREFIXES`.

### Check order inside `canAccessRoute`

1. `admin` / `founder` → `true` immediately (full cross-domain access).
2. `ALWAYS_ALLOWED_PREFIXES` (`/dashboard`, `/profile`) → `true` for every authenticated user.
3. `DOMAIN_ROUTE_MAP[profile.domain]` prefix match → `true` when the pathname starts with an allowed prefix.
4. `false`.

### Sidebar usage

`Sidebar.tsx` applies `canAccessRoute` as an additional filter on top of existing role guards:

```tsx
// MAIN_NAV — domain filter only
MAIN_NAV.filter((item) => canAccessRoute(profile, item.href))

// ANALYTICS_NAV — role guard preserved; domain filter added as &&
ANALYTICS_NAV.filter(
  (item) => (isManager || item.href === "/performance") && canAccessRoute(profile, item.href),
)

// Configuration nav — isManager gate already present; domain filter added
getConfigurationNav(isPrivileged).filter((item) => canAccessRoute(profile, item.href))

// ADMIN_NAV — isPrivileged gate is sufficient; admin/founder always bypass domain check
```

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

Edit `DOMAIN_ROUTE_MAP` in `src/lib/constants/route-permissions.ts`. No other file changes needed — the layout guard and Sidebar filtering both read from that map.

### Adding a new domain

1. Add the domain to the DB enum + `APP_DOMAINS` in `src/lib/constants/domains.ts`.
2. Add its allowed prefixes to `DOMAIN_ROUTE_MAP` in `src/lib/constants/route-permissions.ts`.
