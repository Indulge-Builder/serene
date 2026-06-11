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
| `.eia-auth-card`  | Jewel-box card shell: gradient hairline border (accent-kissed top arc → `--theme-sidebar-border`, painted border-box under a transparent border), lamplight wash at top centre over `--theme-sidebar-hover-bg`, `--radius-xl`, `--shadow-3` + accent underglow bloom; one-time entrance + direct-children stagger (60ms steps) |
| `.eia-auth-logo-medallion` | 72px circular hairline ring (30% accent) + halo around the 48px logo — the mandala's innermost ring on the surface; part of the unified brand header |
| `.eia-input-auth` | Dark input: `--theme-canvas` bg, `--theme-sidebar-border` border, `--theme-canvas-text` text; focus ring `--theme-accent` + `--theme-accent-surface` glow |
| `.eia-auth-link`  | Accent link at 65% opacity at rest, full `--theme-accent` on hover                                                                                        |

**Never use `.eia-paper-surface`, `.eia-input`, or `--theme-paper` on auth forms.** Those tokens are
designed for the light paper surface inside the dashboard shell.

### Unified brand header

Identical across all three forms:

```tsx
<div className="eia-auth-logo-medallion">
  <Image src="/logo.webp" width={48} height={48} style={{ borderRadius: "var(--radius-sm)" }} />
</div>
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

## Auth layout — composed atmosphere (2026-06-11)

The auth shell is a composed scene, back to front (all layers `pointer-events-none`, `aria-hidden`):

1. **`.layout-canvas` on the root div** — grain SVG + Earth's `--theme-canvas-gradient-*` washes (other
   themes: grain only, their gradient tokens are `none`). This is the class's intended mount point.
   Supersedes the 2026-06-02 per-page noise-div removal — the class paints grain as one background, no extra DOM.
2. **Two radial glow divs** — primary at 62% 38% ("off-centre is a window"), secondary counter-corner.
3. **Engraved mandala** (`.eia-auth-mandala-wrap` > `.eia-auth-mandala` + `.eia-auth-mandala-lit` >
   `.eia-auth-mandala-beam`) — 8-fold Seed-of-Life rosette (logo geometry): eight circles whose edges
   all pass through one central point hidden behind the card, petals framing it on every side. One SVG
   alpha mask shared by the quiet-accent static layer and the lit layer; the conic beam rotates once
   per 120s **inside** the statically-masked lit layer — the mask must never rotate (8-fold geometry
   is not rotation-invariant). Transform-only.
4. **Two orb divs** (`.eia-auth-orb-a`, `.eia-auth-orb-b`) — slow drift + subtle scale breathe.

`.eia-auth-card` has a one-time entrance (rise + fade, `--duration-page` `--ease-out-expo`) shared by all
three forms. `prefers-reduced-motion`: drift/sweep are killed, entrance collapses to an opacity fade.

Root div keeps inline `backgroundColor: 'var(--theme-canvas)'` to prevent white flash before CSS loads.
Still absent by design: `.eia-auth-line-1/2` divs (removed 2026-06-02).

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
