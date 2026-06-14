# Auth, RBAC & Routing

> **Purpose:** Enforce domain-scoped access to authenticated routes via session-based authorization
> (`requireProfile`), a pure route gate (`canAccessRoute`), and domain-prefix matching — at both the
> server-layout and the client-sidebar layers.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## How it fits together

1. **Session refresh** — `src/proxy.ts` (Next.js 16, replaces `middleware.ts`; **there is no
   `src/middleware.ts`**) gates `/api/webhooks`, calls `updateSession()` on auth routes, and sets the
   `x-pathname` header used by the layout guard.
2. **Server action guard** — `requireProfile(roles?)` (`lib/actions/_auth.ts`) is the first line after Zod
   in every session action: returns `{ ok: true, profile }` or `{ ok: false, result }`. Both failure paths
   return the unified `formErrors.unauthorized`. **Never hand-roll `getCurrentProfile()` + role checks**
   (A-18). Exceptions are listed in `lib/actions/CLAUDE.md`.
3. **Route gate** — `canAccessRoute(profile, pathname)` (`lib/utils/route-access.ts`) is **pure** (safe in
   `'use client'`): admin/founder bypass → `ALWAYS_ALLOWED_PREFIXES` (`/dashboard`, `/profile`, `/helpdesk`,
   `/elaya`) → domain-prefix match in `DOMAIN_ROUTE_MAP` → else false.
4. **Two enforcement layers:** (a) server — `(dashboard)/layout.tsx` reads `x-pathname`, calls
   `canAccessRoute`, redirects to `/dashboard` if denied (no loop, since `/dashboard` is always allowed);
   (b) client — `Sidebar.tsx` filters nav items through the same `canAccessRoute`.

---

## Key rules

- **Authorization reads only from `public.profiles`** (Rule 09) — JWT claims are never trusted.
- **One Supabase client per context** (Rule 05): `client.ts` (browser), `server.ts` (RSC/actions),
  `admin.ts` (service-role), `middleware.ts` (refresh).
- **`canAccessRoute` is pure** — zero service imports, so it's safe to call from the client sidebar.
- **The admin client bypasses RLS** — only used by jobs and actions that supply session-derived scope args.

---

## File map

| File | Role |
|---|---|
| `src/lib/supabase/client.ts` | Browser Supabase singleton (only place) |
| `src/lib/supabase/server.ts` | Server client (only place); wraps `cookies()` |
| `src/lib/supabase/admin.ts` | Service-role client (only place); bypasses RLS |
| `src/lib/supabase/middleware.ts` | `updateSession()` refresh helper |
| `src/proxy.ts` | Next.js 16 proxy; webhook gate, session refresh, `x-pathname` |
| `src/lib/actions/_auth.ts` | `requireProfile(roles?)` — THE session/role guard |
| `src/lib/constants/route-permissions.ts` | `ALWAYS_ALLOWED_PREFIXES`, `DOMAIN_ROUTE_MAP` |
| `src/lib/utils/route-access.ts` | `canAccessRoute(profile, pathname)` — pure check |
| `src/app/(dashboard)/layout.tsx` | Server guard: `canAccessRoute`, redirect if denied |
| `src/components/layout/Sidebar.tsx` | Client nav filter via `canAccessRoute` |
