# Serene control system

The control system keeps the pastel material, theme-derived sidebar, ivory workspace,
and gentle clay depth. Consistency comes from reusable roles and interaction states,
not making every clickable object look like a raised button.

## Component contract

| Role | Implementation | Treatment |
| --- | --- | --- |
| Primary action | `Button variant="primary"` | Accent fill, dark theme ink, restrained lift |
| Secondary action | `Button variant="secondary"` | Neutral raised material |
| Toolbar / view / sort action | `Button variant="control"` | Same material and states as filter triggers |
| Applied toggle | Control with `active` and `aria-pressed` | Pastel wash, readable accent ink |
| Popup trigger | Control with `aria-expanded` | Open-state ring, retained keyboard focus |
| Quiet / cancel / inline action | `Button variant="ghost"` | No resting elevation |
| Destructive / positive action | `danger` / `success` | Semantic pastel, readable ink even on hover |
| Caution / quiet destructive action | `warning` / `ghost-danger` | Shared semantic ink and interaction states |
| Icon action | Button with `iconOnly` and `aria-label` | Square footprint using the selected size |
| Filters | `FilterDropdown`, `FilterBar`, `DashboardDateFilter` | `filterTriggerStyle` plus shared CSS |
| Compact fields | `SearchBar`, `DatePicker`, `TimePicker` | Inset material, matching control radius |
| Navigation tabs | `TabSelector` | Track and selection indicator; distinct from actions |
| Binary state | `Toggle` / `CheckTile` | Switch or completion affordance |
| Data tile | `StatTile` / `StatAtom` / `clayTileStyle` | Pastel tile material, separate from badges |
| Popup / modal | `FloatingPanel` / `Dialog` / `Modal` | Existing shared elevation and surface roles |

Default actions and compact fields are 36px high; compact actions may be 32px and
large actions 44px. Ordinary controls share `--neu-radius-control` (14px). Buttons,
filter triggers, and compact fields have a 44px minimum on coarse pointers.

Hover uses a stronger contact shadow, press uses inset shading, and keyboard focus
uses an unblurred outline independent of elevation. Disabled conditions remain
native. Loading actions retain the shared pending treatment and expose `aria-busy`.

## Usage

```tsx
<Button
  type="button"
  variant="control"
  active={sortOrder === 'asc'}
  aria-pressed={sortOrder === 'asc'}
  onClick={toggleSortOrder}
>
  Newest first
</Button>

<Button
  type="button"
  variant="ghost"
  size="sm"
  iconOnly
  aria-label="Close dialog"
  onClick={onClose}
  iconLeft={X}
/>
```

Use explicit button `type` when authoring controls. Supply a meaningful accessible
label whenever visible text is hidden. Restrict instance `style` overrides to layout
(width, placement, margins); visual changes belong in the shared recipe or tokens.
Do not copy a button's border, radius, shadow, font, and hover handlers into a page.
Do not remove native disabled conditions or replace keyboard focus with a glow.

## Source audit — 2026-09-22

The read-only inventory covered 506 TSX files under `src`, including desktop and
mobile components. Before this pass: 254 native button declarations, 206 with inline
chrome, and 175 shared Button/MotionButton usages. After: 196 native declarations,
161 with inline chrome, and 233 shared usages. This measures source reuse, not a
visual or accessibility certification.

58 ordinary actions were migrated across Leads (sort, columns, export, bulk actions,
record editing), Dashboard, Performance, Tasks, Subscriptions, Notes, admin screens,
notifications, Sia, WhatsApp, and vendor controls. Shared pagination, modal close,
and table expansion actions now use Button as well. Existing click/change/submit
handlers and disabled expressions were compared against the prior source and retained.

The audit also aligned compact field corners, subscription field material, control
hover/press styling, visible keyboard focus, and semantic action hover ink. It leaves
calendar day cells, menu options, rich selectable rows, drag handles, and specialized
mobile controls as distinct interaction types. Remaining native controls are review
candidates, not automatically defects; no claim is made that every one has passed an
interaction or visual audit.

## Review and maintenance

- `npm run audit:ui`: repeat the source inventory; `-- --json` emits per-file detail.
- `npm run check:tokens`: reject undefined token references.
- `node --import tsx --test scripts/control-contract.test.mjs`: verify native
  form/popup semantics, applied state, disabled behavior, loading announcements,
  and icon-only accessible names using the real rendered Button.
- `node --import tsx scripts/preview-ui-controls.mjs`: regenerate
  `output/serene-control-system.html` using the actual Button component and compiled
  app CSS. The specimen supports all eight themes, both appearances, hover, press,
  disabled controls, and keyboard focus. Its sample actions are intentionally inert.
- Inspect authenticated list pages, dense task editors, and mobile layouts at real
  breakpoints before calling the entire application visually verified. This pass
  does not constitute a screenshot review of those screens or an accessibility audit.

The full root TypeScript configuration also includes the separate untracked
`indulge-app-example` project. Serene validation excludes that directory in memory;
the project's configuration and the example app remain untouched.

## Follow-up — 2026-09-23

Another 73 ordinary actions now use Button, including calendar navigation, format
choices, task controls, password visibility, attachment actions, dialog actions,
and filter clearing. Current inventory: 506 TSX files, 306 shared Button usages,
123 native buttons, and 76 native buttons with inline appearance properties.
The latter count includes intentional mobile primitives, chart hit areas, upload
zones, calendar cells, and specialized widgets; it is not a list of 76 defects.

Selection families now share `choiceStyle(selected, optionalTone)` and
`optionStyle(selected)` from `material-styles.ts`. Choices have restrained raised
material; options have a flat selected wash inside their raised menu. These recipes
cover 21 declarations across date presets, year/month selection, task types and
assignees, deal durations, persona/category/tag choices, and vendor preferences.
Preserve each widget's native semantics and selection behavior when adopting them.
Custom semantic tones must supply both a fill and its contrasting ink.

Use `--neu-accent-deep` for theme-colored text on neutral or lightly tinted surfaces.
Use `--color-*-text` for semantic labels. `--theme-accent` is primarily a fill,
indicator, or chart color; it is not automatically readable as small text.
Pastel badge fills are retained, with deeper matching label colors. Primary action
ink is calibrated per theme, including the blue and rose palettes.

Shared tabs now support ArrowLeft/Right, Home/End, disabled skipping, roving focus,
and named panels. FilterDropdown supports arrow navigation, Home/End, initial
option focus, Escape, and trigger focus restoration, including portaled menus.
Clickable Table rows support Enter/Space without intercepting nested controls.
These behaviors were tested in Chromium using the real components, in addition
to the six server-rendered Button contract tests. Across 94 source snapshots,
click/change/submit handlers and disabled expressions were retained.

### Theme and keyboard checks

1. Build the local specimens:
   `node --import tsx scripts/preview-ui-controls.mjs` and
   `node scripts/preview-keyboard-controls.mjs`.
2. Start a separate Chromium/Brave session with a temporary user-data directory
   and `--remote-debugging-port=9223`. Keep this debugging endpoint local. The
   check scripts navigate its first page; never target a personal browser session.
3. Run `node scripts/check-theme-contrast.mjs` and
   `node scripts/check-control-keyboard.mjs` sequentially.

The theme check measures 624 browser-computed foreground/background pairs across
all eight themes and both appearances. All pass the configured thresholds:
4.5:1 for text, 3:1 for focus indicators. Lowest measured text ratio: 4.549:1;
lowest focus ratio: 4.644:1. Coverage includes primary/secondary/tertiary text on
five surfaces, seven badge pairs, sidebar pigment/wash endpoints, semantic deep
inks, header/accent labels, and primary gradient endpoints. Raw results are in
`output/theme-contrast-audit.json`.

This is a token-pair and shared-component check, not full application accessibility
certification. It does not establish contrast for every custom composited surface,
chart, image, or opacity override. Screen-reader review, modal focus containment,
and specialized picker semantics remain separate review areas. Authenticated pages
were not visually reviewed. Responsive testing is left to the user as requested.

## Selection families — 2026-09-24

`SelectionButton` now owns the shared appearance and interaction states for 30
choice, option, and row declarations. Consumers retain their handlers, content,
layout, selection semantics, and keyboard navigation. Its three appearances are:

| Appearance | Use | Material |
| --- | --- | --- |
| `choice` | Compact selectable values, month/year and AM/PM choices | Raised neutral material; selected pastel wash |
| `option` | Menu items and options within a panel | Flat resting surface; selected wash |
| `row` | Rich selectable records such as vendor matches | Quiet edge and shared control corners |

Use `selected` for visual state and supply the appropriate `aria-pressed`,
`aria-selected`, or `aria-checked` explicitly. The component does not invent an
ARIA role. It forwards refs, defaults to `type="button"`, preserves disabled
behavior, and centralizes hover/press treatment. Hover is restricted to fine
pointers; keyboard focus uses the existing unblurred global outline.

Task edit/delete/close actions and status/priority triggers now use Button, as does
the vendor-category trigger. Status triggers retain their semantic fill/ink pair;
priority retains its colored indicator with readable neutral label text.

Current inventory: 507 TSX files, 310 Button/MotionButton usages, 30 SelectionButton
usages, 90 native button declarations, and 65 native declarations with local
appearance properties (down from 76). The inventory now reports shared selection
controls separately. Native primitive implementations are included in the count.

Validation: eight component contract tests, real-component keyboard checks, and
720 computed contrast pairs across eight themes and both appearances. Contrast
measurement disables transitions while sampling settled colors; it now includes
rendered choice/option/row controls in both selected and unselected states.
Click/change/submit handlers and disabled expressions were compared across the
26 affected source snapshots with no differences. Responsive testing remains
user-owned; the earlier accessibility and authenticated-screen scope limits apply.

## Upload and mobile action families — 2026-09-24

`UploadButton` centralizes the dashed inset file-chooser surface used by creative,
training-asset, and ad-spend uploads. Callers retain the file input, accept rules,
validation, progress content, and upload handler. `busy` disables repeat activation
and exposes `aria-busy`; it does not start or manage an upload.

Voice-note playback, video loading, and document downloads use Button. The image
zoom target retains its content-shaped hit area. No media loading or playback
logic changed.

MobileButton, IconKnob, and Fab now use shared resting-material CSS so hover and
pressed shadows can override it. The FAB's hardcoded bright shadow was replaced
with the calibrated raised token. Sticky footer actions compose MobileButton;
stepper actions compose IconKnob. Their dimensions, callbacks, native form types,
and labels are retained. Disabled quiet controls no longer animate on press.

Current inventory: 508 TSX files, 313 shared action usages, 30 selection usages,
three upload usages, 80 native button declarations, and 52 native declarations
with local appearance properties (previously 65). Counts exclude mobile component
usages from the shared-action total; native component implementations remain in
the native count.

Validation passed: Serene-only TypeScript, lint, token references, ten component
contract tests, and 784 measured theme/material pairs. This expands the previous
contrast scope to upload and neutral mobile button materials. Primary mobile
controls use the already-measured accent gradient/ink tokens. Six feature/component
snapshots retain identical click/change/submit and disabled expressions. File
uploads and media playback were not exercised against live services. Responsive
testing remains with the user.

## Remaining controls and keyboard behavior — 2026-09-24

Ordinary actions and selectable records now use the shared families across lead
status actions, subscriptions, performance, tasks, profile choices, notifications,
Sia, WhatsApp, and mobile overlays. `MotionSelectionButton` wraps SelectionButton
for animated rows; animation no longer requires duplicating their material.
Instance overrides should describe layout, with appearance owned by the family.

The latest inventory covers 509 TSX files: 345 Button/MotionButton usages, 53
SelectionButton/MotionSelectionButton usages, three UploadButton usages, and 45
native button declarations. Of those native declarations, 23 retain inline
appearance properties (down from 52 in the preceding pass). Four direct motion
buttons remain, two with inline appearance; these are counted separately.

The retained implementations include shared primitives, calendar cells, time
wheels, switch geometry, swatches, recording controls, navigation icon slots,
and drag handles. Their different anatomy is intentional. Each retained file has
a reason in `scripts/ui-control-baseline.json`. Run `npm run audit:ui -- --check`
to reject increases in unreviewed local appearance counts. This guard detects
count changes, not every possible visual regression or style edit.

`useModalFocus` gives the topmost dialog initial focus, Tab containment, Escape
dismissal, and focus return. Owned portaled pickers remain inside the modal's
logical focus scope. Pending confirmation dialogs retain focus and block Escape.
Shared popover keyboard behavior covers inline options, column and assignee
pickers, date/time fields, and anchored menus. Calendar navigation supports arrows,
Home/End, and PageUp/PageDown across months; time wheels support arrows and
Home/End. Radio choices, mobile segments, and activity tabs have keyboard selection.
Column dragging has a keyboard sensor; dashboard handles and voice seeking have
keyboard actions. Domain dots and priority/color choices expose their selected state.

Validation passed: Serene-only TypeScript, changed-source lint, token references,
ten component contract tests, the appearance baseline, and 816 browser-computed
theme/material pairs across eight themes and both appearances. Real-component
browser checks cover tabs, filters, table actions, radio selection, calendar month
transitions, portaled date/time pickers, nested modal focus, and pending confirmation
behavior. Build the specimens and run the browser scripts sequentially as above.

These results do not certify every authenticated screen or composited background.
Authenticated visual review, real screen-reader behavior, live uploads/media, and
the dashboard/column drag interactions still need end-to-end verification.
Responsive testing remains with the user; no viewport testing was performed.

## Component families, surfaces, and workflows — 2026-09-25

This phase extends the action system to form and feedback families:

| Family | Shared implementation | Contract |
| --- | --- | --- |
| Text, multiline, native selection | `Field`, `Input`, `Textarea`, `Select` | Connected label/hint/error IDs; forwarded native props, refs, and handlers; inset material; explicit focus and invalid states |
| Status | `Badge` | One semantic fill/ink mapping; domain status names remain in feature constants |
| Persistent feedback | `Alert` | Failures use `role="alert"`; informational/success feedback uses `role="status"`; optional recovery action |
| Loading | `LoadingState` | A named status instead of an unexplained blank area |
| Tables | `Table` | Preserve existing rows during refresh; announce busy state; nested actions do not also activate the row |
| Tooltips | `Tooltip` | Trigger description preserves existing hints; Escape dismisses; hoverable content; instant keyboard entrance |

Initial field adoption covers manual lead creation, personal lead details, account
creation/profile editing, domain/role/queendom selection, and subscription editing.
Ticket, Freshdesk, and Zoho status wrappers compose Badge. These migrations preserve
feature validation, action payloads, status mappings, and permission decisions.
Other legacy field instances remain candidates for migration; introducing the
family does not mean every input in the application has been converted.

### Surface roles

`--neu-section-bg` separates headers from porcelain content without giving them
field-like depth. Shared card headers mix only 6% theme pigment into this neutral
surface. Dialog headers use the neutral section surface. Fields retain shallow
inset shading; actions retain contact elevation; badges and alerts remain flat.
The sidebar's existing theme-derived gradient is retained.

Table hover and selected states have explicit tokens. Dark-mode pigment is reduced
because the previous tint failed contrast for tertiary text. A selection edge
supports recognition without requiring stronger fill. CSS remains in
`src/styles/serene-families.css`; consumers should customize layout, not duplicate
these materials.

### Workflow rules and adoption

- `Dialog`/`Modal pending` blocks close-button, backdrop, and Escape dismissal.
  Applied to lead creation/call logging/won deals, personal task creation, and
  subscription editing. Confirmation actions expose their pending state.
- `FilterDropdown disabled` is a native interaction constraint, not pointer-only
  styling. `clearable={false}` omits Clear when a value is required; accessible
  labels and error descriptions are supported separately from the selected label.
- Lead assignee loading is separate from saving. A failed lookup offers Retry;
  changes are not submitted while that lookup is unresolved. Field blur handlers
  remain owned by the form library.
- Lead and subscription save failures retain entered values and show persistent
  feedback. A transport failure does not claim that the server failed to commit;
  it asks the user to check the list before retrying.
- Subscription editing uses a native form so Enter and the footer submit action
  follow the same validation and save path. No automatic mutation retries were added.

Validation includes targeted TypeScript checks for the 24 changed component files
and their dependency types, changed-source lint, 13 component contract tests,
real-component browser interaction checks, and 1,536 computed contrast pairs across eight themes and both modes.
Contrast coverage now includes field gradient endpoints, semantic feedback, section
surfaces, and table states. Use `SERENE_BROWSER_PORT` to choose an isolated local
browser port; the default remains 9223. The specimen includes the actual new families. `npm run check:ui` runs token,
control-baseline, and component contract checks together.

The full-codebase TypeScript run was stopped after prolonged local resource
contention; the targeted check passed. Authenticated workflow testing, screen-reader
review, and live mutation recovery remain unverified by these fixtures. Responsive testing remains user-owned. Further
field migration should follow this contract, with feature-level checks for each
form's validation and payloads; do not infer whole-app completion from these counts.

## Legacy form rollout — 2026-09-25

The next migration covers RecordPaymentModal, LogTopupModal, AddRechargeModal,
WonDealModal, NewDealModal, SubscriptionExportButton, and RevivalPoliciesPanel.
Their text, amount, date, month, multiline, and native selection fields now compose
the shared field family. The unused subscription input/error style exports were
removed; numeric policy fields retain their compact layout and existing blur-save
behaviour, with explicit accessible names.

Payment, top-up, recharge, and export actions now share the native form submit path
with Enter. Payment/top-up dialogs protect both upload and save operations from
close-button, backdrop, and Escape dismissal. Reopening a recording form starts a
fresh session; a rejected save preserves its draft. Persistent errors distinguish
an explicit rejection from an uncertain transport outcome. No automatic retries or
real payment operations were added.

Both deal forms reject malformed decimal strings instead of accepting a numeric
prefix with `parseFloat`. The walk-in contact step has connected labels and submits
with Enter. Its save only completes when the action returns a deal ID. Subscription
exports preserve the chosen month after failure, and an empty month is informational.

`node scripts/preview-form-workflows.mjs` builds isolated fixtures from the real
feature components. `SERENE_BROWSER_PORT=9224 node scripts/check-form-workflows.mjs`
runs them in a separate local Chromium session. Actions, invoice uploads, router
refreshes, and downloads are mocked: these checks never create records or files
through external services. The six scenarios cover payments, top-ups, recharges,
retail won deals, agent-role retail walk-in deals, and subscription exports. They
check applicable payload values, Enter submission, retained failed drafts, pending
protection, upload blocking, reopening, malformed amounts, and export feedback.
Other roles/domains and real services still require integration verification.

Validation: changed-source lint, full Serene-only TypeScript (including the new
fixtures, excluding the separate example app), the token/control baseline, all 13
shared component contracts, and all six mocked feature scenarios passed. This
resolves the full-codebase TypeScript check left pending in the preceding phase. No responsive tests were performed.
