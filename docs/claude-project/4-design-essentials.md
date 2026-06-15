# Serene — Design Essentials (Claude Project digest)

> Generated digest of `docs/design/DESIGN-DNA.md` (7,076 lines — the law) — 2026-06-15.
> The Surface Contract, theme table, and Never-Do list live in `CLAUDE.md` (uploaded
> alongside); this file adds the rest of the design law. Exact token values:
> `src/styles/design-tokens.css`.

## Philosophy

A luxury OS for people who live in it 8–12 hours a day: calm enough to never tire them,
precise enough to earn trust, refined enough to reflect the brand. Two-layer shell — dark
textured canvas + floating cream paper content with grain on both. Playfair Display headings
are the editorial soul. Every colour is a token; one elevation system; one radius system;
semantic tokens throughout.

## Typography

Fonts: **Playfair Display** (display/H1/empty states/Elaya voice), **Geist Sans** (everything
else), **Geist Mono** (IDs, timestamps, metrics).

| Level | Font | Size | Weight | Used for |
| ----- | ---- | ---- | ------ | -------- |
| Display | Playfair | `--text-display` | light | Elaya hero, empty states |
| H1 | Playfair | `--text-2xl/3xl` | semibold | Page titles |
| H2 / H3 | Geist | `--text-lg` / `--text-md` | semibold | Section / card headings |
| Body | Geist | `--text-sm` | normal | All content |
| Small | Geist | `--text-xs` | normal/medium | Captions, meta |
| Micro | Geist | `--text-2xs` | semibold, uppercase, widest tracking | Labels, dividers |

Rules: never mix Playfair and Geist in one line · max three type sizes per component · never
letter-space body text · never colour-only hierarchy · Playfair italic is a mood (Elaya's voice,
empty states), not word emphasis · **`--weight-semibold` (600) is the heaviest weight — no
font-bold anywhere** · field labels are exactly: 10px, font-medium, uppercase,
tracking-[0.12em], `--theme-text-tertiary`.

## Motion (Framer Motion 12; constants from `src/lib/constants/motion.ts` only)

Motion exists for spatial honesty, state communication, presence feedback — never decoration.

- **M-01** entrances move one axis only: `y: 6→0 + opacity 0→1`; nothing scales on enter
  (modal is the exception: y10 + scale 0.98, 350ms).
- **M-02** exits faster than entrances, always: exit 250ms (`--duration-exit`) vs enter 400ms
  (`--duration-enter`), page entrance 500ms (`--duration-page`).
- **M-03** one element moves per interaction.
- **M-04** data transitions, never flashes (numbers count up, rows fade in).
- **M-05** reduced motion always respected (app-wide via `<MotionProvider>`
  `MotionConfig reducedMotion="user"`).
- **M-06** only `transform` and `opacity` animate — never width/height/top/left/padding/margin;
  layout changes use `layoutId`. Expand/collapse = `<CollapseReveal>` (grid-template-rows
  0fr↔1fr), never height auto.
- Vocabulary: standard enter `y6→0` 400ms ease-out-expo · exit `y→-4` 250ms · dropdown
  `y-4→0` 200ms · card hover lift CSS-only `translateY(-1px)` + shadow deepens separately ·
  sidebar active pill `layoutId="active-pill"` spring (stiffness 380, damping 30) · button
  press `whileTap scale 0.97` 80ms · list stagger 40ms/item, max 8 animated, rest instant ·
  card-list entrance stagger `Math.min(index * 80, 320)`.
- **Duration ceiling 500ms.** Sanctioned exceptions only: liaBreathe (3s ambient), route
  progress crawl, chart entrance draws (600–800ms).
- Import convention: `import { m as motion } from 'framer-motion'` — never the bare namespace
  (LazyMotion strict throws).

## Z-index scale (named only — no raw values)

base 0 · raised 10 · dropdown 20 · sticky 30 (TopBar) · sidebar 40 · overlay 50 (modal
backdrops) · modal 60 (panels, drawers, palette) · modal-overlay 61 + modal-nested 62
(**only** for a second modal stacked above an existing modal — using 61 for a standalone
backdrop blocks all clicks) · toast 70 · cursor 80 (Elaya, drag handles).

Framer `transform` on an ancestor breaks `position: fixed` descendants (new containing block)
— so anchored panels portal to body via `usePortalAnchor()` + `<FloatingPanel>`, confirms via
`<ConfirmDialog>` (owns 50/60 + body portal). Never hand-rolled, never `window.confirm`.

## Permanent component/pattern decisions

- No mixed radii within one component.
- Shadows use `rgb(0 0 0 / fraction)` — never px-value drop shadows.
- **Card border is the primary elevation signal; shadow is secondary.** No borderless cards.
  Rest `--shadow-1` → hover `--shadow-2` + translateY(-1px).
- Table header rows `--theme-paper-subtle`, data rows `--theme-paper` — never equal.
- Sidebar active state is three layers (fill + full border + travelling pill) — never
  left-border-only. No single-edge coloured border as a category/status indicator anywhere —
  pills, dots, icons, badges instead.
- Primary button labels use `--theme-accent-fg` (on Earth that's dark-on-gold), never
  `--theme-text-inverse`.
- Backdrop blur only on: TopBar, mobile sidebar overlay, command palette. Nothing else —
  depth comes from elevation, borders, accent surfaces.
- Placeholders always `--theme-text-tertiary`.
- Skeletons: ≥150ms minimum display, non-uniform widths, pulse animation; buttons never change
  width on loading (spinner swaps in-place).
- Empty states: Playfair italic heading via `<EmptyState>` — never "No data available".
- Page titles end with the blinking accent dot (`page-title-dot`) — primary nav pages only;
  detail pages get a back link instead.
- Toasts: max 3 in DOM, danger never auto-dismisses, "living bar" countdown; singleton `toast`
  API via `useToast`.
- Forms: errors from `lib/validations/form-errors.ts` (never raw Zod), fields never cleared on
  validation error, width-preserving submit pending states.
- Charts: ≤3 colours, Recharts via `useChartTokens()` (resolves CSS vars → hex, re-resolves on
  theme change), shared frame via `CartesianChartFrame`.
- Icons: lucide-react only, `w-4 h-4` stroke 1.5 (sidebar `w-[15px]` exception).
- Changing any permanent decision requires a Decision Log entry
  (`docs/design/decision-log.md`) — never silent deviation.

## The five themes

`data-theme` on `<html>`; default Earth. Earth = champagne gold accent #c9a553, warm canvas + grain
(accent-fg is warm ink #201808 — dark text on gold); Air = slate blue #54769e; Water = deep
teal #1e7d72; Fire = ember sienna #c25022; Cosmos = nebula amethyst #7a5fc0 (accent-fg white
on all non-Earth themes — every accent holds ≥4.5:1 AA with its fg). Theme is stored on
`profiles.theme`; a zero-flash inline script applies it before paint.

## Elaya design language (DNA §15 — partially built, design law unchanged)

Elaya is now **live in code** — read-only tools + SSE chat at `/api/elaya/chat`, Phase 2 agentic
writes (4 write tools; `update_lead_status`/`reassign_lead` are propose-only via a pure-code
confirmation resolver), a WhatsApp staff channel, and Deepgram voice input. The **four surfaces**
below remain the **design target** (still being built out), but the design law itself is current
and still governs every surface.

Elaya is a presence, not a chatbot. Her glyph **always breathes** when present (liaBreathe, 3s)
— a static glyph means she is absent. Four surfaces: Panel (persistent side panel),
Conversation (full-screen), Inline Suggestion (always 400ms delay, never instant), Action
Proposal (exactly two actions: Approve / Dismiss). One presence dot or nothing — never a
number badge. Her colour is always `--theme-accent` — she belongs to the theme. Cross-domain
insights always labelled with the source domain. Privacy: no raw client PII ever reaches an
external model (pseudonymise first).
