# Profile — Page Spec

> **Purpose:** spec for `/profile` — every user's self-management page (identity fields, avatar, theme, password).
> **Audience:** engineers. · **Source-of-truth scope:** the `/profile` route. Admin edits of *other* users: `user-management.md`; theme system law: `../design/DESIGN-DNA.md` §1–2.
> **Last verified:** 2026-06-15 (PWA install + app-icon picker + web-push reconcile); 2026-06-09 full pass; 2026-06-11 restructure.

## 1. Purpose

Any authenticated user edits **only their own** `profiles` row: name/username/phone/job title,
avatar (Storage `avatars` bucket), theme (DB-stored — follows the user across devices), and
password. Role and domain are never self-editable (S-14).

## 2. Who sees it

Every authenticated role — `/profile` is in `ALWAYS_ALLOWED_PREFIXES`. Each user sees only
themselves; there is no user switcher here.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Actions | `profiles.ts` — `updateProfile` (self fields), `updateProfileAvatar` (2 MB client-validated upload → `avatars` bucket) |
| Client-side | `PasswordChangeForm` uses the **browser** Supabase client directly (documented exception — Supabase auth API, not a DB write) |
| Theme | saved to `profiles.theme`; applied by `ThemeSelector` writing `data-theme` + the zero-flash dashboard-layout script |
| Validation | self-edit schemas (Deep dive appendix) |

## 4. Components

Composed on `SectionCard` (the canonical detail-surface shell): `ProfileDetailsForm`
(email read-only — truth is `auth.users`), `ProfileAvatarSection` (uses `--overlay-scrim`),
`ThemeSelector` (five theme cards), `PasswordChangeForm` + `PasswordStrengthBar`.

> **Appearance also holds `IconSelector`** (2026-06-15) — the PWA home-screen icon picker,
> saved to `profiles.app_icon` via the SAME `updateProfile` action (no new action). It is honest
> about reach: a theme repaints the live app, but an installed home-screen icon is OS-owned, so
> saving here shows a manual-reinstall note and bakes the choice into the NEXT install. The
> separate **"Add to Home Screen"** SectionCard holds `InstallPrompt` — the first-install picker
> that swaps the manifest `<link>` + apple-touch-icon to the pick and triggers install
> (`beforeinstallprompt` on Chromium; Add-to-Home-Screen nudge on iOS). A **"Notifications"**
> SectionCard (`PushNotificationSettings`, 2026-06-14) now also exists — superseding the
> "no Notifications section" note further down (kept for history; that claim is stale).

## 5. States

- **Loading:** page is a fast single fetch; button-level pending states.
- **Empty:** avatar fallback = initials via `getInitials()`/`hashString()`.
- **Error:** inline per-form message bars; fields never cleared.

## 6. Invariants

Theme source of truth is the DB (never localStorage); invalid/missing theme → `earth`;
email immutable here; username uniqueness enforced by the DB constraint (race-safe);
avatar ≤ 2 MB validated before upload.

## 7. Open items

Notification-sound preference lives in localStorage (`serene:notifications:sound:v1`) with **no
`/profile` control yet** — deliberate gap, noted in the original doc.

---

## 8. Deep dive

> Preserved from the original intelligence document (§7 + appendix).

### 7. `/profile` — Self-Management Page

#### 7a. Page structure

**File:** `src/app/(dashboard)/profile/page.tsx` — async server component.

| Item | Detail |
| ---- | ------ |
| **Access** | `getCurrentProfile()`; redirect `/login` if null. Own record only — no `id` param; admins use `/admin/users/[id]` for others |
| **Layout** | `gridTemplateColumns: minmax(0, 1fr) 340px`, `maxWidth: 1280px`, `padding: var(--space-8)` |
| **Eyebrow** | `"Account"` — `className="type-eyebrow"` |
| **Title** | `Profile Settings` + `page-title-dot` |

**Left column** (`SectionCard` stack — four sections):

1. Personal Details → `ProfileDetailsForm`
2. Appearance → `ThemeSelector` + `IconSelector` + `InstallPrompt` (the **"Add to Home Screen"** card)
3. Notifications → `PushNotificationSettings` (web-push opt-in, 2026-06-14)
4. Security → `PasswordChangeForm`

> Notification **sound** is a separate device-local preference (localStorage) toggled via the `useNotificationSound` hook surfaced from the notifications UI in the Sidebar — not from this page. The push opt-in above and the sound flag are independent. See §7f.

**Right column** (sticky `aside`, `top: var(--space-6)`):

1. Identity → avatar upload + name/email/job + role/domain `status-pill`s + member-since strip
2. Session → sign-out form

#### 7b. `ProfileDetailsForm`

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

#### 7c. `ThemeSelector`

- **Swatches:** Earth, Air, Water, Fire, Cosmos
- **Preview trick:** Each swatch wraps a `div` with `data-theme={theme.key}` so `var(--theme-*)` resolve to that theme without hardcoded hex
- **On select:**
  1. `document.documentElement.setAttribute("data-theme", theme)` — instant
  2. `startTransition` → `updateProfile` with `FormData { id, theme }` only
- **Active ring:** Uses **current page** theme accent for selection outline; checkmark inside preview uses preview theme’s `--theme-accent-fg`

#### 7d. `PasswordChangeForm`

| Step | Detail |
| ---- | ------ |
| **Re-auth** | `getUser()` → `signInWithPassword({ email: user.email, password: current })` **before** `updateUser({ password: next })` |
| **Why re-auth** | Supabase requires proving knowledge of the current password for sensitive session changes; server actions cannot replace this flow |
| **Client** | `createClient()` from `src/lib/supabase/client.ts` only — **no** server action for password change |
| **Fields** | Current, new, confirm — Eye/EyeOff toggles (`lucide-react`, 15×15 stroke 1.5) |
| **Strength** | Renders the shared `<PasswordStrengthBar password={next} />` (`src/components/ui/PasswordStrengthBar.tsx`) under the new-password field — the **same** component used on `/update-password`. Not a bespoke scorer |
| **Errors** | Wrong current → "Current password is incorrect."; mismatch, too short, same-as-current — inline messages; Supabase update errors surfaced as generic or message text |

#### 7e. `ProfileAvatarSection`

| Item | Detail |
| ---- | ------ |
| **Tile** | 96×96, `--radius-md`, `--shadow-1`, hover camera overlay, `Spinner` while uploading |
| **Flow** | `createClient()` → Storage `avatars` bucket → `upload(profile.id, file, { upsert: true })` → `getPublicUrl` → cache-bust `?t=${Date.now()}` → `updateProfileAvatar` action |
| **Validation** | Client: `image/*` only, **max 2 MB** before upload starts |
| **Fallback** | Initials from `full_name` on `--theme-accent-surface` when `avatar_url` null |
| **Storage contract** | Bucket `avatars`; path = `{user_id}`; public read + authenticated write (project RLS) |

**Action validation:** `updateProfileAvatarSchema` — `avatar_url` must be valid URL. **No** explicit Supabase bucket-prefix check in the action layer as of 2026-06-09 (an intended defence noted in the retired The_Profile doc; not implemented in `profiles.ts` — TODO if avatar URLs are ever attacker-controllable).

#### 7f. Notification sound preference (device-local, alongside the Push `SectionCard`)

The **"Notifications" `SectionCard`** on `/profile` holds `PushNotificationSettings` (§7k — web-push opt-in, DB-backed via `push_subscriptions`). The notification **sound** preference is a *separate, independent* piece: a device-local flag managed entirely through the `useNotificationSound` hook, surfaced from the notifications UI in the Sidebar — never from the profile page. Push reach and sound state are unrelated.

| Item | Detail |
| ---- | ------ |
| **Hook** | `src/hooks/useNotificationSound.ts` |
| **Storage** | `localStorage` key `serene:notifications:sound:v1` (default `true` when absent) |
| **Where sound plays** | `src/hooks/useNotifications.ts` (mounted from `NotificationBell` in the **Sidebar**). On a Realtime `INSERT` to `notifications`, calls `sound.play()` — debounced ~1500 ms, Web Audio chime, respects the persisted `enabled` flag |

**Rule:** Only `useNotifications` should call `play()` — not feature pages directly.

**Important:** The notification **sound preference** is localStorage-only — **not** a `profiles` column, and **not** part of `PushNotificationSettings`. Push subscriptions are DB-backed (`push_subscriptions`, per-device); theme and app-icon are DB-backed (`profiles.theme` / `profiles.app_icon`); sound is device-local. They are independent.

#### 7i. `IconSelector` (Appearance card, 2026-06-15)

The PWA home-screen icon picker — one icon grid inside the Appearance `SectionCard`.

| Item | Detail |
| ---- | ------ |
| **Component** | `src/components/profile/IconSelector.tsx` |
| **Persist** | `profiles.app_icon` (`text NOT NULL DEFAULT 'icon-1'`, CHECK `IN ('icon-1'..'icon-4')`) via the **same** `updateProfile` action — no new persist action; mirrors `profiles.theme` exactly |
| **Vocabulary** | `src/lib/constants/app-icons.ts` (built via `defineEnum` like `themes.ts`): `ICON_KEYS/LABELS/OPTIONS/ENUM`, `DEFAULT_ICON='icon-1'`, `isIconKey()`, `iconSrc(value)` = the only key→path resolver (validates, falls back to `DEFAULT_ICON` so a raw param never becomes an arbitrary `src`), `APP_ICON_COOKIE='serene-app-icon'` + `persistAppIconCookie()` |
| **Honesty** | A theme repaints the live app, but an installed home-screen icon is **OS-owned** — saving here shows a **manual-reinstall** note and bakes the choice into the NEXT install |
| **Assets** | 4 single `1254×1254` webp at `/public/icon-1.webp`..`icon-4.webp`; the browser downscales for 192/512 + maskable + apple-touch-icon (maskable valid only because the art is a solid `#0d0c0a` plate) |
| **Cookie sync** | Root layout `generateMetadata()` reads the cookie → points `<link rel="manifest">` + `icons.apple` at the saved icon (zero-flash). `src/components/layout/IconInitializer.tsx` (a `ThemeInitializer` twin, mounted in the dashboard layout) re-syncs the cookie from `profiles.app_icon` each load |

#### 7j. `InstallPrompt` ("Add to Home Screen" card, 2026-06-15)

The first-install picker — a **separate** `SectionCard` from Appearance.

| Item | Detail |
| ---- | ------ |
| **Component** | `src/components/profile/InstallPrompt.tsx` |
| **Icon state** | Does **not** own icon state — reads `currentIcon`, then swaps the live manifest `<link>` + apple-touch-icon to the saved pick **before** `prompt()` |
| **Trigger** | `beforeinstallprompt` on Chromium; an Add-to-Home-Screen nudge on iOS |
| **Manifest twin** | `src/app/manifest.ts` exports `buildManifest(icon)` + `EARTH_CANVAS`; the async default `manifest()` reads the `serene-app-icon` cookie → `buildManifest(saved)`. `src/app/api/manifest/route.ts` (a sanctioned PWA carve-out to P-02) is the dynamic `/api/manifest?icon=` twin sharing `buildManifest`; the proxy bypasses `/api/manifest` |

#### 7k. `PushNotificationSettings` (Notifications card, 2026-06-14)

Web-push opt-in (VAPID, `web-push` lib, no SaaS; migration 0120).

| Item | Detail |
| ---- | ------ |
| **Component** | `src/components/profile/PushNotificationSettings.tsx` in the `/profile` "Notifications" `SectionCard` |
| **Subscribe hook** | `src/hooks/usePushSubscription.ts` — gesture-gated, **never** auto-prompts; iOS detects standalone and reports `'ios-needs-install'` when not installed (never fakes subscribed) |
| **Actions** | `src/lib/actions/push.ts` — `savePushSubscriptionAction` (upsert) / `removePushSubscriptionAction`; Zod → `requireProfile`; session client, owner-only |
| **Table** | `push_subscriptions` `(id, profile_id FK, endpoint UNIQUE, p256dh, auth, user_agent, created_at)` — one row per device, many per user. Owner-only RLS (`profile_id = auth.uid()`, SELECT/INSERT/DELETE, no UPDATE); `idx_push_subscriptions_profile` |
| **Fan-out seam** | Inside `createNotification` (`notifications-service.ts`): after the in-app row insert it calls `dispatchPush(recipient_id, {title,body,url})` — **zero** call-site edits, so every existing caller (lead-assignment-notify, lead-mutations, sla, tasks, task-reminders) gets push free |
| **Server seam** | `src/lib/services/push-service.ts` (server + Node only — `web-push` throws on Edge): `dispatchPush` reads subscriptions via the **admin** client, sends to all devices in parallel, and **prunes** endpoints answering 404/410 in one batched delete. Non-fatal: it **never throws** — the in-app row is the source of truth. VAPID configured once lazily; absent keys → logged no-op |
| **Service worker** | `public/sw.js` gained `push` + `notificationclick` handlers (additive; offline-shell bytes unchanged, `CACHE_VERSION` not bumped) |
| **Env** | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (server-only, S-11) + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (browser). `web-push@3.6.7` + `@types/web-push@3.6.4` — all already in `.env.example` |

#### 7g. Identity `SectionCard` (right column)

- `ProfileAvatarSection` (upload only — identity text owned by page)
- `full_name`, `email`, optional `job_title`
- Role pill (`ROLE_LABELS`) + domain pill (`DOMAIN_LABELS`)
- Member since: `formatDate(created_at, "MMM yyyy")` on `--theme-paper-subtle` footer strip

#### 7h. Session `SectionCard` (right column)

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

### Appendix — Self-edit validation schemas

From `src/lib/validations/profile-schema.ts`:

- **`updateProfileSchema`** — `id` (uuid); optional `full_name`, `username`, `job_title`, `phone`, `theme` enum, `app_icon` (`ICON_ENUM` from `app-icons.ts`), `timezone`
- **`updateProfileAvatarSchema`** — `id`, `avatar_url` (url)

Auth schemas in `src/lib/validations/auth.ts`: `loginSchema`, `forgotPasswordSchema`, `updatePasswordSchema` (with confirm + mismatch refine).

All user-facing errors map through `src/lib/validations/form-errors.ts` — never raw Zod strings.
