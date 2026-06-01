# Auth, Session & Profile — Full Intelligence Document

Last verified: 2026-06-01

---

## 1. Module Overview

Three distinct layers make up how users enter, stay in, and manage their identity inside Eia:

1. **Pre-auth pages** — unauthenticated surfaces (`/login`, `/forgot-password`, `/update-password`) inside the `(auth)` route group. No sidebar, no dashboard shell, canvas background with ambient motion layers.
2. **Session infrastructure** — `src/proxy.ts` (Next.js 16 proxy), `src/lib/supabase/middleware.ts` (`updateSession()`), and the two Supabase client factories (`client.ts` / `server.ts`). Keeps the Supabase session cookie fresh on navigations.
3. **Profile self-management** — `/profile` inside `(dashboard)`. Any authenticated user edits **only their own** `profiles` row. Admins edit other users at `/admin/users/[id]`, not here.

### Route group structure

| Group | Path prefix | Layout | Session behaviour |
| ----- | ----------- | ------ | ----------------- |
| `(auth)` | `/login`, `/forgot-password`, `/update-password` | `src/app/(auth)/layout.tsx` — centered card on canvas, no app chrome | No session gate in layout; pages are public |
| `(dashboard)` | `/dashboard`, `/profile`, `/leads`, … | `src/app/(dashboard)/layout.tsx` — sidebar + floating paper surface | **Hard gate:** `getUser()` → redirect `/login`; `getCurrentProfile()` → redirect `/login` if null |

Root layout (`src/app/layout.tsx`) sets default `data-theme="earth"`, font variables on `<html>`, and global CSS. Dashboard layout applies the user’s saved theme before paint via `ThemeInitializer`.

---

## 2. Root Route — `src/app/page.tsx`

```ts
export default function RootPage() {
  redirect("/login");
}
```

**What it checks:** Nothing. There is no session probe on `/`.

**Redirect target:** Always `/login` — not `/dashboard` when a session exists.

**Implication:** A user with a valid cookie who visits `/` still lands on the login page. They reach the app via a bookmarked dashboard URL, post-login redirect, or another deep link. Session protection for authenticated work happens in `(dashboard)/layout.tsx`, not at the root.

---

## 3. The Three Supabase Client Files

### 3a. `src/lib/supabase/client.ts`

- **Purpose:** Singleton browser Supabase client (`createBrowserClient` from `@supabase/ssr`, typed with `Database`).
- **When to use:** Client components that need direct Supabase access — e.g. `PasswordChangeForm` (`signInWithPassword`, `updateUser`), `ProfileAvatarSection` (Storage upload), `useNotifications` (Realtime).
- **Why only here (Rule 05):** One WebSocket connection, one channel registry, no duplicate clients across remounts. `_resetClientForTests()` exists for tests only (`NODE_ENV === 'test'`).

### 3b. `src/lib/supabase/server.ts`

- **Purpose:** Server Supabase client — reads/writes session cookies via `cookies()` from `next/headers`.
- **When to use:** Server components, server actions, and all `lib/services/*` functions.
- **Why only here:** Cookie bridging must happen in one place; `setAll` swallows errors when called from a Server Component that cannot set cookies (expected in some RSC paths).

### 3c. `src/lib/supabase/middleware.ts`

- **Exports:** `updateSession(request: NextRequest)`.
- **What it does:** Instantiates a cookie-aware `createServerClient`, calls `await supabase.auth.getUser()` (refreshes the session if needed), returns `NextResponse.next` with updated cookies on the response.
- **Called by:** `src/proxy.ts` for all matched routes except webhook early-return paths.
- **Does not do:** Profile queries, `last_seen_at` writes, or redirects. Session refresh only.

---

## 4. `src/proxy.ts` — Session Layer

### What it is

Next.js 16 **proxy** entry (replaces the conventional root `middleware.ts` pattern for this app). Exports `proxy` and `config.matcher`.

### Per-request behaviour

1. **Webhook early return** — if `pathname.startsWith("/api/webhooks")`, return `NextResponse.next({ request })` immediately. **No** `updateSession()`.
2. **All other matched paths** — delegate to `updateSession(request)`.

### `/api/webhooks/*` early return — rule and reason

```ts
const WEBHOOK_PREFIX = "/api/webhooks";
if (request.nextUrl.pathname.startsWith(WEBHOOK_PREFIX)) {
  return NextResponse.next({ request });
}
```

Inbound webhooks (Meta leads, WhatsApp, etc.) carry **no session cookie**. Running `updateSession()` would be wasteful and can attach spurious auth side effects to machine-to-machine POSTs. The matcher also excludes `api/webhooks` via negative lookahead (defence in depth).

### `last_seen_at` — spec vs implementation

| Source | Claim |
| ------ | ----- |
| `docs/The_Profile.md` §15 | Middleware should update `profiles.last_seen_at` on authenticated requests, **max once per minute per user** |
| `profiles.last_seen_at` column | Exists (`timestamptz`, nullable) |
| **`src/proxy.ts` / `updateSession()`** | **Does not write `last_seen_at` as of 2026-06-01** |

Treat online-presence / `last_seen_at` as **schema-ready, not wired** until a future proxy or action implements rate-limited updates.

### Matcher config

```ts
matcher: [
  "/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)",
],
```

| Included | Excluded |
| -------- | -------- |
| App pages, API routes other than webhooks | `_next/static`, `_next/image`, `favicon.ico`, `api/webhooks` |

---

## 5. Pre-Auth Pages

### 5a. `(auth)` layout — `src/app/(auth)/layout.tsx`

**Provides:**

- Full-viewport centered shell (`min-h-dvh flex items-center justify-center`).
- Canvas noise texture (SVG fractal noise, opacity 0.04).
- Two off-centre radial glows (`--theme-canvas-glow`).
- Two CSS orb animations (`eia-auth-orb-a`, `eia-auth-orb-b`) and diagonal accent lines.
- **No** sidebar, top bar, or paper content card from the dashboard shell.

**If session already present:** The auth layout does **not** redirect. A logged-in user can still open `/login`. Successful login always `redirect("/dashboard")` from the action; visiting `/login` manually while authenticated shows the login form unless the user navigates away.

### 5b. `/login`

| Item | Detail |
| ---- | ------ |
| **Page** | `src/app/(auth)/login/page.tsx` → `LoginForm` (`login-form.tsx`) |
| **Fields** | `email`, `password` (native `type="password"` — **no** Eye/EyeOff toggle on this page) |
| **Action** | `loginAction` in `src/lib/actions/auth.ts` via `useActionState` |
| **Supabase** | `signInWithPassword({ email, password })` using **server** client |
| **Success** | `redirect("/dashboard")` |
| **Errors** | Any auth failure → `formErrors.invalidCredentials` ("The email or password you entered is incorrect.") — single message; no separate "unconfirmed email" branch in code |
| **Remember me** | None — Supabase cookie persistence handles session length |
| **Forgot link** | `/forgot-password` |

Validation in action: `loginSchema` — email required + format, password min 1 char (action); shared `auth.ts` schema uses min 8 for other flows.

### 5c. `/forgot-password`

| Item | Detail |
| ---- | ------ |
| **Page** | `forgot-password/page.tsx` → `ForgotPasswordForm` |
| **Field** | `email` |
| **Action** | `requestPasswordResetAction` |
| **Supabase** | `resetPasswordForEmail(email, { redirectTo: \`${NEXT_PUBLIC_SITE_URL}/api/auth/callback?next=/update-password\` })` |
| **Success UX** | Inline success copy — **no redirect**. User must check email. |
| **Email enumeration** | **Always returns success** after valid email format — never reveals whether the address exists (Rule S-09). |
| **Invalid email format** | `formErrors.email` |

**What the user receives:** Supabase recovery email linking to `/api/auth/callback` with `token_hash` + `type=recovery` (or PKCE `code` in same-browser case). Callback verifies and redirects to `/update-password`.

### 5d. `/update-password`

| Item | Detail |
| ---- | ------ |
| **Arrival** | User clicked reset link → `/api/auth/callback` establishes session → redirect `next=/update-password` |
| **Session gate (page)** | Server component calls `getUser()`; if no user → `InvalidLinkCard` (request new link). `?error=link_expired` from failed callback → expired copy |
| **Fields** | `password`, `confirmPassword` |
| **Action** | `updatePasswordAction` (server) — `updateUser({ password })` after Zod |
| **Success** | Success panel + link to **`/login`** (not auto-redirect to dashboard) |
| **Strength bar** | **Not present** on this page — only on `PasswordChangeForm` on `/profile` |
| **Schemas** | `updatePasswordSchema` — min 8, max 72, `passwordMismatch` refine |

**Auth callback** (`src/app/api/auth/callback/route.ts`):

1. `token_hash` + `type` → `verifyOtp` (recovery emails, any device).
2. Else `code` → `exchangeCodeForSession` (PKCE / same-browser magic links).
3. Failure → `/update-password?error=link_expired`.

---

## 6. `(dashboard)` Layout — `src/app/(dashboard)/layout.tsx`

### Session gate

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");

const profile = await getCurrentProfile();
if (!profile) redirect("/login");
```

| Failure mode | Behaviour |
| ------------ | --------- |
| No auth user | `/login` |
| Auth user but no `profiles` row (or RLS blocks read) | `/login` |
| Deactivated user (`is_active = false`) | **Still loads** if profile row is readable — layout does **not** check `is_active` |

`getCurrentProfile()` → `getUser()` then `getProfileById(user.id)`. RLS `profiles_select` allows any authenticated user to read all profiles.

Also prefetches `getNotifications(profile.id)` for the sidebar bell.

### Zero-flash theme — `ThemeInitializer`

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

### Font variables — root layout

`src/app/layout.tsx`:

- `Inter` → CSS variable `--font-geist-sans`
- `Playfair_Display` → `--font-playfair`
- Applied as `className` on `<html>` alongside default `data-theme="earth"`
- Consumed in `src/styles/design-tokens.css` as `--font-sans` / `--font-serif`

### Dashboard chrome

- Outer shell: `layout-canvas min-h-screen flex` (grain + gradients).
- Inner paper column: `--theme-paper`, `--radius-xl`, `--shadow-paper`, scrollable content.
- `ToastProvider` at shell root.
- `Sidebar` with `profile` + `initialNotifications`.

---

## 7. `/profile` — Self-Management Page

### 7a. Page structure

**File:** `src/app/(dashboard)/profile/page.tsx` — async server component.

| Item | Detail |
| ---- | ------ |
| **Access** | `getCurrentProfile()`; redirect `/login` if null. Own record only — no `id` param; admins use `/admin/users/[id]` for others |
| **Layout** | `gridTemplateColumns: minmax(0, 1fr) 340px`, `maxWidth: 1280px`, `padding: var(--space-8)` |
| **Eyebrow** | `"Account"` — `className="type-eyebrow"` |
| **Title** | `Profile Settings` + `page-title-dot` |

**Left column** (`SectionCard` stack):

1. Personal Details → `ProfileDetailsForm`
2. Appearance → `ThemeSelector`
3. Security → `PasswordChangeForm`
4. Notifications → `NotificationPreferences`

**Right column** (sticky `aside`, `top: var(--space-6)`):

1. Identity → avatar upload + name/email/job/role/domain pills + member-since strip
2. Session → sign-out form

### 7b. `ProfileDetailsForm`

| Field | Editable | Notes |
| ----- | -------- | ----- |
| `full_name` | Yes | Required on submit |
| `phone` | Yes | Normalized server-side |
| `job_title` | Yes | Optional |
| `username` | Yes | Lowercase/alphanumeric/underscore; uniqueness checked in action |
| `email` | **Read-only** | `value={profile.email}`, `readOnly`, hint: contact administrator |

- **Action:** `updateProfile` via `useActionState`
- **Schema:** `updateProfileSchema` — partial fields allowed (theme-only updates use same action from `ThemeSelector`)
- **Phone:** `normalizeToE164(phone, "IN")` in action; invalid → `formErrors.phoneInvalid`
- **Success/error:** Inline banners; `revalidatePath("/profile")` in action

### 7c. `ThemeSelector`

- **Swatches:** Earth, Air, Water, Fire, Cosmos
- **Preview trick:** Each swatch wraps a `div` with `data-theme={theme.key}` so `var(--theme-*)` resolve to that theme without hardcoded hex
- **On select:**
  1. `document.documentElement.setAttribute("data-theme", theme)` — instant
  2. `startTransition` → `updateProfile` with `FormData { id, theme }` only
- **Active ring:** Uses **current page** theme accent for selection outline; checkmark inside preview uses preview theme’s `--theme-accent-fg`

### 7d. `PasswordChangeForm`

| Step | Detail |
| ---- | ------ |
| **Re-auth** | `getUser()` → `signInWithPassword({ email: user.email, password: current })` **before** `updateUser({ password: next })` |
| **Why re-auth** | Supabase requires proving knowledge of the current password for sensitive session changes; server actions cannot replace this flow |
| **Client** | `createClient()` from `src/lib/supabase/client.ts` only — **no** server action for password change |
| **Fields** | Current, new, confirm — Eye/EyeOff on current + new (confirm shares new’s show state) |
| **Strength** | 4 segments; scores 0–4 from length/classes; colours danger → warning → info → success; labels `Weak` / `Fair` / `Good` / `Strong` |
| **Errors** | Wrong current → "Current password is incorrect."; mismatch, too short, same-as-current — inline messages; Supabase update errors surfaced as generic or message text |

### 7e. `ProfileAvatarSection`

| Item | Detail |
| ---- | ------ |
| **Tile** | 96×96, `--radius-md`, `--shadow-1`, hover camera overlay, `Spinner` while uploading |
| **Flow** | `createClient()` → Storage `avatars` bucket → `upload(profile.id, file, { upsert: true })` → `getPublicUrl` → cache-bust `?t=${Date.now()}` → `updateProfileAvatar` action |
| **Validation** | Client: `image/*` only, **max 2 MB** before upload starts |
| **Fallback** | Initials from `full_name` on `--theme-accent-surface` when `avatar_url` null |
| **Storage contract** | Bucket `avatars`; path = `{user_id}`; public read + authenticated write (project RLS) |

**Action validation:** `updateProfileAvatarSchema` — `avatar_url` must be valid URL. **No** explicit Supabase bucket-prefix check in the action layer as of 2026-06-01 (The_Profile §15 describes it as intended defence; not implemented in `profiles.ts`).

### 7f. `NotificationPreferences`

**Component status:** Mixed — one **live** control + **stubbed** rows.

| Row | Status | Storage |
| --- | ------ | ------- |
| **Notification sound** | **Live** — `Toggle` wired to `useNotificationSound()` | `localStorage` key `eia:notifications:sound:v1` (default `true` when absent) |
| WhatsApp notifications | Stub — `disabled`, `checked={false}` | — |
| Daily email digest | Stub — `disabled` | — |
| Footer copy | "Additional notification controls will be available in a future update." | — |

**Sound toggle location:** **This component** (`NotificationPreferences.tsx`) — **not** the Sidebar. Toggle hidden until hydrated (`sound.enabled !== null`) to avoid SSR flicker.

**Where sound plays:** `src/hooks/useNotifications.ts` (mounted from `NotificationBell` in **Sidebar**). On Realtime `INSERT` to `notifications`, calls `sound.play()` — debounced 1500 ms, Web Audio C6/E6 chime, respects `enabled` from the same hook singleton state persisted to localStorage.

**Rule:** Only `useNotifications` should call `play()` — not feature pages directly.

**Important:** Notification **sound preference** is localStorage-only. It is **not** `profiles.theme` and not a DB column. Theme remains DB-backed; sound is device-local.

### 7g. Identity `SectionCard` (right column)

- `ProfileAvatarSection` (upload only — identity text owned by page)
- `full_name`, `email`, optional `job_title`
- Role pill (`ROLE_LABELS`) + domain pill (`DOMAIN_LABELS`)
- Member since: `formatDate(created_at, "MMM yyyy")` on `--theme-paper-subtle` footer strip

### 7h. Session `SectionCard` (right column)

```tsx
<form action={signOutUser}>
  <Button type="submit" variant="secondary" size="sm">
    Sign out
  </Button>
</form>
```

- **Action:** `signOutUser` in `src/lib/actions/profiles.ts` — `signOut()` then `redirect("/login")`
- **No LogOut icon:** Page is a **server component**; Lucide icons cannot be passed into the server-action form boundary without a client wrapper. Text-only button is intentional.
- **Alternate:** `signOut()` exists in `src/lib/actions/auth.ts` with the same behaviour — profile page uses `signOutUser` only.

---

## 8. Actions

### `updateProfile`

| Item | Detail |
| ---- | ------ |
| **Who** | Own profile, or admin/founder editing any user (admin forms reuse this action) |
| **Fields** | `full_name`, `username`, `job_title`, `phone`, `theme`, `timezone` (all optional except `id`) |
| **Phone** | `normalizeToE164` when provided |
| **Sanitize** | `sanitizeText` on `full_name`, `job_title` |
| **revalidatePath** | `/profile`, `/admin/users`, `/admin/users/${id}` |
| **Returns** | `ActionResult<Profile>` — `{ data, error }`, never throws |

### `updateProfileAvatar`

| Item | Detail |
| ---- | ------ |
| **Who** | Own profile, or admin/founder |
| **Writes** | `avatar_url` (public URL after client upload) |
| **Validation** | Zod `.url()`; no bucket-prefix enforcement in code |
| **revalidatePath** | `/profile` |

### `signOutUser`

| Item | Detail |
| ---- | ------ |
| **Who** | Any authenticated user |
| **Supabase** | `auth.signOut()` via server client |
| **Redirect** | `/login` |

### Auth actions (`src/lib/actions/auth.ts`) — reference

| Export | Role |
| ------ | ---- |
| `loginAction` | Pre-auth sign-in |
| `signOut` | Sign out + `/login` (duplicate of profile sign-out) |
| `requestPasswordResetAction` | Forgot-password email |
| `updatePasswordAction` | Post-recovery password set |

---

## 9. Session Flow — End-to-End

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

1. User visits `/login` → `loginAction` → `signInWithPassword` → session cookie set → `redirect("/dashboard")`.
2. Dashboard layout verifies `getUser()` + `getCurrentProfile()`; renders shell with `ThemeInitializer(theme)`.
3. Every subsequent matched request → `proxy.ts` → `updateSession()` refreshes session cookies (`last_seen_at` **not** updated in code today).
4. User visits `/profile` → server renders with `profile.theme` → `ThemeInitializer` applies `data-theme` before paint.
5. User changes theme → instant `setAttribute` on `<html>` + async `updateProfile({ theme })` → persisted in `profiles.theme`.
6. User clicks Sign out → `signOutUser` → cookie cleared → `/login`.

---

## 10. Known Invariants (must never be violated)

| Invariant | Source |
| --------- | ------ |
| `/api/webhooks/*` must never run `updateSession()` | `src/proxy.ts` early return + matcher exclusion |
| `last_seen_at` must be rate-limited to once per minute **when implemented** — not on every request | The_Profile §15 — **not yet in proxy** |
| Theme source of truth is `profiles.theme`, not localStorage | Dashboard layout + `ThemeSelector` |
| Theme null / invalid → always `"earth"` | Dashboard layout `safeTheme` guard |
| `email` is read-only on `/profile` — source of truth is `auth.users` | `ProfileDetailsForm` |
| `PasswordChangeForm` uses browser client only — not a server action | `PasswordChangeForm.tsx` |
| Zero-flash theme must run before paint (`ThemeInitializer` / `useLayoutEffect`, not `useEffect`) | `ThemeInitializer.tsx` |
| Avatar upload: 2 MB max validated client-side before upload | `ProfileAvatarSection.tsx` |
| Forgot-password must not reveal whether email exists | `requestPasswordResetAction` |
| One browser Supabase client — `createClient()` from `client.ts` only | Rule 05 |
| One server Supabase client per request — `server.ts` only in services/actions | Rule 05 |
| Notification sound preference: `eia:notifications:sound:v1` in localStorage — separate from theme DB field | `useNotificationSound.ts` |
| Password reset completes at `/login` after success, not `/dashboard` | `UpdatePasswordForm` success link |

---

## Appendix — Self-edit validation schemas

From `src/lib/validations/profile-schema.ts`:

- **`updateProfileSchema`** — `id` (uuid); optional `full_name`, `username`, `job_title`, `phone`, `theme` enum, `timezone`
- **`updateProfileAvatarSchema`** — `id`, `avatar_url` (url)

Auth schemas in `src/lib/validations/auth.ts`: `loginSchema`, `forgotPasswordSchema`, `updatePasswordSchema` (with confirm + mismatch refine).

All user-facing errors map through `src/lib/validations/form-errors.ts` — never raw Zod strings.
