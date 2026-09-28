# Profile: Page Spec

> **Purpose:** spec for `/profile`, every user's own settings page: identity fields, avatar, appearance (Light / Dark / Auto), theme, home-screen icon, notifications, how Elaya talks to you and what she has learned about you, the AI apps you connected, and your password.
> **Audience:** engineers. · **Source-of-truth scope:** the `/profile` route and the components in `src/components/profile/`. Admin edits of *other* people: `./user-management.md`. Theme and dark-mode law: `../design/DESIGN-DNA.md`. Web Push internals: `../modules/web-push.md`. Elaya's persona and living memory: `../modules/elaya.md`. The MCP connector and its OAuth server: `../integrations/mcp.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/profile/page.tsx` + `loading.tsx`, `src/components/profile/*`, `src/lib/actions/{profiles,oauth-grants,elaya-memory,notification-prefs,push}.ts`, `src/lib/services/{oauth-server-service,elaya-memory-service,notification-prefs-service}.ts`, `src/lib/constants/{themes,appearance,app-icons,notification-categories}.ts`, `scripts/pad-app-icons.mjs`, and migrations 0121, 0133, 0157, 0158, 0237.

## 1. Purpose

Anyone signed in edits **only their own** `profiles` row and their own preferences here:

- name, phone, job title, username (email is read-only: the truth is `auth.users`);
- avatar (Storage bucket `avatars`);
- appearance (Light, Dark, Auto), theme (eight), and the home-screen icon, all stored in the
  database so they follow you across devices;
- which notifications reach you and on which channel, Web Push on this device, and the
  notification chime;
- how Elaya speaks to you, and her living memory of how you want things;
- which AI apps (Claude, ChatGPT and others) you let read Serene as you;
- your password.

Role, domain, seat and queendom are never self-editable (S-14; the database refuses it too, see
`./user-management.md` §8.7).

## 2. Who sees it

Every signed-in user: `/profile` is in `ALWAYS_ALLOWED_PREFIXES`. There is no user switcher; the
page always shows the caller. The Elaya cards and Connected AI apps render for everyone, including
teams Elaya is switched off for (§7).

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Page seed | `getCurrentProfile()`, then one `Promise.all`: `getMyNotificationPrefs()`, `getMyElayaPersona(profile.id)`, `listConnectedApps()`, `listUserMemoryForPage(profile.id)` |
| Actions | `profiles.ts`: `updateProfile` (name, username, phone, job title, theme, app icon, appearance, timezone), `updateProfileAvatar`, `signOutUser`. `notification-prefs.ts`, `push.ts`, `elaya.ts` (`updateElayaPersonaAction`), `elaya-memory.ts` (`addMemoryEntryAction`, `retireMemoryEntryAction`), `oauth-grants.ts` (`revokeConnectedAppAction`) |
| Browser-side | `PasswordChangeForm` uses the browser Supabase client (`lib/supabase/client.ts`) directly: a documented exception, since it is the Auth API, not a table write. `ProfileAvatarSection` uploads to Storage from the browser |
| Theme, appearance, icon | Stored on `profiles`. Each also has a cookie mirror (`serene-theme`, `serene-appearance`, `serene-app-icon`) so the root layout paints the right look on the first byte. `ThemeInitializer` and `IconInitializer` (dashboard layout) re-sync a stale cookie against the database |
| Validation | `profile-schema.ts` (`updateProfileSchema`, `updateProfileAvatarSchema`) |

## 4. Components

Layout: `serene-dossier-grid--340`. The left column holds the editable sections; the right column is
a sticky identity sidebar. Below `lg` the identity card comes first. The title row is "Profile."
with the `PageControls` bell.

**Left column, in order:**

| Section (`SectionCard`) | Component(s) | Notes |
| ----------------------- | ------------ | ----- |
| Personal Details | `ProfileDetailsForm` | Read view with an Edit button; editing lifts the card. Email read-only |
| Appearance | `AppearanceSelector`, then `ThemeSelector` (with the Notification sound toggle at its foot), then `IconSelector` | §8.2 to §8.4 |
| Add to Home Screen | `InstallPrompt` | §8.4 |
| Notifications | `NotificationPreferences`, then `PushNotificationSettings` | §8.5 |
| Elaya | `ElayaPersonaSettings` | "Personalise how Elaya talks to you." |
| What Elaya has learned about you | `ElayaMemoryCard` (`own`) | §8.6 |
| Connected AI apps | `ConnectedApps` | §8.7 |
| Security | `PasswordChangeForm` | §8.8 |

**Right column:** Identity (`ProfileAvatarSection`, name, email, job title, role and domain pills,
"Member since" strip) and Session (the Sign out form).

## 5. States

- **Loading:** `profile/loading.tsx` (2026-09-16): header, the 340px dossier grid, three section
  cards and the identity card.
- **Empty:** the avatar falls back to initials (`getInitials()` / `hashString()`). Connected AI apps
  shows "No apps connected yet" (`<EmptyState>`), and also shows nothing connected when the OAuth
  server is off (the list read never errors). The memory card lists nothing until Elaya learns
  something.
- **Error:** inline message bars per form; fields are never cleared. Theme, appearance and icon
  apply at once in the browser and save in the background.

## 6. Invariants

- The database is the source of truth for theme, appearance and icon; the cookies are mirrors,
  never localStorage. An unknown value falls back to `earth`, `light`, `icon-1`.
- Email is read-only here.
- Username uniqueness is enforced by the database (race-safe); the action pre-checks for a better
  message.
- The avatar is at most 2 MB and must be an image, checked before upload.
- A self-edit can never change role, domain, seat or queendom.
- Only the notification categories a role can receive render, and only the channels a category
  can fire on get a checkbox.

## 7. Open items

- The Elaya persona and memory cards, and Connected AI apps, render for everyone, but Elaya (and
  the MCP connector) is off for finance, marketing and business since 2026-09-26
  (`hasElayaAccess`). Consider hiding them for those teams.
- `updateProfileAvatar` checks only that the value is a URL, not that it points at the `avatars`
  bucket.
- Connected AI apps needs the Supabase OAuth server switched on for the project. It is on in
  production (its public discovery document answers, with dynamic client registration, checked
  2026-09-26); the local `supabase/config.toml` has it off. See `../integrations/mcp.md`.
- The ticket rows in the notification matrix offer a WhatsApp checkbox, but no WhatsApp sender
  exists for ticket alerts (they go in-app and by Web Push only), and
  `ticket_daily_digest_founder` has no job behind it. See `../modules/tickets.md`.

---

## 8. Deep dive

### 8.1 Page structure

`src/app/(dashboard)/profile/page.tsx` (server component, metadata title "Profile").
`getCurrentProfile()` → redirect `/login` when null. No `id` parameter: the page is always the
caller. `<main className="flex-1 p-4 sm:p-6 lg:p-8">` with `maxWidth: 1280px`. Header: `<h1
className="type-page-title m-0">Profile.</h1>` and `PageControls` (bell only).

### 8.2 Appearance: Light, Dark, Auto

`AppearanceSelector` (a `TabSelector` segmented control) writes `profiles.appearance`
(migration 0158, CHECK `light` / `dark` / `system`, default `light`; the UI label for `system` is
"Auto").

1. `applyAppearanceToDom(id)`: THE only place `data-neu` flips (it also rewrites `<meta
   name="theme-color">`, #ECE8E1 in light, #28241C in dark).
2. `persistAppearanceCookie(id)`: the SSR mirror, so the root layout stamps `data-neu="dark"` on
   the first byte. `system` cannot be decided on the server, so the root layout renders a tiny
   pre-paint script that checks `prefers-color-scheme`.
3. `updateProfile` with `{ id, appearance }` in the background.

`ThemeInitializer` owns the live OS listener while `system` is active. Vocabulary:
`src/lib/constants/appearance.ts`.

### 8.3 Theme

`ThemeSelector` renders one swatch per `THEME_OPTIONS` entry (`src/lib/constants/themes.ts`):
**Earth, Air, Water, Fire, Candy, Rose, Moss, Lilac** (0157 CHECK). Cosmos, coffee and macha were
retired on 2026-07-02 (0156) and martini on 2026-07-03 (0157 moved it to lilac). A theme changes
only the accent family; surfaces, text, status chips and chart colours never re-tint. Every accent
holds dark ink (`--theme-accent-fg`), never white.

- Each swatch wraps a `data-theme` div, so its preview resolves the real tokens.
- On pick: set `data-theme` on `<html>` at once, `persistThemeCookie(theme)`, then `updateProfile`
  with `{ id, theme }` in a transition.
- **Notification sound** lives at the foot of this component (a `Toggle`, "A short chime when new
  notifications arrive."). It is a device-local flag in `localStorage`
  (`serene:notifications:sound:v1`, default on) through `useNotificationSound`; the chime itself
  plays from `NotificationsProvider` in the dashboard layout. It is not a `profiles` column.

### 8.4 Home-screen icon and install

**`IconSelector`** writes `profiles.app_icon` (0121, CHECK `icon-1` to `icon-4`, default
`icon-1`) through `updateProfile`. Vocabulary: `src/lib/constants/app-icons.ts` (`ICON_KEYS`,
`DEFAULT_ICON`, `isIconKey()`, `iconSrc(value)`, the only key-to-path resolver, which falls back to
the default so a raw parameter never becomes a path; `APP_ICON_COOKIE = 'serene-app-icon'`). A
theme repaints the live app, but an installed icon belongs to the phone: saving shows a
"reinstall to see it" note and bakes the choice into the next install.

**Assets** (`scripts/pad-app-icons.mjs` is the one place these rasters come from): each
`public/icon-N.webp` is a 1254px square. `icon-1`, the default, is the Serene mark on a solid
**white** plate (2026-09-26, the founder's pick for the phone shortcut); `icon-2` to `icon-4` are
decorative picks on the cream plate (#ECE8E1). A solid plate keeps the manifest's `maskable` entry
valid. The browser tab uses `src/app/favicon.ico` (the bare mark, no plate). A shortcut already on a
phone keeps its old icon until it is removed and added again.

**Cookie sync:** the root layout's `generateMetadata()` reads `serene-app-icon` and points `<link
rel="manifest">` at `/api/manifest?icon=<saved>` and the apple-touch-icon at the same image.
`IconInitializer` re-syncs the cookie from the database on each load.

**`InstallPrompt`** (its own card): swaps the live manifest link and apple-touch-icon to the saved
pick, then triggers install (`beforeinstallprompt` on Chromium, an Add to Home Screen nudge on
iOS). It does not own icon state. The manifest twin: `src/app/manifest.ts` (`buildManifest(icon,
appearance)`) and `src/app/api/manifest/route.ts` (a sanctioned PWA carve-out; the proxy bypasses
it). Install guide for staff: `../operations/pwa-install-guide.md`.

### 8.5 Notifications

**`NotificationPreferences`** (0133): a matrix of category × channel (`in_app`, `whatsapp`),
seeded by `getMyNotificationPrefs()`. The catalog is `NOTIFICATION_CATEGORIES` in
`src/lib/constants/notification-categories.ts`, the one list the UI, the SQL CHECK and the gate
key on. Each category lists the `channels` it can fire on (the only checkboxes drawn) and the
`roles` that see it. Today's keys: `lead_assigned`, `new_lead_founder_alert`, `lead_won`,
`deal_created`, `task_assigned`, `task_due`, `task_overdue_manager`, `sla_breach`,
`sla_escalation`, and the ticket ones (`ticket_proposed_for_approval`, `ticket_sla_warning`,
`ticket_sla_breach_manager`, `ticket_member_unhappy`, `ticket_daily_digest_founder`). Ticks are
the shared `Checkbox`.

- **Absence means on.** The gate (`notification-prefs-service.ts`) fails open: a missing or
  unreadable row still sends. A row exists only to record an off choice; turning a category back
  on deletes it (the sparse-row rule in `actions/notification-prefs.ts`).
- **Never muteable:** `lead_initiation` (opens the 24-hour WhatsApp window) and `elaya_reply` (a
  direct answer to a staff message) are transactional and absent from the catalog.
- Example of use: on 2026-09-23 the founders' lead and SLA alerts were paused by writing off rows
  here, not by code; each founder can turn them back on from this card.

**`PushNotificationSettings`**: Web Push on this device (VAPID, `push_subscriptions`, one row per
device; gesture-gated, never auto-prompts; iOS needs the app installed). Details:
`../modules/web-push.md`.

### 8.6 Elaya: persona and living memory

- **`ElayaPersonaSettings`** ("Elaya" card): the three style choices and the free note that shape
  how she talks to you, stored in `user_context.context.persona` through `updateElayaPersonaAction`.
  They stay as manual overrides beside the living memory.
- **`ElayaMemoryCard`** ("What Elaya has learned about you", 0237): one line per entry (rule,
  correction, style, preference, interest, fact) with its kind, a remove on each (retired, never
  deleted), and a kind + sentence box to add a rule by hand. Writes: `addMemoryEntryAction`,
  `retireMemoryEntryAction`. Read: `listUserMemoryForPage` (session client; RLS lets the owner and
  admin/founder read). The same card sits on `/admin/users/[id]` for admin and founder. How she
  learns and how the memory reaches every prompt: `../modules/elaya.md`.

### 8.7 Connected AI apps

`ConnectedApps` lists the apps this person let into Serene through the MCP connector (name, what
they may do, when), each with **Disconnect** behind a `ConfirmDialog`. Disconnecting revokes the
grant, so every token that app holds for this person stops working at once.

- Read: `listConnectedApps()` in `oauth-server-service.ts` (session client,
  `auth.oauth.listGrants()`; returns an empty list, never an error, when the OAuth server is off).
- Write: `revokeConnectedAppAction` → `revokeConnectedApp(clientId)`
  (`auth.oauth.revokeGrant`).
- The consent screen that creates a grant is `/oauth/consent` (`./auth.md` §8.6). The connector
  itself: `../integrations/mcp.md`; the team's how-to: `../integrations/mcp-team-guide.md`.

### 8.8 Password

`PasswordChangeForm` ("Security" card) uses the browser client only, no server action:
`getUser()` → `signInWithPassword({ email, password: current })` to prove the current password →
`updateUser({ password: next })`. Fields: current, new, confirm, with show/hide toggles. The shared
`PasswordStrengthBar` sits under the new-password field (the same bar as `/update-password`).
Errors: "Current password is incorrect.", mismatch, too short, same as current; an Auth update
error shows its message or the generic one.

### 8.9 Avatar

`ProfileAvatarSection` (in the Identity card): a 96px tile with a camera overlay on hover and a
spinner while uploading. Image files only, at most 2 MB, checked before upload. Flow: browser
client → Storage `avatars` bucket, path = the profile id, `upsert: true` → `getPublicUrl` →
`?t=<timestamp>` cache-bust → `updateProfileAvatar`. The bucket is public-read, signed-in write
(configured in the Supabase dashboard, not in a migration).

### 8.10 Personal details

`ProfileDetailsForm` shows a read view (full name, phone, job title, username, email) and an Edit
button that opens the form. Phone is normalised with `normalizeToE164(phone, 'IN')` in the action
(an invalid number returns `formErrors.phoneInvalid`); username must match `^[a-z0-9_]+$` and be
free. The action revalidates `/profile`, `/admin/users` and `/admin/users/[id]`. The company phone
matters beyond this page: it is how the WhatsApp staff gate recognises you
(`./user-management.md` §8.5).

### 8.11 Session

The Session card holds `<form action={signOutUser}>` with a text-only "Sign out" button (the page
is a server component). `signOutUser` in `lib/actions/profiles.ts` is the only sign-out action:
`signOut()` then `redirect('/login')`.

### 8.12 Validation

From `src/lib/validations/profile-schema.ts`:

- **`updateProfileSchema`**: `id` (uuid); optional `full_name`, `username`, `job_title`, `phone`,
  `theme` (`THEME_ENUM`), `app_icon` (`ICON_ENUM`), `appearance` (`APPEARANCE_ENUM`), `timezone`.
  Partial updates are the norm: the appearance, theme and icon pickers each send only `{ id,
  <field> }`.
- **`updateProfileAvatarSchema`**: `id`, `avatar_url` (URL).

Every user-facing error maps through `src/lib/validations/form-errors.ts`.
