# Auth Pages & Session — Page Spec

> **Purpose:** spec for the pre-auth surfaces (`/login`, `/forgot-password`, `/update-password`), the root redirect, the auth callback, and the end-to-end session flow.
> **Audience:** engineers. · **Source-of-truth scope:** the `(auth)` route group + session flow as experienced by the user. The session *architecture* (proxy, clients, route gates, RBAC) lives in `../architecture/auth-and-rbac.md`; `/profile` lives in `profile.md`; visual law for the canvas-dark auth surface: `../design/DESIGN-DNA.md` §3.7.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure.

## 1. Purpose

How users enter Serene: email+password login, password-reset email, and new-password set (after
magic link / reset). The auth pages are the one surface that is dark by design — canvas
palette, no paper, no app chrome.

## 2. Who sees it

Public (unauthenticated) routes — no session gate in the `(auth)` layout. Authenticated users
hitting `/` are redirected to `/dashboard`; deactivated users are gated twice (at
`loginAction` and in the dashboard layout).

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Actions | `auth.ts` — `loginAction` (+ `is_active` check; the documented non-authorization profile read), `requestPasswordResetAction` (never reveals email existence — S-09), `updatePasswordAction`, `signOutUser` |
| Callback | `GET /api/auth/callback` — exchanges the Supabase auth code for a session (magic-link invite + password-reset landing), then redirects into the app |
| Validation | `validations/auth.ts`; errors via `form-errors.ts` |
| Session | proxy + `updateSession()` + client factories — `../architecture/auth-and-rbac.md` §7 |

## 4. Components

`LoginForm`, `ForgotPasswordForm`, `UpdatePasswordForm`, `InvalidLinkCard`,
`PasswordStrengthBar` (4-segment danger→success). All draw from the canvas/sidebar palette —
`--theme-paper*`, `.serene-input`, and light `--color-*-light` tokens are forbidden on auth
surfaces (dark-surface semantic tokens instead).

## 5. States

- **Loading:** button-level pending states (width-preserving spinner swap) — no skeletons on auth.
- **Empty:** n/a.
- **Error:** inline message bars; fields never cleared; auth errors never reveal account existence.

## 6. Invariants

Deep dive §10 — webhook paths never run `updateSession()`; `x-pathname` set on every
non-webhook response; deactivated users double-gated; reset completes at `/login`; one browser
client; zero-flash theme.

## 7. Open items

`last_seen_at` presence tracking is schema-ready but **not wired** (no code writes it) — a
future proxy/action must rate-limit to once per minute when implemented.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document. The former §3 (Supabase
> client files), §4 (proxy session layer), and §7 (`/profile`) now live in
> `../architecture/auth-and-rbac.md` and `profile.md`.

### 1. Module Overview

Three distinct layers make up how users enter, stay in, and manage their identity inside Serene:

1. **Pre-auth pages** — unauthenticated surfaces (`/login`, `/forgot-password`, `/update-password`) inside the `(auth)` route group. No sidebar, no dashboard shell, canvas background with ambient motion layers.
2. **Session infrastructure** — `src/proxy.ts` (Next.js 16 proxy), `src/lib/supabase/middleware.ts` (`updateSession()`), and the two Supabase client factories (`client.ts` / `server.ts`). Keeps the Supabase session cookie fresh on navigations.
3. **Profile self-management** — `/profile` inside `(dashboard)`. Any authenticated user edits **only their own** `profiles` row. Admins edit other users at `/admin/users/[id]`, not here.

#### Route group structure

| Group | Path prefix | Layout | Session behaviour |
| ----- | ----------- | ------ | ----------------- |
| `(auth)` | `/login`, `/forgot-password`, `/update-password` | `src/app/(auth)/layout.tsx` — centered card on canvas, no app chrome | No session gate in layout; pages are public |
| `(dashboard)` | `/dashboard`, `/profile`, `/leads`, … | `src/app/(dashboard)/layout.tsx` — sidebar + floating paper surface | **Hard gate (4 stages):** `getUser()` null → `/login`; `getCurrentProfile()` null → `/login`; `!is_active` → `/login`; `!canAccessRoute(profile, pathname)` → `/dashboard` |

Root layout (`src/app/layout.tsx`) sets default `data-theme="earth"`, font variables on `<html>`, and global CSS. Dashboard layout applies the user’s saved theme before paint via `ThemeInitializer`.

---

### 2. Root Route — `src/app/page.tsx`

```ts
export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");
  redirect("/login");
}
```

**What it checks:** `getUser()` — a real session probe on `/` using the server Supabase client.

**Redirect target:** `/dashboard` when a session exists; `/login` otherwise.

**Implication:** A user with a valid cookie who visits `/` is sent straight to `/dashboard`. Only unauthenticated visitors land on `/login`. The deeper session/profile/route protection for authenticated work still happens in `(dashboard)/layout.tsx`; `/` is just a fast top-level gate.

---

### 5. Pre-Auth Pages

> **Visual language is canvas-dark, not paper.** All three auth pages render *on the canvas*
> (`--theme-canvas`), never on the paper surface. Cards, inputs, links, and text all draw from the
> **canvas/sidebar palette** — never `--theme-paper`, `.serene-paper-surface`, or `.serene-input`. The full
> token-level spec lives in **`DESIGN-DNA.md` → "Auth Surface (canvas-dark)"**; §5e below is the
> module summary. Established 2026-06-02; brand-header dot added thereafter.

#### 5a. `(auth)` layout — `src/app/(auth)/layout.tsx`

**Provides:**

- Full-viewport centered shell (`relative min-h-dvh flex items-center justify-center overflow-hidden`, background `var(--theme-canvas)` set inline to prevent a white flash before CSS loads).
- Two off-centre radial glows using `--theme-canvas-glow` (primary `ellipse 80% 60% at 62% 38%`, transparent at 70%; secondary `ellipse 55% 45% at 18% 78%`, transparent at 68%, `opacity: 0.55`). Centred glow is a spotlight; off-centre is a window.
- Two CSS orb animations (`globals.css`) — `.serene-auth-orb-a` (680px, upper-right `top:-20% right:-18%`, `serene-orb-float-a` 24s) and `.serene-auth-orb-b` (560px, lower-left `bottom:-22% left:-16%`, `opacity:0.7`, `serene-orb-float-b` 30s). Both are accent-tinted radial gradients (`color-mix(--theme-accent 9%)` / `6%`), `will-change: transform`, transform-only — M-06 compliant.
- **No** sidebar, top bar, or paper content card from the dashboard shell.

**Removed 2026-06-02** (see `(auth)/CLAUDE.md`): the SVG noise-texture div and the two diagonal accent lines (`.serene-auth-line-1/2`) — parse cost not worth the subtle effect. The two radial glows and two orbs are **kept**.

**If session already present:** The auth layout does **not** redirect. A logged-in user can still open `/login`. Successful login always `redirect("/dashboard")` from the action; visiting `/login` manually while authenticated shows the login form unless the user navigates away.

#### 5b. `/login`

| Item | Detail |
| ---- | ------ |
| **Page** | `src/app/(auth)/login/page.tsx` → `LoginForm` (`login-form.tsx`) |
| **Fields** | `email`, `password` — password field **has** an Eye/EyeOff visibility toggle (`showPassword` state, `lucide-react` `Eye`/`EyeOff`, **15px / strokeWidth 1.5**, `type="button"`, `tabIndex={-1}`, absolute-right, colour `--theme-sidebar-text`) |
| **Submit copy** | "Sign In" / "Signing in…" (pending). `Button variant="primary"` full-width + `--shadow-accent-glow` |
| **Action** | `loginAction` in `src/lib/actions/auth.ts` via `useActionState` |
| **Supabase** | `signInWithPassword({ email, password })` using **server** client (`createClient()` from `server.ts`) |
| **Deactivation gate** | After a successful `signInWithPassword`, the action calls `getCurrentProfile()`; if `profile.is_active === false` it immediately `signOut()`s and returns `formErrors.accountDeactivated` ("Your account has been deactivated. Please contact your administrator.") — a deactivated user can never establish a usable session at the login step |
| **Success** | `redirect("/dashboard")` |
| **Errors** | Bad email/password or Supabase auth failure → `formErrors.invalidCredentials` ("The email or password you entered is incorrect."); deactivated account → `formErrors.accountDeactivated`. No separate "unconfirmed email" branch in code |
| **Remember me** | None — Supabase cookie persistence handles session length |
| **Forgot link** | `/forgot-password` |

**Validation:** the action uses a **local** `loginSchema` defined inline in `auth.ts` — `email` required + format (`email_invalid`), `password` **min 1 char** (`required`). Any parse failure collapses to `formErrors.invalidCredentials` (it never tells the user which field failed). The exported `loginSchema` in `src/lib/validations/auth.ts` (password min 8) is **not** the one `loginAction` uses — the action has its own min-1 schema so existing short passwords can still sign in.

#### 5c. `/forgot-password`

| Item | Detail |
| ---- | ------ |
| **Page** | `forgot-password/page.tsx` → `ForgotPasswordForm` |
| **Field** | `email` |
| **Action** | `requestPasswordResetAction` |
| **Supabase** | `resetPasswordForEmail(email, { redirectTo: \`${siteUrl}/api/auth/callback?next=/update-password\` })` where `siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? <localhost:3000 fallback>` |
| **Success UX** | Inline success copy — **no redirect**. User must check email. |
| **Email enumeration** | **Always returns success** after valid email format — never reveals whether the address exists (Rule S-09). |
| **Invalid email format** | `formErrors.email` |

**What the user receives:** Supabase recovery email linking to `/api/auth/callback` with `token_hash` + `type=recovery` (or PKCE `code` in same-browser case). Callback verifies and redirects to `/update-password`.

#### 5d. `/update-password`

| Item | Detail |
| ---- | ------ |
| **Arrival** | User clicked reset link → `/api/auth/callback` establishes session → redirect `next=/update-password` |
| **Session gate (page)** | Server component calls `getUser()`; if no user → `InvalidLinkCard` (request new link). `?error=link_expired` from failed callback → expired copy |
| **Fields** | `password`, `confirmPassword` |
| **Action** | `updatePasswordAction` (server) — `updateUser({ password })` after Zod |
| **Success** | Success panel + link to **`/login`** (not auto-redirect to dashboard) |
| **Strength bar** | **Present** — `update-password-form.tsx` renders `<PasswordStrengthBar password={newPassword} />` under the new-password field. (The `/profile` `PasswordChangeForm` also uses it; this page is **not** an exception.) |
| **Schemas** | `updatePasswordSchema` (`src/lib/validations/auth.ts`) — `password` min 8 / max 72, `confirmPassword` min 1, `passwordMismatch` refine on `confirmPassword`. On parse failure the action maps `passwordMismatch` → `formErrors.passwordMismatch`, everything else → `formErrors.passwordTooShort`; a Supabase `updateUser` error → `formErrors.generic` |

**Auth callback** (`src/app/api/auth/callback/route.ts`):

1. `token_hash` + `type` → `verifyOtp` (recovery emails, any device).
2. Else `code` → `exchangeCodeForSession` (PKCE / same-browser magic links).
3. Failure → `/update-password?error=link_expired`.

#### 5e. Auth visual language (canvas-dark) — module summary

All three forms + `InvalidLinkCard` share one shell. Canonical token spec: **`DESIGN-DNA.md` →
"Auth Surface (canvas-dark)"**. CSS classes live in `src/app/globals.css`.

**Outer wrapper (every form):** `relative w-full mx-4`, `maxWidth: 26rem`, `zIndex: var(--z-raised)`
— lifts the card above the layout's glows/orbs.

**Card — `.serene-auth-card`:**

| Property | Value |
| -------- | ----- |
| Background | `var(--theme-sidebar-hover-bg)` (dark, not paper) |
| Border | `1px solid var(--theme-sidebar-border)` |
| Radius | `var(--radius-xl)` |
| Shadow | `var(--shadow-3)` |
| Padding (inline) | `var(--space-10) var(--space-8)` |

**Unified brand header** (identical on all three forms + `InvalidLinkCard`):

- `next/image` `/logo.webp` at `48×48`, `borderRadius: var(--radius-sm)`, `priority`.
- `<h1>`: `--font-serif`, `--text-3xl`, **`--weight-light`**, `--tracking-tighter`, `--leading-tight`,
  colour `--theme-canvas-text`, centred — text **`Serene`** followed by
  `<span className="page-title-dot">.</span>` (the accent blink dot).
- Container `flex flex-col items-center gap-3`, `mb-10` on forms / `mb-8` on `InvalidLinkCard`.
- **No subtitle.**

> ⚠️ The brand-header **`page-title-dot`** is the one place the dot appears off a primary nav page.
> It post-dates the 2026-06-02 `(auth)/CLAUDE.md` note that shows the header without it — code is the
> source of truth here.

**Inputs — `.serene-input-auth`:** `--theme-canvas` bg, `1px solid --theme-sidebar-border`,
`--theme-canvas-text` text, `--radius-sm`, `--space-3/--space-4` padding, `--text-sm`. Placeholder
`--theme-sidebar-text`. Focus: border `--theme-accent` + `box-shadow: 0 0 0 3px var(--theme-accent-surface)`.
Password fields add `paddingRight: var(--space-10)` for the toggle.

**Labels:** `className="label-micro"` **with an inline override** `color: var(--theme-sidebar-text)` —
`label-micro` renders dark (paper-tuned) by default and must be lightened on the dark card.

**Links — `.serene-auth-link`:** `--text-xs`, `color-mix(--theme-accent 65%, transparent)` at rest →
full `--theme-accent` on hover. Used for "Forgot your password?" and "Back to sign in".

**Error banners (dark-surface tokens — never the light `-light` variants):**

```text
color:           var(--color-danger-dark-text)
backgroundColor: var(--color-danger-dark-fill)
border:          1px solid var(--color-danger-dark-border)
radius:          var(--radius-xs)
padding:         var(--space-2) var(--space-3)
fontSize:        var(--text-xs)
role:            "alert"
```

**Primary "result" links** (success panels + `InvalidLinkCard` "Request New Link"): full-width block
`var(--theme-accent)` bg / `var(--theme-accent-fg)` text, `--radius-sm`, `--space-3/--space-4` padding,
`--weight-semibold`, `--tracking-wide` — styled inline (not a `<Button>`) because they are `<Link>`s.

**Submit buttons:** `Button variant="primary"` full-width with `boxShadow: var(--shadow-accent-glow)`,
`loading={isPending}`. Per-page copy: Login "Sign In/Signing in…"; Forgot "Send Reset Link/Sending…";
Update "Update Password/Updating…".

**Eye/EyeOff toggle (login + update-password):** absolute-right, `translateY(-50%)`, transparent
`<button type="button" tabIndex={-1}>`, icon `15px` / `strokeWidth 1.5`, colour `--theme-sidebar-text`.
On `/update-password` a shared `<EyeToggle>` helper drives both new + confirm fields off one `showNew`
state.

**Forbidden on auth forms:** `.serene-paper-surface`, `.serene-input`, `--theme-paper*` text/bg tokens, and
the light `--color-danger-light/-text` error variants. Those are paper-surface tokens.

---

### 6. `(dashboard)` Layout — `src/app/(dashboard)/layout.tsx`

#### Session gate

The layout runs a **four-stage gate** in order:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");

const profile = await getCurrentProfile();
if (!profile) redirect("/login");
if (!profile.is_active) redirect("/login");

const pathname = (await headers()).get("x-pathname") ?? "/";
if (!canAccessRoute(profile, pathname)) redirect("/dashboard");

const initialNotifications = await getNotifications(profile.id);
```

| Failure mode | Behaviour |
| ------------ | --------- |
| No auth user | `redirect("/login")` |
| Auth user but no `profiles` row (or RLS blocks read) | `redirect("/login")` |
| Deactivated user (`is_active = false`) | `redirect("/login")` — the layout **does** enforce `is_active`, as a second line of defence behind the login-action deactivation gate |
| Authenticated + active, but route not permitted for the user's domain | `redirect("/dashboard")` (not `/login`) — `canAccessRoute(profile, pathname)` evaluated against the `x-pathname` header the proxy set |

`getCurrentProfile()` → `getUser()` then `getProfileById(user.id)`. RLS `profiles_select` allows any authenticated user to read all profiles.

`canAccessRoute` is a pure function (`src/lib/utils/route-access.ts`) reading `ALWAYS_ALLOWED_PREFIXES` + `DOMAIN_ROUTE_MAP` from `src/lib/constants/route-permissions.ts`. The pathname comes from the `x-pathname` response header set in `src/proxy.ts` — without that header the guard would default to `"/"`.

Also prefetches `getNotifications(profile.id)` for the sidebar bell.

#### Zero-flash theme — `ThemeInitializer`

**Current implementation:** `src/components/layout/ThemeInitializer.tsx` — a **client** component rendered at the top of the dashboard layout:

```tsx
const safeTheme = ["earth", "air", "water", "fire", "cosmos"].includes(profile.theme)
  ? profile.theme
  : "earth";

<ThemeInitializer theme={safeTheme} />
```

```ts
useLayoutEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
}, [theme]);
```

| Topic | Detail |
| ----- | ------ |
| **Reads** | `profile.theme` from server-rendered `getCurrentProfile()` |
| **Writes** | `data-theme` on `<html>` |
| **Fallback** | Invalid or missing theme → `"earth"` |
| **Why not a deferred client-only effect** | `useLayoutEffect` runs synchronously after DOM commit, **before** the browser paints — avoids one frame of wrong tokens |
| **Historical note** | Older builds used an inline `<script>` in this layout; the behaviour goal is unchanged (paint-free theme), the mechanism is now `ThemeInitializer` |

**Source of truth for theme:** `profiles.theme` in Postgres — **not** localStorage. `ThemeSelector` updates DB via `updateProfile`; layout + initializer apply on every navigation.

#### Font variables — root layout

`src/app/layout.tsx`:

- `Inter` → CSS variable `--font-geist-sans`
- `Playfair_Display` → `--font-playfair`
- Applied as `className` on `<html>` alongside default `data-theme="earth"`
- Consumed in `src/styles/design-tokens.css` as `--font-sans` / `--font-serif`

#### Dashboard chrome

- `ThemeInitializer` rendered first (sets `data-theme` before paint), then the shell.
- Outer shell: `<div className="layout-shell flex">` with inline `gap: var(--space-3)`, `height: 100dvh`, `overflow: hidden`.
- `Sidebar` with `profile` + `initialNotifications`, followed by `ToastProvider` at shell root.
- Canvas gutter column (`flex: 1`, `var(--theme-canvas)` background, `padding: 12px 12px 12px 0`) wraps the inner paper column.
- Inner paper column: `var(--theme-paper)`, `var(--radius-xl)`, `var(--shadow-paper)`, `overflowY: auto` / `overflowX: hidden` scrollable content holding `{children}`.

---

### 8. Actions

#### `updateProfile`

| Item | Detail |
| ---- | ------ |
| **Who** | Own profile, or admin/founder editing any user (admin forms reuse this action) |
| **Fields** | `full_name`, `username`, `job_title`, `phone`, `theme`, `timezone` (all optional except `id`) |
| **Phone** | `normalizeToE164` when provided |
| **Sanitize** | `sanitizeText` on `full_name`, `job_title` |
| **revalidatePath** | `/profile`, `/admin/users`, `/admin/users/${id}` |
| **Returns** | `ActionResult<Profile>` — `{ data, error }`, never throws |

#### `updateProfileAvatar`

| Item | Detail |
| ---- | ------ |
| **Who** | Own profile, or admin/founder |
| **Writes** | `avatar_url` (public URL after client upload) |
| **Validation** | Zod `.url()`; no bucket-prefix enforcement in code |
| **revalidatePath** | `/profile` |

#### `signOutUser`

| Item | Detail |
| ---- | ------ |
| **Who** | Any authenticated user |
| **Supabase** | `auth.signOut()` via server client |
| **Redirect** | `/login` |

#### Auth actions (`src/lib/actions/auth.ts`) — reference

| Export | Role |
| ------ | ---- |
| `loginAction` | Pre-auth sign-in |
| `signOut` | Sign out + `/login` (duplicate of profile sign-out) |
| `requestPasswordResetAction` | Forgot-password email |
| `updatePasswordAction` | Post-recovery password set |

---

### 9. Session Flow — End-to-End

```mermaid
sequenceDiagram
  participant U as User
  participant L as /login
  participant A as loginAction
  participant P as proxy.ts
  participant D as Dashboard layout
  participant Pr as /profile

  U->>L: Submit email/password
  L->>A: FormData
  A->>A: signInWithPassword
  A-->>U: redirect /dashboard
  loop Each navigation
    U->>P: HTTP request
    P->>P: updateSession (unless /api/webhooks)
    P-->>D: refreshed cookies
  end
  D->>D: getUser + getCurrentProfile
  D->>D: ThemeInitializer sets data-theme
  U->>Pr: Open profile
  Pr->>Pr: getCurrentProfile
  U->>Pr: Change theme
  Pr->>Pr: DOM instant + updateProfile async
  U->>Pr: Sign out
  Pr->>Pr: signOutUser
  Pr-->>U: redirect /login
```

**Ordered lifecycle (six steps):**

1. User visits `/login` → `loginAction` → `signInWithPassword` → deactivation check (`is_active`) → session cookie set → `redirect("/dashboard")`. (A deactivated account is signed back out here with `accountDeactivated`.)
2. Dashboard layout runs the 4-stage gate (`getUser` → `getCurrentProfile` → `is_active` → `canAccessRoute`); renders shell with `ThemeInitializer(theme)`.
3. Every subsequent matched request → `proxy.ts` → `updateSession()` refreshes session cookies **and sets `x-pathname`** (`last_seen_at` **not** updated in code today).
4. User visits `/profile` → server renders with `profile.theme` → `ThemeInitializer` applies `data-theme` before paint.
5. User changes theme → instant `setAttribute` on `<html>` + async `updateProfile({ theme })` → persisted in `profiles.theme`.
6. User clicks Sign out → `signOutUser` → cookie cleared → `/login`.

---

### 10. Known Invariants (must never be violated)

| Invariant | Source |
| --------- | ------ |
| `/api/webhooks/*` must never run `updateSession()` | `src/proxy.ts` early return + matcher exclusion |
| Proxy must set `x-pathname` on every non-webhook response — the dashboard layout's route guard depends on it | `src/proxy.ts` |
| Deactivated users (`is_active = false`) are gated **twice**: at `loginAction` (sign out + `accountDeactivated`) and in the dashboard layout (`redirect("/login")`) | `loginAction`, `(dashboard)/layout.tsx` |
| Dashboard layout must run `canAccessRoute(profile, pathname)`; a disallowed route → `redirect("/dashboard")` (never `/login`) | `(dashboard)/layout.tsx` + `route-access.ts` |
| Root `/` redirects authenticated users to `/dashboard`, unauthenticated to `/login` | `src/app/page.tsx` |
| `last_seen_at` must be rate-limited to once per minute **when implemented** — not on every request | original spec intent — **not yet in proxy** |
| Theme source of truth is `profiles.theme`, not localStorage | Dashboard layout + `ThemeSelector` |
| Theme null / invalid → always `"earth"` | Dashboard layout `safeTheme` guard |
| `email` is read-only on `/profile` — source of truth is `auth.users` | `ProfileDetailsForm` |
| `PasswordChangeForm` uses browser client only — not a server action | `PasswordChangeForm.tsx` |
| Zero-flash theme must run before paint (`ThemeInitializer` / `useLayoutEffect`, not `useEffect`) | `ThemeInitializer.tsx` |
| Avatar upload: 2 MB max validated client-side before upload | `ProfileAvatarSection.tsx` |
| Forgot-password must not reveal whether email exists | `requestPasswordResetAction` |
| One browser Supabase client — `createClient()` from `client.ts` only | Rule 05 |
| One server Supabase client per request — `server.ts` only in services/actions | Rule 05 |
| Notification sound preference: `serene:notifications:sound:v1` in localStorage — separate from theme DB field; no `/profile` control | `useNotificationSound.ts` |
| Password reset completes at `/login` after success, not `/dashboard` | `UpdatePasswordForm` success link |
| `/update-password` shows `PasswordStrengthBar` under the new-password field — it is **not** an exception to the strength-bar pattern | `update-password-form.tsx` |

---

