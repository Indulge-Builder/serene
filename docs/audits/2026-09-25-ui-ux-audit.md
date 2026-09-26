# Serene UI and UX audit, 2026-09-25

**Date:** 2026-09-25 · **Audience:** the founder and the engineers who will fix these · **Scope:** the whole
front end: all 64 pages (dashboard, auth, the mobile `/m` app), 523 components, the three stylesheets.

> **Method.** Five parallel reviewers each read the code for one area: (1) places that fall back to the
> browser's own look, (2) page consistency and UI states, (3) accessibility and interaction,
> (4) responsive layout, dark mode and theming, (5) motion, feedback and feel (Apple's fluid-interface
> rules). A pattern scanner counted every raw element and token break across all 523 files, and the
> Impeccable design detector ran over `src/`. Every finding below was read in the code; the most
> serious ones were checked twice. Nothing was changed.
>
> **Working tree note.** Another tool is midway through moving the app's dropdowns onto a new
> `ui/FormSelect` (about 20 files, uncommitted). This audit reads the files as they are now; section 6
> covers that work on its own.

---

## 1. The short answer

Serene has a strong, coherent design system. The token discipline is excellent: one stray hex colour in
523 files, no Tailwind palette classes, no grey browser buttons, no default blue links, no
`window.alert`. What lets it down is the edges: the places the system never reached (error pages,
native pickers, scrollbars, tooltips), a handful of pages that skip a shared piece (the bell, the filter
strip, a loading screen), keyboard and screen-reader gaps, and dark-mode and phone bugs on specific
screens.

Most of it is systemic. About a dozen changes in shared places (section 7) remove well over half of
the findings.

### Health score (Impeccable audit rubric, 0 to 4 per dimension)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | Records cannot be opened from 5 main lists with a keyboard; pages have no titles; toast errors may never be read out |
| 2 | Performance | 3 | Mostly transform and opacity; a few width and height animations; about 40 server-rendered blocks start invisible until the page wakes up |
| 3 | Responsive design | 2 | Books and two member pages overflow phones; "Add subtask" sits under the Elaya button; swipes do not follow the finger |
| 4 | Theming | 3 | Near-perfect tokens, but "Revive lead" is unreadable in dark mode and Elaya's replies lose their bubble there |
| 5 | Implementation integrity | 2 | Real drift at the edges: no error or 404 pages, native checkboxes and date pickers, OS scrollbars, the bell missing on 13 pages |
| | **Total** | **12 / 20** | **Acceptable: significant work needed** (10 to 13), most of it systemic |

**Implementation integrity verdict: pass, with drift.** The product has its own clear visual system
(cream material, the seed mark, Playfair titles, theme accents, one focus colour), and 115 files use the
shared empty state. The failures are places the system was never applied, not a competing style.

**Findings by severity:** P1 21 · P2 about 70 · P3 about 60.

---

## 2. What falls back to the browser's own look

This is the founder's main concern: an element that is not built from Serene's components, so the
browser draws it its own way.

| What | Where | What the user sees | Fix |
|---|---|---|---|
| **Error and 404 pages** | none exist: no `error.tsx`, `not-found.tsx` or `global-error.tsx` anywhere in `src/app` | A bad link to a lead, member, ticket, vendor, Freshdesk ticket or user (9 routes call `notFound()`) shows Next's bare black-on-white "404: This page could not be found", outside the app, with no way back. A page that throws replaces the whole app with "Application error" | In-shell `(dashboard)/not-found.tsx` and `error.tsx` built from BackButton and EmptyState; `(client)/m/error.tsx`; root `app/not-found.tsx` and `app/global-error.tsx` |
| **Checkboxes and radios** | `TicketChecklistCard.tsx:25` (every ticket's checklist), `NotificationPreferences.tsx:179` (/profile, every user), `SlaPoliciesPanel.tsx:621, 873`, `ElayaPlaybooksPanel.tsx:128`, `TaskFormFields.tsx:327` (task type radios) | The operating system's 13px blue checkbox and radio dot inside cream cards. No `accent-color` is set anywhere | A shared `ui/Checkbox` (promote LeadsTable's private CheckboxCell); CheckTile for checklists; Toggle for on/off; SelectionButton with `role="radio"`; plus `accent-color: var(--neu-accent-deep)` globally as a safety net |
| **Date, time and month pickers** | `NewTicketForm.tsx:215, 225` (brief dates, "Needed by"), `MemberFormModal.tsx:125, 126`, `AddEditSubscriptionModal.tsx:318`, `RecordPaymentModal.tsx:183, 195`, `LogTopupModal.tsx:197`, `AddRechargeModal.tsx:198`, `MemberVaultCard.tsx:130` and `SubscriptionExportButton.tsx:149` (month) | The OS calendar popup in the browser's own date format; the field frame is themed, the picker is not | `ui/DatePicker` (it already has `showTime`); add a month mode for the two month fields |
| **Select popups** | Field `Select` in `WonDealModal.tsx:139`, `RoleDomainFields.tsx:81, 94, 113` (every user form), `AddEditSubscriptionModal.tsx:241, 258`, `LogTopupModal.tsx:155`, `AddRechargeModal.tsx:127, 163` | A themed closed field, then the OS dropdown list with system fonts and highlight | FormSelect, once it supports a hidden-input `name` and option groups (RoleDomainFields needs both) |
| **Scrollbars** | `.serene-shell-paper` (`globals.css:123`, the scroll area of every page), every modal body (`Dialog.tsx:229`), every dropdown menu (`FilterDropdown.tsx:342`), the Sia and WhatsApp rails, the ticket board; 59 of 64 scroll areas | The thick grey OS scrollbar inside the rounded cream workspace on Windows and on Macs set to show scroll bars. Only 5 areas use `.scrollable` | Apply the scrollbar rule globally (thin, token-coloured thumb, transparent track), not only on `.scrollable` |
| **Tooltips** | 58 native `title=` tooltips in 36 files; `ui/Tooltip` is used in only 4 | The OS tooltip box, after a long delay, never on touch. Five places use it as the only way to learn what something means: the priority dot (`GroupTaskWorkspace.tsx:1118`), assignee initials (`GroupTasksTab.tsx:951`), the linked or not-linked icons (`MembersTable.tsx:112`), `MyTasksCalendarView.tsx:955`, why a file was not copied (`FreshdeskAttachments.tsx:51`) | `ui/Tooltip` where it carries meaning; visible text where it matters on touch |
| **Number fields** | 15 `type="number"` fields in 9 files (for example `SlaPoliciesPanel.tsx:507`, `RevivalPoliciesPanel.tsx:174`, `DomainOverviewPanel.tsx:226`) | OS spin arrows inside the field | A global spinner reset, or `inputMode="numeric"` text fields |
| **Audio player** | `FreshdeskAttachments.tsx:38` | The native grey audio pill, while Sia has a themed voice player | Reuse SiaMedia's player |
| **Browser tab titles** | `app/layout.tsx:52` has no title template; 40 of 49 dashboard pages set no title | Every tab reads "Serene", so ten open tabs are indistinguishable, and screen readers announce nothing on navigation | `title: { default: 'Serene', template: '%s · Serene' }` and a title per page |

**Lookalikes.** These are not the browser's look, but they are hand-built instead of the system's, so
they look slightly different from everything around them:

- **Fields in the task modals** are flat paper with a JavaScript-set accent border or glow:
  CreatePersonalTaskModal, CreateGroupTaskModal, SubTaskModal, the GroupTaskWorkspace add panel and
  AssigneePickerModal (its own search, tabs and avatar). The same goes for ElayaPlaybooksPanel,
  TicketLabelsPanel, IntakeLessonsPanel, IntakeProposals on /tickets, VendorPreferenceControl and
  VendorCategoryPicker, where a click even shows Chrome's own focus ring. In all, 19 files and about 35
  fields.
- **Seven hand-built search fields** instead of SearchBar.
- **Header buttons** on /tickets, /tickets/board, /vendors and /admin/users are links styled by hand.
  They get a smaller corner, a lighter weight and no glow compared with Button, the sibling CTAs (Add
  lead, Add deal) have that glow, and the /admin/users one has no hover.
- **Spinners.** Five spinners are lucide `Loader2` at one second per turn instead of LogoSpinner
  (subscription history, invoice controls, vendor category picker).

---

## 3. P1: fix first

| # | Issue | Location | Why it matters | Fix |
|---|---|---|---|---|
| 1 | No error or 404 pages | `src/app` (none) | Crashes and bad links leave the app entirely | Section 2, first row |
| 2 | The notification bell is missing on 13 main pages and every detail page | The bell lives only in PageControls (`TOP_BAR_ENABLED` is on); /members, /tickets, /tickets/board, /vendors, /subscriptions, /notes, /sia, /freshdesk, /books, /profile, /admin/ad-creatives, /admin/elaya-training and /settings/teach-elaya never render it | The concierge team's main pages have no inbox at all | Render PageControls in every title row, or mount the bell once in the shell |
| 3 | Opening a ticket or a member shows the list's skeleton first | No `loading.tsx` in `tickets/[id]` or `members/[id]` (12 more nested routes do the same; `members/[id]/finance` has none at all) | The screen shows a table skeleton, then snaps to a dossier. The same bug was already fixed for leads and tasks | A loading file in the record's own shape for each route |
| 4 | The mobile app has no loading states | Nothing under `app/(client)/m` | Every tab tap waits on the server with no change, so taps look dead | A `loading.tsx` per room, and move the active tab on tap |
| 5 | The filter strip is missing on 5 list pages | `members/page.tsx:71`, `tickets/page.tsx:70`, `tickets/board/page.tsx:40`, `vendors/page.tsx:101`, `freshdesk/page.tsx:107` | Their loading screens draw the paper strip, then it vanishes when the page loads; Leads, Deals, Campaigns, Budget and Notes have it | The standard strip, or a `framed` prop on FilterBar |
| 6 | Records cannot be opened from 5 main lists with a keyboard | `LeadsTable.tsx:619`, `MembersTable.tsx:76`, `TicketsTable.tsx:61`, `VendorsTable.tsx:113`, `FreshdeskTable.tsx:98`: each row is `<tr onClick>` with no link | Keyboard, switch and voice users cannot open a lead, member, ticket or vendor | Make the name cell a real link; keep the row click for the mouse |
| 7 | Pages have no titles | `app/layout.tsx:52`; 40 of 49 pages | Tabs are indistinguishable; navigation is silent for screen readers | Title template plus a title per page |
| 8 | Toast errors may never be read out | `toast-provider.tsx:39` renders nothing when there are no toasts, so the live region is created together with the first toast | 122 `toast.danger` error paths can be silent for screen-reader users | Always-mounted polite and assertive regions; `role="alert"` for errors |
| 9 | The tablet icon rail has no labels | `Sidebar.tsx:156-226` (768 to 1023px): the label is hidden, the icon is `aria-hidden`, and the link has no name | About 25 nav links are unnamed on iPad portrait, and the tooltip never shows on touch | `aria-label` on each link |
| 10 | Personal details can only be edited with a mouse | `PersonalDetailsCard.tsx:158`: a click on a grid `div` | Keyboard users cannot edit a lead's details or city, and nothing tells touch users the card is editable | An Edit button in the card header |
| 11 | "Revive lead" is unreadable in dark mode | `StatusActionPanel.tsx:504`: `--color-warning` becomes light butter `#E9D6AC` in dark while its text stays warm white `#FDF9F0`, about 1.3:1 | The confirm button of the revival flow is illegible | Button `variant="warning"`, or dark ink for the `-fg` tokens in dark |
| 12 | "Add subtask" sits under the Elaya button | `GroupTaskWorkspace.tsx:1184` (z raised, 32px from the corner) vs the Elaya button (z sticky, 24px, 56px wide) | On /tasks/[id] the right part of Add subtask opens Elaya | Lift it above the Elaya button (`--elaya-fab-clearance`) |
| 13 | Books overflows phones | `books/page.tsx:54`: `minmax(420px, 1fr)` | "Latest invoices" and "Latest payments" lose 40 to 77px on the right and cannot be scrolled | `minmax(min(420px, 100%), 1fr)`; the same on `MemberZohoCards.tsx:73` and `members/[id]/page.tsx:62` (P2) |
| 14 | An OS checkbox on every ticket's checklist | `TicketChecklistCard.tsx:25` | The main ticket screen shows a browser control | CheckTile |
| 15 | Native date and time pickers in New ticket | `NewTicketForm.tsx:215, 225` | The OS picker, in the browser's format, on the most used form | DatePicker with `showTime` |
| 16 | The OS scrollbar on the main workspace | `globals.css:123` | Visible on every page for Windows users | Global scrollbar rule |
| 17 | Swipes on the mobile rooms do not follow the finger | `Carousel.tsx:84-93, 131`: touchmove only locks the axis; the slide jumps after release | Paging between domains in all four rooms feels broken | Track the finger 1:1, choose the target from the release velocity, hand that velocity to the spring |
| 18 | Elaya's chat pulls you to the bottom on every word | `ElayaChatShell.tsx:88-90`, `ElayaChatScreen.tsx:96-98` | You cannot scroll up while she is answering | Stick only when already near the bottom, as SiaChat does, with a "new message" pill |
| 19 | The /tasks tabs do not respond until the server answers | `TasksShell.tsx:78, 94-99`: the active tab comes from the server | Clicking "Group tasks" appears to do nothing | Hold the tab in local state and dim while the server works |
| 20 | The boot screen blocks input | `AppBootScreen.tsx:22, 62, 83`: 3.4s plus a 0.5s fade on the first load of each session, including right after login | The app may be ready but cannot be touched | Tap anywhere to skip (as the Indulge app does), and leave early when ready |
| 21 | The unfinished dropdown migration breaks the build | `MemberVaultCard.tsx:124, 130`, `ElayaMemoryCard.tsx:66`: `width` set twice in one style object | TypeScript error TS1117, so `next build` fails if this work is committed as is | Delete the first `width: '100%'` in each; see section 6 |

---

## 4. P2: fix next

### Structure, states and honesty
- **Wrong loading screens:** 12 nested routes show their parent's list skeleton (tickets/new, tickets/board, freshdesk/[id], campaigns/[id], vendors/find, admin/users/[id] and new, four settings pages). Opening "Teach Elaya" first shows the Settings roster skeleton.
- **Loading screens that jump:**
  - `tickets/loading.tsx` leaves out the intake strip and `freshdesk/loading.tsx` the overview strip, so the table drops when they arrive.
  - `helpdesk/loading.tsx:19` draws a 3-column grid for a one-column list.
  - `TasksSkeleton.tsx:58` and `ManagerPerformanceSkeleton.tsx:66` keep a 280px side column on phones, where the real page stacks.
- **Failures shown as "not found" or "nothing here":** `members-service.ts:264-266` and `tickets-service.ts:141` return null on a database error, so an outage says the member does not exist. Failed list reads show the calm "Nothing open." Books does this right (`books/page.tsx:34-41`).
- **One tap, no confirmation and no undo:**
  - deleting an SLA policy (`TicketSlaPoliciesPanel.tsx:94`, an unlabelled icon)
  - removing a family member (`MemberPeopleCard.tsx:60`)
  - unlinking a member's WhatsApp group (`MemberWhatsAppCard.tsx:67`), which stops intake and profiling
- **Back loses where you came from:**
  - Sia's `from=sia` is ignored by `tickets/new/page.tsx:15, 29`.
  - A lead opened from a campaign goes back to /leads (`leads/[id]/page.tsx:36`).
  - `TicketBoard.tsx:38` uses a raw `<a>`, so the page reloads and Back returns to the list.
- **A raw validation message reaches the user:** clearing a ticket title shows "Too small: expected string to have >=1 characters" (`TicketBriefCard.tsx:42`, `ticket-schema.ts:129`). `_validation.ts:12` lets any default Zod message through.
- **A spinner that never stops:** `SubscriptionHistoryModal.tsx:67, 104` spins forever when loading fails, and the error is never shown.
- **Campaign leads keep stale rows:** `campaigns/[id]/page.tsx:224`'s Suspense has no key, so paging keeps the old table with no feedback.
- **Overlapping phone controls on Teach Elaya:** the page is a drawer-trigger path (`Sidebar.tsx:126`) and also renders a BackButton, so on phones the two overlap. The Elaya training page has no Back at all.
- **The error log is orphaned and off-pattern:** nothing links to it. It has a fixed padding, an icon-tile header with a paragraph, a hand-made stat card, and a skeleton with 3 tiles for 4.
- **Naming:** the sidebar says "User Management", the page says "Team", the button says "Add Member", and "New member" on /members means a client.
- **The docs disagree on detail-page titles:** root CLAUDE.md says detail pages get no dot; `src/components/CLAUDE.md:251` says they do; 17 pages follow one rule and 3 the other. This needs one decision.

### Keyboard, screen readers and forms
- **Toggle has no way to be named:** `Toggle.tsx:63` has no `aria-label` or `aria-labelledby` prop, so six switches are unnamed (BulkEditLeadsModal, AgentSettingsTable, SlaPoliciesPanel, RevivalPoliciesPanel, SiaControlModal, SiaGroupInfoPanel).
- **Task and vendor fields have no labels:** `TaskFormFields.tsx:42, 59` (FieldLabel is a span, FieldError a plain paragraph) leaves every field in the four task modals and AddSuggestionModal named only by its placeholder. The same is true of AddVendorModal's local Label. Compose `ui/Field`.
- **Pastel focus frames:** 17 hand-written focus styles in 11 files, plus `.serene-input-auth` on the login pages (`globals.css:979`), draw the frame in the pastel accent at about 2:1, below the 3:1 bar. They also show on mouse clicks. Use `--neu-focus-edge`.
- **No focus indicator at all** on the lead note composer (`LeadNotesInput.tsx:93`), the WhatsApp composer on the lead card (MessageBar "nested"), the mobile Elaya composer, and mobile fields where inline styles override the frame.
- **Keyboard focus clipped:** `RowMotion.tsx:51`'s `overflow: hidden` clips the focus outline on full-size rows in group tasks and notifications.
- **Task rows:**
  - Enter or Space on nested buttons also triggers the row (`GroupTasksTab.tsx:607, 878`, `GroupTaskWorkspace.tsx:801, 1037`, `MyTasksCalendarView.tsx:919`), and Space also scrolls the page.
  - The hand-built "⋯" menu (`GroupTasksTab.tsx:727-795`) has no Escape, no focus move, and Tab never reaches "Delete group".
- **Sia message selection is mouse-only:** "create a ticket from messages" (`SiaChat.tsx:393-399`) selects by clicking a div.
- **The phone nav drawer does not manage focus:** below 768px the Sidebar drawer (`Sidebar.tsx:297-360`) has no dialog role, no focus trap and no close button. The mobile app's drawer already does this right with `useModalFocus`.
- **No skip link:** keyboard users tab through about 25 nav links on every page before reaching the content.
- **Focus is lost:**
  - opening a conversation on a phone (WhatsApp and Sia)
  - hidden carousel slides and the marquee's duplicate copy stay tabbable (use `inert`)
- **Values are never announced:** FormSelect, DatePicker and TimePicker triggers are named by their label only, so a screen reader never hears the current value. CalledModal's required due date is announced as "Date picker".
- **Junk and Lost reasons** (`StatusActionPanel.tsx:660-705`) look like radios but are plain buttons, and the selected ring is fainter than the unselected one.
- **Errors and saves happen silently:** CalledModal, StatusActionPanel, LeadNotesInput, LeadInfoCard and TicketTimeline show errors with no `role="alert"`, and InlineEdit shows saving and saved as icons only.
- **Chats have no live region:** the WhatsApp message list has no `role="log"`; mobile Elaya is silent and drops focus on every send; desktop Elaya announces each streamed fragment.
- **Undo disappears too quickly:** it replaces confirmation for task, subtask and note deletes, but lasts 5 seconds and does not pause on keyboard focus.
- **Colour-only signals:**
  - WhatsApp read vs delivered ticks
  - the failed-send mark
  - the unread dot
  - the member linked or not-linked icons
  - the task completion circle at rest (about 1.2:1)
- **Pastel accent used as text** at about 1.8 to 2.5:1 in 24 places, for example the membership chip in `DealCard.tsx:124`, the role pill in `UsersTable.tsx:314`, `EscalationSections.tsx:52` and `LeadJourneyTimeline.tsx:209`. Expired member rows at 0.7 opacity drop to about 2.9:1. Use `--neu-accent-deep`.
- **Card titles are not headings:** CardHeader (52 dossier cards) and the widget titles are spans or paragraphs, so heading navigation finds only the page title.
- **Unnamed icon buttons:** the trash button in TicketSlaPoliciesPanel and the 22px close in GroupTaskWorkspace.

### Dark mode, phones and theming
- **Elaya's replies have no bubble:** `ElayaMessageBubble.tsx:50-59`. The bubble is `--neu-surface-high` on paper with a transparent chip shadow. In dark the two colours are one step apart (`#332E24` vs `#332E25`). Give dark `--neu-surface-high` a real step, or add an edge.
- **Cream rims in dark:** hand-written highlights (`rgb(var(--neu-light) / 0.65-0.75)`) in `CommandPalette.tsx:115, 144`, `MobileTabBar.tsx:41, 82` and `ElayaChatScreen.tsx:220`.
- **The logo fades on the dark rail:** it is a fixed image, and its umber half nearly vanishes on the dark rail and on the phone's drawer button (`Sidebar.tsx:405, 336`). Render `SeedMandala`, which brightens in dark.
- **The notification panel sits under the Elaya button** and under the sticky page header from tablet up (`globals.css:485-486`), and it can run off short windows.
- **Missing safe areas:** the phone nav drawer (`globals.css:253-265`) and the full-screen founder deck (`FounderDrillDownDeck.tsx:174`, `Dialog size="full"`) sit under the status bar and the home indicator.
- **The group-task subtask rows** (`CreateGroupTaskModal.tsx:320, 833`) squeeze the title field to about 20px on phones.
- **Group icon tiles** paint from 10 fixed hex colours (`task-constants.ts:15-24`) that never follow the theme and drop to about 2:1 in dark.
- **Background blur on modal backdrops:** `ConfirmDialog.tsx:80`, `SubTaskModal.tsx:738` and the loading veil (`LogoSpinner.tsx:88`), which the design law forbids and Dialog itself refuses.

### Motion and feel
- **Dialogs:**
  - The overlay's exit reuses the slower enter timing (`Dialog.tsx:94-99`), so for a moment after closing an invisible scrim swallows clicks.
  - On phones the bottom sheet enters with a 10px rise and exits by shrinking instead of sliding down, and it cannot be dragged.
- **Opening a task:** a blocking blurred veil covers the page during the remarks fetch, then the modal's scrim fades in from zero, so the page flashes through (`MyTasksCalendarView.tsx:816` and two siblings). Open the modal at once with a remarks skeleton.
- **Waits on frequent actions:**
  - Performance roster clicks wait out a 200ms exit, and the outcome bar arrives about 1s after the click (`ManagerPerformancePanel.tsx:652-672`).
  - Calendar month changes wait 350ms out plus 350ms in, so fast clicks show a blank grid (`Calendar.tsx:416-423`).
- **Filters show nothing until the server answers:** single-select and date filters (`useUrlFilters.ts:44`), paging and view tabs throw away `isPending`. Echo the pick at once.
- **Primary buttons feel soft:** MotionButton's tap scale fights Button's own 220ms transform transition (`MotionButton.tsx:26-35`, `Button.tsx:209`), and the same happens on the Elaya button.
- **The shared spring overshoots:** `SPRING_CONFIG` (`motion.ts:108-112`) has a damping ratio of about 0.75. The founder deck overshoots about 35 to 40px on every arrow click, and SiaGroupInfoPanel about 10px. Moves the user did not fling should be critically damped.
- **Swipes and drags:**
  - The mobile drawer and sheets hand a flick to a fixed tween about four times slower than the finger.
  - The ticket board cannot be scrolled on touch if the finger starts on a card.
- **Popovers:**
  - They are placed from an estimate, then jump (`usePortalAnchor.ts:45-46`); the subscriptions row menu can appear about 240px away from its button.
  - The notification panel rises from below and exits upward, never from the bell.
- **Reduced motion:**
  - The page-title dot blinks forever with no reduced-motion rule (`design-tokens.css:1140`), and five inline loops ignore the setting.
  - With reduced motion on, the loading marks freeze, so saving looks stuck, and press feedback disappears entirely. Swap in a gentle fade rather than removing them.
- **Loading choreography:**
  - Typing in a list search replaces the whole table with a skeleton, then a blank, then the table. Keep the old rows, dimmed.
  - The dashboard slides every widget into place on each load and forces a 150ms skeleton on widgets that already have data.
  - `AnimatedNumber` drops every KPI to 0 and counts it back up.
  - About 40 server-rendered wrappers start at opacity 0 until the motion code loads.
- **The Button success tick appears instantly:** a second `serene-check-draw` definition (`design-tokens.css:1095, 1222`) overrides the drawn one.
- **Scroll is hijacked:**
  - WhatsApp scrolls to the bottom on any change, including read receipts (`ConversationPanel.tsx:86-89`); task remarks do the same.
  - The Recent Leads marquee cannot be paused on touch or by keyboard, and cannot be scrolled while moving.
- **Tiny targets:** the mobile domain dots are 6px tall (target 44px) and animate their width.

---

## 5. P3: polish

- **Loading and empty states:**
  - `vendors/[id]/loading.tsx` and `escalations/loading.tsx` render blank or collapsed shimmer cards.
  - The dashboard greeting skeleton is two lines for a one-line title.
  - Weak empty copy: "No data yet." three times on Subscriptions Overview, and "Nothing here." in every empty board column.
  - Environment-variable names are shown to users on Books.
  - "Loading…" text is used instead of a mark in three places.
- **Card corners and titles:**
  - Row cards are 22px on four pages and 32px on three others; tables are 32px on some pages and 14px on others.
  - Section titles use at least three styles, and `.type-section-title` is used but defined nowhere.
  - The blinking title dot also sits on six widget titles.
- **Hidden bold:** nine `<strong>` and `<b>` tags render at weight 700 (the house maximum is 600). One global rule fixes it.
- **Small text and loose tokens:**
  - About 20 raw 9 to 10px texts, and every chart axis at 10px.
  - `letterSpacing: '0.12em'` (off the scale) 13 times, `lineHeight: 1.6` seven times.
- **Off-scale values:**
  - Off-scale z-index in the mobile layer (`z-40`, `z-50`) and in CreateGroupTaskModal.
  - Raw corner radii in Tooltip, CommandPalette, Sidebar, GroupTasksTab, CallOutcomeBar and WaText.
- **Chalky bars in dark:** a literal `white` gloss mixed into four bar fills (FirstTouchScorecard, PipelineBar, ManagerLeadStatusWidget, ManagerBudgetWidget).
- **Charts with more than 3 colours:** SpendDonut (all 6, repeating), CallOutcomeBar, ManagerLeadVolumeWidget, UsageHistoryChart.
- **Hover and touch:**
  - 27 JavaScript hover handlers that are not limited to mouse pointers, so a tapped item stays in its hover state on phones.
  - About 32 clickable surfaces with no pressed state.
  - Press depths vary from 0.8 to 0.98.
  - A save button's width changes between "Saving…" and "Saved".
- **Media and small bugs:**
  - Chat images with no reserved size make threads jump when they load.
  - `public/offline.html` still uses the retired dark palette.
  - The iOS home-screen app zooms into every field (no 16px rule on touch devices).
  - The mobile Notifications button does nothing.
  - "Documents", "Preferences" and "Reach the house" in the mobile drawer only close it.
  - `/m/profile` and `/m/requests` show demo data, including a fake person, to anyone who types the URL.

---

## 6. The unfinished dropdown migration (uncommitted, another tool)

It is good work: one FormSelect for every form select, with type-ahead and disabled options. It needs a
pass before it is committed:

1. **Build break.** Three duplicate `width` keys (item 21 above).
2. **Mismatched fields.** `<Input className="serene-input neu-input">` in MemberHealthCard, MemberPeopleCard, TicketTasksCard and SlaPoliciesPanel makes those fields about 45px tall with a 22px corner, next to 36px, 14px FormSelects in the same row. Drop the extra classes.
3. **Fields beside the new selects are still old.** In AdCreativeFormModal and TrainingAssetFormModal the text fields still use flat paper `inputBase`.
4. **Wrong control for toolbars and filters.** FormSelect is used where a filter chip or a menu belongs: the ticket header toolbar (`TicketHeaderControls.tsx:62-95`, "Move to…" is an action) and the UsersTable and ErrorLogTable filter bars. Use FilterDropdown's filter look.
5. **Small leftovers:**
   - The trigger class `serene-select-trigger` is defined nowhere.
   - The trigger's text is weight 500 while fields are 400.
   - The card-secret textarea lost its mono font.
   - The trigger's value is not announced.

---

## 7. The leverage list: shared changes that remove most findings

1. **Error and 404 pages** in the shell, plus a global error page (P1 #1).
2. **Global CSS safety nets** in one place:
   - `accent-color` on native controls
   - the scrollbar rule applied globally
   - number spinner reset
   - `b, strong { font-weight: var(--weight-semibold) }`
   - 16px field text on touch devices
   - `overscroll-behavior: contain` on scroll areas
3. **The bell on every page:** PageControls in every title row, or one bell in the shell.
4. **One strip for every list:** a `framed` option on FilterBar, so no list page can forget it.
5. **A loading screen for every route:** each record, nested and mobile route gets its own, in its own shape.
6. **Keyboard-openable lists:** a link in the name cell of every table.
7. **Page titles:** a template in the root layout and one line per page.
8. **Three missing primitives:** `ui/Checkbox`, a month mode on DatePicker, FormSelect with `name` and option groups. Then retire the native date inputs and Field `Select`.
9. **One way to make a field:** move the hand-built task, settings and vendor fields onto `Field` (Input, Textarea), and delete the 17 `onFocus` style writers.
10. **Button as a link:** an `href` on Button for header CTAs.
11. **Motion defaults:**
    - a critically damped `SPRING_CONFIG`
    - `isPending` exposed by `useUrlFilters`
    - Carousel drag with velocity
    - near-bottom sticking for every chat
    - Dialog's overlay exit fixed once
12. **Dark mode fixes:**
    - a real `--neu-surface-high` step
    - dark ink for `-fg` on warning and success fills
    - the hand-written highlights replaced with tokens
    - the SeedMandala in the sidebar
13. **Screen-reader plumbing:** toasts with always-mounted live regions; Toggle with `aria-*` props.

---

## 8. What already works well

- **Tokens.** One stray hex in 523 files; every literal in the neumorphic root has a dark twin; charts
  re-read colours on theme and mode changes; `dvh` everywhere; every table is scroll-wrapped.
- **Primitives.** Tailwind's reset plus the shared components mean no grey OS button, no default link,
  no native dialog anywhere.
- **Modals.** `useModalFocus` gives every dialog, sheet, palette and panel a focus trap, Escape and focus
  return.
- **Empty states.** EmptyState is in 115 files, with page icons and the mark for an all-clear;
  "No data available" never appears.
- **Deletes.** Heavy deletes use ConfirmDialog; light ones use Undo with a visible countdown. There are
  no `window.confirm` calls.
- **Feel.**
  - The tooltip timing (a 500ms delay and instant reshow) is well judged.
  - SiaChat sticks to the bottom only when you are near it and shows a "new messages" pill.
  - Task completion is optimistic with rollback.
  - The ticket board has a proper drag overlay.
  - The mobile drawer and sheets exit along the path they came in on.
  - Dashboard drags track 1:1.
- **Focus.** The shared focus colour clears 3:1 in every theme and mode; Button's keyboard outline
  cannot be overridden by inline styles; touch devices get a 44px minimum on actions.
- **Filters and layout.** The filter bar collapses to one scrolling row on phones, and the dossier grid
  stacks below `lg`.

---

## 9. Recommended next steps (Impeccable commands)

1. **[P1] `/impeccable harden`:**
   - error and 404 pages
   - honest failures (outage vs not found)
   - confirmations on the three one-tap destructive actions
   - toast live regions
   - the build-breaking duplicate keys
2. **[P1] `/impeccable adapt`:**
   - the Books and member overflows
   - Add subtask under the Elaya button
   - safe areas
   - mobile loading states
   - the Carousel swipe
   - touch targets
3. **[P1] `/impeccable polish`:**
   - the native fallbacks (checkboxes, date pickers, select popups, scrollbars, tooltips, number spinners)
   - the missing bell and filter strips
   - the header CTAs
   - the list-skeleton routes
4. **[P2] `/impeccable animate`:**
   - the critically damped spring
   - Dialog exit and sheet paths
   - filter and tab echo
   - Elaya's scroll
   - the reduced-motion fallbacks
   - the check-draw duplicate
5. **[P2] `/impeccable layout`:** card corners, section titles, skeleton shapes, the phone subtask rows.
6. **[P2] `/impeccable clarify`:**
   - the raw Zod message
   - "No data yet."
   - environment variable names on Books
   - the Team / User Management / Add Member naming
   - one rule for detail-page dots
7. **[P3] `/impeccable typeset`:** text under 11px, the tracking and leading tokens, hidden bold.
8. **`/impeccable polish`:** a final pass once the above are in.

Re-run the audit after the fixes to see the score move.
