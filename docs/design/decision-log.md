# Design Decision Log

> **Purpose:** the dated record of every design decision: what was decided, why, and what it covers. Decide once, log it, stop accreting one-off violations.
> **Audience:** designers and engineers.
> **Source-of-truth scope:** design decisions only. Rule changes and architecture decisions live in the `../rules/The_Rules.md` Decision Log. Entries before 2026-06-11 are back-filled from `The_Rules.md`, `src/components/CLAUDE.md` and `docs/changelog.md`. Entries from 2026-07-03 to 2026-09-26 were back-filled on 2026-09-26 from `docs/changelog.md` and checked against the code; the changelog entry of the same date holds the full detail.
> **Last verified:** 2026-09-26 against `src/styles/serene-neumorphic-tokens.css`, `serene-families.css`, `serene-mobile.css`, `design-tokens.css`, `src/app/globals.css`, `src/lib/constants/{themes,appearance,domain-icons}.ts`, `src/components/ui/`, `scripts/pad-app-icons.mjs`, and git history for the header tokens.

Format: one entry per decision: **Date · Decision · Rationale · Scope**. Newest first.
A design rule changed without an entry here is not a change. It is a violation (DNA §10.4).

---

## Decided

### 2026-09-26 - Card headers: a two-stop theme gradient on the neutral section surface

- **Decision:** the header strip of `CardHeader` (`src/components/leads/CardHeader.tsx`) and `SectionCard` paints `--neu-header-surface`: a 160 degree gradient from `--neu-header-top` (9% accent into `--neu-section-bg`) to `--neu-header-wash` (14% accent into `--neu-section-bg`), with `--neu-header-highlight` (a 1px inner top light) and `--neu-header-edge` (12% accent into the hairline). Header text still takes `--neu-header-ink` and the icon `--neu-header-icon` (see 2026-08-10). Tune all of it in `serene-neumorphic-tokens.css` only.
- **Rationale:** the header wash has moved three times: 22% into the card surface (2026-07-03), then 6% into the neutral section surface in the quiet-surfaces pass (2026-09-25), which read as almost no theme at all. The 2026-09-26 values bring the theme back into the strip without the old heavy band. Recorded from the code (commit f819adc); the changelog entry of that day does not name it.
- **Scope:** every dossier and section card header. `SubTaskModal`'s two inline headers still paint the flat `--neu-header-wash`. The root `CLAUDE.md` and `src/components/CLAUDE.md` rows still say "22% accent into the surface" and are out of date.

### 2026-09-26 - Serene on a phone: the touch rules

- **Decision:** on a coarse pointer every text field renders at 16px or larger (iOS zooms the page below that), every `.serene-selection` row is at least 44px tall, and a tiny drawn control (a tick, a dot, a grip) keeps its size and gains an invisible 44px hit area through `.serene-touch-hit`. Two or three fields side by side compose `.serene-form-row` (stacks on a phone). A form modal's whole-form error goes in the `error` prop of `Dialog` / `Modal`, above the footer. On touch a bare Enter in a composer is a newline (`MessageBar sendOnEnter`), forms skip `autoFocus`, and the Android keyboard resizes the shell (`interactiveWidget: resizes-content`). `.serene-dossier-grid--aside-left` puts its aside after the main content below lg; `--side-first` puts it before.
- **Rationale:** the 2026-09-26 mobile audit (`../audits/2026-09-26-mobile-audit.md`) scored the phone experience 10 of 20. These shared rules remove most findings at once instead of page by page.
- **Scope:** app-wide. Left as they are on purpose: the calendar day cells (33px, a halo would hit the neighbouring day) and the revival policies table (still scrolls sideways).

### 2026-09-26 - Icons: a bare tab mark, the phone shortcut on white, one mark per domain

- **Decision:** the browser tab icon (`src/app/favicon.ico`) is the mark with no plate. The default home-screen icon (`public/icon-1.webp`, `src/app/apple-icon.png`, `public/icons/icon-192/512.png`) is the mark on a solid white plate; the three decorative icon picks keep the cream `#ECE8E1` plate. The logo file is `public/logo-bg-removed.webp` (sidebar, auth screens). `scripts/pad-app-icons.mjs` is the only source of these rasters. Each domain wears one Lucide mark everywhere: `src/lib/constants/domain-icons.ts` takes the four Gia marks from `domains.ts` (Onboarding `UserRound`, House `Home`, Shop `ShoppingBag`, Legacy `Trees`) and adds the rest (Concierge `ConciergeBell`, Finance `IndianRupee`, Marketing `Megaphone`, Tech `Cpu`, Business `Briefcase`).
- **Rationale:** a phone paints black (iOS) or white (Android) behind a transparent icon, so a shortcut needs a solid plate; the founder chose white for the phone and transparent for the tab. The domain map had drifted: Legacy was a crown on one card and a tree on the next.
- **Scope:** favicon, PWA icons, logo, and every domain card, picker and mobile tile. This supersedes the 2026-09-25 "cream icon" note for the default icon only.

### 2026-09-25 - One empty state anatomy everywhere; the mark gains its centre circle; a clean boot

- **Decision:** `ui/EmptyState` has one anatomy: a raised tile, a Playfair italic title, a calm sans description, at most one action. `hero` (64px tile) is a page, table or section; `inline` (44px tile) is inside a card, panel, modal or mobile room; `framed` is the page-level paper card. A page with nothing in it takes its sidebar icon; an all-clear takes the Serene mark; never a warning icon. Menus and listboxes keep a short text line. The `brand`, `ambient` and `size` props are gone. `SeedMandala` gained the official logo's ninth, centre ring, drawn last. The boot screen (`AppBootScreen`) is the mark turning once every 24 seconds with a SERENE / BY INDULGE lockup; the tagline, glow and breathing pulse are gone. On 2026-09-26 `EmptyState` became server-safe (no `'use client'`; only the fade-in is client, in `EmptyStateEntrance`).
- **Rationale:** the founder picked the /tickets empty table as the best empty state. About 117 call sites and 25 hand-rolled empties used four different looks.
- **Scope:** every empty state. Supersedes DNA §5.99 detail 04 (bare Playfair italic line), the 2026-07-03 `brand` watermark composition, and the old boot wordmark.

### 2026-09-25 - Focus and state without rings

- **Decision:** one focus colour, `--neu-focus-edge` (35% pastel accent mixed into 65% of its deep ink, at least 3:1 in every theme and mode). A focused text field draws one hugging frame in it (edge plus a 1px ring, no offset). Actions get a 2px keyboard outline, 2px out, on `:focus-visible` only. Applied filters keep only their pastel wash; an open popup trigger sits pressed (`--neu-shadow-pressed`); a selected rail row shows only the avatar ring. The white-gap `--shadow-focus` ring, the `.serene-pressable` focus ring and Button's `suppressFocusRing` prop are gone.
- **Rationale:** text fields match `:focus-visible` on every mouse click, so each click drew a dark ring outside the field's own frame, and applied or open states carried permanent accent rings. Together they read as stray lines wherever something was active. The pastel alone measured about 2:1; the mix clears 3:1.
- **Scope:** app-wide. Contract: `control-system.md` "Focus and state without rings". Supersedes DNA §5.99 detail 06 and every "`--shadow-focus` white gap" instruction.

### 2026-09-25 - Neutrals are one warm family (the purple tint removed)

- **Decision:** every neutral token sits on the cards' warm hue (OKLCH h about 85): canvas, well, input and track fills, hairlines, the shadow colour, the sidebar ink and the dark sidebar. Theme colour lives in accents and header washes; an inset never takes it. Rows in lists stay plain porcelain; the theme stays in small signals (the title dot, a selected thumb).
- **Rationale:** the 2026-09-22 material pass had moved nine neutrals to violet greys (h about 310). Next to the warm cards they read as a purple tint in every theme, which no theme could change. Each warm twin keeps its violet original's lightness, so depth and contrast are unchanged.
- **Scope:** `serene-neumorphic-tokens.css`. `--neu-canvas` = `NEU_CANVAS_LIGHT` (`#ECE8E1`) = the decorative icon plate, so the OS splash, browser bar and boot screen match.

### 2026-09-25 - No browser fallbacks: the shared form controls

- **Decision:** never a native checkbox, date, datetime-local, month input or select. Use `ui/Checkbox` (a real `button role="checkbox"`), `CheckTile` for a done-state, `Toggle` for on/off, `DatePicker` (with `mode="month"` for months) and `FormSelect`. A radio row keeps its native input visually hidden behind a drawn dot. One global thin scrollbar rule, `accent-color` as a safety net, no number spinners. Icon-only controls use `ui/Tooltip`, not `title`. Error and 404 pages render inside the shell with a framed `EmptyState`.
- **Rationale:** the 2026-09-25 UI audit (`../audits/2026-09-25-ui-ux-audit.md`) found screens falling back to the operating system's look (blue squares, OS date pickers in the browser's locale, thick grey scrollbars).
- **Scope:** app-wide. `Field`'s native `Select` export stays for constraint validation, form-library refs and multi-selects (`FormSelect` says so); it has no consumers today.

### 2026-09-22 to 2026-09-25 - Shared control and form families

- **Decision:** ordinary actions compose `Button` (variants primary, secondary, control, ghost, danger, success, warning, ghost-danger; sizes 28/32/36/44px; `--neu-radius-control` 14px). Choices, options and rich rows compose `SelectionButton` (appearances choice, option, row). File pickers compose `UploadButton`. Fields compose the `Field` family (`Field`, `Input`, `Textarea`); status wraps `Badge`; persistent feedback is `Alert`; a named wait is `LoadingState`. Filter triggers share `filterTriggerStyle`, data tiles `clayTileStyle`. `Dialog`/`Modal` `pending` blocks dismissal. Coarse pointers get a 44px minimum. Every change is checked by `npm run check:ui` and the measured contrast pass.
- **Rationale:** a 506-file inventory found 254 native buttons, 206 with inline chrome. Consistency comes from shared roles and states, not from making every clickable thing look raised.
- **Scope:** `control-system.md` is the contract and holds the counts and checks.

### 2026-09-22 - The material revision: tonal rail, ivory workspace, porcelain cards

- **Decision:** separate materials for the sidebar (`--neu-sidebar` plus two theme-derived washes: 18% and 9% accent in light, 12% and 6% in dark), the workspace (`--neu-workspace`, ivory) and cards (`--neu-surface`, porcelain). Warm contact shadows with inner highlights replace external white blooms. Fields are shallow insets; status badges are flat (no chip shadow); navigation highlights only the active icon (an accent-gradient tile), rows stay transparent. The sidebar logo glow is gone. `--neu-shadow-shell` is the quiet edge of the rail and workspace.
- **Rationale:** the first neumorphic material read as one flat cream with white halos; the layers separate navigation from content without extra chrome.
- **Scope:** shell and all surfaces. Supersedes DNA §5.99 detail 07 (pill shadows) and the paired white-shadow descriptions. The violet neutrals this pass introduced were reverted on 2026-09-25.

### 2026-09-16 - Navigation feel: the boot once per session, a skeleton on every route

- **Decision:** `AppBootScreen` plays once per browser session (`serene:boot-seen` in sessionStorage); later hard loads skip it. Every route has its own `loading.tsx` in its own shape (completed 2026-09-25 for the nested routes). The dashboard paints its shell first and streams widgets through `ui/Await`.
- **Rationale:** the 3.4 second boot on every reload, and routes that showed nothing until the server answered, made healthy navigation feel slow.
- **Scope:** dashboard layout and every route.

### 2026-09-15 - Stat tiles show plain numbers; money compacts on tiles only

- **Decision:** `StatTile` renders its value as plain text (no count-up). Money on tiles uses `formatCurrencyCompact` (₹28.1L, ₹1.2Cr); tables keep the long form. `AnimatedNumber` stays for the dashboard widgets that use it.
- **Rationale:** rolling digits on money tiles read as noise, and a number should be readable the moment it paints.
- **Scope:** every `StatTile`. Supersedes the 2026-07-03 adoption of `AnimatedNumber` in `StatTile`.

### 2026-08-25 - Only Elaya animates text; NumberFlow and cmdk as engines

- **Decision:** `@number-flow/react` is the engine inside `AnimatedNumber`, `cmdk` the engine inside `CommandPalette` (bare parts, never `Command.Dialog`), and `torph` morphs the Elaya status line only (`ElayaStatusText`). Greetings, page titles and empty states stay static.
- **Rationale:** each library upgrades a surface Serene already owns; Elaya is the one presence allowed to animate words.
- **Scope:** those three components. Deferred: globe and streaming-chart libraries (no data to feed them).

### 2026-08-10 - Accent contrast retune and the card header text tiers

- **Decision:** accents moved one register deeper into a shared OKLCH L 0.70 to 0.76 band (earth `#D0AC5A`, air `#7CA3C8`, water `#68B1A5`, fire `#E18C63`, candy `#DF8DB7`, rose `#D68891`, moss `#8DB181`, lilac `#A99BCF`). Deep tones (`--theme-accent-muted`) pass AA on paper (at least 4.6:1). Washes moved 12% to 16%. Fills stop at about 2:1 against paper on purpose: buttons also carry a shadow, a hairline and dark ink, and 3:1 would break the whisper pastels. On a card header the label takes `--neu-header-ink` (the theme's own dark ink softened into the wash) and the icon `--neu-header-icon` (the deep tone); in dark mode both move to the light end (`--neu-accent-deep`, `--neu-accent`).
- **Rationale:** candy and lilac fills measured under 1.5:1 against paper, every "text-safe" deep tone failed AA, and the header label measured 1.6 to 2.0:1 (the same hue as its wash).
- **Scope:** the two token files only. The accent-fg inks were later adjusted for air (`#192632`) and rose (`#341D21`) in the 2026-09-23 contrast pass. The quiet-text question this entry left open was closed on 2026-09-22/23 (muted text deepened; every measured text pair passes 4.5:1).

### 2026-07-10 - Calmer tabs, no blur on dialogs, undo for reversible deletes

- **Decision:** the tab indicator uses `SPRING_TAB` (stiffness 260, damping 32). `Dialog` has no backdrop blur, locks body scroll, and focuses its panel on open. A reversible single-task delete removes the row and offers `toast.undo`; a destructive group delete keeps `ConfirmDialog`. The deal-won petals fire on the lead to Won move as well as on walk-in deals.
- **Rationale:** blur on the modal overlay made the open animation shimmer and broke V-06; a confirm dialog for an undoable action is friction.
- **Scope:** `TabSelector`, `Dialog`, task deletes, `StatusActionPanel`.

### 2026-07-06 - Number fonts and loading marks

- **Decision:** `StatTile` values use the mono number font (`--font-mono`, tabular). A number inside a sentence is wrapped in `ui/Num`. The brand mark rests only on empty states, never on loading skeletons (the skeleton watermark is gone). `LogoSpinner size="md"` is the mobile loading look.
- **Rationale:** numbers should read the same in every tile; a spinning watermark behind skeletons was clutter.
- **Scope:** `StatTile`, drill-modal captions, `PageSkeletons`, the `/m` rooms.

### 2026-07-03 - The neumorphic final revision: one cream material

- **Decision:** the app renders on the soft-UI layer `src/styles/serene-neumorphic-tokens.css`, imported after `design-tokens.css`. One depth scale (Whisper shadows) and one radius scale (Marshmallow: card 32, panel 28, field 22, tile 18, control and chip 14, pill). A legacy bridge re-points `--theme-canvas/paper/text/sidebar`, `--shadow-*`, `--radius-*`, `--overlay-*`, `--color-*` and `--status-*` at the neu roles, so every token-clean component converted in one move. The dark canvas and floating dark shell retired; the canvas grain retired (noise reads as dirt on cream). A theme changes only the accent family: surfaces, shadows, text, semantic chips and the `--domain-*` chart palette never re-tint. Pastel accents always take dark ink (`--theme-accent-fg`).
- **Rationale:** the design department's neumorphic handoff (`design_handoff_neumorphic_system/`), recreated inside the existing token conventions so all themes still work.
- **Scope:** the whole UI. Removing the one `@import` line restores the stock values in `design-tokens.css`. Supersedes DNA §0 "dark textured canvas", §3.5 canvas texture, §5.99 details 01, 03, 06, 07 and 10.

### 2026-07-03 - Eight themes; Martini retired

- **Decision:** the theme set is **earth, air, water, fire, candy, rose, moss, lilac**; default earth. Rose, moss and lilac were added with their own blocks in `design-tokens.css`; the neu layer overrides the stock accents of the other five with softened values (retuned 2026-08-10). Migration 0157 moved `martini` to `lilac` and narrowed the CHECK to eight keys. `THEME_KEYS` in `src/lib/constants/themes.ts` is the SQL mirror.
- **Rationale:** the neumorphic handoff's eight-accent lineup; lilac is the one purple and the nearest tone to Martini.
- **Scope:** themes. Supersedes the 2026-07-02 six-theme entry below.

### 2026-07-03 - Dark mode: warm charcoal, a three-state preference

- **Decision:** dark mode is `data-neu="dark"` on `<html>` (warm charcoal, "candlelight, not moonlight"). The preference is `light`, `dark` or `system` (UI label "Auto") in `profiles.appearance` (migration 0158), mirrored to the `serene-appearance` cookie so the server stamps it before paint. `applyAppearanceToDom()` in `src/lib/constants/appearance.ts` is the only place the attribute flips. Components read role tokens and never branch on `isDark`. Accents lift lighter in dark; `--theme-accent-fg` stays the theme's dark ink.
- **Rationale:** the design department's dark-mode handoff; the semantic token architecture meant a mode is a token block, not a component sweep.
- **Scope:** the whole UI, the manifest colours and the charts (`useChartTokens` watches `data-neu`).

### 2026-07-03 - The logo, loading and motion calm-down

- **Decision:** `SeedMandala` is the brand mark; `LogoSpinner` replaced the arc `Spinner` (deleted). Spin speeds are law and never faster than 3.5s per turn. The full-page `RouteVeil` was deleted the same day: never reintroduce a route-change overlay; a route's `loading.tsx` is the navigation feedback. `.neu-reveal` was removed from cards so they do not replay on every navigation. The card header is the theme-coloured zone of a card (never the sunken well tone). The sidebar has one active indicator (the accent-gradient icon tile); the travelling pill, row wash and chevron are gone. Elaya's glyph is the company logo on a charcoal disc (`ElayaGlyphDisc`); below 24px the small mark stays.
- **Rationale:** the logo and loading handoff made every wait a quotation of the logo; the first cut then over-animated navigation.
- **Scope:** loading states, navigation, sidebar, Elaya's mark. Supersedes DNA §5.99 detail 01 (three-layer sidebar) and the `Loader2` loading icon.

### 2026-07-03 - The polish layer and the sanctioned blur surfaces

- **Decision:** ⌘K `CommandPalette`, `Tooltip` (charcoal pill, inverts in dark, never on coarse pointers), `CheckTile`, `PetalFall` (reserved for Won), `MotionRow` list choreography, the `undo` toast, `Button` save morph (`status`), and `CondensingPageHeader`. Backdrop blur is sanctioned on three surfaces: the mobile sidebar drawer backdrop, the command palette scrim, and the condensing page header (which took the retired TopBar's slot).
- **Rationale:** the polish handoff (`design_handoff_polish_layer/`).
- **Scope:** those components. See the Open table for two blur sites outside this list.

### 2026-07-03 - The `/m` mobile layer

- **Decision:** a separate client-app shell under `src/app/(client)/m/` built from `src/components/mobile/` and `src/styles/serene-mobile.css`: exactly four rooms plus the Elaya knob in the tab bar, the nine-circle mark as the drawer button (no hamburger), a touch scale by construction (primary 56, field 52, knob 44 floor, row 64). It uses `--neu-*` tokens only.
- **Rationale:** the mobile handoff (`design_handoff_mobile_system/`); a phone is a monitoring surface, not the desktop squeezed.
- **Scope:** `/m` only. The dashboard keeps its responsive drawer. Contract: `../modules/mobile-ops.md`.

### 2026-07-02 - Theme retirement: Cosmos, Coffee, and Macha are gone; the live set is six

> Superseded 2026-07-03: Martini was retired as well and the live set is eight. See the entry above.

- **Decision:** the theme vocabulary is now **earth, air, water, fire, martini, candy**. Cosmos, Coffee, and Macha are retired. Migration 0156 moved every saved profile on a retired theme back to `earth`, then narrowed the `profiles_theme_check` CHECK to the six live values. `THEME_KEYS` in `src/lib/constants/themes.ts` is the SQL mirror; the two must stay in sync. A stale cookie or cached value on a retired theme fails `isThemeKey()` and falls back to the default. Never re-add a theme key without a CHECK-extending migration.
- **Rationale:** Coffee and Macha (added the same day, 0154/0155) did not earn their keep next to the two new pastels; Cosmos had the weakest identity of the original five. Six themes is the set the team actually uses. Retiring in a follow-on migration (rather than editing 0154/0155) keeps the migration sequence append-only.
- **Scope:** the whole theme system. The two pastel themes this batch settled (Martini, periwinkle on evening indigo; Candy, pink on dark plum, both added in 0155) carry a new theme-design law: a pastel accent can never hold white text, so `--theme-accent-fg` is dark ink (`#191a38` on Martini, `#2b1420` on Candy; the Earth precedent). Their palettes live in the semantic chips, never the surfaces; paper stays a near-white whisper (the Air pattern).

### 2026-07-02 - Resolved: `.layout-canvas` is mounted on the auth shell only

- **Decision:** the open question from design-audit H-02 / DOC-01 is settled in code and recorded here as of 2026-07-02: `.layout-canvas` (the full atmosphere class) is mounted on the auth shell (`src/app/(auth)/layout.tsx`) and nowhere else. The dashboard keeps the flat `.layout-shell`; never mount the atmosphere class on it.
- **Rationale:** the auth surface is the one canvas-dark-by-design surface, so it can carry the atmosphere without the Earth-bleed risk the dashboard mount had (non-Earth themes define flat canvases).
- **Scope:** shell classes in `globals.css`. Codified in the root `CLAUDE.md` registry row.

### 2026-06-15 — First-touch speed is bucketed in business minutes, in TS, with untouched leads counted separately

- **Decision:** the performance first-touch speed scorecard (`FirstTouchScorecard` under the
  `AgentDetailPanel` outcome donut) buckets each period-cohort lead by `< 15m / 15–30m / ≤ 1h /
  1–3h / 3h+`, where **first-touch = the earliest `lead_notes` row with `call_outcome IS NOT NULL`**
  and **elapsed = business minutes** from `leads.created_at` to that note, per the agent's shift
  (global `BUSINESS_HOURS` fallback when `shift_days` is NULL). The bucketing is **TS-only** — the
  RPC (`get_agent_first_touch_pairs`, 0123) returns raw `(lead_id, created_at, first_call_at)` pairs
  and the service mapper (`getAgentFirstTouchScorecard`, React `cache()`) runs
  `lib/utils/sla.businessMinutesBetween` per row. Leads with **no qualifying call yet** are a
  separate `untouched` count, never a speed bucket. Bucket edges + colours live once in
  `lib/constants/performance.ts`.
- **Rationale:** the buckets are *business* minutes per shift, and that calendar/shift ruler already
  exists in `lib/utils/sla` (the SLA engine). Re-deriving it in SQL would fork the ruler (R-01) and
  drift from the SLA deadlines agents are already held to. SQL therefore does only the per-lead MIN;
  the one place business-minute math lives stays the one place. Counting untouched leads separately
  (rather than dropping them or dumping them in `3h+`) keeps the bucket total honest —
  `leadsWithFirstCall + untouched = totalCohort` — and a never-called lead is not a slow first-touch.
- **Scope:** `/performance` `AgentDetailPanel` only (manager + founder). The aggregate is computed
  once per (agent, period) via React `cache()` — never per render — and the RPC is admin-client-only
  (scope-param, EXECUTE revoked, Q-13). The `FounderDrillDownDeck` card is deliberately excluded to
  preserve its zero-per-swipe-fetch invariant. Any future "speed/SLA-elapsed" metric reuses
  `businessMinutesBetween` + `buildAgentShiftOverride` — never a SQL calendar fork.

### 2026-06-15 — A deal's type is derived from its domain, never free-picked

- **Decision:** `deals.deal_type` is determined by the deal's Gia domain, not chosen independently — `onboarding → membership`, `shop → retail`, `house/legacy → sale`. Retail deals additionally require a product `deal_category`. The mapping lives once in `DOMAIN_DEAL_CONFIG` (`src/lib/constants/deal-types.ts`, the `DOMAIN_INTERESTS` pattern) and drives the form, the action's cross-field validation, the filter items, and is mirrored by the DB CHECKs (migration 0122: `deals_deal_type_check` admits `sale`; `deals_retail_category_check` couples `retail ⇔ category`). The type is derived **server-side** in both write paths (`recordDeal` from the lead's domain, `createWalkInDeal` from the server-forced deal domain) — a client-sent `deal_type` is ignored (the field was removed from both Zod schemas).
- **Rationale:** allowing domain and type to be picked independently produced contradictory rows (an `onboarding` deal typed `retail`). Domain already carries the business meaning of the deal, so the type is a pure function of it — encoding that removes a whole class of data-integrity bugs and keeps the type/category vocabularies single-sourced (R-01).
- **Scope:** all deal creation (`NewDealModal` walk-ins + the lead→won `WonDealModal` path) and the `/deals` filter. The category filter surfaces only inside the `shop` domain slice. Adding a Gia domain or a retail category is one edit to `DOMAIN_DEAL_CONFIG` + one CHECK-extending migration.

### 2026-06-12 — D-01 carve-out: raw audio to Deepgram for voice-note transcription

- **Decision:** voice-note dictation sends raw recorded audio to Deepgram (Nova-2, `hi-Latn` for Hinglish — Roman-script Hindi) under their no-training / zero-retention API terms. This is a logged, scoped carve-out from D-01 ("no raw PII reaches an external AI model — pseudonymise first"). (Originally Nova-3 `language=multi`; the production model was later narrowed to Nova-2 `hi-Latn` — the carve-out itself is unchanged.)
- **Rationale:** audio cannot be pseudonymised — speech *is* the payload. The exposure is bounded: audio is transcribed in-memory and discarded (never written to Storage, disk, or DB); the transcript enters the system only as a human-reviewed editable draft saved through the existing sanitised `addLeadNote` path; the Deepgram key is server-only (`transcription-service.ts` is the sole call site).
- **Scope:** `src/lib/services/transcription-service.ts` only. Any future voice surface (Elaya's voice channel) must route through the same service and inherits the same no-storage contract. Transcripts containing client data are never logged (D-05).

### 2026-06-12 — Responsive implementation contract (audit: `docs/audits/2026-06-responsive-audit.md`)

The responsive *law* already existed (DNA §2.7 / §9 / §12); the code was desktop-only. Five implementation decisions, decided once:

- **D-1 — Breakpoint scale: Tailwind v4 defaults, no custom tokens.** The defaults equal DNA §2.7 (`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`). `--bp-*` in `design-tokens.css` are documentation-only — custom properties cannot appear in `@media` preludes (note added at the token block). Components use `md:` utilities; component-free CSS writes the raw pixel with a `/* --bp-* */` comment; client JS uses `useMediaQuery(MQ.…)` from `src/hooks/useMediaQuery.ts` — never raw `matchMedia` or `window.innerWidth` snapshots for layout.
- **D-2 — Dense tables become card stacks below `md`, owned by the table component.** DNA R-05 made structural: the table renders a `hidden md:block` table + `md:hidden` card stack (CSS toggle, SSR-safe, zero JS). The card stack renders a fixed mobile field set and deliberately ignores stored column preferences — persisted desktop shapes never drive narrow rendering. `md`–`lg` keeps container (not body) horizontal scroll. Reference: `LeadsTable.tsx`.
- **D-3 — Sidebar three modes:** `lg+` 240px full · `md` 64px icon rail (labels hidden, `title` tooltips) · `<md` off-canvas drawer (transform+visibility only) + the V-06-sanctioned blur backdrop, opened from a mobile top strip (hamburger + wordmark) that exists only `<md`. DNA §12's bottom nav bar is optional and deferred. Shell column-stacks `<md`; paper goes full-bleed (no gutter/radius).
- **D-4 — Fluid type for the page-title tier only:** `.type-page-title` = `clamp(var(--text-xl), 1.05rem + 1.6vw, var(--text-2xl))` (24→30px). Body/label/data text stays on the fixed scale.
- **D-5 — Responsiveness lives in shared primitives** (FilterBar wrap/scroll, table card-stack, `.serene-dossier-grid`, `.serene-shell*`), never per-page class sprinkle; page-level responsive classes are allowed for page chrome (padding/heading) only.

**Rationale:** only 10 of ~200 component files used a responsive prefix; the sanctioned mobile sidebar overlay didn't exist; two arbitrary breakpoints (820px bento, 767px raw matchMedia) had crept in. One contract stops per-surface improvisation.
**Scope shipped 2026-06-12:** foundation (`useMediaQuery`+`MQ`, `body` dvh, bento 820→md, fluid H1) + shell (Sidebar modes, drawer, mobile strip, `.serene-shell*`) + `/leads` reference (padding ladder, toolbar wrap, card stack, `.serene-dossier-grid` on the dossier). Remaining surfaces: follow-up phases F1–F5 in the audit doc.

### 2026-06-11 — `height: 0 ↔ auto` collapse is the one sanctioned layout-property animation

- **Decision:** `AnimatePresence` collapse/expand of variable-height sections may animate `height: 0 ↔ 'auto'` when all three hold: (a) the animated element carries `overflow: hidden`, (b) duration ≤ 250 ms (`EXIT_DURATION`), (c) it is paired with an opacity fade. Every other fill/progress/distribution animation stays transform-only: `scaleX` on a full-width inner element with `transformOrigin: 'left center'`.
- **Rationale:** `height: 0 → auto` is the one pattern Framer Motion cannot express via transform; the codebase had accreted unsanctioned copies. Decide once, log it, stop the drift. Audit items M-03 / M-04.
- **Scope:** GroupTasksTab (group expand re-timed 0.28 s → `EXIT_DURATION`, add-subtask row), MyTasksCalendarView (section body, quick-add), SubTaskModal (delete-confirm banner). `scaleX` adopted in `ProgressBar`, `EffortGrid`, `SubTaskModal` checklist fill; `AgentDistributionBar` segments are static flex-basis slices behind one container `scaleX`. Legacy unmounted `PersonalTasksTab.tsx` deleted (also cleared L-02). Mirrored as a rule-change row in `../rules/The_Rules.md` Decision Log.

### 2026-06-11 — The 500 ms animation ceiling has exactly three sanctioned exception classes

- **Decision:** DNA §10.1 #05 ("no animation above 500 ms") now names its exceptions explicitly: (a) `liaBreathe` (3 s, ambient), (b) the route-progress crawl phase (§14.3, 800 ms — progress indication while waiting on the network), (c) chart entrance draws (§16.7, 600–800 ms — data-draw choreography).
- **Rationale:** the document contradicted its own ceiling (design-audit DOC-06); the contradiction made every long animation look arguably sanctioned. Naming the exception classes closes that door.
- **Scope:** ~~documentary reconciliation only — M-05 remains open~~ **Closed later the same day (design-audit Phase 3):** the four 0.9 s performance refetch bars and the two 0.6 s fills are re-timed to the new `PAGE_DURATION` (0.5 s) export in `motion.ts`; they are in-panel component animation, not the route progress bar, so they need no exception. Inline spring/easing constants swept onto `motion.ts` in the same pass (`SPRING_CONFIG`, new `SPRING_BOUNCE` 400/20, `EASE_IN_OUT`, `EASE_OUT_EXPO`; toast bar CSS string → `var(--ease-out-expo)`) — audit item L-01.

### 2026-06-11 — Overlay/backdrop contract: one darkening strategy per job

- **Decision:** full-screen modal backdrops use `color-mix(in srgb, var(--theme-canvas) 72%, transparent)` (Dialog's theme-tinted formula); lighter panel/sheet backdrops use `--overlay-bg-light`; image scrims use `--overlay-scrim` (rgba 0,0,0,0.52). `--theme-overlay` does not exist — never reference it. No `backdrop-filter` on any of these (V-06).
- **Rationale:** five different darkening strategies existed for the same job, two hardcoded `rgba(0,0,0,…)`. Audit items M-02 / L-06 / DOC-02.
- **Scope:** adopted in `Dialog`, `SubTaskModal`, `ConfirmDialog`, `AssigneePickerModal`, `NotificationPanel` (mobile), `ProfileAvatarSection`. Contract table also in `src/components/CLAUDE.md` (Overlays).
- **As of 2026-09-26:** the neumorphic restyle moved `Dialog` and `ConfirmDialog` to the warm `--neu-scrim` (`rgba(56,51,43,0.35)`, deeper in dark), and the bridge re-points `--overlay-bg`, `--overlay-bg-light` and `--overlay-scrim` to warm taupe values. The "one strategy per job, no blur" rule stands.

### 2026-06-11 — `--color-{success,warning,danger}-fg` is THE label colour on saturated semantic fills

- **Decision:** new semantic tier `--color-*-fg: #ffffff` in `design-tokens.css`. The `-text` tier is the label colour on a `-light` fill only; `--theme-text-inverse` is never valid for this job. The old `var(--color-danger-fg, #fff)` token-with-fallback form is retired.
- **Rationale:** two call sites had independently invented the fallback form; the junk-revive button had a real contrast failure (dark-amber-on-amber). Audit items H-03 / L-03 / M-08.
- **Scope:** `ConfirmDialog`, `SubTaskModal` delete button, `StatusActionPanel` (success + revive confirm), `WonDealModal`. `Button.tsx`'s danger/success hover `--theme-text-inverse` stays as documented grandfathered drift.
- **As of 2026-09-26:** the bridge sets the `-fg` tier to `--neu-on-accent-soft` (warm white) in light and to the charcoal `--neu-canvas` in dark, where the semantic fills lift light (the Revive confirm measured 1.3:1 before that fix, 2026-09-25).

### 2026-06-11 — Saturated per-status fills are tokens: `--status-{name}-solid`

- **Decision:** the seven saturated lead-status fill colours live in `design-tokens.css` as `--status-{name}-solid`. Any per-status pipeline bar references these tokens — never raw hex. This **supersedes** the 2026-06-04 `BAR_COLORS` hex exception.
- **Rationale:** the 2026-06-04 exception's justification was factually wrong — the bar segments are HTML `div`s where `var(--…)` resolves natively. The design need (distinct saturated fills at small widths) was a token gap, not a hex licence. Audit item H-01.
- **Scope:** `ManagerLeadStatusWidget` migrated; same hex values, zero visual change. V-01 now has exactly one sanctioned hex exception (the `useChartTokens` `FALLBACK` pre-paint palette).
- **As of 2026-09-26:** the bridge maps the `-solid` tier to the pastel support family (`--neu-butter`, `--neu-powder`, `--neu-teal`, `--neu-lilac`, `--neu-sage`, `--neu-danger`), still theme-invariant. Sanctioned hex outside the token sheets today: the `useChartTokens` fallback, the `SeedMandala` brand stops (as `var(--neu-mandala-*)` fallbacks), the manifest mirrors in `appearance.ts`, and `app/global-error.tsx`.

### 2026-06-11 — Categorical data never wears semantic colours

- **Decision:** the agent-distribution segment palette switched from the semantic cycle (`accent → info → success → warning → danger`) to non-semantic `--domain-*` mid-tones. Semantic colours are reserved for data with good/bad meaning.
- **Rationale:** agent #5 rendering in danger red was a false signal — agents are categorical data, like domains. Audit item M-09.
- **Scope:** `AgentDistributionBar`; rule applies to any future categorical series.

### 2026-06-11 — `--shadow-gold-shimmer` is Earth-only

- **Decision:** defined under `[data-theme="earth"]` with a `none` default on `:root`.
- **Rationale:** an Earth-specific gold shadow was leaking to all themes, contradicting DNA §2. Audit item L-04.
- **Scope:** token sheet only; zero consumers today — any future non-Earth consumer degrades to no shadow.

### 2026-06-09 — Sanctioned hardcoded-colour exceptions are one explicit block

- **Decision:** all V-01 exceptions live in one discoverable block in `The_Rules.md` §5; V-12 points at the live colour bridge `src/components/ui/charts/useChartTokens.ts` (`useChartTokens()` + `resolveColorMap()`); the dead `src/lib/utils/chart-tokens.ts` stub is flagged (since deleted).
- **Rationale:** the real hardcoded-colour surface was wider than documented and V-12 referenced a `Not implemented` stub.
- **Scope:** documentation contract; the exception list grows only via an entry here.

### 2026-06-01 — One dropdown contract: `FilterDropdown`

- **Decision:** `ComboboxDropdown` deleted; every searchable single-select surface composes `FilterDropdown` (`multi={false}`). Dossier inline fields use `InlineSelectField`.
- **Rationale:** duplicate primitive; one contract reduces maintenance and keeps behaviour predictable.
- **Scope:** all filter bars and modals.

### 2026-05-29 — No Storybook; `/dev/components` is the visual test surface

- **Decision:** a single authenticated, role-gated page rendering every UI component in all variants, instead of Storybook.
- **Rationale:** lives in the codebase, updates automatically as tokens change, whole team can open it in a browser.
- **Scope:** to be built before the library reaches 40+ components or immediately after the first token regression in production — whichever comes first. **Not built yet.**

### 2026-05-29 — `useChartTokens` re-resolves via `MutationObserver`, not a `themeKey` prop

- **Decision:** the hook observes `data-theme` on `<html>` and re-resolves all chart colour tokens on theme change; `themeKey` survives only as an SSR/test escape hatch.
- **Rationale:** every chart on every authenticated page gets theme reactivity with zero wiring.
- **Scope:** all Recharts surfaces.

### 2026-05-29 — `Table<T>` vs bespoke feature tables

- **Decision:** `Table<T>` is for secondary/admin grids. Tables needing column visibility + drag-to-reorder clone the `LeadsTable` + `useLeadColumnPreferences` pattern; `LeadsTable` will never adopt `Table<T>`.
- **Rationale:** the bespoke leads table's column registry, toolbar, and per-cell overrides are intentional, not debt.
- **Scope:** all future tables.

---

## Open - decisions this log is waiting on

| Item | Question | Source |
| ---- | -------- | ------ |
| `/dev/components` build trigger | Per the 2026-05-29 decision: build it at 40+ components or at the first production token regression. Both happened: `src/components/ui/` holds 63 `.tsx` files, and a missing token (`--neu-shadow-shell`) broke every production build for three days in September. The route still does not exist. The shipped substitute is the specimen scripts in `control-system.md` (`preview-ui-controls.mjs`, `check-theme-contrast.mjs`). Decide: build the route, or retire the 2026-05-29 decision in favour of the scripts. | `src/components/CLAUDE.md`, changelog 2026-09-24 |
| Blur outside the sanctioned list | `LoadingVeil` (`ui/LogoSpinner.tsx`, 3px) and the `/m` drawer and sheet scrims (`mobile/MobileDrawer.tsx`, `mobile/overlays.tsx`, 2px) use `backdrop-filter`. Neither is on the sanctioned list (drawer backdrop, palette scrim, condensing header). Sanction them here or remove the blur. The 2026-09-25 UI audit also asked to replace the blocking `LoadingVeil` with an immediate modal plus skeleton. | code, `../audits/2026-09-25-ui-ux-audit.md` |
| Form label standard | The `Field` family labels are sentence case, `--text-xs` medium, secondary ink. DNA §10.3 rule 18 and §7.2 still require the uppercase micro-label on every field, and older forms (`TaskFormFields` `FieldLabel`) use it. Decide which is the standard and update DNA §7.2 and rule 18. | `src/components/ui/Field.tsx`, `serene-families.css` |
| Elaya's message shape | DNA §15.4 and rule L-05 say Elaya's messages are never bubbles (a 2px accent left border). The shipped chat uses bubbles for both sides (`ElayaMessageBubble`: user on `--neu-chat-user-bg`, Elaya on `--neu-surface-high`, 20/6 radius), and a left accent border is on the Never-Do list. Retire L-05 or rebuild the bubble. | `src/components/elaya/ElayaMessageBubble.tsx` |
| Elaya as a floating button | DNA §15.10 says Elaya "does not live in a floating bubble in the corner". The shipped `ElayaWidget` is a floating button (`.serene-elaya-fab`) on every page. Update §15.10 to the shipped presence or record why it is an exception. | `src/components/elaya/ElayaWidget.tsx`, `globals.css` |
| Route progress bar and page transitions | DNA §14.2 to §14.8 specify a progress bar and direction-aware page transitions. None are built; the shipped rule (2026-07-03) is "never a route-change overlay, the route's skeleton is the feedback". Decide whether §14 stays a design target or is retired. | DNA §14, changelog 2026-07-03 |
| CVA for variants | DNA §5 rule 11 requires `class-variance-authority`. It is not a dependency; variants live in CSS classes (`.serene-btn-*`) and `material-styles.ts` recipes. Retire rule 11 or adopt CVA. | `package.json` |
| Orphaned `--z-veil` | `--z-veil: 90` in `design-tokens.css` has no consumer since `RouteVeil` was deleted (2026-07-03). Remove the token. | changelog 2026-07-10 |

*(Closed: the `.layout-canvas` mounting question (2026-07-02: auth shell only); the `height: auto`, width-fill and M-05 re-timing questions (2026-06-11); the quiet-text contrast question raised on 2026-08-10 (muted text deepened 2026-09-22/23, every measured text pair passes 4.5:1).)*
