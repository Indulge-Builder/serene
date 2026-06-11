# Profile — Page Spec

> **Purpose:** spec for `/profile` — every user's self-management page (identity fields, avatar, theme, password).
> **Audience:** engineers. · **Source-of-truth scope:** the `/profile` route. Admin edits of *other* users: `user-management.md`; theme system law: `../design/DESIGN-DNA.md` §1–2.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure.

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

## 5. States

- **Loading:** page is a fast single fetch; button-level pending states.
- **Empty:** avatar fallback = initials via `getInitials()`/`hashString()`.
- **Error:** inline per-form message bars; fields never cleared.

## 6. Invariants

Theme source of truth is the DB (never localStorage); invalid/missing theme → `earth`;
email immutable here; username uniqueness enforced by the DB constraint (race-safe);
avatar ≤ 2 MB validated before upload.

## 7. Open items

Notification-sound preference lives in localStorage (`eia:notifications:sound:v1`) with **no
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

**Left column** (`SectionCard` stack — three sections only):

1. Personal Details → `ProfileDetailsForm`
2. Appearance → `ThemeSelector`
3. Security → `PasswordChangeForm`

> There is **no Notifications section on `/profile`.** `NotificationPreferences` is not a real component in `src/components/profile/` — the folder contains exactly `ProfileDetailsForm`, `ThemeSelector`, `PasswordChangeForm`, `ProfileAvatarSection`. Notification **sound** is toggled elsewhere (via the `useNotificationSound` hook surfaced from the notifications UI), not on this page. See §7f.

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

#### 7f. Notification sound preference (no `/profile` component)

There is **no `NotificationPreferences` component** and **no Notifications `SectionCard` on `/profile`.** Notification sound is a device-local preference managed entirely through the `useNotificationSound` hook, surfaced from the notifications UI in the Sidebar — never from the profile page.

| Item | Detail |
| ---- | ------ |
| **Hook** | `src/hooks/useNotificationSound.ts` |
| **Storage** | `localStorage` key `eia:notifications:sound:v1` (default `true` when absent) |
| **Where sound plays** | `src/hooks/useNotifications.ts` (mounted from `NotificationBell` in the **Sidebar**). On a Realtime `INSERT` to `notifications`, calls `sound.play()` — debounced ~1500 ms, Web Audio chime, respects the persisted `enabled` flag |

**Rule:** Only `useNotifications` should call `play()` — not feature pages directly.

**Important:** The notification **sound preference** is localStorage-only — **not** a `profiles` column. Theme remains DB-backed (`profiles.theme`); sound is device-local. The two are independent.

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

- **`updateProfileSchema`** — `id` (uuid); optional `full_name`, `username`, `job_title`, `phone`, `theme` enum, `timezone`
- **`updateProfileAvatarSchema`** — `id`, `avatar_url` (url)

Auth schemas in `src/lib/validations/auth.ts`: `loginSchema`, `forgotPasswordSchema`, `updatePasswordSchema` (with confirm + mismatch refine).

All user-facing errors map through `src/lib/validations/form-errors.ts` — never raw Zod strings.
