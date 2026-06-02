# Auth Pages — CLAUDE.md

## Routes

| Path               | Component                               | Notes                                                                              |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `/login`           | `login-form.tsx`                        | `useActionState` + `loginAction`                                                   |
| `/forgot-password` | `forgot-password-form.tsx`              | `useActionState` + `requestPasswordResetAction`                                    |
| `/update-password` | `update-password-form.tsx` + `page.tsx` | Server component checks session; renders `InvalidLinkCard` on missing/expired link |

All three share `(auth)/layout.tsx` as their shell.

---

## Visual language — dark card design (2026-06-02)

Auth pages render on the canvas (`--theme-canvas`), not on paper. Cards, inputs, and text tokens are all
drawn from the canvas/sidebar palette, not the paper palette.

### New CSS classes in `globals.css`

| Class             | Purpose                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.eia-auth-card`  | Dark card shell: `--theme-sidebar-hover-bg` bg, `--theme-sidebar-border` border, `--radius-xl`, `--shadow-3`                                              |
| `.eia-input-auth` | Dark input: `--theme-canvas` bg, `--theme-sidebar-border` border, `--theme-canvas-text` text; focus ring `--theme-accent` + `--theme-accent-surface` glow |
| `.eia-auth-link`  | Accent link at 65% opacity at rest, full `--theme-accent` on hover                                                                                        |

**Never use `.eia-paper-surface`, `.eia-input`, or `--theme-paper` on auth forms.** Those tokens are
designed for the light paper surface inside the dashboard shell.

### Unified brand header

Identical across all three forms:

```tsx
<Image src="/logo.webp" width={48} height={48} style={{ borderRadius: "var(--radius-sm)" }} />
<h1  fontFamily: --font-serif, fontSize: --text-3xl, color: --theme-canvas-text, textAlign: center>Indulge OS</h1>
```

No subtitle under the title. `InvalidLinkCard` uses the same logo + title pattern.

### Error banners on dark surfaces

Use dark-surface semantic tokens — the light variants are designed for paper:

```
color:           var(--color-danger-dark-text)
backgroundColor: var(--color-danger-dark-fill)
border:          1px solid var(--color-danger-dark-border)
```

### Label colour override

`label-micro` renders dark by default (designed for paper). Inside auth forms, every `<label>` must
override: `style={{ color: 'var(--theme-sidebar-text)' }}`.

### Eye/EyeOff toggles

All password fields on all three forms have Eye/EyeOff toggles. Use `type="button"` explicitly —
omitting it submits the form.

---

## Auth layout (2026-06-02)

`layout.tsx` removed:

- Noise texture div (SVG data URI — parse cost not worth the subtle effect)
- `.eia-auth-line-1` and `.eia-auth-line-2` divs and their CSS definitions

`layout.tsx` kept:

- Both radial glow divs
- Both orb divs (`.eia-auth-orb-a`, `.eia-auth-orb-b`)

Root div has `backgroundColor: 'var(--theme-canvas)'` to prevent white flash before CSS loads.

---

## Root redirect (`src/app/page.tsx`)

Async server component. Calls `createClient()` → `getUser()`. Authenticated users → `/dashboard`;
unauthenticated → `/login`. This ensures the root URL never flashes `/login` for signed-in users.

---

## `is_active` gate — two-layer defence

**Layer 1 — `loginAction`** (`src/lib/actions/auth.ts`): after a successful `signInWithPassword`,
calls `getCurrentProfile()`. If `profile.is_active === false`, immediately calls
`supabase.auth.signOut()` and returns `{ error: formErrors.accountDeactivated }`. The session
cookie is voided before the browser ever receives it — no persistent session is written.

**Layer 2 — dashboard layout** (`src/app/(dashboard)/layout.tsx`): `if (!profile.is_active) redirect('/login')` — defence-in-depth for sessions that existed at the moment of deactivation and
have not yet expired.

`formErrors.accountDeactivated` = "Your account has been deactivated. Please contact your administrator."

The dashboard layout gate remains — it handles the edge case where a user is deactivated while
already logged in.

---

## PasswordStrengthBar

`src/components/ui/PasswordStrengthBar.tsx` — reusable UI primitive.

Props: `password: string`. Renders 4 segments with danger→warning→info→success colours as score
increases (0 = transparent, 1 = danger, 2 = warning, 3 = info, 4 = success). Returns `null` when
`password` is empty. Imported by both `PasswordChangeForm` (profile page) and `UpdatePasswordForm`
(auth).
