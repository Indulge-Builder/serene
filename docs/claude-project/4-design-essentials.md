# Serene: Design Essentials (Claude Project digest)

> **Purpose:** the design laws in one read: the material, the eight themes, dark mode, focus, type, motion, the mark and loading, the control families, the permanent decisions and Elaya's design language.
> **Audience:** a Claude Project chat that cannot read the repo, and anyone designing or reviewing UI with it.
> **Source-of-truth scope:** a digest of the laws and decisions. The law is `docs/design/DESIGN-DNA.md` (its "What changed since July" table and its dated "As built" notes win over its older body text); shared controls are `docs/design/control-system.md`; dated decisions are `docs/design/decision-log.md`. `docs/design/design-serene.md` is a superseded July snapshot: do not use it. Exact token values and component anatomy are in `10-design-system.md`. The Surface Contract and the Never-Do list are in the root `CLAUDE.md` (upload it beside this pack).
> **Last verified:** digested 2026-09-26 from DESIGN-DNA, control-system and the decision log as refreshed and verified against the token sheets and `src/components/ui/` that day.

**If your mental model is older than July 2026:** the "dark textured canvas with floating cream
paper, five or six themes, grain, white-gap focus rings" description is retired. Serene is one warm
neumorphic material with eight accent themes and a warm-charcoal dark mode, and the September
passes changed it again (September 22 to 26: material layers, controls, focus, empty states, icons,
touch).

## Philosophy

A luxury operating system people live in 8 to 12 hours a day: calm enough never to tire them,
precise enough to earn trust, refined enough to reflect the brand. One warm material, lit softly;
depth comes from contact shadows and hairlines, not colour or borders. Playfair Display is the
editorial voice (page titles, empty states); Geist Sans does the work; Geist Mono carries numbers
and ids. Every colour is a token. Motion explains; it never decorates.

## What changed since July (the rule today)

| Topic | The rule today |
| --- | --- |
| Material and shell | Cream canvas `--neu-canvas` `#ECE8E1`, an ivory workspace sheet (`--neu-workspace`), porcelain cards (`--neu-surface`), a sunken well (`--neu-well`) for insets. No grain, no dark canvas. A legacy bridge re-points the old tokens at it |
| Sidebar | Its own rail material with two soft theme washes; only the active icon gets an accent-gradient tile; rows stay transparent; no travelling pill, no logo glow |
| Themes | Eight: earth (default), air, water, fire, candy, rose, moss, lilac. A theme changes only the accent family |
| Dark mode | `data-neu="dark"` (warm charcoal) from a Light / Dark / Auto preference |
| Focus | One colour, `--neu-focus-edge`: a hugging frame on text fields, a 2px outline on actions, never a ring on an applied or open state |
| Controls and forms | `Button` (eight variants, 14px control radius), `SelectionButton`, the `Field` family, `FormSelect`, `Checkbox`, `DatePicker`; never a native checkbox, date, month or select |
| Card headers | The theme-coloured zone of a card: `--neu-header-surface` with header ink and icon tokens |
| Empty states | One anatomy (`ui/EmptyState`): raised tile, Playfair italic title, description, at most one action |
| Badges | Flat pastel fill and deep ink, no shadow |
| Loading | The seed mandala (`LogoSpinner`, never faster than 3.5s per turn); a skeleton sheen; no route overlay |
| Touch | Text fields 16px on touch, 44px targets, `.serene-form-row`, `.serene-touch-hit` |
| Icons | The seed mandala with its centre ring is the mark; the favicon is the bare mark; the phone shortcut sits on white; one Lucide mark per domain |

## The material

**Three materials plus a well.** The canvas is cream; the workspace (`.serene-shell-paper`) is an
ivory sheet on it; cards are porcelain and raise themselves one step further; the well is the sunken
tone for insets only (tracks, skeleton grounds, fields). The sidebar is its own rail
(`--neu-sidebar` under `--neu-sidebar-gradient`: two theme washes, 18% and 9% accent in light, 12%
and 6% in dark) and floats as a rounded card from md up.

**The rules of depth (as they stand after the 2026-09-22 material revision):**

1. **One material, soft light.** Never pure white or pure black surfaces.
2. **Warm contact shadows with an inner top highlight.** The July "paired dark and white bloom"
   shadows are gone. One depth scale (raised-sm, raised, raised-lg, hover, modal) and one radius
   scale.
3. **Raised means touchable.** Actions carry contact elevation. **Fields are shallow matte insets**
   (this replaced July's "inputs float too").
4. **Inset marks state only:** a pressed button, a toggle or tab track, a well, a skeleton ground, a
   field. A *selected* item floats on a pastel accent wash; it is never inset.
5. **Hover** = a stronger contact shadow plus `translateY(-1px)`, fine pointers only. **Press** =
   inset shading plus `scale(0.98)`.
6. **Status badges are flat** (pastel fill, deep ink, hairline, no shadow). Data tiles have their
   own clay tile material, separate from badges.

**Neutrals are one warm family** (2026-09-25, OKLCH hue about 85): canvas, well, fields, tracks,
hairlines, shadow colour, sidebar ink. A 2026-09-22 pass had moved nine of them to violet greys and
every inset read purple in every theme; they are warm again. Theme colour lives only in accents and
header washes, never in an inset.

**The legacy bridge.** `serene-neumorphic-tokens.css` imports after `design-tokens.css` and
re-points the old vocabulary (`--theme-canvas/paper/paper-subtle/paper-border`, the text and
sidebar families, `--shadow-1..4`, overlays, `--color-*`, `--status-*`, the radius names) at the
neumorphic roles. That is why token-clean components restyled with no per-file edits, and why
deleting that one `@import` line restores the stock values. Traps under the bridge:
`--theme-canvas` is now cream (not dark), and `--theme-paper-subtle` is the sunken well, never a
header strip or list row.

## Card headers (a trap fixed several times)

The header strip of `CardHeader` and `SectionCard` is the theme-coloured zone of a card. Since
2026-09-26 it paints `--neu-header-surface`: a 160 degree gradient from 9% to 14% theme accent on
the neutral `--neu-section-bg`, with a 12% accent hairline (`--neu-header-edge`) and a 1px inner top
light. Label text takes `--neu-header-ink`, the icon `--neu-header-icon`, a count in the right slot
header ink, `SectionCard`'s description `--neu-header-description`. **Never paint header text with
`--theme-accent`**: the same hue as the wash measured 1.6 to 2.0:1. Tune header colour only in the
neu sheet. History: 22% into the card surface (July), 6% (September 25, read as no theme at all),
now the gradient. The root `CLAUDE.md` row still says "22%"; it is out of date. `SubTaskModal`'s two
inline headers still paint the flat `--neu-header-wash`.

**Text on surfaces.** Theme-coloured text on a neutral surface uses `--neu-accent-deep` (=
`--theme-accent-muted`); `--theme-accent` is a fill, indicator or chart colour, not small text.
Semantic labels use `--color-*-text`; text on a saturated semantic fill uses `--color-*-fg`. The
quiet-text contrast question from August is closed: muted text was deepened on 2026-09-22/23 and
every measured text pair now passes 4.5:1.

## The eight themes

`data-theme` on `<html>`, default earth. A theme changes **only the accent family** (fill, hover,
muted, surface, fg and everything derived: header washes, sidebar washes, selected states, the first
chart series, the focus colour). Surfaces, shadows, inks, semantic chips, lead status colours and
the `--domain-*` chart palette never re-tint.

| Theme | Accent (fill) | Deep, text-safe | `--theme-accent-fg` (ink on the fill) |
| --- | --- | --- | --- |
| earth (default) | `#D0AC5A` honey gold | `#7D6738` | `#33290F` |
| air | `#7CA3C8` powder sky | `#4B6E8B` | `#192632` |
| water | `#68B1A5` soft seafoam | `#407369` | `#1C2E2A` |
| fire | `#E18C63` terracotta peach | `#9D5637` | `#3A1F12` |
| candy | `#DF8DB7` rose-pink | `#9D4E7C` | `#2E1522` |
| rose | `#D68891` English rose | `#915B61` | `#341D21` |
| moss | `#8DB181` matcha sage | `#56714D` | `#26301F` |
| lilac | `#A99BCF` light lilac | `#6E6297` | `#2E2840` |

**Every accent takes dark ink**; a pastel fill can never hold white text, so never "fix" an
accent-fg to white. The 2026-08-10 retune put every accent in one OKLCH L 0.70 to 0.76 band and
made every deep tone pass AA on paper; fills stop near 2:1 on purpose (buttons also carry a shadow,
a hairline and dark ink). The air and rose inks were adjusted on 2026-09-23 (the root `CLAUDE.md`
theme table still shows the older `#223240` and `#45272A`). Retired: cosmos, coffee, macha (0156),
martini (0157, its users moved to lilac). Never re-add a theme key without a CHECK migration.
`profiles.theme` is the truth, mirrored to the `serene-theme` cookie so the server stamps it with no
flash; a switch cross-dissolves for about 400ms.

## Dark mode: warm charcoal, candlelight not moonlight

`data-neu="dark"` on `<html>`. The preference is `light`, `dark` or `system` (UI label "Auto") in
`profiles.appearance`, mirrored to the `serene-appearance` cookie and stamped server-side; `system`
gets a tiny pre-paint script and media-scoped `<meta theme-color>` tags.
`applyAppearanceToDom()` is the only place the attribute flips. Canvas `#28241C`, card `#332E25`,
well `#221E17`. Accents lift lighter (`--neu-accent` 82% into white, the deep tone 66%); the
accent-fg stays the dark ink. Tooltips invert (cream on charcoal), the undo toast lifts to a raised
panel, the semantic pastels flip (fills darken, inks lighten), `--color-*-fg` becomes the charcoal.
**Components read role tokens and never branch on `isDark`.** Charts re-resolve on `data-neu` as
well as `data-theme`.

## Focus and state (2026-09-25: no rings)

- **One focus colour:** `--neu-focus-edge` (35% of the pastel accent mixed into 65% of its deep
  ink); at least 3:1 in every theme and mode (lowest: earth light, 3.20:1).
- **A focused text field** draws one hugging frame (its edge plus a 1px ring, no offset). It never
  also takes the outline.
- **Keyboard focus on an action** is the global outline: 2px, 2px out, `:focus-visible` only.
- **An applied filter or toggle** shows only its pastel wash and accent ink. **An open popup
  trigger** sits pressed. **A selected rail row** (Sia, WhatsApp) shows only the avatar ring and a
  semibold title, no wash.
- Gone: the white-gap `--shadow-focus` ring, the `.serene-pressable` focus ring, Button's
  `suppressFocusRing` prop.

## Typography

Fonts: Playfair Display (page titles, empty states, Elaya's voice), Geist Sans (everything else),
Geist Mono (ids, timestamps, numbers).

- **Page title:** `.type-page-title`, Playfair **light (300)**, fluid 24px to 30px, tight
  tracking, on the page's title row (there is no TopBar). Primary nav pages end the `<h1>` with a
  blinking accent `.page-title-dot` (2.4s); detail pages get a back button instead.
- **Section and card headings:** Geist semibold (`--text-lg` / `--text-md`). Body `--text-sm`.
- **Micro labels:** `.label-micro` and `.type-eyebrow` are tracked uppercase caps, painted in
  `--neu-accent-deep` by the neu layer (inside a header strip, header ink). The Rules' V-10 still
  states the recipe `text-[10px] font-medium uppercase tracking-[0.12em]`. The newer `Field` family
  uses sentence-case `--text-xs` medium labels in secondary ink; which label is the form standard is
  an open decision.
- **Weights:** `--weight-semibold` (600) is the ceiling; 700 is banned (V-04).
- **Numbers:** `StatTile` values are plain mono tabular text (no count-up since 2026-09-15); a
  number inside a sentence is wrapped in `<Num>` (mono, colour inherited); money on tiles is compact
  (`formatCurrencyCompact`, ₹28.1L), tables keep the long form. `AnimatedNumber` (NumberFlow) stays
  only for the dashboard widgets that use it.
- **Empty-state titles:** Playfair italic, `--text-xl` for a page, `--text-base` inside a card (a
  deliberate exception so an empty card reads like an empty page).
- Rules: never mix Playfair and Geist in one line; at most three sizes per component; never
  letter-space body text; Playfair italic is a mood, not word emphasis.

## Motion

Framer Motion 12 through `import { m as motion } from 'framer-motion'` (the root
`<MotionProvider>` is LazyMotion strict plus `MotionConfig reducedMotion="user"`). Every duration,
easing and spring comes from `src/lib/constants/motion.ts` (V-13).

- **M-01** entrances move one axis: `y 6→0` plus opacity (the modal alone adds a small scale).
- **M-02** exits are faster than entrances (250ms vs 400ms; page 500ms).
- **M-03** one element moves per interaction. **M-04** data transitions, never flashes.
- **M-05** reduced motion everywhere: app-wide in Framer, and every CSS loop has a
  `prefers-reduced-motion` gate; the brand mark rests finished and still.
- **M-06** only `transform` and `opacity`. Two sanctioned exceptions: expand and collapse composes
  `ui/CollapseReveal` (`grid-template-rows 0fr↔1fr`), and list-row arrival and removal composes
  `ui/RowMotion` (`MotionRow`, Framer's measured height tween, rows only).
- **Ceiling 500ms (V-03).** Exceptions: ambient loops (breathe 3s), chart draws, the boot, and the
  mandala's progress spins.
- **Vocabulary:** enter 400ms ease-out-expo; exit 250ms; tab indicator `SPRING_TAB` (260/32);
  `SPRING_CONFIG` (400/30); card hover `--neu-shadow-hover` plus `translateY(-1px)`; Button press in
  CSS (scale 0.97 to 0.98); `MotionButton` keeps `whileTap` for repeated standalone CTAs (never on
  a form submit); list stagger 40ms, card-list stagger `Math.min(index*80, 320)`. Polish constants:
  `PALETTE_DURATION` 320, `ROW_DURATION` 380, `TOOLTIP_DURATION` 180 with a 500ms intent,
  `CONDENSE_DURATION` 300, `COUNT_UP_MS` 1.4s, `UNDO_WINDOW_MS` 5s.
- **Spin speeds are law:** the boot 24s per turn, buttons and spinners 3.5s, Elaya thinking 8s.
  Never faster than 3.5s.
- **The carousel** follows the finger 1:1 with velocity hand-off (2026-09-25); one engine for the
  whole app.
- **Only Elaya animates text** (her status line morphs through `torph`); greetings, titles and empty
  states stay static.

## The mark, loading and the boot

- **`SeedMandala`** is the brand mark: eight rings through a common centre plus, since 2026-09-25,
  the official Indulge logo's ninth centre ring, drawn last. Variants `gradient` (umber to gold),
  `currentColor`, `darkDisc`. Its gradient stops are brand-fixed (never theme-tinted) and resolve
  through `--neu-mandala-*` so dark mode can lift them.
- **`AppBootScreen`** plays **once per browser session** (`serene:boot-seen` in sessionStorage,
  since 2026-09-16; later hard loads skip it). The mark draws (centre ring last), then turns once
  every 24 seconds; beneath it the SERENE / BY INDULGE lockup, SERENE in the Playfair wordmark whose
  tracking opens from 0.10em to 0.42em letter by letter as the draw completes. No tagline, no glow,
  no pulse, no progress bar (the draw is the progress). Soft navigations never replay it.
- **`LogoSpinner`** (the mark at 3.5s, sizes lg / md in an inset well, sm bare) replaced the arc
  `Spinner`, which is deleted. A pending control shows an 18px `currentColor` mark and keeps its
  width. `LoadingVeil` is a scrim with a centred spinner. `LoadingState` is a named quiet wait. Four
  places still spin Lucide's `Loader2` (the loading toast, `VendorCategoryPicker`,
  `SubscriptionHistoryModal`, `InvoiceControls`).
- **Skeletons** are a left-to-right sheen (`serene-shimmer-sweep`, 1.8s) resting on the flat well
  tone under reduced motion; every route has its own `loading.tsx` in its own shape. No brand mark
  on skeletons.
- **There is no route-change overlay** (`RouteVeil` was deleted 2026-07-03); a route's skeleton is
  the navigation feedback. DNA §14's route progress bar and direction-aware page transitions are
  unbuilt design targets.
- **App icons** (2026-09-26): the browser tab icon is the bare mark; the default phone shortcut is
  the mark on a white plate (a phone paints black or white behind a transparent icon); the three
  decorative icon picks sit on the cream `#ECE8E1` plate; the logo file is
  `public/logo-bg-removed.webp`. `scripts/pad-app-icons.mjs` renders every raster.

## Empty states (2026-09-25: one anatomy everywhere)

`ui/EmptyState`: a raised tile, a Playfair italic title, a calm sans description, at most one
action. `hero` (64px tile) for a page, table or section; `inline` (44px tile) inside a card, panel,
modal or mobile room; `framed` for a page-level paper card no card already holds. The tile takes
the page's sidebar icon for a page with nothing in it, and the Serene mark for an all-clear; never
a warning icon. Menus and listboxes keep a short text line. Never "No data available", never
hand-rolled, never re-wrapped in its own card. The old `brand` watermark, `ambient` and `size`
props are gone.

## The polish layer (from July, still standing)

⌘K `CommandPalette` (cmdk engine; actions, live leads / deals / tasks, Go to; its scrim is a
sanctioned 3px blur) · `MotionRow` list choreography (row motion wins inside lists) · `Button`'s
`status` save morph (idle → pending → sage "Saved" with a check draw, via `useButtonStatus`, only on
forms that stay mounted) · `CheckTile` for completion · **`PetalFall`**, brand-gold petals reserved
exclusively for a Won deal (lead to Won and walk-in deals) · `Tooltip`, the charcoal hover pill (500ms
intent, never on coarse pointers, `--z-tooltip`) · **undo instead of confirm** for reversible deletes
(`toast.undo`: a 5s accent depletion bar that is the countdown, no hover pause, no close; the
commit runs on timeout from the layout-mounted provider); `ConfirmDialog` stays for irreversible
operations · `CondensingPageHeader` (Leads, Deals, Tasks, Notes, Budget): sticks and, past about
24px of scroll, paints a 10px blur and a hairline, paint only.

## Controls (the control system, 2026-09-22 to 09-25)

| Role | Implementation |
| --- | --- |
| Actions | `Button`: primary (accent gradient, dark ink), secondary, control (toolbar and filter material; `active` + `aria-pressed` for applied), ghost, danger, success, warning, ghost-danger. Sizes 28 / 32 / 36 / 44px; radius `--neu-radius-control` (14px); `iconOnly` needs an `aria-label` |
| Choices, options, rich rows | `SelectionButton` (`choice` raised with a selected wash; `option` flat inside a menu; `row` for records) |
| File pickers | `UploadButton` (the caller owns the input and the upload) |
| Fields | `Field` / `Input` / `Textarea`: shallow inset, label, hint and error wired by id; 36px (44px on touch) |
| Selects, dates, ticks | `FormSelect`, `DatePicker` (`mode="month"`), `TimePicker`, `Checkbox`, `CheckTile`, `Toggle`; radio rows keep a hidden native input behind a drawn dot. **Never a native checkbox, date, month or select** |
| Status and feedback | `Badge` (flat), `Alert` (`role="alert"` for failures), `LoadingState` |
| Filters | `FilterBar`, `FilterDropdown` (applied = wash, open = pressed, no ring), `filterTriggerStyle` |
| Modals | `Dialog` / `Modal`: `pending` blocks the close button, backdrop and Escape while saving; `error` renders the whole-form error above the footer |

Instance `style` overrides describe layout only (width, placement, margins); appearance belongs to
the family. Coarse pointers get a 44px minimum. Checks: `pnpm check:ui` (tokens, the control
baseline, the contract tests) and `scripts/check-theme-contrast.mjs` (about 1,568 browser-computed
pairs across eight themes and both modes, 0 below target on 2026-09-25).

## Z-index (named only, V-05)

base 0 · raised 10 · dropdown 20 · sticky 30 (the condensing header and the floating Elaya button)
· sidebar 40 (also the phone's floating drawer trigger, so a stuck header never covers it) ·
overlay 50 (modal backdrops) · modal 60 · modal-overlay 61 and modal-nested 62 (only for a second
modal above an open one; 61 as a standalone backdrop blocks every click) · toast 70 · tooltip 75 ·
cursor 80 · veil 90 (orphaned since `RouteVeil` died; slated for removal) · boot 95.

A Framer `transform` on an ancestor breaks `position: fixed` children, so anchored panels portal to
`document.body` through `usePortalAnchor()` + `<FloatingPanel>`, and `Dialog` and `ConfirmDialog`
portal themselves. Never `window.confirm` (ESLint refuses it).

## Backdrop blur (V-06)

Sanctioned on three surfaces only: the mobile sidebar drawer backdrop (8px), the command palette
scrim (3px) and the condensing page header (10px, which took the retired TopBar's place). Never on
cards, dropdowns, modals or dialogs (removed from the modal overlay in July: it made the open
animation shimmer). Awaiting a decision: `LoadingVeil` (3px) and the `/m` drawer and sheet scrims
(2px) blur outside the list.

## Permanent decisions

- One radius per component; the Marshmallow scale (card 32, panel 28, field 22, tile 18, control
  and chip 14, pill).
- Elevation is the contact shadow plus the hairline; cards never rely on a coloured border.
- Selected state = wash (plus hairline), never a coloured border, never inset.
- **No single-edge coloured border** as a category or status signal anywhere (V-11); pills, dots,
  icons, badges instead. The table's one-edge selection strip was removed 2026-09-25.
- The sidebar has one active indicator: the accent-gradient icon tile. Hover turns the icon
  `--neu-accent-deep` with a heavier stroke and nudges the row 2px, never a background.
- Table header rows sit on `--neu-table-header-bg`; data rows on the card; never the same tone.
- Primary button labels use `--theme-accent-fg`, never `--theme-text-inverse` (V-02).
- Skeletons show for at least 150ms, with non-uniform widths; buttons never change width while
  loading (V-08).
- Charts: at most three colours per chart; colours through `useChartTokens()` /
  `resolveColorMap()` (never a CSS var into a Recharts `fill` / `stroke`); categorical series
  (agents, domains) use the `--domain-*` palette, never semantic colours.
- Icons: lucide-react only, `w-4 h-4` stroke 1.5 (sidebar 15px). Each domain wears one mark
  everywhere (`src/lib/constants/domain-icons.ts`: Onboarding `UserRound`, House `Home`, Shop
  `ShoppingBag`, Legacy `Trees`, Concierge `ConciergeBell`, Finance `IndianRupee`, Marketing
  `Megaphone`, Tech `Cpu`, Business `Briefcase`). A page's empty state reuses its sidebar icon.
- **Responsiveness (V-14):** Tailwind default breakpoints; client viewport branches via
  `useMediaQuery` + `MQ` only when behaviour differs; responsive shells in shared primitives;
  `dvh`; persisted layouts never drive the phone view.
- **Touch rules** (the 2026-09-26 mobile audit): text fields at least 16px on a coarse pointer
  (iOS zooms below that); form rows compose `.serene-form-row` and stack on a phone; tiny controls
  gain an invisible 44px hit area (`.serene-touch-hit`) rather than a new size; the keyboard never
  covers a composer (`interactiveWidget: resizes-content`; a bare Enter is a newline on touch; no
  `autoFocus` on touch); a whole-form error sits above the footer; drag surfaces have a touch path.
- Changing any permanent decision needs a decision-log entry (DNA §10.4). Silent deviation is a
  violation.

## Elaya's design language (as built)

- **She is a presence, not a chatbot.** Her face is `ElayaGlyphDisc`: the company logo (gold
  mandala) on a charcoal disc, the one dark-first surface in the cream UI and the one place she does
  not take the theme accent. It **always breathes** when she is present (3s, opacity 0.35 to 0.95;
  still under reduced motion). While she thinks or runs tools the disc turns the dark seed mandala
  at 8s per turn and her status line morphs (`ElayaStatusText`). Below 24px the small line mark
  `ElayaGlyph` stays, in `currentColor`. The theme accent still colours her surroundings (the
  user's bubble, her small mark, the floating button's wash).
- **Who sees her:** only people `hasElayaAccess(profile)` allows (concierge and the Gia domains,
  plus admin, founder and the tech workbench). Every surface checks it.
- **Where she appears:** the `/elaya` page (chat plus an identity card; chat only below lg), the
  dashboard presence card, the `/m` Elaya knob, and a floating round button (`ElayaWidget`,
  bottom right, `--z-sticky`) on every dashboard page except `/elaya`, opening the same chat in a
  dialog (a full sheet on a phone). Scrolling pages reserve room for it; a page's own floating
  action stacks above it (`.serene-above-elaya-fab`).
- **Messages:** both sides are bubbles (user on `--neu-chat-user-bg`, Elaya on
  `--neu-surface-high`, 20px radius with a 6px corner on the sender's side), model text through
  `ChatMarkdown`. The chat follows new text only while the reader is at the bottom; a "New reply"
  pill jumps back.
- **Proposals:** a risky write is confirmed by the user's reply in words, not a card. The
  two-action rule (exactly Approve and Dismiss) lives in `Modal type="elaya"` and in machine
  proposals such as the ticket `SentinelProposal`.
- **Not built:** inline suggestion cards (the 400ms-delay rule waits for the first one) and the
  side panel. One presence dot or nothing, never a number badge. Cross-domain insights are always
  labelled with their source domain.
- **Open contradictions in the DNA** (logged, undecided): §15.10 says she never lives in a floating
  corner bubble (the shipped `ElayaWidget` does), and rule L-05 says her messages are never bubbles
  and use a left accent border (the shipped chat uses bubbles, and a one-edge border is banned).

## Open design decisions (decision log, "Open")

- Build `/dev/components` or retire that 2026-05-29 decision in favour of the specimen scripts.
- Sanction or remove the blur on `LoadingVeil` and the `/m` scrims.
- The form label standard: uppercase micro label or the `Field` family's sentence case.
- Elaya's message shape and the floating button vs DNA §15.
- Keep or retire DNA §14 (route progress bar, page transitions).
- Retire DNA §5 rule 11 (CVA is not a dependency; variants live in CSS classes and
  `material-styles.ts`).
- Remove the orphaned `--z-veil` token.
