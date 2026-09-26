# Serene on a phone: the mobile audit, 2026-09-26

**Date:** 2026-09-26 · **Audience:** the founder and the engineers who will fix these · **Scope:** every
screen at phone width (360 to 430px, touch), both the desktop app viewed on a phone and the `/m` mobile
app. The two screens the founder named first: the Elaya page and the agent profile on Performance.

> **Method.** Code reading only, no running app and no login (the founder's instruction). Four parallel
> reviewers each read one area: (1) the shell and chrome, (2) lists and dossier pages, (3) chat surfaces,
> the dashboard, tasks and the `/m` app, (4) forms, modals, pickers and panels. Every top finding was
> read a second time in the code before it went into this document. The Elaya page numbers come from a
> static render of the real component measured through Chrome's devtools protocol. Nothing was changed.
>
> **Baseline facts** that shape most findings: at 360px the paper holds 328px of content (16px gutters,
> `globals.css:137-149`); a primary page title also loses 52px to the floating drawer trigger
> (`globals.css:318`), leaving about 276px for the title row; `--text-sm` is 14px
> (`design-tokens.css:668`); the viewport meta sets only `viewportFit` (`layout.tsx:96`); the coarse
> pointer rule lifts `.serene-field-control`, `.serene-action`, `.serene-filter-trigger` and
> `.serene-compact-field` to 44px but not `SelectionButton`, plain buttons or plain inputs.

---

## 1. The short answer

The shell is right: one scroller, safe areas, a bottom-sheet Dialog, rails that become one pane at a
time, a finger-following swipe. What is wrong is per screen, and it splits into three kinds:

1. **Layouts that were only ever sized for a desktop.** A sidebar that collapses to a 48px strip on the
   Elaya page, a 5-column subtask row and a 3-up select row inside a 328px sheet, title rows that clip
   their own button, media wider than its bubble, tables with no card fallback.
2. **Two or three renderings of one thing.** The agent profile has three tile styles and two avatar
   sizes across the panel, the deck and the agent's own view, and the phone shows a different one
   depending on the domain filter. Composers, bubbles and calendars each have two or three specs.
3. **Touch never considered.** Fields under 16px make iOS zoom on every tap, hover-only pauses and
   affordances, drag-only boards and reorder handles, 20 to 32px targets, `autoFocus` that throws the
   keyboard over the sheet, and demo data still reachable in the `/m` app.

Most of it is systemic. Section 7 lists nine shared changes that clear well over half of the findings.

### Health score (same rubric as the 2026-09-25 audit, 0 to 4 per dimension, phone only)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Touch and input | 1 | iOS zooms on every field; the ticket board and both reorder lists are drag-only; dozens of 20 to 32px targets |
| 2 | Layout at 360px | 2 | Elaya sidebar collapses to 48px; title rows clip the CTA on four pages; nine form rows never stack |
| 3 | Consistency | 2 | Three agent-profile renderings; three composers; two bubble specs; two calendar specs; two rail-and-pane histories |
| 4 | Navigation and focus | 2 | Back leaves Sia and WhatsApp instead of closing the chat; teach-elaya's back button is under the drawer trigger; the board and error log have no way out |
| 5 | Content and state | 3 | Form errors land below the fold; suggestion cards below the ticket form; demo persona shown to real staff on `/m/profile` |
| | **Total** | **10 / 20** | **Needs work, most of it systemic** |

---

## 2. The two screens the founder named

### 2.1 Elaya: "the suggestion is stuck on top and the next section is hidden"

**What happens.** Below 1024px the page's two-column grid becomes one column
(`globals.css:437-441`). The chat card is the first row, the sidebar column the second. Both are
inside a flex-fill page that has exactly the paper's height, so the grid cannot grow. The chat keeps
its `minHeight: 420px` (`ElayaChatShell.tsx:227`); the sidebar column gets what is left.

Measured on a 390px render: grid rows 535px and 115px. The sidebar column holds two cards: the
feedback card ("Share your thoughts") first, then the "Ask her" identity card with the starter
prompts (`ElayaChatShell.tsx:407-411`). The feedback card takes the 115px. The identity card is
`minHeight: 0; overflowY: auto` (`ElayaIdentityCard.tsx:48-51`), so it becomes a 48px strip with
762px of content scrolling inside it. That is the founder's "constant on top, next section hidden":
the feedback card is the fixed thing, the starters and capabilities are the hidden thing.

**Fix (desktop unchanged).** Below `lg`, do not render the sidebar column. Put the starter prompts as
a chip row above the composer (the mobile `ElayaChatScreen` already does this at
`ElayaChatScreen.tsx:291`) and move "Send feedback" into the presence header as an icon action (the
dashboard `ElayaPresenceCard` already places it there). The chat then fills the screen. P1.

### 2.2 Performance: "the agent profile is not one thing"

There are three renderings of the same agent, and the phone shows a different one depending on the
filter:

| Rendering | Where | Avatar | Stat tiles | Content |
|---|---|---|---|---|
| `AgentDetailPanel` | manager and founder single-domain view (`AgentDetailPanel.tsx:250-357`) | `lg` with a live pip | four `StatAtom` cards in four colour palettes | pipeline, call outcomes, first-touch scorecard, trend, recent activity |
| `FounderDrillDownDeck` | founder all-domains view on a phone (auto-opened, `ManagerPerformancePanel.tsx:389-400`) | `xl`, no pip | four `DeckTile` rows in a 2×2 grid, "Recent calls: View" as a fake value | one toggleable breakdown, pipeline, scorecard; no trend, no recent activity |
| `AgentPerformanceShell` | the agent's own page (`AgentPerformanceShell.tsx:98-115`) | none | `StatTile` cells in a divided strip | its own set |

`isMobileDeck = isMobile && allDomains` (`ManagerPerformancePanel.tsx:389`): a founder on a phone with
"All domains" gets the deck, the same founder after narrowing to one domain gets the panel. Same
person, same agent, two different screens.

**Fix.** One `AgentHeader` (avatar `lg`, name, domain, pip) and one stat strip (`StatTile` cells, the
shared primitive) composed by all three. The deck's slide becomes the panel's body inside the
carousel, so a phone shows the same content in either filter state. P1.

---

## 3. P1: fix first

| # | Where | What happens on a phone | Fix |
|---|---|---|---|
| 1 | Every text field: `.serene-field-control` 14px (`serene-families.css:21`), `.serene-input` (`globals.css:580`), `.serene-input-auth` (`globals.css:975`), `MessageBar.tsx:128`, `SearchBar.tsx:35,41`, `ElayaChatScreen.tsx:335` 12.5px, every hand-rolled textarea | iOS Safari zooms the page on every focus, starting on the login screen, and the 100dvh shell stays zoomed after blur | One `@media (pointer: coarse)` rule: `font-size: max(1rem, …)` on every field class and on bare `input, textarea` |
| 2 | `layout.tsx:91-106` viewport | Android Chrome lays the keyboard over the fixed shell; the chat header and pills go off screen while typing | `interactiveWidget: 'resizes-content'` |
| 3 | Elaya page (section 2.1) | Starters and capabilities in a 48px strip | Chat-only below lg, starters as chips, feedback in the header |
| 4 | Agent profile (section 2.2) | Three renderings, two of them on the phone | One header + one strip composed by all three |
| 5 | `TicketBoard.tsx:56,86` | Every card is `touchAction: none` with a pointer-only sensor; the finger can neither scroll the rail nor the page, and there is no button to move a status. `/tickets/board` also has no drawer trigger and no back button (`Sidebar.tsx:119-135`, `board/page.tsx:36-45`) | `TouchSensor` with a press delay + `touchAction: 'pan-x pan-y'`; a per-card status action; a back button on the page |
| 6 | Title rows with two actions + the bell: `tickets/page.tsx:63-70` (Board + New ticket), `vendors/page.tsx:74-96`, `budget/page.tsx:61-69` (`CondensingPageHeader.tsx:95` `flexShrink: 0`), `leads/page.tsx` (Add Lead + domain + bell) | Two `nowrap` links + bell + the 52px title indent > 328px; the paper's `overflow-x: hidden` (`globals.css:133`) clips the primary CTA and the bell | Hide the secondary link's label below md (icon only, as `LeadsTable.tsx:282` does) or let the row wrap (`subscriptions/page.tsx:137` does) |
| 7 | `tickets/[id]/page.tsx:40-55` + `loading.tsx:44` | The `--aside-left` grid renders the aside first; below lg it is one column with no order rule, so Sentinel, Vendor, Tags and the help window come before the Brief and Timeline | `@media (max-width: 1023.98px) { .serene-dossier-grid--aside-left > :first-child { order: 2 } }` |
| 8 | `AddLeadModal.tsx:382-389` (Source · Domain · Assign-to, three `minmax(0,1fr)`), `:326-333` name row | ~99px per select; assignee names truncate to three letters | `repeat(auto-fit, minmax(160px, 1fr))` |
| 9 | Two-column rows that never stack: `NewDealModal.tsx:502`, `AddVendorModal.tsx:225`, `RoleDomainFields.tsx:81`, `TrainingAssetFormModal.tsx:462`, `AddSuggestionModal.tsx:326-333`, `SubscriptionHistoryModal.tsx:295`; flex pairs in `AddEditSubscriptionModal.tsx:239,277,337`, `RecordPaymentModal.tsx:131,178`, `LogTopupModal.tsx:133,173`, `AddRechargeModal.tsx:145`, `PersonalDetailsCard.tsx:163`, `ElayaRequestsPanel.tsx:56` | Two ~130px controls; date labels and select labels truncate | Same auto-fit grid (`CreateGroupTaskModal.tsx:677,725` already does it right) |
| 10 | `CreateGroupTaskModal.tsx:320,833` subtask row `1fr auto auto auto auto` | Fixed columns exceed the 328px sheet; the title input is 0px and the row scrolls sideways; the assignee popover (`:175`) is clipped by the sheet body | Stack below sm; portal the picker through `usePortalAnchor` + `FloatingPanel` |
| 11 | `GroupTaskWorkspace.tsx:786-903` list rows | Badge, avatar, due, pill and arrow are all `flexShrink: 0` (~370px) and the title is `nowrap`; at 360px the title is gone and the pill clips. `GroupTasksTab.tsx:890-952` already has the two-line mobile row | Reuse that branch |
| 12 | Inline server errors as the last child of a scrolling body: `AddLeadModal.tsx:517`, `NewDealModal.tsx:570`, `AddEditSubscriptionModal.tsx:406`, `RecordPaymentModal.tsx:235`, `LogTopupModal.tsx:240`, `AddRechargeModal.tsx:250`, `CalledModal.tsx:348`, `CreateLeadTaskModal.tsx:145`, `AddVendorModal.tsx:241`, `MemberFormModal.tsx:145`; at the top and scrolled away in `AdCreativeFormModal.tsx:191`, `TrainingAssetFormModal.tsx:247`, `NoteFormModal.tsx:107` | After Save, nothing visibly happens | Render the error in the Dialog footer slot (as `SuggestionComposerModal.tsx:160`) or `scrollIntoView` on set |
| 13 | `AgentActivityWidget.tsx:534,554,561` + `globals.css:1076-1079` | The Recent Leads marquee drifts forever; pause is hover-only and the viewport is `overflowY: hidden` while drifting, so a phone user can neither stop nor scroll the list and the cards are moving targets | No marquee on `(pointer: coarse)`, native scroll instead |
| 14 | `SiaMedia.tsx:187-212,275`, `MessageBubble.tsx:101,117` | Images 280px / 240px and a voice player `minWidth: 200px` inside a 72% bubble whose content box is ~180px; the message pane scrolls sideways | `maxWidth: 100%` on the media; cap the bubble, not the media |
| 15 | `/m/profile`, `/m/requests`, `/m/requests/[ref]` (`ProfileScreen.tsx:31-40`, `RequestsScreen.tsx:44-125`, `RequestDetailScreen.tsx:58-99`) | Demo persona "Arfam Alam" with fake toggles, demo requests and a fake "Sara is attending" flow, reachable by URL by any signed-in staff | Gate behind a flag or remove from routing until the client app ships |
| 16 | `Sidebar.tsx:119-135` + `settings/teach-elaya/page.tsx:21` | `/settings/teach-elaya` is in `MOBILE_TRIGGER_PATHS` and mounts a BackButton at the same corner; the trigger covers the back button. `/error-log` (`error-log/page.tsx:23` uses `padding: var(--space-8)`, off the `p-4` ladder) has neither | Drop teach-elaya from the set; put error-log on the ladder and in the set |

---

## 4. P2: fix next

**Navigation and history**

- `SiaWorkspace.tsx:151-152,289` and `WhatsAppShell.tsx:315`: the rail-to-chat switch is React state only, so hardware Back leaves the page instead of closing the chat. `siaGroupHref` already exists; push `?group=` (Sia) and `?c=` (WhatsApp) so Back closes the pane.
- `ElayaChatScreen.tsx:206` back is `router.back()`; a deep-linked open exits the app. Use `/m`.
- `MobileDrawer.tsx:179-181` "Documents / Preferences / Reach the house" only close the drawer; `app-bars.tsx:41-43` the bell knob has no handler. Remove or wire.
- `NewTicketForm.tsx:198` + the page's `--340` grid: on a phone the "Elaya suggests" and messages cards land below the form and its Create button, so the user submits before seeing the suggestion. Order the side column first below lg.

**Tables without a card fallback**

- `MembersTable.tsx:42-73` (9 columns, `minWidth: 220` cells), `TicketsTable.tsx:34-64`, `VendorsTable.tsx:69-70`, `FreshdeskTable.tsx:57-103`: sideways scroll only. Leads already has `LeadMobileCard` (`LeadsTable.tsx:390-401`); Subscriptions has `md:hidden` cards. Add the same for Members first (the busiest on a phone).
- `RevivalPoliciesPanel.tsx:128` `minWidth: 620px`: the Active toggle is off screen. Card per policy below md.

**Chat and composer consistency**

- `ConversationPanel.tsx:87-90` WhatsApp scrolls to the bottom on every `messages` change, including delivery-status updates, with no near-bottom guard; Sia (`SiaChat.tsx:105-109`) and Elaya (`ElayaChatShell.tsx:91-112`) already have the guard. Copy it.
- Three composers: `MessageBar` (32px send, Enter sends), `TaskRemarksPanel.tsx:492-570` (own chrome), mobile `ElayaChatScreen.tsx:317-347` (50px pill, single line). Enter-to-send with Shift+Enter for a newline has no Shift on a phone keyboard. One primitive, Enter inserts a newline on `MQ.touch`, `enterKeyHint="send"`.
- Two bubble specs: `SiaMessageBubble.tsx:225` radius 16/5 vs 20/6 elsewhere; WhatsApp footer shows "5m ago" while Sia and Elaya show clock time; padding differs. One spec.
- `ElayaWidget.tsx:166` `height: min(78dvh, 680px)` in the sheet: with the keyboard open the composer sits under it. `height: 100%` of the sheet plus P1 #2.
- `SiaControlModal.tsx:342-369` console rows: four pills + avatar + toggle exceed the sheet; the title collapses. Wrap the meta cluster below md.
- `SiaMedia.tsx:182-183` `window.open` after an `await` is outside the user gesture; iOS blocks the full-size photo. Open synchronously or use an anchor.

**Pickers, popovers and modals**

- `CalledModal.tsx:231-239` outcome dropdown has no `menuPortal`; the menu is clipped by the sheet body. Every other modal passes it.
- `autoFocus` throws the keyboard over the opening sheet: `WonDealModal.tsx:222` (the amount field at the bottom, so the body scrolls past the Duration chips), `MemberFormModal.tsx:106`, `AddEditSubscriptionModal.tsx:193`, `AddVendorModal.tsx:156,169`, `NoteFormModal.tsx:135`, `SuggestionComposerModal.tsx:224`, `SubTaskModal.tsx:818`, `TicketTasksCard.tsx:59`, `MemberVaultCard.tsx:72`, `NewTicketForm.tsx:167`, `CreateGroupTaskModal.tsx:195` and the timers in `CreatePersonalTaskModal.tsx:90`, `CreateGroupTaskModal.tsx:461`. Gate on `!useMediaQuery(MQ.touch)`.
- `SubTaskModal.tsx:756-783`: a bespoke 95vw × 90dvh fixed card with `backdropFilter: blur(3px)` (`:740`, Never-Do), not the Dialog sheet; status and priority menus are `position: absolute` inside the header; the remarks composer sits under the keyboard. Render as the Dialog sheet below md.
- `AssigneePickerModal.tsx:138-170` centred nested card with a hand-rolled 14px search; the confirm footer can sit under the keyboard. Dock to bottom below md, use `Field.Input`.
- `DashboardDateFilter.tsx:167,223-237` two DatePickers side by side in a 220px panel; `DateRangeFields` already stacks. Stack.
- `ConfirmDialog.tsx:80-81` and `SubTaskModal.tsx:740` `backdrop-filter` (V-06). Drop it.
- `GroupTasksTab.tsx:328,362-368` every header tap waits 220ms to rule out a double-click, which also invites iOS double-tap zoom; "Open" already exists at `:678`. Drop the double-click path on coarse.
- `MyTasksCalendarView.tsx:594-661` on a phone the calendar, summary strip and quick-add come before the list, so today's tasks start below the fold. List first below md.
- `SlaPoliciesPanel.tsx:471-566` and `TicketSlaPoliciesPanel.tsx:97-138` policy and escalation rows have no wrap; they overflow at 360px.
- `vendors/[id]/page.tsx:67-93` a long vendor name pushes the two admin buttons off the row (`VendorAdminActions.tsx:167` `marginLeft: auto`, no `minWidth: 0` on the h1). `flexWrap` + `minWidth: 0`.
- `FreshdeskAttachments.tsx:40-42` video and audio `maxWidth: 320` inside a ~288px card body. `100%`.
- `WhatsAppConversationPeriodFilter.tsx:147-148` the only period control is 26×26px.
- `NotificationPreferences.tsx:126-127` the 16px checkbox's hit area is only the label text.
- Wrong keyboards: `MemberFormModal.tsx:107`, `AddVendorModal.tsx:228` phone fields without `type="tel"`; `MemberFormModal.tsx:132`, `AddVendorModal.tsx:238` email without `type="email"`; search boxes without `type="search"` / `enterKeyHint="search"` (`SearchBar.tsx:109`, `AssigneePickerModal.tsx:277`, `VendorFinder.tsx:31`, `VendorAdminActions.tsx:216`, `NewTicketForm.tsx:167`, `RenewalPickerModal.tsx:74`).
- Drag-only reorder with 12 to 14px handles and no move up/down: `LeadColumnPicker.tsx:164-178`, `SubTaskModal.tsx:320-332,679-681`.
- Hand-rolled inputs with the old accent focus instead of `Field`: `CalledModal.tsx:267-297`, `CreateLeadTaskModal.tsx:117-141`, `StatusActionPanel.tsx:723-755`, `CreatePersonalTaskModal.tsx:240-482`, `CreateGroupTaskModal.tsx:64-79,623-672`, `AdCreativeFormModal.tsx:323-345`, `TrainingAssetFormModal.tsx:289-458`, `NoteFormModal.tsx:126-167`, `AddSuggestionModal.tsx:72-100,226-362`, `PasswordChangeForm.tsx:332-345`, `ProfileDetailsForm.tsx:130-208`, `TicketLabelsPanel.tsx:16`, `ElayaPlaybooksPanel.tsx:116-124`, `IntakeLessonsPanel.tsx:23`.

**Touch targets under 44px** (the coarse rule does not reach `SelectionButton`, plain buttons or plain inputs): `TaskFormFields.tsx:105` FormChip 28px and `:160-161` priority dots 20px; `DictationButton.tsx:105` inline mic 28px; `Calendar.tsx:461-464` day cells ~33px and `:334,383` month arrows 28px; `DatePicker.tsx:79` month cells ~32px; `CreateGroupTaskModal.tsx:741-742` swatches 22px and `:793-794` icon tiles 26px; `VendorReviewForm.tsx:52-53` 32px; `LeadColumnPicker.tsx:75-76` 16px; `Toggle.tsx:22` sm track 32×18; `Checkbox.tsx:24` 16px; `FilterDropdown.tsx:59` options 36px; `StatusActionPanel.tsx:678` reason rows ~36px; `SiaChat.tsx:301,335,347` 32px; `SiaGroupInfoPanel.tsx:168` 28px; `SiaWorkspace.tsx:239-248` chips 22px tall; `ConversationPanel.tsx:542` attach 32px; `MessageBar.tsx:13` send 32px; `RowActions.tsx:28-33` Edit/Delete 32px (Notes, ad creatives, training assets); the dashboard refresh buttons 28px (`AgentTasksWidget.tsx:257`, `ManagerBudgetWidget.tsx:103`, `ManagerCampaignWidget.tsx:148`, `ManagerLeadStatusWidget.tsx:271`); `AgentActivityWidget.tsx:311-312` Mine/Team tabs ~20px; `DomainSwiper.tsx:45-61` pager dots 6px; row arrows 24px (`MyTasksCalendarView.tsx:994`, `GroupTaskWorkspace.tsx:898`); `TaskCompletionCircle.tsx:62-63` 24px; `LeadTasksCard.tsx:64-71` 28px; `SubscriptionsTable.tsx:290-297` 32px.

---

## 5. P3: polish

- `MemberFormModal`, `MemberVaultCard.tsx:71-75,125-130` reveal row and kind+label row do not wrap.
- `TicketHeaderControls.tsx:79,88` the two 1×20 dividers orphan at line ends when the row wraps.
- `members/[id]/loading.tsx:28` `minmax(340px, 1fr)` while the page uses `min(340px, 100%)`; the skeleton is 12px wider than the paper.
- `leads/[id]/loading.tsx:29-45` status strip skeleton is one row and `--radius-lg`, the real panel stacks with `--neu-radius-card`; `subscriptions/loading.tsx:18-39` shows table rows while the phone renders cards.
- Two calendar specs: `MyTasksCalendarView.tsx:612` forces `width: 100%` and `md:sticky`; `SubscriptionCalendar.tsx:222-234` keeps the 260px default centred in a 340 card and `lg:sticky`.
- `TaskRemarksPanel.tsx:101-104` unconditional scroll-to-bottom; `:276-311` two blur(72/80px) orbs animate forever (GPU cost on phones).
- `toast-provider.tsx:50` mobile toasts at bottom 80px sit exactly over the chat composer; a send-failure toast covers the composer.
- `globals.css:398-404` + `sia/page.tsx:45` the Elaya button clearance (96px) is subtracted from chat panes at every width.
- `Dialog.tsx:120-159` the bottom sheet has no swipe-to-dismiss; the `/m` sheets do (`overlays.tsx:66-71`). `Dialog.tsx:247-253` footer has no `flexWrap`.
- `ElayaPresenceCard.tsx:42-65` the mobile "Send feedback" button is placed over the chat header where "Daily limit reached" renders.
- `ElayaChatScreen.tsx:224-233` a hard-coded "TODAY" chip over a 24-hour transcript; `:291` starter chips 36px.
- `Carousel.tsx:162-190` slides are `height: 100%` of an auto-height viewport, so every domain pane is as tall as the tallest.
- `SnapshotCountWidget.tsx:55` the hint is a `title`, invisible on touch; the three 2×2 snapshot tiles become three full-width 88px strips on a phone (`dashboard-widgets.ts:142,153,210`).
- `scroll.ts:19` `lockBodyScroll` sets only `overflow: hidden`; iOS still rubber-bands the page behind drawers and sheets.
- `SiaMedia.tsx:309-315` the voice seek bar is a 16px target.
- 10px content text (`--text-2xs`) for real content: `LeadWhatsAppCard.tsx:282,356,399`, `LeadActivityLog.tsx:111-235`, `CampaignCard.tsx:35,76`, `CaseListRow.tsx:137-143`, `IntakeProposals.tsx:70-75`.
- Hover-only affordances that still work on tap but give no hint: `LeadInfoCard.tsx:458-459,1061-1070`, `MemberFactsCard.tsx:207`, `ProfileAvatarSection` "Click photo" copy, `LeadNotesInput.tsx:136` "⌘ + Enter" hint.
- `AddEditSubscriptionModal.tsx:210-218` `<datalist>` has no UI on iOS Safari.
- `VendorPreferenceControl.tsx:125-148` 12px note input saved on blur with no feedback.
- `VendorAdminActions.tsx:355-371` Merge dialog rolls its own footer inside the body.
- `SuggestionComposerModal.tsx:159-165` footer error `flex: 1` beside two buttons squeezes to a sliver.
- `SubscriptionHistoryModal.tsx:106-109` uses `Loader2 animate-spin` (the deleted-spinner rule).
- `DatePicker.tsx:113` the stacked date+time panel has no Done affordance on touch.
- `TicketThread.tsx:32` `pre-wrap` without `overflowWrap: anywhere`; long URLs push the width.
- `UsersTable.tsx:150` rows wrap into three or four lines at 328px (readable, tall).
- `AdCreativesManager.tsx:294-319` nowrap meta.

---

## 6. The shell: what the shell reviewer found

- Title rows on primary pages overflow at 360px once the bell joined them (P1 #6).
- 14px inputs (P1 #1) and no `interactiveWidget` (P1 #2).
- `/settings/teach-elaya` trigger over its BackButton; `/error-log` and `/tickets/board` with no way out (P1 #5, #16).
- `FilterBar.tsx:161-164` reads `useMediaQuery` for its scroll layout; the hook is false on the server and first paint (`useMediaQuery.ts:39-43`), so the bar paints in the wrap layout and flips to the scroll layout after hydration. Render the scroll layout below md in CSS.
- The boot screen (`AppBootScreen.tsx:44-45`) plays once per session; a PWA launch from the home screen is a new session, so every launch waits the draw. Skip it in `display-mode: standalone`.
- `PageControls` bell 32px and the drawer's sign-out 28px; the drawer pads only the top safe area (`MobileDrawer.tsx:137`), not the bottom.

---

## 7. The leverage list: shared changes that clear most findings

| # | Change | Clears |
|---|---|---|
| 1 | One `@media (pointer: coarse)` block: fields at `max(1rem, …)`; `.serene-selection`, chips, dots, `Toggle`, `Checkbox`, `RowActions`, refresh buttons at a 44px hit area (padding or a pseudo-element, never a bigger box) | P1 #1, the whole targets list |
| 2 | `interactiveWidget: 'resizes-content'` in `generateViewport` | P1 #2, the keyboard-over-composer items |
| 3 | A `.serene-form-row` grid utility (`repeat(auto-fit, minmax(min(160px, 100%), 1fr))`) adopted by every two- and three-up form row | P1 #8, #9, #10 (with the picker portal) |
| 4 | Dialog: the error slot in the footer, `flexWrap` on the footer, swipe-to-dismiss below md, and a `focusOnOpen` prop that respects `MQ.touch` | P1 #12, the `autoFocus` list, the two bespoke modals once they compose Dialog |
| 5 | A `PageTitleRow` primitive that hides a secondary action's label below md and never lets the CTA clip | P1 #6 |
| 6 | The mobile order rule for `--aside-left` and a `--side-first` variant for the New ticket page | P1 #7, the suggestion-below-form item |
| 7 | One `AgentHeader` + one stat strip on Performance | P1 #4 |
| 8 | One composer (`MessageBar`) with touch behaviour, one bubble spec, one near-bottom scroll guard shared by Sia, WhatsApp and Elaya | the chat consistency items |
| 9 | `?group=` / `?c=` in the URL for the rail-and-pane pages | Back closes the chat on Sia and WhatsApp |

---

## 8. What already works well on a phone

The shell (`100dvh`, one scroller, safe areas, `overscroll-behavior`), the drawer with swipe-to-dismiss,
the `/m` app's 44 to 56px knobs and rows, the finger-following domain swipe, Dialog as a bottom sheet
with a 90dvh cap, portaled and viewport-clamped FilterDropdown, DatePicker and TimePicker with the
stacked time wheel, `FormSelect`, `DatePicker`, `Field.Input` and every `Button` at 44px on coarse
pointers, the Leads card stack and toolbar label hiding, the Subscriptions list, calendar and overview,
Campaigns, Books, the three Oversight pages, the lead, member and Freshdesk dossier orders, the tasks
filter bar and the snap-scroll board, the Elaya shell's near-bottom scroll rule, the Sia and WhatsApp
rail-and-pane split, the dashboard's one-column static layout with drag and resize off, no
`window.confirm` anywhere, no form clearing its fields on error.

---

## 9. Recommended order

1. Section 7 items 1 to 4 (one afternoon; they are CSS and primitives).
2. The two named screens (section 2), then P1 #5 (the board), #7 (ticket order), #13 (marquee), #14 (media), #15 (demo screens), #16 (nav).
3. The P2 navigation and consistency items, Members cards.
4. The P3 list as a sweep.
