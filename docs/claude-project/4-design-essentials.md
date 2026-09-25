# Serene — Design Essentials (Claude Project digest)

> Digest of `docs/design/DESIGN-DNA.md` (the law), `docs/design/design.md` (the design-department
> handoff map), `docs/design/decision-log.md`, and the four shipped design handoffs (neumorphic
> FINAL, dark mode, logo/loading/motion, polish layer) — verified against
> `src/styles/serene-neumorphic-tokens.css` and `design-tokens.css` on 2026-08-24.
> The Surface Contract, theme table, and Never-Do list live in the root `CLAUDE.md` (upload it
> alongside). This file is the quick reference for the design *laws*. For the buildable *spec* —
> exact token values, shadow recipes, component anatomy — see **`10-design-system.md`**.
>
> **Read this first if your mental model is the old pack:** the "dark textured canvas + floating
> cream paper, five themes" description is **retired**. Since 2026-07-03 Serene is a neumorphic
> soft-UI system on one cream material, with eight accent themes and a warm-charcoal dark mode.

## Philosophy

A luxury OS for people who live in it 8–12 hours a day: calm enough to never tire them, precise
enough to earn trust, refined enough to reflect the brand. The surface is **one material lit from
one direction** — depth comes from paired light-and-shadow, not from colour or borders. Playfair
Display headings are the editorial soul. Every colour is a token; one elevation scale; one radius
scale; semantic tokens throughout.

## The neumorphic system — the five rules (locked)

The feel is **"Whisper" shadow depth + "Marshmallow" radii**. There is exactly ONE depth scale and
ONE radius scale; the earlier drop's deeper 6px/14px offsets and 24px card radii are obsolete and
must never be reintroduced.

1. **One material, one light.** A warm midtone ground (`--neu-canvas #ECE8E1`, surface `#F1EDE6`,
   surface-high `#F3EFE8`, well `#E9E4DB`), lit from the top-left (315°). Never pure white or pure
   black surfaces.
2. **Shadows come in pairs** — a dark bottom-right plus a light top-left. Never a lone drop shadow.
3. **Raised = touchable, and inputs float too.** A text input is distinguished from a button by its
   gradient sheen + inner top highlight (`--neu-input-bg` + `--neu-shadow-input`), never by sinking.
4. **Inset marks state only** — pressed buttons, toggle/tab tracks, skeletons, wells. A *selected*
   item floats on an accent wash; it is never inset.
5. **Hover** = `--neu-shadow-hover` + `translateY(-1px)`, gated to `(hover:hover)` and
   `(pointer:fine)`. **Press** = `--neu-shadow-pressed` + `scale(0.98)`. **Focus-visible** =
   `--neu-focus-ring`.

**The legacy-token bridge.** `serene-neumorphic-tokens.css` is imported *after* `design-tokens.css`
and re-points the whole legacy vocabulary (`--theme-canvas/paper/paper-subtle/paper-border`, the
text family, the sidebar family, `--shadow-1..4`, overlays, the semantic `--color-*` family, the
`--status-*` family, and the radius scale) at neu values. That is why token-compliant components
restyled themselves with no per-file edits — and why **deleting the one `@import` line reverts the
entire restyle**. Consequence to remember: `--theme-paper-subtle` now resolves to `--neu-well`, the
*sunken* tone, so using it as a header fill produces a well band (that bug was fixed by giving card
headers their own tokens — below).

## The card header contract (a real trap, fixed twice)

The header strip of a card is **the theme-coloured zone** of that card. It takes:

- background `--neu-header-wash` (22% accent mixed into the surface — 12% read washed out),
- a bottom hairline `--neu-header-edge` (never `--theme-paper-subtle`, the well tone),
- label text `--neu-header-ink` and icons `--neu-header-icon`.

**Never paint header text with `--theme-accent`** — same hue, near-same lightness, measured
**1.63–1.95:1** across the eight themes, the lowest-contrast text in the app. `--theme-accent-muted`
is not a fix either (3.9–4.1:1 on the wash). `--neu-header-ink` is the theme's own dark ink softened
82% into the wash (5.9–7.8:1); `--neu-header-icon` is accent-muted (~4:1, clearing the 3:1 graphic
bar). Dark mode inverts and has its own measured values. Anything else rendered *inside* a header
strip — a `SectionCard` description, the WhatsApp phone subtitle — takes header ink too; tertiary
and secondary are tuned for plain paper and fail on the tint. All seven dossier cards,
`SectionCard`, `SubTaskModal`'s two inline headers, and the WhatsApp conversation header compose
`<CardHeader>` and inherit this automatically. Tune header intensity **only** via those tokens.

**Known and deliberately unfixed:** `--theme-text-tertiary` measures **2.14:1** and
`--theme-text-secondary` **3.26:1** on plain paper — both under the 4.5:1 body bar, app-wide. That
is a product decision about how quiet Serene's quiet text is allowed to be, affecting hundreds of
surfaces; it was not bundled into the header fix.

## The eight themes

`data-theme` on `<html>`; default **Earth**. A theme changes **only the accent family** — surfaces,
shadow pairs, text, semantic status chips, and the `--domain-*` chart palette never re-tint.

| Theme | Accent | Deep (text-safe) | `--theme-accent-fg` |
| ----- | ------ | ---------------- | ------------------- |
| earth (default) | honey gold `#D0AC5A` | `#7D6738` | `#33290F` |
| air | powder sky `#7CA3C8` | `#4B6E8B` | `#223240` |
| water | soft seafoam `#68B1A5` | `#407369` | `#1C2E2A` |
| fire | terracotta peach `#E18C63` | `#9D5637` | `#3A1F12` |
| candy | rose-pink `#DF8DB7` | `#9D4E7C` | `#2E1522` |
| rose | English rose `#D68891` | `#915B61` | `#45272A` |
| moss | matcha sage `#8DB181` | `#56714D` | `#26301F` |
| lilac | light lilac `#A99BCF` | `#6E6297` | `#2E2840` |

**Every accent takes dark ink** (`--theme-accent-fg`) — a pastel fill can never hold white text.
Never "fix" an accent-fg to `#ffffff`. Cosmos / Coffee / Macha were retired 2026-07-02 (0156);
Martini was retired 2026-07-03 and its users moved to Lilac (0157).

**The 2026-08-10 contrast retune** moved every accent one register deeper into a unified OKLCH
L 0.70–0.76 band (hues untouched) because the softened pastels were vanishing against cream —
candy measured 1.47:1 and lilac 1.48:1 on paper. Fills now sit 1.85–2.31:1; every deep tone passes
AA (≥4.6:1) on paper; the accent washes moved 12% → 16% so selected states are visible. Fills
deliberately stop at ~2:1 rather than the 3:1 non-text bar — Serene buttons carry a paired shadow,
a hairline edge and dark ink, and pushing to L≈0.62 would break the whisper-pastel identity.

## Dark mode — warm charcoal, "candlelight not moonlight"

`data-neu="dark"` on `<html>`, driven by `profiles.appearance` (light / dark / **system**, UI label
"Auto") mirrored into the `serene-appearance` cookie and stamped server-side by the root layout;
`system` gets a pre-paint inline script and two media-scoped `<meta theme-color>` tags. Canvas
`#28241C`. `applyAppearanceToDom()` is the **only** place the attribute flips.

Components read **roles, never an `isDark` branch**. What the dark block redefines: the charcoal
family goes black-based; tooltips invert (cream pill, ink text); the undo/action toast lifts to
`--neu-surface-high` + a hairline (charcoal-on-charcoal would vanish); the command palette deepens;
the chat sender bubble uses the lifted accent wash; accents auto-lift lighter via `color-mix` so
on-cream "text-safe" tones stay legible; overlays and scrims deepen to `rgba(12,10,7,…)` in a small
**post-bridge** block (source order beats the bridge's equal-specificity selector — the comment in
the file explains why). Charts re-resolve on a mode flip because `useChartTokens` watches
`data-neu` alongside `data-theme`.

## Typography

Fonts: **Playfair Display** (display/H1/empty states/Elaya voice), **Geist Sans** (everything else),
**Geist Mono** (IDs, timestamps, metrics).

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
`font-bold` anywhere (V-04)** · field/micro labels are exactly `text-[10px] font-medium uppercase
tracking-[0.12em]` (V-10).

**The number-font rule.** Numbers take one of two fonts, both with `tabular-nums`: `--font-serif`
(Playfair) for hero stat values, `--font-mono` (Geist Mono) for secondary/technical numbers. Since
2026-07-06 `StatTile` renders its value in **mono** (both variants, app-wide), and a number embedded
**mid-sentence** in a caption or drill-modal subtitle is wrapped in **`<Num>`** — the inline numeric
token wrapper that renders mono + tabular-nums while inheriting colour and weight from the prose
around it. Never re-tint inside `<Num>`; it is not a hero value.

## Motion (Framer Motion 12; constants from `src/lib/constants/motion.ts` only)

Motion exists for spatial honesty, state communication, presence feedback — never decoration.

- **M-01** entrances move one axis only: `y: 6→0 + opacity 0→1`; nothing scales on enter (modal is
  the exception: y10 + scale 0.98, 350ms).
- **M-02** exits faster than entrances, always: exit 250ms vs enter 400ms, page entrance 500ms.
- **M-03** one element moves per interaction.
- **M-04** data transitions, never flashes (numbers count up via `AnimatedNumber`, rows fade in).
- **M-05** reduced motion always respected (app-wide via `<MotionProvider>`
  `MotionConfig reducedMotion="user"`; every CSS idle loop is `prefers-reduced-motion` gated, and
  the brand mark rests *finished and still*, never mid-draw).
- **M-06** only `transform` and `opacity` animate — never width/height/top/left/padding/margin;
  layout changes use `layoutId`. Expand/collapse = `<CollapseReveal>` (grid-template-rows 0fr↔1fr).
  The dashboard fuel-gauge tank fills via `scaleX`. **One sanctioned exception:** `ROW_VARIANTS`
  (the `<MotionRow>` list choreography) uses Framer's measured `height: auto` tween — that is
  handoff-sanctioned and scoped to list rows only.
- **Duration ceiling 500ms (V-03).** Sanctioned exceptions: the breathing/idle loops (3s), chart
  entrance draws (600–800ms), the boot sequence, and the named polish constants below.
- Vocabulary: standard enter `y6→0` 400ms ease-out-expo · exit `y→-4` 250ms · dropdown `y-4→0`
  200ms · card hover lift `translateY(-1px)` + shadow bloom · button press `whileTap scale 0.97` ·
  list stagger 40ms/item, max 8 animated · card-list entrance stagger `Math.min(index*80, 320)`.
- Named polish constants (all in `motion.ts`): `PALETTE_DURATION` 320ms · `ROW_DURATION` 380ms ·
  `TOOLTIP_DURATION` 180ms with `TOOLTIP_INTENT_MS` 500 · `CONDENSE_DURATION` 300ms ·
  `COUNT_UP_MS` 1.4s · `UNDO_WINDOW_MS` 5s · `SPRING_TAB` (260/32, the softened tab indicator) ·
  `SPRING_CONFIG` (400/30). **V-13: never inline a duration, bezier, or spring.**
- Import convention: `import { m as motion } from 'framer-motion'` — never the bare namespace
  (LazyMotion strict throws — A-17, and ESLint now catches it).

**Spin speeds are law:** boot 90s/rev · spinners, buttons 3.5s · Elaya thinking 8s · watermark
40s — never faster than 3.5s/rev.

## The logo, loading and boot system

The whole waiting layer is built from the company logo. One boot sequence is the source of truth;
every other waiting state is a smaller quotation of it.

- **`SeedMandala`** — THE procedural brand mark: 8 stroked circles, r=46, centres on a ring of
  radius exactly 46 (offset === r, so every circle passes through the exact centre and the crossings
  form the 8-petal seed flower). Variants `gradient` (umber `#2B1D10` → gold `#C08A4E`),
  `currentColor`, `darkDisc`. Its three gradient stops are the **only sanctioned component hex** —
  brand-fixed, never theme-tinted (they resolve through `--neu-mandala-*` so dark mode lifts them).
- **`AppBootScreen`** — the full-viewport boot on `--neu-canvas`, once per hard load, after the
  Indulge app's splash (2026-09-25): the mark draws (the centre circle last), then turns at 24s/rev;
  beneath it the SERENE / BY INDULGE lockup fades in and the word's tracking opens (0.10em to
  0.42em, each letter moved by a transform) as the draw completes; the whole thing fades at ~3.4s.
  No tagline, no glow, no pulse. Soft navigations never replay it. The progress bar under the
  wordmark was removed 2026-07-10 — the draw *is* the progress indicator.
- **`LogoSpinner` replaced the arc `Spinner`, which is DELETED — never recreate it.** Sizes `lg`/`md`
  are the mark in an inset cream well; `sm` is bare. Tiny in-control indicators use an inline
  14–16px `currentColor` mark. `LoadingVeil` (exported from `LogoSpinner.tsx`) is the scrim +
  centred spinner used while a heavy modal's pre-fetch resolves.
- **Skeletons** shimmer with a left→right sheen (`serene-shimmer-sweep`, 1.8s linear), falling back
  to a flat well tone under reduced motion. The spinning watermark that `PageHeaderSkeleton` used to
  stamp was **removed** — the brand mark rests only on the empty state, never on loading screens.
- **There is no `RouteVeil`.** It was deleted in the 2026-07-03 calm-down; never reintroduce a
  route-change overlay. (`--z-veil` is a now-orphaned token.)

## The polish layer (2026-07-03, fully adopted 2026-07-10)

Eight refinement patterns that move the app from "nice neumorphic CRM" to expensive-feeling product:

1. **⌘K command palette** — 640px panel over a charcoal scrim with `blur(3px)` (a **sanctioned**
   backdrop-blur surface), groups Actions · live leads/deals/tasks · Go-to. The panel chunk loads on
   first open.
2. **List choreography** — `<MotionRow>` inside `<AnimatePresence initial={false}>` is THE row
   entrance/exit. Row motion **wins** inside lists: never stack `.neu-reveal` on individual rows,
   and never leave a per-row `motion.div` behind when adopting it.
3. **Success moments** — `Button`'s `status` grammar (idle → pending → sage "Saved" + check draw)
   via `useButtonStatus`, adopted on forms that stay mounted through success (never on
   redirect/close-on-success forms, where the morph would never be seen); `<CheckTile>` for
   completion; **`PetalFall`** — ~14 brand-gold petals, **reserved exclusively for a Won deal**,
   fired through a sessionStorage handshake so it survives the RSC refresh.
4. **Living numbers** — `<AnimatedNumber>` takes the *already-formatted* string (numbers.ts stays
   the only formatter), animates the numeric run for 1.4s, and settles on the original string.
5. **Tooltip** — the charcoal hover pill: 500ms hover intent, instant reshow between adjacent
   triggers, focus-visible support, and **never on coarse pointers**.
6. **Undo instead of confirm** for reversible deletes — `toast.undo` with an accent depletion bar
   that *is* the countdown (no hover-pause, no X); the commit fires on timeout and is owned by the
   layout-mounted provider so it survives navigation. `ConfirmDialog` remains THE surface for
   irreversible operations (a group delete that cascades, admin actions).
7. **`CondensingPageHeader`** — sticky header that condenses past ~24px scroll. **Paint-only**:
   background, blur and hairline. The padding/font-size transitions were removed 2026-07-06 — they
   were layout animations under a blur, which is exactly the jank the motion rules exist to prevent.
8. **Brand empty states** — `<EmptyState brand>`: a single calm centred mandala watermark behind
   Playfair-italic copy and exactly one action.

## Z-index scale (named only — no raw values, V-05)

base 0 · raised 10 · dropdown 20 · sticky 30 · sidebar 40 · overlay 50 (modal backdrops) ·
modal 60 (panels, drawers, palette) · modal-overlay 61 + modal-nested 62 (**only** for a second
modal stacked above an existing modal — using 61 for a standalone backdrop blocks all clicks) ·
toast 70 · tooltip 75 · cursor 80 · veil 90 (orphaned) · boot 95.

Framer `transform` on an ancestor breaks `position: fixed` descendants (new containing block) — so
anchored panels portal to body via `usePortalAnchor()` + `<FloatingPanel>`, and both `Dialog`
(portaled since 2026-07-02) and `ConfirmDialog` portal themselves. Never hand-rolled, never
`window.confirm` (ESLint enforces it).

## Permanent component/pattern decisions

- No mixed radii within one component (V-07). One radius scale: card 32 / panel 28 / field 22 /
  tile 18 / chip 14 / pill 999.
- **Elevation is the paired shadow**, plus a 1px white hairline (`--neu-edge`) on raised surfaces.
  The pre-neumorphic "card border is the primary elevation signal" rule is superseded.
- The floating paper shell is back in soft-UI form: `.serene-shell-paper` is a raised sheet on the
  canvas gutter (full-bleed below `md`). Cards raise themselves a step further.
- Selected-state grammar is **wash + chip shadow + hairline** — never a coloured border, and never
  inset (Rule 4). Applies to theme/icon swatches, work-day pickers, persona chips, filter options.
- **No single-edge coloured border as a category/status indicator anywhere** (V-11) — pills, dots,
  icons, badges instead. A neutral structural divider is fine.
- Sidebar: the active item is **one** indicator — the accent-gradient icon tile (plus the active
  label colour). The old four-layer stack (wash + chip + travelling pill + chevron) is gone. Hover
  is **bold icon accent fill** (`--neu-accent-deep`, stroke 1.5 → 2.2), never a background wash.
- Table header rows and data rows are never the same tone; the leads table card sits on
  `--neu-surface-high` + `--neu-shadow-raised` so it floats off the shell paper.
- Primary button labels use `--theme-accent-fg` — never `--theme-text-inverse` (V-02).
- Backdrop blur only on: TopBar, mobile sidebar overlay, the command palette, and the
  `.serene-condense-header` (V-06). It was explicitly **removed** from the modal overlay — the
  per-frame recompute caused the open-animation shimmer.
- Skeletons: ≥150ms minimum display, non-uniform widths; buttons never change width on loading
  (V-08).
- Empty states: Playfair italic via `<EmptyState>` — never "No data available" (V-09).
- Page titles end with the blinking accent dot — primary nav pages only; detail pages get a back
  link instead.
- Charts: ≤3 colours, Recharts via `useChartTokens()`/`resolveColorMap()` (V-12); shared frame via
  `CartesianChartFrame`; never pass a CSS var straight to a Recharts `fill`/`stroke`.
- Icons: lucide-react only, `w-4 h-4` stroke 1.5 (sidebar `w-[15px]` exception).
- **Responsiveness (V-14):** Tailwind-default breakpoints; client-JS viewport branches go through
  `useMediaQuery` + `MQ` (never raw `matchMedia`/`window.innerWidth`) and only when *behaviour*
  differs; responsive shells live in shared primitives (`.serene-shell*`, `.serene-dossier-grid` +
  `--340`, `.serene-board`, FilterBar's mobile scroll row, Dialog's bottom sheet); full-height
  surfaces use `dvh`; persisted layouts never drive the narrow rendering.
- Changing any permanent decision requires a Decision Log entry (`docs/design/decision-log.md`) —
  never silent deviation.

## Elaya design language (DNA §15)

Elaya is a presence, not a chatbot. Her glyph **always breathes** when present (3s; stops under
reduced motion) — a static glyph means she is absent. Since the FINAL neumorphic revision the glyph
**is the company logo**: `ElayaGlyphDisc` renders the gold lotus mandala on a charcoal disc (the one
dark-first surface that survives the cream restyle), and it gains a `thinking` state (a spinning
`darkDisc` mark at 8s/rev) while she runs tools. Tiny inline mentions under 24px keep the ✦ mark.

Four design surfaces: Panel, Conversation (the `/elaya` page, the floating-widget modal, and the
`/m/elaya` screen), Inline Suggestion (always a 400ms delay, never instant), Action Proposal
(exactly two actions: Approve / Dismiss — the in-app proposal *card* is still a design target;
today's risky writes confirm with a chat "yes"). One presence dot or nothing — never a number badge.
Her colour is always `--theme-accent` — she belongs to the theme. Cross-domain insights are always
labelled with the source domain. Privacy: no raw client PII ever reaches an external model.
