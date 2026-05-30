Good. I now have the full picture. Here's what's confirmed before writing a single prompt:

**What already exists** (must extend, not recreate):

- `SearchBar.tsx` — exists, controlled, 3 sizes, clear button. Needs placeholder copy upgrade only.
- `FilterDropdown.tsx` — exists, multi/single select, chevron, active count badge. Needs visual enhancement.
- `Calendar.tsx` — exists, month grid, Framer Motion, range highlight. Needs tasks overview mode.
- `DatePicker.tsx` — exists, trigger + popover, range support. Needs time picker enhancement.
- `Button.tsx` — exists, 5 variants, 4 sizes, loading state. May need audit for full spec compliance.
- `TabSelector.tsx` — exists, 3 variants (pill/border-bottom/connected), SPRING_CONFIG, compound API. Needs colour audit only.
- `AssigneePickerModal` + `LeadInfoCard` inline combobox — the reassign pattern exists on the lead dossier. Must be extracted as `ComboboxDropdown.tsx`.

**What does NOT exist** (net-new):

- `ComboboxDropdown.tsx` — searchable dropdown with Avatar rows (the reassign pattern exists inline but not as a reusable ui component)

---

Here are the seven Cursor prompts. Paste each one individually.

---

## Prompt 1 — `ComboboxDropdown` (Searchable Dropdown with Avatar Rows)

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §5.09 (Dropdown/Select), §5.10 (Search Bar)
4. src/styles/design-tokens.css — all tokens used below
5. src/lib/constants/motion.ts — SPRING_CONFIG, DROPDOWN_VARIANTS
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Search for: "combobox", "ComboboxDropdown", "AssigneePicker", "reassign", "search dropdown"
Specifically read:
- src/components/leads/LeadInfoCard.tsx — the inline reassign combobox already built here is the reference implementation. Extract its pattern, do not duplicate it.
- src/components/tasks/AssigneePickerModal.tsx — another picker pattern

The goal is a reusable ui/ComboboxDropdown.tsx that LeadInfoCard and all future pickers use instead of inline implementations.

---

WHAT TO BUILD:
File: src/components/ui/ComboboxDropdown.tsx

Props interface:
  items: ComboboxItem[]         — { id: string; label: string; sublabel?: string; imageUrl?: string }
  value: string | null          — currently selected id
  onChange: (id: string) => void
  placeholder?: string          — shown in trigger when nothing selected
  searchPlaceholder?: string    — shown inside the search input
  disabled?: boolean
  className?: string

Behaviour:
  - Trigger: renders the selected item's Avatar + label at rest. No border. No box. Plain text with a ghost ChevronDown (var(--theme-text-tertiary), w-3.5 h-3.5) visible on hover only. This is an inline field affordance — it should look like content, not a form control, until hovered.
  - On click: opens a floating panel anchored below the trigger value (not the trigger container). z-index: var(--z-dropdown).
  - Panel: var(--theme-paper) bg, border 1px var(--theme-paper-border), var(--shadow-3), var(--radius-md), min-w-[220px], max-w-[280px], max-h-[320px] overflow-y-auto.
  - Search input inside panel: always focused on open. pl-8, Search icon left, h-8, var(--radius-sm), border 1px var(--theme-paper-border), bg var(--theme-paper-subtle). Caret var(--theme-accent).
  - Items list: each row = Avatar (size="xs") + label (var(--text-sm) var(--theme-text-primary)) + optional sublabel (var(--text-xs) var(--theme-text-secondary)). Selected item shows a Check icon (w-3.5 h-3.5 var(--theme-accent)) on the right. Hover bg: var(--theme-paper-subtle). Height: 36px per row. var(--radius-sm) on hover.
  - Empty state: "No results" in var(--text-sm) var(--theme-text-tertiary), centered, py-6.
  - Animation: panel enters with DROPDOWN_VARIANTS from motion.ts — translateY(-4px)→0, opacity 0→1. AnimatePresence wraps it.
  - Click outside: closes panel (useEffect + mousedown listener on document).
  - Keyboard: Escape closes. ArrowDown/Up navigates list. Enter selects focused item.

Tokens:
  var(--theme-paper), var(--theme-paper-subtle), var(--theme-paper-border)
  var(--theme-text-primary), var(--theme-text-secondary), var(--theme-text-tertiary)
  var(--theme-accent), var(--shadow-3), var(--radius-md), var(--radius-sm)
  var(--z-dropdown), var(--duration-fast), var(--ease-out-expo)

Pre-mortem — specific failure modes:
1. Floating panel clips off-screen bottom — detect viewport collision and flip to open upward when < 320px below trigger.
2. LeadInfoCard already has this pattern inline — after building ComboboxDropdown, update LeadInfoCard to use it. Do not leave two implementations. Search and replace.
3. Zero hardcoded hex anywhere. If you find yourself typing a colour value, stop — it is a token.

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ LeadInfoCard inline combobox removed and replaced with ComboboxDropdown
✓ Panel flips upward when less than 320px of viewport below trigger
✓ Keyboard navigation works: Escape, ArrowDown, ArrowUp, Enter
✗ Must not contain any hardcoded hex colour value
✗ Must not duplicate the Avatar component — import ui/Avatar

After sign-off:
1. Update src/components/CLAUDE.md — add ComboboxDropdown row with props contract
2. Add one line to docs/changelog.md: "ComboboxDropdown ui primitive shipped — LeadInfoCard inline combobox migrated. [date] Phase UI."
```

---

## Prompt 2 — `FilterDropdown` Enhancement

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §5.09 (Dropdown), §5.01 (Buttons)
4. src/styles/design-tokens.css
5. src/lib/constants/motion.ts — DROPDOWN_VARIANTS
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Read src/components/ui/FilterDropdown.tsx in full before touching it.
Document: current props, current visual spec, current animation.
Search for every file that imports FilterDropdown — those are the consumers.
Zero breaking changes to existing prop API.

---

WHAT TO ENHANCE:
File: src/components/ui/FilterDropdown.tsx (modify existing)

Current issues to fix:
1. Trigger height — verify it is exactly h-9 (var(--space-9)). If using h-8 or Tailwind h-9, make it token-exact.
2. Active state — when options are selected, the active count badge must use: bg var(--theme-accent), color var(--theme-accent-fg), var(--radius-full), px-1.5, min-w-[18px], h-[18px], text-[10px] font-medium. Not Tailwind colours.
3. Trigger border on open — when the panel is open, trigger border must be var(--theme-accent). Transition: border-color var(--duration-fast) var(--ease-in-out).
4. Checkbox items — selected checkbox uses: border var(--theme-accent), bg var(--theme-accent), Check icon var(--theme-accent-fg). Unselected: border var(--theme-paper-border), bg var(--theme-paper).
5. Panel shadow — must be var(--shadow-3), not var(--shadow-2).
6. Item hover — bg var(--theme-paper-subtle). Transition must be var(--transition-hover).
7. Separator — if present, must be 1px var(--theme-paper-border), my-1.
8. ChevronDown — must animate rotate(180deg) when open. transition: transform var(--duration-fast) var(--ease-in-out).

Add a "Clear" link inside the panel footer when any option is selected:
  - Only visible when selection.length > 0
  - Right-aligned, var(--text-xs) var(--theme-text-tertiary), hover var(--theme-accent)
  - Calls onClear or fires onChange([])

Pre-mortem:
1. Every consumer already passes specific props — read them before adding props. No default value changes.
2. The active count badge is small (18px) — font must be var(--text-2xs) not var(--text-xs) to avoid overflow.

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ All existing consumers render without visual regression
✓ ChevronDown rotates 180° on open
✓ Active count badge renders correctly with 2-digit numbers (e.g. "12")
✗ Must not change existing prop names or types
✗ Must not hardcode any colour value

After sign-off:
1. Update src/components/CLAUDE.md — FilterDropdown row
2. Add one line to docs/changelog.md
```

---

## Prompt 3 — `DatePicker` + Time Enhancement

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §7.5 (Date Picker spec, including time picker)
4. src/styles/design-tokens.css
5. src/lib/utils/dates.ts — toUTC(), formatDate()
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Read src/components/ui/DatePicker.tsx and src/components/ui/Calendar.tsx in full.
Search for every consumer of DatePicker. Document what props they pass.
Zero breaking changes to existing prop API.

---

WHAT TO ENHANCE:
File: src/components/ui/DatePicker.tsx (modify existing)

Add showTime?: boolean prop (default false).

When showTime is true, render a time picker section below the Calendar inside the same panel:
  - Two scroll-select columns: Hours (1–12) and Minutes (00, 15, 30, 45) with an AM/PM toggle
  - Design: hours + ":" separator + minutes, all in var(--text-sm), centred
  - The ":" separator: var(--theme-text-tertiary), var(--text-sm)
  - Selected value highlight: bg var(--theme-accent-surface), border-radius var(--radius-xs)
  - Scroll columns: max-h-[160px] overflow-y-auto, scrollbar hidden
  - AM/PM toggle: two pill buttons using the connected TabSelector variant — do NOT build a new toggle, import TabSelector with variant="connected"
  - Time section is separated from the calendar by a 1px var(--theme-paper-border) divider at top
  - When time is selected, trigger displays: "14 Jan 2026, 2:30 PM" format

The stored value is always ISO 8601 UTC — run through toUTC() from lib/utils/dates.ts before passing to onChange.

Value type when showTime=true: Date (not string) — let the caller decide storage format.

Pre-mortem:
1. Scroll columns on mobile — touch scroll must work. Do not rely on hover states inside columns.
2. AM/PM TabSelector — import from ui/TabSelector, do not reinvent. Pass a stable layoutId like "datepicker-ampm" to avoid collision with other TabSelector instances on the same page.
3. When showTime=false, existing behaviour is 100% unchanged — existing consumers must not be affected.

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ showTime=false renders identically to current implementation
✓ Time value is converted via toUTC() before surfacing in onChange
✓ AM/PM toggle uses existing TabSelector — no new toggle component
✗ Must not hardcode any colour value
✗ Must not change existing prop names or types

After sign-off:
1. Update src/components/CLAUDE.md
2. Add one line to docs/changelog.md
```

---

## Prompt 4 — `Calendar` Tasks Overview Mode

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §7.5 (Calendar spec)
4. src/styles/design-tokens.css
5. src/components/ui/Calendar.tsx — read in full before modifying
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Read src/components/ui/Calendar.tsx in full.
Search for all consumers of Calendar. Document what props they pass.
Zero breaking changes to existing prop API.

---

WHAT TO ENHANCE:
File: src/components/ui/Calendar.tsx (modify existing)

Add taskDots?: Record<string, { count: number; hasUrgent?: boolean }> prop.

When taskDots is provided:
- Each day cell that has a matching ISO date key (YYYY-MM-DD) renders a small dot below the day number
- Dot: 4px × 4px, border-radius var(--radius-full)
- No dot / 1–2 tasks: var(--theme-accent), opacity 0.7
- 3+ tasks: var(--theme-accent), opacity 1.0
- hasUrgent=true: var(--color-danger) dot instead of accent
- Dot sits 3px below the day number, centred horizontally
- Dot entrance: scale 0→1, 150ms, var(--ease-spring) — Framer Motion
- The dot must not change the day cell's height — use absolute positioning within the cell

Day cell height when taskDots is provided: increase to 44px (from 36px) to accommodate dot without clipping.

Visual: The calendar is compact. The dot is barely there — a whisper, not a badge. It communicates presence, not detail.

Pre-mortem:
1. The dot must use absolute positioning — never push other day cells out of alignment.
2. "Today" cell has a border accent ring — the dot must be visible on top of it. Use z-index: 1 on the dot span.
3. When taskDots is undefined (default), every day cell renders exactly as it does today — no height change, no dot placeholder space.

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ taskDots=undefined renders the calendar identically to current
✓ Urgent dots are var(--color-danger), non-urgent are var(--theme-accent)
✓ Dot does not shift day cell alignment
✗ Must not break existing DatePicker usage (Calendar is used inside DatePicker)
✗ Must not hardcode any colour value

After sign-off:
1. Update src/components/CLAUDE.md
2. Add one line to docs/changelog.md
```

---

## Prompt 5 — `SearchBar` Placeholder Copy + Focus Polish

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §5.10 (Search Bar spec)
4. src/styles/design-tokens.css
5. src/components/ui/SearchBar.tsx — read in full
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Search every file that uses SearchBar. List every placeholder prop value currently passed.
This is a display-only change — zero structural changes.

---

WHAT TO CHANGE:
File: src/components/ui/SearchBar.tsx (minor modification)

1. Default placeholder: change from whatever it currently is to "Search" — nothing more. Short. Clean. Exact.
   Callers that already pass a custom placeholder prop are unaffected — they override the default.

2. Caret colour: ensure the input has caretColor set to var(--theme-accent). If this is already present, confirm and skip. If missing, add it.

3. Focus ring: on focus, border-color must be var(--theme-accent) AND box-shadow must be var(--shadow-focus). Verify both are present. Add if missing.

4. Placeholder colour: must be var(--theme-text-tertiary). Verify via inline style or CSS — Tailwind's placeholder: prefix is unreliable with CSS variables. If it relies on Tailwind, convert to a style prop.

5. Clear button: visible only when value.length > 0. The X icon must be var(--theme-text-tertiary) at rest, var(--theme-text-primary) on hover. transition: var(--transition-hover). Verify this behaviour exists. Fix if not.

Pre-mortem:
1. Placeholder text appears in agent view for 8+ hours a day. "Search" is the correct word. Never "Search leads..." or "Type to search..." — overlong placeholders feel like instructions, not invitations.
2. This is a cosmetic-only change. If you find yourself touching anything other than placeholder, caretColor, focus ring, placeholder colour, or the clear button — stop. You are out of scope.

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ Default placeholder is exactly "Search"
✓ caretColor is var(--theme-accent)
✓ Focus state shows var(--shadow-focus) + var(--theme-accent) border
✗ Must not change SearchBar's props interface
✗ Must not touch any consumer file

After sign-off:
1. Update src/components/CLAUDE.md if the placeholder default changed
2. Add one line to docs/changelog.md
```

---

## Prompt 6 — `Button` Full Spec Audit

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §5.01 (Button spec — all five variants, all states)
4. src/styles/design-tokens.css
5. src/components/ui/Button.tsx — read in full
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Search all Button consumers. List the variant + size combos actively used.
Do not change any prop API. This is an internal visual correctness audit.

---

WHAT TO AUDIT AND FIX:
File: src/components/ui/Button.tsx

Check every variant against design-dna.md §5.01 exactly:

primary:   bg var(--theme-accent), color var(--theme-accent-fg), hover bg var(--theme-accent-hover)
           whileTap scale 0.97, transition 80ms var(--ease-spring)

secondary: bg var(--theme-paper), border 1px var(--theme-paper-border), color var(--theme-text-primary)
           hover: border var(--theme-accent-muted), bg var(--theme-paper-subtle)

ghost:     bg transparent, no border, color var(--theme-text-secondary)
           hover: bg var(--theme-paper-subtle), color var(--theme-text-primary)

danger:    bg var(--color-danger-light), color var(--color-danger), border 1px var(--color-danger-light)
           hover: bg var(--color-danger), color white

success:   bg var(--color-success-light), color var(--color-success)
           hover: bg var(--color-success), color white

All sizes: xs h-7 px-2.5 text-xs | sm h-8 px-3 text-sm | md h-9 px-4 text-sm | lg h-10 px-5 text-base
All border-radius: var(--radius-sm) — never --radius-md on buttons (rule §5.01)
Loading state: Spinner replaces iconLeft slot, button stays same width (no layout shift)
Disabled: opacity-50 cursor-not-allowed pointer-events-none — all three

For each item above: if it matches the spec already, add a comment // ✓ spec. If it does not match, fix it.

Pre-mortem:
1. The `danger` and `success` variants use semantic colour tokens (--color-danger, --color-success, --color-danger-light, --color-success-light). Verify these tokens exist in design-tokens.css before using them. If they don't, report the gap — do not invent tokens.
2. whileTap is a Framer Motion prop — Button must be a motion.button not a plain button for tap to work. Verify. If it is not a motion component, convert it. If MotionButton.tsx exists as a separate file, check if they should be merged — report, do not merge without explicit instruction.

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ All five variants match design-dna.md §5.01 exactly
✓ All buttons use var(--radius-sm)
✓ whileTap: { scale: 0.97 } on every variant
✗ Must not change prop interface
✗ Must not hardcode any colour value
✗ Must not break any existing consumer

After sign-off:
1. Update src/components/CLAUDE.md — Button row with confirmed spec compliance note
2. Add one line to docs/changelog.md
```

---

## Prompt 7 — `TabSelector` Colour Audit

```
Before writing any code, read in this order:
1. /CLAUDE.md
2. src/components/CLAUDE.md
3. docs/design-dna.md §5.05 (Tabs spec)
4. src/styles/design-tokens.css — specifically --theme-canvas, --theme-canvas-text, --theme-sidebar-border
5. src/components/ui/TabSelector.tsx — read in full. Recent changes: pill uses --theme-canvas bg + --theme-canvas-text active label.
Do not write a single line of code until these are read.

---

CODEBASE SCAN REQUIRED FIRST (Q-12):
Search all TabSelector consumers. List every variant + activeTab combo in use.
This is a visual correctness audit only — zero structural changes.

---

WHAT TO AUDIT:
File: src/components/ui/TabSelector.tsx

pill variant:
  Container (tray): bg var(--theme-paper-subtle), border 1px var(--theme-paper-border), var(--radius-md), p-1
  Active pill (motion.span): bg var(--theme-canvas), border 1px var(--theme-sidebar-border), var(--shadow-2)
  Active label (inner span with z-index:1): color var(--theme-canvas-text)
  Inactive label: color var(--theme-text-secondary)
  Transition: color var(--duration-fast) var(--ease-in-out) on label only — NOT on the pill span itself

border-bottom variant:
  Container: no bg, no border, border-bottom 1px var(--theme-paper-border)
  Active indicator (motion.span): bg var(--theme-accent), h-[2px], bottom-0, var(--radius-full)
  Active label: color var(--theme-text-primary), var(--weight-medium)
  Inactive label: color var(--theme-text-secondary)

connected variant:
  Container: border 1px var(--theme-paper-border), var(--radius-md), bg var(--theme-paper-subtle), p-[2px]
  Active tab (motion.span): bg var(--theme-paper), var(--shadow-1)
  Active label: color var(--theme-text-primary)
  Inactive label: color var(--theme-text-secondary)

For each variant above: if it already matches — add a comment // ✓. If not — fix.
The spring indicator (SPRING_CONFIG from motion.ts) must be used for all three variants. No hardcoded stiffness/damping.
The count badge (when present): bg var(--theme-accent-surface), color var(--theme-accent), var(--radius-full), px-1.5, min-h-[18px], text-[10px].

Pre-mortem:
1. The pill variant's label colour transition must be on the inner content <span> with z-index:1, not on the button root. A colour applied to the button root would colour the absolute pill span background through CSS inheritance — verify this separation is intact.
2. All five themes must render correctly — no hardcoded colour that would look wrong in Cosmos (violet) or Fire (orange).

---

SIGN-OFF CONDITIONS:
✓ pnpm tsc --noEmit passes with zero errors
✓ All three variants use SPRING_CONFIG from motion.ts
✓ pill variant active label is --theme-canvas-text on inner z-index:1 span
✓ No hardcoded hex anywhere in the file
✗ Must not change existing prop interface
✗ Must not break any consumer

After sign-off:
1. Update src/components/CLAUDE.md — TabSelector confirmed spec-compliant note
2. Add one line to docs/changelog.md
```

---

**Order to run these:** 5 → 6 → 7 (quick audits first, no new components) → 2 → 3 → 4 → 1 (ComboboxDropdown last, as it requires reading LeadInfoCard which may be touched by earlier prompts).
