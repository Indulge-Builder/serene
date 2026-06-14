# Design system — Theme, Tokens, Motion, Layout

> **Purpose:** Unify colour, spacing, shadow, and motion across five themes (Earth, Air, Water, Fire,
> Cosmos) via CSS variables and Framer Motion constants, and enforce the semantic text-colour Surface
> Contract and the canonical page layout.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md). Full reference: `docs/design/DESIGN-DNA.md`, `src/styles/design-tokens.css`.

---

## The Surface Contract (text colour per surface)

| Surface | Text token |
|---|---|
| `--theme-paper` / `--theme-paper-subtle` | `--theme-text-primary` |
| `--theme-canvas` (dark shell) | `--theme-canvas-text` |
| `--theme-accent` fills (buttons/badges) | `--theme-accent-fg` |
| success/danger/warning/info fills | matching `*-text` token |
| secondary labels | `--theme-text-secondary` |
| placeholders/timestamps/muted | `--theme-text-tertiary` |
| sidebar nav inactive / active | `--theme-sidebar-text` / `--theme-sidebar-active` |

**Never `--theme-text-inverse` on accent fills — use `--theme-accent-fg`** (Earth `#201808`, others `#ffffff`).

---

## Key rules

- **Every colour is a CSS variable** (Rule 01) — no hex, no `text-gray-*`/`bg-white`. All tokens live in
  `design-tokens.css` (5 theme blocks + semantic + global).
- **SSR theme mirror** — cookie `serene-theme` → the root layout stamps `data-theme` on `<html>`
  server-side (zero flash). `ThemeInitializer` corrects a stale cookie vs `profiles.theme`; `ThemeSelector`
  re-syncs on switch. The theme attribute goes on `<html>`.
- **`import { m as motion } from 'framer-motion'`** — never the bare `{ motion }` (the strict `LazyMotion`
  in `MotionProvider` throws). A-17.
- **Only animate `transform` and `opacity`** — never width/height/padding/margin. Expand/collapse composes
  `<CollapseReveal>` (grid-template-rows 0fr↔1fr).
- **All motion constants live in `lib/constants/motion.ts`** (`ENTER_DURATION`, `EASE_OUT_EXPO`,
  `SPRING_CONFIG`, `MODAL_VARIANTS`, …) — never re-declare a duration/easing/spring inline (V-13).
- **No `backdrop-blur`** outside TopBar / mobile sidebar overlay / command palette. Max `--weight-semibold`
  (600), never `font-bold`. No one-edge coloured border as a status indicator.

---

## Standard page layout (canonical for every primary-nav list page)

```tsx
<main className="flex-1 p-8">
  <div className="flex items-center justify-between gap-4 mb-6">      {/* title left, CTA right */}
    <h1 className="type-page-title m-0">Title<span className="page-title-dot">.</span></h1>
    <ActionButton />
  </div>
  <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
    <FiltersComponent />                                              {/* filter bar strip */}
  </div>
  <Suspense fallback={<ContentSkeleton />}><ContentAsync /></Suspense>{/* content immediately below */}
</main>
```

- The `page-title-dot` (slow accent blink) is **only** on top-level primary-nav pages; detail pages show a
  back link instead.
- Dense table (`/leads`) vs card list (`/admin/users`, `/campaigns`) — see CLAUDE.md "Two content display modes."

---

## Shell classes (`globals.css`)

- `.layout-shell` — the mounted flat dashboard shell. `.layout-canvas` — the atmosphere class (auth shell only).
- `.serene-shell*` / `.serene-sidebar*` — responsive shell + sidebar.
- `.serene-dossier-grid` (+ `--340` variant for 340px identity sidebars: `/profile`, `/admin/users/[id]`).
- `.serene-board` — group-task board (snap-scroll rail `<lg`, 5 columns `lg+`). `.serene-touch` — touch affordances.

---

## File map

| File | Role |
|---|---|
| `src/styles/design-tokens.css` | ALL CSS variables; 5 theme blocks; semantic + global tokens; animations |
| `src/lib/constants/themes.ts` | `THEME_KEYS`/`ThemeKey`/`isThemeKey`, `THEME_COOKIE`, `persistThemeCookie` |
| `src/lib/constants/motion.ts` | All Framer Motion constants (durations, easings, variants) |
| `src/components/layout/MotionProvider.tsx` | `LazyMotion strict` + `domMax` + `MotionConfig reducedMotion="user"` |
| `src/components/layout/ThemeInitializer.tsx` | Reconciles stale cookie vs `profiles.theme` |
| `src/app/globals.css` | `.layout-shell`/`.layout-canvas` + the `.serene-*` responsive shell classes |
