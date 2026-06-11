# Eia — Changelog

<!-- markdownlint-disable MD013 MD024 MD026 MD033 -->

All notable changes to the Eia platform are recorded here in reverse chronological order.

---

## 2026-06-12 — Sidebar logo links to dashboard

- **`Sidebar` logo is clickable:** the Eia mark in the sidebar header is wrapped in a `Link` to `/dashboard` with an `aria-label` and a subtle hover opacity fade.

**Files:** `src/components/layout/Sidebar.tsx`.

---

## 2026-06-12 — Leads table: status summary chips removed

- **Toolbar status pills removed from `LeadsTable`:** the per-status count chips (New · Touched · In Discussion · …) in the table toolbar are gone, along with the dead plumbing — the `statusCounts` prop on `LeadsTable`, the pass-through in `LeadsTableAsync`, and the unused `count` prop on the private `StatusBadge` (row status pills unchanged).
- **Service untouched:** `getLeadsByRole` still calls `get_leads_status_counts` and returns `statusCounts` — the RPC is how `totalCount` is derived (perf audit C-1), not chip-only work.
- **Verification:** `tsc --noEmit` clean.

**Files:** `src/components/leads/LeadsTable.tsx`, `src/components/leads/LeadsTableAsync.tsx`.

---

## 2026-06-12 — Responsive: /admin/users card row wraps (audit miss)

- **`UsersTable` `UserCard` wraps:** the member row was a non-wrapping flex with ~340px of unshrinkable fixed-basis zones (role pill, `0 0 120px` domain, `0 0 80px` status, edit link) — content clipped inside the card below ~840px and the row was unusable on phones. The §3.7 "card-list pages … mostly degrade fine" finding was stale for this one. Now `flexWrap: wrap` (row gap `--space-3`), domain zone `0 0 auto` + `minWidth: 100px`, and the Edit link gets `.eia-touch` (≥40px under coarse pointers). Same convention as the F2 `DealCard`/`AgentSettingsTable` fixes; desktop single-line layout unchanged.
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/components/admin/UsersTable.tsx`, `docs/audits/2026-06-responsive-audit.md`.

---

## 2026-06-12 — Ad-spend foundation (/budget), domain targets + radial meter, agent Today-view upgrades

Three-phase build: (A) Meta ad-spend ingestion + `/budget` page, (B) founder-set monthly domain targets with a radial deals-vs-target meter on the Domains tab, (C) agent performance Today-view upgrades (calls new-vs-old split, 14-day trend, deals revenue, recent-activity load-more). Dashboard widgets deliberately NOT started (separate brief).

### Phase A — ad spend

- **Migration 0104 `ad_spend_daily`:** day-grain spend rows, `UNIQUE(campaign_key, spend_date, source)`, `campaign_key` carries the same lowercase+trim CHECK as `ad_creatives` (0012). RLS: manager+ read, admin/founder write. `update_updated_at()` reused.
- **Migration 0106 `get_budget_summary(p_date_from, p_date_to)`:** one row per campaign with spend in the period, LEFT-joined to lead counts (`created_at` cohort, `lower(trim(utm_campaign))` join) and deals (count + revenue by `won_at` through `deals.lead_id`). Spend dates filtered on IST calendar days (`AT TIME ZONE 'Asia/Kolkata'`). Scope-param tier — EXECUTE revoked, admin-client only (Q-13).
- **`normalizeCampaignKey()` extracted into `lib/utils/campaigns.ts`** — THE campaign-key normalisation; `upsertAdCreative` and the entire spend pipeline now share it (R-03 — no fork; a fork here silently orphans spend from leads).
- **`lib/utils/ad-spend-parse.ts` (new, CLIENT-SIDE ONLY):** `parseMetaSpendFile(file)` — dynamic `xlsx` import (same rule as `export.ts`), column whitelist (Reporting starts/ends, Campaign name, Results, Amount spent (INR), Impressions, Reach, Link clicks; rest discarded). **THE grain guard:** any row with `Reporting starts !== Reporting ends` rejects the ENTIRE file with an instructional "re-export with Breakdown → By time → Day" error — a range-grain file accepted once would double-count forever. Zero-spend rows skipped; duplicate (campaign, day) rows merged (upsert can't hit one conflict key twice).
- **`uploadAdSpendAction` (`lib/actions/ad-spend.ts`):** Zod (`uploadAdSpendSchema`) → `requireProfile(['admin','founder'])` → server-side re-sanitize + re-normalise → upsert on the unique key → `{ inserted, updated, skipped }` toast summary. Re-uploading the same CSV changes zero values (idempotent on the key).
- **`/budget` page:** canonical list layout; reuses `PerformanceFilters` (IST period presets + custom range, URL-driven), `Table<T>` (sanctioned RPC-result grid), `StatTile` cells for the totals strip (spend, leads, CPL, deals, CPD, revenue — CPL/CPD render "—" at zero denominators), `EmptyState`. Upload button (admin/founder) → `next/dynamic` modal (`useMountOnFirstOpen`) with parse preview. **No Redis** — always-live reads like `/campaigns`. Access: manager read + admin/founder upload; `/budget` added to `DOMAIN_ROUTE_MAP` (Gia domains + marketing) and the Sidebar Analytics section (manager+). *Note: manager read access is the working default per the RLS spec — flag if spend should be admin/founder-only.*

### Phase B — domain targets

- **Migration 0105 `domain_targets`:** `UNIQUE(domain, metric, period)`, metric CHECK `('deals_closed')`, period CHECK `('month')`. RLS: all-authenticated read, admin/founder write. Nothing seeded — founders enter targets via the card edit affordance.
- **Migration 0107:** `get_domain_health_metrics` extended (not a new RPC) with `total_deals` — COUNT from `public.deals` by `won_at`, same source/date-field as `total_revenue` (0076). 0102 revoke posture re-applied after the DROP/recreate.
- **Domain cards (`DomainOverviewPanel`):** four stats (Leads, Calls, Deals Closed, Revenue) + **radial deals-vs-target meter** (`DomainTargetMeter` — Recharts `RadialBarChart` via `useChartTokens`, 2 colours). The meter is **month-pinned**: always this-month deals vs the monthly target, independent of the period filter (page reuses the period fetch when it IS this_month — no double RPC). Target 0/unset → serif-italic "No target set." (`EmptyState` inline) — no division crash. Founder/admin pencil → inline input → `upsertDomainTargetAction` (Zod → `requireProfile` → upsert via `domain-targets-service`).
- **Mobile:** below `md` the card grid becomes a CSS scroll-snap carousel (`snap-x snap-mandatory`, full-width slides) — no library.

### Phase C — agent view

- **Migration 0108 `get_agent_today_pulse(p_today_start, p_date_from, p_date_to)`:** SELF-SCOPED (`auth.uid()`, GRANT authenticated — 0101 pattern). Returns calls-today split new-vs-old (call notes joined to lead `created_at`; new+old partitions the same row set so the split always sums to the total), 14-day daily call counts (IST day boundary passed in from `lib/utils/ist` — never re-forked in SQL), and period deals count + revenue from `public.deals` by `won_at`. Date-field asymmetry untouched: the existing `get_agent_performance` core (leadsWon/conversion by `status_changed_at`, touch by `created_at`) is not modified.
- **Recent lead activity:** `getAgentLeadActivityPage` (performance-service) — keyset "load more" on `lead_activities` scoped to the agent's leads, **composite cursor `(created_at, id)`** per the composite-cursor rule, page 15, served by `getAgentRecentLeadActivityAction` (agent id always from the verified profile). Button, not infinite scroll.
- **`AgentPerformanceShell` Today tab:** Calls Today hero now shows the literal since-IST-midnight pulse count with new/existing split chips; new `AgentCallTrendChart` (composes `ChartFrame` + `cartesianDefaults`, `next/dynamic` per the Recharts splitting rule); Revenue card (period deals count + amount) joins the pipeline row; `AgentRecentActivityList` below. Pulse fetched only while the Today tab is visible. Manager roster pinning (`get_user_domain()`) untouched.

### Sign-off

`pnpm tsc --noEmit` clean; `check:tokens` clean. Idempotent re-upload (unique-key upsert), range-grain rejection (whole-file, instructional message), 0-target meter renders "No target set." with no division, new+old split is a partition of total calls today (SQL FILTER on the same row set).

**Files:** `supabase/migrations/202606120001{04,05,06,07,08}_*.sql`, `src/lib/utils/{campaigns,ad-spend-parse}.ts`, `src/lib/validations/ad-spend-schema.ts`, `src/lib/services/{ad-spend-service,domain-targets-service,performance-service}.ts`, `src/lib/actions/{ad-spend,ad-creatives,performance}.ts`, `src/app/(dashboard)/budget/*`, `src/components/budget/*`, `src/components/performance/{DomainOverviewPanel,DomainTargetMeter,AgentCallTrendChart,AgentRecentActivityList,AgentPerformanceShell}.tsx`, `src/app/(dashboard)/performance/{page,FounderPerformanceShell}.tsx`, `src/components/layout/Sidebar.tsx`, `src/lib/constants/route-permissions.ts`, `src/lib/types/index.ts`, docs.

---

## 2026-06-12 — Responsive: /performance manager/founder two-pane fix (audit miss) + V-14 codified

- **`ManagerPerformancePanel` two-pane stacks `<md`:** the Agents view (manager + founder) was a fixed `268px` roster + `flex: 1` detail row at every width — the one §3.7 surface the audit missed. Now `flex-col items-stretch md:flex-row md:items-start`, roster `w-full md:w-67` (268px). `AgentDetailPanel` stats row + skeleton wrap (`flexWrap` + `StatAtom` `flex: 1 1 140px` — 2×2 below ~600px container, 4-up desktop; container-driven, no breakpoint).
- **Rules codification (V-14):** the responsive contract is now in the constitution, not just the decision log — `The_Rules.md` §5 V-14 (points at D-1…D-5 + the audit; code-level invariants: `useMediaQuery`/`MQ`, shared primitives, column counts in classes only, `dvh`, persisted layouts never drive narrow rendering), five new §8 Never-Do lines, and a Decision Log row. DESIGN-DNA already carried the implementation contract (§9, added in phase 1); `.cursorrules` re-synced to `CLAUDE.md`.
- Also fixed in passing: the two new `src/components/budget/` upload components failed `tsc` (`iconLeft={Upload}` lucide typing quirk) — applied the codebase's established `as LucideIcon` cast (same as `LeadWhatsAppCard`).
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/components/performance/{ManagerPerformancePanel,AgentDetailPanel,StatAtom}.tsx`, `src/components/budget/{AdSpendUploadButton,AdSpendUploadModal}.tsx`, `docs/rules/The_Rules.md`, `docs/audits/2026-06-responsive-audit.md`, `.cursorrules`.

---

## 2026-06-12 — Mobile nav: dark top strip removed, floating brand-mark trigger on the title line

The mobile (< md) drawer trigger no longer lives in a dark `--theme-sidebar-bg` strip with a wordmark. The strip element is now a zero-flow floating anchor: a single 40px hamburger button floats over the full-bleed paper, vertically aligned with the page `<h1>` — trigger and title share one line.

- **`Sidebar.tsx`:** logo `<img>` dropped; the trigger renders **only on primary nav pages** (`MOBILE_TRIGGER_PATHS` — MAIN/ANALYTICS nav hrefs + `/admin/users`, `/admin/ad-creatives`, `/settings`, `/profile`). Detail pages (`/leads/[id]`, `/tasks/[id]`, …) get no hamburger — their `BackButton` occupies the same top-left corner and is the affordance there.
- **`globals.css`:** `.eia-mobile-topbar` becomes `position: absolute` (top/left `--space-4` + safe-area inset, `--z-raised`) inside a now-`relative` `.eia-shell`. A general-sibling rule `.eia-mobile-topbar ~ .eia-shell-gutter .type-page-title { margin-left: 52px }` indents page titles to clear the trigger — and only fires when the trigger is actually mounted. New `.eia-mobile-trigger` class: soft theme-tinted circle — 7% accent-washed `--theme-paper` bg, 16% accent hairline border, `--shadow-1` (no decorative orbs; a flat wash). Derives from `--theme-accent`, so it follows the user's chosen theme. The glyph inside is the brand mark (`/logo.webp`, 34px) rather than a Lucide `Menu` hamburger. `eia-pressable` press feedback.
- Works on every primary page including WhatsApp (its rail `<h1 class="type-page-title">` at `pt-4 pl-4` matches the geometry) and the dashboard greeting. Drawer/backdrop behaviour unchanged.
- **`/profile`:** title "Profile Settings" → "Profile" (metadata too), and its inline `style={{ margin: 0 }}` replaced with the `m-0` class — inline margin beat the stylesheet indent, so the trigger overlapped the title on that page.

**Files:** `src/components/layout/Sidebar.tsx`, `src/app/globals.css`, `src/app/(dashboard)/profile/page.tsx`.

---

## 2026-06-12 — PWA: installable home-screen app (manifest, icons, offline-shell service worker)

Eia is now installable on Android and iOS as a standalone home-screen app — the web app itself, no second codebase, no behaviour change. Web push is explicitly out of scope (separate brief: needs a subscription table + send path).

- **Manifest:** `src/app/manifest.ts` (Next 16 native convention → served at `/manifest.webmanifest`, auto-linked). Name/short_name "Eia", `display: standalone`, `start_url: /dashboard` (→ `/login` via the existing layout guard when signed out). Theme/background colour `#0d0c0a` — hardcoded hex is sanctioned in manifest.ts, the viewport `themeColor`, and offline.html only, because none of the three can read CSS vars; each carries a comment pinning it to the Earth `--theme-canvas` token.
- **Icons:** generated from the gold brand mark (cropped out of `public/logo-light.avif`) composited on the Earth canvas — `public/icons/icon-{192,512}.png` (purpose any, mark at 74%) + `icon-maskable-{192,512}.png` (mark at 56%, inside the 80% safe zone) + `src/app/apple-icon.png` (180px, Next file convention emits the apple-touch-icon link; the manual `icons.apple: /logo.webp` metadata entry removed).
- **Service worker:** `public/sw.js` — offline fallback shell ONLY. Intercepts GET `mode: navigate` requests exclusively, network-first with `public/offline.html` as the catch fallback; the response itself is never cached. Server Action POSTs, RSC payloads/prefetches, and static assets pass through untouched — **the SW must never cache role-scoped data** (a cached page replayed to another user on a shared device is the failure mode this rule exists for). `skipWaiting` + `clients.claim` on every install so a deploy never leaves a stale SW locked in. Registered by `src/components/layout/ServiceWorkerRegistration.tsx` (root layout, production-only — a SW in dev fights HMR).
- **iOS:** `appleWebApp` metadata (capable, title "Eia", `black-translucent` status bar over the dark canvas) + `viewport.themeColor` in the root layout.
- **Proxy:** matcher now excludes `manifest.webmanifest`, `sw.js`, `offline.html`, `icons/`, `apple-icon` — the PWA surface is fetched by the browser outside any auth context and must never route through session refresh (same rationale as the webhook bypass).
- **Verification:** `tsc --noEmit` clean, `next build` clean (`/manifest.webmanifest` + `/apple-icon.png` emitted static). Device install pass (Android + iOS: standalone launch, login, Server Action mutation, theme persistence, post-deploy SW refresh) pending hardware.

**Files:** `src/app/{manifest.ts,layout.tsx,apple-icon.png}`, `public/{sw.js,offline.html,icons/*}`, `src/components/layout/ServiceWorkerRegistration.tsx`, `src/proxy.ts`, `src/app/CLAUDE.md`, `docs/operations/pwa-install-guide.md` (plain-English team install guide).

---

## 2026-06-12 — Voice dictation in CalledModal (pure composition)

The call-log modal's Note field gets the same mic cluster as the dossier note composer — zero new services or actions. `useAudioRecorder` + `transcribeAudioAction` reused exactly as-is; the transcript appends to the textarea as an editable draft and saves through the unchanged `addLeadCallNote` path.

- **`CalledModal`:** mic/stop + discard buttons and the `m:ss / 2:00` counter sit in the Note label row; both footer buttons (`Log Update`, `Log Update + Task`) are disabled while recording or transcribing. Mid-recording close (Escape/backdrop) is safe: the modal is conditionally rendered by `StatusActionPanel`, so closing unmounts it and `useAudioRecorder`'s unmount cleanup discards the take and releases the mic track — same guarantee as tab-close.
- **`useAudioRecorder`:** now exports the shared display pieces — `formatRecorderElapsed()` and `DEFAULT_MAX_RECORDING_MS` — imported by both `LeadNotesInput` and `CalledModal` instead of per-consumer copies.
- **Verification:** `tsc --noEmit` clean.

**Files:** `src/components/leads/{CalledModal,LeadNotesInput}.tsx`, `src/hooks/useAudioRecorder.ts`, `src/components/leads/CLAUDE.md`, `docs/pages/lead-dossier.md`.

---

## 2026-06-12 — Voice notes: mic dictation on the lead dossier (Deepgram transcription layer)

Mic option in the `/leads/[id]` note composer: record → server-side transcription → transcript drops into the textarea as an **editable draft** → saves through the unchanged `addLeadNote` path. Built as reusable speech-to-text infrastructure (the foundation seam for Lia's voice channel), not a notes gadget. **Audio is transcribed in-memory and discarded — never stored** (D-01 carve-out logged in `docs/design/decision-log.md`: raw audio to Deepgram under no-training/zero-retention API terms — audio cannot be pseudonymised).

- **`src/lib/services/transcription-service.ts` (new, server-only):** `transcribeAudio(audio, mimeType)` — THE Deepgram call site. Nova-3 with `language=multi` (Hinglish code-switching). Plain `fetch`, no SDK dependency. `DEEPGRAM_API_KEY` env var (added to `.env.example`); throws on failure for the action layer to map.
- **`src/lib/actions/transcription.ts` (new):** `transcribeAudioAction(formData)` — Zod first (`TranscribeAudioSchema`, new in `lib/validations/transcription-schema.ts`: Blob, ≤ 3 MB, audio-type check), then `requireProfile()`, then the service. Returns `{ data: { text }, error }`; writes nothing. New `formErrors.audio*` / `transcriptionFailed` copy.
- **`src/hooks/useAudioRecorder.ts` (new):** THE MediaRecorder hook — `isTypeSupported` codec negotiation (Chrome webm/opus → Safari mp4/aac → Firefox ogg/opus; the actual MIME travels with the blob, never hardcoded), 32 kbps bitrate hint, 2-minute auto-stop, elapsed ticker, guaranteed mic-track release on stop/cancel/unmount.
- **`LeadNotesInput`:** footer mic button (renders only when `MediaRecorder` is supported). Recording state: danger dot + mono `m:ss / 2:00` counter, stop (→ transcribe) and × (discard) buttons; transcribing state: spinner + label. Transcript appends to existing draft text; errors surface in the composer's existing error line. Never auto-submits.
- **`next.config.ts`:** `Permissions-Policy` header `microphone=()` → `microphone=(self)` (the old value blocked the app's own mic); `experimental.serverActions.bodySizeLimit: '4mb'` (Safari AAC can exceed the 1 MB default at the 2-minute cap; schema still rejects > 3 MB).
- **Sign-off:** `tsc --noEmit` clean. No new write path to `lead_notes`; Deepgram key never reaches a client bundle; audio never persisted.

**Files:** `src/lib/services/transcription-service.ts`, `src/lib/actions/transcription.ts`, `src/lib/validations/{transcription-schema,form-errors}.ts`, `src/hooks/useAudioRecorder.ts`, `src/components/leads/LeadNotesInput.tsx`, `next.config.ts`, `.env.example`, `CLAUDE.md`, `src/lib/CLAUDE.md`, `src/components/leads/CLAUDE.md`, `docs/pages/lead-dossier.md`, `docs/design/decision-log.md`.

---

## 2026-06-12 — Responsive F5: Dialog bottom sheet, auth 320px pass, touch-target sweep

Final follow-up phase from the responsive audit (`docs/audits/2026-06-responsive-audit.md` §3.6/§3.8). All five follow-up phases (F1–F5) are now closed.

- **`Dialog` becomes a bottom sheet `<md`** (DNA R-06 — one change in `Dialog.tsx` serves every modal that composes `modal.tsx`/`Dialog`): the overlay docks the panel to the bottom edge (`items-end`, no gutter) below md and stays the centered dialog with the `space-4` gutter from md up; the panel gets top-corner-only `--radius-xl` rounding, a `90dvh` max-height, and `env(safe-area-inset-bottom)` padding below md. The enter/exit animation contract (scale+fade via `ENTER_DURATION`/`EXIT_DURATION`) is untouched; `size="full"` behaviour unchanged.
- **Auth 320px pass:** all four `.eia-auth-card` surfaces (login, forgot-password, update-password form + invalid-link card) ease horizontal padding `px-6 sm:px-8` (was fixed `--space-8`); the 26rem card + `mx-4` already fit 320 — content width goes from 224px to 240px at 320.
- **DNA §12 44px touch-target sweep** via the existing `.eia-touch` class (≥40px under coarse pointers only, desktop chrome unchanged): `Dialog` close ×, `SubTaskModal` header icon buttons, `Calendar` month prev/next, `AgentSettingsTable` work-day chips (26px) + clear-shift button (28px). (CSS `min-width/min-height` beats the inline `width`, so visual size is unchanged on fine pointers.)
- Deferred, unchanged: the DNA R-05 "filters move to a sheet" exploration — the F1-shipped `FilterBar` scroll row remains the mobile filter UX; revisit only with a real usability signal.
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/components/ui/{Dialog,Calendar}.tsx`, `src/components/tasks/SubTaskModal.tsx`, `src/components/settings/AgentSettingsTable.tsx`, `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/forgot-password/forgot-password-form.tsx`, `src/app/(auth)/update-password/{page,update-password-form}.tsx`, `docs/audits/2026-06-responsive-audit.md`, `CLAUDE.md`, `src/components/CLAUDE.md`.

---

## 2026-06-12 — Responsive F4: Tasks — board rail, SubTaskModal stacking, modal grids, calendar stack

Follow-up phase F4 from the responsive audit (`docs/audits/2026-06-responsive-audit.md` §3.5).

- **Board → snap-scroll rail `<lg`:** new `.eia-board` class (globals.css, canonical `--bp-lg` query): below lg the 5 columns become a horizontal `grid-auto-flow: column` rail (`grid-auto-columns: min(78vw, 260px)`, `scroll-snap-type: x mandatory`, touch momentum); from lg up `repeat(5, minmax(180px, 1fr))` with container (never body) scroll as the fallback at tight lg widths. The inline `repeat(5, 1fr)` + per-column `minWidth: 180px` (≈900px forced body overflow below ~960px) is gone.
- **Add-subtask panel:** FAB stack is `bottom-4 left-4 right-4 md:bottom-8 md:left-auto md:right-8` + safe-area inset; the panel is `w-full md:w-80` — full-width sheet `<md`, the same 320px card at `md+`.
- **SubTaskModal:** `height: 90vh → 90dvh`; the wrapper's fixed `left: 240px` sidebar offset (off-screen modal at phone widths, wrong at the md icon-rail too) → `left-0 lg:left-60`; the `38% 62%` two-zone grid stacks into one scrolling column `<md` — zone placements moved from inline `gridColumn/gridRow` to `md:col-start-*/md:row-start-*` classes, action icons `order-first` in the mobile column (close stays at top), Zone B fixed at `60dvh` so the remarks timeline scrolls internally and the composer stays reachable.
- **CreateGroupTaskModal:** the Domain/Priority/Due row and the Appearance (colour+icon) row stack below `sm` (`grid-cols-1 sm:grid-cols-2/3`).
- **MyTasksCalendarView:** the 280px sticky calendar + list flex row stacks `<md` (`flex-col md:flex-row`, calendar `w-full md:w-70 md:sticky`). Calendar day cells already render at 44px height when `taskDots` is present — tap targets pass.
- **Padding ladder:** `/tasks` page + loading + `/tasks/[id]` moved to `p-4 sm:p-6 lg:p-8`.
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/app/globals.css`, `src/components/tasks/{GroupTaskWorkspace,SubTaskModal,CreateGroupTaskModal,MyTasksCalendarView}.tsx`, `src/app/(dashboard)/tasks/{page,loading}.tsx`, `src/app/(dashboard)/tasks/[id]/page.tsx`, `docs/audits/2026-06-responsive-audit.md`.

---

## 2026-06-12 — Responsive F3: WhatsApp single-pane mode

Follow-up phase F3 from the responsive audit (`docs/audits/2026-06-responsive-audit.md` §3.4) — the split-pane was unusable on phones (320px rail + ~0–55px chat pane at 375).

- **Single-pane mode `<md`** (`useMediaQuery(MQ.mobile)` in `WhatsAppShell` — a genuine behaviour branch, per D-1): the shell renders the list **or** the active conversation, never both. Selecting a conversation swaps to the full-width panel; a new `onBack` prop on `ConversationPanel` (40×40 `ArrowLeft` button, `.eia-pressable`) returns to the list by clearing the existing `activeConversationId` state. Desktop split-pane unchanged (back button not rendered).
- **Fixed 320px rail assumption killed:** rail is `w-full md:w-80` (`w-80` = 320px, same value as the old constant) with rail padding on a `pt-4 pl-4 md:pt-8 md:pl-8` ladder; `ConversationPanel` header padding likewise `px-4 py-4 md:px-8 md:pt-8 md:pb-5`.
- **Safe-area inset (DNA R-02):** both composer wrappers (MessageBar + resolved banner) get `paddingBottom: calc(… + env(safe-area-inset-bottom, 0px))` — applied at the viewport-bottom wrapper in `ConversationPanel`, not inside the `MessageBar` primitive (which also lives mid-page in the lead dossier where the inset would be wrong).
- **`whatsapp/loading.tsx`** mirrors the shell: full-width list skeleton `<md`, right-pane skeleton `hidden md:flex`.
- Tap targets: conversation rows already exceed 44px (avatar + two text lines + `--space-3` vertical padding); back button is 40×40.
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/components/whatsapp/{WhatsAppShell,ConversationPanel}.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`, `docs/audits/2026-06-responsive-audit.md`.

---

## 2026-06-12 — Responsive F2: detail grids + analytics surfaces

Follow-up phase F2 from the responsive audit (`docs/audits/2026-06-responsive-audit.md` §3.7) — performance, campaigns, settings, admin, deals.

- **`.eia-dossier-grid` adoption (D-5):** `/profile`, `/admin/users/[id]`, and `NewUserClient` (`/admin/users/new`) drop their inline `minmax(0,1fr) 340px` grids for the shared class + a new `--340` modifier (lg+ only; single column `<lg`). One class, one variant — no second grid class forked.
- **Founder performance:** `DomainOverviewPanel` domain cards and the `FounderPerformanceShell` Domains-tab skeleton go `grid-cols-1 md:grid-cols-2` (was fixed `repeat(2, 1fr)` at all widths).
- **Agent performance:** `CoreFourGrid` KPI row → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (was a non-wrapping flex row — 4 sparkline cards at ~85px each on a phone); `EffortGrid` → `grid-cols-2 lg:grid-cols-4`; `KpiRowFallback`/`MetricsSkeleton` mirror the same shapes; Today-tab hero pair stacks `<sm` and the pipeline count row wraps (`flex: 1 1 140px`).
- **Campaign metrics strip (bug fix):** the strip's inline `gridTemplateColumns: repeat(2, 1fr)` was overriding its own `md:grid-cols-3 lg:grid-cols-6` classes — the strip rendered 2-wide at **every** width, including desktop. Column count now lives in classes only (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`); same fix in `CampaignMetricsStripSkeleton`.
- **Deals:** `DealsSummaryStrip` becomes a 2×2 grid `<sm` (dividers hidden) and the flex strip at `sm+`; `DealCard` zones wrap (`flexWrap` + left zone `1 1 180px`) instead of overflowing the card at phone widths.
- **Settings:** `AgentSettingsTable` shift-controls group `flex: 0 0 auto` → `1 1 auto` + `minWidth: 0` — it could never shrink below its ~500px single-line width, clipping the card `<md`. The surface is already a card list (the audit's "real `<table>`" note was stale), so D-2's card-stack requirement is satisfied structurally; no table/stack toggle needed.
- **Padding ladder:** every §3.7 page + `loading.tsx` moved to `p-4 sm:p-6 lg:p-8` — settings, performance (all three role mains), campaigns (+`[id]`), deals, admin/users (+`[id]`, `new`), admin/ad-creatives. `/tasks` stays for F4.
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/app/globals.css`, `src/app/(dashboard)/{profile,settings,deals,campaigns,performance,admin}/…` pages + loading files, `src/app/(dashboard)/performance/FounderPerformanceShell.tsx`, `src/components/performance/{CoreFourGrid,EffortGrid,DomainOverviewPanel,AgentPerformanceShell}.tsx`, `src/components/campaigns/{CampaignMetricsStrip,CampaignMetricsStripSkeleton}.tsx`, `src/components/deals/{DealsSummaryStrip,DealCard}.tsx`, `src/components/settings/AgentSettingsTable.tsx`, `src/components/admin/NewUserClient.tsx`, `docs/audits/2026-06-responsive-audit.md`.

---

## 2026-06-12 — Responsive F1: dashboard widget interiors

Follow-up phase F1 from the responsive audit (`docs/audits/2026-06-responsive-audit.md`) — the dashboard surface at narrow widths.

- **Page chrome:** `/dashboard` page + `loading.tsx` moved onto the DNA padding ladder (`p-4 sm:p-6 lg:p-8`).
- **Canvas header wraps** (`flex-wrap` + `gap-y-3`): below ~md the greeting and the control cluster (date filter + Edit layout) stack instead of overflowing — the right cluster was `shrink-0` against a Playfair greeting.
- **`TabsList` scrolls on overflow (primitive-level, D-5):** the tray gets `maxWidth: 100%` + hidden-scrollbar `overflow-x: auto`. Triggers are nowrap, so an overflowing tray (e.g. the 5-chip Gia domain pickers in the campaign/volume/status widgets at ~340px) now scrolls inside itself instead of widening the widget. Consumers that deliberately squeeze triggers (`flex: 1, minWidth: 0` — the volume widget's domain picker) never overflow and are unaffected. Every `Tabs` consumer app-wide inherits this.
- **Lead Pipeline stat chips:** `repeat(5, 1fr)` → `repeat(auto-fit, minmax(88px, 1fr))` and the chip label loses its `nowrap` — 5-up on a desktop half-width widget, 3+2/2-up as the widget narrows; previously the nowrap labels clipped below ~480px of widget width.
- Audited and left alone: widget list rows (AgentTasks/AgentActivity) and the volume header already carry correct `minWidth: 0` + ellipsis guards; the persisted bento layout already degrades by breakpoint.
- **Verification:** `tsc --noEmit` clean, `next build` clean.

**Files:** `src/app/(dashboard)/dashboard/{page,loading}.tsx`, `src/components/dashboard/DashboardCanvas.tsx`, `src/components/ui/TabSelector.tsx`, `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx`, `docs/audits/2026-06-responsive-audit.md`.

---

## 2026-06-12 — Responsive phase 1: audit + foundation + responsive shell + /leads reference implementation

Eia was desktop-only in practice — only 10 component files used a responsive Tailwind prefix, the Sidebar was an unconditional 240px flex child, and the DNA-sanctioned mobile sidebar overlay (V-06) didn't exist in code. This phase ships the full audit, the shared foundation, and shell + `/leads` as the reference implementation. **Audit + per-surface follow-up plan (F1–F5): `docs/audits/2026-06-responsive-audit.md`. Implementation decisions D-1–D-5: `docs/design/decision-log.md`.**

- **Audit:** every surface walked at 375/768/1280/1536+ and 200% zoom against DNA §2.7/§9/§12; fixed-width, raw-`matchMedia`, and arbitrary-breakpoint greps catalogued. Key call: the law existed, the implementation didn't — gap analysis, not new law.
- **Foundation:**
  - `src/hooks/useMediaQuery.ts` — **THE viewport/media-condition hook** (`useMediaQuery(query)` + canonical `MQ.mobile / MQ.tabletDown / MQ.touch` strings; `useSyncExternalStore`, SSR snapshot `false`). `toast-provider.tsx` migrated off its raw `matchMedia("(max-width: 767px)")`.
  - `src/lib/utils/scroll.ts` implemented for real — it was a `throw new Error("Not implemented")` stub despite being in the registry. `scrollToBottom(el)` and `lockBodyScroll(): () => void` (re-entrant, returns unlock).
  - `body` `min-height` 100vh → **100dvh** (DNA R-01); bento-grid + dashboard-loading arbitrary `@media (max-width: 820px)` normalised to md (DNA §9.1); `--bp-*` token block annotated documentation-only (CSS vars can't appear in `@media` preludes); `.type-page-title` is now fluid — `clamp(var(--text-xl), 1.05rem + 1.6vw, var(--text-2xl))`, the only fluid type tier (D-4).
- **Shell (D-3):** `(dashboard)/layout.tsx` moved onto `.eia-shell / .eia-shell-gutter / .eia-shell-paper` classes (globals.css "RESPONSIVE SHELL" section). Sidebar gains three modes — 240px full (`lg+`), 64px icon rail with `title` tooltips (`md`), off-canvas drawer + sanctioned blur backdrop + mobile top strip with hamburger (`<md`). Drawer: transform/visibility only, Escape + backdrop + route-change close, `lockBodyScroll` while open, reduced-motion gated. Layout-critical Sidebar styles moved from inline to classes so the rail media query can override them.
- **/leads (reference implementation, D-2/D-5):** page + dossier + both `loading.tsx` on the DNA padding ladder (`p-4 sm:p-6 lg:p-8`); table toolbar wraps instead of clipping; toolbar buttons get `.eia-touch` (≥40px under coarse pointers); **card stack below `md`** inside `LeadsTable.tsx` (`hidden md:block` table / `md:hidden` cards — name+status header, phone, assignee·received, same `?from=` href, ≥44px rows, ignores stored column prefs by design); empty-state copy extracted to one shared `LeadsEmptyCopy`; dossier two-column grid → shared `.eia-dossier-grid` (single column `<lg`).
- **Verification:** `tsc --noEmit` clean, `next build` clean, `check:tokens` clean.

**Files:** `docs/audits/2026-06-responsive-audit.md` (new), `src/hooks/useMediaQuery.ts` (new), `src/lib/utils/scroll.ts`, `src/app/globals.css`, `src/styles/design-tokens.css`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/ui/toast-provider.tsx`, `src/components/dashboard/DashboardCanvas.tsx`, `src/app/(dashboard)/dashboard/loading.tsx`, `src/app/(dashboard)/leads/{page,loading}.tsx`, `src/app/(dashboard)/leads/[id]/{page,loading}.tsx`, `src/components/leads/LeadsTable.tsx`, `docs/design/decision-log.md`, `CLAUDE.md`.

---

## 2026-06-12 — Performance + ad-creatives loading skeletons matched to their real pages

Both routes' `loading.tsx` files showed chrome that didn't match what loaded.

- **`/performance`:** `loading.tsx` rendered the *agent* shape (KPI/effort/outcome cards, no filter bar) for every role, so admin/founder/manager watched the wrong skeleton for the whole load before the roster view appeared. Flipped to the manager/founder shape — `PageHeaderSkeleton` + `FilterBarSkeleton` (sliders icon, agent search, Period chip) + `ManagerPerformanceSkeleton` — which also matches the in-page Suspense fallback, so the founder/manager skeleton-to-page handoff is now seamless. To keep agents from staring at that chrome for their full RPC wait, the agent branch in `page.tsx` no longer blocks on `getAgentPerformanceSummary` before painting: the fetch moved into an `AgentPerformanceAsync` subtree behind `<Suspense fallback={<PerformanceSkeleton />}>`, so agents flip to their correct skeleton as soon as the profile resolves (the header paints immediately too).
- **`/admin/ad-creatives`:** `loading.tsx` was stale — title+subtitle header shimmer, a bare search strip ("no paper chrome on this page"), and a 3-column 16:9 thumbnail grid, none of which exist anymore. Rewritten to mirror `AdCreativesManager`: canonical page header (`PageHeaderSkeleton` with Add Creative CTA), the paper `FilterBarSkeleton` (icon + search + count), and a vertical `gap-2` list of horizontal row cards (48×64 video thumb · title/subtitle · Edit/Delete button shimmers) via `SkeletonCard`.

**Files:** `src/app/(dashboard)/performance/loading.tsx`, `src/app/(dashboard)/performance/page.tsx`, `src/app/(dashboard)/admin/ad-creatives/loading.tsx`.

---

## 2026-06-12 — Profile page header brought onto the standard page layout contract

`/profile` was the only primary nav page with an eyebrow label ("Account") above its `<h1>` — the Standard Page Layout Contract (CLAUDE.md) defines the header as the page title + dot only. Eyebrow removed; header `marginBottom` aligned from `--space-8` to `--space-6` to match the contract's `mb-6`.

**Files:** `src/app/(dashboard)/profile/page.tsx`.

---

## 2026-06-11 — Brand palette v2: all five themes re-cut — softened nature accents, AA-compliant fills, Earth gets its cream paper

The first palette had poetry but failed arithmetic: **4 of 5 themes shipped primary buttons below WCAG AA** (white text on accent — Air 2.76:1, Water 3.32, Fire 3.67, Cosmos 3.95 against the 4.5 floor), and `--theme-accent-muted` was semantically inverted on the four non-Earth themes (a *light pastel* of the accent — 1.72–2.44:1 as `--theme-tab-pill-active-text`, illegible — where Earth's was a dark smoke at 4.87). Earth's paper was also pure `#ffffff` despite the DNA's "floating **cream** paper" philosophy. Every accent was re-cut on one rule: **hue stays (brand continuity), saturation drops (softness), lightness drops (strength + contrast)** — soft *surfaces*, strong *accents*. All ratios verified numerically, including the `color-mix` chip math.

- **Earth — champagne, not brass.** Accent `#d4af37` (S65) → `#c9a553` (S52) — old-gold/champagne, less green-brassy; hover `#a98741`; accent-fg `#0a0a0a` → `#201808` warm ink (7.5:1). Muted `#7a6b5d` taupe → `#665739` smoked bronze (keeps the gold's hue). **Paper finally cream:** `#ffffff/#f9f9f6/#e5e4df` → `#fcfbf6/#f5f2e9/#e7e2d4` — low-glare warm linen for 8–12h/day eyes. Text warms off neutral grey: primary `#211e17`, secondary `#6e675a`. Sidebar active/pill `#d6b46a` luminous champagne; active-bg `#211b0d`; canvas-glow + `--shadow-gold-shimmer` re-tuned to the new gold's rgb.
- **Air — slate blue with depth.** `#7b9fc4` (L63) → `#54769e` (H212 kept, S38→31, L63→47): white-text AA 2.76 → **4.71**. Hover `#425f85`, muted `#46596f` slate shadow, sidebar active `#9bb4d6`, pill `#54769e`. Text-secondary `#64748b` → `#5d6c84` (was 4.48 on paper — a hair under AA; now 5.02). `--color-neutral` follows (documented alignment).
- **Water — lagoon floor.** `#2a9d8f` → `#1e7d72` (hue 173 kept): AA 3.32 → **4.96**. Hover `#155f56`, muted `#35635c` kelp shadow, sidebar active `#54c2b4`, pill `#1e7d72`.
- **Fire — ember, not traffic cone.** `#e05c1a` → `#c25022` (H20→17, toward burnt sienna): AA 3.67 → **4.70**. Hover `#a23e15`, muted `#7f4527` cooling iron, sidebar active `#e8845c`, pill `#c25022`.
- **Cosmos — settled amethyst.** `#8b6fd4` → `#7a5fc0` (hue 257 kept, S54→43): AA 3.95 → **4.97**. Hover `#624aa4`, muted `#615484` dust lane, sidebar active `#ab95e4`, pill `#7a5fc0`.
- **Muted tier re-founded across all five themes** as "the accent standing in shadow" — dark, desaturated, same hue: tab-pill text now 4.85–4.98:1 on its chip wash (was illegible on 4 themes), secondary-button hover borders and scrollbar thumbs gain presence. All `--theme-accent-surface` / `--theme-canvas-glow` / sidebar rgba washes re-derived from the new accent rgbs (alphas unchanged ±0.01).
- **What deliberately did NOT change:** canvases (the atmosphere is right), non-Earth papers (their undertones are load-bearing), lead-status colours (psychological, theme-invariant by law), `--status-*-solid` dataviz tier, domain line colours, semantic success/warning/danger ramps.
- Chart fallbacks in `useChartTokens.ts` (Earth-resolved `FALLBACK`) synced to the new gold/muted/paper/border.

**Files:** `src/styles/design-tokens.css`, `src/components/ui/charts/useChartTokens.ts`; docs: `docs/design/DESIGN-DNA.md` (all five token maps + CSS blocks + usage notes), `CLAUDE.md` + `.cursorrules` (Theme Quick Reference), `docs/claude-project/4-design-essentials.md`, `docs/changelog.md`.

---

## 2026-06-11 — Auth atmosphere redesign: grain + washes mounted, engraved Seed-of-Life mandala with 120s light sweep, card entrance

The login background was two generic drifting accent blobs on a flat canvas. Redesigned as a composed scene — token-driven, transform/opacity only, reduced-motion respected. **Token guard + full production build clean.**

- **`.layout-canvas` finally mounted.** The atmosphere class (grain SVG + Earth's three `--theme-canvas-gradient-*` washes) was built for auth/marketing but mounted nowhere (DOC-01). It now backs the auth shell — Earth gets grain + tonal washes; other themes degrade to grain only (their gradient tokens are `none`). The inline `backgroundColor: var(--theme-canvas)` white-flash guard stays. This supersedes the 2026-06-02 removal of the per-page noise div — the grain is part of the canvas identity and the class paints it as one background, no extra DOM.
- **Engraved mandala (the signature).** `.eia-auth-mandala-wrap` (1200px disc, centred behind the card) — an 8-fold Seed-of-Life rosette: eight circles of radius 290 whose centres sit on a ring of radius 290 at 45° steps, so every circle's edge passes exactly through the common central point (no drawn central circle), forming eight symmetrical petals; an outer ring at 2r closes the torus. The point of convergence hides behind the card; the petal arcs frame it on every side. The geometry is one SVG **alpha mask** (black strokes — alpha only, colour stays token-driven) shared by two layers: `.eia-auth-mandala` paints it in quiet accent (12%); `.eia-auth-mandala-lit` holds `.eia-auth-mandala-beam`, a feathered conic beam (30% accent, 26° core / 82° feather, `inset: -22%` so the rotating square always covers the inscribed rosette) rotating once per 120s `linear` **inside** the statically-masked layer — an 8-fold pattern is not rotation-invariant, so the mask must never rotate; the light moves, the geometry never does. (Iterations: v1 concentric guilloché rings centred on the glow focal point — read as a misplaced fragment; v2 re-centred behind the card; v3 replaced rings with the logo's rosette.) `will-change: transform` on the beam, zero main-thread work.
- **Orbs breathe.** `eia-orb-float-a/b` keyframes gain subtle scale (0.95–1.05) alongside the existing drift — same durations, same transform-only contract.
- **Card entrance.** `.eia-auth-card` rises into place once — `opacity 0→1, translateY(12px)→0, scale(0.985)→1` at `--duration-page` `--ease-out-expo`; the ring field develops in over 1.6s (`eia-auth-fade-in`). Shared by all three auth forms.
- **Card chrome — the jewel box.** `.eia-auth-card` upgraded from flat fill + flat border: (1) gradient hairline border, accent-kissed at the top arc falling to `--theme-sidebar-border` (painted `border-box` under a transparent border — a lighting treatment on the full ring, not a single-edge category strip); (2) lamplight wash, a 7%-accent radial at top centre where the brand lives; (3) shadow gains a wide accent bloom (`0 30px 90px -30px`, 18% accent) so the card sits in the mandala's light. Shared by all three auth forms automatically.
- **Logo medallion.** `.eia-auth-logo-medallion` — 72px circular hairline ring (30% accent) with a soft halo around the 48px logo: the rosette's innermost ring made tangible on the surface (its point of convergence hides directly behind the card). Applied at all four brand-header sites (login, forgot-password, update-password form + `InvalidLinkCard`) to keep the unified-header contract.
- **Entrance choreography.** `.eia-auth-card > *` — direct children (brand header, form, footer link) settle in with `opacity 0→1, y 6→0` at `--duration-enter` `--ease-out-expo`, 60ms steps from 80ms; everything at rest by ~600ms.
- **Input hover affordance.** `.eia-input-auth:hover:not(:focus)` — border warms toward accent (18% mix), gated behind `@media (hover: hover) and (pointer: fine)`.
- **Reduced motion:** orb drift, mandala beam, and card-children stagger `animation: none`; card entrance collapses to a `--duration-base` opacity fade (block placed after the base rules — equal specificity, cascade decides).

**Files:** `src/app/(auth)/layout.tsx`, `src/app/globals.css`, `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/forgot-password/forgot-password-form.tsx`, `src/app/(auth)/update-password/update-password-form.tsx`, `src/app/(auth)/update-password/page.tsx`; docs: `docs/changelog.md`, `src/app/(auth)/CLAUDE.md`, `CLAUDE.md`, `.cursorrules`.

---

## 2026-06-11 — Claude.ai Project knowledge pack: `docs/claude-project/` (4 generated digests + upload guide)

New folder holding the file set to upload to the Claude.ai (web/app) Project so every chat carries full product/architecture/rules/pages/design context without uploading all ~24k lines of docs. The four digests are **generated summaries, never source of truth** — each carries a header saying so; never cite them inside the repo; regenerate when the source docs change.

- **`README.md`** — what to upload (the 4 digests + root `CLAUDE.md` and `docs/rules/The_Rules.md` verbatim), what *not* to upload (changelog, full DESIGN-DNA, `_archive/`, individual page specs), and suggested Project custom-instructions text.
- **`1-product-and-status.md`** — digest of `00-for-the-board.md` + `01-vision.md` + `modules/*`: what Eia/Indulge is, the module table with statuses, the journey of one lead, trust principles, what's next.
- **`2-architecture-summary.md`** — digest of `architecture/*` + `integrations/*`: stack, topology, request flow, auth/RBAC, full table inventory, the three caching layers (P-08, dual-key, version counters), ingestion/Gupshup/Trigger.dev/SLA mechanics.
- **`3-pages-summary.md`** — all 14 `pages/*.md` specs condensed to one section per route (purpose, access, data sources, key components, load-bearing invariants).
- **`4-design-essentials.md`** — DESIGN-DNA law digest: typography hierarchy + rules, the six motion rules + vocabulary, z-scale, the permanent decisions, themes, Lia design language. The Surface Contract/Never-Do live in the uploaded `CLAUDE.md`, not duplicated here.

**Files:** `docs/claude-project/README.md`, `docs/claude-project/1-product-and-status.md`, `docs/claude-project/2-architecture-summary.md`, `docs/claude-project/3-pages-summary.md`, `docs/claude-project/4-design-essentials.md`; docs: `docs/README.md` (tree entry), `docs/changelog.md`.

---

## 2026-06-11 — CLAUDE.md consistency pass: all 22 command-layer files synced to the overhauled The_Rules.md (rule-ID wiring, Section 0 pointers, registry gaps)

Follow-up to the rules overhaul: every CLAUDE.md now cites the same rule IDs the constitution defines, so an agent reading any layer lands on the same law. `.cursorrules` re-synced byte-identical to root `CLAUDE.md`.

- **Root `CLAUDE.md` (+ `.cursorrules`):** header now names `docs/rules/The_Rules.md` §0 as the constitution the File Locations registry serves; mandatory-sequence step 2 cites R-01 (formerly Q-12) + the repeat-offender table and adds the R-03 copy-paste clause; never-do list gains `requireProfile` (A-18), `<ConfirmDialog>`/no `window.confirm`, the `<CollapseReveal>` pointer on the layout-animation line, and A-15/A-16/A-17 ID tags; File Locations gains `CollapseReveal.tsx`, the full `webhook.ts` surface (`createRateLimiter`/`getClientIp`/`safeSecretCompare`, S-17), `MotionConfig reducedMotion="user"` on the MotionProvider row, and ID tags on `_auth.ts` (A-18), `lead-cache.ts` (P-08), `rows.ts` (Q-18), `motion.ts` (V-13); Rule 11 carries the `after()` carve-out; folder tree fixes the stale `hooks/` entry (13 hooks, not 1) and adds `api/auth/callback` (P-02); `unstable_cache` Pattern Note now leads with the P-09 `cookies()` constraint.
- **`src/lib/CLAUDE.md`:** "stub" title replaced; §0/R-02 preamble added (every "THE x" registry entry = the only implementation allowed); section headers tagged Q-16, P-09, Q-18; `_auth.ts` registry row tagged A-18.
- **`src/lib/actions/CLAUDE.md`:** requireProfile section tagged A-18; invalidateLeadCaches section tagged P-08.
- **`src/components/CLAUDE.md`:** Motion bundle rule now documents the global `<MotionConfig reducedMotion="user">` wrap; import convention tagged A-17.
- **`src/app/CLAUDE.md`:** the `getCurrentProfile()` authority note cross-refs A-01/A-18.
- **`src/app/(dashboard)/CLAUDE.md`:** Data Access Rules updated from `getCurrentProfile()` to `requireProfile()` (A-18) — `dashboard.ts` migrated to the guard previously; the doc had drifted.
- **`src/app/(dashboard)/tasks/CLAUDE.md`:** getGroupTasks cache note tagged P-09.
- **Verified current, no changes needed:** `api/webhooks/CLAUDE.md` (already cites F-4/S-17), `lib/services/CLAUDE.md`, `supabase/migrations/CLAUDE.md` (already on two-tier Q-13), and the 9 feature-area files ((auth), admin/ad-creatives, campaigns, deals, leads, performance, settings, components/layout·leads·notifications·performance·tasks) — swept for stale doc references (`The_Changelog`, `master.md`, `chart-tokens`, `features/`, "useEffect for data fetching"): zero hits.

**Files:** `CLAUDE.md`, `.cursorrules`, `src/lib/CLAUDE.md`, `src/lib/actions/CLAUDE.md`, `src/components/CLAUDE.md`, `src/app/CLAUDE.md`, `src/app/(dashboard)/CLAUDE.md`, `src/app/(dashboard)/tasks/CLAUDE.md`; docs: `docs/changelog.md`.

---

## 2026-06-11 — Motion polish pass 5: the moments — theme cross-dissolve, status pill transition, message arrival, refresh feedback, journey unfold, avatar fade

Implements the Tier-1/Tier-2 findings of the full-codebase motion scan: the high-meaning moments that were still hard-snapping. **Full production build clean (token guard + compile + static gen). Transform/opacity/colour only; reduced-motion respected throughout (CSS additions gated; Framer additions are opacity/y).**

- **Theme switch cross-dissolve — `--transition-theme` finally has its consumer.** The token was defined for "the full canvas recolour" but applied nowhere; switching themes hard-snapped the palette. `ThemeSelector` now puts `eia-theme-transition` on `<html>` for a ~400ms window around the `data-theme` write; a `design-tokens.css` rule transitions every element via `--transition-theme !important` during that window only (gated to `prefers-reduced-motion: no-preference`; never present at boot — `ThemeInitializer` is classless; timer cleared + class removed on unmount).
- **Lead status pill transitions (M-04).** `StatusActionPanel`'s pill: background/border/colour dissolve at `--duration-slow`, the label crossfades through `AnimatePresence mode="wait"` (`y ±4`, `FAST_DURATION`) on every optimistic status change — Called/Won/Lost no longer teleport.
- **WhatsApp messages arrive (DNA §6.4 pace).** `MessageBubble` is now a `motion.div` with an `entrance` prop — `opacity 0→1, y 6→0`, 300ms `EASE_OUT_EXPO`; optimistic 0.6-opacity dimming moved onto the same animated value (the old CSS opacity transition removed). Both parents (`ConversationPanel`, `LeadWhatsAppCard`) pass `entrance={arrivedAfterMount.current}` via a mount ref — the initial thread renders static, only messages appended after mount animate (panel remounts per conversation via `key`).
- **Widget refresh feedback — pure reuse.** The three dashboard refresh buttons (`AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget`) swap `disabled={isPending}` for `loading={isPending}` — Button's built-in loading state swaps the `RefreshCcw` for the width-preserving `Spinner`.
- **Lead journey timeline unfolds.** Each stage cell in `LeadJourneyTimeline` (server component) reuses the `eia-row-enter` CSS utility with a 60ms `animationDelay` step — the journey draws left → right on dossier load.
- **Avatar photos fade in.** `Avatar`'s `<img>` starts at `opacity: 0` and dissolves in on load (`--duration-slow` `--ease-in-out`); a ref callback checks `el.complete && naturalWidth > 0` so cached / pre-hydration images can never be stuck invisible.
- ***Scan corrections (already built, no change):*** the leads sort toggle already rotates 180° on asc/desc (only its hardcoded `200ms ease-out` was tokenized to `var(--duration-base) var(--ease-spring)`); `InfoRow`'s copy → Check already pops via `AnimatePresence` scale.

**Files:** `src/styles/design-tokens.css`, `src/components/profile/ThemeSelector.tsx`, `src/components/leads/StatusActionPanel.tsx`, `src/components/whatsapp/MessageBubble.tsx`, `src/components/whatsapp/ConversationPanel.tsx`, `src/components/leads/LeadWhatsAppCard.tsx`, `src/components/dashboard/widgets/AgentTasksWidget.tsx`, `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx`, `src/components/dashboard/widgets/ManagerCampaignWidget.tsx`, `src/components/leads/LeadsTable.tsx`, `src/components/leads/LeadJourneyTimeline.tsx`, `src/components/ui/Avatar.tsx`; docs: `docs/changelog.md`.

---

## 2026-06-11 — The_Rules.md overhaul: Section 0 "Reuse First" (R-rules + repeat-offender table), Q-13 two-tier rewrite, five new coded rules, contradiction + staleness sweep

Full revision of `docs/rules/The_Rules.md` against the live 2026-06-11 codebase. Driver: coding agents kept duplicating already-built components/services despite Q-12 — the reuse law needed to be the first thing read and needed a lookup table, not just a process instruction. Every change has a Decision Log row in the file itself.

- **New Section 0 — Reuse First (R-01–R-04):** the DRY law promoted from one buried Q-12 row to the opening section. R-01 search-by-behaviour (absorbs Q-12; ID retained as a pointer), R-02 the CLAUDE.md registries are law by reference ("THE x" = the only implementation allowed to exist), R-03 copy-paste-then-tweak of an existing module is the same violation as ignoring it, R-04 consolidated forks stay deleted. Plus the **repeat-offender table** — ~25 most-duplicated concepts mapped to their canonical homes (`requireProfile`, `invalidateLeadCaches`, `ConfirmDialog`, `FilterBar`, `CollapseReveal`, `EmptyState`, `PageSkeletons`, `useWidgetData`, `ist.ts`, `motion.ts`, `defineEnum`, `mapRows`, webhook utils, …).
- **Q-13 rewritten to the two-tier SECURITY DEFINER model** shipped in the audit F-1 closure (migration 0102): self-scoped (auth.uid()-derived, `authenticated` GRANT, session client) or revoked (scope params, EXECUTE REVOKEd, admin client with session-derived args). The violation is now precisely "a scope-param RPC with a live `authenticated` GRANT".
- **Five conventions codified as rules:** A-17 `import { m as motion }` + single `MotionProvider` (now also noting the global `MotionConfig reducedMotion="user"`), A-18 `requireProfile(roles?)` as the mandatory action guard (exception list referenced, not duplicated), P-09 React `cache()` vs `unstable_cache`+`cookies()` hard constraint + `revalidateTag(tag, { expire: 0 })`, Q-18 `mapRows` typed boundary (4 legacy casts grandfathered, count only goes down), V-13 motion values from `motion.ts`/tokens — never inline bezier arrays or one-off springs.
- **Two self-contradictions fixed in the never-list:** "NEVER write useEffect for data fetching" contradicted P-01/Q-15 (the sanctioned client fetch *is* a Server Action inside `useEffect`) → now prohibits direct Supabase fetches; "NEVER do background work in an API route handler" contradicted A-16 (`after()` is sanctioned) → now prohibits fire-and-forget and >3s/retry work outside Trigger.dev. Four duplicated never-lines removed; list regrouped by theme (Reuse / Architecture / Security / Caching / Design / Quality). The layout-animation line now points at `<CollapseReveal>` — the `height: 0↔auto` exception logged earlier today is recorded as retired by the design-engineering pass.
- **Honesty pass — forward contracts marked:** S-15/S-16 (separation of duties, second-actor approval) and D-01 (PII vault — binds the Lia build per `01-vision.md`) are now explicitly forward contracts with the currently-enforced subset named, instead of aspirational claims stated as fact.
- **Staleness sweep:** S-17 names the shipped `createRateLimiter()`/`safeSecretCompare()` (audit F-4); A-05 uses real `components/<feature>/` paths (a `features/` tree never existed); A-11 names its two documented append-only exceptions; V-03 carries the resolved 500ms ceiling (`PAGE_DURATION`) with its exactly-three exemptions; P-02 lists the three real API routes; P-06 adds the `removeChannel()` cleanup requirement; Q-06 points at the deploy checklist in `operations/deployment.md`; §7 naming examples are real files (`useWidgetData.ts`, `task-schemas.ts`, the `_auth.ts` internal-helper convention).

**Files:** `docs/rules/The_Rules.md`; docs: `docs/changelog.md`.

---

## 2026-06-11 — Design-engineering audit fixes: app-wide reduced-motion, no layout-property animation, touch-safe Button hover, flip-up panel transform fix, faster tabs

Fixes from the Emil-Kowalski-checklist design audit. **Token guard + typecheck + full build clean. Net effect: zero `height`/`width` animations remain anywhere, every Framer animation now respects `prefers-reduced-motion`, and three latent transform bugs are gone.**

- **App-wide reduced motion (one line).** `MotionProvider` now wraps children in `<MotionConfig reducedMotion="user">` — every Framer animation (modals, dropdowns, card staggers, tab content, toasts) respects `prefers-reduced-motion` automatically; opacity/colour transitions are kept per the accessibility guidance. Previously only the CSS-side animations were gated.
- **`CollapseReveal` — THE expand/collapse primitive (new, `src/components/ui/CollapseReveal.tsx`).** Animates `grid-template-rows 0fr→1fr` + opacity instead of `height: 0→"auto"`: no per-frame inline height writes, no measured target going stale mid-animation, and no `height` keyword (Never-Do list). The five height-animation sites now compose it: `GroupTasksTab` (expanded subtasks accordion + add-subtask row), `SubTaskModal` (delete-confirm banner), `MyTasksCalendarView` (date-section body + quick-add row). Same durations/curve as before — visually identical, rule-compliant.
- **Button hover is CSS, gated to real pointers.** The five variants' rest+hover chrome moved from `Button.tsx` JS `onMouseEnter`/`onMouseLeave` inline-style writes to `.eia-btn-*` classes in `design-tokens.css`, with `:hover` inside `@media (hover: hover) and (pointer: fine)` — a tap on touch no longer leaves the primary button stuck lifted at `translateY(-1px)`. Press feedback (`.eia-pressable:active`) now beats hover by cascade order — **the `!important` workaround is deleted**. Focus ring moved to `:focus-visible` (keyboard-only — a mouse click no longer flashes it); `suppressFocusRing` maps to `.eia-btn-no-ring`. ~70 lines of JS hover plumbing removed. Reduced motion also kills the hover lift.
- **Flip-up panel transform clobber fixed (3 components).** `FloatingPanel`, `DatePicker`, `TimePicker` set `style.transform: translateY(-100%)` on a `motion.div` whose variants animate `y` — Framer owns `element.style.transform` while animating, so the bottom-anchor shift was wiped during the entrance (panel could overlap its trigger mid-animation). Now via `FLIP_UP_TRANSFORM_TEMPLATE` (new in `motion.ts`), which composes the static shift with Framer's generated transform. Flipped panels also slide from the correct side now — new `DROPDOWN_VARIANTS_UP` (y 4→0) mirrors the entrance when opening upward.
- **Tab switching is ~150ms, not ~400ms.** `TabsContent` kept `mode="wait"` but the exit is instant and the enter is a `FAST_DURATION` opacity-only fade (was: 200ms slide out, then 200ms slide in — a tens-of-times-a-day action paying double animation).
- **Toast depletion bar runs on the compositor.** `toast-deplete` keyframe now animates `transform: scaleX(1→0)` (origin left, width 100% on the bar) instead of `width: 100%→0%` — the old version triggered layout every frame for the toast's entire lifetime. Linear time-mapping unchanged.
- **No more `scale(0)` entrances.** `NotificationBell` unread dot and `Calendar` task dots enter from `scale 0.5` + `opacity 0` (nothing appears from nothing). The Calendar dot's `translateX(-50%)` centring also moved to Framer's `x` — it was a static `style.transform` being clobbered by the animated scale (same bug class as the panels, ~1.5px drift).
- **Dead `--transition-layout` token deleted** — zero consumers, and it animated width/height/padding/margin in direct contradiction of the Never-Do list.

**Files:** `src/components/layout/MotionProvider.tsx`, `src/components/ui/CollapseReveal.tsx` (new), `src/components/ui/Button.tsx`, `src/components/ui/FloatingPanel.tsx`, `src/components/ui/DatePicker.tsx`, `src/components/ui/TimePicker.tsx`, `src/components/ui/TabSelector.tsx`, `src/components/ui/toast-item.tsx`, `src/components/ui/Calendar.tsx`, `src/components/notifications/NotificationBell.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/SubTaskModal.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`, `src/lib/constants/motion.ts`, `src/styles/design-tokens.css`; docs: `docs/changelog.md`, `src/components/CLAUDE.md`, `src/components/notifications/CLAUDE.md`.

---

## 2026-06-11 — Motion polish pass 4: BackButton arrow travel — the arrow continues on its journey

Upgrades the `BackButton` hover from a 1px nudge to the **arrow-travel** gesture: on hover the arrow slides out to the left (clipped by the 36px circular button) while a twin arrow flows in from the right and settles in the centre — continuous directional motion that says "this takes you back". Entrance, `scale 1.05` hover lift, and `whileTap 0.93` are unchanged; the link's old `x: -2` hover shift is removed (the directional job now belongs to the arrow — one motion per cause, M-03). **Token guard + typecheck clean; CSS-only transforms (interruptible mid-travel), same family pace (`--duration-slow` + `--ease-spring`), same pointer/reduced-motion gate.** Supersedes pass 3's "BackButton keeps its own Framer arrow nudge" note.

- New `travel-back` variant in the `.eia-icon-*-hover` family (`design-tokens.css` §15): clipping class on the button + `.eia-icon-travel-stage` wrapping two icon copies (second absolute/`aria-hidden`); twin parks at `translateX(200%)` (fully outside the clip), primary exits to `−200%` on hover. Transforms live only in the stylesheet — markup contract documented in `src/components/CLAUDE.md`.
- One component edit covers every detail page (`/leads/[id]`, `/campaigns/[id]`, `/admin/users/[id]`, `/admin/users/new`, `/tasks/[id]`).
- **Retimed after review ("too fast, harsh"):** the travel runs at `--duration-page` (500ms — the §10.1 ceiling) + `--ease-out-soft` instead of the family's 350ms spring — it is a full exit-and-arrival journey, not a nudge; the link's hover `scale 1.05` gets a matching `SLOW_DURATION` + `EASE_OUT_SOFT` transition (it previously inherited the 150ms entrance timing — the pop was the harshness). New `EASE_OUT_SOFT` constant in `lib/constants/motion.ts` (mirrors `--ease-out-soft`). Tap stays fast (presses must respond instantly).
- **Text "+" glyphs converted to the real icon:** `AddLeadButton` "+ Add Lead" → `iconLeft={Plus}` + `iconMotion="rotate"` + "Add Lead" (the text glyph sat off the icon grid and could not join the family — supersedes pass 3's deliberate non-change); `GroupTaskWorkspace` FAB label "+ Add subtask" → "Add subtask" (it already renders a `Plus` svg — the text "+" was a double plus).

**Files:** `src/styles/design-tokens.css`, `src/lib/constants/motion.ts`, `src/components/ui/BackButton.tsx`, `src/components/leads/AddLeadButton.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`; docs: `docs/changelog.md`, `src/components/CLAUDE.md`.

---

## 2026-06-11 — Motion polish pass 3: the icon micro-interaction family — one global vocabulary (rotate / lift / drop / ring), unhurried timing, typed Button opt-in

Generalises pass 2's one-off cross/phone treatments into **a single global icon-motion system** so no future call site re-invents a hover gesture. **Token guard + typecheck clean. Still CSS-only — zero JS, zero bundle growth.**

- **One definition, one gate, one pace.** The `.eia-icon-*-hover` family in `design-tokens.css` §15 now shares a single transition rule — slowed from `--duration-base` to **`--duration-slow` (350ms) + `--ease-spring`** per the "not rushed" direction — and a single media query (`hover: hover` + `pointer: fine` + `prefers-reduced-motion: no-preference`). The phone ring slowed 500→700ms. Four variants, each a semantic gesture with live consumers (rule: never add a variant without one): `rotate` (quarter turn), `lift` (up-right takeoff), `drop` (settle down), `ring` (receiver wiggle).
- **Typed reuse on Button:** new `iconMotion?: 'rotate' | 'lift' | 'drop' | 'ring'` prop on `ui/Button` (inherited by `MotionButton`) maps to the family classes — consumers opt in with one word, never a class string.
- **Applied across the app (each a one-line opt-in):** *rotate* — Plus CTAs: `AddDealButton`, `AddTaskButton`, `AdCreativesManager` Add Creative, `LeadTasksCard` +, `GroupTaskWorkspace` FAB (its open-state X gets the same quarter turn — reads as "this now closes"), admin-users Add Member link; the Dialog/SubTaskModal close × from pass 2 now inherit the slower shared timing. *lift* — `MessageBar` send (one edit covers both WhatsApp surfaces), `TaskRemarksPanel` send, `GroupTasksTab` Open ↗. *drop* — `ExportButton` Download. *ring* — Called (pass 2, retimed). Raw icon-buttons that gained a family class also gained `.eia-pressable`.
- ***Deliberate non-changes:*** `AddLeadButton`'s "+" is a text glyph, not an svg — left alone rather than restructured for an effect; `BackButton` keeps its existing Framer arrow nudge (no doubling); form-submit buttons whose `iconLeft` swaps to a `Spinner` get no rotate (meaning changes mid-flight); `FilterDropdown`'s chevron-180° and `NotificationBell` stay as built.
- **Vocabulary documented once** in `src/components/CLAUDE.md` ("Icon micro-interaction family") with the consumer table and the never-double-up rules.

**Files:** `src/styles/design-tokens.css`, `src/components/ui/Button.tsx`, `src/components/ui/MessageBar.tsx`, `src/components/leads/ExportButton.tsx`, `src/components/leads/LeadTasksCard.tsx`, `src/components/tasks/AddTaskButton.tsx`, `src/components/tasks/TaskRemarksPanel.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/deals/AddDealButton.tsx`, `src/components/admin/AdCreativesManager.tsx`, `src/app/(dashboard)/admin/users/page.tsx`; docs: `docs/changelog.md`, `src/components/CLAUDE.md`.

---

## 2026-06-11 — Motion polish pass 2: close-cross quarter turn, phone "ring" on the Called button, press feedback on dossier action buttons

Follow-up icon micro-interactions to the motion polish pass below. **Token guard + typecheck clean. CSS-only — zero JS, zero bundle growth; all hover affordances gated to `(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)` in one media query (no touch false-positives, reduced motion never sees them).**

- **Close × rotates 90° on hover.** New `.eia-icon-rotate-hover` utility (put the class on the *button*, it targets the child `svg`; `--duration-base` `--ease-spring`). Applied to the `Dialog.tsx` header close (covers every modal composing `modal.tsx`/`Dialog`) and `SubTaskModal`'s `IconButton variant="close"`. The cross turning into a ✕-at-45°-feel quarter turn is anticipation — the affordance acknowledges aim before the click; the press itself stays on the button via `.eia-pressable`.
- **The phone icon on the dossier "Called" button rings on approach.** New `eia-phone-ring` keyframe — decaying ±13°→0 wiggle over 500ms, `transform-origin: 50% 35%` so it pivots like a receiver — via `.eia-icon-ring-hover`, applied through a new optional `className` prop on `StatusActionPanel`'s `ActionButton`. Hover-triggered (not click): the click opens `CalledModal` immediately and would cover the animation; on hover it plays once per approach and re-arms on leave.
- **Press feedback extended to the dossier action row + modal icon buttons.** `StatusActionPanel`'s `ActionButton` and `SubTaskModal`'s `IconButton` now carry `.eia-pressable` (their `--transition-interactive`/extended transitions already animate transform at `--duration-instant` `--ease-spring`). Disabled buttons can never trigger it (`:active` does not fire on `disabled`).

**Files:** `src/styles/design-tokens.css`, `src/components/ui/Dialog.tsx`, `src/components/tasks/SubTaskModal.tsx`, `src/components/leads/StatusActionPanel.tsx`; docs: `docs/changelog.md`.

---

## 2026-06-11 — Motion polish pass: universal press feedback, travelling sidebar pill, row-by-row table arrival, checkbox tick draw, zero inline easings

Targeted animation-quality pass implementing the DESIGN-DNA motion vocabulary that was specified but never built. **Typecheck + token guard + full build clean. Zero new dependencies, zero bundle growth — every addition is CSS-only or reuses the already-loaded `m` core; all new motion is transform/opacity-only (M-06) and respects `prefers-reduced-motion` (M-05).**

- **Every `Button` now has press feedback (DNA §6.3 "the key pressing down").** New `.eia-pressable` utility in `design-tokens.css` — `:active → scale(0.97)`, animated by the existing `--transition-interactive` (100ms `--ease-spring`). Applied via `className` in `Button.tsx`, so the press is CSS-only and the plain-Button-stays-Framer-free contract (G-2) is untouched. `!important` is required because hover states set `transform` via `element.style`; disabled buttons set `pointer-events: none`, so they can never trigger it. `MotionButton`'s `whileTap` targets the same 0.97 — no double-feedback.
- **Sidebar nav is alive (DNA §5.99 #01 + §6.3 — spec'd, never shipped).** The active pill is now `motion.span layoutId="sidebar-active-pill"` with `SPRING_CONFIG` — it travels between nav items (including across sections) instead of toggling; pill centring moved from `translateY(-50%)` to `top: calc(50% - 8px)` so Framer owns `transform` during the layout animation. Nav items nudge `translateX(2px)` on hover (`--ease-spring`, CSS-only, inactive items only). The active ChevronRight arrives with a 200ms `opacity/x` slide instead of popping in. All three gate on `useReducedMotion()`.
- **Tables fade in row by row (DNA M-04 "data never flashes").** New `eia-row-enter` keyframe + utility: first 8 rows fade in at `--duration-base` `--ease-out-expo` with 30ms inline `animation-delay` steps (`backwards` fill keeps delayed rows invisible until their turn); rows 9+ render instantly per the §6.3 stagger cap. Adopted in `LeadsTable` (`LeadRow` gains an `index` prop — primitive, memo-safe) and generic `Table<T>`. Animation runs on DOM insertion only — persisting rows never replay on filter/selection changes.
- **The leads-table checkbox tick draws itself in.** `eia-check-draw` keyframe — `stroke-dashoffset` 9→0 over `--duration-fast` on the check `<path>` (path length ≈ 9). Uncheck stays instant (exits faster than entrances, M-02).
- **Zero hardcoded easing arrays remain.** The six inline `[0.16, 1, 0.3, 1]` literals (`LeadsTable`, `CampaignCard`, `CampaignAdCard`, `TaskRemarksPanel`, `toast-item`, `toast-provider`) now import `EASE_OUT_EXPO` from `lib/constants/motion.ts` per the "never re-declare inline" rule — one source of truth for the house curve.
- ***Deliberate non-changes (restraint):*** no count-up numbers on stat tiles (`StatAtom`/`StatTile` receive pre-formatted strings; parsing them for a once-per-visit flourish fails the frequency test), no hover/entrance changes to the already-correct card-list pattern (`CampaignCard`/`DealCard`/`UsersTable`), no new motion on keyboard-driven or 100×/day surfaces, no changes to the already-polished `Toggle`/`ChecklistItem`/`NotificationBell`/toast stack.

**Files:** `src/styles/design-tokens.css`, `src/components/ui/Button.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/ui/Table.tsx`, `src/components/leads/LeadsTable.tsx`, `src/components/campaigns/CampaignCard.tsx`, `src/components/campaigns/CampaignAdCard.tsx`, `src/components/tasks/TaskRemarksPanel.tsx`, `src/components/ui/toast-item.tsx`, `src/components/ui/toast-provider.tsx`; docs: `docs/changelog.md`, `src/components/CLAUDE.md`.

---

## 2026-06-11 — Docs restructure: one home per topic, full professional tree under docs/

Complete reorganisation of `docs/` so every page, service, integration, design decision, rule, and invariant has exactly one documented home (plan: `docs/_restructure-proposal.md`; index + reading orders: `docs/README.md`). **Docs-only — the single source change is one stale path in a comment (`src/lib/actions/_auth.ts`) plus path-reference updates in four `CLAUDE.md` files and root `README.md`; `.cursorrules` re-synced to `CLAUDE.md`.**

- **New tree:** `architecture/` (overview · database + the `pg_dump` · auth-and-rbac · caching · migrations 0001–0103) · `design/` (DESIGN-DNA · design-system · **new decision-log.md**, seeded with all design decisions to date + open questions) · `rules/The_Rules.md` · `pages/` (14 route specs on one template: purpose / who-sees-it / data sources / components / states / invariants / open items / deep dive) · `modules/` (gia · lia · sia · elia · call-intelligence) · `integrations/` (lead-ingestion · whatsapp-gupshup · trigger-dev · upstash-redis) · `operations/` (environments · deployment) · `audits/` · plus `00-for-the-board.md` (plain-English product explanation) and `01-vision.md` (roadmap + per-module "done").
- **`master.md` split and archived** — its rules/design copies (which had drifted from The_Rules/DNA, e.g. two different V-10s) were not migrated; the canonical files win.
- **Drift corrected, not copied forward:** design-audit DOC-01/04/05/06 fixed in DNA + design-system with "corrected" footnotes; `The_Gia.md` rewritten into `modules/gia.md` (pre-0061 scratchpad, pre-0072 deal columns, Meta-signature webhook auth, 6-domain GIA list → 4 per code); `lead-page.md` scratchpad rows removed; `master.md`'s `last_seen_at`-via-proxy claim corrected (column is dormant — nothing writes it); root `README.md` §4 "grants system" corrected (no grants table exists) and its stale "planned" list updated; whatsapp-notifcation's Pipeline-B "concierge" default corrected to `onboarding`.
- **Gaps filled:** `pages/error-log.md` (route had no doc), env-var registry (`operations/environments.md` — 17 vars; `.env.example` is missing 9+, flagged for a code PR), deployment doc, Trigger.dev + Upstash integration docs, Realtime/hook/shell-feature registries (`architecture/overview.md`), service-file → home-doc map, F-5 raw-payload PII retention decision recorded (`integrations/lead-ingestion.md`), F-1 posture documented as fixed via migration 0102.
- **References:** every live in-repo `docs/` path updated (root CLAUDE.md doc map, root README, `src/components|app|lib` CLAUDE.md files, audits' internal refs, DNA/design-system cross-refs); grep-verified zero dead references outside the documented exemptions (this changelog's historical entries, `_archive/`, `_restructure-proposal.md`, migration-file comments, and explicit "since deleted" tombstones).
- **Archive:** 16 originals moved to `docs/_archive/` with banners; `_archive/README.md` lists per-file disposition + every deliberately dropped/corrected claim. Nothing destroyed.

**Files:** the new `docs/` tree (41 live files); `CLAUDE.md`, `.cursorrules`, `README.md`, `src/components/CLAUDE.md`, `src/app/(dashboard)/CLAUDE.md`, `src/lib/CLAUDE.md`, `src/lib/actions/_auth.ts` (comment only).

---

## 2026-06-11 — Design audit Phase 4 complete: theme atmosphere + structural guards (H-02, §3.3 ×2, DOC-01/03 remnants) — design audit fully closed

Closes Phase 4 (the final phase) of `docs/audits/design-audit-2026-06.md` (items 4.1–4.4). **Typecheck + build + token guard clean; zero visual change on the live UI** (the gradient tokens have no mounted consumer; the `@theme` values mirror `design-tokens.css` exactly and were verified by compiling `globals.css` through Tailwind directly).

- **4.1 / H-02 — Earth's washes can no longer bleed into the other themes.** `air`/`water`/`fire`/`cosmos` blocks in `design-tokens.css` now define `--theme-canvas-gradient-1/2/3: none` + a documentation `--theme-canvas-grain-opacity: 0.055` explicitly. `:root` carries Earth's washes on the same `<html>` element a `[data-theme]` block targets, so omission inherited Earth instead of falling to `initial` — any future `.layout-canvas` consumer now gets the documented flat canvas per theme. DNA §3.5's "other themes omit them" sentence corrected to match.
- **4.2 / §3.3 — Tailwind v4 default theme isolated from Eia's namespaces.** New `@theme` block in `globals.css`: `--text-*` / `--leading-*` / `--tracking-*` / `--radius-*` wiped (`initial`) and re-registered from Eia's scale (values mirror `design-tokens.css` — that file stays the source of truth). Verified by direct Tailwind compile: `text-xs`/`rounded-md`/`rounded-full`/`leading-none`/`font-medium` utilities still generate, now from Eia's tokens **without** Tailwind's mismatched `--text-*--line-height` companions; `--text-4xl`/`--text-5xl` no longer exist in the output — the silent gap-fill that made H-04 "work by coincidence" is structurally closed.
- **4.3 / §3.3 — undefined-token CI guard.** New `scripts/check-tokens.mjs` (`npm run check:tokens`, chained in front of `npm run build`): scans all 326 `src/` ts/tsx/css files for `var(--…)` references and Tailwind var-shorthand utilities (`bg-(--…)`), fails on any name not defined in the scanned tree (comments stripped; `--tw-*` internals and the three next/font variables excepted; dynamic template-literal names skipped). This one guard catches the entire Critical class of the audit (C-01…C-03, H-03, H-04) at build time. First full run: zero violations.
- **4.4 / DOC-01…DOC-06 — remaining drift fixed.** Root `CLAUDE.md` file map no longer calls `.layout-canvas` "the dashboard shell" (it is defined but mounted nowhere; `.layout-shell` is the mounted flat shell); `components/CLAUDE.md`'s GroupTaskWorkspace row no longer claims a "priority left border" the code never shipped (DOC-03); design-system §7's ProgressBar note updated to the `scaleX` mechanics. DOC-02 (Phase 2), DOC-04/05/06 + design-system §2a/DNA §3.5 banner (docs-restructure pass) were already corrected — verified rather than re-edited.
- **With this, all four phases of the 2026-06 design audit are complete** — 3 Critical, 4 High, 10 Medium, 6 Low findings and 6 doc-drift notes all closed or formally logged (M-08's optional Button-variant restructure remains the one deliberately deferred polish item).

**Files:** `src/styles/design-tokens.css`, `src/app/globals.css`, `scripts/check-tokens.mjs` (new), `package.json`; docs: `docs/changelog.md`, `docs/audits/design-audit-2026-06.md`, `CLAUDE.md`, `src/components/CLAUDE.md`, `docs/design/DESIGN-DNA.md`, `docs/design/design-system.md`.

---

## 2026-06-11 — Perf Phase 5 complete: getClaims() proxy, LazyMotion, lazy Recharts on /performance, single-RTT list cache, getAssignableUsers memo — performance audit fully closed, report deleted

Closes Phase 5 (the final phase) of the performance audit plus the one item left open outside it (E-3). **Typecheck + build + token check clean; dev smoke verified (/login 200, sessionless /leads 307 via the new proxy path); zero schema changes; zero feature-behaviour change — every animation, chart, and list renders identically.** With this, every actionable audit finding is fixed and `docs/audits/performance-audit-2026-06-11.md` is **deleted** — its do-not-regress rules now live in the relevant `CLAUDE.md` files (motion + chart-splitting rules in `src/components/CLAUDE.md`; A-3 layout-guard + A-1 proxy notes in `src/app/CLAUDE.md`; C-3 single-RTT contract in `src/lib/CLAUDE.md`; G-3 rule in both performance CLAUDE.md files).

- **A-1 follow-up — proxy session check is now local CPU, not an auth-server round trip.** `updateSession` (`src/lib/supabase/middleware.ts`) calls `auth.getClaims()` instead of `auth.getUser()`. Verified before switching: the project's user JWTs are **ES256** (JWKS endpoint serves an EC P-256 key), and supabase-js 2.106's `getClaims()` verifies the signature via WebCrypto against a **module-scoped JWKS cache** (`GLOBAL_JWKS`, built for Vercel Fluid Compute — one JWKS fetch per warm process per 10min, not per request). Session refresh is preserved: `getClaims()` goes through `getSession()` internally, which refreshes an expired token and writes cookies exactly as `getUser()` did; HS256 would auto-fall back to `getUser()`. Removes a ~50–150ms network hop from **every request including prefetches**. `getCurrentProfile()` deliberately keeps its real `getUser()` — it is the authoritative Rule 09 layer.
- **C-3 — leads list cache reads are ONE Upstash round trip instead of two.** The version counter is no longer embedded in the list key (`…:{filterHash}:v{N}` → `…:{filterHash}`); the cached value is now a `{ v, result }` envelope and `getLeadsByRole` fetches `[versionCounter, entry]` in a single `MGET`, hitting only when `v` matches. INCR invalidation in `invalidateLeadCaches` is untouched — a bump still voids every cached page (mismatch → miss), and a write that races a mutation is born stale-marked (the envelope carries the pre-query counter). Old versioned keys simply age out (30s TTL). Admin/founder lists remain TTL-only by design (their versions were never INCRed before either).
- **E-3 — `getAssignableUsers` is React `cache()`-memoised per request.** The public `{ domain?, agentsOnly? }` signature is unchanged; the memo behind it takes **primitive args** because `cache()` keys object args by reference (a fresh options literal per call site would never dedupe). Deliberately NOT Redis-cached: profiles is tiny and a 60s-stale list could offer a just-deactivated assignee in pickers.
- **G-2 — LazyMotion everywhere; framer's full renderer is out of the shared bundle.** New `src/components/layout/MotionProvider.tsx` mounts `<LazyMotion strict>` once in the **root layout** with **async-loaded `domMax`** (`motion-features.ts`, its own chunk) — initial route chunks carry only the ~6kb `m` core instead of the ~34kb `motion` namespace, and the feature chunk streams in parallel right after hydration. `domMax` (not `domAnimation`) because `TabSelector`'s `layoutId` indicator and the toast stack's `layout` prop need layout animations. All 58 motion-importing files migrated via the alias `import { m as motion } from 'framer-motion'` — every `motion.div` JSX site, variant, exit animation, and the two `motion.create()` factories (`MotionButton`, `BackButton`) are byte-identical; `strict` makes the convention self-enforcing (bare `{ motion }` throws in dev). New Never-Do entry + file-map row in root `CLAUDE.md`; full rule in `src/components/CLAUDE.md`.
- **G-3 — Recharts (~90–100kb gz) no longer ships in the `/performance` initial chunk.** The three Recharts importers load via `next/dynamic` at their call sites: `CoreFourGrid` + `CallOutcomeBar` in `AgentPerformanceShell` (same-shape `.skeleton` placeholders extracted from `MetricsSkeleton`, which now composes them), `CallOutcomeBar` in `AgentDetailPanel` (chunk loads in parallel with the panel's own metrics fetch — placeholder rarely visible), `DomainOverviewPanel` in `FounderPerformanceShell` (fetched on first Domains-tab click). KPI shells and the period selector hydrate before the chart library arrives. The audit's `CampaignMetricsStrip` mention was already stale — the DRY refactor (L-8) removed its Recharts import.
- ***Audit coverage check (all 26 findings):*** A-1 ✅ (Phase 1 + this follow-up) · A-2 ✅ · A-3 documented-no-action (now in `src/app/CLAUDE.md`) · B ✅ (Phase 2) · C-1/C-2/C-4 ✅ (Phase 4) · C-3 ✅ (this) · D-1/D-2 ✅ (Phases 1+4) · E-1/E-2 ✅ (Phase 1) · E-3 ✅ (this) · F verify-only (preserved) · G-1/G-4 ✅ (Phase 3) · G-2/G-3 ✅ (this) · G-5 + H notes-only. ***Deliberate non-changes:*** the 5 raw `<img>` sites (avatars/creatives — `next/image` needs remotePatterns + measurement, audit rated low-priority), WhatsApp/admin/settings stay un-Redis'd per the audit's own §I. ***Surviving post-deploy steps:*** `EXPLAIN ANALYZE` the C-4 `(domain, created_at DESC)` index and the trigram search at production volume (drop C-4 if the planner never picks it); re-capture Vercel function durations for `/leads`, `/leads/[id]`, `/dashboard` against the pre-Phase-1 baseline.

**Files:** `src/lib/supabase/middleware.ts`, `src/lib/services/leads-service.ts`, `src/lib/constants/redis-keys.ts`, `src/lib/services/profiles-service.ts`, `src/components/layout/MotionProvider.tsx` (new), `src/components/layout/motion-features.ts` (new), `src/app/layout.tsx`, 58 × `import { m as motion }` component files, `src/components/performance/AgentPerformanceShell.tsx`, `src/components/performance/AgentDetailPanel.tsx`, `src/app/(dashboard)/performance/FounderPerformanceShell.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`, `src/lib/CLAUDE.md`, `src/app/CLAUDE.md`, `src/app/(dashboard)/performance/CLAUDE.md`, `src/components/performance/CLAUDE.md`, `docs/audits/performance-audit-2026-06-11.md` (deleted).

---

## 2026-06-11 — Security audit Phase 4 complete: `lead_raw_payloads` PII-retention decision recorded (F-5) — audit fully closed

Closes the final item of `docs/audits/security-audit-2026-06.md`. **Documentation only — zero code, zero schema, exactly as the audit recommended.**

- **F-5 — the PII-retention posture of `lead_raw_payloads` is now a recorded decision, not an oversight.** New Decision Log entry in `docs/rules/The_Rules.md`: the immutable ingestion log intentionally stores the faithful raw webhook envelope including lead PII (name/phone/email); `sanitizeRawPayload()` is an envelope cleaner (strips only Pabbly's `res2`), **never** a PII scrubber — redaction would defeat the table's audit/replay purpose. Containment is structural instead: admin/founder-only RLS SELECT, admin-client-only writes, append-only. A retention/soft-delete window is deliberately deferred to the clients module, where it can be set against real data-lifecycle requirements.
- **The security audit is fully closed:** Phase 1 (F-2 + F-3 action-layer domain enforcement), Phase 2 (F-4 webhook rate limit + timing-safe compares), Phase 3 (F-1 RPC REVOKE migration 0102 + `leads_update` `WITH CHECK` migration 0103), Phase 4 (F-5 decision). No open findings remain; the audit doc's status line and all five finding rows are marked accordingly.

**Files:** docs only — `docs/rules/The_Rules.md` (Decision Log), `docs/audits/security-audit-2026-06.md` (F-5 + status line), `docs/changelog.md`.

---

## 2026-06-11 — Security audit Phase 3 complete: scope-param RPCs revoked from clients (F-1) + explicit `leads_update` WITH CHECK

Closes the third tier of `docs/audits/security-audit-2026-06.md` — the systemic headline finding. **Typecheck + build clean; zero behaviour change for any flow the UI offers** — every page/action already passed session-derived scope; the only functional delta is that a hand-crafted browser `supabase.rpc(...)` call with forged `p_role`/`p_domain` now fails with `permission denied` instead of leaking cross-domain aggregates (activity rows, pipeline counts, campaign mix, deal revenue).

- **F-1 — all 11 Class B/C read-RPC signatures REVOKEd from `PUBLIC, anon, authenticated`** (migration `20260611000102_revoke_scope_param_rpcs.sql`), with explicit `service_role` GRANTs: `get_dashboard_summary`, `get_agent_recent_activity`, **both** `get_lead_pipeline_refresh` overloads (the 2-param one is dead code 0089 missed), `get_campaign_pipeline_refresh`, `get_deals_summary`, `get_gia_tasks`, `get_campaign_metrics`, `get_campaign_detail_metrics`, `get_campaign_agent_distribution`, `get_domain_health_metrics`. Mirrors the `get_next_round_robin_agent` (0007) / `get_active_lead_by_phone` (0008) precedent — the audit's Option A.
- **The 10 service call sites switched from the session client to `createAdminClient()`** (required — after the REVOKE a session-client `.rpc()` would fail): `dashboard-service.ts` ×4 (`getDashboardSummary`, `getAgentRecentActivity`, `getLeadStatusSummary`, `getLeadsByCampaign`), `deals-service.ts` (`getDealsSummary`), `tasks-service.ts` (`getGiaTasksForUser`), `leads-service.ts` (`fetchCampaignMetricsFromRpc`, `getCampaignDetailMetrics`, `getCampaignAgentDistribution`), `performance-service.ts` (`getDomainHealthMetrics`). Each site carries a comment pinning the Q-13 contract: scope args stay session-derived by the calling page/action.
- **Trust-boundary verification (every reachable path):** `actions/dashboard.ts` (`requireProfile` + `effectiveWidgetDomain` manager pinning) and the dashboard page (`profile.*`); `DealsAsync` ← deals page `profile.*` (manager gate keyed on server-verified `p_caller_domain`); `TasksAsync` ← tasks page `profile.*`; `CampaignListAsync` + ad-creatives page ← `profile.*` with managers pinned inside `getCampaignMetrics`; campaign detail page (auth-gated; campaign-name slice is by design); `actions/performance.ts` (`requireProfile(['manager','admin','founder'])`) + performance page — both pass the fixed `GIA_DOMAINS` list. Pre-REVOKE grep-confirm passed: every call to these RPCs lives in `lib/services/`; no `'use client'` component calls `supabase.rpc` for any of them.
- **`leads_update` explicit `WITH CHECK`** (migration `20260611000103_leads_update_explicit_with_check.sql`) — body identical to the 0091 `USING` clause (InitPlan hoist preserved). Previously the new-row gate was implicit via PostgreSQL's USING-fallback on UPDATE; now self-documenting and safe against a future column-specific `WITH CHECK` edit. Zero behaviour change.
- ***Deliberate non-changes:*** self-scoped RPCs keep their `authenticated` GRANT and stay on the session client (`get_leads_status_counts`, `can_access_wa_conversation`, `get_group_task_summaries`, `get_wa_unread_count`, `get_personal_tasks`, `get_agent_performance`, `get_agent_roster_performance` — the last two read `auth.uid()` and **must** remain session-client). Mutation RPCs remain action-gated as audited. F-5 (PII-retention decision) is Phase 4.
- **⚠️ Deploy order:** apply migration 0102 only **after (or together with)** deploying this code — the previously deployed code called these RPCs on the session client and would break if the REVOKE lands first. The new code is safe against the un-migrated DB (admin client passes either way). 0103 is order-independent.
- Docs: `docs/audits/security-audit-2026-06.md` (F-1 + `WITH CHECK` marked fixed in summary table, §1 note, §2 recommendation, fix list + status line), `supabase/migrations/CLAUDE.md` (new self-scope-or-revoke rule + 0102/0103 inventory rows), `src/lib/CLAUDE.md` (two-tier RPC scoping rule; dashboard-service registry row and the `unstable_cache`+`cookies()` reference updated — `getDashboardSummary` no longer reads cookies, `getAgentPerformanceSummary` is the new reference).

**Files:** `supabase/migrations/20260611000102_revoke_scope_param_rpcs.sql` (new), `supabase/migrations/20260611000103_leads_update_explicit_with_check.sql` (new), `src/lib/services/dashboard-service.ts`, `src/lib/services/deals-service.ts`, `src/lib/services/tasks-service.ts`, `src/lib/services/leads-service.ts`, `src/lib/services/performance-service.ts`; docs: `docs/changelog.md`, `docs/audits/security-audit-2026-06.md`, `supabase/migrations/CLAUDE.md`, `src/lib/CLAUDE.md`.

---

## 2026-06-11 — Design audit Phase 3 complete: motion discipline (M-03, M-04, M-05, M-10, L-01, L-02, DOC-06)

Closes Phase 3 of `docs/audits/design-audit-2026-06.md` (items 3.1–3.5). Two Decision Log rows in `docs/rules/The_Rules.md` cover the height-collapse exception and the 500 ms ceiling reconciliation. **Typecheck clean; zero feature-behaviour change — same fills, same collapses, same skeletons; only the animation mechanics and timings moved onto the sanctioned patterns** (the only visible deltas: loading bars complete in 0.5 s instead of 0.9 s, two fills in 0.5 s instead of 0.6 s, one accordion at 0.25 s instead of 0.28 s, the distribution bar enters as one sweep instead of per-segment stagger).

- **3.1 / M-03 — width animation retired.** `ProgressBar`, `EffortGrid` fill, `SubTaskModal` checklist progress now animate `scaleX` on a full-width fill with `transformOrigin: 'left center'` (the pattern the perf loading bars already proved); `AgentDistributionBar` segments became static flex-basis slices with one container `scaleX` entrance (per-segment `layoutId`/width keyframes deleted).
- **3.2 / M-04 + L-02 — `height: auto` collapse sanctioned, scoped, and enforced.** Decision Log: `AnimatePresence` collapse/expand may animate `height: 0 ↔ 'auto'` only with `overflow: hidden` + duration ≤ 250 ms (`EXIT_DURATION`) + opacity pairing. All mounted sites already complied except `GroupTasksTab`'s group expand (0.28 s → `EXIT_DURATION`). **Legacy unmounted `PersonalTasksTab.tsx` deleted** (carried the M-04 pattern and the L-02 single-edge border strips); its doc/comment references cleaned (`components/CLAUDE.md`, `tasks/CLAUDE.md`, `docs/tasks-page.md`, `actions/tasks.ts`, `tasks-service.ts`).
- **3.3 / M-05 + DOC-06 — 500 ms ceiling reconciled and enforced.** Decision Log: ceiling confirmed at 500 ms (`--duration-page`; new `PAGE_DURATION` export in `motion.ts`); only DNA §14.3 route progress and §16.7 chart draws may exceed it. The four 0.9 s in-panel refetch bars (`AgentPerformanceShell`, `ManagerPerformancePanel`, `DomainOverviewPanel`, `AgentDetailPanel`) and the two 0.6 s fills (`SubTaskModal`, `EffortGrid`) re-timed to `PAGE_DURATION`.
- **3.4 / M-10 — both skeleton forks onto the canonical pulse.** `LeadsTableSkeleton` (private `skelPulse` 1.5 s + inline cubic-bezier) and `ErrorLogTableSkeleton` (private `pulse`, 0.5 opacity floor) now compose `<Shimmer>` + `skeletonStagger()` from `ui/PageSkeletons` — one `eia-skeleton-pulse` (1.6 s) everywhere; both private `@keyframes` and `<style>` tags deleted. Layout and two-tone fills unchanged.
- **3.5 / L-01 — inline motion constants swept onto `motion.ts`.** `Toggle` thumb + `AvatarStack` private duplicate → `SPRING_CONFIG`; `NotificationBell` dot → new named `SPRING_BOUNCE` (400/20 — the bounce is intentional, now named); perf bars' `[0.4, 0, 0.2, 1]` → `EASE_IN_OUT`; `SubTaskModal`/`AgentDistributionBar` `[0.16, 1, 0.3, 1]` → `EASE_OUT_EXPO`; `toast-item` CSS string → `var(--ease-out-expo)`.
- ***Deliberately not touched:*** the §14.3 multi-phase route progress bar (not yet built — spec'd surface stays exempt); Recharts draw durations (§16.7 exemption); `NotificationBell`'s `whileTap` spring (not flagged); the two hand-rolled anchored panels' migration onto `usePortalAnchor` (flagged "when touched" — not a motion item).
- Docs: `docs/rules/The_Rules.md` (2 Decision Log rows), `src/components/CLAUDE.md` + `src/components/tasks/CLAUDE.md` + `docs/tasks-page.md` (PersonalTasksTab removal), `docs/audits/design-audit-2026-06.md` (Phase 3 marked complete).

**Files:** `src/lib/constants/motion.ts`, `src/components/ui/ProgressBar.tsx`, `src/components/ui/Toggle.tsx`, `src/components/ui/AvatarStack.tsx`, `src/components/ui/toast-item.tsx`, `src/components/performance/EffortGrid.tsx`, `src/components/performance/AgentPerformanceShell.tsx`, `src/components/performance/ManagerPerformancePanel.tsx`, `src/components/performance/DomainOverviewPanel.tsx`, `src/components/performance/AgentDetailPanel.tsx`, `src/components/campaigns/AgentDistributionBar.tsx`, `src/components/tasks/SubTaskModal.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/PersonalTasksTab.tsx` (deleted), `src/components/notifications/NotificationBell.tsx`, `src/components/leads/LeadsTableSkeleton.tsx`, `src/components/error-log/ErrorLogTableSkeleton.tsx`, `src/lib/actions/tasks.ts` (comment), `src/lib/services/tasks-service.ts` (comment); docs: `docs/changelog.md`, `docs/rules/The_Rules.md`, `src/components/CLAUDE.md`, `src/components/tasks/CLAUDE.md`, `docs/tasks-page.md`, `docs/audits/design-audit-2026-06.md`.

---

## 2026-06-11 — Perf Phase 4 complete: DB scalability — trigram lead search (C-2), single-scan list counts (C-1), manager list index (C-4), performance RPCs (D-2)

Closes Phase 4 of `docs/performance-audit-2026-06-11.md` — four migrations (0098–0101) + service rewiring. **Typecheck + build clean. Run the migrations BEFORE deploying the code** (every new signature is a defaults-superset of the deployed call, so old code keeps working against the new DB; new code against the old DB degrades gracefully but is not the intended state).

- **C-2 — indexable lead search (migration 0098 + `leads-service.ts`).** New STORED generated column `leads.search_text` (`first_name + last_name + email + city + phone`, Postgres-maintained) with `idx_leads_search_trgm` (pg_trgm GIN, partial on `archived_at IS NULL`). A generated column rather than an expression index because PostgREST builders can only filter real columns — the same column now backs **all four** search paths: `getLeadsByRole`, `getLeadsForExport`, `searchLeadsForTask`, and the `get_leads_status_counts` RPC, so the search predicate can never again drift between the table, the export, and the count pills. Every keystroke-debounced search was previously a sequential scan (leading-wildcard ILIKE across five columns can never use `text_pattern_ops`). Side fixes: multi-word searches ("john doe") now match across the name boundary (previously matched nothing); the `.filter()` form is immune to the `.or()` comma/paren syntax-injection edge; `searchLeadsForTask` now also matches email/city (deliberate widening — same canonical surface).
- **C-1 — one predicate scan per list load (migration 0099 + `leads-service.ts`).** `totalCount` is now the sum of `get_leads_status_counts` rows; the paginated query dropped `{ count: 'exact' }` (which forced a second full scan of the matching set on every page/filter change). **This rewrite also fixed a live production bug:** the service has passed `p_going_cold` since the going-cold preset shipped, but no DB overload ever had that parameter — PostgREST answered PGRST202 on **every** list load, the error was swallowed, and the status pills silently rendered empty. The v3 RPC (10 params, old 8-param overload dropped) restores them and closes three further predicate-parity gaps so the fold is sound: `p_domain` added (admin/founder Gia slice previously narrowed the table but not the counts), search now over `search_text` (RPC counted 3 columns while the table searched 5), and the service passes identical pre-transformed IST date bounds to both sides (`p_date_to` now inclusive `<=` matching `.lte()`). `getLeadsByRole` hoists all filter values (`dateFrom`/`dateTo`/`searchTerm`/`goingColdThreshold`/`domainSlice`) into one block consumed by both the query and the RPC. On RPC error, `totalCount` degrades to `offset + rows.length` (pager hides rather than lies) with a `[leads-service]` warning.
- **C-4 — manager list index (migration 0100).** `idx_leads_domain_created (domain, created_at DESC) WHERE archived_at IS NULL` — the manager default list (`domain = X ORDER BY created_at DESC LIMIT 30`) previously walked `idx_leads_created_at` backwards discarding other domains. Post-deploy `EXPLAIN ANALYZE` verification noted in the migration; cheap to drop if the planner never picks it.
- **D-2 — performance page aggregation moved into SQL (migration 0101 + service/action/page rewiring).** The agent self-view was a 5-function fan-out of **~17 queries** per load (core four ×4 + previous period ×4 + effort ×4 + outcomes + benchmarks ×4), several shipping every cohort lead row to Node for `.filter().length`; the manager/founder roster shipped every lead/deal/activity row for every agent. Now: `get_agent_performance(p_date_from, p_date_to, p_prev_from?, p_prev_to?)` — **self-scoped** (`auth.uid()` + `get_user_domain()` inside; no identity params, so an agent can never read another agent's metrics) — returns one jsonb with `core`/`previous`/`effort`/`outcomes`/`benchmarks` via the internal `_agent_core_metrics()` helper (EXECUTE revoked from clients, called once per period). `get_agent_roster_performance(p_date_from, p_date_to, p_domain?)` returns one pre-aggregated row per active agent (LEFT JOINs keep zero-activity agents, matching the old JS seeding); role-gated in SQL — manager always pinned to `get_user_domain()` (tightens the old behaviour where a manager calling the roster action with `allDomains=true` got cross-domain agent names), admin/founder may pass NULL for all domains, agents get zero rows. Service: new `getAgentPerformanceSummary()` (React `cache()`-wrapped; rate math + null-vs-zero stays in the mapper) and RPC-backed `getAgentRosterPerformance()` (same signature, same `AgentRosterRow[]`, byte-identical sort). `performance/page.tsx` agent branch and `getAgentSelfMetricsAction` are one call each (`AgentSelfMetrics` re-exported as an alias of `AgentPerformanceSummary` — zero churn for `AgentPerformanceShell`).
- ***Deliberate correctness change (D-2):* agent-view team benchmarks are now true domain-wide averages.** The old `getTeamBenchmarks` ran under the agent's session client, so leads RLS (`assigned_to = auth.uid()`) silently reduced the "team benchmark" to the calling agent's own rows while the label claimed "across N agents". The SECURITY DEFINER RPC computes the real per-agent-mean-of-means over the domain roster (unweighted averaging design choice preserved and documented in the migration + service); only the four aggregate numbers are exposed to agents — per-agent rows stay behind the roster RPC's manager+ gate. The `agentCount < 2 → all nulls` guard is preserved in the service.
- **Dead code deleted:** `PerformanceAsync.tsx` (mounted nowhere — the real agent view is `AgentPerformanceShell`; the stale architecture diagram in `performance/CLAUDE.md` corrected) and the six per-metric service functions (`getCoreFourMetrics`, `_getCoreFourMetricsForRange`, `getPreviousPeriodCoreMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getTeamBenchmarks`); their types (`CoreFourMetrics`, `EffortMetrics`, `OutcomeBreakdownItem`, `TeamBenchmarks`) remain exported for the display components. `PerformanceSkeleton` kept (`loading.tsx` uses it).
- **Stale-doc corrections:** `src/lib/CLAUDE.md` and `performance/CLAUDE.md` claimed a `perf:*` Redis cache-aside namespace on all six performance service functions — no such keys exist in `redis-keys.ts` or the service (the audit itself repeated the claim). Both now state plainly there is no Redis on this service and why none is needed post-RPC. `AgentRosterRow`/`PerformancePeriod` doc listings synced to the real types.
- ***Known acceptable trade-offs:*** `leads.search_text` adds one text column per row (table rewrite on migration — fast at current volume; a future million-row change would need a CONCURRENTLY rollout); `database.ts` generated types not regenerated (the new column is only filtered, never selected — regenerate with `supabase gen types` on next schema sync); `docs/database_architecture.sql` is a pre-Phase-4 dump — refresh via `supabase db dump` after applying 0098–0101.
- Docs: `src/app/(dashboard)/leads/CLAUDE.md` (Server-Side Search rewritten; param-sync rule + new Single-Scan Count Rule), `src/app/(dashboard)/performance/CLAUDE.md` (agent-view architecture, service table, Redis correction, type listings), `src/lib/CLAUDE.md` (leads + performance registry rows), `supabase/migrations/CLAUDE.md` (4 inventory rows), `docs/master.md` (§9 migration index → 102, TOC + file-map counts), `docs/performance-audit-2026-06-11.md` (C-1/C-2/C-4/D-2 + Phase 4 marked fixed).

**Files:** `supabase/migrations/20260611000098_leads_search_text_trgm.sql` (new), `supabase/migrations/20260611000099_status_counts_total_fold.sql` (new), `supabase/migrations/20260611000100_leads_domain_created_index.sql` (new), `supabase/migrations/20260611000101_agent_performance_rpcs.sql` (new), `src/lib/services/leads-service.ts`, `src/lib/services/performance-service.ts`, `src/lib/actions/performance.ts`, `src/app/(dashboard)/performance/page.tsx`, `src/app/(dashboard)/performance/PerformanceAsync.tsx` (deleted); docs: `docs/changelog.md`, `docs/performance-audit-2026-06-11.md`, `docs/master.md`, `src/app/(dashboard)/leads/CLAUDE.md`, `src/app/(dashboard)/performance/CLAUDE.md`, `src/lib/CLAUDE.md`, `supabase/migrations/CLAUDE.md`.

---

## 2026-06-11 — Security audit Phase 2 complete: webhook ingress hardening (F-4 + timing-safe Bearer compare)

Closes the second tier of `docs/security-audit-2026-06.md` — both items code-only, no schema, no migration. **Typecheck clean; zero behaviour change for legitimate traffic** (the leads route keeps its exact 100/60s window; the WhatsApp cap is sized well above real Gupshup volume; auth outcomes are identical for every valid/invalid secret).

- **F-4 — WhatsApp webhook is now rate-limited.** The leads route's in-memory fixed-window limiter was extracted to `createRateLimiter({ windowMs, max })` + `getClientIp()` in `src/lib/utils/webhook.ts` (per-route instances at module scope, so the two webhooks' windows are isolated). `api/webhooks/whatsapp/route.ts` now checks the limit **before** `req.text()` (drop before amplification, S-17) and returns 429. Cap is 300/60s vs leads' 100/60s — Gupshup legitimately sends up to 3 delivery-receipt POSTs per outbound message plus billing pings from its own egress IPs, and a 429 on excess only triggers a BSP retry.
- **Polish — timing-safe secret compares everywhere.** New shared `safeSecretCompare()` (`timingSafeEqual` + length guard) in `utils/webhook.ts`. The leads route's plain `!==` Bearer compare now uses it (the audit's optional polish item, batched here since the surface was already open); the WA route's local `verifyGupshupSecret` was collapsed onto it — byte-identical behaviour, one canonical implementation.
- ***Deliberate non-changes:*** F-1 (Class B/C RPC `REVOKE` migration) and the `leads_update` explicit `WITH CHECK` wait for Phase 3 — both need a migration plus the grep-confirm that no client calls those RPCs directly. F-5 stays a documented decision, no code.
- Docs: `docs/security-audit-2026-06.md` (F-4 + timing-safe items marked fixed in summary, §6, and fix list), `src/app/api/webhooks/CLAUDE.md` (route contract now has four rules: parse guard, rate-limit-before-body, timing-safe compare, `after()`/`maxDuration`).

**Files:** `src/lib/utils/webhook.ts`, `src/app/api/webhooks/leads/route.ts`, `src/app/api/webhooks/whatsapp/route.ts`; docs: `docs/changelog.md`, `docs/security-audit-2026-06.md`, `src/app/api/webhooks/CLAUDE.md`.

---

## 2026-06-11 — Design audit Phase 2 complete: token-map additions + colour unification (H-01, H-03, M-02, M-07, M-08*, M-09, L-03, L-04, L-06, DOC-02)

Closes Phase 2 of `docs/design-audit-2026-06.md` (items 2.1–2.6). One Decision Log batch in `docs/The_Rules.md` covers every token addition. **Typecheck clean; the only intentional visual changes are bug fixes** (revive-button contrast, SubTaskModal delete-button red, agent-distribution palette); everything else is byte- or near-identical (the `--status-*-solid` tokens carry the exact former hexes, `--color-*-fg` is the same white `--theme-text-inverse` resolved to).

- **2.1 / H-01 — `BAR_COLORS` hex map retired.** New saturated token tier `--status-{name}-solid` ×7 in `design-tokens.css` (same hex values); `ManagerLeadStatusWidget` now references the tokens and the false "SVG-equivalent divs" exception comment is deleted. The 2026-06-04 Decision Log exception is formally superseded (new entry + exceptions table updated in `The_Rules.md` — V-01 now has exactly one sanctioned hex exception: the `useChartTokens` FALLBACK).
- **2.2 / H-03 + L-03 + M-08 — `--color-{success,warning,danger}-fg` family added** (white label on saturated semantic fills). Adopted: `ConfirmDialog` (drops the `, #fff` fallback), `SubTaskModal` delete button (also fixes the off-system `--color-danger-text`-as-background → `--color-danger`), `StatusActionPanel` success variant + success/revive confirm styles (**fixes the revive contrast failure** — dark-amber-on-amber → white-on-amber), `WonDealModal` success CTAs + selected radio dot (was `--theme-text-inverse` as paint).
- **2.3 / M-02 + L-06 + DOC-02 — overlay contract written and enforced.** Modal backdrops = Dialog's `color-mix(in srgb, var(--theme-canvas) 72%, transparent)` (SubTaskModal migrated off `rgba(0,0,0,0.72)`); panel/sheet backdrops = `--overlay-bg-light` (NotificationPanel mobile backdrop migrated off `rgba(0,0,0,0.4)`; its off-scale `calc(var(--z-dropdown) - 1)` → `var(--z-raised)`); image scrims = new `--overlay-scrim` token (ProfileAvatarSection ×2 migrated off `rgba(0,0,0,0.52)` — same value, now tokenised). Contract table added to `src/components/CLAUDE.md` (Overlays); the stale "`var(--theme-overlay)` backdrop with `blur(4px)`" SubTaskModal description corrected (that token never existed).
- **2.4 / M-07 — `CallOutcomeBar` uses the canonical colour bridge.** Private `resolveVar()` with its off-map `'#888'` fallback deleted; donut fills resolve via `resolveColorMap()` from `useChartTokens.ts` (theme-change re-resolution comes free via the existing `useChartTokens()` re-render).
- **2.5 / M-09 — agent-distribution palette de-semanticised.** `AgentDistributionBar` segment cycle `accent → info → success → warning → danger` → five non-semantic `--domain-*` mid-tones (concierge/finance/marketing/tech/b2b). Agents are categorical data — agent #5 no longer reads as "danger red".
- **2.6 / L-04 — `--shadow-gold-shimmer` scoped to Earth.** Was `[data-theme="earth"], :root` (leaked gold to all themes); now `:root { none }` + Earth-only definition — any future non-Earth consumer degrades to no shadow instead of an invalid declaration.
- ***Deliberately not touched:*** `Button.tsx`'s `--theme-text-inverse` danger/success hover (documented grandfathered drift); the full M-08 "route StatusActionPanel variants through `Button`" restructure (riskier; the contract violations are fixed, the refactor can ride a later pass); all motion items (M-03/M-04/M-05/M-10/L-01 are Phase 3).
- Docs: `docs/The_Rules.md` (exceptions block rewritten + 5 Decision Log rows), `src/components/CLAUDE.md` (overlay contract + DOC-02 fix), `docs/design-audit-2026-06.md` (Phase 2 marked complete).

**Files:** `src/styles/design-tokens.css`, `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx`, `src/components/ui/ConfirmDialog.tsx`, `src/components/tasks/SubTaskModal.tsx`, `src/components/leads/StatusActionPanel.tsx`, `src/components/leads/WonDealModal.tsx`, `src/components/notifications/NotificationPanel.tsx`, `src/components/profile/ProfileAvatarSection.tsx`, `src/components/performance/CallOutcomeBar.tsx`, `src/components/campaigns/AgentDistributionBar.tsx`; docs: `docs/The_Rules.md`, `src/components/CLAUDE.md`, `docs/changelog.md`, `docs/design-audit-2026-06.md`.

---

## 2026-06-11 — Security audit Phase 1 complete: action-layer domain enforcement (F-2, F-3)

Closes the first tier of `docs/security-audit-2026-06.md` — the two real authorization gaps with tiny, no-schema diffs. **Typecheck clean; zero behaviour change for any flow the UI offers** (the settings roster and the dossier reassign picker were already domain-scoped server-side — these checks close only the hand-crafted direct-call path).

- **F-2 — `toggleAgentRouting` now enforces manager domain ownership.** `lib/actions/agent-routing.ts`: manager callers are verified via `getProfileById(agent_id).domain === caller.domain` — the exact check its sibling `setAgentShiftAction` already had. Previously any manager could flip the routing-pool switch for an agent in **any** domain (the `agent_routing_config` RLS UPDATE policy is role-only, so the action is the only enforcement point). Admin/founder unchanged.
- **F-3 — `assignLead` now enforces lead-domain + target-agent-domain for managers.** `lib/actions/leads.ts`: a manager caller must own the lead's domain (`formErrors.unauthorized` otherwise), and the target agent must be an **active** member of the lead's domain ("The selected user is not available in this domain." — same copy as `createManualLead`'s sibling check). Implemented by extending the existing agent fetch to `full_name, domain, is_active` — zero extra DB round-trips. Admin/founder remain deliberately unrestricted (cross-domain assignment is their prerogative).
- ***Deliberate non-changes:*** F-1 (RPC REVOKE migration), F-4 (WhatsApp webhook rate limit), and the polish items (`leads_update` explicit `WITH CHECK`, timing-safe Bearer compare) wait for the next phases per the audit's suggested order.
- Docs: `docs/security-audit-2026-06.md` F-2/F-3 marked fixed.

**Files:** `src/lib/actions/agent-routing.ts`, `src/lib/actions/leads.ts`; docs: `docs/changelog.md`, `docs/security-audit-2026-06.md`.

---

## 2026-06-11 — Design audit Phase 1 complete: broken token references and dead code (C-01…C-03, H-04, M-01, M-06, L-05)

Closes Phase 1 of `docs/design-audit-2026-06.md` — the zero-design-decision tier: every change replaces an undefined/off-system value with the already-defined canonical token. **Typecheck clean; no new tokens, no visual redesign — three of these are bug fixes for declarations the browser was silently dropping.**

- **C-01 — going-cold filter regains its active fill.** `LeadsTable.tsx` toggle background `var(--color-warning-subtle)` (undefined → declaration dropped) → `var(--color-warning-light)` (defined base + per-theme overrides). The just-shipped lead-health toggle now shows its warning tint when active.
- **C-02 — cold-leads widget hover no longer turns the card transparent.** `ManagerColdLeadsWidget.tsx` mouseenter background `var(--theme-paper-hover)` (undefined) → `var(--theme-paper-subtle)` (the canonical paper hover fill).
- **C-03 — tasks-calendar "Back To Present" button regains vertical padding.** `MyTasksCalendarView.tsx` `var(--space-1-5)` (no such step in the spacing scale) → `var(--space-2)` (8px).
- **H-04 — hero numbers typeset by Eia's scale, not Tailwind v4's default theme.** `--text-4xl` → `var(--text-3xl)` (ManagerColdLeadsWidget count); `--text-5xl` → `var(--text-display)` (AgentPerformanceShell Calls Today + Notes Today). Rendered sizes are identical (`2.25rem`/`3rem`) — the values previously resolved from `node_modules/tailwindcss/theme.css` by coincidence; they now come from `design-tokens.css`.
- **M-01 — dead invalid overlay declaration deleted from the Dialog primitive.** Removed `background: 'rgba(var(--theme-canvas, 10 10 10) / 0.72)'` (hex var in an RGB-triplet slot — always invalid, always dropped); the valid `color-mix` line it shadowed is unchanged and remains the sole overlay paint.
- **M-06 — three raw z-index values onto the `--z-*` scale** (codebase cast idiom `'var(--z-…)' as React.CSSProperties['zIndex']`): `WhatsAppConversationPeriodFilter` dropdown `50` → `--z-dropdown` (20), `ManagerPerformancePanel` domain dropdown `50` → `--z-dropdown` (20), `Calendar` month-picker overlay `10` → `--z-raised` (10). The two dropdowns were sitting at the overlay level; they now stack where dropdowns belong (still above all page content; computed value only matters against other layered surfaces, where 20 is correct).
- **L-05 — `globals.css` body text colour onto the token.** `rgb(255 255 255 / 0.9)` → `var(--theme-canvas-text)` (0.82–0.88 per theme). The `background-color` literal split stays — that is the documented load-flash exception.
- ***Deliberate non-changes:*** the two `zIndex: 50` sites were *not* migrated onto `usePortalAnchor`/`FloatingPanel` (audit suggests it "when touched" — that is a Phase 3-scale refactor, not a Phase 1 token swap); H-02 (canvas-gradient Earth bleed) and all token-map additions wait for Phase 2/4 as planned.
- Docs: `docs/design-audit-2026-06.md` Phase 1 marked complete.

**Files:** `src/components/leads/LeadsTable.tsx`, `src/components/dashboard/widgets/ManagerColdLeadsWidget.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`, `src/components/performance/AgentPerformanceShell.tsx`, `src/components/ui/Dialog.tsx`, `src/components/whatsapp/WhatsAppConversationPeriodFilter.tsx`, `src/components/performance/ManagerPerformancePanel.tsx`, `src/components/ui/Calendar.tsx`, `src/app/globals.css`; docs: `docs/changelog.md`, `docs/design-audit-2026-06.md`.

---

## 2026-06-11 — Design audit delivered (`docs/design-audit-2026-06.md`)

Read-only design audit of all 162 `src/components` files + `src/app` + token sheets against CLAUDE.md / DESIGN-DNA / design-system.md. **No source modified — audit document only.** Findings: 3 Critical (undefined tokens silently breaking shipped UI: going-cold fill, widget hover, Today-button padding), 4 High (hardcoded status hex map, Earth canvas-gradient bleed into the 4 non-Earth themes, undefined `--color-danger-fg`, off-system `--text-4xl/5xl` riding Tailwind v4's default theme), 10 Medium, 6 Low, 6 doc-drift notes. Includes per-theme missing-token table, 162-file sweep coverage appendix, and a 4-phase remediation plan.

---

## 2026-06-11 — Security audit delivered (`docs/security-audit-2026-06.md`)

Read-only security audit of the six surfaces (RLS policies, SECURITY DEFINER RPCs, `createAdminClient()` sites, server-action role/domain enforcement, Redis key isolation, webhook ingress) against the live codebase + `docs/database_architecture.sql`. **No source modified — audit document only.** Foundation is solid (RLS on every table, role×domain matrix correct, search_path set on all 30 SECURITY DEFINER fns, secrets server-only, webhook auth correct). Findings: F-1 (medium) a class of dashboard/campaign/deals/gia RPCs trust caller-supplied `p_role`/`p_domain` and are `GRANT`-ed to `authenticated` → directly callable from the browser, leaking cross-domain aggregates (Q-13); F-2 (medium) `toggleAgentRouting` lacks a manager-domain check; F-3 (medium) `assignLead` doesn't verify lead-domain or target-agent-domain; F-4 (low) WhatsApp webhook unthrottled; F-5 (note) `lead_raw_payloads` PII retention. Fix list ordered lightest-first; mutation RPCs verified not exploitable via the direct path.

---

## 2026-06-11 — Perf Phase 3 complete: heavy modals load on intent (G-1), list rows memoised (G-4)

Closes Phase 3 of `docs/performance-audit-2026-06-11.md` (items G-1 + G-4, P1 — client bundle & rendering). **Typecheck + build clean; zero schema changes; zero feature-behaviour change — same modals, same entrance/exit animations, the chunks just load when first opened.**

- **G-1 — all six heavy modals are now `next/dynamic` (`ssr: false`), fetched on first open instead of shipping in their route's initial chunk:** `AddLeadModal` (in `AddLeadButton`), `NewDealModal` (in `AddDealButton`), `CreateLeadTaskModal` (in `LeadTasksCard`), `LeadColumnPicker` + its @dnd-kit chain (in `LeadsTable`), `SubTaskModal` (1,672 lines — in `GroupTasksTab`, `MyTasksCalendarView`, `GroupTaskWorkspace`), `CreateGroupTaskModal` (974 lines — in `GroupTasksTab`). Declared at module scope via the named-export form (`dynamic(() => import('…').then((m) => m.X), { ssr: false })`); type exports (`SubTaskModalTaskUpdate`, `GroupTaskWithMeta`) stay as `import type` from the real module. Call sites that already conditional-rendered the modal (`{open && …}` in `AddDealButton`; call-site `AnimatePresence` in `LeadTasksCard` and the three `SubTaskModal` sites) keep their structure byte-identical — the dynamic import alone defers the chunk. Build verified: each modal lands in its own async chunk.
- **NEW `src/hooks/useMountOnFirstOpen.ts`** — `useMountOnFirstOpen(open)`, THE mount latch for the three call sites that previously kept the modal permanently mounted (`AddLeadButton`, `LeadsTable` column picker, `GroupTasksTab` create modal). Conditional-rendering those on `open` alone would have cut the exit animation that `Dialog`/`LeadColumnPicker` own internally (`<AnimatePresence>{open && …}` *inside* the component); the latch defers the chunk until first open, then keeps the component mounted so `open=false` still plays the internal exit. Never re-implement the latch inline; call sites with a call-site conditional don't need it.
- **G-4 — targeted `memo()` on exactly the three list rows the audit named (no blanket memoisation):**
  - `LeadsTable`: `LeadRow` wrapped in `memo`; `toggleOne` `useCallback`'d (the `selected` prop was already a primitive — the per-render arrow was the blocker). A checkbox toggle now re-renders only the affected row instead of all 30 rows × 11 cells.
  - `GroupTasksTab`: `GroupRow` wrapped in `memo`; the `onToggle` prop signature changed `() => void` → `(groupId: string) => void` so the parent passes one stable `useCallback`'d `toggleGroup` instead of a fresh arrow per row (both internal call sites pass `group.id`). Expand/collapse and filter keystrokes now skip untouched rows.
  - `MyTasksCalendarView`: the inline row JSX in `renderSection` extracted into module-scope `CalendarTaskRow` (memo). Hover state lives in the parent (`hoveredTaskId`), so every mouseenter re-rendered every row in every section; now only the two rows whose `highlighted` flag flips re-render. `handleRowClick` `useCallback`'d; render output byte-identical (same motion entrance + stagger; border/due-chip logic via new `isLast`/`showDue` primitive props; `effectiveStatus`/`canComplete` computed in the parent map exactly as before).
- ***Known acceptable trade-offs:*** first open of each modal pays one lazy-chunk fetch (hidden behind the entrance animation, cached afterwards); `handleToggle` from `useTaskCompletionToggle` still changes identity on optimistic toggles (rows legitimately re-render then) — the hook is shared by 5 consumers and was deliberately left untouched.
- ***Deliberate non-changes:*** `PersonalTasksTab` (legacy, mounted nowhere) keeps its static `SubTaskModal` import — dead code the bundler never includes; `CreatePersonalTaskModal` stays static in `MyTasksCalendarView` (not on the audit's G-1 list; it composes chrome already in the chunk); G-2 (`LazyMotion`) and G-3 (lazy Recharts on /performance) remain Phase 5 items.
- Docs: `CLAUDE.md` (file map — `useMountOnFirstOpen` row), `src/components/CLAUDE.md` (new "Heavy modal loading rule"), `src/components/tasks/CLAUDE.md` (SubTaskModal/GroupTasksTab/MyTasksCalendarView notes), `src/components/leads/CLAUDE.md` (AddLeadModal/LeadColumnPicker/LeadTasksCard notes), `docs/performance-audit-2026-06-11.md` (G-1 + G-4 + Phase 3 marked fixed).

**Files:** `src/hooks/useMountOnFirstOpen.ts` (new), `src/components/leads/AddLeadButton.tsx`, `src/components/deals/AddDealButton.tsx`, `src/components/leads/LeadTasksCard.tsx`, `src/components/leads/LeadsTable.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`, `src/components/tasks/CLAUDE.md`, `src/components/leads/CLAUDE.md`, `docs/performance-audit-2026-06-11.md`.

---

## 2026-06-11 — Perf Phase 2 complete: lead dossier streams (item B) — wave-1 paint, 5 async Suspense children, dossier loading.tsx

Closes Phase 2 of `docs/performance-audit-2026-06-11.md` (item B, P0 — the most-used page was a 3-wave fetch waterfall with almost no streaming). **Typecheck + build clean; zero schema changes; zero feature-behaviour change — every card renders byte-identical props, they just arrive by streaming.**

- **`leads/[id]/page.tsx` blocks only on wave 1** — `Promise.all(getCurrentProfile(), getLeadBySlug(id) ?? getLeadById(id))` (slug→UUID fallback kept). The header, `StatusActionPanel`, `PersonalDetailsCard`, `DynamicFormResponses`, and `LeadNotesInput` need only wave 1 and paint in one round trip. The old page-level 6-way `Promise.all` (notes, activities, ad creatives, agents, conversation, deal) and the **serial third wave** (`await getMessages` after the conversation resolved) are gone from the critical path.
- **Five new self-fetching async server components in `src/components/leads/`** (the established `LeadTasksAsync` pattern — direct `<Suspense>` child, sole dossier call site for its service, delegates to the existing display component): `LeadInfoCardAsync` (ad creatives + reassign agents in `Promise.all`; derives `assigneeName`), `LeadDealCardAsync` (renders `LeadDealCard` only when `getLeadDeal` is non-null; paired with `fallback={null}` — most leads have no deal, a skeleton would flash + shift layout), `LeadNotesSectionAsync`, `LeadActivitiesAsync` (**one** `getLeadActivitiesFull` fetch renders both `LeadJourneyTimeline` and `LeadActivityLog` — deliberately not two boundaries, same data would mean a double query; owns both sections' margins so the fallback mirrors them), `LeadWhatsAppCardAsync` (the conversation→messages serial hop now lives **inside** the boundary, off the page's critical path). All fetches key on `lead.id` (UUID), never the URL param. Access flags stay computed in wave 1 and flow down as props — children never call `getCurrentProfile()` (preserves the A-1 single-auth-check win).
- **NEW `src/components/leads/LeadDossierSkeletons.tsx`** — `DossierCardSkeleton({ headerWidth?, rows? })`, the one generic dossier paper-card fallback (subtle header strip + staggered shimmer rows, same chrome as `LeadTasksCardSkeleton`), composed from `Shimmer`/`skeletonStagger` (`ui/PageSkeletons`). Used by every dossier Suspense fallback and the new loading file.
- **NEW `leads/[id]/loading.tsx`** — dossier-shaped navigation skeleton (back-button circle + title header, status strip, two-column card shells, notes/journey/activity sections). Previously navigation showed the parent **list** skeleton (`leads/loading.tsx`) — wrong shape, felt broken-then-jumpy.
- **Impact:** dossier first paint goes from "after ~10 queries (3 sequential waves)" to "after the wave-1 pair", with all six sections streaming in independently (Redis 120s keys unchanged — invalidation contracts in `lead-cache.ts` untouched).
- Docs: `src/app/(dashboard)/leads/CLAUDE.md` (dossier section rewritten — streaming table + do-not-regress rules), `src/components/leads/CLAUDE.md` (display-only header notes the `*Async` exception; async-children + skeleton inventory; service dependency map), `docs/lead-page.md` §7a (fetch table → streaming table; also corrected the stale claim that notes/activities query by URL param — they key on `lead.id`), `docs/performance-audit-2026-06-11.md` (item B + Phase 2 marked fixed).

**Files:** `src/app/(dashboard)/leads/[id]/page.tsx`, `src/app/(dashboard)/leads/[id]/loading.tsx` (new), `src/components/leads/LeadInfoCardAsync.tsx` (new), `src/components/leads/LeadDealCardAsync.tsx` (new), `src/components/leads/LeadNotesSectionAsync.tsx` (new), `src/components/leads/LeadActivitiesAsync.tsx` (new), `src/components/leads/LeadWhatsAppCardAsync.tsx` (new), `src/components/leads/LeadDossierSkeletons.tsx` (new); docs: `src/app/(dashboard)/leads/CLAUDE.md`, `src/components/leads/CLAUDE.md`, `docs/lead-page.md`, `docs/performance-audit-2026-06-11.md`.

---

## 2026-06-11 — Perf Phase 1 complete: notifications seed streams (A-2), TasksAsync single wave (E-1/E-2), roster queries parallel (D-1)

Closes Phase 1 of `docs/performance-audit-2026-06-11.md` (items A-2, E-1, E-2, D-1; A-1 in the previous entry). **Typecheck + build clean; zero schema changes.**

- **A-2 — notifications seed off the layout's blocking path.** `(dashboard)/layout.tsx` no longer `await`s `getNotifications(profile.id)` — it starts the promise and passes it to `Sidebar` as `notificationsPromise` (the `initialNotifications` array prop is gone). `Sidebar.tsx` unwraps it with React `use()` inside a new `<Suspense>` boundary (`SeededNotificationBell`), with a static same-size `BellFallback` (32px, sidebar-text Bell icon) so there is no layout shift while the seed streams in. The shell, page, and every Async child no longer wait one DB round trip for a bell icon. Safe because `getNotifications` catches errors and returns `[]` — the promise can never reject into `use()`. The bell's own contract is unchanged: `useNotifications` still seeds from `initialData` and owns Realtime.
- **E-1 — TasksAsync is one fetch wave.** The hoisted `getAssignableUsers()` + `getPersonalTaskTags()` pair and the active tab's data (`getPersonalTasks` / `getGroupTasks` / `getGiaTasksForUser`) were two sequential waves; the tab fetch depends on neither, so all five now run in a single `Promise.all` (inactive tabs resolve empty sentinels).
- **E-2 — tags fetched only on the personal tab.** `needsTags` was `tab === 'personal' || validTabs.includes('personal')` — always true, so Gia and Group tab loads paid the tags query too. Now strictly `tab === 'personal'`. **Companion fix that makes this safe:** `TasksShell` seeded `personalTagItems` via `useState(initialTags)` (mount-only) and never remounts on tab switches (per-tab filter state must survive) — narrowing the fetch alone would have frozen the tag filter at `[]` for users landing on gia/group and switching to My Tasks. A new `useEffect` re-seeds `personalTagItems` from the `initialTags` prop on every personal-tab RSC pass (`initialTab === 'personal'`). The `onTagsMayHaveChanged` post-create refresh is untouched.
- **D-1 (quick fix) — `getAgentRosterPerformance` queries 2–5 parallelised.** Roster query 1 still gates (produces `agentIds`); the four downstream queries (period lead cohort, won/lost closed leads, deal revenue, first-touch activities) were sequential `await`s and are now one `Promise.all` — 5 serialised round trips → 2 waves. Aggregation logic byte-identical. The single-RPC consolidation remains the Phase 4 item (D-2).
- Docs: tasks CLAUDE.md SSR-hoists section + notifications CLAUDE.md hook section updated to match.

**Files:** `src/app/(dashboard)/layout.tsx`, `src/components/layout/Sidebar.tsx`, `src/app/(dashboard)/tasks/TasksAsync.tsx`, `src/app/(dashboard)/tasks/TasksShell.tsx`, `src/lib/services/performance-service.ts`; docs: `src/app/(dashboard)/tasks/CLAUDE.md`, `src/components/notifications/CLAUDE.md`, `docs/performance-audit-2026-06-11.md` (status markers).

---

## 2026-06-11 — Perf Phase 1 / A-1: `getCurrentProfile()` React `cache()`-wrapped; duplicate layout auth check removed

First fix from `docs/performance-audit-2026-06-11.md` (item A-1, P0). `auth.getUser()` is a network round trip to the Supabase Auth server (~50–150ms from a Vercel lambda), and every navigation paid it 3–4 times: proxy → layout's standalone `getUser()` → layout's `getCurrentProfile()` → the page's own `getCurrentProfile()` — with the profiles row SELECTed twice.

- **`src/lib/services/profiles-service.ts`** — `getCurrentProfile` is now `export const getCurrentProfile = cache(async () => …)` (React `cache()`, per the established `getDashboardSummary` pattern — `unstable_cache` is forbidden here because `createClient()` reads `cookies()`). Within one RSC render pass the layout, page, and every Async child now share a single auth check + profile SELECT. Server actions are separate requests and still re-verify fresh — Rule 09 unaffected. `loginAction` verified safe: it calls `getCurrentProfile()` exactly once, after `signInWithPassword`, so the memo can never serve a pre-login null.
- **`src/app/(dashboard)/layout.tsx`** — the standalone `createClient()` + `auth.getUser()` block deleted; `getCurrentProfile()` already returns `null` with no session, and the existing `if (!profile) redirect("/login")` covers it. The `createClient` import is gone from the layout entirely.
- **Impact:** −2 auth network round trips and −1 duplicate profiles SELECT on every dashboard navigation (more on multi-fetch pages like the dossier). Zero behaviour change — same redirects, same guard order, same RLS. Typecheck + build clean.

**Files:** `src/lib/services/profiles-service.ts`, `src/app/(dashboard)/layout.tsx`.

---

## 2026-06-11 — Performance audit report: `docs/performance-audit-2026-06-11.md`

Full-codebase performance audit (no code changes — audit + phased fix plan only). Swept the app shell, all 8 primary pages, every service/action, the Redis layer, the index inventory, and client bundle composition. Headline findings: (1) `getCurrentProfile()` is not React `cache()`-wrapped — 3–4 sequential `auth.getUser()` network round trips + a duplicate profiles SELECT on **every** navigation (proxy → layout → layout-profile → page-profile); (2) `(dashboard)/layout.tsx` blocks the entire shell on a sequential `getNotifications` await; (3) the lead dossier is a 3-wave fetch waterfall (profile+lead → 6-way Promise.all → serial `getMessages`) with no dossier-shaped `loading.tsx` and almost no streaming; (4) zero `next/dynamic` anywhere — `AddLeadModal`, `SubTaskModal` (1,672 lines), `NewDealModal`, `CreateGroupTaskModal` all ship in their routes' initial chunks; plus zero `React.memo` and no `LazyMotion`. Secondary: un-indexed leading-wildcard ILIKE search on leads (needs `pg_trgm`), the leads list running its filter predicate twice (exact count + status-counts RPC), `getAgentRosterPerformance`'s five sequential awaits and JS-side row aggregation, and `TasksAsync`'s avoidable second fetch wave. The report also lists what must NOT change (dashboard RPC consolidation, Redis design, Realtime patterns, the index inventory) and a 5-phase fix plan with measurement steps.

**Files:** `docs/performance-audit-2026-06-11.md` (new).

---

## 2026-06-11 — DRY audit PR 11 (final): deferred items closed — M-8, L-3, L-6, L-7, L-8; `docs/dry-audit-master.md` deleted

Eleventh and closing PR from the DRY audit. PRs 1–10 covered every high/medium sequenced item; this PR closes the five items the audit deferred, after which **the audit report itself is deleted** — every completed item is recorded in this changelog, the forward-looking corrections live in the relevant `CLAUDE.md` files (sla.ts exemption in `src/lib/actions/CLAUDE.md`; DatePicker/TimePicker/FilterDropdown migrate-last note in root `CLAUDE.md` Pattern Notes), and nothing unresolved remains to point at. **Typecheck + build clean; zero behaviour change except the deliberate items below.**

- **M-8 — NEW `src/lib/utils/webhook.ts`** — `readJsonBody(request)` + `parseJsonBody(raw)` (for routes that read `req.text()` first for HMAC), both returning `{ ok, body } | { ok: false, response }`. Adopted at all 3 parse sites (`webhooks/leads` ×1, `webhooks/whatsapp` ×2). The `withWebhook` wrapper the audit floated was deliberately NOT built — the two routes have genuinely different auth/branching structures; the `maxDuration` + `after()` contract stays per-route, now written down in `src/app/api/webhooks/CLAUDE.md` ("Route contract"). *Deliberate copy unification:* the whatsapp route's 400 body changes `'Invalid JSON'` → `'Invalid JSON body'` (non-contractual error text).
- **L-3 — `WithAuthor<T>` / `WithAssignee<T>` / `WithActor<T>` in `src/lib/types/index.ts`** — the six hand-written join intersections rewritten: `LeadNoteWithAuthor`, `LeadActivityWithActor`, `LeadWithAssignee`, `LeadListItemWithAssignee` (leads-service), `SubtaskWithAssignee`, `TaskRemarkWithAuthor` (tasks-service, via `AssigneeSlim`). Type-only — zero runtime change.
- **L-6 — NEW `src/lib/utils/rows.ts`** — `mapRows<TRow, TOut>(data, fn)`, THE typed boundary for untyped query results. `whatsapp-service.ts` gains declared `WaConversationRow` / `WaMessageRow` shapes (derived from the app types via `Omit` + joined relation): all 5 `as Record<string, unknown>` casts and ~30 per-field `as` assertions gone, and `getConversation`'s inline duplicate of `mapConversationRow`'s body (a mini-fork the audit missed) collapsed into the one mapper; new `mapMessageRow` extracted the same way. `performance-service.ts` `getDomainHealthMetrics` gains `DomainHealthRpcRow`. *Deliberate non-changes:* the `JSON.parse` casts in `whatsapp-api.ts` (external HTTP bodies) and the payload-sanitiser spreads in `lead-ingestion.ts` (unknown webhook JSON) are not row mappers and stay.
- **L-7 — NEW `src/lib/constants/define-enum.ts`** — `defineEnum([{ id, label }])` derives `values` / `labels` / `options` / `zodEnum` from one source array. Migrated with byte-identical export names (zero call-site edits): `lead-sources.ts` (LEAD_SOURCES + LABELS + OPTIONS + ENUM from one def), `deal-types.ts` (both enums), `task-types.ts` (both — explicit `TaskType[]` / `Record<TaskType, string>` annotations keep the DB-union exhaustiveness check the hand-written records had), `call-outcomes.ts`. Bonus: `lead-ingestion.ts`'s redundant `LEAD_SOURCES_TUPLE = LEAD_SOURCES as unknown as […]` cast deleted — it now imports the existing `LEAD_SOURCE_ENUM`. *Deliberate scope limit (documented in the factory header + `src/lib/CLAUDE.md`):* richer config tables (`TASK_PRIORITY`/`TASK_STATUS` colour shapes, lead-status badge configs, domain/role subset structures) stay hand-written — their extra fields are their structure.
- **L-8 — NEW `src/components/ui/StatTile.tsx`** — `<StatTile label value sub? variant>`: `'card'` (paper chrome, micro label over 2xl semibold value, optional coloured sub-line) and `'cell'` (bare centred cell, mono accent value over micro label). Adopted: `CampaignMetricsStrip`'s local `StatCard` deleted (its `SubLabel` type is now an alias of `StatTileSub`), `DealsSummaryStrip`'s local `StatCell` deleted (`variant="cell"`). Per the audit's own caution, performance `MetricCard` is NOT merged — its delta/sparkline/motion decoration stays bespoke, with an in-file comment pointing new plain tiles at `StatTile`.
- **`docs/dry-audit-master.md` DELETED.** Remaining opportunistic adoptions are conventions recorded in `CLAUDE.md` files, not open audit items: the ~15 single-line italic empties adopt `<EmptyState>` when touched; `DatePicker`/`TimePicker`/`FilterDropdown` migrate onto `usePortalAnchor` last; `AssigneeInlinePicker` extracts when a second consumer appears.
- Doc pointers: root `CLAUDE.md` (file map ×4), `src/lib/CLAUDE.md` (define-enum registry row, mapRows section, types/index.ts row), `src/components/CLAUDE.md` (StatTile row), `src/app/api/webhooks/CLAUDE.md` (route contract section).

**Files:** `src/lib/utils/webhook.ts` (new), `src/lib/utils/rows.ts` (new), `src/lib/constants/define-enum.ts` (new), `src/components/ui/StatTile.tsx` (new), `src/app/api/webhooks/leads/route.ts`, `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/types/index.ts`, `src/lib/services/leads-service.ts`, `src/lib/services/tasks-service.ts`, `src/lib/services/whatsapp-service.ts`, `src/lib/services/performance-service.ts`, `src/lib/services/lead-ingestion.ts`, `src/lib/constants/lead-sources.ts`, `src/lib/constants/deal-types.ts`, `src/lib/constants/task-types.ts`, `src/lib/constants/call-outcomes.ts`, `src/components/campaigns/CampaignMetricsStrip.tsx`, `src/components/deals/DealsSummaryStrip.tsx`, `src/components/performance/CoreFourGrid.tsx`; docs: `CLAUDE.md`, `src/lib/CLAUDE.md`, `src/components/CLAUDE.md`, `src/app/api/webhooks/CLAUDE.md`, `docs/dry-audit-master.md` (deleted).

---

## 2026-06-11 — DRY audit PR 10: `TaskFormFields` shared task-form primitives (H-3 + L-4)

Tenth and final sequenced refactor PR from `docs/dry-audit-master.md`. The task-creation form was forked five ways (`CreatePersonalTaskModal`, `CreateGroupTaskModal`, `CreateGiaTaskModal`, `SubTaskModal`, `leads/CreateLeadTaskModal`), each re-expressing the same design-system elements — priority chips (four divergent expressions), field labels (three), due-date fields, inline errors, and the task-type radio list — plus hand-rolled footer submit buttons that bypassed `Button`. **The four create modals shrank 2,587 → 2,025 lines (−562); +362 in one reusable primitive file (net ~−200). Typecheck + build clean.**

- **NEW `src/components/ui/TaskFormFields.tsx`** — THE shared task-creation form fields (lives in `ui/` because `CreateLeadTaskModal` is in `leads/` — Rule 04 forbids cross-feature imports):
  - `FieldLabel` — block `.label-micro` label (reuses the existing CSS class instead of re-declaring the style object) with `required?` (danger `*`) and `optional?` (lowercase "(optional)") markers and a `style` override for grid headers.
  - `FieldError` — the inline danger error line; returns `null` when empty.
  - `FormChip` — the generic pill chip (28px, `--radius-full`); `color` switches the active treatment from accent to a semantic token.
  - `PriorityChipRow` — Urgent / High / Normal from `TASK_PRIORITY` (colours stay in the constant per M-5). `deselectNonNormal?` preserves the personal-modal "clicking active urgent/high falls back to Normal" behaviour; `variant: 'chip' | 'dot'` — `dot` is the compact 20px circle row from the group modal's subtask grid.
  - `DueDateField` + `resolveDueAt(preset, date)` — label + optional Today / Tomorrow / Next-week preset chips + `DatePicker`. The preset → UTC ISO math is `toISTEndOfDay()` from `lib/utils/ist.ts` (H-7) in exactly one place; preset and specific date stay mutually exclusive inside the component. `pickerStyle` forwards layout (e.g. `width: 100%` in the group modal's grid).
  - `TaskTypeField` — the `TASK_TYPES` / `TASK_TYPE_LABELS` radio-row list (the lead-modal expression, the documented one).
- **Adopted in all four create modals:**
  - `CreatePersonalTaskModal` (700 → 506): local `istEndOfDay`, `PillChip`, `FieldLabel`, `FieldError`, `PRIORITY_CHIPS` array all deleted; due presets via `DueDateField`; footer → `Button` (ghost Cancel + primary submit with `loading` + `Plus` icon).
  - `CreateGroupTaskModal` (1,122 → 974): `PriorityPills` and `FIELD_LABEL_STYLE` deleted; subtask-row dot picker → `PriorityChipRow variant="dot"`; title/domain errors → `FieldError`; footer → `Button` (keeps the two-phase "Creating… / Adding subtasks…" label).
  - `CreateGiaTaskModal` (520 → 400): local `PriorityChip` deleted; task-type button list → `TaskTypeField`; labels → `FieldLabel`.
  - `leads/CreateLeadTaskModal` (245 → 145): inline priority buttons → `PriorityChipRow`; task-type radio rows → `TaskTypeField` (extracted verbatim from here); labels/error → shared.
- ***Deliberate visual unification (the audit's "three different expressions of one design-system element" resolved in favour of the richest copy):*** priority chips everywhere are now `TASK_PRIORITY`-coloured pills (gia/lead previously used plain accent chips and flat `--radius-sm` buttons); gia/lead field labels converge from `--text-xs` medium secondary to the canonical `.label-micro` style; personal/group footers gain `Button` chrome (satisfying the 2026-05-29 sweep rule "every form submit button must use `Button`" that both files violated); gia/lead form controls now also disable while a submit is pending.
- **Deliberate non-migrations:** `SubTaskModal` keeps its header status/priority **pill-dropdown** selectors — a detail-modal interaction (optimistic inline mutation), not a create-form field; its edit half shares no extractable create-form markup. `CreateGroupTaskModal`'s `AssigneeInlinePicker` stays local — it is the only inline assignee dropdown among the modals (the M-11 audit item already unified the data pipeline; `GroupTaskWorkspace`'s FAB uses a native `<select>` + `AssigneePickerModal`, a different shape). Both adopt opportunistically if a second consumer appears.
- Doc pointers: root `CLAUDE.md` (file map), `src/components/CLAUDE.md` (task-form field rule + personal-modal due-date note), `src/components/tasks/CLAUDE.md` (header rule + `CreateGiaTaskModal` fields), `src/components/leads/CLAUDE.md` (`CreateLeadTaskModal` fields).

**Files:** `src/components/ui/TaskFormFields.tsx` (new), `src/components/tasks/CreatePersonalTaskModal.tsx`, `src/components/tasks/CreateGroupTaskModal.tsx`, `src/components/tasks/CreateGiaTaskModal.tsx`, `src/components/leads/CreateLeadTaskModal.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`, `src/components/tasks/CLAUDE.md`, `src/components/leads/CLAUDE.md`.

---

## 2026-06-11 — DRY audit PR 9: assignable-users unification (M-11 + M-4)

Ninth refactor PR from `docs/dry-audit-master.md`. Two parallel pipelines answered "who can I assign this to?" — `listAgentsForDomain` (leads.ts action → `getAgentsForDomain`/`getActiveUsersForDomain` in leads-service) and `getAssignableUsers` (profiles-service) + a duplicate `getAssignableUsersAction` (tasks.ts) — feeding three overlapping `Pick<Profile, …>` types (`AssignableUser`, `AgentSlim`, `AssigneeSlim`). The verification pass also found a **third** action fork the audit missed: `listAgentsForDealDomain` in deals.ts (kept, but now on the unified query). **One service fn, one action, one type. Typecheck + build clean.**

- **NEW canonical type `AssignableUser` in `src/lib/types/index.ts`** — `Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'domain'>`. `AssigneePickerModal` no longer exports its own copy (all 5 importers now import from `@/lib/types`); `AgentSlim` on `TasksAsync` deleted (it was field-identical); `AssigneeSlim` in tasks-service is now derived via `Pick<AssignableUser, …>` instead of a fresh `Pick<Profile, …>`.
- **ONE service query — `getAssignableUsers({ domain?, agentsOnly? })` in `profiles-service.ts`** — absorbs `getAgentsForDomain` + `getActiveUsersForDomain` (both **deleted from leads-service.ts**; profile queries no longer live in the leads service). No options = previous behaviour (all active non-guest users, sorted by name). Direct RSC/server callers migrated: `leads/page.tsx`, `leads/[id]/page.tsx` (reassign list), `TasksAsync`, `deals.ts` (assignee-verify ×2 + `listAgentsForDealDomain`).
- **ONE action — `getAssignableUsersAction(domain?)` moved to `actions/profiles.ts`** — absorbs `listAgentsForDomain` (deleted from leads.ts) and the old no-arg `getAssignableUsersAction` (deleted from tasks.ts). Scoping rule now lives in exactly one place: no domain → everyone active non-guest; with domain → admin/founder get all active users in the domain, others agents only (byte-identical membership to the old role branch in `listAgentsForDomain`). Client consumers migrated: `AddLeadModal`, `CreateGroupTaskModal`, `PersonalTasksTab` (legacy, dynamic import), `GroupTaskWorkspace`.
- ***Deliberate data improvement (not a regression):*** `CreateGroupTaskModal` and `PersonalTasksTab` previously back-filled the picker shape with fabricated `avatar_url: null, role: 'agent'` for every user (so admin/founder saw managers mislabelled as agents, and avatars never rendered). The unified action returns real `avatar_url`/`role`/`domain` — same list membership, truthful fields. The leads pages now also fetch `avatar_url`/`role`/`domain` for the agent dropdowns (superset shape; existing `{ id, full_name }` prop contracts unchanged via structural typing).
- Doc pointers: root `CLAUDE.md` (file-map line), `src/lib/actions/CLAUDE.md` (new "Assignable users — one pipeline" section), `src/lib/CLAUDE.md` (profiles-service + actions/profiles.ts + leads.ts rows), tasks/leads/components CLAUDE.md files and `docs/{master,lead-page,tasks-page,user-management-page,The_Gia}.md` references updated to the new names.

**Files:** `src/lib/types/index.ts`, `src/lib/services/profiles-service.ts`, `src/lib/services/leads-service.ts`, `src/lib/services/tasks-service.ts`, `src/lib/actions/profiles.ts`, `src/lib/actions/leads.ts`, `src/lib/actions/tasks.ts`, `src/lib/actions/deals.ts`, `src/app/(dashboard)/leads/page.tsx`, `src/app/(dashboard)/leads/[id]/page.tsx`, `src/app/(dashboard)/tasks/TasksAsync.tsx`, `src/app/(dashboard)/tasks/TasksShell.tsx`, `src/components/tasks/AssigneePickerModal.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/CreateGroupTaskModal.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/leads/AddLeadModal.tsx`; docs: `CLAUDE.md`, `src/lib/CLAUDE.md`, `src/lib/actions/CLAUDE.md`, `src/components/CLAUDE.md`, `src/components/tasks/CLAUDE.md`, `src/components/leads/CLAUDE.md`, `src/app/(dashboard)/CLAUDE.md`, `src/app/(dashboard)/tasks/CLAUDE.md`, `src/app/(dashboard)/leads/CLAUDE.md`, `docs/master.md`, `docs/lead-page.md`, `docs/tasks-page.md`, `docs/user-management-page.md`, `docs/The_Gia.md`.

---

## 2026-06-11 — DRY audit PR 8: `<EmptyState>` (M-7) + `PageSkeletons` scaffold (M-10) + Cartesian chart frame (M-6)

Eighth refactor PR from `docs/dry-audit-master.md` — the three visual-consistency primitives. Each one converts a design rule that lived in `CLAUDE.md` prose (re-transcribed by hand at every call site) into a structural component. **Typecheck + build clean; zero behaviour change intended except the deliberate deltas noted per item.**

- **NEW `src/components/ui/EmptyState.tsx` (M-7)** — THE canonical empty state; makes *"Playfair italic heading, never 'No data available'"* structural. Two variants: **hero** (auto when `icon` is passed — 64px icon tile, `--text-xl` italic serif title, sans tertiary description, Framer entrance; `framed?` adds the paper-subtle bordered surface, `ambient?` the accent radial wash) and **inline** (centred serif-italic tertiary sentence, `size: 'sm' | 'lg'`). Optional `action` slot.
  - **Adopted:** `EmptyConversationState` (77 → 19 lines) and `PerformanceRosterEmptyState` (96 → 17) are now 3-line wrappers; inline empties replaced in `TaskRemarksPanel` ("No updates yet."), `ManagerPerformancePanel` (×2 — "No agents in this domain yet." via `size="lg"`, "Nothing matches these filters."), `NotificationPanel` ("You're all caught up.").
  - *Deliberate delta:* the hero text column is `maxWidth: 280px` for both wrappers (the WhatsApp one was 240px); the `size="lg"` inline title keeps `--text-lg` + `--weight-light` exactly. The remaining ~15 single-line italic empties (LeadsTable, GroupTasksTab, UsersTable, …) adopt opportunistically when those files are next touched — the primitive + doc pointer is in place.
- **NEW `src/components/ui/PageSkeletons.tsx` (M-10)** — THE shared `loading.tsx` scaffold: `Shimmer` (base `.skeleton` block, w/h/r/delay props), `skeletonStagger(i)` (§11.4 0/80/…/320ms cap), `PageHeaderSkeleton` (title + optional CTA row), `FilterBarSkeleton` (the `--theme-paper` strip chrome — icon/search/chips/count defaults or custom children), `SkeletonCard` (paper card chrome, layout overridable via `style`). Server-component-safe — no hooks, no Framer.
  - **Adopted in 8 loading files:** `settings` (137→59), `admin/users` (135→56), `deals` (117→63), `campaigns` (101→47), `admin/ad-creatives` (120→74), `leads` (170→81), plus the header rows of `tasks` and `performance` (which already delegate to `TasksSkeleton`/`PerformanceSkeleton` — those interiors are untouched). The page-header/filter-strip chrome (`px-5 py-4`, `--shadow-1`, `mb-4`) now lives in one place and cannot drift per page.
  - **Deliberately NOT migrated:** `dashboard/loading.tsx` (bento grid) and `whatsapp/loading.tsx` (split-pane) — bespoke interiors per the audit ("extract only the three repeated blocks"); the twelve `*Skeleton.tsx` Suspense-fallback components keep their bespoke interiors for the same reason.
- **NEW `src/components/ui/charts/CartesianChartFrame.tsx` (M-6)** — `<ChartFrame>` (paper container + `ResponsiveContainer`) + `cartesianDefaults(tokens)` (grid/axis/tooltip/legend prop objects) + `CARTESIAN_MARGIN`. Recharts resolves XAxis/Tooltip/etc. by child *type*, so the elements stay in each chart's JSX — the shared things are the container and the prop blocks, spread as `{...defaults.axis}` etc. Adopted in `AreaChart` (120→97), `LineChart` (103→79), `BarChart` (225→185); `BarChart`'s `xAxisProps`/`tooltipProps`/`gridProps` passthroughs still spread *after* the defaults, so all existing overrides win unchanged. Pie/Donut/Butterfly untouched (genuinely different shapes).
  - *Deliberate delta (the drift the audit flagged, resolved in favour of the richer copy):* the tooltip `labelStyle: { color: tokens.axisLabel }` that only `LineChart` had is now in the shared defaults — Area/Bar tooltips gain a themed label colour.
- Doc pointers: root `CLAUDE.md` (file map ×3 + the Empty-states quick-reference line now names `<EmptyState>`), `src/components/CLAUDE.md` (Data Display table rows for `EmptyState` + `PageSkeletons`; Charts section gains the Cartesian-frame rule).

**Files:** `src/components/ui/EmptyState.tsx` (new), `src/components/ui/PageSkeletons.tsx` (new), `src/components/ui/charts/CartesianChartFrame.tsx` (new), `src/components/ui/charts/AreaChart.tsx`, `src/components/ui/charts/LineChart.tsx`, `src/components/ui/charts/BarChart.tsx`, `src/components/whatsapp/EmptyConversationState.tsx`, `src/components/performance/PerformanceRosterEmptyState.tsx`, `src/components/performance/ManagerPerformancePanel.tsx`, `src/components/tasks/TaskRemarksPanel.tsx`, `src/components/notifications/NotificationPanel.tsx`, `src/app/(dashboard)/settings/loading.tsx`, `src/app/(dashboard)/admin/users/loading.tsx`, `src/app/(dashboard)/deals/loading.tsx`, `src/app/(dashboard)/campaigns/loading.tsx`, `src/app/(dashboard)/admin/ad-creatives/loading.tsx`, `src/app/(dashboard)/leads/loading.tsx`, `src/app/(dashboard)/tasks/loading.tsx`, `src/app/(dashboard)/performance/loading.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`.

---

## 2026-06-11 — DRY audit PR 7: `sendGupshupTemplate()` core (H-8)

Seventh refactor PR from `docs/dry-audit-master.md`. The five Gupshup template senders in `src/lib/services/whatsapp-api.ts` each repeated the identical ~60-line pipeline (strip `+` → `URLSearchParams` with `JSON.stringify({ id, params })` → fetch `/template/msg` → status/body/delivered capture → console line → `finally { await logNotification }`). This file is the 2026-06-08 outage surface — the logging/error contract previously had to be maintained in five copies. **`whatsapp-api.ts` 709 → 603 lines (−261/+155 in the diff); typecheck + build clean; zero behaviour change except the console-wording notes below.**

- **NEW internal `sendGupshupTemplate(opts)`** — THE single template-send pipeline: `{ templateId, destination, templateParams, label, logRecipient, log, throwOnError? }` → `{ delivered, gupshupBody }`. Owns the fetch, `isGupshupDelivered()` interpretation, the success/failure console line, and the **one-log-row-per-attempt `finally { await logNotification }` contract** (the canonical finally-block pattern from `src/lib/services/CLAUDE.md` now exists in exactly one place). Never call the Gupshup `/template/msg` endpoint outside it; the next template (call-intelligence) is a ~25-line wrapper.
- **All five exports are now thin wrappers with byte-identical external signatures** — zero call-site edits (`lead-assignment-notify.ts`, `actions/sla.ts`, `actions/whatsapp.ts` verified untouched). Wrappers keep only recipient resolution (profile phone lookups + null-phone warn), template params assembly, and `log` metadata.
- **Throw/swallow semantics preserved:** the four notification senders stay fire-and-forget safe (core never throws without `throwOnError`; wrapper outer try/catch still covers setup failures). `sendLeadInitiationMessage` passes `throwOnError: true` — the core re-throws **after** the finally log, and its thrown message is byte-identical (`label: 'sendLeadInitiationMessage'`). Founder fan-out stays parallel (`Promise.all`); SLA manager fan-out stays sequential; the `lead_initiation` log row (migration 0067) still fires on every attempt.
- ***Minor deliberate console-wording deltas (logs only, no behaviour):*** founder/SLA-manager success lines now read `sent to founder <id>` / `sent to recipient <id>` (previously bare `<id>`, matching their own failure lines); `sendLeadInitiationMessage` now also emits a console line per attempt (previously silent — only the throw); on a mid-pipeline throw, `gupshupBody` now keeps any partial body before falling back to `String(err)` (previously the four swallow-variants overwrote it — strictly more informative log rows).
- Doc pointers: `src/lib/services/CLAUDE.md` template-send section rewritten around the core (rules for new templates = "write a wrapper", fan-out + throw/swallow contracts documented); `src/lib/CLAUDE.md` `whatsapp-api.ts` row updated — including fixing the stale claim that `sendLeadInitiationMessage` "does NOT call logNotification" (it has logged every attempt since migration 0067).

**Files:** `src/lib/services/whatsapp-api.ts`; docs: `src/lib/CLAUDE.md`, `src/lib/services/CLAUDE.md`.

---

## 2026-06-11 — DRY audit PR 6: dashboard domain-pair collapse (H-5) + `useWidgetData` (H-6)

Sixth refactor PR from `docs/dry-audit-master.md`. The dashboard action layer maintained six near-identical Zod schemas and three `getX` / `getXForDomain` action pairs whose bodies differed only by the manager-domain override, and every dashboard widget hand-rolled the same seed/loaded/fetch-on-mount/refetch lifecycle with the `mode === "all" ? actionA : actionB` authorization branch repeated ~9 times across 3 widgets. **Net −210 lines across the six touched files (+113 in two new primitives); typecheck + build clean; zero behaviour change intended.**

- **NEW `src/hooks/useWidgetData.ts`** — THE dashboard-widget data lifecycle: `useWidgetData({ seed, fetcher, autoFetch?, deps? })` → `{ data, loaded, isPending, refetch, apply, setData }`. Owns the contract every widget previously hand-rolled: RSC seed skips the mount fetch, deps-driven auto-fetch with a `cancelled` flag inside `useTransition`, `refetch(override?)` for refresh buttons and tab changes (the override lets handlers fetch with the just-selected tab before state commits), `apply` for `useDashboardCohortSync` seeding, `setData` for Realtime merges (`AgentActivityWidget`).
- **NEW `src/lib/utils/widget-scope.ts`** — `resolveWidgetScope(role, mode)` + the shared `WidgetDomainMode` type (previously re-declared as a local `DomainMode` in 3 widgets). The manager-vs-domain-picker scope decision now lives in exactly one client-side place; the actions independently re-enforce the manager override server-side via a single `effectiveWidgetDomain()` helper (was 3 inline copies).
- **`src/lib/actions/dashboard.ts` — 9 actions → 6, 6 Zod schemas → 3 (280 → 197 lines):**
  - `getLeadStatusSummaryAction(from?, to?, targetDomain?)` and `getLeadsByCampaignAction(from?, to?, targetDomain?)` absorb their `*ForDomainAction` twins — no `targetDomain` = role-scoped "All" view, `targetDomain` set = drill-down (managers pinned to their own domain regardless). The old unused `_role`/`_domain` leading params are gone.
  - **DELETED `getLeadVolumeByRangeAction`** — dead: imported by `ManagerLeadVolumeWidget` but never called anywhere (manager volume is RSC-seeded; the service `getLeadVolumeByRange` stays — the page RSC and `getLeadVolumeForDomain` use it).
  - Schemas: `DateRangeSchema` + `LeadStatusInputSchema` + `LeadStatusDomainSchema` + `CampaignDomainSchema` + `VolumeRangeSchema` + `SingleDomainVolumeSchema` → `WidgetScopeSchema` (optional from/to + optional domain) + `VolumeScopeSchema` + `DomainsVolumeSchema`.
  - ***Deliberate deviation from the audit's "6 actions → 3":*** `getLeadVolumeByDomainsAction` and `getLeadVolumeForDomainAction` stay separate — they return genuinely different shapes (`MultiDomainVolumeSummary` vs `LeadVolumeSummary`); merging would force a union type on every caller.
- **All five widgets adopted** (`ManagerLeadStatusWidget` 518→488, `ManagerCampaignWidget` 405→375, `ManagerLeadVolumeWidget` 515→508, `AgentTasksWidget` 400→377, `AgentActivityWidget` 409→401): each cohort widget now has ONE `loadX(mode)` fetcher used by the auto-fetch effect, `handleDomainChange`, and `handleRefresh` — the ~9 `all-vs-domain` branch sites are gone. `ManagerLeadVolumeWidget` models its two chart modes as one `VolumeView { single, multi }` state slot (exactly one side non-null), so its dual `useState` pair + manual `setLoaded` choreography collapsed into the hook; its 30-line single-domain effect + 18-line `handleDomainChange` became `refetch(() => loadVolume(mode))`. `AgentTasksWidget`'s 30s silent poll is now `setInterval(() => refetch(), 30_000)`.
- **Behaviour preserved, not flattened:** RSC-seeded views (manager view, admin/founder `DEFAULT_GIA_DOMAIN` tab, volume "all" tab) still never fetch on mount; `useDashboardCohortSync` still applies fresh RSC payloads on date-filter navigation; failed fetches keep previous data and never flip `loaded` (the old `if (result.data)` guard, now in the hook); the pre-existing double-fetch on tab change (effect + handler both firing) is intentionally unchanged.
- Doc pointers: root `CLAUDE.md` (file map ×2), `src/lib/CLAUDE.md` (actions registry `dashboard.ts` row), `docs/master.md` §12 row, `docs/dashboard-page.md` (§9c/9d/9e refresh notes + §10 action table rewritten).

**Files:** `src/hooks/useWidgetData.ts` (new), `src/lib/utils/widget-scope.ts` (new), `src/lib/actions/dashboard.ts`, `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx`, `src/components/dashboard/widgets/ManagerCampaignWidget.tsx`, `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx`, `src/components/dashboard/widgets/AgentTasksWidget.tsx`, `src/components/dashboard/widgets/AgentActivityWidget.tsx`; docs: `CLAUDE.md`, `src/lib/CLAUDE.md`, `docs/master.md`, `docs/dashboard-page.md`.

---

## 2026-06-11 — DRY audit PR 5: `requireProfile()` guard (H-4) + `invalidateLeadCaches()` (M-9)

Fifth refactor PR from `docs/dry-audit-master.md`. Two documented invariants that lived in ~40 hand-written copies are now structural. **Typecheck + build clean; zero behaviour change intended except the deliberate items below.**

- **NEW `src/lib/actions/_auth.ts`** — `requireProfile(roles?)`, THE session/role guard (Rule 09 in one place). Returns `{ ok: true, profile }` | `{ ok: false, result }`; `result` is `{ data: null, error: formErrors.unauthorized }`, assignable to any `ActionResult<T>` (Rule 10 intact). No `"use server"` — internal helper, not a client-callable endpoint. Both failure modes return the same copy — never reveals whether the session or the role check failed.
- **Adopted across all session-based action files** (~40 guard sites → 3-line idiom): `leads.ts` (incl. `assertLeadFieldEditAccess`), `dashboard.ts` (×9), `tasks.ts` (×13), `whatsapp.ts` (×10 — non-`ActionResult` reads return their empty shapes on `!auth.ok`), `profiles.ts` (×6), `deals.ts` (×3), `performance.ts` (×4), `ad-creatives.ts` (×2, `ADMIN_ROLES` now typed `UserRole[]`), `notifications.ts` (×2), `agent-routing.ts` (×2).
- **Explicit non-migrations (documented in `src/lib/actions/CLAUDE.md`):** `sla.ts` — Trigger.dev, no session, correctly on `createAdminClient()` (audit Corrections #1); `auth.ts` `loginAction` — profile read is the `is_active` check, not authorization; the four `tasks.ts` actions that fetch profile + task in one parallel `Promise.all` — the guard would serialize two independent round-trips.
- ***Deliberate copy unification:*** the same auth failure previously surfaced as `'Not authenticated.'`, `'Unauthorized.'`, `'Access denied.'`, `"Unauthorised"`, or `formErrors.unauthorized` depending on the file — all guard-level failures now return `formErrors.unauthorized` ("You don't have permission to perform this action."). Bespoke post-guard checks (e.g. manager-domain mismatch in `performance.ts`) keep their existing strings.
- **NEW `src/lib/services/lead-cache.ts`** — `invalidateLeadCaches(site, { leadId, slug, domain }, scope)` with scope flags `row` / `notes` / `activities` / `lists` / `dashboard`. Makes two documented contracts structural: the **dual-key row invariant** (`row: true` always deletes `leadRowId` + `leadRowSlug`) and the **await-inside-try/catch-before-revalidatePath** convention (Redis failure stays non-fatal, warn-prefixed `[leads-action:<site>]`).
- **Adopted at all six `leads.ts` blocks:** `addLeadCallNote` (row+notes+activities+lists), `updateLeadStatus` (row+activities+lists+dashboard), `assignLead` (row+activities+lists), `createManualLead` (lists+dashboard), `revalidateLeadDossier` (row+activities), `addLeadNote` (notes+activities). Per-site scope differences are now named parameters instead of silently divergent copy-paste.
- ***Deliberate removal — dead volume dels:*** `createManualLead` deleted 8 `dashboardLeadVolume(role, domain, period)` keys passing preset names (`'today'`, `'week'`…) as the `from` segment — but the read side (`getLeadVolumeByRange`) always writes keys with ISO `from:to`, so those dels matched no real key since the key schema gained the range segments. Dropped; volume freshness is TTL-only (120s), which is what `lib/CLAUDE.md` already documented. Dashboard volume keys are intentionally outside `invalidateLeadCaches` scopes for the same reason (a del cannot enumerate ISO-range keys).
- Doc pointers: root `CLAUDE.md` (file map ×2 + the `void redis.del()` Pattern Note now points at the helper), `src/lib/CLAUDE.md` (services + actions registry rows), `src/lib/actions/CLAUDE.md` (new requireProfile section with the exceptions table + lead-cache section).

**Files:** `src/lib/actions/_auth.ts` (new), `src/lib/services/lead-cache.ts` (new), `src/lib/actions/leads.ts`, `src/lib/actions/dashboard.ts`, `src/lib/actions/tasks.ts`, `src/lib/actions/whatsapp.ts`, `src/lib/actions/profiles.ts`, `src/lib/actions/deals.ts`, `src/lib/actions/performance.ts`, `src/lib/actions/ad-creatives.ts`, `src/lib/actions/notifications.ts`, `src/lib/actions/agent-routing.ts`; docs: `CLAUDE.md`, `src/lib/CLAUDE.md`, `src/lib/actions/CLAUDE.md`.

---

## 2026-06-10 — DRY audit PR 4: `<FilterBar>` shell + `useUrlFilters` (H-2)

Fourth refactor PR from `docs/dry-audit-master.md` (item **H-2** — four near-identical filter components). The four filter bars repeated the same chrome (sliders icon + count badge, `SearchBar`, Range trigger + panel, Clear button) and, for the three URL-driven pages, the same plumbing (debounced search → URL push, back/forward re-sync, `buildFilterParams` push, clear-all). **The four consumers shrank from 1,193 → 615 lines (−578); +371 in two reusable primitives (net ~−207). External prop signatures of all four components are unchanged — zero call-site edits. Build + typecheck clean; zero behaviour change intended.**

- **NEW `src/components/ui/FilterBar.tsx`** — THE shared list-page filter-bar shell. Fully controlled and display-only: sliders icon (+ optional count badge), `SearchBar` (debounce upstream), optional divider, `children` slot for page `FilterDropdown`s, the Range trigger + `usePortalAnchor` + `<FloatingPanel>` + `<DateRangeFields>` (PR 3 primitives, now composed internally), optional Apply button, Clear button, `trailing` slot. `layout: 'wrap' | 'scroll'`.
- **NEW `src/hooks/useUrlFilters.ts`** — THE URL-param filter plumbing for URL-driven bars: `searchInput` + `useDebounce(350)` → guarded single `router.push`, re-sync on browser back/forward, `push(updates)` via `buildFilterParams` with per-page `resetKeys`, `clearAll()` (clears input immediately + pushes bare pathname).
- **Behavioural differences preserved, not flattened:**
  - `LeadsFilters` keeps its **draft → Apply** commit model (`FilterDraft`, computed `isDirty`, `committedCount`, one push on Apply, domain-change atomically clears agent/campaign) — only the chrome and the search plumbing moved out. The other three stay **immediate-commit** per change.
  - Leads/Deals/Campaigns stay URL-param driven (Deals/Leads with `resetKeys: ['page']`, Campaigns without); `TasksFilters` stays client-state driven (props in, callbacks out, **undebounced** search — it filters in-memory lists) and does not use `useUrlFilters`.
  - Both Range trigger chromes survive as `dateRange.trigger`: `'chevron'` (leads — rotating chevron, no badge, accent border only when dates set) and `'badge'` (default — count badge, accent border on open-or-active).
- **Adopted in all four call sites:** `LeadsFilters` (407→269), `DealsFilters` (255→93), `CampaignFilters` (220→58), `TasksFilters` (311→195) — each is now its `FilterDropdown` configs + commit-model glue only.
- Doc pointers: root `CLAUDE.md` (file map ×2 + Pattern Notes reference list), `src/components/CLAUDE.md` (Overlays table `FilterBar` row), `src/components/leads/CLAUDE.md` (LeadsFilters contract rewritten around the shell).
- Next list page (clients/records) composes `<FilterBar>` + `useUrlFilters` + its own dropdowns — never forks a fifth bar.

**Files:** `src/components/ui/FilterBar.tsx` (new), `src/hooks/useUrlFilters.ts` (new), `src/components/leads/LeadsFilters.tsx`, `src/components/deals/DealsFilters.tsx`, `src/components/campaigns/CampaignFilters.tsx`, `src/components/tasks/TasksFilters.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`, `src/components/leads/CLAUDE.md`.

---

## 2026-06-10 — DRY audit PR 3: `usePortalAnchor` + `<FloatingPanel>` + `<DateRangeFields>` (H-1) and `<ConfirmDialog>` (M-12)

Third refactor PR from `docs/dry-audit-master.md`. The floating-panel positioning plumbing (portal + `getBoundingClientRect` + flip-up/flip-left + scroll/resize/`visualViewport` reposition + outside-`pointerdown` close + rAF re-measure) was character-identical across four filter components, and the confirm-delete dialog (backdrop/panel/z-index contract/two-action layout) was copy-pasted across two task surfaces with a third site using raw `window.confirm`. **−927 lines from the seven consumers, +482 in four reusable primitives (net ~−445); the two documented Pattern-Note contracts (portal escape, confirm z-index stacking) are now structural instead of copy-paste-enforced.** Build + typecheck clean; zero behaviour change intended (exceptions noted below).

- **NEW `src/hooks/usePortalAnchor.ts`** — THE anchoring mechanism: open state, trigger/panel refs, visualViewport-corrected positioning, flip logic, reposition listeners, outside-close (with `[data-datepicker-panel]` escape as the default `ignoreSelector`), post-mount rAF re-measure. Returns `panelProps` to spread onto `<FloatingPanel>`.
- **NEW `src/components/ui/FloatingPanel.tsx`** — the `document.body` portal + `DROPDOWN_VARIANTS` entrance + flip-up transform + paper dropdown chrome (`--z-dropdown`, `--shadow-3`). Always driven by `usePortalAnchor`.
- **NEW `src/components/ui/DateRangeFields.tsx`** — the From → To `DatePicker` pair + clear button that all four filter bars repeated verbatim. Props: `from/to` (URL-param strings) + `onFromChange/onToChange/onClear`.
- **NEW `src/components/ui/ConfirmDialog.tsx`** — THE standalone confirm dialog. Owns the body portal (fixes the Framer-transform trap) and the documented z-index contract (backdrop `--z-overlay` 50, panel `--z-modal` 60 — `--z-modal-overlay` 61 stays reserved for nested modals). Exactly two actions; `pending` disables both buttons and backdrop dismiss; `danger` switches the confirm button to danger tokens (white-on-fill via the sanctioned `var(--color-danger-fg, #fff)` convention).
- **Adopted in (H-1):** `LeadsFilters`, `DealsFilters`, `CampaignFilters`, `TasksFilters` — each dropped ~80 lines of plumbing + ~85 lines of duplicated panel JSX for a 3-line trigger wiring + a 9-line `<FloatingPanel><DateRangeFields/></FloatingPanel>`. The leads-only `[data-datepicker-panel]` escape-hatch (the drift the audit flagged) is now the default for everyone.
- **Adopted in (M-12):** `GroupTasksTab` (~105-line portaled dialog → 17-line `<ConfirmDialog>`), `GroupTaskWorkspace` (~115-line **non-portaled** dialog → same; this fixes a latent instance of the documented transform-trap bug — the dialog lived inside the animated workspace tree), `AdCreativesManager` (raw `window.confirm` → themed `<ConfirmDialog>` with pending state — *the one intentional visual/UX change*).
- **Not migrated (per the audit's sequencing):** `DatePicker`/`TimePicker`/`FilterDropdown`/`LeadColumnPicker`/`LeadInfoCard` keep their private copies — primitives migrate onto the hook last; the page-level forks were the active bleed. Stale "debounced 500ms" comments in Deals/Campaign filters corrected to 350ms while in-file.
- Doc pointers: root `CLAUDE.md` (file map + Pattern Notes), `src/components/CLAUDE.md` (Overlays table + filters note).

**Files:** `src/hooks/usePortalAnchor.ts` (new), `src/components/ui/FloatingPanel.tsx` (new), `src/components/ui/DateRangeFields.tsx` (new), `src/components/ui/ConfirmDialog.tsx` (new), `src/components/leads/LeadsFilters.tsx`, `src/components/deals/DealsFilters.tsx`, `src/components/campaigns/CampaignFilters.tsx`, `src/components/tasks/TasksFilters.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/admin/AdCreativesManager.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`.

---

## 2026-06-10 — DRY audit PR 2: canonical IST date module (`lib/utils/ist.ts`)

Second refactor PR from `docs/dry-audit-master.md` (item **H-7** — the IST date module forked whole across three files, plus two partial forks). **Zero behaviour change — proven, not assumed:** a runtime parity harness ran the old fork implementations (verbatim) against the new module across **513 boundary-heavy instants × 11 checks** (IST-day flip at 18:30 UTC, year boundary, leap day, non-leap Feb boundary, Sunday/Monday IST, month flips ±1 minute, plus 500 random instants over 3 years) — **zero mismatches**, including the task modal's floor-modulo end-of-day formulation and the composed prev-prev-month range.

- **NEW `src/lib/utils/ist.ts`** — the single source of truth for IST (UTC+05:30) date math: `IST_OFFSET_MS`, `toISTMidnight()`, `toISTEndOfDay()`, `getISTMondayStart()`, plus the previously-triplicated month blocks extracted as `getISTMonthStart()` and `getISTPrevMonthRange()` (composable: applying it to its own `.from` yields the month before — used for previous-period comparisons), and the SLA engine's wall-clock pair `toIst()` / `istToUtc()`.
- **`lib/utils/date-range.ts`** — deleted its private offset + 3 helpers + inline month/last-month blocks; keeps only the preset vocabulary (`today/week/month/last_month/quarter`) and `rangeFromUrlParams`.
- **`lib/utils/whatsapp-period.ts`** — deleted its character-identical copy of the same 4 helpers; keeps only the WhatsApp preset vocabulary.
- **`lib/services/performance-service.ts`** — deleted the third copy (lines 62–90 pre-refactor); `getPeriodDateRange` and `getPreviousPeriodDateRange` now import the helpers; the 20-line hand-rolled prev-prev-month block is now two composed `getISTPrevMonthRange` calls.
- **`lib/utils/sla.ts`** — deleted `IST_OFFSET_MINUTES = 330` and its private `toIst`/`istToUtc`; the business-hours engine (`nextBusinessDeadline`, `businessMinutesBetween`, `isWithinBusinessHours`) is untouched and now imports the wall-clock conversions.
- **`components/tasks/CreatePersonalTaskModal.tsx`** — the 14-line inline `istEndOfDay(dayOffset)` is now a 2-line wrapper over `toISTEndOfDay()` (parity verified for offsets 0/1/7 at every probe instant).
- Doc pointers: root `CLAUDE.md` (file map + folder tree), `docs/master.md` utils table (+ corrected the `date-range.ts` row).

Why this was PR 2: timezone-boundary math is the one domain where silent fork drift produces unreproducible bugs (e.g. `date-range.ts` and `whatsapp-period.ts` had already diverged on preset vocabularies for the same concept). Any future fix (or a second-market timezone) now lands in exactly one file.

**Files:** `src/lib/utils/ist.ts` (new), `src/lib/utils/date-range.ts`, `src/lib/utils/whatsapp-period.ts`, `src/lib/services/performance-service.ts`, `src/lib/utils/sla.ts`, `src/components/tasks/CreatePersonalTaskModal.tsx`; docs: `CLAUDE.md`, `docs/master.md`.

---

## 2026-06-10 — DRY audit PR 1: pure wins (utility dedup, debounce canon, dead-code deletion)

First refactor PR from `docs/dry-audit-master.md` (items L-1, M-1, M-3, L-2, L-9, part of L-5). **No behaviour change intended**; the only visual deltas are the three noted below. Every extraction follows the audit guardrail: shared primitive + doc pointer + adoption at all known call sites.

- **NEW `src/lib/utils/strings.ts`** — `getInitials()` + `hashString()`, the canonical initials derivation and deterministic colour-pick hash (M-1/L-2). Adopted in: `ui/Avatar.tsx` (deletes local `nameHash` + `getInitials`), `layout/Sidebar.tsx`, `profile/ProfileAvatarSection.tsx`, `tasks/AssigneePickerModal.tsx` (all three deleted their local copies), and `tasks/GroupTasksTab.tsx` (deletes local `hashString`; inline assignee-initials expression replaced). Pointers added to root `CLAUDE.md` (file map ×2), `docs/master.md` utils table, and the `Avatar` row in `src/components/CLAUDE.md`.
- **Debounce rule enforced (M-3 — four sites, one more than the audit found).** `DealsFilters` and `CampaignFilters` raw 500ms `setTimeout` effects → `useDebounce(searchInput, 350)` (now matches the canonical `LeadsFilters` delay); `whatsapp/ConversationList` raw `debounceRef` → `useDebounce(query, 300)` (documented 300ms preserved; the separate "re-run on period change" effect folded into the single debounced effect; clearing the input still clears results immediately); `tasks/CreateGiaTaskModal` lead-search `debounceRef` → `useDebounce(searchQuery, 300)` with a `cancelled`-flag effect — this also fixes a latent bug where an in-flight search could reopen the results dropdown after a lead was already selected.
- **`formatPercent` gained `{ decimals?: 0 | 1 }` and now rounds before the whole-number check** (74.97 → "75%", never "75.0%"). `CoreFourGrid.formatPct` is now a one-line alias over it (kept because it's passed as a formatter fn to `makeBenchmarkLine`); `DomainHealthGrid` adopts it with `decimals: 0` (L-9, output-identical).
- **`AgentActivityWidget`** local relative-time fork deleted → `formatRelativeTime` from `lib/utils/dates.ts`. *Visual delta 1:* activities older than 7 days now show "12 May" instead of "45d ago" (canonical behaviour).
- **`GroupTasksTab` `DueDateChip`** label now via `formatDate(due, 'd MMM')` — IST-correct instead of machine-local. *Visual delta 2:* none for IST users.
- *Visual delta 3:* unifying on Avatar's hash algorithm means `GroupTasksTab` fallback accent/icon picks (only for groups without an explicit `accent_color`) may shuffle once; single-word names in `AssigneePickerModal` now show 1 initial ("M") instead of 2 ("MA") per the canonical rule.
- **DELETED `src/lib/utils/chart-tokens.ts`** (L-1 — the deprecated `export {}` stub, zero importers). Doc references fixed: root `CLAUDE.md` file map + folder tree, `docs/master.md` utils table, `docs/DESIGN-DNA.md` §16.9 rewritten to document the live `useChartTokens()` + `resolveColorMap()` API.
- **DELETED `ui/ListRow.tsx`, `ui/Accordion.tsx`, `ui/EditButton.tsx`** (L-5 — zero importers each, verified via import graph both quote styles + relative paths). Rows removed from `src/components/CLAUDE.md`; `docs/design-system.md` sections replaced with a deleted-primitives note.
- **Flagged, not changed:** `layout/TopBar.tsx` has zero importers (orphan — decide adopt-or-delete separately); `ui/Table.tsx` + the `Checklist`/`ChecklistItem`/`ProgressBar` trio are unused but are adopt-or-delete decisions deferred to their own PR; `<Avatar>` component adoption in Sidebar/TopBar/Profile deferred because those surfaces use intentional accent-identity circles, not the semantic-hash square (swapping would change production visuals).

**Files:** `src/lib/utils/strings.ts` (new), `src/lib/utils/numbers.ts`, `src/components/ui/Avatar.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/profile/ProfileAvatarSection.tsx`, `src/components/tasks/AssigneePickerModal.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/dashboard/widgets/AgentActivityWidget.tsx`, `src/components/performance/CoreFourGrid.tsx`, `src/components/performance/DomainHealthGrid.tsx`, `src/components/deals/DealsFilters.tsx`, `src/components/campaigns/CampaignFilters.tsx`, `src/components/whatsapp/ConversationList.tsx`, deleted: `src/lib/utils/chart-tokens.ts`, `src/components/ui/ListRow.tsx`, `src/components/ui/Accordion.tsx`, `src/components/ui/EditButton.tsx`; docs: `CLAUDE.md`, `src/components/CLAUDE.md`, `docs/master.md`, `docs/DESIGN-DNA.md`, `docs/design-system.md`.

---

## 2026-06-09 — `The_Rules.md` audited against the codebase + two correctness fixes

Audited `docs/left pages/The_Rules.md` rule-by-rule against the live tree (services/actions/utils/constants/hooks, migrations, components). The document was largely accurate and well-enforced (zero `bg-white`/`text-gray-*` violations, `proxy.ts` present with no `middleware.ts`, `assertNever`/`form-errors`/`maxDuration` all in place, no Sentry/React-Query deps — P-07/P-01 accurate). Two areas had genuinely drifted; both the doc **and** the code were corrected:

- **Hardcoded-colour exceptions consolidated (V-01/V-12).** The "no hardcoded hex" rule had a single buried Decision-Log exception (`BAR_COLORS`), but the codebase actually has three legitimate vis-only hardcoded sites. Added a discoverable **"Sanctioned hardcoded-colour exceptions"** block: `BAR_COLORS` (`ManagerLeadStatusWidget`), the `FALLBACK` palette (`useChartTokens`), and a clarification that `LEAD_STATUS_COLORS` are theme tokens (not an exception). Documented the codebase convention for white-on-fill (`var(--color-danger-fg, #fff)`, not bare `#ffffff`).
- **V-12 pointed at a dead file.** The rule referenced `getChartTokens()` in `src/lib/utils/chart-tokens.ts` — which was a 3-line `throw new Error("Not implemented")` stub imported by nothing. The live API is `useChartTokens()` + `resolveColorMap()` in `src/components/ui/charts/useChartTokens.ts`. Rewrote V-12 and the file-map entry in `CLAUDE.md` to point at the live API; converted the stub to a non-throwing `export {}` with a pointer comment so doc-followers no longer hit a runtime throw.
- **Code fix — `SubTaskModal.tsx` V-01 violation.** Delete-button text was a bare `color: "#ffffff"`. Aligned it to the established `var(--color-danger-fg, #fff)` token-with-fallback convention used by the equivalent button in `GroupTasksTab.tsx`.

Decision Log entry added (2026-06-09, V-01/V-12).

**Files:** `docs/left pages/The_Rules.md`, `CLAUDE.md`, `src/lib/utils/chart-tokens.ts`, `src/components/tasks/SubTaskModal.tsx`.

---

## 2026-06-09 — Docs: `docs/master.md` re-verified against the live codebase (was stale at 2026-06-08)

**Docs only — no code change.** Audited the master reference against `supabase/migrations/`, the services/actions/constants/hooks/components trees, and the changelog. Corrected the drift:

- **Migration index (§9):** "84 migrations (0001–0082)" → **98 migrations (0001–0097)**. Added the entirely-missing rows **0084–0095** (lead_health final removal, WA-unread fix, tasks-status default, campaign first-touch key, RLS InitPlan hoist, dead-RPC-overload drops, `SELECT *` RPC fix, archived-lead immutability, storage-RLS tightening, duplicate-avatar-policy removal, explicit tasks write policies). Fixed the §10 file-map footer ("84 / 0001–0082" → "98 / 0001–0097") and the §9 TOC anchor. Corrected the `lead_health` note to name **0084** as the true final removal (not 0083).
- **Services registry (§11):** added `getLeadDeal` to `deals-service`; added `getAgentRosterPerformance`, `getAgentDetailMetrics`, `getDomainHealthMetrics`, `getDomainsWithLeads` + the two date-range helpers to `performance-service`.
- **Actions registry (§12):** `performance.ts` names were fictional — replaced with the real four (`getAgentDetailMetricsAction`, `getAgentSelfMetricsAction`, `getManagerRosterAction`, `getDomainHealthMetricsAction`). `leads.ts` — removed the nonexistent `updateScratchpad` (column dropped in 0061), added `exportLeadsAction`, noted `updateLeadSource` rename. `dashboard.ts` — "5 widget refresh actions" → the actual 9.
- **File map (§10):** removed 5 docs that no longer exist (`The_Blueprint.md`, `The_Profile.md`, `context.md`, `task-blueprint.md`, `gia-workflow.md`); added the docs that do (`database_architecture.sql`, `call-intelligence-spec.md`, `decisions-to-take.md`, `whatsapp-notifcation.md`, `performance-page.md`). Fixed `design-dna.md` casing → `DESIGN-DNA.md`. Expanded the hooks block to all 9. §20 "five authority files" no longer cites the deleted `The_Blueprint.md`.
- **Build phases (§7) + Decision Log (§19):** added the 06-04 → 06-08 work (Domain Health, Redis cache-aside, Export, lead_health removal, the 0085–0095 DB-hardening sweep, the `leads.deal_*` column drop + `LeadDealCard`, attribution-on-ingestion).
- **Widget count:** current-state "5 widgets" → **6** (adds `manager-cold-leads`) in §8 and §13; the Phase-7 history row is left as "5" (correct as history).
- **Route map (§8):** `/performance` page doc reference fixed from "(see CLAUDE.md)" to `docs/performance-page.md`. Header + footer `Last verified` bumped to 2026-06-09.

**Files:** `docs/master.md`.

---

## 2026-06-09 — Docs: `docs/performance-page.md` synced to codebase (was stale at 2026-06-04)

Audited `performance-page.md` against `performance/page.tsx`, `lib/actions/performance.ts`, `performance-service.ts`, the performance components, and `types/index.ts`. Corrected the drift:

- **`getAgentDetailMetrics`** documented as 6 queries with an IST-today `callsToday` window — actually **3 queries**, all scoped to the period range; `callsToday` now equals `totalCallsMade` (cohort `created_at`). Fixed §3b, §4, §5, §9d, and invariants 10 & 17.
- **Deal revenue** (roster + detail) now sourced from `public.deals` (`won_at`), not a `leads` column — documented.
- **Founder Domains tab** was entirely missing: added `FounderPerformanceShell` two-tab (Agents/Domains) structure, `DomainOverviewPanel`, `getDomainHealthMetrics`, `initialDomainHealth` server seed, and the `agentsSlot` injection pattern (§1, §5, §10).
- **Two server actions** (`getManagerRosterAction`, `getDomainHealthMetricsAction`) added to §6 and the action inventory.
- **`ManagerPerformancePanel` default selection** corrected: `selectedId` initialises to `null` → `PerformanceRosterEmptyState`, not a first-agent default; `getFirstAgentInPerformanceRosterList` no longer called (§9c, §10, helper note).
- **Removed the fictional health-fetch invariant** (no `getLeadHealth` `useEffect` exists in `AgentDetailPanel`).
- Added `loading.tsx`, `PerformanceRosterEmptyState`, `DomainOverviewPanel`, `DomainHealthGrid`, `StatAtom` to the component inventory.

Doc-only change; no code touched. `Last verified` bumped to 2026-06-09.

## 2026-06-09 — Docs: design-system + DESIGN-DNA component/motion/z-index facts re-verified against source

**Docs only — no code change.** Audited `design-system.md` §6–§7 and the matching DESIGN-DNA sections against the real `src/components/ui/` inventory, `src/lib/constants/motion.ts`, `src/components/ui/MotionButton.tsx`, `src/components/ui/modal.tsx`, and `src/styles/design-tokens.css`.

**Stale facts corrected:**

- **`MOTION_BUTTON_DEFAULTS` is not in `motion.ts`.** design-system §6c listed it as a `motion.ts` export; it actually lives in `src/components/ui/MotionButton.tsx` (and *imports* `INSTANT_DURATION` + `EASE_SPRING` from `motion.ts`). Removed from the `motion.ts` table; added a callout with the real shape + location.
- **There is no `Modal.tsx`.** design-system §7 described a `Modal.tsx` + `modal.tsx` two-file split ("new work prefers `Modal.tsx`"). On disk there is only **`modal.tsx`**, which exports `Modal` / `ModalProps` / `ModalType` — including the full `type="lia"` Approve+Dismiss footer. Rewrote the entry to the single-file truth; `maxWidth` clarified as a back-compat prop on the same component, not a legacy file. (`src/components/CLAUDE.md` carried the same phantom-split error in its Overlays table — now also corrected: the two `Modal.tsx`/`modal.tsx` rows collapsed into one accurate `modal.tsx` row.)
- **`MessageBar` is a shipped `ui/` primitive.** design-system listed "Message bar — Spec §5.11 — not in repo." It is real (`MessageBar.tsx`, `MessageBarProps`, `default`/`nested` variants). Added a full §7 entry, removed the "not in repo" row, and added a shipped-implementation pointer under DESIGN-DNA §5.11 (incl. the unimplemented left-icon spec delta).
- **`PasswordStrengthBar` was undocumented in design-system §7.** Added it (real `ui/` primitive, shared by profile + update-password).
- **DESIGN-DNA §3.6 z-index scale was missing `--z-modal-overlay` (61) and `--z-modal-nested` (62).** Added both to the ultimate-reference scale with the nested-modal stacking rule (design-system §2e already had them correctly).

**Verified correct (no change):** all token scale values (text/space/radius/weight), the full z-index scale in design-system §2e, and Button danger/success hover using `--theme-text-inverse`.

**Files:** `docs/design-system.md` (§6c, §7 Modal/MessageBar/PasswordStrengthBar, patterns table), `docs/DESIGN-DNA.md` (§3.6 z-index, §5.11 MessageBar impl note).

## 2026-06-09 — Docs: auth-page visual language captured in DESIGN-DNA + design-system + auth-pages

**Docs only — no code change.** Audited the three auth forms (`login-form.tsx`, `forgot-password-form.tsx`, `update-password-form.tsx`), `(auth)/layout.tsx`, `update-password/page.tsx` (`InvalidLinkCard`), the three auth CSS classes + two orbs in `globals.css`, the auth actions/schemas, and `(auth)/CLAUDE.md`. The session/action/schema logic in `auth-pages.md` was already accurate; the **visual design of the auth pages was undocumented in all three reference docs** — corrected per the user's split: DESIGN-DNA = ultimate granular reference, design-system = overview/architecture, auth-pages = per-module intelligence.

**Captured / corrected:**

- **`DESIGN-DNA.md` §3.7 "Auth Surface (canvas-dark)" (new):** token-level spec for the dark auth shell — `.eia-auth-card` / `.eia-input-auth` / `.eia-auth-link`, the `Indulge OS.` brand header (serif `--text-3xl` `--weight-light` + trailing `.page-title-dot`), dark-surface error tokens (`--color-danger-dark-*`), the `label-micro` colour override, the two accent-tinted orbs, and the **paper-tokens-forbidden** rule. Micro-Detail 03 updated to name the auth header as the one sanctioned `.page-title-dot` off a primary-nav `<h1>`.
- **`design-system.md` §8c-bis (new):** auth pages added to the layout-pattern overview (canvas-dark shell, no sidebar/paper, centred 26rem card) with cross-refs to DESIGN-DNA §3.7 and `auth-pages.md`. Header re-verified to 2026-06-09.
- **`auth-pages.md` §5 enhanced:** new §5e "Auth visual language" module summary; §5a expanded (glow geometry, orb sizes/tints, 2026-06-02 noise/line removal); §5b password-toggle detail (15px / strokeWidth 1.5 / `tabIndex={-1}`) + submit copy.
- **Stale-fact fix:** `(auth)/CLAUDE.md` shows the brand header **without** the `page-title-dot`; the code has it. All three docs now reflect the code (dot present) and flag the CLAUDE.md note as superseded.

**Files:** `docs/DESIGN-DNA.md` (§3.7 + Micro-Detail 03), `docs/design-system.md` (§8c-bis + header date), `docs/auth-pages.md` (§5a, §5b, §5e).

---

## 2026-06-09 — Docs: `docs/deals-page.md` synced to codebase (was stale at 2026-06-05)

**Docs only — no code change.** The deals intelligence document was accurate through migration 0074 but predated four post-0074 developments. Audited it against the page, all five deal components, both service/action files, the schema, the `Deal`/`DealWithRelations`/`DealFilters` types, and migrations 0072–0097.

**Stale facts corrected:**

- **`source` column (migration 0075) was entirely absent.** Added it to the §2 DDL, the §6 `Deal` type, the §4b `NewDealModal` step-2 field list, and the §4c `createWalkInDeal` insert. `source` mirrors `leads.source`, nullable, validated against `LEAD_SOURCE_ENUM`.
- **`won_at` is no longer always `now()`.** `NewDealModal` now exposes a user-pickable **Deal Date** (`DatePicker`, capped at today — back-dating allowed) and `createWalkInDeal`/`CreateWalkInDealSchema` accept an optional `won_at`. Reframed §2 and §4; added invariant 17. Lead-sourced deals still use insert time; the immutability invariant (14) is unchanged.
- **Write-policy gap documented (migration 0094).** `public.deals` has no INSERT/UPDATE/DELETE RLS policy — all writes go through the admin client in `recordDeal`/`createWalkInDeal`. Added to §10 and as invariant 16.
- **Migration index (§12) extended past 0074:** added 0075 (source), 0076 (`get_domain_health_metrics` revenue repointed to `public.deals`), 0094 (policy gap), 0097 (drop dead `leads.deal_*` columns). Added invariant 18 (deal data lives only on `public.deals`).

**Files:** `docs/deals-page.md` (header date + §2, §4, §6, §10, §11, §12).

---

## 2026-06-09 — Docs: `docs/dashboard-page.md` rewritten to match codebase (was stale at 2026-06-01)

**Docs only — no code change.** The dashboard intelligence document had drifted from the implementation. Rewrote it against codebase HEAD after auditing the page, canvas, all six widgets, both service/action files, the widget registry, types, and the nine `*dashboard*` migrations.

**Stale facts corrected:**

- **RPC signature:** doc claimed the 3-param `get_dashboard_summary(text, app_domain, uuid)` (migration 0050) was canonical. Current canonical is the **6-param** `(p_role, p_domain, p_user_id, p_initial_domain, p_date_from, p_date_to)` — migrations 0062 (role-branch + `p_initial_domain`), 0069 (date filter), 0081 (`cold_leads_count`). Documented the full signature lineage + the GRANT-after-`CREATE OR REPLACE` invariant.
- **Return keys:** four → **five** (`cold_leads_count` scalar int added in 0081). Documented the agent early-return branch (empty stubs).
- **Sixth widget:** `manager-cold-leads` ("Going Cold", `sm`, `colSpan 1`) was entirely absent. Added registry row, default-layout entries, `DashboardWidgetSlot` lazy map entry, and a full §9f breakdown (RPC-seeded scalar, no fetch/refresh, links to `/leads?going_cold=true`).
- **Date-filter system:** the old per-period `getLeadVolumeByPeriod('week')` model was replaced by a global URL-param `DateRange` (`DashboardDateFilter`, `dash_preset`/`dash_from`/`dash_to`). Documented §6b (filter component), the `dateRange` prop threading, range-based actions (`getLeadVolumeByRangeAction` etc.), and the cohort-by-`created_at` rule.
- **Service layer:** documented the three refresh RPCs (`get_lead_pipeline_refresh`, `get_campaign_pipeline_refresh` — migration 0064; `get_agent_recent_activity` — migration 0063) and the Redis cache-aside keys/TTLs that replaced the old Node-side aggregation.
- **Page behaviour:** now reads `searchParams`, wraps the `Promise.all` in `try/catch` (renders zeroed `initialData`, never throws/redirects), seeds `lead_volume_multi` for admin/founder.
- **Volume widget:** removed the stale "Month/Week/Today period toggle" — the widget is driven by the global range now.
- **Agent total fix:** noted migration 0070 (`COUNT(*)` → `SUM(cnt)`) and the `normalizeLeadStatusSummary` defence.
- Expanded invariants 12 (role check in `sanitizeStored`), 18–22 (null-coercion, no-throw page, GRANT, cohort-date rule, cold-leads threshold sync).

**Files:** `docs/dashboard-page.md` (full rewrite).

---

## 2026-06-08 — Lead dossier: `LeadDealCard` added; dead deal columns dropped from `leads` (migration 0097)

**Feature:** Won leads now surface their linked deal directly on the dossier (`/leads/[id]`). Previously the dossier showed nothing about the deal after a win — the agent had to navigate to `/deals`. A new `LeadDealCard` renders full-width between `StatusActionPanel` and the 2-column grid, showing deal amount (`formatCurrency`, mono, accent), type + duration chips, won date, and a "View in Deals →" link. The whole card links to `/deals` (the deals page has no per-deal route). Rendered only when the lead has a linked deal; absent for all non-won leads.

**App:**

- `src/lib/services/deals-service.ts` — new `getLeadDeal(leadId): Promise<Deal | null>`. Session client (RLS applies — an agent who doesn't own the deal gets `null`). `SELECT * FROM deals WHERE lead_id = $1 AND archived_at IS NULL LIMIT 1`. Never throws.
- `src/components/leads/LeadDealCard.tsx` — new pure display component (`'use client'` for the Framer fade-in). Composes existing tokens + `DEAL_TYPE_LABELS` / `DEAL_DURATION_LABELS` constants; no hardcoded colours. Distinct from `DealCard` (the deals-list row) — not extended or imported.
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getLeadDeal(lead.id)` added to the parallel `Promise.all`; conditional `<LeadDealCard>` render.

**Cleanup (dead columns):** `recordDeal` has written to `public.deals` since the deals table became first-class (0072–0074); the `leads.deal_amount` / `deal_type` / `deal_duration` columns were always NULL on won leads and misleading. Dropped in migration 0097. Type + export references removed: `Lead` typed-up export and generated Row/Insert/Update types (`src/lib/types/database.ts`); `LeadExportItem` Pick + `getLeadsForExport` `.select()` (`src/lib/services/leads-service.ts`); `leadToRow` CSV columns (`src/lib/utils/export.ts`). `WonDealModal` was already starting from scratch (no pre-fill) — unaffected. `performance-service.ts` reads `deal_*` from `public.deals` joins — unaffected.

**DB:** Migration `20260608000097_drop_leads_dead_deal_columns.sql` — `ALTER TABLE public.leads DROP COLUMN deal_amount, deal_type, deal_duration`. CHECK constraints CASCADE-dropped with the columns.

**Docs:** `docs/lead-page.md` §1 intro, §2a (leads table — deal columns removed), §7a (parallel fetch + layout), Related-Deals note; `docs/deals-page.md` §7 (`getLeadDeal`); `docs/master.md` §9 (migration 0097).

---

## 2026-06-08 — Lead ingestion now populates attribution jsonb on insert (migration 0065 created the column but never wired ingestion to write it)

**Bug:** Migration 0065 (2026-06-03) created `leads.attribution` and backfilled old flat columns into it, but the ingestion service was never updated to write `attribution` on new inserts — it passed `data.attribution ?? null`, and every lead created since 0065 with no adapter-built attribution stored SQL NULL.

**App:** `src/lib/services/lead-ingestion.ts` (`ingestLead`) — the lead INSERT now sets `attribution` from an `attributionSnapshot` object built from the fields present on `NormalizedLeadPayload`: the adapter-built `attribution` bag (platform, campaign_id, ad_name, adset_name) spread over null-coalesced `utm_medium` (from `medium`) and `utm_campaign`. Minimum value is `{}`, never SQL NULL (NULL = "not captured"; `{}` = "captured, nothing present"). Written exactly once at INSERT, never in any UPDATE path. No adapter or `NormalizedLeadPayload` field was changed.

**DB:** Migration `20260608000096_attribution_comment.sql` — `COMMENT ON COLUMN public.leads.attribution` documenting the contract (full UTM/platform snapshot at ingestion, immutable after insert). No data changes.

**Docs:** `docs/The_Gia.md` §2 (leads table) — `attribution` column added; `docs/master.md` §9 — migration 0096 entry.

---

## 2026-06-08 — DB migration 0095: complete RLS InitPlan hoist — profiles_update, routing_config_update, wa_notif_logs_admin_founder_select (missed by 0088)

**DB:** Migration `20260608000095_rls_hoist_missed_three.sql` — DROP + recreate `profiles_update`, `routing_config_update`, and `wa_notif_logs_admin_founder_select`; every bare `public.get_user_role()` call wrapped in `(SELECT …)` scalar subquery. `profiles_update` WITH CHECK `profiles_1` self-join (self-elevation guard) preserved unchanged.

---

## 2026-06-08 — DB migration 0094: explicit tasks INSERT/DELETE policies; documented deals write-via-RPC-only intent

**DB:** Migration `20260608000094_explicit_insert_delete_policies.sql` — `tasks_insert` (personal, self-assigned only); `tasks_delete` (agent, personal, non-terminal); `tasks_delete_privileged` (manager/admin/founder, any task). No INSERT/DELETE policies on `deals` — intentional gap documented via `COMMENT ON TABLE public.deals`.

**Docs:** `src/lib/CLAUDE.md` — tasks write-path table (which categories allow direct RLS insert vs RPC-only).

---

## 2026-06-08 — DB migration 0093: remove duplicate avatar storage policies (quoted-name variants superseded by snake_case set)

**DB:** Migration `20260608000093_remove_duplicate_avatar_policies.sql` — DROP `"Users can delete their own avatar"`, `"Users can update their own avatar"`, and `"Users can upload their own avatar"` on `storage.objects`. Canonical policies from migration 0071 unchanged: `avatars_public_read`, `avatars_insert_own`, `avatars_update_own`, `avatars_delete_own`.

---

## 2026-06-08 — DB migration 0092: ad-creatives storage bucket insert/delete restricted to admin and founder roles

**DB:** Migration `20260608000092_fix_ad_creatives_storage_rls.sql` — DROP permissive `"Ad Creative Modal insert"` / `"Ad Creative Modal delete"` policies on `storage.objects`; recreate as `ad_creatives_storage_insert` / `ad_creatives_storage_delete` with inline `profiles.role` check (`admin` | `founder` only), matching `ad_creatives` table RLS. SELECT unchanged — public bucket read for campaign/lead dossier UIs.

---

## 2026-06-08 — DB migration 0091: leads_update RLS policy now requires archived_at IS NULL — archived leads are immutable

**DB:** Migration `20260608000091_fix_leads_update_policy.sql` — DROP + recreate `leads_update` on `public.leads`; `USING` clause adds `archived_at IS NULL` alongside the InitPlan-hoisted role/domain guards from migration 0088. Direct UPDATE on an archived row returns 0 rows affected (RLS silent deny). Un-archive or other archived-row mutations must go through `SECURITY DEFINER` RPCs or service-role client.

---

## 2026-06-08 — DB migration 0090: get_active_lead_by_phone now returns explicit column list instead of SELECT *

**DB:** Migration `20260608000090_fix_select_star_rpcs.sql` — `DROP` + `CREATE OR REPLACE get_active_lead_by_phone(p_phone text)` with `RETURNS TABLE(id, first_name, last_name, phone, status, assigned_to, domain, slug, archived_at)` and explicit `SELECT l.id, …` projection. `get_personal_tasks` unchanged (`SETOF tasks` still requires full row).

**Types:** `src/lib/types/database.ts` — narrowed `get_active_lead_by_phone` RPC return shape (removed `SetofOptions` / full `leads` row).

**Services:** `src/lib/services/lead-ingestion.ts` — typed `.rpc('get_active_lead_by_phone')` (drops manual cast).

**Actions:** `src/lib/actions/leads.ts` `createManualLead` — same typed RPC call.

---

## 2026-06-08 — DB migration 0089: drop dead overloads of get_dashboard_summary (4-param) and get_campaign_pipeline_refresh (2-param)

**DB:** Migration `20260608000089_drop_dead_rpc_overloads.sql` — `DROP FUNCTION IF EXISTS` on the pre–date-filter overloads. Live signatures unchanged: `get_dashboard_summary(text, app_domain, uuid, app_domain, timestamptz, timestamptz)` and `get_campaign_pipeline_refresh(text, app_domain, timestamptz, timestamptz)`. All call sites in `dashboard-service.ts` already pass date params.

---

## 2026-06-08 — DB migration 0088: wrap get_user_role() / get_user_domain() in InitPlan scalar subquery across all RLS policies — prevents N subqueries to profiles on table scans

**DB:** Migration `20260608000088_rls_initplan_hoist.sql` — DROP + recreate 30 RLS policies on `leads`, `lead_notes`, `lead_activities`, `lead_sla_timers`, `deals`, `tasks`, `task_gia_meta`, `task_remarks`, `whatsapp_conversations`, `whatsapp_messages`, `profile_audit_log`, `task_audit_log`, `lead_raw_payloads`. Every bare `public.get_user_role()` / `public.get_user_domain()` call wrapped in `(SELECT …)` so Postgres hoists to a single InitPlan per statement. `ad_creatives`, `notifications`, and `agent_routing_config` policies untouched.

---

## 2026-06-08 — DB migration 0087: fix avg_hours_to_first_touch — wrong JSON key 'to' corrected to 'new_status'

**DB:** Migration `20260608000087_fix_campaign_first_touch_key.sql` — `CREATE OR REPLACE get_campaign_detail_metrics()`; lateral join on `lead_activities` now filters `details->>'new_status' = 'touched'` (matches `update_lead_status` jsonb) instead of the never-matching `details->>'to'`.

---

## 2026-06-08 — DB migration 0086: fix tasks.status DEFAULT from invalid 'pending' to 'to_do'

**DB:** Migration `20260608000086_fix_tasks_status_default.sql` — `ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'to_do'`. Migration 0017 replaced the status CHECK vocabulary but never updated the column default; inserts omitting `status` received `'pending'` and failed the constraint. CHECK constraint unchanged.

**Pre-apply audit:** `SELECT COUNT(*) FROM tasks WHERE status = 'pending';` — if non-zero, those rows predate the CHECK and need individual review (do not bulk-update).

---

## 2026-06-08 — DB migration 0084: complete lead_health removal from production (column, constraint, index, function, RPC SET statements)

---

## 2026-06-08 — Fix: get_wa_unread_count passed conversation id instead of lead_id to can_access_wa_conversation — unread badge always returned 0

**DB:** Migration `20260608000085_fix_wa_unread_count.sql` — `CREATE OR REPLACE get_wa_unread_count()`; `can_access_wa_conversation(wc.id)` → `can_access_wa_conversation(wc.lead_id)` (function signature expects `p_lead_id uuid`).

---

## 2026-06-08 — Leads filter bar: remove selection count badges

**UI:** Removed numeric count badges from `LeadsFilters` — slider summary badge, `FilterDropdown` triggers (`hideCountBadge`), and Range date count. Active filters still show via accent border/surface tint; `committedCount` retained only for Clear visibility.

---

## 2026-06-08 — Leads filter bar: Apply button always visible

**UI:** `LeadsFilters` Apply button is permanently rendered (disabled when draft matches URL) instead of animating in via `AnimatePresence` when `isDirty` — prevents filter-bar layout shift.

---

## 2026-06-08 — Leads table toolbar: export + going cold moved from filter bar

**UI:** `ExportButton` and the Going Cold preset chip removed from `LeadsFilters` and placed in `LeadsTable` toolbar. Going Cold sits left (first control); Newest first, Columns, and Export stay grouped on the right. `LeadsTable` receives `filters: LeadFilters` from `LeadsTableAsync` for export. Going Cold still commits immediately to the URL (clears `status` + `outcome` on activate); `committedCount` in `LeadsFilters` still counts `going_cold=true`.

---

## 2026-06-08 — Lead Health feature removed entirely (reverses the 2026-06-06 build below)

**Decision:** The lead-health system (per-lead `healthy` / `needs_attention` / `at_risk` tier) is dropped from the product. The DB column had already been reverted (migration 0082, 2026-06-06), which left dead application code querying a column that no longer exists — a correctness hazard. This change removes every remaining trace.

> **Not touched:** *Domain Health* (`DomainHealthCard`, `getDomainHealthMetrics`, the founder/admin domain-health overview) is a separate feature and remains fully intact.

**Removed:**

- `supabase/migrations/20260608000083_status_counts_drop_health.sql` — drops the old 9-param `get_leads_status_counts` overload (with `p_health`) and recreates it with 8 params, removing the `l.lead_health` predicate (the last DB remnant; the column itself went in 0082)
- `src/lib/utils/lead-health.ts` — deleted (`computeLeadHealth()`, `LeadHealth` type)
- `src/trigger/refresh-lead-health.ts` — deleted (`refreshLeadHealthTask` hourly cron; was already orphaned after 0082)
- `src/components/performance/LeadHealthStrip.tsx` — deleted
- `src/lib/services/performance-service.ts` — `getAgentLeadHealthBreakdown` + `LeadHealthBreakdown` type removed
- `src/lib/actions/performance.ts` — `getAgentLeadHealthAction` + `GetAgentLeadHealthSchema` removed
- `src/components/performance/AgentDetailPanel.tsx` — health strip JSX, `healthData`/`isHealthLoading` state, and the `[agent.id, domain]` health `useEffect` removed; imports of `getAgentLeadHealthAction` / `LeadHealthStrip` / `LeadHealthBreakdown` dropped
- `src/components/leads/LeadsFilters.tsx` — `LeadHealthTier` type, `HEALTH_ITEMS`, the Health `FilterDropdown`, and `health` from `FilterDraft` / `draftFromParams` / `isDirty` / `committedCount` / `applyFilters` / `clearAll` removed
- `src/lib/services/leads-service.ts` — `.eq('lead_health', filters.health)` removed from both `getLeadsByRole` and `getLeadsForExport`; `p_health` dropped from the `get_leads_status_counts` RPC call
- `src/app/(dashboard)/leads/page.tsx` — `health` URL-param parsing removed from `parseLeadFilters`
- `src/components/leads/ExportButton.tsx` + `src/lib/actions/leads.ts` — `health` dropped from the export filter payload
- `src/lib/validations/lead-schema.ts` — `health` enum removed from the export filters schema
- `src/lib/types/database.ts` — `lead_health` removed from `leads` Row/Insert/Update; `health?` removed from `LeadFilters`

`pnpm tsc --noEmit` clean. Docs updated: `master.md` (migration index + decision log + registries), `lead-page.md`, `performance-page.md`, `src/app/(dashboard)/leads/CLAUDE.md`.

---

## 2026-06-08 — WhatsApp lead notifications — fix silent intermittent loss on Vercel (root cause: orphaned fire-and-forget sends)

**Problem:** Only a few WhatsApp lead-assignment / founder notifications were delivered per day even though lead ingestion via the API worked perfectly. Every row in `whatsapp_notification_logs` showed `gupshup_status: 202`, `status: submitted`, `delivered: true` — i.e. Gupshup accepted 100% of what reached it. The missing notifications left **no log row at all** (missing rows, not error rows).

**Root cause:** The entire notification stack used `void fn().catch()` fire-and-forget under the belief notifications must never block the response. On Vercel the serverless function is frozen/killed the instant the HTTP response (or server-action return) is flushed, so in-flight Gupshup `fetch()` calls — and the `logNotification` inserts that follow them — were orphaned mid-execution. An `await notifyLeadAssigned()` had been added at the leads webhook route, but it was defeated because `notifyLeadAssigned` itself used `void send().catch()` internally and resolved before any fetch began. Delivery succeeded only when the lambda happened to stay warm long enough — hence "2–3 a day."

**Fix (after() + await):**

- `src/lib/services/lead-assignment-notify.ts` — the two outward WhatsApp sends (agent + founder) are now collected and **awaited** via `Promise.allSettled` so `notifyLeadAssigned` does not resolve until Gupshup has accepted/rejected each message. Failures isolated; never throws.
- `src/lib/services/whatsapp-api.ts` — all 5 `logNotification` calls in the send functions' `finally` blocks changed from `void logNotification().catch()` to `await logNotification()` so the log row is durably written before the send function resolves (same orphaning bug at the log layer).
- `src/app/api/webhooks/leads/route.ts` — notification call moved from bare `await` to `after(notifyLeadAssigned(...))`; Pabbly still gets an instant 201 while Vercel keeps the lambda alive until the awaited sends settle. Added `export const maxDuration = 60`.
- `src/lib/actions/leads.ts` `assignLead` + `createManualLead` — `void notifyLeadAssigned()` → `after(notifyLeadAssigned(...))`; added `import { after } from 'next/server'`.
- `src/lib/services/whatsapp-ingestion.ts` — `void notifyLeadAssigned()` → `await` (it already runs inside the whatsapp route's `after()`; void detached it from the tracked chain).
- `src/app/api/webhooks/whatsapp/route.ts` — added `export const maxDuration = 60` (its `after()` now carries the awaited notify chain).
- `src/lib/actions/sla.ts` — `void sendSlaAgentNotification` / `void sendSlaManagerNotification` → `await` (same risk inside Trigger.dev runs).
- `src/lib/actions/CLAUDE.md`, `src/lib/services/CLAUDE.md` — reversed the now-incorrect "always void, never await" / "never await logNotification" rules; documented the Vercel lifecycle and the `after()` + await pattern.

**Industry-standard note:** `after()` is the correct primitive for post-response work on serverless (keeps the lambda alive until the promise settles), replacing orphaned `void`. A bare `await` would delay the webhook ack; a bare `void` loses the work on freeze — `after()` satisfies both.

---

## 2026-06-06 — Leads table — sort order toggle moved from filter bar to table toolbar

- `src/components/leads/LeadsTable.tsx` — "Newest first" / "Oldest first" toggle added to table toolbar, immediately left of Columns; reads `sort_order` from URL and commits on click via `buildFilterParams` (resets `page`)
- `src/components/leads/LeadsFilters.tsx` — `sort_order` removed from `FilterDraft`, `isDirty`, `committedCount`, and Apply; no longer rendered in the filter row
- `src/components/leads/CLAUDE.md`, `src/app/(dashboard)/leads/CLAUDE.md` — sort toggle ownership and Invariant 28 updated

---

## 2026-06-06 — Leads page — remove 30-day soft default date redirect

- `src/app/(dashboard)/leads/page.tsx` — removed IST-aware redirect that forced `date_from=<30-days-ago>` when the param was absent; `/leads` now loads with no date filter by default
- `src/app/(dashboard)/leads/CLAUDE.md` — removed 30-day soft default section; kept `date_from` IST midnight service-layer note

---

## 2026-06-06 — Leads page — 30-day soft default date window via IST-aware redirect in page.tsx; date_from always present in URL on load

- `src/app/(dashboard)/leads/page.tsx` — before `parseFilters`, checks `resolvedParams['date_from']`; if absent, computes 30-days-ago in IST (UTC arithmetic with `IST_OFFSET_MS = 5.5 * 60 * 60 * 1000`) and `redirect('/leads?date_from=YYYY-MM-DD')`; fires only when `date_from` is absent — any present value (including historical) is left untouched
- `src/lib/services/leads-service.ts` — `getLeadsByRole` and `getLeadsForExport`: bare `YYYY-MM-DD` `date_from` now suffixed to `T00:00:00+05:30` before `.gte()` query; fixes IST midnight misalignment (PostgREST treated bare date as UTC midnight = 05:30 IST, excluding leads created before that time)
- `src/app/(dashboard)/leads/CLAUDE.md` — 30-day soft default, redirect mechanic, "Clear = reset to default" contract, all-time path, and IST midnight fix documented

---

## 2026-06-06 — Cold Leads dashboard widget for manager/admin/founder

- **Migration `20260606000081_dashboard_cold_leads.sql`** — `CREATE OR REPLACE FUNCTION get_dashboard_summary` adds `cold_leads` CTE (5-day threshold, non-terminal statuses, role/domain-scoped); `cold_leads_count int` key in final `jsonb_build_object`; agent early-return branch returns `cold_leads_count: 0`; `GRANT EXECUTE` re-applied
- `src/lib/types/index.ts` — `DashboardSummary.cold_leads_count?: number` added
- `src/components/dashboard/widgets/ManagerColdLeadsWidget.tsx` — new widget; stat card layout; mono count number; warning colour when count > 0; entire card is a `Link` to `/leads?going_cold=true`; data from `initialData?.cold_leads_count` only — no mount fetch, no server action
- `src/lib/constants/dashboard-widgets.ts` — `manager-cold-leads` entry (`sm`, `colSpan: 1`, manager/admin/founder); added to `DEFAULT_LAYOUT_BY_ROLE` for all three roles
- `src/components/dashboard/DashboardWidgetSlot.tsx` — `React.lazy` entry for `ManagerColdLeadsWidget`
- `src/app/(dashboard)/CLAUDE.md` — widget table and no-client-fetch rule documented

---

## 2026-06-06 — Going Cold filter preset on /leads page

- `src/lib/constants/leads.ts` — new file; `COLD_LEAD_THRESHOLD_DAYS = 5`
- `src/lib/types/database.ts` — `LeadFilters.going_cold?: boolean` added
- `src/lib/services/leads-service.ts` — `getLeadsByRole` and `getLeadsForExport` apply `going_cold` branch: `last_activity_at < threshold AND status NOT IN (won/lost/junk)`; `COLD_LEAD_THRESHOLD_DAYS` imported; `p_going_cold` param passed to `get_leads_status_counts` RPC
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` maps `going_cold=true` URL param
- `src/components/leads/LeadsFilters.tsx` — "Going Cold" immediate-commit chip (Clock icon; warning tokens when active); `committedCount` includes `going_cold`; chip click clears `status`/`outcome` URL params on activate
- `src/components/leads/LeadsTableAsync.tsx` — `going_cold` counted in `hasActiveFilters`; `goingCold` prop passed to `LeadsTable`
- `src/components/leads/LeadsTable.tsx` — `goingCold` prop; empty state: "No cold leads." / "All leads have had recent activity."
- `src/app/(dashboard)/leads/CLAUDE.md` — Going Cold filter section + URL param table updated

---

## 2026-06-06 — Leads status pills — counts now reflect full filtered dataset via get_leads_status_counts RPC; Promise.all parallel fetch

- **Migration `20260606000080_get_leads_status_counts.sql`** — `get_leads_status_counts` RPC; STABLE SECURITY DEFINER; role/domain self-enforced via `get_user_role()` / `get_user_domain()`; 9 optional filter params mirroring `getLeadsByRole`; empty-array guard on outcomes/statuses; GRANT EXECUTE to authenticated
- `src/lib/types/database.ts` — `LeadStatusCount` type added; `LeadsResult` extended with `statusCounts: Partial<Record<LeadStatus, number>>`
- `src/lib/services/leads-service.ts` — `getLeadsByRole` now runs paginated query and `get_leads_status_counts` RPC in `Promise.all` (never sequentially); RPC result reduced to `Partial<Record<LeadStatus, number>>` with `Number()` cast (Q-09); `{}` on RPC error (non-fatal); `LeadStatus` added to type imports
- `src/components/leads/LeadsTableAsync.tsx` — destructures `statusCounts` from `getLeadsByRoleCached`; passes as prop to `LeadsTable`
- `src/components/leads/LeadsTable.tsx` — `statusCounts?: Partial<Record<LeadStatus, number>>` prop added (default `{}`); `useMemo` count-from-`leads[]` removed entirely; toolbar pills read `statusCounts[status] ?? 0` exclusively
- `src/app/(dashboard)/leads/CLAUDE.md` — `LeadsResult` spec updated with `statusCounts`; RPC name, param-sync rule, and `Promise.all` pattern documented
- `supabase/migrations/CLAUDE.md` — migration 0080 added to inventory

---

## 2026-06-06 — Lead export — CSV + XLSX, checkbox selection toolbar, filter-level export

- **Package:** `xlsx` (SheetJS) `0.18.5` added — CSV + XLSX workbook generation (Q-05)
- `src/lib/services/leads-service.ts` — `getLeadsForExport` (mirrors `getLeadsByRole` filter logic, no `.range()`, hard cap 5000); `getActivitiesAndNotesForExport` (parallel IN queries for activities + notes); exports `LeadExportItem`, `ExportResult`, `ExportActivitiesAndNotes` types
- `src/lib/validations/lead-schema.ts` — `ExportLeadsSchema` + `ExportLeadsInput` added
- `src/lib/actions/leads.ts` — `exportLeadsAction`; `ExportPayload` type; returns `{ leads, activities, notes, totalCount }` plain JSON — never imports xlsx server-side; hard error when `totalCount > 5000`
- `src/lib/constants/export-columns.ts` — `LEAD_EXPORT_HEADERS`, `ACTIVITY_EXPORT_HEADERS`, `NOTE_EXPORT_HEADERS` flat column maps; `ExportHeader` type
- `src/lib/utils/export.ts` — **CLIENT-SIDE ONLY**; `buildCSV`, `buildLeadsCSV`, `buildXLSXWorkbook` (dynamic `import('xlsx')`), `triggerBrowserDownload`; never import from server actions or services
- `src/components/leads/ExportModal.tsx` — composes `ui/modal.tsx`; format pills CSV / XLSX; `max-w-sm`; zero hardcoded colours
- `src/components/leads/ExportButton.tsx` — ghost button in filter bar; opens `ExportModal`; calls `exportLeadsAction` then triggers browser download
- `src/components/leads/LeadsSelectionToolbar.tsx` — `AnimatePresence` enter/exit; "Export CSV" + "Export XLSX" + "Clear"; `--theme-accent-surface` background; renders above table when selection non-empty
- `src/components/leads/LeadsTable.tsx` — checkbox column (not in `lead-columns.ts` registry); header indeterminate via ref; row checkbox with `onClick stopPropagation`; `selectedLeadIds` `Set<string>` state; clears on `leads` prop change (page nav / filter change); renders `LeadsSelectionToolbar`
- `src/components/leads/LeadsFilters.tsx` — `filters: LeadFilters` prop added; `ExportButton` rendered at trailing end of filter bar
- `src/app/(dashboard)/leads/page.tsx` — `filters` passed to `LeadsFilters`

---

## 2026-06-06 — Lead Health — persisted column, RPC hooks, hourly refresh job, AgentDetailPanel health strip, leads list health filter

- `supabase/migrations/20260606000077_lead_health_column.sql` — `lead_health text CHECK (... 'healthy' | 'needs_attention' | 'at_risk')` column on `leads`; no default (NULL = not yet evaluated or terminal); `idx_leads_health (lead_health, assigned_to) WHERE archived_at IS NULL`
- `supabase/migrations/20260606000078_lead_health_rpc_hooks.sql` — `CREATE OR REPLACE` for three RPCs: `add_lead_call_note` → `lead_health = 'healthy'`; `add_lead_plain_note` → `lead_health = 'healthy'`; `update_lead_status` → `NULL` for terminal statuses, else `'healthy'`; all signatures, return shapes, SECURITY DEFINER, search_path, and GRANT preserved exactly
- `supabase/migrations/20260606000079_refresh_lead_health_rpc.sql` — `refresh_lead_health_bulk()` SECURITY DEFINER RPC; single UPDATE with CASE expression mirroring `computeLeadHealth()`; at_risk checked before needs_attention; correlated EXISTS on `tasks + task_gia_meta` for overdue follow-up detection; returns row count
- `src/lib/utils/lead-health.ts` — `computeLeadHealth()` pure function; `LeadHealth` type; first-match CASE logic matching the SQL exactly; null for terminal statuses
- `src/trigger/refresh-lead-health.ts` — `refreshLeadHealthTask` (`schedules.task`); cron `0 * * * *`; calls `refresh_lead_health_bulk()` RPC via `createAdminClient()`; logs in non-production only (P-07)
- `src/lib/services/performance-service.ts` — `getAgentLeadHealthBreakdown(agentId)` added; single query grouped by `lead_health`; excludes archived, terminal statuses, null health; `LeadHealthBreakdown` type exported
- `src/lib/actions/performance.ts` — `getAgentLeadHealthAction(agentId, domain)` added; auth guard identical to `getAgentDetailMetricsAction` (manager domain-scoped, agent/guest denied); `GetAgentLeadHealthSchema` Zod validation
- `src/components/performance/LeadHealthStrip.tsx` — new component; three inline pill chips (at_risk / needs_attention / healthy); bg + text use semantic token pairs (`--color-danger-light`/`-text`, `--color-warning-light`/`-text`, `--color-success-light`/`-text`); 6px dot per chip; V-10 section micro-label; each chip deep-links `/leads?assigned_to={agentId}&health={tier}` via Next.js `Link`; zero hardcoded hex; no coloured border on container
- `src/components/performance/AgentDetailPanel.tsx` — second `useEffect` keyed on `[agent.id, domain]` only (never period) for health data; `healthData` + `isHealthLoading` states; `cancelled` ref pattern (Q-15); three skeleton chips while loading; `LeadHealthStrip` rendered between stats row and deal breakdown; health never re-fetches on period change
- `src/lib/types/database.ts` — `lead_health: 'healthy' | 'needs_attention' | 'at_risk' | null` added to `leads` Row, Insert, Update; `LeadFilters.health?: 'healthy' | 'needs_attention' | 'at_risk' | null` added
- `src/lib/services/leads-service.ts` — `getLeadsByRole` applies `.eq('lead_health', filters.health)` when present
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` reads and validates `health` URL param
- `src/components/leads/LeadsFilters.tsx` — `LeadHealthTier` type; `HEALTH_ITEMS` constant; `health` field added to `FilterDraft`, `draftFromParams`, `isDirty`, `committedCount`, `applyFilters`, `clearAll`; Health `FilterDropdown` (single-select, portal) added after Domain

---

## 2026-06-06 — Leads table: Latest Note column

- `src/lib/services/leads-service.ts` — `LatestNote` type (local, non-exported); `LeadListItem` extended with `latest_note: LatestNote | null`; private `getLatestNotesForLeads(leadIds, supabase)` helper (one `.in()` query, `Map` reduce, empty-array guard); called in `getLeadsByRole` after main query resolves — two sequential queries total, never per-row
- `src/lib/constants/lead-columns.ts` — `'latest_note'` added to `LeadColumnId` union and `LEAD_COLUMNS` registry (`defaultVisible: false`, `locked: false`)
- `src/components/leads/LeadsTable.tsx` — `latest_note` case added to `LeadCell` switch: content line (truncated, `--theme-text-secondary`), micro-label line (author · date, `--theme-text-tertiary`); null renders `—`; no new component file

---

## 2026-06-06 — Lead column picker: portal + scrollable list

- `src/components/leads/LeadColumnPicker.tsx` — panel portals to `document.body` with `fixed` positioning (mirrors `FilterDropdown` / `LeadsFilters` date range); right-aligns to the Columns trigger; scroll region capped at 240px with footer pinned outside; `anchorRef` prop required; native checkboxes replaced with themed `ColumnCheckbox` (design-dna §7.5 — accent fill, `--theme-accent-fg` check, spring snap)
- `src/components/leads/LeadsTable.tsx` — passes `pickerAnchorRef` to `LeadColumnPicker` (fixes clipping from table card `overflow: hidden`)

---

## 2026-06-06 — Leads: created_at sort toggle (asc/desc)

- `src/lib/types/database.ts` — `LeadFilters.sort_order?: 'asc' | 'desc'` added
- `src/lib/constants/redis-keys.ts` — `buildLeadListKey` includes `sort_order` in cache key hash
- `src/lib/services/leads-service.ts` — `getLeadsByRole` uses `.order('created_at', { ascending: filters.sort_order === 'asc' })`; default `'desc'` (newest first) preserves existing behaviour
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` reads `sort_order` param; invalid/absent values default to `'desc'`
- `src/components/leads/LeadsFilters.tsx` — `sort_order` added to `FilterDraft`; compact toggle button (ArrowDownUp icon, "Newest first" / "Oldest first") renders between Range and Apply; URL param only written when `'asc'`; `clearAll` resets to `'desc'`; `LeadsTable.tsx` unchanged

---

## 2026-06-06 — Personal details card: City above Details

- `src/components/leads/PersonalDetailsCard.tsx` — field order: Company, Occupation, Interests, City, then Details textarea (full width).

---

## 2026-06-06 — Lead dossier: personal details below form responses

- `src/app/(dashboard)/leads/[id]/page.tsx` — left column order: `LeadInfoCard` → `DynamicFormResponses` → `PersonalDetailsCard`.

---

## 2026-06-06 — Indian compact numbers (K/L/Cr) + mono stat values

- `src/lib/utils/numbers.ts` — `formatCompact` uses K → L (lakh) → Cr (crore) instead of M; `formatCurrencyCompact` INR follows design-dna (e.g. `₹12.5L`, `₹1Cr`); USD keeps K/M via internal `formatCompactWestern`.
- `src/components/performance/StatAtom.tsx` — stat values use `--font-mono` + `tabular-nums` (matches `DealsSummaryStrip`).
- `src/components/performance/DomainOverviewPanel.tsx` + `AgentDetailPanel.tsx` — revenue stat uses `formatCurrencyCompact`.
- `src/components/performance/DomainOverviewPanel.tsx` — domain title `line-height` relaxed (`--leading-snug`) so Playfair descenders are not clipped.

---

## 2026-06-06 — Domain icons on performance Domains tab

- `src/lib/constants/domain-icons.ts` — `DOMAIN_ICONS` / `GIA_DOMAIN_ICONS` / `getDomainIcon()` (Lucide marks per `app_domain`).
- `src/components/performance/DomainOverviewPanel.tsx` — domain card header uses bare domain icon (no tile background), tinted via `DOMAIN_LINE_COLORS`.

---

## 2026-06-06 — Performance Domains tab: StatAtom cards + number formatting

- `src/components/performance/StatAtom.tsx` — extracted shared semantic KPI card from `AgentDetailPanel` (palette backgrounds, uppercase micro-label, Playfair value).
- `src/components/performance/DomainOverviewPanel.tsx` — domain cards redesigned: single paper card per domain (header + `StatAtom` row); conversion % line removed; leads/calls use `formatCompact`, revenue uses `formatCurrency` (Indian grouping).
- `src/components/performance/AgentDetailPanel.tsx` — imports shared `StatAtom`; stat row uses `formatCompact` for counts and `formatCurrency` for revenue.

---

## 2026-06-05 — loading.tsx skeleton fixes + tasks default tab

- `/tasks` loading.tsx — rewritten to import `TasksSkeleton` directly; eliminates the double-skeleton that occurred because loading.tsx and the page's Suspense fallback both showed a skeleton.
- `/tasks` — default tab changed from `validTabs[0]` (Gia for Gia-domain users) to always `'personal'` (My Tasks); `?tab=` param still overrides.
- `/performance` loading.tsx — rewritten to import `PerformanceSkeleton`; now shows the correct agent-view KPI/effort/outcome shape with no filter bar instead of the wrong manager two-column shape.
- `/settings` loading.tsx — corrected from table layout to card-list layout matching `AgentSettingsTable`'s real render output.
- `/admin/users` loading.tsx — corrected from table layout to card-list layout matching `UsersTable`'s real `UserCard` flex structure.

---

## 2026-06-05 — Leads range filter: fix calendar month-nav closing panel

- `LeadsFilters` — range panel outside-click handler now ignores clicks inside portaled `DatePicker` calendars (`[data-datepicker-panel]`); month arrows no longer dismiss the range card.
- `TasksFilters`, `DealsFilters`, `CampaignFilters` — same fix (shared range + portaled DatePicker pattern).

---

## 2026-06-05 — Page-level loading.tsx skeletons added (remaining routes)

- `/performance` — loading.tsx skeleton added (filter bar + two-column roster + detail panel).
- `/campaigns` — loading.tsx skeleton added (filter bar + 5 campaign card rows).
- `/settings` — loading.tsx skeleton added (filter bar + agent roster table with shift/toggle columns).
- `/admin/users` — loading.tsx skeleton added (header + filter bar + 6 user table rows).
- `/admin/ad-creatives` — loading.tsx skeleton added (header + search + 3-col video card grid).

---

## 2026-06-05 — Lead Volume widget: count moved to header right

- `ManagerLeadVolumeWidget` — removed "N leads in range" subtitle; total now sits top-right as mono count with a slow accent dot pulse (`eia-page-dot-blink`); fades while refetching.

---

## 2026-06-05 — Page-level loading.tsx skeletons added (perceived navigation fix)

- `/dashboard` — loading.tsx skeleton added (bento grid outline, 4 widget blocks).
- `/leads` — loading.tsx skeleton added (filter bar strip + 8 table row skeletons).
- `/tasks` — loading.tsx skeleton added (header + tab selector + calendar + task list).
- `/deals` — loading.tsx skeleton added (filter bar + summary strip + 6 card rows).

---

## 2026-06-05 — Dashboard: fix AgentTasksWidget mount POST regression

- Dashboard — fix AgentTasksWidget mount POST regression; `page.tsx` now coerces `rpcData.agent_tasks ?? []`, `rpcData.agent_activity ?? []`, and `rpcData.campaigns ?? []` before spreading into `initialData`. PostgreSQL's `jsonb_agg()` returns NULL on zero matching rows; the RPC's `COALESCE` guards against this, but the page-layer coercion makes the null-safety explicit and resilient to any future RPC revision that drops a `COALESCE`.

---

## 2026-06-05 — Dashboard: remove Live pill from My Tasks widget

- `AgentTasksWidget` — removed the green "Live" status pill from the widget header; unused `eia-tasks-live-pulse` keyframe dropped.

---

## 2026-06-05 — LeadsFilters: single horizontal row (layout pass)

- LeadsFilters: two-row layout collapsed to single horizontal row with search/chip divider and trailing Apply/Clear — 2026-06-05, layout pass.
- LeadsFilters: `menuPortal` on all `FilterDropdown` chips — fixes filter menus clipped by horizontal scroll container.
- Leads filter bar: suppress focus accent ring on search, filter chips (`accentBorderOnOpen={false}`), Range open state, and Apply (`suppressFocusAccent` / `suppressFocusRing`).

---

## 2026-06-05 — Tasks · group visibility flattened to creator + subtask assignee for all roles; Gia agents unblocked from Group tab; migration 0058.

---

## 2026-06-05 — WhatsApp notifications: fix second founder not receiving alert

### Bug fix — sequential founder loop replaced with parallel `Promise.all`

- `src/lib/services/whatsapp-api.ts` `sendFounderLeadNotification` — the `for...of` loop sent to each founder **sequentially** (`await fetch` per iteration). With two founders, the second fetch only started after the first completed. If the first was slow, the second could be skipped by a timeout or the function could be killed mid-loop. Changed to `await Promise.all(founders.map(...))` so both Gupshup API calls are dispatched simultaneously. Each founder's `try/catch/finally` block remains independent — one failure does not prevent the other from logging or delivering.

---

## 2026-06-05 — Webhook lead ingestion: fix WhatsApp notification not firing

### Bug fix — `void` fire-and-forget killed before completion on Vercel

- `src/app/api/webhooks/leads/route.ts` — changed `void notifyLeadAssigned(...)` to `await notifyLeadAssigned(...)` before `NextResponse.json(...)` is returned. On Vercel's serverless runtime, the function process is frozen/killed as soon as the HTTP response is sent; any unawaited `void` promises are silently dropped. Manual lead creation worked because it runs inside a Server Action (Next.js keeps the action alive until all awaited work completes). The webhook route is a plain route handler — it has no such guarantee, so the `notifyLeadAssigned` call (which spawns the Gupshup template sends) was being killed before it could dispatch. The `.catch()` wrapper is preserved so a notification failure never blocks the `201` response to the webhook caller.

---

## 2026-06-05 — Tasks page: deadline editing, delete fix, date range picker

### SubTaskModal — deadline editing in edit mode

- `SubTaskModalTaskUpdate` type extended with `due_at?: string | null` so parent list components receive deadline changes after save.
- `dueAt: string | null` display state added (mirrors pattern of `title`, `description`, `status`, `priority`). Read-only deadline row now reads from this state, not the immutable `task` prop — no refresh needed after save.
- `editDueAt: Date | null` edit state added; seeded from `dueAt` state on `enterEditMode`.
- `DatePicker showTime` rendered in place of the read-only span when edit mode is active. Clears/sets deadline with full date+time precision.
- `handleSaveBrief` includes `due_at` in `updateTaskAction` when changed, calls `setDueAt(newDueAtIso)` on success, emits `due_at` to parent via `onTaskUpdated`, and calls `router.refresh()` to sync RSC data.
- `useRouter` imported; `router.refresh()` added after every successful `handleSaveBrief` call (covers all field saves, not just deadline).

### GroupTasksTab — delete dialog and ⋯ dropdown portaling

- `⋯ dropdown` portaled to `document.body` via `createPortal`. `moreButtonRef` + `menuRect` state capture the button's `getBoundingClientRect()` at open time; panel positions with `position: fixed`. Fixes clipping caused by card `overflow: hidden`.
- Confirm delete dialog portaled to `document.body`. Fixes the backdrop (z-index 61) covering the dialog panel (z-index 60) — the Framer Motion card `transform` was creating a new containing block for `position: fixed` children, trapping the dialog inside the card's painted area.
- Confirm delete dialog backdrop changed from `--z-modal-overlay` (61) to `--z-overlay` (50); dialog panel stays at `--z-modal` (60). Backdrop now correctly sits below the dialog.

### GroupTaskWorkspace — delete dialog z-index fix

- Same z-index inversion fixed: backdrop `--z-modal-overlay` → `--z-overlay`.

### GroupTaskWorkspace — add-subtask due date picker

- `addDueAt` state changed from `string` (raw `YYYY-MM-DD`) to `Date | null`.
- Native `<input type="date">` in the add-subtask FAB panel replaced with `DatePicker showTime`.
- `DatePicker` imported.

### TasksFilters — Gia tab date range picker

- Two raw `<input type="date">` fields (From / To) replaced with the same "Range" trigger button + portal panel pattern used on the leads filter bar.
- Portal panel contains two `DatePicker` components with `minDate`/`maxDate` cross-constraints and a clear × button. Positioned via `getBoundingClientRect()` + `visualViewport` offset correction. Closes on outside pointer-down.
- `dateFromUrlParam` / `dateToUrlParam` from `filter-params.ts` used for `Date ↔ YYYY-MM-DD` conversion.
- Imports added: `useCallback`, `useEffect`, `useLayoutEffect`, `useRef`, `useState`, `createPortal`, `motion`, `AnimatePresence`, `DatePicker`, `dateFromUrlParam`, `dateToUrlParam`, `DROPDOWN_VARIANTS`.

---

## 2026-06-05 — Group task delete fix (portal escape)

**Bug:** Clicking "Delete group" on the group task list showed the confirm dialog as "washed out" and unresponsive. Root cause: `position: fixed` children rendered inside a Framer Motion `motion.div` card. The card's entrance animation applies a CSS `transform`, which creates a new stacking context **and** a new containing block for `position: fixed` descendants. The dialog was trapped inside the card's painted area — visually dimmed by the card's own background and its `pointer-events` were blocked.

**Secondary bug:** The ⋯ dropdown was clipped by the card's `overflow: hidden` when the row was collapsed.

**Fix:** Both the ⋯ dropdown menu and the confirm delete dialog are now portaled to `document.body` via `createPortal`. The dropdown records its trigger button's `getBoundingClientRect()` at open time and positions itself with `position: fixed` from `document.body`, bypassing all ancestor transforms and overflow clipping.

- `src/components/tasks/GroupTasksTab.tsx` — `moreButtonRef` + `menuRect` state added; ⋯ dropdown portaled to body with `fixed` positioning; confirm delete dialog portaled to body (was inline inside the card).

---

## 2026-06-05 — Deals promoted to first-class table

**Decision reversal:** The 2026-05-31 "no deals table" decision is reversed. `public.deals` is
now a first-class table. Reason: one lead has one terminal `won` and cannot hold repeat/renewal
deals; walk-in sales have no lead lifecycle at all. Both are now real requirements.

Decision Log entry added to `docs/master.md` and `The_Rules.md`.

### Migrations

- `20260605000072_create_deals_table.sql` — `public.deals` table (RLS enabled; three SELECT
  policies: agent/manager/admin-founder; no INSERT/UPDATE/DELETE for regular users; soft-delete
  only via `archived_at`). `won_at` is immutable after insert. `client_id` column reserved (FK
  deferred to clients module). Indexes: domain, assigned_to, won_at DESC, lead_id, contact_phone.
- `20260605000073_backfill_deals_from_won_leads.sql` — idempotent backfill; every
  `status='won' AND deal_amount IS NOT NULL` lead row copied to `deals`; NOT EXISTS guard
  prevents double-insert.
- `20260605000074_get_deals_summary_over_deals.sql` — `CREATE OR REPLACE` of
  `get_deals_summary` RPC; source table is now `public.deals`; structural WHERE collapses to
  `archived_at IS NULL`; date filters apply to `won_at` (was `status_changed_at`); two-domain
  parameter split (p_caller_domain / p_filter_domain) preserved.

### Application layer

- `src/lib/validations/deal-schema.ts` (new) — `RecordDealSchema` + `CreateWalkInDealSchema`;
  `lead-schema.ts` re-exports `RecordDealSchema` for back-compat.
- `src/lib/actions/deals.ts` (new) — `recordDeal` (lead → deal path, inserts deals row then
  delegates `updateLeadStatus('won')`), `createWalkInDeal` (no lead; agent domain-locked
  server-side), `listAgentsForDealDomain` (read action for NewDealModal picker).
- `src/lib/actions/leads.ts` — `recordDeal` now re-exported from `deals.ts`; old inline
  implementation removed.
- `src/lib/services/deals-service.ts` — rewritten to query `public.deals`; joins
  `lead(slug)` and `assignee(full_name)`; date filters now on `won_at`; search on
  `contact_name/contact_phone/contact_email`.
- `src/lib/types/database.ts` — `Deal` type + `DealWithRelations` (replaces `DealWithAssignee`).

### UI

- `src/components/deals/DealCard.tsx` — handles nullable `lead_id`; walk-in deals render as
  non-link card with "Walk-in" pill (no coloured edge border per Never-Do list); lead-sourced
  deals link to `/leads/${slug ?? lead_id}`; uses `won_at` for "Won {date}" line.
- `src/components/deals/NewDealModal.tsx` (new) — two-step modal (Contact → Details);
  composes `ui/modal.tsx`; agent domain/assignee locked server-side; `createWalkInDeal` action.
- `src/components/deals/AddDealButton.tsx` (new) — thin client wrapper holding modal open state.
- `src/app/(dashboard)/deals/page.tsx` — New Deal button added to page header (all roles
  except guest); `/deals` is no longer read-only.
- `src/app/(dashboard)/deals/DealsAsync.tsx` — updated to use `DealWithRelations`.

---

## 2026-06-05 — Tasks: fix deleteTaskAction aborting on Trigger.dev cancel failure

- `src/lib/actions/tasks.ts` `deleteTaskAction` — `cancelTaskReminder` is now wrapped in
  try/catch; a cancel failure (no runs found, SDK/network error) logs the error but no
  longer aborts the delete. A missed reminder cancel is recoverable; a broken delete UX
  is not. Adds a `console.log` of `task_category` after the auth check to aid debugging
  of cache invalidation issues.

---

## 2026-06-05 — Tasks: fix create modal opening on tab switch

- `src/hooks/useCreateTriggerModal.ts` — new hook; opens create modal only when
  `createTrigger` increments, not when a tab mounts with a stale counter left over
  from a prior header-button click.
- `MyTasksCalendarView`, `GroupTasksTab`, `PersonalTasksTab`, `TasksShell` — replaced
  `createTrigger > 0` mount effects with `useCreateTriggerModal`.

---

## 2026-06-05 — Profile: settings UX pass + avatars bucket migration

- `/profile` left column reworked: Personal Details migrated to canonical field anatomy
  (`.eia-input` + `.label-micro`, Required pill replaces `*`, two-part E.164 phone with
  +91 country-code prefix display and `normalizeToE164` on blur); Appearance now hosts the
  relocated notification-sound toggle (below swatches, separated by hairline); Security rebuilt
  with a live requirements checklist + confirm-match indicator (re-auth + browser-client-only
  flow unchanged; submit disabled until all requirements met and confirm matches).
  Notifications card and `NotificationPreferences.tsx` removed.
- New migration `20260605000071_avatars_storage_bucket.sql` provisions the public `avatars`
  bucket + own-object RLS policies (`avatars_public_read`, `avatars_insert_own`,
  `avatars_update_own`, `avatars_delete_own`). Fixes avatar upload failing where the bucket
  was never hand-created. `ProfileAvatarSection` now returns specific size/type/network error
  copy via `form-errors.ts` (new keys: `avatarTooLarge`, `avatarInvalidType`,
  `avatarUploadFailed`, `avatarProfileFailed`). New password error keys also added:
  `passwordCurrentIncorrect`, `passwordSameAsCurrent`, `passwordConfirmMismatch`,
  `passwordSessionExpired`.

---

## 2026-06-05 — FilterDropdown portal + Add Lead modal layout

- `src/components/ui/FilterDropdown.tsx` — `menuPortal` renders the menu via `createPortal` at `--z-modal-nested` (no modal-body clipping); `fullWidth` stretches the trigger; `hideCountBadge` for form selects. Repositions on scroll/resize/visualViewport. Long item lists cap at 240px with internal scroll so flip-up positioning stays consistent across triggers on the same row (fixes Assign-to opening above while Source/Domain open below).
- `src/components/leads/AddLeadModal.tsx` — Source, Domain, and Assign to on one 3-column row (2-column for agents: Source + read-only assignee chip). All dropdowns use `menuPortal` + `fullWidth`.

---

## 2026-06-05 — Profile details form hint copy removed

- `src/components/profile/ProfileDetailsForm.tsx` — removed helper text under Phone Number ("Stored as E.164 — India default.") and Username ("Lowercase, numbers, underscores only."). Email read-only hint unchanged.
- `src/app/(dashboard)/profile/page.tsx` — removed section card descriptions on Personal Details and Security.

---

## 2026-06-05 — Lead dossier notes card header simplified

- `src/components/leads/LeadNotesInput.tsx` — card header label renamed from "Team Notes" to "Notes"; "Visible to all" subtitle removed. Icon unchanged.

---

## 2026-06-05 — MessageBar primitive + WhatsApp composer alignment fix

**Problem:** The WhatsApp page composer and the lead dossier `LeadWhatsAppCard` composer both used inline textarea + send-button markup with `alignItems: flex-end` and `--leading-relaxed` line height. The 32px send button forced extra vertical space and the placeholder sat above centre.

**New file:**

- `src/components/ui/MessageBar.tsx` — canonical §5.11 message bar primitive. `alignItems: center` layout; 20px line height + 6px vertical padding so text and placeholder align with the 32px send button; 16px Send icon; auto-grow textarea; `default` and `nested` variants.

**Updated:**

- `src/components/whatsapp/ConversationPanel.tsx` — inline composer replaced with `<MessageBar variant="default" />`.
- `src/components/leads/LeadWhatsAppCard.tsx` — inline composer replaced with `<MessageBar variant="nested" />`.

---

## 2026-06-05 — Lead assignment side-effects consolidated into single orchestrator

**Problem:** Four entry points (webhook route, `assignLead`, `createManualLead`, WhatsApp ingestion) each independently implemented the same four side-effects: agent WhatsApp, founder WhatsApp, in-app `lead_assigned` notification, and SLA timer scheduling. They had already drifted — the webhook and WhatsApp paths were missing the in-app inbox row, the WhatsApp path had a redundant second `profiles` fetch, and `null` was reaching the `lead_id` column of WhatsApp founder alert log rows.

**New file:**

- `src/lib/services/lead-assignment-notify.ts` — `notifyLeadAssigned(input: LeadAssignedNotifyInput)`: orchestrates agent WhatsApp → founder WhatsApp → in-app notification → SLA timers in that order. Each side-effect is individually wrapped; one failure never prevents the others. Founder alert suppressed for duplicates (`isDuplicate: true`). In-app notification suppressed when `actorId === assignedTo` (no self-notify). SLA scheduling suppressed when `scheduleSla: false`. Accepts `leadStatus` and `assignedAt` for re-assignment paths that need non-`'new'` status.

**Rewired call sites:**

- `src/app/api/webhooks/leads/route.ts` — two inline `void send...()` blocks replaced with one `notifyLeadAssigned` call. Adds the previously missing in-app `lead_assigned` row for webhook-ingested leads.
- `src/lib/services/whatsapp-ingestion.ts` — inline WhatsApp + SLA block replaced with one `notifyLeadAssigned` call. The `lead_id` column in founder alert log rows is now always non-null (fixes null `lead_id` on WhatsApp founder alerts). The redundant second `profiles` fetch (for `assignedAgentName`) is retained as a single pre-orchestrator fetch so `agentName` can be passed in.
- `src/lib/actions/leads.ts` → `assignLead` — WhatsApp + founder + in-app + SLA block replaced with one `notifyLeadAssigned` call. The `profiles.select('full_name')` fetch that was already in the parallel `Promise.all` at step 3 supplies `agentName` — no second fetch needed.
- `src/lib/actions/leads.ts` → `createManualLead` — same consolidation; `actorId: caller.id` enables the self-notify suppression.
- `sendLeadAssignmentNotification` and `sendFounderLeadNotification` imports removed from `leads.ts` (no longer called directly).

**Bugs closed:**

1. Webhook-ingested leads never produced an in-app `lead_assigned` row — now fixed.
2. WhatsApp founder alert `lead_id` was null in `whatsapp_notification_logs` — now always non-null.
3. `assignLead` issued a second `profiles` SELECT for agent name after the parallel fetch at step 3 already had it — removed.

---

## 2026-06-05 — WhatsApp lead assignment template params updated

**Changed files:**

- `src/lib/services/whatsapp-api.ts` — `sendLeadAssignmentNotification` now sends three Gupshup template params on the same `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`: `{{1}}` agent first name (derived from profile `full_name`), `{{2}}` lead full name, `{{3}}` lead phone. Agent profile fetch extended to `phone, full_name`; `logNotification` now records `agent_name`.
- `src/lib/constants/whatsapp.ts` — param contract documented inline on `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`.

Call sites unchanged — they already pass lead full name as the second argument.

---

## 2026-06-05 — Lead ingestion: notification fixes + SLA wiring for WhatsApp leads

**Changes:**

- `src/lib/services/lead-ingestion.ts` — `IngestionResult` success shape gains `is_duplicate: boolean`; duplicate path returns `true`, fresh-lead path returns `false`. Also `createLeadFromWhatsApp` now returns `{ assignedAt, domain }` alongside `{ leadId, assignedTo }` so callers have everything needed for SLA scheduling without re-fetching.
- `src/app/api/webhooks/leads/route.ts` — `sendFounderLeadNotification` is now gated on `!result.is_duplicate`. On duplicate submissions the agent is still notified (existing behaviour), but the founder alert is suppressed — no new lead entered the system, nothing for the founder to act on.
- `src/lib/services/whatsapp-ingestion.ts` — three fixes:
  1. `sendLeadAssignmentNotification` and `sendFounderLeadNotification` now use `newLeadDomain` (returned from `createLeadFromWhatsApp`) instead of `lead.domain as string`, eliminating the unsafe cast introduced after migration 0041.
  2. `scheduleSlaTimersForLead` is now called (via dynamic import of `lib/actions/sla`) after a new WhatsApp lead is created and assigned. All leads — Meta webhook, manual, and WhatsApp — now follow the same SLA timer config.
  3. SLA scheduling is fire-and-forget non-fatal: errors are logged with `[whatsapp-ingestion]` prefix but never surface to the webhook response.

**Decision recorded (WhatsApp domain hardcoding):** All inbound WhatsApp leads are permanently assigned `domain = DEFAULT_LEAD_DOMAIN` (`"onboarding"`). This is intentional — WhatsApp leads carry no UTM/campaign data, so campaign-based domain resolution is impossible. If multi-domain WhatsApp routing is ever needed, `createLeadFromWhatsApp` must be extended to accept a `domain` parameter and the webhook routing logic updated accordingly. See note in `src/lib/services/lead-ingestion.ts`.

---

## 2026-06-04 — Dashboard date filter: stop duplicate POST storm

**Root cause:** Changing `dash_preset` navigates the page and re-fetches all cohort data on the server, but Lead Pipeline, Campaign Performance, and Lead Volume widgets also fired their own server actions on every `dateRange` change (plus 30s auto-poll on cohort widgets). That doubled work and spammed `POST /dashboard` in dev.

**Changed files:**

- `src/hooks/useDashboardCohortSync.ts` — apply RSC `initialData` when the date filter changes; no client fetch when the payload matches the active view
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — sync from `initialData.lead_status` for manager + default domain tab; client fetch only for org-wide / other domain tabs; removed 30s poll
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same pattern for campaigns; admin default tab aligned to `DEFAULT_GIA_DOMAIN` (matches RSC `p_initial_domain`); removed 30s poll
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — sync manager `lead_volume` and admin `lead_volume_multi` from RSC; client fetch only for single-domain drill-down tab

---

## 2026-06-04 — Lead Volume widget alignment + data correctness

**Root causes:** (1) RSC fetched volume on the server but the widget skipped the seed whenever `dateRange` was passed (always), forcing a redundant client fetch and a blank chart on first paint. (2) Volume queries used `created_at <= to` while Lead Pipeline uses `created_at < to` (half-open), so counts diverged for the same filter. (3) Bucket assignment dropped leads when the computed bucket key was missing from the pre-built map. (4) PostgREST’s 1000-row default cap silently truncated high-volume ranges.

**Changed files:**

- `src/lib/services/dashboard-service.ts` — shared `fetchVolumeLeads` (paginated), `buildBucketKeys` / `bucketKey`, `buildVolumeSeries`; intake window `gte(from)` + `lt(to)` aligned with pipeline RPCs
- `src/app/(dashboard)/dashboard/page.tsx` — admin/founder RSC seeds `lead_volume_multi` via `getLeadVolumeByDomains`
- `src/lib/types/index.ts` — `DashboardMultiDomainVolumeSummary` + `lead_volume_multi` on `DashboardSummary`
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `seedConsumedRef` pattern (matches Lead Pipeline); domain tab clears stale series; header shows total in range

---

## 2026-06-04 — Lead Pipeline per-agent stacked bars fix

**Root cause:** `agent_counts` in `get_dashboard_summary` / `get_lead_pipeline_refresh` used `COUNT(*)` on per-status subquery rows (number of status buckets, 1–7) instead of `SUM(cnt)` (actual lead count). Stacked bar widths divided by the wrong denominator, so segments exceeded 100% and the colour breakdown did not render correctly.

**Changed files:**

- `supabase/migrations/20260604000070_fix_pipeline_agent_total.sql` — `SUM(cnt)::int AS total` in `agent_counts` and `campaign_agg` for all three dashboard RPCs
- `src/lib/services/dashboard-service.ts` — `normalizeLeadStatusSummary()` coerces jsonb counts to numbers and recomputes each agent's `total` from `counts` (covers stale Redis until TTL)
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `StackedBar` derives bar width denominator from segment counts

---

## 2026-06-04 — Global Dashboard Date Filter

Adds a single date filter at the top of `/dashboard`. Changing it re-scopes **Lead Pipeline**, **Lead Volume**, and **Campaign Performance** for the chosen window. **My Tasks** and **Recent Activity** always show live data and are unaffected.

**Date semantics:** all three filtered widgets filter by `leads.created_at` (intake/cohort date), i.e. "leads that came in during this window." This is the Critical Date-Field Rule invariant — see Decision Log entry in `The_Rules.md`.

**New files:**

- `src/lib/utils/date-range.ts` — pure IST date-range util: `DatePreset` union, `resolvePresetToRange()`, `rangeFromUrlParams()`, `DATE_PRESET_LABELS`
- `src/components/dashboard/DashboardDateFilter.tsx` — filter button with preset list (Today / This Week / This Month / This Quarter) + custom DatePicker range panel; writes `?dash_preset=&dash_from=&dash_to=` URL params

**Changed files:**

- `supabase/migrations/20260604000069_dashboard_date_filter.sql` — extends `get_dashboard_summary`, `get_lead_pipeline_refresh`, `get_campaign_pipeline_refresh` with nullable `p_date_from`/`p_date_to timestamptz` params (backwards-compatible DEFAULT NULL); date filter applied to `created_at` on `lead_status` + `campaigns` CTEs only; `agent_tasks`/`agent_activity` unaffected
- `src/lib/types/index.ts` — re-exports `DateRange`, `DatePreset` from `date-range.ts`
- `src/lib/constants/redis-keys.ts` — all four dashboard cache keys (`dashboardLeadStatus`, `dashboardLeadVolume`, `dashboardLeadVolumeMulti`, `dashboardCampaigns`) now include `:{from}:{to}` segment ('all' when no filter); different ranges produce different cache slots
- `src/lib/services/dashboard-service.ts` — `getDashboardSummary` accepts optional `dateRange`; `getLeadStatusSummary` + `getLeadsByCampaign` accept optional `dateRange`; `getLeadVolumeByPeriod` + `getLeadVolumeByDomains` replaced by `getLeadVolumeByRange` + `getLeadVolumeByDomains` (both accept `DateRange`); `getLeadVolumeForDomain` added; bucket granularity inferred from span (≤2d→hourly, ≤60d→daily, ≤1y→weekly, else monthly) — zero-filled buckets always present
- `src/lib/actions/dashboard.ts` — rewritten: `getLeadStatusSummaryAction`, `getLeadsByCampaignAction`, `getLeadStatusForDomainAction`, `getLeadsByCampaignForDomainAction` accept optional `from?/to?` strings (Zod-validated); `getLeadVolumeByRangeAction`, `getLeadVolumeByDomainsAction`, `getLeadVolumeForDomainAction` replace period-based actions (all accept ISO datetime from/to)
- `src/components/dashboard/DashboardWidgetSlot.tsx` — `dateRange?: DateRange` added to `WidgetProps`
- `src/components/dashboard/DashboardCanvas.tsx` — `DashboardDateFilter` rendered in header (manager/admin/founder only); `dateRange` prop threaded to all widgets
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — reads `dateRange` prop; refetches on `dateRange.from/to` change; passes range to all action calls
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — local period tabs (Today/Week/Month/Quarter) removed; reads `dateRange` from props; default to "week" when no prop provided; domain tabs (admin/founder) retained
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — reads `dateRange` prop; refetches on `dateRange.from/to` change; passes range to all action calls
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — "Live" badge added to header
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — "Live" badge added to header
- `src/app/(dashboard)/dashboard/page.tsx` — reads `dash_preset`, `dash_from`, `dash_to` from `searchParams`; resolves `DateRange` server-side via `resolvePresetToRange`/`rangeFromUrlParams`; passes range to `getDashboardSummary` + `getLeadVolumeByRange`; default preset: `week`

---

## 2026-06-04 — Performance — page scroll layout aligned with Leads/Tasks

- `performance/page.tsx` — all role branches use canonical `<main className="flex-1 min-w-0 p-8">` (was inline padding + agent `maxWidth: 1280px`); title/filter rows use `mb-6` / `mb-4` Tailwind classes matching the list-page contract
- `ManagerPerformancePanel` — removed roster `maxHeight: 600px` + nested `overflowY: auto`; agent list grows with content and scrolls in the dashboard paper shell like other pages
- `PerformanceRosterEmptyState` + `ManagerPerformanceSkeleton` — dropped fixed `600px` min-heights; empty/skeleton right column uses `min(320px, 40vh)`
- `AgentPerformanceShell` — filter strip `mb-6` → `mb-4`

---

## 2026-06-04 — Performance — roster empty state replaces domain health grid

- `PerformanceRosterEmptyState` (`src/components/performance/PerformanceRosterEmptyState.tsx`) — Playfair italic prompt on `paper-subtle` with accent radial wash; shown when no agent is selected on manager/founder Agents tab
- `ManagerPerformancePanel` — removed `DomainHealthGrid` from null-selection right panel; `domainHealth` prop and client refetch of health metrics dropped
- `ManagerPerformanceAsync` — roster-only server fetch (domain metrics remain on founder Domains tab via `page.tsx` + `DomainOverviewPanel`)
- `getManagerRosterAction` — returns `AgentRosterRow[]` only; new `getDomainHealthMetricsAction` for `DomainOverviewPanel` period refetch
- `ManagerPerformanceSkeleton` — right column matches empty-state layout

---

## 2026-06-04 — Performance — Founder view enhancement: Domains tab + violation fixes

- **Migration 0068:** `get_domain_health_metrics` RPC extended — adds `total_calls_made` (SUM of call_count on cohort leads by `created_at`) and `total_revenue` (SUM of deal_value on won leads by `status_changed_at` — Critical Date-Field Rule invariant 1 honoured); `CREATE OR REPLACE` replaces 0066 in place
- `DomainHealthCard` type (`src/lib/types/index.ts`) — `totalCallsMade: number` and `totalRevenue: number` fields added
- `getDomainHealthMetrics` (`src/lib/services/performance-service.ts`) — maps `total_calls_made` and `total_revenue` from RPC row
- `formatCurrencyCompact` added to `src/lib/utils/numbers.ts` — compact currency (₹/$ prefix + K/M magnitude)
- **`DomainOverviewPanel`** (`src/components/performance/DomainOverviewPanel.tsx`) — new `'use client'` component for the founder Domains tab; props: `initialData`, `period`, `customFrom?`, `customTo?`; top section: 2×2 grid of domain cards (Total Leads, Total Calls, Total Revenue per GIA domain); domain label pill uses `DOMAIN_LINE_COLORS` dot; bottom: horizontal `BarChart` with metric toggle (Leads / Calls / Revenue); accent bar on period refetch; `getManagerRosterAction` for re-fetch on period change; skip-first-mount ref prevents double-fetch; all chart colours resolved via `useChartTokens()` — zero raw `var(--)` in Recharts fill
- **`FounderPerformanceShell`** converted from server to `'use client'` component; adds `activeTab: 'agents' | 'domains'` state (never URL); tab switcher ghost pills (active: accent-surface + semibold); `agentsSlot: React.ReactNode` prop carries the server-rendered `<Suspense><ManagerPerformanceAsync /></Suspense>` subtree; Domains tab renders `DomainOverviewPanel`
- `page.tsx` founder branch — fetches `initialDomainHealth` via `getDomainHealthMetrics(GIA_DOMAINS, from, to)` server-side; passes as prop to `FounderPerformanceShell`; passes `agentsSlot` with full `ManagerPerformanceAsync` Suspense boundary
- **`AgentDetailPanel` violation fixes:** `STAT_PALETTES` hex values → `var(--color-success/info/warning/neutral-light)` tokens (V-01); `DetailSkeleton` dead-code function removed; stat palette reduced 5→4; "Calls Today" label → **"Total Calls"** (`totalCallsMade` field); stat card comment updated
- **`PerformanceFilters` violation fixes:** active-count badge `fontSize: '10px'` → `var(--text-2xs)`; period dropdown: removed "All Time", added "Today"; order: Today · This Week · This Month · Previous Month · Custom (`all_time` type and service logic unchanged)
- `src/app/(dashboard)/performance/CLAUDE.md` — Founder view architecture updated, `DomainOverviewPanel` props/data flow documented, component map updated, "Total Calls" rename noted

---

## 2026-06-04 — Dashboard — Lead Pipeline domain tabs fit widget width

- `ManagerLeadStatusWidget` — domain picker uses full-width connected tabs with `flex: 1`, `minWidth: 0`, smaller padding, and ellipsis on long labels (matches Lead Volume widget pattern); prevents Onboarding / Indulge Legacy / All from overflowing the single-column widget

---

## 2026-06-04 — Performance — Domain health overview grid on initial load; null selectedId; filter wiring verified

- Migration 0066: `get_domain_health_metrics(p_domains, p_date_from, p_date_to)` RPC — one row per domain always (UNNEST driving source); five CTEs (cohort, closures, pipeline, calls); all `WHERE archived_at IS NULL`; `SECURITY DEFINER STABLE`; `GRANT EXECUTE TO authenticated`
- `DomainHealthCard` type added to `src/lib/types/index.ts` — `conversionRate: number | null` computed in service, never SQL
- `getDomainHealthMetrics(domains, dateFrom, dateTo)` added to `src/lib/services/performance-service.ts` — single RPC call; all bigint fields through `Number()`; reuses existing `GIA_DOMAINS` constant (no new constant file)
- `src/components/performance/DomainHealthGrid.tsx` — new pure presentational component; 2×2 grid for founder/admin, 1-col for manager single-domain; health pip + conversion badge with semantic colour tokens only; `DomainHealthGridSkeleton` exported inline
- `ManagerPerformanceAsync` — `getDomainHealthMetrics` called in parallel with `getAgentRosterPerformance` via `Promise.all`; `healthDomains = allDomains ? GIA_DOMAINS : [domain]`; `domainHealth` prop forwarded to `ManagerPerformancePanel`
- `ManagerPerformancePanel` — `selectedId` initial state changed from first-agent to `null`; right panel is exclusively `DomainHealthGrid` when `selectedId === null`, exclusively `AgentDetailPanel` when non-null; `AnimatePresence mode="wait"` keyed `"domain-overview"` / agent id; filter resets to `null` (not first agent) when selected agent leaves visible set; `customFrom`/`customTo` forwarded to `AgentDetailPanel`
- `ManagerPerformanceSkeleton` — right-side updated from agent-detail shimmer to 2×2 domain health card grid matching the new initial state
- `src/app/(dashboard)/performance/CLAUDE.md` — `DomainHealthGrid`, `getDomainHealthMetrics`, null-selectedId pattern, migration 0066 documented

---

## 2026-06-04 — Lead list instant refresh + dashboard 30s auto-poll

**Change 1 — `revalidatePath('/leads')` on all lead mutations**

Six server actions now tell Next.js to bust the `/leads` RSC segment in addition to the dossier page. Before this change, the agent's lead list stayed stale until manual navigation; mutations only revalidated the dossier (`/leads/[slug]`).

Actions that gained `revalidatePath('/leads')`:

- `addLeadCallNote` — status may advance (new→touched), call_count and last_call_outcome change
- `updateLeadStatus` — status changes
- `assignLead` — assigned_to changes
- `createManualLead` — new row appears in list
- `revalidateLeadDossier` helper (covers `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource`, `updateLeadCity`)

`createLeadTaskAction` intentionally excluded — creating a task on a dossier does not change any list-visible field.

File: `src/lib/actions/leads.ts`

### Change 2 — 30s silent auto-poll on three dashboard widgets

`AgentTasksWidget`, `ManagerLeadStatusWidget`, and `ManagerCampaignWidget` now poll their server action every 30 seconds using a `setInterval` inside a `useEffect`. No loading state is shown; data swaps in silently via `startTransition`. The interval is cancelled on unmount and re-created if the domain mode or userId dependency changes.

`AgentActivityWidget` is intentionally excluded — it already has a Supabase Realtime subscription on `lead_activities` that delivers inserts live. Polling would be redundant.

Pattern per widget: `setInterval` → `let cancelled = false` → `startTransition(async () => { fetch; if (!cancelled && data) setState })` → cleanup returns `clearInterval`. Same cancelled-flag pattern used by the existing mount-fetch `useEffect` (see 2026-05-28 post-ship fix).

Files: `src/components/dashboard/widgets/AgentTasksWidget.tsx`, `ManagerLeadStatusWidget.tsx`, `ManagerCampaignWidget.tsx`

---

## 2026-06-04 — Performance · Agent self-view redesign: smart period tabs + dual content tabs

**Period selector:** FilterDropdown removed. Replaced with flat chevron-style pill row: Today → This Week → This Month → Custom. Active button gets --theme-paper bg + --shadow-1. Custom reveals DatePicker fields inline via AnimatePresence.

**Content tabs:** "Overview" and "Today" sit above the content area. Today tab: hero Calls Today + Notes Today in large serif, call outcome donut, live pipeline cards (Won / In Discussion / Nurturing). Overview tab: always shows a today snapshot strip (calls/notes/won since midnight IST) then CoreFourGrid → EffortGrid → CallOutcomeBar for the selected period. When period = Today, tabs collapse to one view.

**Architecture:** Agent self-view is now fully client-driven via AgentPerformanceShell. No URL params, no Suspense boundary. page.tsx fetches this_month as initialData for instant first paint. Period changes dim with progress-bar via getAgentSelfMetricsAction.

**New:** today added to PerformancePeriod. getAgentSelfMetricsAction added to actions/performance.ts.

---

## 2026-06-04 — Redis cache audit: dead caches removed, version-counter invalidation

Complete overhaul of the Redis cache layer. 10 key families removed, 4 bugs fixed, list invalidation upgraded from O(N) SCAN to O(1) atomic INCR.

**Removed caches (TTL-only, no invalidation path — safer to hit DB):**

- `perf:*` — all 6 performance-service namespaces removed. Performance data is retrospective; DB queries have proper indexes; managers/founders don't refresh constantly. `redis` import + all 6 TTL constants deleted from `performance-service.ts`.
- `campaign:list/detail/distribution` — campaign analytics removed from `leads-service.ts`. Manager/admin use only; RPC queries are fast enough raw.
- `campaign:ad-creative` — removed from `ad-creatives-service.ts` and `ad-creatives.ts` action. `void redis.del` after upsert/delete was a bug pattern (CLAUDE.md §void-redis-del); simpler to drop the cache entirely.
- `task:group-list` — removed from `tasks-service.ts` (getGroupTasks) and `tasks.ts` action. Manager-only workbench, infrequent access.
- `task:subtasks` — removed from `tasks-service.ts` (getGroupSubtasks) and all action call sites. Workspace feature, low traffic.
- `task:remarks` — removed from `tasks-service.ts` (getTaskRemarks) and `addTaskRemarkAction` / `suppressTaskRemarkAction`. Low value, Realtime already refreshes the UI.

**Bug fixes in kept caches:**

- `assignLead`: was `void Promise.all([...]).catch()` — replaced with `await Promise.all` inside `try/catch`. Also added missing `leadRowSlug` del (Bug 3 from the audit plan) and two INCR calls.
- `revalidateLeadDossier` (covers `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource`, `updateLeadCity`): was three separate `void redis.del().catch()` calls — replaced with a single `await Promise.all` + `leadRowSlug` del was already present but `leadActivities` was missing; now all three keys await correctly.
- `addLeadCallNote`: added two INCR calls for `agent` and `manager` list version (call notes can auto-advance status, changing list-visible `status` field).
- `updateLeadStatus`: added two INCR calls for `agent` and `manager` list version.

**Version counter pattern for lead list cache (replaces SCAN):**

- New key: `lead:list:v:{role}:{domain}` — persists without TTL. Every lead mutation does `INCR` on the relevant role+domain combos.
- `buildLeadListKey` now requires a `version: number` argument and embeds it as `:v{N}` suffix.
- `getLeadsByRole` reads the current version with a fast `GET` before building the cache key. Old versioned keys self-expire at LEAD_LIST_TTL (30s).
- `createManualLead`: the O(N) Redis SCAN loop is completely replaced with two `INCR` calls. 6 dashboard volume period keys now deleted in the same `Promise.all` (all periods × roles).

**`redis-keys.ts` cleanup:**

- Added `REDIS_KEYS.leadListVersion(role, domain)` builder.
- `REDIS_KEYS.leadList` now takes `version: number` as 5th arg.
- Removed: `REDIS_KEYS.perf.*`, `REDIS_KEYS.campaign.*`, `REDIS_KEYS.task.subtasks`, `REDIS_KEYS.task.remarks`, `REDIS_KEYS.task.groupList`, legacy `taskSubtasks` / `taskRemarks` flat aliases.
- Removed: `leadListKeyPrefix` export (SCAN pattern retired).
- Removed TTL constants: all 6 `PERF_*_TTL`, all 4 `CAMPAIGN_*_TTL`, `TASK_GROUP_LIST_TTL`, `REDIS_TTL.TASK_SUBTASKS`, `REDIS_TTL.TASK_REMARKS`.

**Files changed:** `src/lib/constants/redis-keys.ts`, `src/lib/services/performance-service.ts`, `src/lib/services/leads-service.ts`, `src/lib/services/ad-creatives-service.ts`, `src/lib/services/tasks-service.ts`, `src/lib/actions/leads.ts`, `src/lib/actions/tasks.ts`, `src/lib/actions/ad-creatives.ts`

---

## 2026-06-04 — Dashboard shell: flat canvas gutter matches sidebar (no wash below paper)

The margin strips around the floating paper card (top, right, and especially below the card) showed `.layout-canvas` grain + Earth radial gradients + `--shadow-paper` bleed — visually different from the flat sidebar even though both use `#0d0c0a` on Earth. Root cause: the paper used `height: calc(100dvh - 24px)` + margins inside a textured flex row, leaving dead canvas below the card when the row was taller than the paper box.

- `src/app/(dashboard)/layout.tsx` — outer shell uses `layout-shell` (flat `--theme-canvas`). Right column is a full-height canvas wrapper with `padding: 12px 12px 12px 0`; paper is `flex: 1` so it fills the column with no gap underneath.
- `src/app/globals.css` — `.layout-shell` added (flat canvas only). `.layout-canvas` kept for optional atmosphere elsewhere. `html`/`body` use `var(--theme-canvas)` so theme switches stay in sync.

---

## 2026-06-04 — Performance · Manager view: selected agent preserved across period/date filter changes

`ManagerPerformanceAsync` removed `key={period}` from `ManagerPerformancePanel`. Previously, every period change forced a full remount of the panel — resetting the selected agent back to the alphabetical first and wiping the user's selection. The agent roster now stays mounted across period changes; `AgentDetailPanel.useEffect` already re-fetches when `period`/`customFrom`/`customTo` change, so no data regression.

`AgentDetailPanel` now distinguishes agent-switch (full skeleton) from period-change (graceful dim). A `metricsAgentId` ref tracks which agent the live metrics belong to. On period change for the same agent: `setMetrics(null)` is NOT called, so the existing data stays visible at 45% opacity while the refetch is in flight. A thin 2px accent progress bar (`scaleX 0→1`, 900ms) appears at the top of the panel to signal the refresh. On agent switch: full skeleton as before.

**Two invariants now enforced:**

- `ManagerPerformancePanel` must never carry `key={period}` — period state flows through props, not remount.
- `AgentDetailPanel.metricsAgentId` ref must be reset to `null` on agent switch before the fetch fires, so the agent-switch skeleton path is always taken for a new agent regardless of in-flight state.

---

## 2026-06-04 — UI: SearchBar clear (×) vertical alignment; Leads date-range clear aligned to picker row

`SearchBar` clear control: outer flex anchor centers the hit target; Framer Motion `scale` no longer fights `translateY(-50%)`. Clear icon size follows `iconSize` per size variant; `right`/`paddingRight` use `--space-3` (§5.10). `LeadsFilters` date dropdown: panel `alignItems: flex-end`; clear button is `2.25rem` square (matches `DatePicker` trigger); removed `marginTop` hack on × and arrow.

---

## 2026-06-03 — Performance · AgentDetailPanel scorecards corrected: totalLeads (all-time assigned count), totalCallsMade (SUM call_count on cohort leads), callsToday verified — Phase 9

`AgentDetailMetrics` fields renamed: `newLeadsAttended` → `totalLeads` (all-time assigned leads, no period filter), `followUpsCompleted` → `totalCallsMade` (SUM(call_count) on leads created in the period, COALESCE 0). `callsToday` filter confirmed correct — `call_outcome IS NOT NULL` was already present. Service queries updated in `getAgentDetailMetrics`; `AgentDetailPanel` stat card labels updated to "Total Leads" and "Total Calls". `tsc --noEmit` passes with zero errors.

---

## 2026-06-03 — Leads search: 350ms keystroke debounce, SearchBar component wired, useDebounce hook created

Search in `LeadsFilters` now pushes to `?search=` automatically 350ms after the user stops typing — no Apply click required. `FilterDraft` no longer contains `search`. `SearchBar` from `src/components/ui/SearchBar.tsx` replaces the inline input. `useDebounce<T>` created at `src/hooks/useDebounce.ts` — the one and only debounce utility in the codebase.

---

## 2026-06-03 — Fix: `lead_id` now logged on all `agent_assignment` notification rows

`sendLeadAssignmentNotification` gained an optional 5th parameter `leadId?: string | null`. It is threaded into the `logNotification` call inside the `finally` block, so every `agent_assignment` row in `whatsapp_notification_logs` now carries a non-null `lead_id`.

All five call sites updated:

- `src/app/api/webhooks/leads/route.ts` → `result.leadId`
- `src/lib/services/whatsapp-ingestion.ts` → `newLeadId`
- `src/lib/services/lead-ingestion.ts` → `existing.id` (duplicate re-submission path)
- `src/lib/actions/leads.ts` `assignLead` → `leadId`
- `src/lib/actions/leads.ts` `createManualLead` → `leadId`

Parameter is optional (`?: string | null`) — any future call site that omits it compiles without error and logs `null` rather than crashing.

---

## 2026-06-03 — Fix: WhatsApp notification gaps — 6 issues from ecosystem audit (migration 0067)

Six gaps in the WhatsApp notification layer closed. Migration `20260603000067_extend_whatsapp_notification_log_types.sql` widens the `whatsapp_notification_logs.type` CHECK constraint to include `'sla_breach'` and `'lead_initiation'`.

**Fix 1 — Missing `leadId` in WhatsApp-origin founder alerts** (`src/lib/services/whatsapp-ingestion.ts`)
`createLeadFromWhatsApp` returns `leadId`. It is now passed as the 5th argument to `sendFounderLeadNotification`. All founder alert log rows written from WhatsApp-origin leads will have a non-null `lead_id`.

**Fix 2 — Redundant profile fetch in `assignLead`** (`src/lib/actions/leads.ts`)
The action previously fetched the agent profile twice — once implicitly inside `sendLeadAssignmentNotification`, and again explicitly to get the agent name for `sendFounderLeadNotification`. Both fetches are now a single `Promise.all` alongside the lead fetch at the start of the action, eliminating one DB round-trip per manual assignment.

**Fix 3 — Founder not notified when no agent is available**
Both Pipeline A (`src/app/api/webhooks/leads/route.ts`) and Pipeline B (`src/lib/services/whatsapp-ingestion.ts`) previously gated ALL notifications on `assigned_to` being non-null. `sendFounderLeadNotification` now fires unconditionally after a successful ingest/creation. When no agent is available, `agentName` is passed as `'Unassigned'`.

**Fix 4 — Duplicate re-submission: assigned agent not pinged** (`src/lib/services/lead-ingestion.ts`)
When `ingestLead` detects an active duplicate by phone, it now fires `sendLeadAssignmentNotification` to the existing lead's assigned agent (if set). The agent is alerted that the same person re-submitted. `sendFounderLeadNotification` is deliberately not fired on duplicates — the founder already received the original alert.

**Fix 5 — SLA notification type misclassified in logs** (`src/lib/services/whatsapp-api.ts`)
`sendSlaAgentNotification` was logging with `type: 'agent_assignment'` and `sendSlaManagerNotification` with `type: 'founder_alert'`. Both now use `type: 'sla_breach'`. Historical rows written before this migration cannot be reclassified (no reliable discriminator in stored response bodies).

**Fix 6 — Lead initiation has no audit trail** (`src/lib/services/whatsapp-api.ts`)
`sendLeadInitiationMessage` now wraps its Gupshup call in the standard `try/catch/finally` pattern with `logNotification({ type: 'lead_initiation', ... })` in the `finally` block. The function still re-throws on failure so the action layer can surface the error to the UI — this is the documented exception to the fire-and-forget pattern.

`src/lib/services/CLAUDE.md` updated: documents `sendLeadInitiationMessage` as the re-throw exception; documents the `'Unassigned'` fallback convention for `agentName`.
`src/lib/actions/CLAUDE.md` updated: founder alert now documented as unconditional (not gated on `assigned_to`); WhatsApp-ingestion added as 4th confirmed call site.
`src/lib/types/database.ts` updated: `whatsapp_notification_logs.type` union widened to match migration 0067.

---

## 2026-06-03 — Fix: founder alert silent failures now logged; all Gupshup responses and errors written to notification log

Restructured the inner fetch try/catch in all four template send functions in
`src/lib/services/whatsapp-api.ts` (`sendLeadAssignmentNotification`,
`sendFounderLeadNotification`, `sendSlaAgentNotification`, `sendSlaManagerNotification`)
to use a `finally` block for `logNotification`.

**Previous shape (buggy):** `logNotification` was called in two separate places — once in the
catch block with a `return`/`continue`, and once after the fetch on the success path. Any
exception thrown between those two points (e.g. by `res.text()`, or a future code path) would
exit the function with zero log rows written — completely silent.

**New shape:** `gupshupStatus`, `gupshupBody`, `delivered` are declared before the try with
zero-value defaults. The try block sets them from the response; the catch block sets them from
the error. The `finally` block calls `logNotification` exactly once per send attempt, with a
`.catch(() => {})` guard so a DB insert failure cannot propagate. Every exit path now produces
a log row.

`src/lib/services/CLAUDE.md` created documenting the finally-block as the canonical pattern
for all future template send functions.

---

## 2026-06-03 — Fix: founder WhatsApp alert lead_id logging corrected

`sendFounderLeadNotification` in `src/lib/services/whatsapp-api.ts` accepted no `leadId`
parameter, so every `whatsapp_notification_logs` row of type `founder_alert` was written with
`lead_id = null`. Added `leadId?: string | null` as a 5th parameter and threaded it into both
`logNotification` calls inside the function (fetch-error path and success path). All three call
sites updated to pass the correct `leadId`:

- `src/app/api/webhooks/leads/route.ts` — passes `result.leadId` from `ingestLead`
- `src/lib/actions/leads.ts` `assignLead` — passes `leadId` (schema-parsed UUID)
- `src/lib/actions/leads.ts` `createManualLead` — passes `leadId` (inserted row UUID)

No migration needed — `lead_id` is nullable on the table (by design for edge cases); this fix
ensures it is populated whenever the lead UUID is known. `src/lib/actions/CLAUDE.md` created
with the confirmed call-site pattern for future reference.

---

## 2026-06-03 — leads.city dedicated column (migration 0066)

`city` promoted from `personal_details JSONB` to a top-level `leads.city text` column.

- Migration 0066: `ALTER TABLE leads ADD COLUMN city text`; backfills existing rows from `personal_details->>'city'`; removes the `city` key from `personal_details` JSONB on all existing rows
- `src/lib/types/database.ts` — `city: string | null` added to `leads` Row/Insert/Update and `get_active_lead_by_phone` RPC return type
- `src/lib/validations/lead-schema.ts` — `UpdateLeadCitySchema` + `UpdateLeadCityInput` added
- `src/lib/actions/leads.ts` — `updateLeadCity` action: Zod → auth → adminClient UPDATE; `updatePersonalDetails` now skips the `city` key (never writes it to JSONB)
- `src/lib/services/lead-ingestion.ts` — webhook ingestion extracts `city` from `form_data` into the dedicated column (removes it from `form_data` to avoid duplication); `createLeadFromWhatsApp` sets `city: null` explicitly
- `src/components/leads/PersonalDetailsCard.tsx` — city field removed from JSONB fields array; managed as a separate state variable calling `updateLeadCity` in parallel with `updatePersonalDetails` on save
- `src/components/leads/LeadInfoCard.tsx` — `MapPin` icon imported; city `InfoRow` added after Phone in the contact grid

---

## 2026-06-03 — fix: createLeadFromWhatsApp now writes source: 'whatsapp' alongside attribution

`src/lib/services/lead-ingestion.ts` line 296: `source` was `null` in the `createLeadFromWhatsApp` INSERT object after the attribution refactor. `attribution: { platform: 'whatsapp' }` was present but `source` (the indexed flat column) was missing, causing every WhatsApp-originated lead to have `source = null` and making `WHERE source = 'whatsapp'` analytics queries return zero rows. Fixed by setting `source: 'whatsapp'` explicitly. These are two separate fields that must always be set together — `source` is the queryable analytics column; `attribution` is the platform-specific JSONB bag. No migration needed.

---

## 2026-06-03 — Domain-scoped route authorization — sidebar filtering + layout guard via canAccessRoute

Domain-gated navigation: non-Gia domains (tech, finance, concierge, marketing, b2b) now see only the routes their domain permits. Implemented via a pure `canAccessRoute` util, a `DOMAIN_ROUTE_MAP` constant, a server-side layout guard, and Sidebar filter. Admin/founder roles bypass all domain checks. `/dashboard` and `/profile` are always accessible to every authenticated user.

- `src/lib/constants/route-permissions.ts` — `ALWAYS_ALLOWED_PREFIXES` + `DOMAIN_ROUTE_MAP`
- `src/lib/utils/route-access.ts` — `canAccessRoute(profile, pathname)`
- `src/proxy.ts` — forwards `x-pathname` header to the dashboard layout
- `src/app/(dashboard)/layout.tsx` — server-side redirect when domain denies the route
- `src/components/layout/Sidebar.tsx` — nav items filtered per domain using `canAccessRoute`
- `src/components/layout/CLAUDE.md` — created; documents the pattern

---

## 2026-06-03 — Attribution refactor: 7 flat columns → source, medium, utm_campaign + attribution JSONB (migration 0065)

7 flat ad/attribution columns consolidated. The table now holds `source` (manual/dossier-editable channel), `medium` (fb|ig|…), `utm_campaign` (unchanged — has 4 indexes and drives campaign analytics), and `attribution jsonb` (all platform-specific extras: `platform`, `campaign_id`, `ad_name`, `adset_name`). Existing rows backfilled.

**Columns removed:** `platform`, `campaign_id`, `ad_name`, `utm_content`  
**Columns renamed:** `utm_source → source`, `utm_medium → medium`  
**Column added:** `attribution jsonb`  
**Index:** `idx_leads_utm_source` dropped; `idx_leads_source` created

- `supabase/migrations/20260603000065_attribution_refactor.sql` — migration
- `src/lib/types/database.ts` — `leads` Row/Insert/Update updated; `get_active_lead_by_phone` RPC return shape updated; `Lead` derived type updated (`attribution: Record<string,unknown>|null`); `LeadPlatform` deprecated (platform now in `attribution.platform`)
- `src/lib/leads/adapters.ts` — `NormalizedLeadPayload` updated (`source`, `medium`, `attribution`, removed flat ad fields); all three adapters updated; Meta builds `attribution={platform:'meta',campaign_id,ad_name,adset_name}` from `res3`; Google/website build minimal `attribution={platform}` objects; WEBSITE_STANDARD_KEYS pruned
- `src/lib/services/lead-ingestion.ts` — `leadPayloadSchema` updated; INSERT maps `source`, `medium`, `utm_campaign`, `attribution`; `createLeadFromWhatsApp` inserts `source:'whatsapp'` + `attribution:{platform:'whatsapp'}` (see fix entry below)
- `src/lib/services/leads-service.ts` — `LeadListItem` Pick updated (`source`, `medium`; removed `platform`); explicit SELECT list in `getLeadsByRole` updated; source filter changed from `.eq("platform",…)` to `.eq("source",…)`
- `src/lib/validations/lead-schema.ts` — `UpdateLeadUtmSourceSchema` renamed to `UpdateLeadSourceSchema` (field `utm_source → source`); `CreateManualLeadSchema.utm_source` renamed to `source`
- `src/lib/actions/leads.ts` — `updateLeadUtmSource` renamed to `updateLeadSource` (schema ref + DB field updated); `createManualLead` uses `source` field; activity details type changed `lead_utm_source_updated → lead_source_updated`
- `src/lib/constants/lead-columns.ts` — `platform` column entry removed (stored localStorage id silently dropped by validator on next load)
- `src/components/leads/LeadsTable.tsx` — `source` case reads `lead.source`; `medium` case reads `lead.medium`; `platform` case removed; unused `PLATFORM_LABELS`/`resolveLeadSource` imports cleaned up
- `src/components/leads/LeadInfoCard.tsx` — `resolvedSource = lead.source`; `SourceDropdownField` calls `updateLeadSource({source})`; medium row reads `lead.medium`; Platform + Ad name attribution InfoRows added (display-only, shown when `attribution` has values); `resolveLeadSource` import removed
- `src/components/leads/LeadActivityLog.tsx` — `note_added` handler now matches both `lead_source_updated` (new) and `lead_utm_source_updated` (legacy rows); reads `d.source ?? d.utm_source`
- `src/components/leads/LeadsFilters.tsx` — no change needed; was already using `source` URL param

---

## 2026-06-03 — Dashboard: domain line colours migrated to CSS tokens; quarter period exposed

- `src/styles/design-tokens.css` — nine `--domain-*` tokens added to `:root` (mid-tone hue-wheel palette: steel blue, amber, jade, orchid, terracotta, sea glass, soft violet, warm ochre, muted sage). All legible on every `--theme-paper` surface. No per-theme overrides needed.
- `src/lib/constants/domain-colors.ts` — new file; `DOMAIN_LINE_COLORS: Record<AppDomain, string>` mapping all nine domains to `var(--domain-*)` CSS variable strings.
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — removed every hardcoded hex colour (`#F5A623`, `#4A90D9`, `#8B6FD4`, `#E05C4B`, `FALLBACK_COLORS`). Replaced with `resolvedDomainColors` state populated via `resolveColorMap(DOMAIN_LINE_COLORS)` with a MutationObserver re-resolve on theme switch. Added "Quarter" to `PERIODS` — the period tab now shows Month / Week / Today / Quarter. All service, action, and schema support was already present.
- `docs/design-dna.md` — §16.10 added documenting `--domain-*` tokens, `DOMAIN_LINE_COLORS`, and the mandatory `resolveColorMap` resolution pattern for Recharts strokes.
- `CLAUDE.md` — `domain-colors.ts` added to File Locations table.

---

## 2026-06-03 — Dashboard client: seed fix, rAF ticker, role filter in sanitizeStored, error resilience

- `src/app/(dashboard)/dashboard/page.tsx` — admin/founder now pass `p_initial_domain='onboarding'` to `getDashboardSummary`; `getLeadVolumeByPeriod` is skipped for admin/founder (`Promise.resolve(null)`); entire `Promise.all` wrapped in `try/catch` that logs `[dashboard/page]` and renders zeroed `initialData` on RPC failure (no redirect, no throw). `DashboardSummary.lead_volume` widened to `| null` in `src/lib/types/index.ts`.
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — admin/founder mount effect now checks `seed !== null && domainMode === DEFAULT_GIA_DOMAIN` and uses the seed directly, skipping `getLeadStatusForDomainAction`. Zero mount POSTs on initial paint when seed is present. Tab switches still fire the action.
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — ticker loop replaced: `setTimeout(tick, 16)` → `requestAnimationFrame(tick)`; `rafRef.current` typed as `number`; `visibilitychange` listener cancels rAF on `document.hidden = true` and restarts on visible — prevents CPU burn on inactive tabs during an 8-hour agent shift. All hover-pause, offset, and `willChange` logic unchanged.
- `src/hooks/useDashboardLayout.ts` — `sanitizeStored` now filters placements on both `isValidWidgetId(id)` AND `WIDGET_MAP[id].roles.includes(role)`. Placements failing the role check are silently dropped — an agent with manager widgets in localStorage loses them on next hydration.

---

## 2026-06-03 — LeadsFilters: draft → Apply pattern, two-row layout, layout-shift fix

`src/components/leads/LeadsFilters.tsx` rewritten. All filter controls now write into a local `FilterDraft` state; the URL is updated only when the user clicks Apply (one `router.push`). Search no longer pushes on every keystroke — the 500ms debounce is retired entirely. `isDirty` is a computed boolean (no `useState`). `committedCount` badge reflects URL state, not draft. Row 2 is `flexWrap: nowrap` so dropdown panels (absolutely positioned) never reflow the row when open. Domain change atomically clears `agent_id` and `campaign` in the same `setDraft` call. `docs/lead-page.md` invariant 7 updated; `src/components/leads/CLAUDE.md` updated with `FilterDraft` type, `draftFromParams` helper, `isDirty` computed rule, two-row layout contract, and `committedCount` vs draft distinction.

## 2026-06-03 — Dashboard refresh paths: RPCs, Redis cache-aside, and invalidation

- `supabase/migrations/20260603000064_dashboard_refresh_rpcs.sql` — two new STABLE SECURITY DEFINER RPCs: `get_lead_pipeline_refresh(p_role, p_domain)` returns `{totals, byAgent}` jsonb (identical shape to `DashboardLeadStatusSummary`); `get_campaign_pipeline_refresh(p_role, p_domain)` returns campaign mix array (identical shape to `DashboardCampaignStatusMix[]`). Both eliminate Node-side aggregation over full `leads` rows.
- `src/lib/services/dashboard-service.ts` — `getLeadStatusSummary`: replaced full-row select + Node aggregation with `.rpc('get_lead_pipeline_refresh', ...)`. `getLeadsByCampaign`: same, replaced with `.rpc('get_campaign_pipeline_refresh', ...)`. `getAgentTasksSummary`: added Redis cache-aside (`dashboard:agent-tasks:{userId}`, 30s TTL). Header comment updated with full Redis key inventory.
- `src/lib/constants/redis-keys.ts` — `REDIS_KEYS.dashboardAgentTasks(userId)` key added; `REDIS_TTL.DASHBOARD_AGENT_TASKS = 30` added.
- `src/lib/actions/leads.ts` — `updateLeadStatus`: adds `dashboard:lead-status:{domain}` and `dashboard:campaigns:{domain}` to the existing awaited `Promise.all` del before `revalidatePath`. `createManualLead`: adds new awaited `Promise.all` del for lead-status, campaigns, and four volume period keys (manager-scoped) before return.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction`, `updateTaskStatusAction`: each adds an awaited `try/catch` del of `dashboard:agent-tasks:{caller.id}` after existing cache invalidation. All dels use `caller.id` (server-verified profile), never a client-supplied value.
- `src/lib/actions/leads.ts` — `createLeadTaskAction`: adds awaited `try/catch` del of `dashboard:agent-tasks:{caller.id}`.

---

## 2026-06-03 — Lead dossier: WhatsApp conversation initiation — `sendLeadInitiationMessage` (whatsapp-api), `initiateWhatsAppConversationAction`; template `7aee2a33`; no migration; state-driven Realtime in `LeadWhatsAppCard`

## 2026-06-03 — Dashboard RPC: role-branch, p_initial_domain, get_agent_recent_activity

- `supabase/migrations/20260603000062_get_dashboard_summary_role_branch.sql` — drops 3-param overload; recreates `get_dashboard_summary(p_role, p_domain, p_user_id, p_initial_domain DEFAULT NULL)` with role-branch: `agent` role computes only `agent_tasks` + `agent_activity` CTEs and returns immediately with empty stubs for `lead_status` / `campaigns`; manager/admin/founder compute all 4 CTEs; `lead_status` + `campaigns` domain-scoping: manager → `p_domain`, admin/founder + `p_initial_domain` → that domain, admin/founder + NULL → no filter (all-org). Only one 4-param overload remains.
- `supabase/migrations/20260603000063_get_agent_recent_activity.sql` — new `get_agent_recent_activity(p_role, p_domain, p_user_id)` RPC; single `lead_activities LEFT JOIN leads` query with CASE role filter (admin/founder: all, manager: `leads.domain = p_domain`, agent: `actor_id = p_user_id`); returns jsonb array of 25; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated.
- `src/lib/services/dashboard-service.ts` — `getDashboardSummary` gains optional 4th param `initialDomain?: AppDomain`, passed as `p_initial_domain` to RPC (null when absent). `getAgentRecentActivity` rewritten to call `get_agent_recent_activity` RPC — eliminates the two-step `SELECT id FROM leads LIMIT 1000 → .in('lead_id', ids)` pattern; now a single RPC call for all three roles.
- `src/app/(dashboard)/CLAUDE.md` — new 4-param signature, role-branch behaviour, and `get_agent_recent_activity` RPC documented.

---

## 2026-06-03 — fix: activity history and notes empty on lead dossier for slug-based URLs

- `src/app/(dashboard)/leads/[id]/page.tsx` — `getLeadNotesFull` and `getLeadActivitiesFull` were called with the URL slug string (`id`) instead of `lead.id` (UUID). Both functions query by `lead_id` UUID foreign key, so passing a slug returned empty arrays and the Activity History card always showed "No activity yet." regardless of actual history. Fixed both calls to use `lead.id`.

---

## 2026-06-03 — fix: activity timeline — field-edit events and duplicate submissions now visible

- `src/components/leads/LeadActivityLog.tsx` — three bugs fixed:
  1. **Over-broad filter:** `note_added` rows with a `details.type` sub-key (field-edit events) are no longer dropped. Only bare `note_added` rows (call-paired) are filtered. `updateLeadEmail`, `updateLeadDomain`, and `updateLeadUtmSource` activities now appear in the timeline.
  2. **Missing `describeActivity` cases:** Added handlers for `lead_email_updated` ("Email updated"), `lead_domain_updated` ("Domain changed to …" via `DOMAIN_LABELS`), `lead_utm_source_updated` ("Source changed to …" via `getLeadSourceLabel`), and `duplicate_submission` ("Duplicate submission detected"). All previously returned `''` and rendered as blank or invisible entries.
  3. **Icon function:** `activityIcon` now takes the full `LeadActivityWithActor` rather than just `action_type`; `note_added` field-edit rows show a `Pencil` icon, `duplicate_submission` shows a `Copy` icon.

---

## 2026-06-03 — Lead dossier: embedded WhatsApp chat card (`LeadWhatsAppCard`) — reuses `MessageBubble`, `sendWhatsAppMessage`, Realtime pattern from `ConversationPanel`; `getConversationByLeadId` added to `whatsapp-service.ts`; `getConversationByLeadIdAction` added to `whatsapp.ts`; fetched in existing `Promise.all` on the dossier page; channel name `wa-messages-${conversationId}-${mountId}` with `useId()` StrictMode guard

## 2026-06-03 — fix: lead dossier Source field blank for webhook leads — `LeadInfoCard` now resolves display via `resolveLeadSource(utm_source, platform)` (matches `LeadsTable`); `adaptMeta` intentionally leaves `utm_source` null since channel lives on `platform`

- `src/lib/constants/lead-sources.ts` — `resolveLeadSource()` helper exported.
- `src/components/leads/LeadInfoCard.tsx` — Source row and inline editor use resolved value.
- `src/components/leads/LeadsTable.tsx` — source column uses `resolveLeadSource()` (no behaviour change).

## 2026-06-02 — remove: private scratchpad concept removed from every layer — migration 0061 drops `leads.private_scratchpad` column and `get_lead_scratchpad` function; `AgentScratchpad.tsx` deleted; `updateScratchpad` action and `UpdateScratchpadSchema` removed; `assignLead` no longer clears scratchpad on reassignment; `database.ts` types updated; `docs/lead-page.md` updated (§2a, §2c RPCs, §7e, §8 access control, invariant 22 removed and renumbered)

## 2026-06-02 — perf: leads list query — explicit column SELECT replaces select(*); form_data, personal_details, deal columns, SLA columns excluded from list path

- `src/lib/services/leads-service.ts` — `getLeadsByRole` now selects 18 explicit columns instead of `*`; dossier warming removed (partial objects must not be stored under `leadRowId`/`leadRowSlug` keys — would corrupt `getLeadById`/`getLeadBySlug` reads); `LeadListItem` and `LeadListItemWithAssignee` types exported; `LeadsResult.leads` typed as `LeadListItemWithAssignee[]`.
- `src/components/leads/LeadsTable.tsx` — prop type updated from `LeadWithAssignee[]` to `LeadListItemWithAssignee[]`.

---

## 2026-06-02 — feat: Meta attribution — utm_medium (placement) and utm_content (adset_name) now captured from adaptMeta; platform and medium columns added to leads table; utm_source no longer hardcoded in webhook adapter

- `src/lib/leads/adapters.ts` — `adaptMeta`: `utm_medium` set from `res3?.platform` (sanitized); `utm_content` set from `res3?.adset_name` (sanitized); `utm_source` removed — no longer hardcoded as `'meta'` since `platform` already identifies the source.
- `src/lib/constants/lead-sources.ts` — `PLATFORM_LABELS` map (`meta/google/website/whatsapp`), `META_MEDIUM_LABELS` map (`fb/ig/msg/an`), and `getMetaMediumLabel(medium)` helper added.
- `src/lib/constants/lead-columns.ts` — `platform` and `medium` column definitions added (both default hidden, not locked); `LeadColumnId` union extended.
- `src/components/leads/LeadsTable.tsx` — `platform` renders as accent-subtle pill via `PLATFORM_LABELS`; `medium` renders plain text via `getMetaMediumLabel()`; both show `—` when null.
- `src/components/leads/LeadInfoCard.tsx` — read-only "Medium" `InfoRow` (Signal icon) added below Source on the lead dossier card; uses `getMetaMediumLabel()`.

---

## 2026-06-02 — fix: leads — updateLeadStatus + addLeadCallNote now del leadRowSlug(slug) alongside leadRowId; slug key was the only key hit on normal dossier loads

- `src/lib/actions/leads.ts` — `updateLeadStatus` and `addLeadCallNote`: `REDIS_KEYS.leadRowSlug(slug)` added to the `Promise.all` del block when `slug` is non-null. Previous code deleted only `leadRowId(leadId)`, which is only hit on UUID-fallback loads — slug-based dossier URLs (`/leads/name-XXXX`) never read that key, so the stale row persisted for the full 120s TTL on every `router.refresh()`. `addLeadNote` confirmed correct — its RPC does not mutate the lead row, so no row key del is needed there.
- `/CLAUDE.md` — lead row dual-key invariant added to the `void redis.del` pattern note.

---

## 2026-06-02 — fix: addLeadCallNote — revalidatePath moved after await redis.del block; ordering now consistent with CLAUDE.md invariant

- `src/lib/actions/leads.ts` — `addLeadCallNote`: `revalidatePath` call moved to after the `try { await Promise.all([redis.del(…)]) } catch` block. No logic change — ordering only. `updateLeadStatus` and `addLeadNote` were already correct and not touched.

---

## 2026-06-02 — docs: CLAUDE.md — void redis.del anti-pattern codified as named invariant with correct await pattern

- `/CLAUDE.md` — new named invariant added to `## Pattern Notes`: `void redis.del().catch()` in server actions is a bug; documents the race between fire-and-forget del and `revalidatePath`; correct `try { await Promise.all(…) } catch` pattern shown with actual token names from the leads action; references `updateLeadStatus`, `addLeadCallNote`, `addLeadNote` as canonical implementations.

---

## 2026-06-02 — fix: leads — explicit redis.del on updateLeadStatus, addLeadCallNote, addLeadNote; dossier stale-data window eliminated

- `src/lib/actions/leads.ts` — `addLeadCallNote`, `updateLeadStatus`, `addLeadNote`: fire-and-forget `void Promise.all(…).catch(() => {})` replaced with `try { await Promise.all(…) } catch (e) { console.warn(…) }`. Keys deleted match the RPC's write surface: `updateLeadStatus` → row + activities; `addLeadCallNote` → row + notes + activities; `addLeadNote` → notes + activities. Dashboard keys (`dashboardLeadStatus`, `dashboardLeadVolume`, `dashboardCampaigns`) remain TTL-only — intentional.
- `src/app/(dashboard)/leads/CLAUDE.md` — Redis invalidation section added: key inventory, TTL table, per-mutation del matrix, dashboard TTL-only exception documented.

---

## 2026-06-02 — fix: ReasonModal — RadioGroup replaces FilterDropdown (overflow fix), textarea restored, 'Other' option added

- `src/lib/constants/lead-resolution-reasons.ts` — `other: 'Other'` added as the last entry in both `JUNK_REASONS` and `LOST_REASONS`; `RESOLUTION_REASON_LABELS` updated.
- `src/components/leads/StatusActionPanel.tsx` — `ReasonModal`: `FilterDropdown` removed (was clipping inside modal `overflow:hidden`); replaced with `RadioGroup variant='default'` (no portal, no overflow dependency). Textarea restored per design-dna §7.4 (min-height 80px, resize vertical, auto-grow via `scrollHeight`, `var(--leading-relaxed)` line-height, focus ring). `selectedReason === 'other'` → textarea required, confirm button disabled until `noteText.trim().length > 0`. `p_reason` composition: `other` → freetext; else → label + optional `" — note"`. `useRef` added for textarea auto-grow.
- `src/app/(dashboard)/leads/CLAUDE.md` — RadioGroup-inside-modal pattern documented; FilterDropdown-inside-modal prohibition noted.

---

## 2026-06-02 — feat: leads.resolution_reason + ReasonModal FilterDropdown + addLeadCallNote revalidatePath

- `supabase/migrations/20260602000060_leads_resolution_reason.sql` — `leads.resolution_reason TEXT` column added; partial index `idx_leads_resolution_reason` on junk/lost non-archived rows; `CREATE OR REPLACE FUNCTION update_lead_status` surgically extended: `p_reason` is now persisted to the column when non-null (junk/lost), and cleared to NULL on revive (`in_discussion`); `GRANT EXECUTE` preserved.
- `src/lib/constants/lead-resolution-reasons.ts` — `JUNK_REASONS` (5 options: wrong_number, spam_bot, duplicate, out_of_area, test_lead) and `LOST_REASONS` (5 options: chose_competitor, budget, unresponsive, wrong_service, not_ready) exported; `RESOLUTION_REASON_LABELS` combined map for activity log display.
- `src/components/leads/StatusActionPanel.tsx` — `ReasonModal` internal component: old raw `<select>` + `ChevronDown` overlay replaced with `FilterDropdown multi={false}`, matching the `CalledModal` outcome selector pattern exactly; receives `status: 'junk' | 'lost'` prop to switch between reason lists; both call sites updated with the new prop.
- `src/lib/actions/leads.ts` — `addLeadCallNote`: lead fetch now includes `slug`; `revalidatePath('/leads/${slug ?? id}')` called after successful RPC (fixes stale dossier after CalledModal submits). `updateLeadStatus`: same slug fetch + `revalidatePath` added after RPC succeeds and `result.changed` is true. Pattern follows `createLeadTaskAction`.

---

## 2026-06-02 — perf: remove seed prefetch from ManagerPerformanceAsync — GET request simplified

## 2026-06-02 — fix: AgentDetailPanel seed guard + async fetch pattern — skeleton-stuck bug resolved

## 2026-06-02 — fix: DatePicker + TimePicker — zoom-responsive panel positioning (visualViewport correction, measured flip thresholds, dynamic WheelColumn item height) — Phase UI

## 2026-06-02 — feat: agent shift days — per-agent work-day override for SLA deadline computation

- `supabase/migrations/20260602000059_agent_shift_days.sql` — `shift_days integer[] DEFAULT NULL` added to `agent_routing_config`. NULL = use global BUSINESS_HOURS. Min 1 element when set.
- `src/lib/types/database.ts` — `AgentRoutingConfig.shift_days: number[] | null` and `AgentRosterRow.shift_days: number[] | null` added.
- `src/lib/utils/sla.ts` — `AgentShiftOverride` interface + `buildAgentShiftOverride()` exported. All four exported functions (`isWithinBusinessHours`, `nextBusinessDeadline`, `businessMinutesBetween`, `advanceToNextBusinessStart`) accept optional `shift?: AgentShiftOverride` trailing parameter. Omitting the parameter is zero-breaking — falls back to BUSINESS_HOURS identically.
- `src/lib/actions/sla.ts` — `scheduleSlaTimersForLead` and `refreshActivitySlaTimers` now fetch the agent's routing config once per call, build a shift override, and pass it to `nextBusinessDeadline` for A-rules only (SLA-01A, SLA-02A, SLA-03A, SLA-04A). Manager rules (SLA-01B, SLA-02B, SLA-03B, SLA-04B) always use global BUSINESS_HOURS — deliberate asymmetry.
- `src/lib/services/agent-routing-service.ts` — `getAgentRosterByDomain` select includes `shift_days`; `setAgentShift` gains `shiftDays: number[] | null` third parameter.
- `src/lib/validations/agent-routing-schema.ts` — `SetAgentShiftSchema` extended with `shiftDays: z.array(...).min(1).nullable().optional()`.
- `src/lib/actions/agent-routing.ts` — `setAgentShiftAction` passes `shiftDays` to `setAgentShift`.
- `src/components/settings/AgentSettingsTable.tsx` — `ShiftState` gains `days: number[]`; `WorkDayPicker` inline sub-component (7 pills, Mon→Sat→Sun display order, last-day guard); `handleDaysChange` + `handleClear` updated; clear sends `shiftDays: null` to DB.
- `src/app/(dashboard)/settings/CLAUDE.md` — `WorkDayPicker` pattern, `shift_days` null contract, and updated grid columns documented.

**SLA asymmetry rule:** agent-rule deadlines (A-rules) use the agent's personal shift. Manager escalation deadlines (B-rules) always use global BUSINESS_HOURS — a manager's window is domain-wide, not personal.

---

## 2026-06-02 — design: deals — summary strip and card amounts use Geist Mono (metrics voice)

- `src/components/deals/DealsSummaryStrip.tsx` — stat values switched from Playfair to `var(--font-mono)` with `tabular-nums` per design-system §Technical voice (metrics).
- `src/components/deals/DealCard.tsx` — deal amount uses `var(--font-mono)` + `tabular-nums`; lead name stays Playfair italic.

---

## 2026-06-02 — design: auth — brand header reads "Indulge OS"; subtitle removed

- `src/app/(auth)/login/login-form.tsx`, `forgot-password/forgot-password-form.tsx`, `update-password/update-password-form.tsx`, `update-password/page.tsx` — title changed from "Eia" to "Indulge OS"; "Indulge Global" subtitle removed from all cards.
- `src/app/(auth)/forgot-password/page.tsx`, `update-password/page.tsx` — document `title` metadata updated to "Indulge OS".
- `src/app/(auth)/CLAUDE.md` — unified brand header spec updated.

---

## 2026-06-02 — design: auth — remove accent drop-shadow from logo on all auth pages

- `src/app/(auth)/login/login-form.tsx`, `forgot-password/forgot-password-form.tsx`, `update-password/update-password-form.tsx`, `update-password/page.tsx` — removed `filter: drop-shadow(...)` from `/logo.webp` brand header so the mark renders at full brightness with no glow overlay.

---

## 2026-06-02 — fix: auth — is_active check moved into loginAction; deactivated users never receive a session cookie

- `src/lib/actions/auth.ts` — after successful `signInWithPassword`, calls `getCurrentProfile()`; if `profile.is_active === false`, immediately calls `supabase.auth.signOut()` and returns `{ error: formErrors.accountDeactivated }`. Dashboard layout gate retained as defence-in-depth.
- `src/lib/validations/form-errors.ts` — `accountDeactivated` key added: "Your account has been deactivated. Please contact your administrator."
- `src/app/(auth)/CLAUDE.md` — `is_active` gate section updated to document the two-layer defence (loginAction + dashboard layout).

---

## 2026-06-02 — design: auth pages — dark card redesign, unified branding, Eye/EyeOff on all password fields, strength bar on /update-password, is_active gate on dashboard layout, session-aware root redirect

- `src/app/(auth)/layout.tsx` — removed noise texture div (SVG data URI, parse cost not worth it) and both `.eia-auth-line-1/2` divs; added `backgroundColor: var(--theme-canvas)` on root div to prevent white flash; kept both orb divs and both radial glow divs.
- `src/app/globals.css` — removed `.eia-auth-line-1` and `.eia-auth-line-2` CSS definitions; added `.eia-auth-card` (dark card shell: `--theme-sidebar-hover-bg` bg, `--theme-sidebar-border` border, `--radius-xl`, `--shadow-3`), `.eia-input-auth` (canvas-surface input for dark card forms; focus ring via `--theme-accent` border + `--theme-accent-surface` glow), `.eia-auth-link` (accent link at 65% opacity at rest, full accent on hover).
- `src/app/(auth)/login/login-form.tsx` — full rebuild: `.eia-auth-card` card, unified brand header (LiaGlyph 32px breathing + "Eia" Playfair text-3xl + "Indulge Internal" label), `.eia-input-auth` on both fields, Eye/EyeOff on password field, dark-surface danger banner (`--color-danger-dark-*` tokens), `.eia-auth-link` on forgot link, `maxWidth: 26rem`; removed `/logo.webp` and `Image` import entirely.
- `src/app/(auth)/forgot-password/forgot-password-form.tsx` — same card + input + header treatment; dark danger banner; success state text in `--theme-sidebar-text`; all links use `.eia-auth-link`.
- `src/app/(auth)/update-password/update-password-form.tsx` — same card + input + header treatment; Eye/EyeOff shared across both password fields (one `showNew` state); new-password field is controlled so `PasswordStrengthBar` can read it; strength bar placed below new-password field; dark danger banner.
- `src/app/(auth)/update-password/page.tsx` — `InvalidLinkCard` converted to `.eia-auth-card` dark treatment; back-to-sign-in link uses `.eia-auth-link`; `maxWidth: 26rem`.
- `src/components/ui/PasswordStrengthBar.tsx` — new reusable UI primitive; extracted from `PasswordChangeForm`; props: `password: string`; 4-segment bar with danger/warning/info/success colours; returns null when empty.
- `src/components/profile/PasswordChangeForm.tsx` — inline strength bar logic replaced with `<PasswordStrengthBar password={next} />`.
- `src/app/page.tsx` — converted to async server component; calls `createClient()` → `getUser()`; authenticated users redirect to `/dashboard`, unauthenticated to `/login`.
- `src/app/(dashboard)/layout.tsx` — added `if (!profile.is_active) redirect('/login')` after profile fetch; closes gap where deactivated user with valid cookie could access dashboard.
- `src/app/(auth)/CLAUDE.md` — created: dark card pattern, new CSS classes, unified brand header spec, error banner dark tokens, Eye/EyeOff rule, `is_active` gate rationale, `PasswordStrengthBar` reference.
- `CLAUDE.md` — `PasswordStrengthBar` noted under auth-specific primitives.

---

## 2026-06-02 — perf: tasks — updateTaskStatusAction and deleteTaskAction invalidate personalPage1 / giaList / groupSubtasks cache on write

- `src/lib/actions/tasks.ts` — `updateTaskStatusAction`: added `task_category` to the SELECT already fetched for `canMutateTask`; replaced single-branch `group_subtask` del with three-branch fire-and-forget invalidation: `personal` → `task:personal:page1:{callerId}`, `gia_followup` → `task:gia:{callerId}:{role}:{domain}`, `group_subtask` → `task:subtasks:{groupId}:{callerId}`.
- `src/lib/actions/tasks.ts` — `deleteTaskAction`: added `task_category` to the SELECT already fetched for the auth check; replaced single-branch `group_subtask` del with the same three-branch pattern, applied after the DB DELETE succeeds (Trigger.dev cancel still runs before the delete per invariant 15).
- Pre-mortem accepted: Gia list del uses `caller.id` / `caller.role` / `caller.domain`, not `task.assigned_to`. When a manager deletes an agent's Gia task, the manager's cache slot is cleared (correct — manager may have the Gia tab open); the agent's slot expires at 60s TTL. No additional DB fetch required.

---

## 2026-06-02 — perf: tasks — Redis cache-aside on tab-load functions + missing invalidations wired

- `src/lib/constants/redis-keys.ts` — `REDIS_KEYS.task` namespace added with five key builders: `subtasks`, `remarks`, `giaList`, `groupList`, `personalPage1`; flat legacy aliases retained for existing callers. TTL constants `TASK_GIA_TTL = 60`, `TASK_GROUP_LIST_TTL = 120`, `TASK_PERSONAL_PAGE1_TTL = 30` added.
- `src/lib/services/tasks-service.ts` — Redis cache-aside added to three critical-path tab-load functions: `getGiaTasksForUser` (60s, key includes userId+role+domain), `getGroupTasks` unfiltered (120s, key is domain+role — shared slot per role×domain pair; filtered calls bypass cache), `getPersonalTasks` page-1 only (30s, key is userId; pages 2+ bypass cache entirely — cursor params must all be null AND no active filters).
- `src/lib/services/tasks-service.ts` — `getGroupTasks` signature extended with optional `cacheHint?: { domain: string; role: string }` second param — used for key construction only, never passed to the RPC.
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — `getGroupTasks({}, { domain: callerDomain, role: callerRole })` — forwards caller identity as cache hint.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction` now dels `task:personal:page1:{assignedTo}` after insert; `createGroupTaskAction` now dels `task:group-list:{domain}:{role}` after insert.
- Pre-existing invalidations (confirmed already present): `createSubtaskAction` dels `taskSubtasks`; `addTaskRemarkAction` dels `taskRemarks`; `suppressTaskRemarkAction` dels `taskRemarks`.
- `src/app/(dashboard)/tasks/CLAUDE.md` — Redis cache section added: key table, TTL values, page-1-only rule for personal tasks, full invalidation table.
- `src/lib/CLAUDE.md` — `tasks-service.ts` services registry row updated to reflect all 5 cached functions.

---

## 2026-06-02 — ux: leads — row prefetch on hover + optimistic status updates in StatusActionPanel

- `src/components/leads/LeadsTable.tsx` — `onMouseEnter` on each table row calls `router.prefetch('/leads/${slug ?? id}')` using the existing `useRouter` instance; no new hook call per row.
- `src/components/leads/StatusActionPanel.tsx` — `useOptimistic(lead.status)` added; `fireStatusUpdate` sets `optimisticStatus` before the action and `throw new Error(result.error)` on failure to trigger automatic revert (actions return `{ data, error }` and never throw natively — the explicit throw is what signals `useOptimistic` to revert); `fireDeal` same pattern with `'won'`; all JSX render references to `lead.status` replaced with `optimisticStatus`; "Called" button `onClick` checks `lead.status === 'new'` (server truth) and fires its own `startTransition(() => setOptimisticStatus('touched'))` before opening the modal — parent owns the decision, `CalledModal` is unaware.
- `src/components/leads/CalledModal.tsx` — `initialStatus` and `onAutoAdvance` props removed; modal is now stateless with respect to the auto-advance.
- `src/app/(dashboard)/leads/CLAUDE.md` — prefetch-on-hover pattern and optimistic status pattern (including throw-on-error revert contract) documented.

---

## 2026-06-02 — fix: Gupshup lead-assignment WhatsApp template ID

- `src/lib/constants/whatsapp.ts` — `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` → `193e330d-e7ee-48e0-9cd4-f3808b50fc80`. Template params unchanged: `{{1}}` lead name, `{{2}}` lead phone (or `'not provided'`).
- `docs/whatsapp-page.md` — template table updated to match.

---

## 2026-06-01 — perf: campaigns — Redis cache-aside on getCampaignMetrics (120s, pre-search), getCampaignDetailMetrics (120s), getCampaignAgentDistribution (120s), getAdCreativesForCampaign (300s), getAdCreativesForCampaigns per-key strategy (300s); ad-creative Redis del on upsert/delete. 2026-06-01. Phase performance.

- `src/lib/constants/redis-keys.ts` — `REDIS_KEYS.campaign` namespace (list, detail, distribution, ad-creative key builders) + `CAMPAIGN_*_TTL` constants (120s / 300s).
- `src/lib/services/leads-service.ts` — cache-aside on `getCampaignMetrics` (RPC result before search; key uses `effectiveDomain ?? 'all'`), `getCampaignDetailMetrics` (null cached via `{ payload }` wrapper), `getCampaignAgentDistribution`.
- `src/lib/services/ad-creatives-service.ts` — cache-aside on `getAdCreativesForCampaign`; `getAdCreativesForCampaigns` per-key `Promise.all` get + single batched `.in()` on misses.
- `src/lib/actions/ad-creatives.ts` — `redis.del(campaign:ad-creative:…)` after successful upsert/delete.
- `src/app/(dashboard)/campaigns/CLAUDE.md` — Redis section documenting TTLs, search-post-cache pattern, invalidation.

---

## 2026-06-01 — perf: performance page — eliminate 6x duplicate action calls, parallelize queries, Redis cache-aside

- `src/components/performance/AgentDetailPanel.tsx` — added `lastFetchKeyRef` (`useRef<string>('')`) dedup guard: duplicate fires for same params return early; server-seeded `initialData` skips the mount round-trip entirely (mirrors dashboard perf-01 pattern).
- `src/lib/services/performance-service.ts` — parallelised 11 sequential Supabase queries across 3 functions via `Promise.all`: `_getCoreFourMetricsForRange` (4 queries), `getEffortMetrics` (4 queries), `getTeamBenchmarks` (3 queries after agentIds resolves). Removed unused `responseData` query from `getAgentDetailMetrics` (was fetched but `void`-ed — 1 PgBouncer slot freed per call).
- `src/lib/services/performance-service.ts` — Redis cache-aside added to 6 service functions: `_getCoreFourMetricsForRange` (60s), `getEffortMetrics` (30s), `getCallOutcomeBreakdown` (60s), `getTeamBenchmarks` (120s), `getAgentRosterPerformance` (120s), `getAgentDetailMetrics` (30s). Key namespace `perf:`. Cache miss falls through to DB; Redis failure never blocks. `domain` intentionally excluded from `perf:agent-detail` key (auth-only, does not filter query result).
- `src/lib/constants/redis-keys.ts` — added `REDIS_KEYS.perf` namespace (6 key builder functions) + 6 TTL constants (`PERF_CORE_FOUR_TTL`, `PERF_EFFORT_TTL`, `PERF_OUTCOME_TTL`, `PERF_BENCHMARKS_TTL`, `PERF_ROSTER_TTL`, `PERF_AGENT_DETAIL_TTL`).

---

## 2026-06-01 — lead dossier Gia Tasks: show due time on task rows

- `src/lib/utils/dates.ts` — `formatTaskDueAt()` (`h:mm a, d MMM`, IST) shared by lead dossier and `/tasks` Gia tab.
- `src/components/leads/LeadTasksCard.tsx` — due stamp uses `formatTaskDueAt` (was date-only `dd MMM`).
- `src/components/tasks/GiaTaskRow.tsx` — imports shared formatter; overdue text uses `--color-danger-text`.

---

## 2026-06-01 — fix: Recharts width(-1)/height(-1) console warnings on /performance

- `src/components/performance/CallOutcomeBar.tsx` — donut `ResponsiveContainer` now uses explicit `180×180` pixel dimensions instead of `width/height="100%"` (Recharts 3 defaults `initialDimension` to -1 before ResizeObserver measures the parent).
- `src/components/performance/CoreFourGrid.tsx` — sparkline wrapper gets `minWidth: 0` + positive `initialDimension` so flex KPI cards measure correctly on first paint.

---

## 2026-06-01 — perf: leads Redis key isolation + createManualLead list invalidation + CLAUDE.md registry update. 2026-06-01. Phase performance.

---

## 2026-06-01 — perf: leads Redis cache-aside (list 30s, row/notes/activities 120s, filter-options 300s) + pageSize 50→30 + dossier warm from list load. 2026-06-01. Phase performance.

---

## 2026-06-01 — perf: Redis cache-aside layer — tasks (subtasks 30s, remarks 30s) + dashboard (lead-status 60s, volume 120s, campaigns 120s). Key schema in src/lib/constants/redis-keys.ts. Phase performance.

---

## 2026-06-01 — perf: hoist agents+tags to SSR in TasksAsync, cache() on getGroupSubtasks+getTaskRemarks — eliminates ~2.2s of redundant client action calls per /tasks session. Phase performance.

---

## 2026-06-01 — Fix: WhatsApp-originated leads not sending assignment notifications

- `src/lib/services/whatsapp-ingestion.ts` — `processInboundMessage` was discarding the `assignedTo` return value from `createLeadFromWhatsApp`, so agents and founders never received a WhatsApp notification when a new lead entered via an inbound WhatsApp message. Fixed by destructuring `{ leadId, assignedTo }` and firing `sendLeadAssignmentNotification` (to agent) and `sendFounderLeadNotification` (to all founders) after re-fetching the full lead row. Both calls are fire-and-forget with `.catch()` — a notification failure never blocks message processing.

---

## 2026-06-01 — WA notification wiring audit (phase WA)

- `src/lib/services/whatsapp-api.ts` — full notification wiring audit: null guards verified, param order verified against §7 template table, `logNotification` now called on both success and fetch-throw paths (network error previously went unlogged), no full phone numbers in logs, all fire-and-forget calls have `.catch()` with `[whatsapp-api]` prefix, no notification awaited in hot path; SLA breach path verified (agent fires before manager per rule split, no-agent edge case exits cleanly); `src/lib/CLAUDE.md` updated with verified call site inventory.
- `src/lib/services/whatsapp-api.ts` — `isGupshupDelivered(httpOk, body)` helper added: Gupshup returns HTTP 200 with `{"status":"error","message":"..."}` on template ID mismatches and inactive numbers; `delivered` now derived from body parse (`status === 'error'` → false) rather than `res.ok` alone; non-JSON bodies fall through to trust `httpOk`; all four send functions updated; error log lines now include raw body fragment for observability. Confirmed `responseBody` is `await res.text()` at all four call sites — `JSON.parse` receives a string, not a pre-parsed object.

---

## 2026-06-01 — Design system reference manual

- `docs/design-system.md` — full design system reference manual generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Deals module intelligence document

- `docs/deals-page.md` — full deals module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Auth, session & profile intelligence document

- `docs/auth-pages.md` — auth, session, and profile module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Ad creatives module intelligence document

- `docs/ad-creatives-page.md` — full ad creatives module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — User management module intelligence document

- `docs/user-management-page.md` — full user management module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Settings module intelligence document

- `docs/settings-page.md` — full settings module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Campaigns module intelligence document

- `docs/campaigns-page.md` — full campaigns module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Performance module intelligence document

- `docs/performance-page.md` — full performance module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — WhatsApp module intelligence document

- `docs/whatsapp-page.md` — full WhatsApp module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Tasks module intelligence document

- `docs/tasks-page.md` — full tasks module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Dashboard module intelligence document

- `docs/dashboard-page.md` — full dashboard module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Leads module intelligence document

- `docs/lead-page.md` — full leads module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Sidebar: Ad Creatives under Configuration

- `src/components/layout/Sidebar.tsx` — Ad Creatives moved from Admin to Configuration (above Settings); still visible only to admin/founder.

---

## 2026-06-01 — Ad Creatives admin page layout (design contract)

- `src/app/(dashboard)/admin/ad-creatives/page.tsx` — removed `maxWidth: 960px`; full-width `flex-1 p-8` shell matches Team/Campaigns list pages.
- `src/components/admin/AdCreativesManager.tsx` — canonical three-row layout (header + filter strip + card list); `MotionButton` primary CTA; `SearchBar` filter with active-count badge and result count; card hover (`translateY(-1px)` + `--shadow-2`); Playfair empty states (V-09); Edit/Delete actions match `UsersTable` bordered buttons; ad name shown as primary title when set.
- `src/components/admin/AdCreativeFormModal.tsx` — field labels use `label-micro` (V-10); campaign dropdown shows `beautifyCampaignTitle()`.

---

## 2026-06-01 — Lead source on `utm_source` (not `form_data` / `platform`)

- `src/lib/constants/lead-sources.ts` — canonical list: meta, google, website, whatsapp, referral, ypo, events; `LEAD_SOURCE_OPTIONS`, `getLeadSourceLabel()`.
- Manual lead create (`createManualLead`, `AddLeadModal`) — source written to `leads.utm_source`; no `form_data.manual_source`.
- `src/lib/actions/leads.ts` — `updateLeadPlatform` replaced by `updateLeadUtmSource`.
- `src/components/leads/LeadInfoCard.tsx` — dossier field renamed **Source**; edits `utm_source` via inline select.
- `src/lib/validations/lead-schema.ts` — `CreateManualLeadSchema.utm_source`, `UpdateLeadUtmSourceSchema`.

---

## 2026-06-01 — Remove ComboboxDropdown; LeadInfoCard uses FilterDropdown

- Deleted `src/components/ui/ComboboxDropdown.tsx` — searchable combobox was a duplicate of `FilterDropdown`.
- `src/components/leads/LeadInfoCard.tsx` — domain, platform, assignee: `InfoRow`-matched trigger + simple themed option menu on click (not `FilterDropdown`).

---

## 2026-06-01 — Lead dossier: per-field inline edit on LeadInfoCard

- `src/components/leads/LeadInfoCard.tsx` — removed card-wide click-to-edit mode. Name and phone stay read-only. Email (inline input), domain, source (`utm_source`), and assignee each save on their own. Added **Last modified** (`lead.updated_at`). Assignee-style hover affordance on all editable fields.
- `src/lib/actions/leads.ts` — `updateLeadInfo` replaced by `updateLeadEmail`, `updateLeadDomain` (manager+), `updateLeadUtmSource`; shared `assertLeadFieldEditAccess` + dossier `revalidatePath`.
- `src/lib/validations/lead-schema.ts` — per-field Zod schemas for the three update actions.
- `src/app/(dashboard)/leads/[id]/page.tsx` — `canEditLeadFields` (includes in-domain managers) and `canEditDomain` props.

---

## 2026-06-01 — Task due notifications fire at due time (not 30 min early)

- `src/trigger/task-reminders.ts` — `scheduleTaskReminder` delays the Trigger.dev job until `dueAt` exactly; notification copy updated to "Task due now". Past due dates remain a no-op.
- `src/components/leads/CalledModal.tsx` — helper/validation aligned: future due time required; no 30-minute lead window.

---

## 2026-06-01 — CalledModal: due date required for Log Update + Task

- `src/components/leads/CalledModal.tsx` — **Log Update + Task** requires due date &amp; time; helper copy explains in-app notification at due time. Task create errors surface instead of being swallowed after the call note is saved.

---

## 2026-06-01 — Lead dossier: Gia tasks list updates without manual refresh

- `src/lib/actions/leads.ts` — `createLeadTaskAction` calls `revalidatePath` on the lead dossier URL (slug or id) so `router.refresh()` serves fresh tasks.
- `src/components/leads/LeadTasksCard.tsx` — syncs `initialTasks` when the async child refetches; `handleTaskCreated` dedupes by id and calls `router.refresh()` after optimistic prepend.

---

## 2026-06-01 — CalledModal cleanup + Gia task types narrowed to Call / WhatsApp / Other

- `src/components/leads/CalledModal.tsx` — phone icon moved into modal title ("Log a call"); removed helper/subtitle copy; removed "Next step" section header; footer Cancel removed (header × closes); follow-up fields kept for Log Update + Task.
- `src/components/ui/Dialog.tsx`, `src/components/ui/modal.tsx` — `title` prop accepts `React.ReactNode` (enables icon + label headers).
- `src/lib/constants/task-types.ts` — `TASK_TYPES` is now `call`, `whatsapp_message`, `other`; labels shortened to Call / WhatsApp / Other; `email` and `general_follow_up` removed from UI surfaces.
- `src/lib/types/database.ts` — `TaskType` union updated to match.
- `src/lib/validations/lead-schema.ts` — `CreateLeadTaskSchema.taskType` enum aligned.
- `src/components/tasks/GiaTaskRow.tsx` — icon map updated (`other` → `MoreHorizontal`).
- `src/lib/actions/tasks.ts`, `src/lib/actions/sla.ts`, `src/components/tasks/CreatePersonalTaskModal.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx` — default/synthetic `task_type` set to `other`.
- `supabase/migrations/20260531000057_task_type_other.sql` — backfills `email` and `general_follow_up` rows to `other`; `update_lead_status` nurturing auto-task uses `other`.

---

## 2026-06-01 — Performance page redesign: 4-in-a-row KPI row, sparkline charts, donut outcome breakdown

- `src/components/performance/CoreFourGrid.tsx` — **completely rebuilt**. 4 KPI cards now render in a single flex row (not a 2×2 grid). Each card: accent-icon chip top-right, Playfair serif number, mini `AreaChart` sparkline (Recharts) filling the remaining width, TrendingUp/Down delta with directional context (higher/lower is better per metric), benchmark line in a bottom border strip. Sparkline colours: accent / info / warning / success per metric. `useChartTokens()` resolves series colours so sparklines are fully theme-reactive.
- `src/components/performance/EffortGrid.tsx` — **rebuilt**. 4 compact cards in a flex row. Each has: icon chip with semantic colour (success/accent/info/warning), value in `--text-2xl`, animated horizontal fill bar (calls logged and notes written normalised against each other), description micro-text. Framer Motion fill bar animates from 0% on mount.
- `src/components/performance/CallOutcomeBar.tsx` — **rebuilt**. Replaces the flat segmented bar with a two-zone layout: left legend (coloured pill rows, count + %, total footer) + right `PieChart` donut (Recharts) with a centre label showing top outcome %. Donut cell colours resolved via `resolveVar()` for Recharts SVG fill compatibility.
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — adds `SectionLabel` dividers ("Key Performance Indicators", "Effort & Pipeline", "Call Outcomes") between each tier; layout is now `flex-col gap-5` with a label+content block per section.
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — **rebuilt** to mirror the new layout: 4 KPI skeletons with sparkline placeholder, 4 compact skeletons with fill bar, 1 wide donut+legend skeleton.
- `src/app/(dashboard)/performance/page.tsx` — agent view `maxWidth` widened from `960px` → `1280px` to give the 4-card KPI row adequate breathing room.

---

## 2026-06-01 — Multiple ad videos per campaign + carousel (Phase 8)

A campaign can now have many ad videos. All three video surfaces (campaign preview modal, campaign detail card, lead dossier modal) show a looping carousel with prev/next arrows + a counter, newest first.

- **Migration 0058:** drops the UNIQUE constraint on `ad_creatives.campaign_key` (one row per video now). Normalisation CHECK + lookup index preserved. **USER must run the SQL** (linked remote — `ALTER TABLE public.ad_creatives DROP CONSTRAINT IF EXISTS ad_creatives_campaign_key_key;`).
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign` (singular, `.single()`) **renamed** → `getAdCreativesForCampaign` returns `AdCreative[]` (newest first). `getAdCreativesForCampaigns` batch now returns `Map<campaignKey, AdCreative[]>`.
- `src/components/campaigns/AdCreativeCarousel.tsx` — new reusable looping carousel: one `AdCreativePlayer` at a time, prev/next arrows (wrap), dot indicators + "n / total", optional per-video ad_name/notes (`showMeta`). `key={current.id}` forces clean remount per video so each autoplays. Single video → no arrows.
- `src/components/campaigns/CampaignPreviewModal.tsx` — prop `adCreative` → `adCreatives: AdCreative[]`; left column renders the carousel; duplicate ad_name/notes blocks removed (carousel owns them).
- `src/components/campaigns/CampaignAdCard.tsx` — prop `adCreative` → `adCreatives`; single-column carousel (max 320px), "N ads" count in header; `null` when empty.
- `src/components/campaigns/CampaignCard.tsx` + `CampaignListAsync.tsx` — pass `adCreatives` array from the `Map<key, AdCreative[]>`.
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — `getAdCreativesForCampaign` (array) → `<CampaignAdCard adCreatives={…} />`.
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativesForCampaign` (array) → `LeadInfoCard adCreatives`.
- `src/components/leads/LeadInfoCard.tsx` — `adCreative` → `adCreatives: AdCreative[]`; `AttributionStrip` campaign trigger fires when `length > 0`; ad-name row matches `adCreatives.some(c => c.ad_name === lead.ad_name)`.
- `src/components/leads/CampaignVideoModal.tsx` — `adCreative` → `adCreatives`; renders `AdCreativeCarousel`; subtitle shows count when > 1.
- Admin UI unchanged — each upload already creates a new row, so adding N videos to one campaign now simply yields N rows (no UNIQUE collision).

---

## 2026-06-01 — Ad creatives admin: upload + manage UI (Phase 8)

Admin/founder can now upload campaign videos and manage `ad_creatives` rows from a dedicated page — previously the table was read-only with no write path.

- **Manual step (once):** create a public Supabase Storage bucket `ad-creatives` (authenticated write). Mirrors the `avatars` bucket setup. Not in a migration (buckets are created in the dashboard, same as avatars).
- `src/lib/validations/ad-creative-schema.ts` — `upsertAdCreativeSchema` (id optional → create vs update; campaign_key, video_url required+url, thumbnail_url/ad_name/notes optional) + `deleteAdCreativeSchema`; human-readable error codes.
- `src/lib/services/ad-creatives-service.ts` — `getAllAdCreatives()` added (newest-first list for the admin view; returns [] on error).
- `src/lib/actions/ad-creatives.ts` — `upsertAdCreative` (Zod → admin/founder guard → normalise campaign_key lowercase+trim → sanitizeText on ad_name/notes → adminClient INSERT or UPDATE; 23505 → friendly "already exists") + `deleteAdCreative` (admin/founder guard); both `revalidatePath('/admin/ad-creatives')` + `revalidatePath('/campaigns')`.
- `src/components/admin/AdCreativeFormModal.tsx` — `'use client'` modal composing `ui/modal.tsx`; video upload to `ad-creatives` bucket via browser client (mirrors `ProfileAvatarSection`), then `getPublicUrl` → `upsertAdCreative`; campaign dropdown (locked on edit); 100 MB / video-mime guard; live `<video>` preview.
- `src/components/admin/AdCreativesManager.tsx` — `'use client'` list with thumbnail + beautified title + edit/delete; optimistic local state (no refetch on save/delete); `window.confirm` before delete; Framer Motion staggered card entrance.
- `src/app/(dashboard)/admin/ad-creatives/page.tsx` — server orchestrator; admin/founder gate; parallel `getAllAdCreatives` + `getCampaignMetrics` (campaign names → dropdown, normalised + deduped).
- `src/components/layout/Sidebar.tsx` — "Ad Creatives" link (Film icon) added to `ADMIN_NAV` (gated to admin/founder via existing `isPrivileged`).

---

## 2026-06-01 — Campaign ad creative: preview modal on list page + inline card on detail page (Phase 8)

- `src/lib/utils/campaigns.ts` — `beautifyCampaignTitle(raw)` extracted; both consumers import from here; zero inline split/join occurrences remain.
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativesForCampaigns(campaignNames[])` batch function; single `WHERE campaign_key = ANY(...)` query; returns `Map<campaignKey, AdCreative>`; never called in a loop.
- `src/components/campaigns/AdCreativePlayer.tsx` — reusable `'use client'` video primitive; `useEffect` cleanup calls `video.pause(); video.src = ''` to prevent audio bleed on navigation; `aspect-ratio: 9/16`, `max-height: 480px`, `object-fit: contain`.
- `src/components/campaigns/CampaignPreviewModal.tsx` — `'use client'` modal composing `ui/modal.tsx`; two-column layout when creative present (40% video / 60% info); single-column when absent; 2×3 metric grid; "Open Campaign →" navigates then closes; beautifyCampaignTitle for display.
- `src/components/campaigns/CampaignCard.tsx` — `adCreative?: AdCreative | null` prop; `previewOpen` state; `onClick` → modal (not direct router.push); modal rendered at JSX tail.
- `src/components/campaigns/CampaignListAsync.tsx` — calls `getAdCreativesForCampaigns` once after `getCampaignMetrics`; passes per-card creative from map; zero N+1.
- `src/components/campaigns/CampaignAdCard.tsx` — `'use client'`; composes `SectionCard`; `AdCreativePlayer` left (40%) + notes column right; Framer Motion entrance `opacity 0→1, y 8→0, 350ms ease-out-expo`; returns `null` when `adCreative` is null.
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — `getAdCreativeForCampaign` awaited (parallel with no other blocking call); `beautifyCampaignTitle` imported from util; `<CampaignAdCard>` rendered between header and metrics strip.

---

## 2026-05-31 — Hotfix: get_gia_tasks 42703 when leads.slug missing

- `supabase/migrations/20260531000055_get_gia_tasks.sql` — `ALTER TABLE leads ADD COLUMN IF NOT EXISTS slug text` guard before the RPC (depends on migration 0045 for generator/trigger; column must exist for the SELECT).
- `supabase/migrations/20260531000056_get_gia_tasks_slug_prereq.sql` — repairs databases where 0055 ran before 0045: adds `slug` + partial unique index, backfills when `generate_lead_slug` exists, recreates `get_gia_tasks`.
- `supabase/migrations/20260530000045_lead_slug.sql` — idempotent `ADD COLUMN` / index; bulk backfill removed (was failing with `23505` on duplicate slugs) — backfill stays in 0046 collision-safe loop.
- `src/lib/services/tasks-service.ts` — logs `error.message` on `getGiaTasksForUser` failure (empty `{}` in console was hiding the Postgres detail).

---

## 2026-05-31 — Tasks page: Gia Tasks tab for GIA_DOMAINS agents + CreateGiaTaskModal (Phase 11)

Agents and managers in `GIA_DOMAINS` (`onboarding`, `house`, `shop`, `legacy`) now see a **Gia Tasks** tab as the first tab on `/tasks`. Non-Gia callers are unaffected.

- `supabase/migrations/20260531000055_get_gia_tasks.sql` — `get_gia_tasks(p_user_id, p_role, p_domain app_domain)` RPC; agent role scopes to `assigned_to = p_user_id`; manager+ scopes to `leads.domain = p_domain`; returns task columns + joined lead identity; `p_domain` typed `app_domain` (prevents `42883` post-migration-0041); STABLE SECURITY DEFINER.
- `src/lib/services/tasks-service.ts` — `getGiaTasksForUser(userId, role, domain)` wraps RPC via server client; exports `GiaTask` type (Task + lead identity fields).
- `src/lib/services/leads-service.ts` — `searchLeadsForTask(query, role, domain, userId)` added; ILIKE on first_name/last_name/phone; scoped by role; returns max 8 `LeadSearchResult`.
- `src/lib/validations/lead-schema.ts` — `SearchLeadsSchema` + `SearchLeadsInput` added.
- `src/lib/actions/leads.ts` — `searchLeadsAction` added: Zod → `getCurrentProfile()` → `searchLeadsForTask` scoped by caller; returns `{ data, error }`.
- `src/app/(dashboard)/tasks/page.tsx` — `TaskTab` type exported; `GIA_DOMAINS`-aware `validTabs` computed server-side; `?tab=gia` for non-Gia callers falls back to `validTabs[0]`; `AddTaskButton` receives `validTabs` prop.
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — `gia` branch calls `getGiaTasksForUser`; `GiaTask[]` passed to `TasksShell`.
- `src/app/(dashboard)/tasks/TasksShell.tsx` — `giaTasks` + `giaCreateOpen` state; renders `GiaTasksTab` + `CreateGiaTaskModal` (with `AnimatePresence`) on `tab=gia`; task count shown in filter bar for Gia tab.
- `src/app/(dashboard)/tasks/TasksSkeleton.tsx` — `'gia'` added to `tab` prop union; `GiaTabSkeleton` with three date-grouped block skeletons.
- `src/components/tasks/AddTaskButton.tsx` — `validTabs: TaskTab[]` prop added; label map: `gia → 'Gia Task'`, `personal → 'My Task'`, `group → 'Group Task'`.
- `src/components/tasks/GiaDaySection.tsx` — date-group heading; label-micro style; 1px paper-border bottom rule.
- `src/components/tasks/GiaTaskRow.tsx` — completion circle + task-type icon (`var(--theme-accent)`) + lead name link (`/leads/[slug ?? id]`) + type label + due time; overdue in `var(--color-danger)`; completed at 0.5 opacity + strikethrough.
- `src/components/tasks/GiaTasksTab.tsx` — groups tasks by date bucket (local-clock keys, same pattern as `MyTasksCalendarView`); Framer Motion staggered section entrance; Playfair italic empty state; `TaskCompletionCircle` + `useTaskCompletionToggle` reused.
- `src/components/tasks/CreateGiaTaskModal.tsx` — composes `modal.tsx`; lead search (300ms debounce → `searchLeadsAction`); task type radio list; priority chips; `DatePicker showTime`; notes textarea; reuses `createLeadTaskAction` — no new action.
- `src/components/tasks/CLAUDE.md` — created with full component inventory for all tasks components.
- `src/app/(dashboard)/tasks/CLAUDE.md` — Gia tab architecture, domain-aware tab validation, RPC contract, `searchLeadsAction` scope rules documented.
- `docs/task-blueprint.md` — §1 routes/layout table updated; §15 new "Gia tab on /tasks" subsection; display surfaces table updated with `getGiaTasksForUser`.
- `supabase/migrations/CLAUDE.md` — migration 0055 entry added.

---

## 2026-05-31 — Lead dossier: Follow-up Tasks card moved above Team Notes

- `src/app/(dashboard)/leads/[id]/page.tsx` — `LeadTasksAsync` moved from page footer into the right column, above `LeadNotesInput`; bottom-of-page tasks block removed.
- `src/components/leads/LeadTasksCard.tsx` — compact body: `bodyPadding={false}`, scrollable list capped at `min(220px, 28vh)` so Team Notes and scratchpad keep their flex share.
- `src/components/leads/LeadTasksCardSkeleton.tsx` — padding and max-height aligned with the card.

---

## 2026-05-31 — Lead dossier task card — full task list + manual task creation (Phase 11)

Lead dossier now shows all Gia follow-up tasks (was: next task only) and allows manual task creation from the dossier.

- `supabase/migrations/20260531000054_create_lead_gia_task.sql` — `create_lead_gia_task` RPC: two-INSERT transaction (tasks + task_gia_meta) prevents orphaned rows; SECURITY DEFINER; GRANT to authenticated.
- `src/lib/services/tasks-service.ts` — `getAllLeadTasks(leadId)` added; starts from `tasks` (not `task_gia_meta`) with `!inner` join; active-first sort (JS secondary sort).
- `src/lib/validations/lead-schema.ts` — `CreateLeadTaskSchema` + `CreateLeadTaskInput` added.
- `src/lib/actions/leads.ts` — `createLeadTaskAction`: Zod → auth → lead access check → `create_lead_gia_task` RPC via adminClient → fire-and-forget `scheduleTaskReminder`; title derived from `TASK_TYPE_LABELS` (never hardcoded).
- `src/components/leads/CreateLeadTaskModal.tsx` — task type radio list, priority chips, `DatePicker showTime`, optional description textarea; calls `createLeadTaskAction`.
- `src/components/leads/LeadTasksCard.tsx` — client component; `SectionCard` shell; `TaskCompletionCircle` + `useTaskCompletionToggle`; prepends new task locally on create; overdue dates in `var(--color-danger)`; Playfair italic empty state.
- `src/components/leads/LeadTasksAsync.tsx` — async server component; only place calling `getAllLeadTasks`.
- `src/components/leads/LeadTasksCardSkeleton.tsx` — two-row skeleton (80%/60% widths).
- `src/app/(dashboard)/leads/[id]/page.tsx` — `LeadDossierTasksAsync` replaced with `<Suspense fallback={<LeadTasksCardSkeleton />}><LeadTasksAsync /></Suspense>`.

---

## 2026-05-31 — Notification sound

Synthesised C6/E6 chime via Web Audio API. No audio files. Fires on Realtime INSERT only (not on initial seed). 1500ms debounce gate. Autoplay-safe — silently skips when AudioContext is suspended. localStorage preference (`eia:notifications:sound:v1`, default on). Settings toggle added to profile Notification Preferences section.

---

## 2026-05-31 — Notification system redesign

Bell dot spring entrance (once on arrival, never loops), panel 400ms ease-out-expo entrance / 250ms exit, `--shadow-4` + `--theme-paper` surface, unread/read visual distinction (paper-subtle + shadow-1 vs transparent), item stagger at mount only (Realtime items skip stagger), GPU-only animations throughout.

---

## 2026-05-31 — Gia · Deals page

**Feature.** Deals page (`/deals`) — won leads with a non-null `deal_amount`, visible for all roles. Includes role-scoped list, summary strip, server-side filters, and pagination.

- `supabase/migrations/20260531000052_get_deals_summary.sql` — `get_deals_summary` RPC (SECURITY DEFINER STABLE): aggregate `total_deals`, `total_revenue`, `membership_count`, `retail_count`; same role/filter constraints as the list query.
- `src/lib/types/database.ts` — `DealFilters` type added (no `status` field — structural constraint).
- `src/lib/services/deals-service.ts` — `getDealsByRole` (role-scoped, pagination, single query + count), `getDealsSummary` (RPC wrapper); `DealWithAssignee`, `DealsResult`, `DealsSummary` types.
- `src/components/deals/DealsFilters.tsx` — search (500ms debounce), deal-type single-select, domain (admin/founder), agent (manager+), date range (applied to `status_changed_at`); `buildFilterParams` + `resetKeys: ['page']`.
- `src/components/deals/DealCard.tsx` — `motion.div` card; left (Playfair name + phone + domain badge), centre (deal-type + duration chips), right (Playfair accent amount + won date + agent). Links to `/leads/[slug ?? id]`.
- `src/components/deals/DealsSummaryStrip.tsx` — four stat cells (Total Deals, Total Revenue, Memberships, Retail); Playfair accent values; reuses `formatCount` + `formatCurrency`.
- `src/app/(dashboard)/deals/DealsAsync.tsx` — async server component; `Promise.all` for list + summary; renders `DealsSummaryStrip` + `DealCard` list + `LeadsPagination`.
- `src/app/(dashboard)/deals/DealsSkeleton.tsx` — 4 stat chip skeletons + 5 card row skeletons; stagger 0/80/160/240/320ms.
- `src/app/(dashboard)/deals/page.tsx` — thin orchestrator; calls `getLeadFilterOptions` once for agent dropdown; `parseFilters` enforces no `status` param; manager domain locked at service layer.
- `src/app/(dashboard)/deals/CLAUDE.md` — three invariants, `DealFilters` no-status rule, RPC param contract.
- `src/components/layout/Sidebar.tsx` — Deals nav item (`Trophy`, `/deals`) added to `MAIN_NAV` below Leads; visible for all roles.

**Phase:** Post-Lead-Hardening (Gia Deals).

---

## 2026-05-31 — Docs · task-blueprint aligned to current Tasks UI

**Docs.** `docs/task-blueprint.md` updated to match shipped Tasks: Leads-style page header + `AddTaskButton` / `TasksCreateProvider`; filter strip with **My Tasks / Group Tasks** accent tabs and `TasksFilters` (client-side via `task-client-filters.ts`); **MyTasksCalendarView** as the personal tab (calendar + date sections); `TaskCompletionCircle` / `useTaskCompletionToggle`; remark RPC auth (migration 00051); `SubTaskModal` parent callbacks. `PersonalTasksTab` documented as legacy/unmounted.

**Changed files:** `docs/task-blueprint.md`

---

## 2026-05-31 — Tasks · subtask modal syncs group list without refresh

**Tasks.** Status/priority/title changes in `SubTaskModal` only updated modal-local state — the expanded group card on `/tasks` and the workspace list/board stayed stale until a full page refresh. `onTaskUpdated` / `onTaskDeleted` callbacks now propagate successful writes to `GroupTasksTab` (subtask rows + `completed_count` / `subtask_count` on the group header) and `GroupTaskWorkspace` (list/board + refetch on close).

**Changed files:** `src/components/tasks/SubTaskModal.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`

---

## 2026-05-31 — Tasks · personal task creation shows correct assignee

**Tasks.** `createPersonalTaskAction` already defaulted `assigned_to` to the creator on insert, but optimistic list rows used empty `assigned_to` / `created_by` placeholders and `SubTaskModal` on My Tasks never received an `assignee` prop — new tasks looked unassigned and the completion circle could be disabled until refresh. Action now returns `assignedTo` + `createdBy`; create/quick-add synthetic tasks use those values; `resolvePersonalTaskAssignee` feeds the modal from `task.assigned_to`.

**Changed files:** `src/lib/actions/tasks.ts`, `src/lib/utils/task-client-filters.ts`, `src/components/tasks/CreatePersonalTaskModal.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`

---

## 2026-05-31 — Tasks · task remark posting fixed (RPC auth)

**Tasks.** Progress messages in `SubTaskModal` failed because `add_task_remark_with_status` ran via service role while the RPC gated on `auth.uid()` (always NULL). Migration `20260531000051`: RPC trusts the action layer; **view = post** — `addTaskRemarkAction` only posts if the user-scoped client can `SELECT` the task (tasks RLS). Agents now see tasks they created or are assigned to (`tasks_agent_select` adds `created_by`). `task_remarks` SELECT/INSERT mirror the same rule.

**Changed files:** `supabase/migrations/20260531000051_task_remark_rpc_auth_fix.sql` (new), `src/lib/actions/tasks.ts`, `src/lib/CLAUDE.md`

---

## 2026-05-31 — Tasks · SubTaskModal action item composer always visible

**Tasks.** Action Items no longer require entering edit mode to add rows. `ActionItemAddRow` sits at the bottom of the checklist with a dashed checkbox, focus wash, and accent **Add** chip on Enter or button press. Outside edit mode, new items persist immediately via `updateChecklistAction`; in edit mode they still batch with Save. Composer hidden when `canToggleTaskComplete` is false.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — Tasks · subtask row hover (circle only)

**Tasks.** Subtask row hover highlights only `TaskCompletionCircle` with a single `--theme-accent` border (removed Avatar-style double ring `box-shadow`). Group Tasks expanded rows no longer fade in or restyle the Open eye pill on row hover. Group task card header row hover highlights only `IconBox` — the Open workspace pill stays static (no border/background/color shift).

**Changed files:** `src/components/tasks/TaskCompletionCircle.tsx`, `src/components/tasks/GroupTasksTab.tsx`

---

## 2026-05-31 — Performance · default agent matches sidebar list order

**Performance.** The open agent on load was `roster[0]` from `getAgentRosterPerformance` (top performer by `leadsWon`). The sidebar lists agents A–Z (by domain on founder/admin). `getFirstAgentInPerformanceRosterList` + `buildPerformanceRosterGroups` in `performance-roster-display.ts` now drive `initialAgentId`, filter resets, and single-domain roster sort so the default selection is always the first row shown.

**Changed files:** `src/lib/utils/performance-roster-display.ts` (new), `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx`, `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — components/CLAUDE.md · side-edge accent strip rule documented

**Docs.** `src/components/CLAUDE.md` now has an explicit **Side-edge accent strips — forbidden** section. Rule: never use a coloured border on a single edge (`borderLeft`, `borderTop`, `borderRight`, `borderBottom`) as a category or status indicator. Use `PriorityBadge`, status pills (`TASK_STATUS`), semantic dots, icons, or count pills instead. Structural `1px --theme-paper-border` dividers between zones are fine — the ban is on semantic colour on one edge only. Reference implementation: `GroupTaskWorkspace` board column headers and list rows.

**Changed files:** `src/components/CLAUDE.md`

---

## 2026-05-31 — Tasks · tab selector left + accent variant

**Tasks.** Filter strip: `TabSelector` moved from right to left (before filters). New `TabSelector` `accent` variant — active tab uses `--theme-accent` fill + `--theme-accent-fg` label (replaces muted pill wash on the paper filter bar). `indicatorLayoutId="tasks-page-tabs"`.

**Changed files:** `src/app/(dashboard)/tasks/TasksShell.tsx`, `src/components/ui/TabSelector.tsx`, `src/app/(dashboard)/tasks/CLAUDE.md`

---

## 2026-05-31 — Group task workspace · no side-edge accent borders

**Tasks.** `GroupTaskWorkspace` list rows and board cards no longer use `borderLeft` priority strips; board column headers no longer use `borderTop` status accents. Priority uses `PriorityBadge` (list) or dot (board); column headers use a 6px status dot. Never-Do rule added (CLAUDE.md, `.cursorrules`, `The_Rules.md`, `components/CLAUDE.md`): no single-edge coloured borders as category/status indicators — use pills, dots, icons, or badges.

**Changed files:** `src/components/tasks/GroupTaskWorkspace.tsx`, `CLAUDE.md`, `.cursorrules`, `docs/The_Rules.md`, `src/components/CLAUDE.md`

---

## 2026-05-31 — My Tasks · calendar + date-grouped layout

**Tasks.** Personal tasks tab replaced with a two-panel calendar view. Left panel: sticky `Calendar` component (reused from `ui/Calendar.tsx`) with task-dot indicators per day; summary strip (due today / overdue / upcoming counts); quick-add trigger. Right panel: tasks grouped by date — TODAY (empty state: Playfair italic "Hooray.") → future dates ascending → OVERDUE → NO DATE. Clicking a calendar date scrolls to the matching section. Sticky section headers with colored dot + count pill. Priority left border (urgent → danger, high → warning, normal → paper-border). All existing behaviour preserved: completion toggle, SubTaskModal, quick-add row, CreatePersonalTaskModal, cursor pagination, filter support.

`TasksSkeleton` personal variant updated to match the new two-column layout.

**Changed files:** `src/components/tasks/MyTasksCalendarView.tsx` (new), `src/app/(dashboard)/tasks/TasksShell.tsx`, `src/app/(dashboard)/tasks/TasksSkeleton.tsx`

---

## 2026-05-31 — My Tasks calendar · day hover uses accent ring

**Tasks.** Calendar day cells (shared `ui/Calendar`) no longer use `paper-subtle` fill on hover; unselected days show the accent ring. Selected days keep accent fill. My Tasks date-section rows drop row background hover — completion circle ring only.

**Changed files:** `src/components/ui/Calendar.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`

---

## 2026-05-31 — Performance · agent roster hover uses avatar ring only

**Performance.** Manager agent roster rows no longer use `paper-subtle` background or border on hover; hover mirrors selection via accent avatar ring, semibold name, and accent lead count (selected state unchanged).

**Changed files:** `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — Leads table · row hover highlights status pill

**Leads.** Table rows no longer use `paper-subtle` background on hover; the lead status pill gets the accent ring (same pattern as avatar / task completion circle). Toolbar summary pills unchanged.

**Changed files:** `src/components/leads/LeadsTable.tsx`

---

## 2026-05-31 — Tasks · row hover uses accent ring (no row fill)

**Tasks.** Group task headers highlight the icon box ring on hover (no row background). Subtasks and personal task rows highlight `TaskCompletionCircle` on hover — same accent ring as WhatsApp/avatar `selected`, no `paper-subtle` row fill. Applied in Group Tasks tab, workspace list, personal list, and calendar view.

**Changed files:** `src/components/tasks/TaskCompletionCircle.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`

---

## 2026-05-31 — WhatsApp · conversation list period filter

**WhatsApp.** Filter icon on the Conversations card header opens a period menu (Today, This Week, This Month, Custom + All). Filters server-side on `last_message_at` (IST presets via `whatsapp-period` utils); URL params `period`, `from`, `to`; list refetches on change; search respects the same range.

**Changed files:** `src/lib/constants/whatsapp-period.ts`, `src/lib/utils/whatsapp-period.ts`, `src/lib/services/whatsapp-service.ts`, `src/lib/actions/whatsapp.ts`, `src/lib/validations/whatsapp-schema.ts`, `src/components/whatsapp/WhatsAppConversationPeriodFilter.tsx`, `src/components/whatsapp/ConversationList.tsx`, `src/components/whatsapp/WhatsAppShell.tsx`, `src/app/(dashboard)/whatsapp/page.tsx`

---

## 2026-05-31 — WhatsApp · search in its own rail card

**WhatsApp.** Conversation search sits in a dedicated bordered card (`shadow-1`, padded bar only — no section header) above the conversations list; loading skeleton updated.

**Changed files:** `src/components/whatsapp/ConversationList.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`

---

## 2026-05-31 — WhatsApp · conversation row hover uses avatar ring only

**WhatsApp.** Conversation list rows no longer show paper-subtle background or border on hover; hover mirrors selection via accent avatar ring, semibold name, and accent trailing time.

**Changed files:** `src/components/whatsapp/ConversationRow.tsx`

---

## 2026-05-31 — WhatsApp · conversation list matches Performance agent roster

**WhatsApp.** Left-rail participant list uses the same card + row pattern as the Performance manager agent roster: bordered `shadow-1` panel with uppercase section label, `motion.button` rows (avatar ring when selected, staggered entrance), single-line name + mono trailing (relative time or “Resolved”). Loading skeleton aligned to the new layout.

**Changed files:** `src/components/whatsapp/ConversationList.tsx`, `src/components/whatsapp/ConversationRow.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`

---

## 2026-05-31 — WhatsApp · active conversation avatar ring

**WhatsApp.** Selected conversation row no longer uses accent background fill or left border; active state matches Performance agent roster — accent ring on the avatar via `Avatar selected`.

**Changed files:** `src/components/whatsapp/ConversationRow.tsx`

---

## 2026-05-31 — Tasks · completion circle (personal + group subtasks)

**Tasks.** Radio-style completion circle on personal task rows and group subtask rows (Group Tasks tab + workspace). Click toggles `completed` ↔ `to_do` via `updateTaskStatusAction` with optimistic UI; shared `TaskCompletionCircle`, `useTaskCompletionToggle`, and `canToggleTaskComplete` auth helper.

**Changed files:** `src/components/tasks/TaskCompletionCircle.tsx`, `src/hooks/useTaskCompletionToggle.ts`, `src/lib/utils/task-complete-auth.ts`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`

---

## 2026-05-31 — SubTaskModal · two-zone grid layout (brief left, activity right)

## 2026-05-31 — Tasks · status & priority pill layout

**Tasks.** Group subtask rows: title left, aligned meta cluster (status + priority pills + assignee + due) on the right; pills share height and padding. SubTaskModal header: matching pill triggers with `TaskStatusIcon` on status.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — Group tasks · inline subtask assignee + picker centering

**Tasks.** Inline “Add subtask” on Group Tasks tab defaults assignee to the creator (save works without opening the picker); `AssigneePickerModal` centered via flex shell so Framer Motion no longer clips the dialog.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/AssigneePickerModal.tsx`

---

## 2026-05-31 — Group tasks · priority-tinted expanded subtasks

**Tasks.** Removed per-subtask priority background fills on expanded Group Tasks rows — clean list on `--theme-paper-subtle` with hover to paper only.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`

---

## 2026-05-31 — TaskRemarksPanel · minimal composer

**Tasks.** Activity composer: placeholder “Write a progress.” (Playfair italic); textarea vertically aligned with 32px send control via matched line-height and padding.

**Changed files:** `src/components/tasks/TaskRemarksPanel.tsx`, `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — SubTaskModal · Action Items on personal tasks

**Tasks.** Action Items checklist (attachments) now shown in `SubTaskModal` for personal tasks as well as group subtasks — toggle in view mode, edit/reorder in edit mode.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — SubTaskModal · two-zone grid layout (brief left, activity right)

**Tasks.** SubTaskModal restructured as a 2×2 CSS grid: row 1 aligns Zone A (title, description, status, priority) with Zone B (edit/delete/close icons); row 2 pairs Zone A scroll body with `TaskRemarksPanel` so messages start level with details — no full-width header rule. `TaskRemarksPanel` gains `embedded` prop for softer message cards and composer padding in zone B. Group-task breadcrumb pill removed from the Zone A header.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`, `src/components/tasks/TaskRemarksPanel.tsx`

---

## 2026-05-31 — SubTaskModal · semantic header icon colours

**Tasks.** SubTaskModal header actions (edit, delete, close) each use design-token semantic colours at rest: `--theme-accent` gold for edit (not accent-muted), danger light/text for delete, tertiary on paper-subtle for close.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — WhatsApp · split layout (title left, messages full height)

**WhatsApp.** and the conversation list stay in the left rail with standard `p-8` top/left inset + `mb-6` under the title. The right message pane starts at the **top of the screen** (not below the title). `ConversationPanel` contact header uses `padding: var(--space-8)` top/sides so avatar and name have the same breathing room as other primary pages.

**Changed files:** `src/app/(dashboard)/whatsapp/page.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`, `src/components/whatsapp/WhatsAppShell.tsx`, `src/components/whatsapp/ConversationPanel.tsx`, `src/components/whatsapp/ConversationList.tsx`, `src/components/whatsapp/ConversationRow.tsx`

---

## 2026-05-31 — WhatsApp · seamless left-panel search

Removed the hard rules around the conversation search so it sits flush under the title: no 1px divider before the list, and `SearchBar` `variant="soft"` (transparent border at rest, accent ring on focus only).

**Changed files:** `src/components/whatsapp/ConversationList.tsx`, `src/components/ui/SearchBar.tsx`

---

## 2026-05-31 — TimePicker · premium scroll wheel (shared across app)

Rebuilt `TimePicker.tsx` as the single source of truth for time selection.

**Wheel UX:** iOS-style dead-scroll columns for hours (1–12) and minutes (00–59, every minute — no 5/15-min steps). Centre selection band with top/bottom fade masks; items scale and fade by distance from centre; snap + smooth settle on scroll end.

**Exports:** `TimePicker` (standalone trigger + popover), `TimePickerWheelPanel` (`variant="embedded"` for DatePicker side panel, `standalone` for popover body).

**Consistency:** `DatePicker` `showTime` now composes `TimePickerWheelPanel` — duplicate scroll/toggle code removed from `DatePicker.tsx`. Agent settings `TimePicker` callers pick up the new wheel automatically.

**Changed files:** `src/components/ui/TimePicker.tsx`, `src/components/ui/DatePicker.tsx`

---

## 2026-05-31 — DatePicker · portal + viewport flip inside modals

Fixed: opening the due-date picker in **New Task** (and other modals) required scrolling the modal body to see the full calendar — the popover was `position: absolute` inside the dialog's `overflow: auto` body.

**New behaviour:** popover renders via `createPortal` to `document.body` with `position: fixed`, viewport-aware flip (up/down + left/right), and `--z-modal-nested` so it stacks above modal chrome. When `showTime` is set, calendar and time picker sit **side-by-side** (date left, time right) so panel height matches date-only mode (~320px) instead of stacking ~480px tall.

**Changed files:** `src/components/ui/DatePicker.tsx`

---

## 2026-05-31 — Tasks · Group task row redesign + SubTaskModal status/priority in Zone A

**Group task row (`GroupTasksTab.tsx`):** Replaced identity-block header with flat card design — `rounded-2xl` paper card with `--shadow-1` border; collapsed header row with `ChevronRight` (rotates 90° when expanded), 32×32 accent-tinted `IconBox`, Playfair 15px title, gold "Workspace" pill, member avatars (max 4), 128px progress bar with % label, "X/Y done" count, and `DueDateChip`; subtask rows with status badge, title, 24×24 initials circle, priority badge, due chip, and eye button revealed on hover. All hex violations fixed: `SUBTASK_STATUS_PASTEL` replaced with CSS token pairings; `color-mix()` used for alpha accent tints.

**`task-constants.ts` fixes:** `TASK_PRIORITY.high.color` corrected from phantom `--theme-warning` → `var(--color-warning)`. `TASK_STATUS` pill pairings fixed for `in_review`, `completed`, `error` — switched from saturated fills (dark-on-dark) to `-light` bg + `-text` pairing.

**SubTaskModal — status/priority moved to Zone A:** Status and priority controls removed from modal header. Both now appear in the Key Variables section (section 4) of Zone A as interactive inline selectors — icon + label left, interactive pill right; dropdowns open **upward** (`bottom: calc(100% + var(--space-1))`) to avoid clipping.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`, `src/lib/constants/task-constants.ts`, `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — Live Lead Activity widget · role-scoped visibility

Fixed: admin/founder saw "No activity yet" on the dashboard Live Lead Activity widget because the underlying query filtered by `actor_id = userId` (their own account — they never log calls themselves).

**New behaviour:** admin/founder see all `lead_activities` (cross-domain); manager sees activities on leads in their domain; agent sees only their own activity (unchanged).

**Changed files:**

- `supabase/migrations/20260531000050_dashboard_activity_role_scoped.sql` — rewrites the `agent_activity` CTE in `get_dashboard_summary` with a role-aware `CASE` filter
- `src/lib/services/dashboard-service.ts` — `getAgentRecentActivity` now accepts `role` + `domain` params for the widget refresh-button path
- `src/lib/actions/dashboard.ts` — `getAgentRecentActivityAction` passes verified `profile.role` + `profile.domain`
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Realtime subscription removes `actor_id` filter for admin/founder so live updates arrive for all activity

---

## 2026-05-31 — Sidebar · Performance under Analytics

Moved Performance from main nav into the Analytics section (above Campaigns). Agents see Analytics with Performance only; manager/admin/founder see Performance + Campaigns.

**Changed files:** `src/components/layout/Sidebar.tsx`

---

## 2026-05-31 — Tasks filter bar · tab-aware client-side filters

Added standard paper filter strip below My Tasks / Group Tasks tabs. Create button moved to page header (Leads pattern) via `AddTaskButton` + `TasksCreateProvider`. `TasksFilters` swaps controls by tab: **My Tasks** — search, tags, status, priority; **Group Tasks** — search, status, priority, domain (admin/founder), progress (in progress / complete / no subtasks). All filtering is client-side via `lib/utils/task-client-filters.ts` — no extra server fetches; tag list still loads once when personal tab is active. Personal tag pill row removed from `PersonalTasksTab` (moved to filter bar).

**Changed files:** `src/components/tasks/TasksFilters.tsx` (new), `src/lib/utils/task-client-filters.ts` (new), `src/app/(dashboard)/tasks/TasksShell.tsx`, `PersonalTasksTab.tsx`, `GroupTasksTab.tsx`, `src/app/(dashboard)/tasks/CLAUDE.md`

---

## 2026-05-31 — Settings filter bar · search, domain, pool

Replaced domain pill tabs with standard paper filter strip: `SlidersHorizontal` + active-count badge, `SearchBar` (name/title), `FilterDropdown` domain (admin/founder, domains present in roster), pool status select (all / in pool / out of pool), agent count. Client-side filtering via `useMemo`. Empty state copy matches Team page pattern.

**Changed files:** `src/components/settings/AgentSettingsTable.tsx`, `src/app/(dashboard)/settings/CLAUDE.md`

---

## 2026-05-31 — Admin Team filter bar · sliders icon

Team page filter strip gains `SlidersHorizontal` + accent active-filter badge (search, role, domain), matching leads filter chrome.

**Changed files:** `src/components/admin/UsersTable.tsx`

---

## 2026-05-31 — Campaigns filter bar · domain selector + DRY with leads

Campaigns filter row aligned with leads: `FilterDropdown` domain (admin/founder, `GIA_DOMAIN_FILTER_ITEMS`), `SearchBar` (500ms debounce, URL `search`, filters `campaign_name` in service), `DatePicker` date range, sliders icon + active-count badge, clear filters. Shared URL helpers extracted to `lib/utils/filter-params.ts` (`buildFilterParams`, `dateFromUrlParam`, `dateToUrlParam`); `LeadsFilters` refactored to consume them. `parseGiaDomainParam()` used in `campaigns/page.tsx`.

**Changed files:** `src/lib/utils/filter-params.ts` (new), `src/components/campaigns/CampaignFilters.tsx`, `src/components/leads/LeadsFilters.tsx`, `src/lib/types/database.ts`, `src/lib/services/leads-service.ts`, `src/app/(dashboard)/campaigns/page.tsx`, `src/app/(dashboard)/campaigns/CLAUDE.md`

---

## 2026-05-31 — Performance filter bar · aligned with leads/campaigns (DRY)

Replaced `PerformancePeriodSelector` + `PerformanceClearButton` with unified `PerformanceFilters`: sliders icon, active-count badge, `SearchBar` (manager/founder/admin, 500ms debounce, URL `search`), period `FilterDropdown`, custom date pickers, clear filters. Uses `buildFilterParams` from `lib/utils/filter-params.ts`. Agent roster filters by name client-side in `ManagerPerformancePanel`. Filter strip uses same paper/border classes as leads and campaigns. Agent self-view omits search.

**Changed files:** `src/components/performance/PerformanceFilters.tsx` (new), deleted `PerformancePeriodSelector.tsx`, `ManagerPerformancePanel.tsx`, `src/app/(dashboard)/performance/page.tsx`, `src/app/(dashboard)/performance/CLAUDE.md`

---

## 2026-05-31 — Performance roster · remove selected agent left accent bar

Selected agent card no longer renders the 3px left accent stripe or accent surface fill; selection shown via semibold name, accent lead count, and avatar ring only. Fixed sticky hover fill when switching agents — hover uses React state (`showHover = hovered && !isSelected`) instead of imperative `style` mutation that skipped clear on mouse leave while selected.

**Changed files:** `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — Performance page · domain filter removed from filter bar

Founder/admin filter bar no longer shows `FounderDomainTabs` / `?domain=` URL state. Period + custom dates only. Cross-domain roster unchanged (`allDomains={true}`); domain narrowing stays on the agent list via `ManagerPerformancePanel` popover (sliders icon). `FounderDomainTabs.tsx` deleted. `getDomainsWithLeads` no longer called from `page.tsx` for tab population.

**Changed files:** `src/app/(dashboard)/performance/page.tsx`, `FounderPerformanceShell.tsx`, `src/components/performance/PerformancePeriodSelector.tsx`, `src/app/(dashboard)/performance/CLAUDE.md` (deleted `FounderDomainTabs.tsx`)

---

## 2026-05-31 — Leads table · toolbar status pills use lead-status tokens

Table header status summary pills no longer use retired generic variants (`neutral` / `accent` / `success` / `danger`). Each non-zero status on the current page renders a pill with `LEAD_STATUS_BADGE` → `.status-pill--lead-*` and design-token `--status-*` colours. Per-status counts replace the old aggregated Active/Lost groupings.

**Changed files:** `src/components/leads/LeadsTable.tsx`

---

## 2026-05-31 — Leads page · domain filter (admin/founder)

Domain filter added to the leads filter bar as a `FilterDropdown` (same pattern as Source/Campaign). URL param `domain`; validated via `parseGiaDomainParam()`. Items from `GIA_DOMAIN_FILTER_ITEMS`. Server: `getLeadsByRole` applies `.eq('domain', …)` for admin/founder when set; managers unchanged. `getLeadFilterOptions` scopes campaign + agent lists when a domain is selected. Changing domain clears `agent_id` and `campaign`.

**Changed files:** `src/lib/constants/domains.ts`, `src/lib/types/database.ts`, `src/lib/services/leads-service.ts`, `src/components/leads/LeadsFilters.tsx`, `src/components/leads/LeadsTableAsync.tsx`, `src/app/(dashboard)/leads/page.tsx`, `src/app/(dashboard)/leads/CLAUDE.md`

---

## 2026-05-31 — Gia domain registry (`GIA_DOMAINS`) + canonical labels

Split platform domains from Gia module domains. `APP_DOMAINS` remains the full enum for user management (profiles, admin create/edit). `GIA_DOMAINS` is the four active sales domains: `onboarding`, `house`, `shop`, `legacy`. Canonical display names via `DOMAIN_LABELS` only — **Onboarding**, **Indulge House**, **Indulge Shop**, **Indulge Legacy** (`legacy` label updated from "Legacy"). Removed all local `FEATURED_DOMAINS` / `DOMAIN_SHORT` maps from dashboard widgets and campaigns filter. Gia pickers (leads, campaigns, performance, dashboard widgets, group task domain select) now import `GIA_DOMAINS` only. Rule **Q-17** added to `docs/The_Rules.md`.

**Changed files:** `src/lib/constants/domains.ts`, `docs/The_Rules.md`, `src/lib/validations/lead-schema.ts`, `src/lib/validations/profile-schema.ts`, `src/lib/actions/dashboard.ts`, `src/components/dashboard/widgets/ManagerLead*.tsx`, `ManagerCampaignWidget.tsx`, `src/components/campaigns/CampaignFilters.tsx`, `src/components/leads/AddLeadModal.tsx`, `src/components/performance/FounderDomainTabs.tsx`, `ManagerPerformancePanel.tsx`, `src/app/(dashboard)/performance/page.tsx`, `src/components/tasks/CreateGroupTaskModal.tsx`, `AssigneePickerModal.tsx`, `src/lib/CLAUDE.md`, `src/components/CLAUDE.md`

---

## 2026-05-31 — Performance page · Filter bar clear button

Added a "Clear" button at the far right of the performance filter bar. Visible only when any filter deviates from the default state (period ≠ `this_month`, or domain set, or custom from/to dates present). Clicking it navigates to `/performance` with no params, resetting all filters to defaults. Animates in/out with `scale + opacity`. Hover state goes danger-coloured to signal destructive intent. Present across all three role views (agent, manager, founder/admin).

**Changed files:** `src/components/performance/PerformancePeriodSelector.tsx` (added `PerformanceClearButton` export), `src/app/(dashboard)/performance/page.tsx`

---

## 2026-05-31 — Performance page · Filter bar — period and domain as dropdowns

Period selector and domain selector in the performance filter bar replaced from `TabSelector` pill tabs to `FilterDropdown` dropdowns, consistent with the leads page filter row.

- `PerformancePeriodSelector` — now renders a `FilterDropdown` with `Calendar` icon and single-select behaviour. Custom date pickers still appear inline when "Custom" is selected.
- `FounderDomainTabs` — renamed conceptually; now renders a `FilterDropdown` with `Building2` icon and single-select behaviour. Domain ordering preserved.
- Separator `<span>` between the two removed from `page.tsx` (not needed between two compact dropdowns).
- Both components preserve all existing URL-param write behaviour unchanged.

**Changed files:** `src/components/performance/PerformancePeriodSelector.tsx`, `src/components/performance/FounderDomainTabs.tsx`, `src/app/(dashboard)/performance/page.tsx`

---

## 2026-05-31 — Performance page · Roster panel redesign

Roster left panel overhauled for clarity and domain awareness.

- **Header**: "Team / Conv." labels replaced with "Agents" + a `SlidersHorizontal` filter icon (shown only in founder/admin all-domains mode). Filter icon highlights when a domain filter is active.
- **Domain filter popover**: clicking the filter icon opens an inline popover listing all domains that have agents. Selecting a domain filters the list client-side (no refetch). "All domains" resets the filter. Active selection gets a `Check` icon and accent colour.
- **Grouping**: in all-domains mode (founder/admin) agents are grouped by domain in canonical order (onboarding → shop → house → legacy → …). A subtle section label appears between groups. When filtered to one domain, the section label is suppressed.
- **Sorting**: within each domain group, agents are sorted A-Z by full name. The previous performance-rank sort is removed.
- **Card**: rank number removed. Conversion rate removed. Right side now shows only the total leads count (mono, accent-coloured when selected) based on the selected time period.
- **Stagger cap**: entrance animation stagger capped at 280ms so large rosters don't feel slow.
- **Scroll**: roster list scrollable (`maxHeight: 600px`) so it doesn't push the page when there are many agents.

**Changed file:** `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — Performance page · Founder/admin all-domains agent roster

For founder and admin roles, the left agent roster now shows all agents across every domain (onboarding, shop, house, legacy, concierge, etc.) rather than only agents from the currently-selected domain tab. Each agent card displays a domain badge so origin is still visible at a glance. The right detail panel fetches metrics globally for the selected agent (no domain restriction). Manager view is unchanged — still scoped to their own domain.

**Changed files:**

- `src/lib/types/index.ts` — `AgentRosterRow` gains `domain: AppDomain` field
- `src/lib/services/performance-service.ts` — `getAgentRosterPerformance` accepts `AppDomain | null`; null = all domains. `getAgentDetailMetrics` domain param made optional (`AppDomain | null`)
- `src/lib/actions/performance.ts` — `getAgentDetailMetricsAction` accepts `domain: AppDomain | null`; manager guard still enforces own-domain
- `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx` — new `allDomains?: boolean` prop; passes null domain to roster/detail when true
- `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` — passes `allDomains={true}` to `ManagerPerformanceAsync`
- `src/components/performance/ManagerPerformancePanel.tsx` — new `allDomains?: boolean` prop; passes `showDomain` to `AgentCard`; domain badge per card in all-domains mode
- `src/components/performance/AgentDetailPanel.tsx` — domain prop widened to `AppDomain | null`; header label falls back to `agent.domain` when no domain override

---

## 2026-05-31 — Performance page · Fix zero scores bug

All performance metrics (`leadsWon`, `conversionRate`, `touchRate`) were showing zero because they filtered leads by `created_at` within the selected period. In production, agents work leads created in prior periods — e.g. a lead from March marked won in May would never appear in "This Month" stats.

**Root cause:** `_getCoreFourMetricsForRange`, `getAgentRosterPerformance`, `getTeamBenchmarks`, and `getAgentDetailMetrics` all used `created_at >= from AND created_at <= to` for won/lost queries.

**Fix (`src/lib/services/performance-service.ts`):**

- `leadsWon`: now filters by `status_changed_at` (when the lead *became* won), not `created_at`
- `conversionRate`: now filters closed leads (won + lost) by `status_changed_at`
- `touchRate`: intentionally kept on `created_at` — it measures what % of new-period leads were touched (cohort metric)
- `getAgentRosterPerformance`: split into two queries — cohort total via `created_at`, won/lost via `status_changed_at`
- `getAgentDetailMetrics`: added a separate won-leads query by `status_changed_at`; pipeline breakdown still uses the `created_at` cohort

---

## 2026-05-31 — Leads · Won deal capture flow

When marking a lead as Won, the user now goes through a two-step modal instead of a single confirm. Step 1 selects deal type (Membership or Retail). Step 2 captures duration (Membership only: 3 Months / 6 Months / 1 Year) and deal amount (₹). The deal is written atomically before the status is changed to Won.

**`supabase/migrations/20260531000049_leads_deal_duration.sql`**

- Adds `deal_duration text` column to `leads` (nullable)
- Adds `leads_deal_type_check` CHECK constraint (`membership | retail`) if absent
- Adds `leads_deal_duration_check` CHECK constraint (`3_months | 6_months | 1_year | NULL`)

**`src/lib/constants/deal-types.ts`** *(new)*

- `DEAL_TYPES`, `DealType`, `DEAL_TYPE_LABELS`
- `DEAL_DURATIONS`, `DealDuration`, `DEAL_DURATION_LABELS`

**`src/lib/types/database.ts`**

- `deal_duration: string | null` added to leads Row / Insert / Update
- `Lead` type now has `deal_type: DealType | null` and `deal_duration: DealDuration | null` (narrowed from `string | null`)

**`src/lib/validations/lead-schema.ts`**

- `RecordDealSchema` + `RecordDealInput` — validates deal_type, deal_duration (required when membership), deal_amount (positive, ≤ 100M)

**`src/lib/actions/leads.ts`**

- `recordDeal` — Zod → auth → access check → UPDATE deal fields → calls `updateLeadStatus('won')`

**`src/components/leads/WonDealModal.tsx`** *(new)*

- Two-step modal: type selection slide → details slide (duration chips + amount input)
- Composes `ui/modal.tsx`. Zero hardcoded colours. All tokens.

**`src/components/leads/StatusActionPanel.tsx`**

- Won button now opens `WonDealModal` instead of a plain `ConfirmModal`
- `fireDeal()` handler calls `recordDeal` action

---

## 2026-05-31 — Dashboard · widget resize control (height + width)

Users can now resize any dashboard widget while in Edit Layout mode. Clicking the size label in the edit overlay opens a popover with four height tiers and a half/full width toggle. Preferences are persisted per-user in localStorage alongside the existing layout order.

**`src/lib/constants/dashboard-widgets.ts`**

- `WIDGET_HEIGHT_BY_SIZE` — single source of truth for widget container heights (`sm: 200px`, `md: 300px`, `lg: 420px`, `xl: 540px`)
- `WIDGET_SIZE_LABELS` — display labels for each tier (Compact / Standard / Tall / Full)

**`src/hooks/useDashboardLayout.ts`**

- `WidgetPlacement` extended with `colSpan: WidgetColSpan` (previously fixed to widget definition, now user-adjustable per placement)
- `resizePlacement(widgetId, size, colSpan)` added — atomically persists both height tier and column span
- `sanitizeStored` upgraded to hydrate `colSpan` from stored data (falls back to widget definition default for older stored layouts)
- `addWidget`, `reorderWidgets` updated to include `colSpan` in every placement they construct

**`src/components/dashboard/DashboardWidgetSlot.tsx`**

- `WidgetProps` gains optional `size?: WidgetSize` — passed down so each widget can set its container height from `WIDGET_HEIGHT_BY_SIZE[size]`
- `onResize` prop added — fires `resizePlacement` from the canvas
- `ResizePopover` — new inline component; renders a size-label trigger button + dropdown panel with four height rows (showing pixel value) and half/full width toggle; closes on outside click or Escape; zero `backdrop-filter`, zero hardcoded hex

**`src/components/dashboard/DashboardCanvas.tsx`**

- `SortableWidget` now reads `size` and `colSpan` from the placement record (not the widget definition) — user overrides take effect immediately
- `onResize` wired through canvas → sortable widget → slot

**`src/components/dashboard/WidgetSkeleton.tsx`**

- Switched from local `SIZE_MIN_HEIGHTS` to `WIDGET_HEIGHT_BY_SIZE` so skeleton and widget sizes are always in sync

**All 5 widgets** (`AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerLeadVolumeWidget`, `ManagerCampaignWidget`)

- Accept optional `size` prop; container height driven by `WIDGET_HEIGHT_BY_SIZE[size]` instead of hardcoded pixel values

---

## 2026-05-31 — Performance · agent profile card redesign

UI-only redesign of the agent detail panel and roster list on the manager/founder performance page. Zero business logic or data changes.

**`AgentDetailPanel.tsx`** (`src/components/performance/AgentDetailPanel.tsx`)

- **Identity zone** — flat header replaced with a dedicated card: `Avatar size="lg"` with accent ring + live-state pip (success dot), Playfair name, accent-surface domain badge, and conversion rate numeral right-anchored with colour-coded tone (success/warning/danger).
- **Key metrics grid** — horizontal stat strip replaced with a `3-column CSS grid` of `StatAtom` cells. Calls Today / New Leads / Follow-ups in the first row at `--text-xl`; Leads Won and Revenue in the second row at `--text-2xl` on `--theme-accent-surface` accent backgrounds to signal the two primary outcomes. All values in Playfair Light.
- **Pipeline bar** — bar height reduced to `10px` with `--radius-full` overflow for a refined pill look; legend converted from raw text pairs to compact rounded chip pills (`--theme-paper-subtle + --theme-paper-border`), each showing status name + count + percentage.
- **Loading skeletons** — per-section `AnimatePresence mode="wait"` replaces the single opacity-dimming approach; skeletons match the real layout shape exactly so no layout shift occurs on data arrival.
- **Error state** — inline danger card (`--color-danger-light` bg + border) replacing raw `<p>` text.
- **`SectionCard` local wrapper** — titled content card for pipeline and deal-breakdown sections. Chrome: `--theme-paper + --shadow-1 + --radius-lg`, matching established section-card conventions.

**`ManagerPerformancePanel.tsx`** (`src/components/performance/ManagerPerformancePanel.tsx`)

- **`AgentCard`** — converted from plain `<button>` to `motion.button` with `x: -8 → 0` staggered entrance (40ms per row). Active left indicator: 3px × 20px `--theme-accent` pill at the left edge (matches sidebar active-pill convention). Conversion rate rendered as a mono numeral (colour-coded) rather than a filled pill badge — cleaner at small sizes.
- **`RosterHeader`** — new two-column micro-label row ("TEAM" left, "CONV." right) above the roster with a `--theme-paper-border` hairline separator.
- **Panel exit animation** — `AnimatePresence` transition extended with `y: -4` exit to complement the `y: 6` entrance (was opacity-only).

---

## 2026-05-31 — Dashboard · bento grid layout redesign

- `DashboardCanvas.tsx` — 2-column rigid grid replaced with a 12-column CSS bento grid (`repeat(12, 1fr)`). Half-width widgets (`colSpan: 1`) occupy 6 columns; full-width widgets (`colSpan: 2`) occupy all 12. Below 820 px all widgets collapse to full-width (single column). Drag-to-reorder updated to `rectSortingStrategy` (was `verticalListSortingStrategy`) for correct 2D grid dragging.
- `dashboard-widgets.ts` — `WidgetColSpan` type added; `colSpan` field added to `WidgetDefinition`; `agent-tasks`, `agent-activity`, `manager-lead-status`, `manager-lead-volume` → `colSpan: 1`; `manager-campaigns` → `colSpan: 2` (chart needs full width).
- `DashboardWidgetSlot.tsx` — `colSpan: WidgetColSpan` prop added; root container given `height: 100%` so widgets fill their bento cell.
- `WidgetSkeleton.tsx` — switched from fixed `height` to `minHeight` + `height: 100%` so the skeleton fills the cell rather than being a fixed box.
- `AgentActivityWidget.tsx` — removed hardcoded `VIEWPORT_HEIGHT = 220` constant; ticker viewport now uses `flex: 1` + `minHeight: 160px` to fill remaining widget height; `viewportRef` added so the scroll tick reads the actual measured height.
- `ManagerCampaignWidget.tsx` — outer container `height: 100%`; chart container gains `flex: 1` and `minHeight: 260px`; chart height bumped from 260 to 300 px (benefits from full-canvas width).
- `ManagerLeadVolumeWidget.tsx` — outer container `minHeight: 340px` + `height: 100%`; chart container uses `flex: 1` + `minHeight: 180px`; `ResponsiveContainer` height changed from `180` to `"100%"` so the chart expands with available vertical space; `ChartEmpty` uses `height: 100%`.
- `ManagerLeadStatusWidget.tsx`, `AgentTasksWidget.tsx` — `height: 100%` added so cards stretch to match the tallest sibling in the same grid row.

---

## 2026-05-31 — UI · micro-animation pass — interactive components

GPU-only micro-animations added to six small UI components. All animations use `transform` and `opacity` exclusively — no layout properties touched. `willChange: 'transform'` set only on elements that move. Zero impact on initial render or data-fetching paths.

**`BackButton`** (`src/components/ui/BackButton.tsx`)

- Converted from plain `<Link>` to `motion(Link)`. Mounts with `x: -6 → 0, opacity: 0 → 1` (150ms, ease-out-expo).
- Hover: whole button nudges `x: -2` + `scale 1.05`; inner arrow nudges an additional `x: -1` (layered directional signal).
- Tap: `scale 0.93` spring. `willChange: 'transform'` on the link element.

**`ChecklistItem`** (`src/components/ui/ChecklistItem.tsx`)

- Square ↔ CheckSquare icon crossfades via `AnimatePresence mode="wait"` — `scale 0.6 → 1, opacity 0 → 1` (150ms, ease-out-expo) on both enter and exit. Never two icons in DOM simultaneously.
- Tap: `motion.button` `whileTap scale 0.85` spring on the toggle button.

**`InfoRow` copy button** (`src/components/ui/InfoRow.tsx`)

- Copy ↔ Check icon crossfades via `AnimatePresence mode="wait"` — `scale 0.5 → 1` (150ms). Confirms the copy action with a satisfying pop.
- Tap: `whileTap scale 0.8` on the copy button itself.

**`EditButton`** (`src/components/ui/EditButton.tsx`)

- Converted to `motion.button`. Pencil icon rotates `0 → -8°` on hover (150ms, ease-out-expo) — suggests "ready to edit".
- Tap: `whileTap scale 0.88`.
- Props interface narrowed: explicit `onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, disabled, className` — avoids `...rest` spread conflict with Framer Motion prop types.

**`ListRow`** (`src/components/ui/ListRow.tsx`)

- Chevron wraps in `motion.span`; animates `x: 0 → 2` on hover (150ms) — directional nudge signals the row is navigable.
- Background hover state moved from imperative `style.setProperty` to reactive `hovered` state — consistent with the rest of the library.

**`SearchBar`** (`src/components/ui/SearchBar.tsx`)

- Clear × button wrapped in `AnimatePresence`; fades + scales in (`scale 0.7 → 1`) when text is present, out when cleared or tapped.
- Tap: `whileTap scale 0.8`.

**`MotionButton` — first real consumers wired**

- `AddLeadButton.tsx` — switched from `Button` to `MotionButton` + `MOTION_BUTTON_DEFAULTS` (spring tap `scale 0.97`). Primary CTA pressed repeatedly by agents.
- `TasksShell.tsx` — "+ My Task / + Group Task" header button switched to `MotionButton` + `MOTION_BUTTON_DEFAULTS`.
- All other `Button` callers (form submits, modal footers, auth pages) remain on plain `Button` — tap animation is unnecessary and would add Framer bundle cost on those pages.

**Architecture rule confirmed:** `Button` (CSS hover, zero Framer cost) is correct for form submits and modal actions. `MotionButton` is correct for standalone primary CTAs that users tap repeatedly. Never merge them.

---

## 2026-05-31 — Leads · Called modal outcome picker

- `CalledModal.tsx` — native `<select>` for call outcome replaced with `FilterDropdown` (single-select), matching the filter bar and task tag pickers.

---

## 2026-05-31 — Performance · unified filter bar + custom date range

- `page.tsx` — filter bar unified across all roles: period selector + (founder/admin) domain tabs rendered in a single `--theme-paper` strip, replacing the two-zone layout (domain tabs below period selector). Custom date params `?from=` and `?to=` parsed from URL and threaded through to all async components.
- `PerformancePeriodSelector.tsx` — "Custom" tab added; selecting it reveals two inline `DatePicker` components (From → To) with `AnimatePresence` slide-in; pickers write `?from=&to=` URL params; switching away from Custom clears both params; domain param preserved when switching periods.
- `FounderDomainTabs.tsx` — now rendered inside the filter bar alongside the period selector, separated by a `1px --theme-paper-border` divider; `?from=`/`?to=` params preserved when switching domains.
- `FounderPerformanceShell.tsx` — domain fetching + tab rendering removed (moved to `page.tsx`); shell now a thin passthrough that delegates to `ManagerPerformanceAsync` with resolved `domain`, `period`, and optional `customFrom`/`customTo`.
- `ManagerPerformanceAsync.tsx` — accepts optional `customFrom`/`customTo` string props; uses these directly as date range when `period === 'custom'`, falling back to `getPeriodDateRange` otherwise.
- `performance-service.ts` — `PerformancePeriod` extended with `'custom'`; `getPeriodDateRange('custom')` falls back to `this_month` (safe fallback — custom dates are always passed directly by callers); `getPreviousPeriodDateRange('custom')` returns `null` (no meaningful prior period).

---

## 2026-05-31 — Performance · agent roster redesign

- `ManagerPerformancePanel.tsx` — `AgentCard` fully redesigned:
  - Removed generic `3px solid var(--theme-accent)` left-border selection indicator.
  - Selected state now uses `--theme-accent-surface` background + subtle accent-tinted border (`color-mix`), matching the system's card selection pattern.
  - Added `rank` prop — mono numeric rank rendered left of avatar, accented on selection.
  - Avatar downsized from `md` (40px) to `sm` (32px) — list is a navigation aid, not a profile display.
  - Conversion rate pill moved to right-aligned column, separated from the name/leads stack — cleaner scan left-to-right.
  - `onMouseEnter/Leave` handlers add hover state without disrupting the selected card.
  - "Team / N agents" header block and "Agent / Rate" column label row removed — clean card list without a table-like header.
  - Rank number `<span>` given `lineHeight: 1; alignSelf: center` — correctly centered vertically with avatar.
  - Panel width reduced to 280px with `padding: var(--space-2)` inner padding for edge-to-edge card layout.

---

## 2026-05-31 — WhatsApp · title and composer gap fixes

- `WhatsAppShell.tsx` — heading renamed to "WhatsApp" with `<span className="page-title-dot">.</span>` blinking dot + `type-page-title` class (Playfair, matches all primary nav pages). Shell changed from `height: calc(100dvh - 56px)` to `height: 100%` — the `dvh` calculation was evaluated inside the scrollable paper card, causing the composer to float mid-page instead of pinning to the bottom edge.
- `ConversationPanel.tsx` — removed "Enter to send · Shift+Enter for new line" hint `<p>` below the composer.
- `app/(dashboard)/whatsapp/page.tsx` — wrapped `WhatsAppShell` in a `flex: 1; overflow: hidden; min-height: 0` container so the paper card's height constraint propagates down and the shell fills exactly to the bottom.

---

## 2026-05-31 — WhatsApp · design system alignment

- `WhatsAppShell.tsx` — left panel header: Playfair italic "Messages" heading replaces generic sans-serif "WhatsApp" span; left panel background corrected to `--theme-paper`; right panel background corrected to `--theme-paper-subtle`.
- `ConversationRow.tsx` — `Avatar` component replaces raw unread dot; avatar overlaid with accent dot badge when unread; name/timestamp use proper type tokens; resolved badge now flex-shrink safe.
- `ConversationPanel.tsx` — `Avatar` added to header zone; contact name uses Playfair italic; resolved composer banner copy uses Playfair italic; `Avatar` imported from `src/components/ui/Avatar`.
- `MessageBubble.tsx` — inbound messages now show sender avatar (`Avatar size="xs"`) + sender name row above bubble; bot label styled with `--theme-accent` and `--weight-medium`; hardcoded `rgba(0,0,0,0.06)` in `MediaPlaceholder` replaced with `--theme-paper-border`; outbound bubbles gain `--shadow-1`; inbound bubbles use `--theme-paper` background (elevated from paper-subtle).
- `EmptyConversationState.tsx` — icon container uses `--theme-paper` + `--shadow-1` + border (grounded card style matching system empty states); copy tightened to on-brand language.
- `loading.tsx` — skeleton left panel updated to `--theme-paper` background; avatar-style 32×32 rounded squares replace the small unread dot circles; right panel updated to `--theme-paper-subtle`.

---

## 2026-05-31 — Performance · period selector — active tab restored

- `PerformancePeriodSelector.tsx` — reverted from `FilterDropdown` to `TabSelector` (pill). The dropdown always showed a generic “Time Period” label with a `1` badge and no visible active period; tabs show the selected range with the pill indicator again. `indicatorLayoutId="performance-period-tabs"` avoids shared-layout clashes with founder domain tabs.
- `FilterDropdown.tsx` — single-select: re-clicking the active option no longer clears selection (menu closes only; **Clear** still deselects).

---

## 2026-05-31 — UI · TabSelector pill — soft pastel active chip

- `design-tokens.css` — `--theme-tab-pill-active-bg`, `--theme-tab-pill-active-border`, `--theme-tab-pill-active-text` (accent-muted washed into paper surfaces; Earth reads as soft brown on cream).
- `TabSelector.tsx` — pill variant active chip no longer uses dark `--theme-canvas`; uses new tokens + `--shadow-1`. Affects all pill consumers (Lead Volume period tabs, TasksShell, PerformancePeriodSelector, etc.).

---

## 2026-05-31 — Dashboard · Lead Pipeline + Campaign Performance — domain tab selector

- `ManagerLeadStatusWidget.tsx`, `ManagerCampaignWidget.tsx` — domain picker switched from `variant="pill"` to `variant="connected"` to match `ManagerLeadVolumeWidget` (segmented tray, equal-width tabs, primary active text).

---

## 2026-05-31 — Dashboard · Lead Pipeline widget — Overall label

- `ManagerLeadStatusWidget.tsx` — domain-wide stacked bar now has an **Overall** row label (name + lead count) matching the per-agent bar layout above the status legend.

---

## 2026-05-31 — Dashboard · Lead Volume widget — merged domain footer

- `ManagerLeadVolumeWidget.tsx` — domain tab row and per-domain totals strip merged into one connected tab bar below the chart: domain label + period total (`--font-mono`, `--text-sm`, `formatCount`). Chart Recharts legend unchanged. Period tabs stay in the header row.

---

## 2026-05-31 — Dashboard · Lead Volume widget — header total removed

- `ManagerLeadVolumeWidget.tsx` — period aggregate count removed from the widget header; title row is Playfair title + period tabs only. Per-domain totals strip gains a non-clickable **Total** label summing all four featured domains.

---

## 2026-05-31 — Dashboard · Lead Volume widget — domain picker + multi-line chart

Enhanced the `ManagerLeadVolumeWidget` with domain filtering and a 4-line cross-domain chart.

- **Period tabs reordered:** This Month (left) | This Week (default, middle) | Today (right). Uses `Tabs` + `TabsList` + `TabsTrigger` compound API with `indicatorLayoutId="lead-volume-period"` — replaced the previous `TabSelector` backwards-compat wrapper.
- **Domain picker** (admin/founder only): connected tab row — All | Onboarding | Shop | House | Legacy. Uses the same compound API with `indicatorLayoutId="lead-volume-domain"`. Manager role sees no picker (locked to own domain).
- **Multi-line chart** ("All" mode): 4 `<Line>` components, one per featured domain, each coloured from `useChartTokens`. Custom `MultiLineTooltip` shows all 4 domain values on hover. Recharts `<Legend>` with short domain labels below the chart. Per-domain totals strip at the bottom — clicking a domain name drills into it.
- **Single-line chart** (specific domain selected or manager role): same as before, one line for the selected domain.
- `src/lib/services/dashboard-service.ts` — `getLeadVolumeByDomains(domains, period)` added: single query fetching `created_at + domain` for the 4 featured domains, bucketed into per-domain time series. Returns `MultiDomainVolumeSummary { domains, totals, series }`.
- `src/lib/actions/dashboard.ts` — `getLeadVolumeByDomainsAction(period, domains)` added (manager/admin/founder); `getLeadVolumeForDomainAction(period, targetDomain)` added for single-domain drill-down — passes `role='manager'` to `getLeadVolumeByPeriod` to force the domain filter regardless of caller role.
- **Bug fixed:** previous `getLeadVolumeByPeriodAction` ignored its `_domain` param and always used `profile.domain`, so domain tab drill-downs returned all-domain data. New `getLeadVolumeForDomainAction` passes the target domain explicitly.
- **Bug fixed:** `useRef` guard on the mount `useEffect` broke under React Strict Mode — the ref survived the dev double-mount cycle but the `cancelled` flag did not, so `setLoaded(true)` was never called. Replaced with the standard single-flag pattern.

---

## 2026-05-31 — Group Tasks · identity block redesign + subtask row cleanup

- `GroupTasksTab.tsx` — `IdentityBlock` fully redesigned: replaced the hard-coloured 60px accent-filled panel with a soft 52px column using `var(--theme-paper-subtle)` background, a 1px `--theme-paper-border` right edge, and a 3px left accent line. Icon reduced from 22px white-on-solid to 16px at 70% opacity in the accent colour — subordinate, not dominant. `ProgressRing` now draws on the paper surface: track uses `var(--theme-paper-border)`, fill uses the accent colour (switches to `--color-success-text` at 100%), zero-progress ring renders at 30% opacity. Count label moved below the ring in `--theme-text-tertiary`. Overall feel is grounded, soft, and theme-reactive rather than a hard branded block.
- `GroupTasksTab.tsx` — completion circle removed from subtask rows entirely. Subtask row layout is now: pastel `SubtaskStatusBadge` (left) → title (grows, 13px `--weight-medium` `--theme-text-secondary`) → assignee chip (20px avatar + first name, right). No toggle affordance on the row — subtask status is changed inside `SubTaskModal`.

---

## 2026-05-31 — Tasks · SubTaskModal remarks composer

- `TaskRemarksPanel.tsx` — removed status-change pill row below the message bar ("moved to To Do", "started work", etc.). Remarks post text only; existing timeline status chips on older remarks are unchanged.

---

## 2026-05-31 — TimePicker · AM/PM flicker fix

- `src/components/ui/TimePicker.tsx` — replaced `TabSelector` (Framer `layoutId` spring pill) with static `AmpmToggle` on the AM/PM row. The shared-layout indicator was re-animating from the left when hour/minute picks triggered parent re-renders, which looked like a tab sliding across the scroll columns. Draft now seeds only on panel open, not on every `value` prop update while the panel stays open.

---

## 2026-05-31 — TimePicker · settings page fixes

- `src/lib/utils/dates.ts` — `normalizeTimeHHMM()` strips optional seconds from PostgreSQL `time` values (`09:00:00` → `09:00`).
- `src/components/ui/TimePicker.tsx` — panel portals to `document.body` with `position: fixed` (no longer clipped by stacked settings cards); viewport flip up/down + left; draft state while open; all values normalised through `normalizeTimeHHMM` before parse/display.
- `src/components/settings/AgentSettingsTable.tsx` — shift times normalised on load and on each pick so validation/save accepts DB `time` strings.

---

## 2026-05-31 — Settings · AgentSettingsTable row/column layout fix

- Grid column widths corrected: Shift Start/End `96px → 104px` (gives TimePicker room), Active Hours `120px → 96px`, In Pool `120px → 88px` (toggle is 32px wide, no label in cell).
- `overflow: hidden` removed from table container — was clipping TimePicker dropdown panels. Replaced with `borderRadius` on header (top corners) and last row (bottom corners) directly, preserving the rounded card appearance without a clipping context.
- Toggle `label` prop removed from row cells — column header "In Pool" already communicates it; inline "Active"/"Inactive" label was redundant.
- `TimePicker` trigger: `width: 100%` + `minWidth: 88` so it stretches to fill its grid cell. Container `flexDirection: column` added to support full-width stretch.

---

## 2026-05-31 — New component · TimePicker (`src/components/ui/TimePicker.tsx`)

Standalone time-only picker replacing `<input type="time">` throughout the codebase.

- **Props:** `value: string | null` (HH:MM 24-hour, matching PostgreSQL `time`), `onChange: (string | null) => void`, `placeholder?`, `disabled?`, `style?`, `aria-label?`
- **Trigger:** 88×32 button matching the paper-subtle input aesthetic — Clock icon + formatted time label ("9:00 AM"). Accent border + focus shadow on open/focus. Width matches the old `<input type="time">` slot exactly.
- **Panel:** `DROPDOWN_VARIANTS` Framer Motion popover. Horizontal flip detection (same pattern as DatePicker — `getBoundingClientRect` on open, `right: 0` when near viewport edge). Hour scroll column (1–12) + minute scroll column (0–55 in 5-minute steps) + AM/PM connected TabSelector.
- **ScrollColumn:** local copy of the same scroll-column pattern from `DatePicker.tsx` — selected item auto-scrolls into view on mount and on selection change. Selected cell: `--theme-accent-surface` bg + `--theme-accent` text.
- **Serialisation:** `parse("HH:MM") → TimeState` (12h display), `serialise(h, m, meridiem) → "HH:MM"` (24h for DB). Minute snapped to nearest 5-minute step. No Date objects involved — string-only, timezone-safe.
- **`AgentSettingsTable`** — both `<input type="time">` replaced with `<TimePicker>`. `timeInputStyle` object removed. `updateField` + `handleBlur` removed; replaced with `handleTimeChange` (updates shift state + calls `validateAndSave` immediately on each pick) and extracted `validateAndSave` function.

---

## 2026-05-31 — Settings · AgentSettingsTable primitives migration + hardening

- `AgentSettingsTable.tsx` — adopted `Avatar` (sm, borderRadius override to --radius-sm) replacing bespoke 32×32 div with manual initials/image logic; `getInitials()` local function removed (Avatar handles semantic colour fallback + initials internally). Clear-shift button replaced with `Button variant="danger" size="xs"` — eliminates imperative `onMouseEnter/onMouseLeave` DOM mutation for hover states. Row opacity for saving/pending state moved from conflicting inline `style.opacity` into Framer Motion `animate={{ opacity }}` — resolves the race between entrance animation and dimming transition. Unused `APP_DOMAINS` import removed.

---

## 2026-05-31 — Group Tasks · subtask visual hierarchy + assignee chip

- `GroupTasksTab.tsx` — `SubtaskStatusBadge` internal component added with a fully independent pastel palette (`SUBTASK_STATUS_PASTEL`) — six distinct colour sets not tied to `--theme-accent`, so they remain vivid across all five Eia themes: slate (to_do), amber (in_progress), indigo (in_review), emerald (completed), rose (error), cool-grey (cancelled). Badge placed on the **left** of each subtask row (not the right). `in_progress` status dot animates via `eia-subtask-pulse` keyframe (2s ease-in-out, scale + opacity). Subtask title styled at `13px`, `--weight-medium`, `--theme-text-secondary`, `letter-spacing: -0.01em` — visually subordinate to the group task title. Left indent via `padding-left: var(--space-10)` to reinforce the hierarchy. Assignee display changed from bare `Avatar` icon to a proper chip: Avatar (20×20) + first name in `12px --weight-medium --theme-text-secondary`, with `marginLeft: var(--space-2)` and `opacity: 0.45` when the subtask is completed.
- `src/styles/design-tokens.css` — `@keyframes eia-subtask-pulse` added: `0%/100%` → scale 1, opacity 1; `50%` → scale 0.72, opacity 0.45.

---

## 2026-05-31 — Group Tasks · CreateGroupTaskModal full UX redesign

- `CreateGroupTaskModal.tsx` — complete rewrite. Removed: two-column preview layout, accent colour swatches (no DB column), icon picker (no DB column), member search stub. Replaced with a single-screen layout: group details (title, description, domain, priority, due date) + inline subtask drafts section. Each draft row has title input, priority dots, assignee inline picker, and due date. Subtasks are created via `createSubtaskAction` in `Promise.allSettled` immediately after `createGroupTaskAction` on submit. Props extended: `callerRole` and `callerDomain` required (manager domain auto-locked, domain select hidden). `AssigneeInlinePicker` added as internal component — compact inline dropdown composing `Avatar` + search. Priority shown as 20px dot buttons per draft row for density. `DatePicker` used for group-level and per-subtask due dates. Agents fetched via `listAgentsForDomain` when domain is selected; drafts cleared on domain change.
- `GroupTasksTab.tsx` — `CreateGroupTaskModal` call site updated to pass `callerRole` and `callerDomain`.

---

## 2026-05-31 — Tasks page · primitives migration + visual audit

- `PersonalTasksTab.tsx` — quick-add due date `<input type="date">` replaced with `<DatePicker>`; `quickDueAt` state changed from `string` to `Date | null`; `due_at` action calls updated to `quickDueAt.toISOString()` directly; reset changed from `''` to `null`. Tag filter bar (bespoke inline pill buttons + Clear link) replaced with `<FilterDropdown multi>` — items built from `availableTags`. `X` re-added to lucide imports (still used by quick-add cancel button). `FilterDropdown` and `DatePicker` imports added.
- `TasksShell.tsx` — raw `<button>` with inline styles replaced with `<Button variant="primary" size="sm">`; `Button` import added; `Plus` rendered as inline child (Button has no `leftIcon` prop). `borderRadius: --radius-sm` violation corrected (Button applies `--radius-md` per spec).

---

## 2026-05-31 — Dashboard · AgentActivityWidget: auto-scrolling live ticker, speed tuned

- Scroll speed reduced to `0.11px/frame` (~6.6px/s at 60fps) — slow enough to read without stopping
- Previous value was `0.4` (too fast), intermediate `0.15` (still fast), settled on `0.11`

---

## 2026-05-31 — Dashboard · AgentActivityWidget: auto-scrolling live ticker, limit 25, note_added filtered

- **Migration 0048** (`20260531000048_dashboard_activity_limit_25.sql`): bumps `agent_activity` LIMIT 10 → 25 in `get_dashboard_summary` RPC; `getAgentRecentActivity` service function also bumped to 25
- "Recent Activity" eyebrow label removed; subtitle changed to "Live Lead Activity."
- Fixed-height ticker viewport (`220px`), overflow hidden, fade masks top + bottom using `--theme-paper` gradient
- Inner list scrolls via `translateY` on a `setTimeout` loop (`FRAME_INTERVAL = 16ms`); wraps to 0 when last row scrolls out
- Pauses on `mouseenter`, resumes on `mouseleave`
- New Realtime event: resets offset to 0 instantly so new item appears at top, then resumes
- `note_added` filtered in all three paths: seed, refresh fetch, Realtime handler
- State cap: 25 rows (`ACTIVITY_CAP`); `ROW_HEIGHT = 48px` constant drives wrap calculation

---

## 2026-05-31 — Dashboard · AgentTasksWidget: unified all-category task list with animated category dots

Widget renamed from "Gia · My Tasks" to "My Tasks". Now shows all active tasks assigned to the agent across all 3 categories (`personal`, `group_subtask`, `gia_followup`) instead of only gia lead tasks due today.

- **Migration 0047** (`20260531000047_dashboard_agent_tasks_all_categories.sql`): replaces the `agent_tasks` CTE in `get_dashboard_summary` RPC — LEFT JOINs `task_gia_meta`+`leads` for gia context, `task_groups` for group context; active statuses `to_do/in_progress/in_review`; sort: overdue → priority → due_at; limit 30; `newLeadsCount` removed
- `DashboardAgentTask` type rewritten: now carries `title`, `task_category`, `priority`, `status`, `context_label`, `lead_id`
- `DashboardSummary.agent_tasks` is now `DashboardAgentTask[]` directly (no longer wrapped in `DashboardAgentTasksSummary`)
- `getAgentTasksSummary()` in `dashboard-service.ts` rewritten to match new shape (3-category join, client-side sort mirror)
- `TASK_CATEGORY` constants extended with `dotColor` CSS token per category
- `AgentTasksWidget`: animated pulsing dot per category identifier (scale+opacity, GPU-only, `eia-cat-dot-pulse` keyframe, staggered delays 0s/0.4s/0.8s); priority chip (urgent/high only); status chip (in_progress/in_review only); context label italic below title; category legend footer; "new leads" footer removed

---

## 2026-05-31 — Leads · LeadsFilters: migrated to FilterDropdown + DatePicker primitives

`LeadsFilters.tsx` fully rewritten. Removed three inline sub-components (`MultiSelectDropdown`, `SingleSelectDropdown`, `DateRangeFilter`) and the `<style>` keyframe injection. Replaced with:

- `FilterDropdown multi={true}` for Status and Outcome
- `FilterDropdown` (single-select) for Source, Campaign, Agent — `selected` bridged as `[value]`/`value ?? null`
- Two `DatePicker` components (date-only) for the date range, with `minDate`/`maxDate` cross-constraints
- `dateFromParam` / `dateToParam` helpers for IST-safe round-trip between `YYYY-MM-DD` URL params and `Date` objects (avoids `new Date('2026-05-31')` UTC midnight parse)
- Search input gains `eia-input` className so `::placeholder` resolves correctly via global CSS rule
- Search input `borderRadius` corrected to `--radius-md` (matching FilterDropdown trigger)
- Removed `formatDate` re-export (no consumer was importing it from here)
- All animation now via Framer Motion `DROPDOWN_VARIANTS` inside `FilterDropdown` — inline `@keyframes ddEnter` removed

---

## 2026-05-31 — Tasks · CreatePersonalTaskModal: migrated specific-date picker to DatePicker component

`CreatePersonalTaskModal.tsx` — replaced the raw `<input type="datetime-local">` behind a manual toggle with `<DatePicker showTime value={dueDate} onChange={handleDatePickerChange} />`. `dueSpecific: string` state replaced with `dueDate: Date | null`. `showDatePicker` boolean toggle and `ChevronDown` button removed. `ChevronDown` import removed. `getResolvedDueAt()` now reads `dueDate.toISOString()` instead of `new Date(dueSpecific).toISOString()`. Preset chip handler clears `dueDate` (was `dueSpecific + showDatePicker`). DatePicker handles its own open/close toggle internally — no wrapper toggle needed. IST end-of-day logic for presets is unchanged.

---

## 2026-05-30 — Profile · UI: `/profile` widened to canonical detail-page layout

UI-only change. No backend, action, schema, or RLS change. No business logic touched — every server action call site and Supabase upload path is byte-identical.

**`src/app/(dashboard)/profile/page.tsx`:**

- Layout switched from the old 672px centred narrow shell to the canonical wide detail-page pattern (`max-width: 1280px`, two-column grid `minmax(0, 1fr) 340px`). Now matches `/admin/users/[id]` exactly.
- Left column: `Personal Details`, `Appearance`, `Security`, `Notifications` — each `SectionCard` gained a one-line `description` explaining the section's purpose.
- Right sticky sidebar (340px): new `Identity` `SectionCard` (avatar tile, name, email, job-title, role + domain status pills, "Member since" meta strip on `--theme-paper-subtle` divider) and `Session` `SectionCard` containing the sign-out form.
- Added `.type-eyebrow` "Account" label above the page title — matches the established detail-page header pattern.
- Sign-out button migrated from a raw inline `<button>` to `Button variant="secondary" size="sm"` (Q-12 reuse). `LogOut` icon dropped — `Button.iconLeft` accepts a `LucideIcon` component reference which cannot cross the server→client component boundary in this server-component page; text-only is fine since the form context and section title already establish the action.

**`src/components/profile/ProfileAvatarSection.tsx`:**

- Reduced from a horizontal `avatar + identity text + role/domain pills + member-since` composite to just the upload tile (96×96, `--radius-md`, hover camera overlay, spinner, inline error).
- Identity text + pills + member-since now live at the page level inside the `Identity` sidebar card.
- Removed the local `Pill` helper — the page uses the canonical `.status-pill` utility from `design-tokens.css`.
- Upload logic (`createClient`, `updateProfileAvatar`, 2 MB validation, cache-busting) is byte-identical.

**Files modified:** `src/app/(dashboard)/profile/page.tsx`, `src/components/profile/ProfileAvatarSection.tsx`.

---

## 2026-05-30 — Admin · UI: Team / user-management redesign + two new shared primitives (`SectionCard`, `BackButton`)

**Pages redesigned (UI only — no backend, action, schema, or RLS change):**

- `/admin/users` (Team list) — wrapper card switched from `--shadow-paper` (levitating) to `1px --theme-paper-border + --shadow-1` (flat, grounded). Aligns with `AgentSettingsTable` in `/settings`.
- `/admin/users/[id]` (User detail) — full redesign. `max-width: 1280px` (Wide zone, DESIGN-DNA §3.4). Two-column grid `minmax(0, 1fr) 340px`: left stacks `Profile Details` + `Authorization` `SectionCard`s; right is a sticky `Identity` sidebar with `Avatar size="xl"`, name, email, job-title, role/domain status pills, plus the existing `UserStatusControls` toggles below a hairline. Drops the redundant "TEAM MEMBER" eyebrow — `BackButton` already establishes context.
- `/admin/users/new` (New User) — full redesign. Wide 1280px two-column grid. Left: `SectionCard "Member Details"` containing `<CreateUserForm mode={mode} />`. Right: sticky `SectionCard "Onboarding Method"` containing the relocated `TabSelector` (variant `connected`, "Set password" / "Send invite link") and a mode-aware tips block (Password mode: temporary password + role/domain; Invite mode: magic-link + role/domain). Drops the page subtitle (redundant after the tabs moved up).
- `/profile` — migrated from its private `ProfileSection` shell to the new shared `SectionCard` (visual output identical). Dead `ProfileSection` definition removed.

**`CreateUserForm.tsx` refactor:** removed internal `useState`/`TabSelector` for mode. Now controlled — accepts `mode: "password" | "invite"` prop. Exports `CreateUserMode` type. Internal info-banner inside invite mode removed (its message now lives in the right-column tips block).

**`EditProfileForm.tsx` + `EditAuthorizationForm.tsx`:** dropped their own outer `padding` and `borderTop` separators — `SectionCard` body padding owns it. Labels in `EditProfileForm` migrated to the canonical `label-micro` style (`--text-2xs / widest / tertiary`) — now matches `EditAuthorizationForm` and `CreateUserForm`.

**`UserStatusControls.tsx`:** horizontal padding aligned to `--space-6` (was `--space-8`) — flush with the `SectionCard` body grid.

**Cancel button:** `CreateUserForm` Cancel switched from a raw `<a>` to `<Link><Button variant="secondary"></Link>` (Q-12 — reuse the canonical primitive).

**New shared primitives:**

- `src/components/ui/SectionCard.tsx` — canonical card shell for single-record detail pages. Props: `title`, `description?`, `headerRight?`, `bodyPadding?` (default `true`), `children`. Header strip `--theme-paper-subtle` + `label-micro` title; body padded `--space-6` by default. Flat chrome: `1px --theme-paper-border + --shadow-1` — never `--shadow-paper`. Used by `/profile`, `/admin/users/[id]`, `/admin/users/new`, and `NewUserClient`.
- `src/components/ui/BackButton.tsx` — 36×36 circular icon-only back link. Props: `href`, `label` (drives `aria-label` + `title`). Server-component-safe. Sits inline to the left of the page `<h1>` with `gap: var(--space-4)`. Replaces 5 inline back-link implementations: `/admin/users/new`, `/admin/users/[id]`, `/leads/[id]`, `/campaigns/[id]`, `tasks/[id]` (GroupTaskWorkspace).

**Other migrations driven by `BackButton`:**

- `leads/[id]/page.tsx` — header `<h1>` upgraded from a hand-rolled `var(--font-serif)` inline style to the canonical `.type-page-title` + `.page-title-dot` classes. Phone number subtitle preserved.
- `campaigns/[id]/page.tsx` — back link upgraded from a raw `← Campaigns` `<a>` (no Next.js Link prefetching) to `BackButton`.
- `GroupTaskWorkspace.tsx` — title row collapsed: back button + title + meta pills now sit on one flex row (was a stacked back-link / title row layout). Vertical real estate saved.

**Wrapper for client state lift:** `src/components/admin/NewUserClient.tsx` — `'use client'` two-column layout. Owns `mode` state for `CreateUserForm` and the parallel `TabSelector` on the right. Required because the page is a Server Component but the form mode is client state shared across columns.

**Files added:**

- `src/components/ui/SectionCard.tsx`
- `src/components/ui/BackButton.tsx`
- `src/components/admin/NewUserClient.tsx`

**Files modified:** `src/app/(dashboard)/admin/users/page.tsx`, `src/app/(dashboard)/admin/users/[id]/page.tsx`, `src/app/(dashboard)/admin/users/new/page.tsx`, `src/app/(dashboard)/profile/page.tsx`, `src/app/(dashboard)/leads/[id]/page.tsx`, `src/app/(dashboard)/campaigns/[id]/page.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/admin/CreateUserForm.tsx`, `src/components/admin/EditProfileForm.tsx`, `src/components/admin/EditAuthorizationForm.tsx`, `src/components/admin/UserStatusControls.tsx`.

---

## 2026-05-30 — Campaigns: detail page title beautified — `campaigns/[id]/page.tsx` now derives a display-only `campaignTitle` by splitting the raw campaign key on `_` and whitespace and joining with `·` (e.g. `TG_House_Meta+Leads_Goa+Resort` → `TG · House · Meta · Leads · Goa · Resort`). Decode step also strips `%2B` defensively (case-insensitive) before the `+→space` swap, so a double-encoded link from the address bar no longer shows literal `%2B` in the heading. The un-beautified `campaignName` is still the value passed to all DB lookups (`getCampaignDetailMetrics`, `getCampaignAgentDistribution`, `getLeadsByRoleCached`) — only the H1 changes.

## 2026-05-30 — ComboboxDropdown ui primitive shipped — LeadInfoCard inline combobox migrated. Phase UI. New file `src/components/ui/ComboboxDropdown.tsx` (single-select searchable picker, viewport-flip, kbd nav Escape/Arrow/Enter, DROPDOWN_VARIANTS, no hardcoded hex). `renderTrigger` prop lets LeadInfoCard.AssigneeCombobox keep its InfoRow-styled trigger (label-above-value with dashed accent underline on hover) — visual identical to pre-migration; panel + search + list now live in the primitive. Inline panel/list/search/handlers removed from LeadInfoCard (~190 lines deleted).

## 2026-05-30 — UI: Calendar.tsx gains optional taskDots prop — per-day 4px dot below the day number (absolute, zIndex:1, scale 0→1 / 150ms EASE_SPRING). --theme-accent at 0.7 opacity for 1–2 tasks, 1.0 for 3+; --color-danger when hasUrgent. Cell height switches from aspectRatio:1 to 44px only when taskDots provided. Local-date YYYY-MM-DD keying (IST-safe, never toISOString). taskDots=undefined renders byte-identical to legacy. Today dot suppressed when a task dot occupies the same cell.

## 2026-05-30 — UI: DatePicker.tsx gains optional showTime prop — renders Hours (1–12) / Minutes (00,15,30,45) scroll columns with ":" separator and AM/PM TabSelector (variant="connected", indicatorLayoutId="datepicker-ampm") inside the same panel, separated by 1px --theme-paper-border. Selected cell bg --theme-accent-surface + --radius-xs. Trigger label switches to "dd MMM yyyy, h:mm a" when showTime + value present. All commits routed through toUTC(). showTime=false behaviour byte-identical to legacy (zero consumer impact — no callers today).

## 2026-05-30 — UI: FilterDropdown.tsx enhancements — trigger border now accent when open (was only when active); ChevronDown rotation transition switched from --duration-base/--ease-spring to --duration-fast/--ease-in-out per spec; checkbox unselected bg now --theme-paper (was transparent); footer Clear link added (right-aligned --text-xs --theme-text-tertiary, hover --theme-accent, fires onChange([])) with 1px --theme-paper-border separator above; visible only when selected.length > 0. No prop API change.

## 2026-05-30 — UI: TabSelector.tsx spec audit — confirmed pill (paper-subtle tray, --theme-canvas chip + --theme-sidebar-border + --shadow-2, --theme-canvas-text active label on z-index:1 inner span) and connected (paper-subtle tray, --theme-paper chip + --shadow-1) variants match spec; SPRING_CONFIG on both motion.span indicators (no hardcoded stiffness/damping); count badge uses --theme-accent-surface/--theme-accent; zero hardcoded hex. No border-bottom variant exists in code or consumers — not added (would be structural). Inline // ✓ spec comments added.

## 2026-05-30 — UI: Button.tsx spec audit against design-dna.md §5.01 — border-radius corrected to --radius-sm (was --radius-md); primary gains --shadow-accent-glow rest + --shadow-accent-lift + translateY(-1px) on hover; secondary gains --shadow-1 + accent-muted border hover; ghost text colour fixed to --theme-text-primary + paper-subtle hover bg; danger/success kept soft-default (intentional drift from spec saturated default — preserves 9 existing consumers); pointer-events:none added to disabled state; whileTap stays in MotionButton per zero-bundle-cost rule.

## 2026-05-30 — UI: SearchBar default placeholder shortened to "Search"; placeholder colour wired via .eia-input class so ::placeholder resolves to --theme-text-tertiary; clear button gains hover→text-primary with var(--transition-hover).

## 2026-05-30 — Lead slug collision fix (migration 0046): generate_lead_slug now appends -2/-3 on collision; backfill re-run ordered by created_at ASC.

---

## 2026-05-30 — URL cleanup: lead slugs (migration 0045), campaign + encoding, performance ?domain= audit.

- Migration 0045: `leads.slug` column, `generate_lead_slug()` function, `trg_lead_slug` trigger, `idx_leads_slug` partial unique index; back-fills all existing rows with non-null phone. Slug format: `priya-sharma-9182`. Immutable after insert.
- `getLeadBySlug(slug)` added to `leads-service.ts`. `leads/[id]/page.tsx` tries slug first, falls back to UUID. `LeadsTable` href uses `lead.slug ?? lead.id`.
- Campaign URLs: `CampaignCard` now encodes spaces as `+` (no `encodeURIComponent`); `campaigns/[id]/page.tsx` decodes `+` back to spaces. Address bar shows `TG_House_Meta+Leads_Goa+Resort` instead of `%20`-encoded form.
- Performance page `?domain=` audit: Finding B — param is intentional for founder/admin multi-domain tab selector (`FounderDomainTabs`). Manager path never reads `?domain=`. Server validates the value against live DB before use. No code change required.

---

## 2026-05-30 — Tasks: status-change chips implemented in TaskRemarksPanel compose area — A-4 resolved.

---

## 2026-05-30 — Tasks: inline [0.16,1,0.3,1] easing replaced with EASE_OUT_EXPO across 5 components — F-1 resolved.

---

## 2026-05-30 — Tasks: Load more button rendered in PersonalTasksTab — A-1 resolved.

---

## 2026-05-30 — Tasks: currentUserName threaded GroupTasksTab → GroupRow → SubTaskModal — A-2 resolved.

---

## 2026-05-30 — Design tokens: --overlay-bg and --overlay-bg-light added; hardcoded RGBA backdrops replaced in SubTaskModal and AssigneePickerModal — B-2 + B-3 resolved.

---

## 2026-05-30 — TabSelector — `border-bottom` variant removed; `pill` is now the only default

- `src/components/ui/TabSelector.tsx` — `TabSelectorVariant` type narrowed to `'pill' | 'connected'`; all `border-bottom` conditional branches removed from `TabsList`, `TabsTrigger`, and the underline indicator block; `isBorderBottom` variable deleted; `marginBottom: 0` hardcoded (was conditional)
- `src/components/performance/FounderDomainTabs.tsx` — `variant="border-bottom"` → `variant="pill"` (domain tabs now match the Tasks page tab style)
- `src/components/CLAUDE.md` — variant list updated; component sweep table corrected

---

## 2026-05-30 — Performance page — DRY audit + alignment: 10 violations fixed across 4 files — Phase 10 hardening

- `CoreFourGrid.tsx` — inline `[0.16, 1, 0.3, 1]` → `EASE_OUT_EXPO`; `duration: 0.25` → `EXIT_DURATION`; `fontSize: "10px"` (×2) → `var(--text-2xs)`
- `EffortGrid.tsx` — same motion + font violations fixed; imports `EXIT_DURATION`, `EASE_OUT_EXPO` from `lib/constants/motion`
- `CallOutcomeBar.tsx` — same motion + font violations fixed
- `ManagerPerformancePanel.tsx` — inline `[0.16, 1, 0.3, 1]` + `duration: 0.2` → `EASE_OUT_EXPO` + `BASE_DURATION`
- No architecture (PN-001), DRY (Q-12), or P-07 violations found; `pnpm tsc --noEmit` passes clean
- `src/app/(dashboard)/performance/CLAUDE.md` — hardening log added; canonical import paths table added

---

## 2026-05-30 — Settings page — unified single-page redesign; assignment + shifts merged into one table

- `src/app/(dashboard)/settings/page.tsx` — removed tab shell and URL param logic; page now follows the standard header pattern (`h1.type-page-title` with blinking dot, `flex items-center justify-between`); fetches `getAgentRosterByDomain` directly and renders `AgentSettingsTable`
- `src/components/settings/AgentSettingsTable.tsx` — new unified `'use client'` component replacing the two-tab system; one row per agent with avatar, name, job title, domain (admin/founder only), shift start input, shift end input, computed active hours, assignment pool toggle (`Toggle`), and clear-shift button (`X` icon); domain filter pills for admin/founder when multiple domains present; `pendingIds` + `savingIds` sets prevent concurrent mutations per agent; shift save fires on `onBlur` with full validation (both required, HH:MM format, end > start); optimistic toggle with revert on error
- `src/app/(dashboard)/settings/SettingsShell.tsx` — deleted (tab shell no longer needed)
- `src/components/settings/AgentRosterTab.tsx` — deleted (merged into `AgentSettingsTable`)
- `src/components/settings/AgentShiftsTab.tsx` — deleted (merged into `AgentSettingsTable`)
- `src/app/(dashboard)/settings/CLAUDE.md` — updated to reflect single-page architecture, new component map, and column layout per role

---

## 2026-05-30 — Performance page — layout redesign: domain tabs top, period filter bar, default domain onboarding

- `src/components/performance/PerformancePeriodSelector.tsx` — replaced custom `TabSelector` pill row with `FilterDropdown` (single-select, from `src/components/ui/FilterDropdown.tsx`); wrapped in a filter bar row with `SlidersHorizontal` icon; no custom dropdown code
- `src/app/(dashboard)/performance/page.tsx` — period selector now rendered inside a leads-style filter bar card (`var(--theme-paper)`, border, `--radius-md`) for all three role views (agent, manager, founder/admin); founder/admin: filter bar sits above domain tabs
- `src/components/performance/FounderDomainTabs.tsx` — added `DOMAIN_TAB_ORDER` constant prescribing tab sequence: Onboarding → Shop → House → Legacy → Concierge → Finance → Marketing → Tech → B2B; `sortedDomains` sorts the live domain list against this order before building `TabItem[]`
- `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` — default domain changed from `domains[0]` (alphabetical fallback) to `onboarding`; gracefully falls back to first available domain if `onboarding` has no data for the selected period

---

## 2026-05-30 — Audit: Task system architecture audit complete

- `docs/task-system-audit-2026-05-30.md` — read-only verification audit of the full task system (services, actions, validations, constants, Trigger.dev, components, migrations, auth layer); `pnpm tsc --noEmit` — 0 errors; 1 Critical finding (A-4: status change chips absent from `TaskRemarksPanel`), 2 High findings (A-1: Load More button not rendered; A-2: `currentUserName` not threaded to group subtask `SubTaskModal`; B-2: hardcoded RGBA backdrop in `SubTaskModal`), and 8 Medium/Low findings; TD-001 and TD-002 confirmed open; new debt item TD-004 added (console.error in `task-reminders.ts`)

---

## 2026-05-30 — Hotfix: get_campaign_metrics 42883 after domain enum migration

- `supabase/migrations/20260530000044_fix_campaign_metrics_domain_type.sql` — `CREATE OR REPLACE FUNCTION get_campaign_metrics`: migration 0041 changed `leads.domain` from `text` to `app_domain` enum; the RPC parameter `p_domain` was still declared as `text`, causing PostgreSQL `42883` (`operator does not exist: app_domain = text`) on every `/campaigns` load — the service caught the error and silently returned `[]`, showing no campaigns. Fix: change `p_domain` parameter type to `app_domain`; `domain::text` cast added to the SELECT list to preserve the `RETURNS TABLE (domain text)` contract. Old `(text, timestamptz, timestamptz)` overload dropped to avoid ambiguity.

---

## 2026-05-30 — Hotfix: get_dashboard_summary 42883 after domain enum migration

- `supabase/migrations/20260530000043_fix_dashboard_summary_domain_type.sql` — `CREATE OR REPLACE FUNCTION get_dashboard_summary`: migration 0041 changed `leads.domain` from `text` to `app_domain` enum; the RPC parameter `p_domain` was still declared as `text`, causing PostgreSQL `42883` (`operator does not exist: app_domain = text`) on every `/dashboard` load. Fix: change `p_domain` parameter type to `app_domain`. Old `(text, text, uuid)` overload dropped to avoid ambiguity.

---

## 2026-05-30 — Hotfix: get_group_task_summaries 42883 after domain enum migration

- `supabase/migrations/20260530000042_fix_group_task_summaries_domain_type.sql` — `CREATE OR REPLACE FUNCTION get_group_task_summaries`: migration 0041 changed `task_groups.domain` from `text` to `app_domain` enum; the RPC still compared `tg.domain = get_user_domain()::text`, which resolves to `app_domain = text` — no operator exists, causing PostgreSQL `42883` for any manager loading the tasks page. Fix: remove the `::text` cast (both sides are now `app_domain`). Added `tg.domain::text` cast in the SELECT list to preserve the `RETURNS TABLE (domain text)` signature consumed by the service layer.

---

## 2026-05-30 — Performance page — roster sorted by top performer; first agent detail pre-fetched server-side (zero-flash initial load) — Phase 10 polish

- `src/lib/services/performance-service.ts` — `getAgentRosterPerformance` now sorts the result array before returning: primary `leadsWon DESC` (null→0), secondary `conversionRate DESC` (null→-Infinity so zero-closed agents sort to the bottom, never the top). Pure in-memory JS sort — zero extra DB round-trips.
- `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx` — extended to fetch `getAgentDetailMetrics(roster[0].id, …)` server-side after the roster resolves. Guard: skipped when roster is empty. `key={period}` added to `ManagerPerformancePanel` so period changes force a clean remount and never reuse stale seed data.
- `src/components/performance/ManagerPerformancePanel.tsx` — accepts `initialAgentId` and `initialDetailMetrics` props; seeds `useState(selectedId)` from `initialAgentId`; threads both props to `AgentDetailPanel` (only for the matching agent — passes `undefined` for all other agent selections).
- `src/components/performance/AgentDetailPanel.tsx` — accepts `initialData?: AgentDetailMetrics` and `initialAgentId?: string`; seeds `useState(metrics)` from `initialData`; first line of the fetch `useEffect` skips the server action when `agent.id === initialAgentId && initialData` — exact mirror of the dashboard perf-01 pattern. Refresh button remains and calls the action unconditionally.

---

## 2026-05-30 — Domain normalization: leads/task*groups/wa_logs typed as app_domain enum; TG_Global remapped to onboarding; 6 agent profiles corrected; indulge*\* values purged

- `supabase/migrations/20260530000041_normalize_lead_domain.sql` — 7-step single-transaction migration: (1) UPDATE profiles agent rows concierge→onboarding; (2) UPDATE leads for all indulge\_\*/concierge→canonical enum values; (3) UPDATE whatsapp_notification_logs.domain; (4) DO block audits both tables, RAISE WARNING + remap any unexpected value to 'onboarding'; (5) DROP all 15 RLS policies referencing leads.domain or task_groups.domain — direct (`leads_manager_select`, `leads_update`, `task_groups_select`, `task_groups_update`) or via sub-SELECT (`lead_activities_select`, `lead_notes_select`, `lead_sla_timers_agent_select`, `lead_sla_timers_manager_select`) or via `can_access_wa_conversation()` (`wa_conversations_agent_select`, `wa_conversations_manager_select`, `wa_conversations_admin_founder_select`, `wa_conversations_update`, `wa_messages_agent_select`, `wa_messages_manager_select`, `wa_messages_admin_founder_select`); (6) ALTER TABLE leads/task_groups/whatsapp_notification_logs domain TYPE app_domain; (7) RECREATE all 15 policies + CREATE OR REPLACE `can_access_wa_conversation()` — all `::text` casts on `get_user_domain()` removed since both sides are now `app_domain`
- `src/lib/constants/campaign-domain-map.ts` — already clean (TG_Global → 'onboarding', DEFAULT_LEAD_DOMAIN = 'onboarding'); no change required
- `src/components/leads/LeadInfoCard.tsx` — already imports DOMAIN_LABELS from `lib/constants/domains.ts`; no local label map; no change required
- `docs/The_Gia.md` — section 1 domain-scoping sentence updated; section 2 domain column type/comment updated; section 5 agent assignment rule updated; WhatsApp lead default domain updated from `indulge_concierge` to `onboarding`
- `docs/workflow.md` — Stage 3, 4, and 8 updated to reflect `onboarding` as the canonical default domain

---

## 2026-05-30 — Docs: task-blueprint.md full rewrite to match shipped task system

- `task-blueprint.md` — regenerated from source (2026-05-30): Suspense-split page architecture (`TasksAsync`, `WorkspaceAsync`); `get_personal_tasks` RPC-only path (TD-003 resolved); `add_task_remark_with_status` RPC (migration 0035); performance optimizations (remarks pre-fetch, lazy completed load, local prepend, hoisted assignableUsers); `TaskStatusIcon` + extended `TASK_STATUS` tokens; nurturing Gia task fix (migration 0039); resolved TD-001/TD-003; updated component map, flows, auth matrix, migration index

---

## 2026-05-30 — Leads: Inline lead reassignment on dossier page (manager/admin/founder)

- `src/components/leads/LeadInfoCard.tsx` — "Assigned to" field now renders as an inline combobox for manager/admin/founder; at rest it is visually identical to all other `InfoRow` fields (plain text, no border/box); on hover a dashed accent underline and a faint `ChevronDown` appear as an affordance; clicking opens a search-enabled dropdown anchored below the value; selecting an agent calls `assignLead`, updates the name optimistically with a `Check` tick, and closes; `canReassign?: boolean` and `agents?: Agent[]` props added; `currentAssigneeName` local state syncs optimistic update without page reload; `AssigneeCombobox` sub-component added (close on Escape + outside click, search filters agents client-side, avatar initial chip, selected state highlighted in accent)
- `src/app/(dashboard)/leads/[id]/page.tsx` — `canReassign` derived from role (`manager | admin | founder`); `getAgentsForDomain(lead.domain)` added to the existing `Promise.all` (skipped for agents — resolves to `[]`); both passed as props to `LeadInfoCard`
- `src/lib/actions/leads.ts` — no changes; existing `assignLead` action used as-is (Zod → auth → role guard → DB update + activity log + WhatsApp notifications + SLA reschedule)

---

## 2026-05-30 — Leads: Right column height aligned to left column; Team Notes + Scratchpad fill evenly

- `src/app/(dashboard)/leads/[id]/page.tsx` — right column wrapper gets `alignSelf: 'stretch'` so it matches the full height of the left column (ends where `PersonalDetailsCard` ends)
- `src/components/leads/LeadNotesInput.tsx` — `flex: 1` on card root so it fills half the right column; textarea `minHeight` set to `80px` as a floor only
- `src/components/leads/AgentScratchpad.tsx` — `flex: 1` on card root so it fills the remaining half; textarea `minHeight` reduced to `80px` as a floor, `flex: 1` does the actual growing

---

## 2026-05-30 — leads.domain normalized to app*domain enum; TG_Global remapped to onboarding; indulge*\* values purged

- Migration 0041: `UPDATE leads` to remap `concierge` → `onboarding`, `indulge_concierge` → `onboarding`, `indulge_shop` → `shop`, `indulge_legacy` → `legacy`, `indulge_house` → `house`, `indulge_b2b` → `b2b`; audit DO block guards against any remaining non-enum values; `ALTER TABLE leads ALTER COLUMN domain TYPE app_domain USING domain::app_domain`
- `src/lib/constants/campaign-domain-map.ts` — `TG_Global` remapped from `'concierge'` to `'onboarding'`; `DEFAULT_LEAD_DOMAIN` changed from `'concierge'` to `'onboarding'`; WhatsApp lead default updates automatically via this constant
- `src/components/leads/LeadInfoCard.tsx` — local `DOMAIN_LABELS` map removed; now imports shared `DOMAIN_LABELS` from `src/lib/constants/domains.ts` (single source of truth; Q-12)
- `src/lib/types/database.ts` — `Lead.domain` narrowed from `string` to `AppDomain` in the hand-written `Lead` composite type

---

## 2026-05-30 — Docs: DESIGN-DNA.md, changelog.md, The_Gia.md markdown structure fix (no data changes)

- `docs/DESIGN-DNA.md` — fixed improper markdown that broke parsers/linters: Section 2 global tokens CSS wrapped in a css code fence with `/* */` comments restored (was raw `/_` hacks); theme/section `#` headings demoted to `##` for valid hierarchy; ASCII diagrams and layout tree blocks wrapped in text fences; bare code fences tagged; markdownlint passes (0 errors); all hex values and token assignments verified unchanged
- `docs/changelog.md` — blank lines added around headings and lists (MD022/MD032); markdownlint-disable for line-length, duplicate date headings, trailing heading punctuation, and inline HTML; markdownlint passes (0 errors); no entry text changed
- `docs/The_Gia.md` — same structural pass: `###` subtitle → `##`; bare fences tagged `text`; blank lines around headings/lists; Decision Log table normalized to compact pipe style; markdownlint passes (0 errors); no spec content changed

## 2026-05-30 — Leads: LeadInfoCard inline edit, journey dwell format, Won button colour

- `src/lib/validations/lead-schema.ts` — `UpdateLeadInfoSchema` + `UpdateLeadInfoInput` added (leadId, first_name, last_name?, phone → E.164, email?; phone/email surface field-specific error messages)
- `src/lib/actions/leads.ts` — `updateLeadInfo` action: Zod → auth → access check (same gate as scratchpad) → admin UPDATE on leads (first_name, last_name, phone, email) → note_added activity log entry
- `src/components/leads/LeadInfoCard.tsx` — converted to click-to-edit pattern matching `PersonalDetailsCard`; `canEdit` prop added; active state shows inline inputs for first_name, last_name, phone, email; system fields (domain, platform, assigned_to, call_count, received) remain read-only always; accent border + shadow-focus ring when active; Save/Cancel footer; "Click any field to edit contact details." hint when idle; `EditField` inline helper added
- `src/app/(dashboard)/leads/[id]/page.tsx` — `canEdit={canEditScratchpad}` passed to `LeadInfoCard`
- `src/components/leads/LeadJourneyTimeline.tsx` — `formatDwell` now returns human-readable strings ("2 days", "3 hrs", "45 min") instead of abbreviated ("2d", "3h", "45m"); active stage shows "X days here" / "X hrs here"; sub-minute dwell returns null (not shown)
- `src/components/leads/StatusActionPanel.tsx` — Won/Level Up success variant now uses solid `--color-success` fill with `--theme-text-inverse` (white) text + green glow shadow; same fix applied to the Mark as Won confirm button (was dark-on-dark before)

## 2026-05-30 — Leads: Junk leads can now be revived back to In Discussion

- `src/components/leads/StatusActionPanel.tsx` — added `'revive'` to `ActiveModal` type; added `revive` button variant (amber/warning tokens); rendered `Revive Lead` button (Zap icon) when `status === 'junk'`; added `ConfirmModal` for revive that fires `updateLeadStatus('in_discussion')`; `ConfirmModal` now accepts `'revive'` as a third `confirmVariant`; no changes to the action or RPC layers — `updateLeadStatus` already accepts `in_discussion` as a target and SLA scheduling fires correctly on re-entry
- Full call/note/activity history is preserved on revival; the lead resumes the journey from In Discussion

## 2026-05-30 — Leads: Team Notes card added to lead dossier right column

- Migration 0040 (`supabase/migrations/20260530000040_rpc_add_lead_plain_note.sql`): `add_lead_plain_note(p_lead_id, p_author_id, p_content, p_now)` RPC — note INSERT + lead `last_activity_at` UPDATE + `note_added` activity log in one transaction; SECURITY DEFINER; GRANT EXECUTE to authenticated
- `src/lib/validations/lead-schema.ts` — `AddLeadNoteSchema` + `AddLeadNoteInput` added (leadId uuid, content 1–2000 chars, sanitized)
- `src/lib/actions/leads.ts` — `addLeadNote` action: Zod → auth → access check → `add_lead_plain_note` RPC; same access rules as scratchpad
- `src/components/leads/LeadNotesInput.tsx` — new `'use client'` card; info-toned header (`--color-info-dark-*` tokens); textarea with ⌘+Enter shortcut; Post note button with `useTransition`; `canAdd` prop (same access gate as `canEditPersonalDetails` on the dossier page); visible to all roles but editable only by assigned agent, manager, admin, founder
- `src/app/(dashboard)/leads/[id]/page.tsx` — `LeadNotesInput` wired into right column below `AgentScratchpad`; right column now a flex column with `gap-6`

---

## 2026-05-30 — Fix: nurturing auto-task creation was silently failing; `update_lead_status` RPC (migration 0039) now includes `title` (NOT NULL, was missing) and `task_category = 'gia_followup'` (was defaulting to 'personal') in the tasks INSERT

## 2026-05-30 — WA: SLA breach WhatsApp notifications wired; agent template 54d5dd55 (4 params: leadName, leadPhone, status, lastUpdatedAt), manager template 682fd320 (5 params: +agentName); fires alongside in-app notifications in fireSlaBreachHandler; agent assignment template updated to 3bcebeb0

## 2026-05-30 — WA: whatsapp_notification_logs table (migration 0038); every template notification attempt logged with status, delivery result, and 4-digit phone suffix

## 2026-05-30 — WA: founder lead notification wired (template d5828042); fires on assignLead, createManualLead, and lead ingestion webhook

## 2026-05-30 — WA: agent lead assignment notification via Gupshup template (ID: 5df612fe); hooked into assignLead, createManualLead, and lead ingestion webhook

## 2026-05-30 — WA: extract sender name from Gupshup webhook payload; pass through to lead creation

## 2026-05-30 — WA: add wa_messages_outbound_insert RLS policy; fix silent insert failure logging in sendWhatsAppMessage

## 2026-05-30 — WA webhook: replace void async IIFE with after() — fixes Vercel function termination before DB writes

## 2026-05-30 — WA: Gupshup v1 wired — x-gupshup-secret auth, dual-format inbound parser, Gupshup v1 outbound send

- `src/app/api/webhooks/whatsapp/route.ts` — auth migrated from `Authorization` header to `x-gupshup-secret` checked with `timingSafeEqual`; dual-format POST handler: Gupshup v2 (`body.type === 'message'`) and dormant Meta v3 (`body.object === 'whatsapp_business_account'`) paths; `message-event` and `billing-event` acknowledged with 200 and no processing
- `src/lib/services/whatsapp-api.ts` — `sendTextMessage` replaced with Gupshup v1 implementation (`POST https://api.gupshup.io/wa/api/v1/msg`, `apikey` header, `application/x-www-form-urlencoded`); startup guard updated to require `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`; Meta env vars (`PHONE_NUMBER_ID`, `ACCESS_TOKEN`) made optional (dormant functions retained for future use); `metaFetch` helper retained for dormant Meta functions
- `src/app/api/webhooks/CLAUDE.md` — created: Gupshup auth pattern, dual-format parser spec, outbound send spec, env var inventory

## 2026-05-30 — WA: Remove Gupshup BSP layer; revert to pure Meta Cloud API architecture

## 2026-05-30 — WA webhook: GET health / Gupshup URL verify

- `src/app/api/webhooks/whatsapp/route.ts` — non–Meta-challenge GET requests return plain `OK` (200) instead of 403; Meta `hub.mode=subscribe` challenge flow unchanged

---

## 2026-05-30 — WA webhook: Gupshup POST `Authorization` token check

- `src/app/api/webhooks/whatsapp/route.ts` — Gupshup branch validates `authorization` header against `GUPSHUP_WEBHOOK_TOKEN` before reading body; 401 plain `Unauthorized` on mismatch
- `.env.example` — `GUPSHUP_WEBHOOK_TOKEN` added

---

## 2026-05-30 — Fix: exclude `/api/webhooks` from Next.js proxy session refresh

- `src/proxy.ts` — early return for `/api/webhooks/*` before `updateSession()`; matcher negative lookahead adds `api/webhooks`; delegates session refresh to `updateSession` from `lib/supabase/middleware.ts` (removes duplicate Supabase client setup)

---

## 2026-05-30 — WA-Gupshup: Gupshup BSP adapter — inbound parser + outbound send + webhook route BSP switch — Phase WA Foundation

## 2026-05-30 — WA-UI: WhatsApp page + 6 components (shell, list, panel, bubbles, composer, empty state) — Phase WA UI

- `src/lib/actions/whatsapp.ts` — new file: `sendWhatsAppMessage`, `markConversationAsRead`, `resolveConversation`, `reopenConversation` + read-action wrappers (`getConversationsAction`, `getMessagesAction`, `searchConversationsAction`) for client-component access
- `src/components/whatsapp/EmptyConversationState.tsx` — right-panel placeholder when no conversation is selected; Framer Motion entrance; accent icon
- `src/components/whatsapp/MessageBubble.tsx` — inbound (paper-subtle) / outbound (accent-surface) bubbles; delivery status icons (sent/delivered/read/failed); media placeholder card; bot label above bot messages
- `src/components/whatsapp/ConversationRow.tsx` — list item with unread dot, lead name, phone, relative timestamp, resolved badge; active left-border accent state
- `src/components/whatsapp/ConversationList.tsx` — left panel body; `SearchBar` + 300ms debounced `searchConversationsAction`; IntersectionObserver-based load-more (P-05); end-state copy "That's everything."
- `src/components/whatsapp/ConversationPanel.tsx` — three-zone layout (header / message list / composer); Realtime subscription on `whatsapp_messages` with `useId()+mountId` channel name (StrictMode-safe); optimistic send + echo dedup via `seenIds` ref; date-group separators; delivery status Realtime UPDATE handler; Resolve/Reopen buttons (manager/admin/founder only); resolved banner replaces composer; character count warning at 3000+
- `src/components/whatsapp/WhatsAppShell.tsx` — two-panel shell; Realtime on `whatsapp_conversations` (INSERT → prepend, UPDATE → re-sort); cursor-based pagination via `getConversationsAction`; unread badge in left header
- `src/app/(dashboard)/whatsapp/page.tsx` — Server Component; fetches initial conversations + unread count in `Promise.all`; passes `callerProfile` to shell
- `src/app/(dashboard)/whatsapp/loading.tsx` — two-panel skeleton matching shell layout; uses `.skeleton` CSS class
- `src/components/layout/Sidebar.tsx` — WhatsApp nav item added (`MessageCircle` icon, `/whatsapp` href); positioned between Tasks and Performance

---

## 2026-05-30 — Performance page — remove period label above page title

- `src/app/(dashboard)/performance/page.tsx` — removed uppercase period label (`This Week`, etc.) above `<h1>` on agent, manager, and founder/admin views; period filter remains in `PerformancePeriodSelector` tabs

---

## 2026-05-30 — WA-4b: get_wa_unread_count RPC migration + getUnreadCount() wired to RPC

- Migration 0036: `get_wa_unread_count()` RPC — per-agent unread WhatsApp conversation count; LEFT JOIN `whatsapp_conversation_reads` on `agent_id = auth.uid()`; counts open conversations where `last_read_at IS NULL OR last_message_at > last_read_at`; gated by `can_access_wa_conversation()`; RETURNS integer; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated
- `src/lib/services/whatsapp-service.ts` — `getUnreadCount()` replaced approximation COUNT query with `supabase.rpc('get_wa_unread_count')`; approximation comment removed
- `supabase/migrations/CLAUDE.md` — migration 0036 added to inventory
- `src/lib/CLAUDE.md` — `getUnreadCount` entry updated to reflect RPC

---

## 2026-05-30 — Fix: restore named type aliases in database.ts after Supabase CLI regen (WA-4)

Supabase CLI regenerated `src/lib/types/database.ts`, stripping all hand-written named type aliases and causing 188 TypeScript errors across 78 files. Fixed by appending a "Derived type aliases" section to `database.ts` only — no other files modified.

- **Enum types** extracted from `Database['public']['Enums']`: `UserRole`, `AppDomain`
- **String unions** hand-written: `LeadStatus`, `CallOutcome`, `LeadPlatform`, `TaskType`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `NotificationType` (includes `sla_breach_agent`, `sla_breach_manager`)
- **Row types** via indexed access with narrowing overrides: `Profile` (theme literal), `LeadNote` (call_outcome narrowed to `CallOutcome | null`), `LeadRawPayload` (payload widened to `Record<string, unknown>`), `Task` (status/priority/category/type narrowed, attachments typed as `ChecklistItem[]`), `Lead` (status/outcome/platform/form_data narrowed), `Notification` (type narrowed to `NotificationType`)
- **Generated block patches**: `notifications.Row/Insert/Update.type` narrowed to `NotificationType`; `lead_raw_payloads.Insert/Update.payload` widened to accept `Record<string, unknown>`; `tasks.Row.attachments` widened to `Json | ChecklistItem[]` (enables `as Task` cast in leads-service without touching that file)
- **Hand-written composites**: `ChecklistItem`, `ProfileAuditLog`, `AgentRoutingConfig`, `AgentRosterRow`, `TaskMessage`, `LeadFilters`, `CampaignFilters`, `CampaignMetrics`, `CampaignDetailMetrics`, `AgentDistributionRow`
- `pnpm tsc --noEmit --skipLibCheck` → zero errors

---

## 2026-05-30 — Performance page — manager & founder views (agent roster panel, detail panel, founder domain tabs) — Phase 10

- `src/lib/services/performance-service.ts` — `getAgentRosterPerformance(domain, dateFrom, dateTo)`: 3 flat queries, JS aggregation, `AgentRosterRow[]` with null-guarded conversionRate and totalDealAmount; `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)`: single Promise.all of 5 queries, callsToday uses IST midnight boundary via existing getPeriodDateRange helper; `getDomainsWithLeads(dateFrom, dateTo)`: single DISTINCT query for founder tab rendering
- `src/lib/types/index.ts` — `AgentRosterRow`, `AgentDetailMetrics` types added
- `src/lib/actions/performance.ts` — `getAgentDetailMetricsAction`: Zod + auth + manager-domain guard; agentId must belong to caller's domain (manager) or any domain (founder/admin)
- `src/app/(dashboard)/performance/page.tsx` — agent-only redirect removed; role branching: agent → existing PerformanceAsync (unchanged), manager → ManagerPerformanceAsync, founder/admin → FounderPerformanceShell, guest → /dashboard; manager domain always from profile.domain, never URL
- `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx` — async server component; Suspense child; Promise.all([getAgentRosterPerformance, periodDates]); passes agentRoster to ManagerPerformancePanel
- `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` — server component; fetches getDomainsWithLeads; reads domain from searchParams (defaults to first); renders FounderDomainTabs + ManagerPerformanceAsync — zero layout duplication
- `src/app/(dashboard)/performance/ManagerPerformanceSkeleton.tsx` — two-column; left: 4 agent card skeletons staggered 0/80/160/240ms §11.4; right: header + stat strip + two bar skeletons
- `src/components/performance/ManagerPerformancePanel.tsx` — 'use client'; two-column layout; agent roster left (Avatar lg, name, conversion rate pill colour-coded success/warning/danger); selected state: var(--theme-accent) 3px left border + var(--theme-paper-subtle) bg; Framer Motion layoutId on selection indicator; first agent pre-selected on mount
- `src/components/performance/AgentDetailPanel.tsx` — 'use client'; fetches via getAgentDetailMetricsAction on agentId change with useTransition; header: Avatar xl + Playfair Display name + domain badge; Bloomberg-style 5-col stat strip (Calls Today · New Leads · Follow-ups · Won · Revenue) with var(--theme-paper-border) vertical dividers; deal type breakdown as horizontal pills (var(--theme-paper-subtle) bg, --radius-full); pipeline status bar reusing CallOutcomeBar with status colours §16.4; call outcome bar reusing CallOutcomeBar; AnimatePresence + key={agentId} dissolve on agent switch, var(--duration-200)
- `src/components/performance/FounderDomainTabs.tsx` — 'use client'; thin TabSelector wrapper; useTransition on all pushes; domain labels from DOMAINS constant; pushes ?domain=X to URL
- `src/app/(dashboard)/performance/CLAUDE.md` — updated: ManagerPerformanceAsync, FounderPerformanceShell, FounderDomainTabs, AgentRosterRow, AgentDetailMetrics, domain-from-profile rule (manager) vs domain-from-URL rule (founder), callsToday IST contract

---

## 2026-05-30 — Perf: addTaskRemarkAction RPC — 6 sequential awaits → 1 round-trip — Phase 2

The most common power-user interaction (status change + remark) previously serialised 6 DB round-trips: two `getCurrentProfile()` calls, two `tasks SELECT` calls, one `tasks UPDATE`, one `task_remarks INSERT`. Under ~200ms of compounded latency.

**Fix:** new `add_task_remark_with_status` RPC (migration 0035, SECURITY DEFINER). The RPC performs an inline auth check via `auth.uid()`, conditionally updates `tasks.status` (which still fires the `log_task_changes()` audit trigger), and inserts the `task_remarks` row — all in one transaction. `addTaskRemarkAction` now calls this RPC via `adminClient.rpc(...)` and returns the full remark row. `updateTaskStatusAction` is unchanged and still used for remark-free status changes.

- `supabase/migrations/20260530000035_rpc_add_task_remark_with_status.sql` — new RPC; RETURNS `task_remarks`; SECURITY DEFINER; GRANT EXECUTE to authenticated
- `src/lib/actions/tasks.ts` — `addTaskRemarkAction` rewritten to call RPC; 6 sequential awaits replaced with 1 `.rpc()` call; error mapping for `task_not_found` and `unauthorized` exception codes
- `supabase/migrations/CLAUDE.md` — migration 0035 added to inventory
- `src/lib/CLAUDE.md` — `addTaskRemarkAction` pattern note updated with RPC details

---

## 2026-05-30 — Perf: initialRemarks threaded into TaskRemarksPanel — mount POST eliminated

Every `SubTaskModal` open previously triggered a `getTaskRemarksAction` POST inside a `TaskRemarksPanel` mount `useEffect`, causing a blank timeline until the response arrived.

**Pattern change:** call sites (`PersonalTasksTab`, `GroupTasksTab`, `GroupTaskWorkspace`) now call `getTaskRemarksAction(taskId)` at row-click time, store the result in `selectedTaskRemarks` state (`null` while in-flight), and gate the `<AnimatePresence>` render on `selectedTaskRemarks !== null`. The modal only mounts once remarks are available. `TaskRemarksPanel` seeds its `remarks` state directly from `initialRemarks` and re-seeds on `taskId` change via `useEffect`. The mount `useEffect` fetch is removed entirely. Realtime subscription and `seenIds` deduplication are unchanged.

- `src/components/tasks/TaskRemarksPanel.tsx` — `initialRemarks: TaskRemarkWithAuthor[]` restored to props; state seeded from prop; mount fetch `useEffect` removed; `seenIds` seeded from `initialRemarks` on `taskId` change
- `src/components/tasks/SubTaskModal.tsx` — `initialRemarks: TaskRemarkWithAuthor[]` added to `SubTaskModalProps`; passed through to `TaskRemarksPanel`
- `src/components/tasks/PersonalTasksTab.tsx` — `selectedTaskRemarks` state added; `handleRowClick` fires `getTaskRemarksAction` before setting `taskModalOpen`; modal gated on `selectedTaskRemarks !== null`; cleared on close
- `src/components/tasks/GroupTaskWorkspace.tsx` — same pattern as `PersonalTasksTab`; `handleOpenModal` fires `getTaskRemarksAction`; `handleModalClose` clears remarks
- `src/components/tasks/GroupTasksTab.tsx` — same pattern; `handleOpenSubtask` helper added

**Pre-mortem addressed:** `selectedTaskRemarks === null` acts as a skeleton gate — modal never mounts with stale or missing data. Re-open of the same task re-fetches (stale `initialRemarks` is worse than a brief gate). The one extra round-trip on click is better than the current post-paint blank timeline.

---

## 2026-05-30 — Perf: auth + task fetch parallelised in 4 task mutation actions

`updateTaskStatusAction`, `updateTaskAction`, `updateChecklistAction`, and `updateTaskTagsAction` in `src/lib/actions/tasks.ts` each previously issued `getCurrentProfile()` then a tasks SELECT sequentially. The two are fully independent (profiles table vs tasks table). All four actions now run them via `Promise.all`, saving one network round-trip on every task mutation.

- `canMutateTask` signature and return type unchanged — it receives a pre-fetched task as before
- `getTaskById` not used here (it now returns remarks too after 2-A fix); each action retains its own lean SELECT with only the columns it needs
- Step 3 (group domain check inside `canMutateTask`) remains sequential — it depends on `task.group_id` from the task fetch
- `pnpm tsc --noEmit` passes with zero new errors

---

## 2026-05-30 — Perf: getTaskById parallelised — task fetch + remarks fetch now concurrent

`getTaskById` in `src/lib/services/tasks-service.ts` previously issued 3 sequential DB round-trips (task SELECT, then remarks SELECT, then profiles batch). The task SELECT and the `getTaskRemarks` call are fully independent — neither result depends on the other. They now run via `Promise.all`, reducing wall-clock latency for task modal open by one network round-trip.

- `getTaskRemarks` internals unchanged (profiles batch remains sequential inside; separate optimisation)
- `getGroupSubtasks` profiles batch not parallelised — it is correctly sequential (batch needs assignee ids derived from the subtasks result)
- `pnpm tsc --noEmit` passes with zero errors

---

## 2026-05-30 — Refactor: TaskStatusIcon + canonical TASK_STATUS colour tokens

Deduplicated task status icons and colour maps across the tasks UI:

- `src/components/tasks/TaskStatusIcon.tsx` — single Lucide switch for all six `TaskStatus` values; colour from `TASK_STATUS[status].color`
- `src/lib/constants/task-constants.ts` — `TASK_STATUS` extended with `pillBg`/`pillText` (solid pills) and `remarkBg`/`remarkColor`/`remarkBorder` (light remark chips); all values CSS variables, no hex
- Removed local `STATUS_CONFIG`, `STATUS_CHIP_COLORS`, `STATUS_ICONS`, and inline `StatusIcon` from `GroupTasksTab`, `GroupTaskWorkspace`, `SubTaskModal`, `TaskRemarksPanel`
- `src/components/CLAUDE.md` — documents `TaskStatusIcon` as the canonical status icon

---

## 2026-05-30 — WA-3: whatsapp-api.ts + whatsapp-ingestion.ts + whatsapp-service.ts — Phase WA Foundation

- `src/lib/services/lead-ingestion.ts` — `createLeadFromWhatsApp(waId, phone)` added: inserts lead with `platform='whatsapp'`, domain=concierge, round-robin assignment, logs `lead_created` + `agent_assigned` activities
- `src/lib/services/whatsapp-api.ts` — Meta Cloud API HTTP client: `sendTextMessage`, `sendTemplateMessage`, `sendMediaMessage`, `uploadMedia`, `getMediaDownloadUrl`, `verifyMetaSignature` (HMAC-SHA256 + `timingSafeEqual`); module-load env var guard; SERVER ONLY
- `src/lib/services/whatsapp-ingestion.ts` — Inbound pipeline: `parseWebhookPayload`, `processInboundMessage` (9-step, idempotent), `processStatusUpdate` (adminClient delivery receipt), `resolveLeadByPhone`, `getOrCreateConversation` (race-safe ON CONFLICT), `insertInboundMessage`; SERVER ONLY
- `src/lib/services/whatsapp-service.ts` — UI queries: `getConversations`, `getConversation`, `getMessages`, `getUnreadCount`, `markConversationRead`, `searchConversations`; session client, RLS enforced
- `src/lib/CLAUDE.md` — service registry updated with all four service files

---

## 2026-05-30 — WA-2: WhatsApp types, constants, Zod schemas — Phase WA Foundation

- `src/lib/types/whatsapp.ts` — Meta Cloud API payload shapes (discriminated union on `MetaInboundMessage.type`, `MetaStatusUpdate`, `MetaApiResponse`, `TemplateComponent`) + app-internal types (`WhatsAppConversation`, `WhatsAppMessage`, `SendMessageInput`)
- `src/lib/constants/whatsapp.ts` — `WHATSAPP_API_VERSION`, `WHATSAPP_API_BASE`, message types, status/direction/sender-type vocabularies, notification template names, page sizes. No secret env vars.
- `src/lib/validations/whatsapp-schema.ts` — `MetaWebhookPayloadSchema` (permissive passthrough), `MetaStatusUpdateSchema`, `SendMessageSchema` (uuid + 1–4096 chars), `ResolveConversationSchema`; all with human-readable errors
- `src/lib/CLAUDE.md` — types, validations, and whatsapp constants registry entries added

---

## 2026-05-30 — WA-1: whatsapp_conversations + whatsapp_messages + whatsapp_conversation_reads migrations — Phase WA Foundation

Three migrations establishing the WhatsApp data layer:

- Migration 0032 (`whatsapp_conversations`): one row per lead/phone; `wa_id` (E.164 without +) and `lead_id` both UNIQUE; `bot_active/bot_paused_by/bot_paused_at` columns for AI chatbot toggle; `can_access_wa_conversation()` SECURITY DEFINER helper; RLS mirrors leads table exactly; Realtime enabled
- Migration 0033 (`whatsapp_messages`): append-only with one narrow exception — delivery receipt status updates (`status`, `status_at`) via service-role client; `wa_message_id` partial unique index (WHERE NOT NULL) to allow optimistic NULL rows; same RLS domain-scoping; no DELETE policy; Realtime enabled
- Migration 0034 (`whatsapp_conversation_reads`): per-agent read position for unread badge counts; UNIQUE(conversation_id, agent_id); agents read/write own rows only

---

## 2026-05-30 — Fix: replace GroupRow setSubtasksLoaded refetch with local append after subtask creation

---

## 2026-05-30 — Fix: hoist assignableUsers fetch from GroupRow to GroupTasksTab — single DB call for all groups

---

## 2026-05-30 — Fix: eliminate PersonalTasksTab mount re-fetch and quick-add full-reload — Phase 2

---

## 2026-05-30 — Fix: task remarks not stored / double message / "Unknown" author

Three bugs in the messaging system, all fixed together:

**Root causes:**

1. `TaskRemarksPanel` seeded `remarks` state from `initialRemarks` prop at mount. Since all call sites passed `initialRemarks={[]}`, the panel always opened empty — even though messages were in the DB.
2. On send, the panel waited for a Realtime echo to confirm the optimistic row. If the echo arrived but `incoming.author_id !== currentUserId` (e.g. stale closure), the optimistic row was never replaced — a second "Unknown" row was appended instead.
3. The optimistic row stayed half-opacity forever when the Realtime echo was the only confirmation path.

**Fix:**

- `TaskRemarksPanel` is now self-sufficient: fetches its own remarks from DB on mount via `getTaskRemarksAction`. The `initialRemarks` prop is removed entirely — no parent needs to pre-load remarks.
- On action success, `result.data` (the confirmed DB row) immediately replaces the optimistic row. Realtime echo then hits `seenIds` and is dropped. No double-append possible.
- Added `isLoading` state with "Loading…" empty state during the initial fetch.
- Removed `initialRemarks` from `SubTaskModalProps`, `GroupTaskWorkspace`, `PersonalTasksTab`, `GroupTasksTab` call sites.
- Added `getTaskRemarksAction` to `src/lib/actions/tasks.ts` (auth-gated server action wrapping `getTaskRemarks`).

---

## 2026-05-29 — Eliminated sequential DB round-trips in addLeadCallNote and updateLeadStatus (Phase perf-02)

`addLeadCallNote`: 9 sequential DB awaits (note insert + lead UPDATE + 3 activity inserts + second lead UPDATE + auth/access reads) collapsed to 1 RPC call.
`updateLeadStatus`: 5 sequential DB awaits (lead UPDATE + activity insert + nurturing task + task_gia_meta + optional won query) collapsed to 1 RPC call.
`assignLead`: post-update SELECT eliminated — lead status/domain now read before the UPDATE.
`getCallerProfile` local duplicate removed — replaced with `getCurrentProfile` import from `profiles-service.ts` (TD-001 resolved).

**Migrations:**

- `supabase/migrations/20260529000030_rpc_add_lead_call_note.sql` — `add_lead_call_note(p_lead_id, p_author_id, p_content, p_call_outcome, p_now)` RPC; SECURITY DEFINER; single transaction: note insert + lead UPDATE (call_count, last_call_outcome, last_activity_at, conditional status+status_changed_at) + call_logged activity + note_added activity + conditional status_changed activity (new→touched only); returns jsonb with `note_id`, `new_call_count`, `did_auto_advance`, `assigned_to`, `domain`, `old_status`
- `supabase/migrations/20260529000031_rpc_update_lead_status.sql` — `update_lead_status(p_lead_id, p_actor_id, p_status, p_reason, p_now)` RPC; SECURITY DEFINER; single transaction: early-return `{ changed: false }` when status unchanged; lead UPDATE + status_changed activity + conditional nurturing task + task_gia_meta; returns jsonb with `changed`, `old_status`, `new_status`, `assigned_to`, `domain`, `first_name`, `last_name`

**Action layer (`src/lib/actions/leads.ts`):**

- `addLeadCallNote` — steps 4–9 replaced with single `admin.rpc('add_lead_call_note', ...)` call; SLA side-effects remain fire-and-forget in action layer
- `updateLeadStatus` — steps 4–7 replaced with single `admin.rpc('update_lead_status', ...)` call; won notifications and SLA side-effects remain in action layer
- `assignLead` — added pre-update `SELECT status, domain` before the UPDATE; removed post-update SELECT entirely (zero post-update round-trips)
- `getCallerProfile` local function removed; all actions now use `getCurrentProfile` from `@/lib/services/profiles-service` (TD-001 resolved)

---

## 2026-05-29 — Dashboard waterfall eliminated — RSC consolidation + single cached RPC (Phase perf-01)

5 individual client-initiated server action calls on dashboard mount replaced with one cached RSC fetch.
GET /dashboard now delivers widgets with data on first paint — zero POST calls on initial load.

**Migration:**

- `supabase/migrations/20260529000029_get_dashboard_summary.sql` — `get_dashboard_summary(p_role, p_domain, p_user_id)` RPC; SECURITY DEFINER; single jsonb response with 4 keys: `agent_tasks`, `agent_activity`, `lead_status`, `campaigns`; role-based filtering inside CTEs mirrors exact service function logic; all COUNT fields cast `::int`; GRANT EXECUTE to authenticated

**New type:**

- `src/lib/types/index.ts` — `DashboardSummary` + 7 constituent types (`DashboardAgentTask`, `DashboardAgentTasksSummary`, `DashboardAgentActivity`, `DashboardLeadStatusCount`, `DashboardAgentStatusBreakdown`, `DashboardLeadStatusSummary`, `DashboardCampaignStatusMix`); shape exactly matches RPC jsonb output

**Service:**

- `src/lib/services/dashboard-service.ts` — `getDashboardSummary(role, domain, userId)` with React `cache()` (per-request memoisation); `unstable_cache` cannot be used here — `createClient()` calls `cookies()` which Next.js forbids inside `unstable_cache` closures; React `cache()` deduplicates within a single RSC render pass

**Page (RSC):**

- `src/app/(dashboard)/dashboard/page.tsx` — calls `getDashboardSummary()` once after `getCurrentProfile()`; passes result as `initialData` to `DashboardCanvas`

**Widget layer:**

- `WidgetProps` extended with `initialData?: DashboardSummary` (in `DashboardWidgetSlot.tsx`)
- `DashboardCanvas` threads `initialData` through `SortableWidget` → `DashboardWidgetSlot` → widget component
- `AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` — skip mount fetch when `initialData` present; seed state directly; refresh buttons remain for user-initiated refetch
- `ManagerLeadVolumeWidget` — unchanged; period selector requires interactive fetch; no initial data seeding (volume data intentionally excluded from RPC — too period-dependent)
- All widgets now type-import from `@/lib/types` (Dashboard\* types); old service-layer types remain for refresh actions

**Invariants:**

- `getDashboardSummary` uses React `cache()` — deduplicated per request, per argument tuple (role+domain+userId); different users always get separate memoised results within their own request
- `ManagerLeadVolumeWidget` is the only widget that fires a server action on initial render
- Refresh buttons on `AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` still call individual server actions (targeted, user-initiated only)

---

## 2026-05-29 — Settings page: Agent Roster + Shifts

New `/settings` route for manager/admin/founder — lead assignment configuration surface.

**No migration required.** `shift_start` and `shift_end` columns already existed on `agent_routing_config` (confirmed present in type definition).

**New type:**

- `src/lib/types/database.ts` — `AgentRosterRow` type: joined profile + routing config row returned by `getAgentRosterByDomain`

**Service extension:**

- `src/lib/services/agent-routing-service.ts` — `getAgentRosterByDomain(domain | '*')`: joins `profiles + agent_routing_config!inner`, adminClient, returns `AgentRosterRow[]`, ORDER BY domain ASC / full_name ASC
- `src/lib/services/agent-routing-service.ts` — `setAgentShift(agentId, shiftStart, shiftEnd)`: adminClient UPDATE on `agent_routing_config`

**Validation:**

- `src/lib/validations/agent-routing-schema.ts` — `SetAgentShiftSchema`: agentId uuid, shiftStart/shiftEnd regex `/^([01]\d|2[0-3]):([0-5]\d)$/` nullable, cross-field refine (end > start)

**Action extension:**

- `src/lib/actions/agent-routing.ts` — `setAgentShiftAction`: Zod → auth → manager domain check (getProfileById) → setAgentShift; revalidates `/settings`
- `src/lib/actions/agent-routing.ts` — `toggleAgentRouting`: now also revalidates `/settings` (added alongside admin/users revalidation)

**Page:**

- `src/app/(dashboard)/settings/page.tsx` — server component; agent/guest → redirect `/dashboard`; fetches `getAgentRosterByDomain`; page h1 with `page-title-dot`
- `src/app/(dashboard)/settings/SettingsShell.tsx` — `'use client'`; URL-param tab state (`?tab=roster|shifts`); `useTransition` + `router.replace`; renders `AgentRosterTab` or `AgentShiftsTab`

**Tab components:**

- `src/components/settings/AgentRosterTab.tsx` — agent card grid; domain filter pill bar (admin/founder only); `Toggle` for routing pool; optimistic update + toast.danger on error; `pendingIds` disable in-flight cards
- `src/components/settings/AgentShiftsTab.tsx` — table layout; `<input type="time">` for shift windows; blur-to-save when both fields valid; inline error for end≤start; inline hint when only one field filled; Clear button; `setAgentShiftAction`; `computeActiveHours` display

**Sidebar:**

- `src/components/layout/Sidebar.tsx` — "Settings" nav item (`Settings` lucide icon, `/settings`), visible to manager/admin/founder; under new "Configuration" section label

**CLAUDE.md updates:**

- `src/app/(dashboard)/settings/CLAUDE.md` — created
- `src/lib/CLAUDE.md` — services registry + actions registry updated

---

## 2026-05-29 — Gia SLA Engine (Phase 9)

Event-driven SLA enforcement for the Gia lead module. 8 SLA rules, IST business-hours math, auto-task creation on breach, two new notification types.

**Migrations:**

- `supabase/migrations/20260529000027_lead_sla_columns.sql` — adds `status_changed_at` + `last_activity_at` columns to `leads` (backfilled from `created_at`); extends `notifications` type CHECK to include `sla_breach_agent` + `sla_breach_manager`; documents `sla_breach` as valid `lead_activities.action_type`
- `supabase/migrations/20260529000028_lead_sla_timers.sql` — `lead_sla_timers` table with `lead_id`, `rule_code`, `scheduled_fire_at`, `trigger_run_id`, `status`, `fired_at`, `cancelled_at`; RLS scoped by role; no INSERT/UPDATE/DELETE policy for regular users — service role only; partial index on `status = 'pending'`

**Constants + utils:**

- `src/lib/constants/sla.ts` — `BUSINESS_HOURS` (IST, Mon–Sat, 09:00–19:00); `SLA_RULES` typed map of all 8 rule codes → config (statusTrigger, businessMinutes, recipient); `SLA_AUTO_TASK_TITLES` for agent rules; `getRulesForStatus()`, `getActivityRefreshRules()` helpers
- `src/lib/utils/sla.ts` — `nextBusinessDeadline(from, businessMinutes)`, `isWithinBusinessHours(ts)`, `businessMinutesBetween(start, end)`; all math anchored in Asia/Kolkata (IST)

**SLA rules:**

- `SLA-01A/B`: New lead — 15min (agent) / 30min (manager)
- `SLA-02A/B`: Touched lead — 1440min/24h (agent) / 2160min/36h (manager)
- `SLA-03A/B`: In-discussion lead — 1440min/24h (agent) / 2160min/36h (manager)
- `SLA-04A/B`: Active/nurturing lead — 5760min/4 biz-days (agent + manager)

**Types:**

- `src/lib/types/database.ts` — `SlaTimerStatus`, `LeadSlaTimer` types; `lead_sla_timers` Database table entry; `NotificationType` extended with `sla_breach_agent` + `sla_breach_manager`; `Lead` extended with `status_changed_at` + `last_activity_at`

**Trigger.dev:**

- `src/trigger/lead-sla.ts` — `fireLeadSlaTask` (Trigger.dev task; stale-fire guard; calls `fireSlaBreachAction`); `scheduleLeadSlasTask` (delayed job with idempotency key `lead-sla-${leadId}-${ruleCode}`, tag `lead-sla-${leadId}`); `cancelLeadSlasByLeadTask` (tag-based batch cancel)

**Service:**

- `src/lib/services/sla-service.ts` — `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain`

**Actions:**

- `src/lib/actions/sla.ts` — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` (Zod-validated Trigger.dev callback), `fireSlaBreachHandler` (8-step breach logic: stale-fire guard → call_count guard → recipient resolution → notification → auto-task dedup → activity log → timer mark fired)

**Hook points in `leads.ts`:**

- `assignLead` + `createManualLead` — after assignment: update `status_changed_at` + `last_activity_at`, schedule SLA-01 timers
- `updateLeadStatus` — after status write: update `status_changed_at`; terminal → cancel only; non-terminal → cancel + reschedule
- `addLeadCallNote` — after note write: update `last_activity_at`; auto-advanced new→touched → full SLA reset; else → refresh SLA-02/03 only

**UI:**

- `src/components/notifications/NotificationItem.tsx` — exhaustive switch extended: `sla_breach_agent` → `AlertTriangle` + `--color-warning-text`; `sla_breach_manager` → `AlertTriangle` + `--color-danger-text`

---

## 2026-05-29 — Group workspace page: Suspense streaming + WorkspaceSkeleton — perf

- `src/app/(dashboard)/tasks/[id]/page.tsx` — stripped to thin orchestrator; zero data-fetching; back link rendered immediately outside Suspense boundary
- `src/app/(dashboard)/tasks/[id]/WorkspaceAsync.tsx` — new async server component; `Promise.all([getTaskGroupById, getGroupSubtasks])`; null-group redirect lives here (not in page); passes serialisable plain objects to `GroupTaskWorkspace`
- `src/app/(dashboard)/tasks/[id]/WorkspaceSkeleton.tsx` — group header + view-toggle + 5 subtask row skeletons; stagger 0/80/160/240/320ms; `var(--theme-paper-subtle)` shimmer

---

## 2026-05-29 — Task system: getPersonalTasks unified onto single RPC (TD-003 resolved — priority sort consistent across all pages) — perf

- `supabase/migrations/20260529000026_get_personal_tasks_cursor.sql` — extends `get_personal_tasks` RPC with three cursor params (`p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at`); 4-case WHEN cursor WHERE clause handles all keyset pagination scenarios; sort order (`due_at ASC NULLS LAST → priority CASE → id ASC`) now identical on every page; drops old 6-param overload first to avoid creating a second overload
- `src/lib/services/tasks-service.ts` — split-path logic removed entirely; single unified RPC call path for both page 1 and pages 2+; no PostgREST query chain; no JS sort

---

## 2026-05-29 — Task system: DB index repair + query optimisation + Suspense streaming — Perf

Two-prompt performance hardening pass across the full task system stack.

### Prompt 1 — DB index repair + service query optimisation

- `supabase/migrations/20260529000025_task_performance_indexes.sql` — dropped and replaced `idx_tasks_assigned_to` and `idx_tasks_module` (both had `WHERE status = 'pending'` — invalid since migration 0017; fully inert); new conditions use `WHERE status NOT IN ('completed','cancelled','error')`; added `idx_tasks_agent_active` composite `(assigned_to, task_category, due_at ASC NULLS LAST)` covering the most frequent agent read; added `idx_tasks_tags_active` covering index `(assigned_to) INCLUDE (tags)` scoped to active personal tasks only; added `get_personal_tasks` RPC sorting `due_at ASC NULLS LAST → priority CASE (urgent=1,high=2,normal=3) → id ASC` at DB level (PostgREST cannot express `ORDER BY CASE`)
- `src/lib/services/tasks-service.ts` — `getPersonalTasks` JS `.sort()` removed; no-cursor path now calls `get_personal_tasks` RPC; cursor path retains PostgREST query; `getPersonalTaskTags` scoped to active tasks only (`.not('status','in','("completed","cancelled","error")')`); `getGroupTasks` wrapped in `unstable_cache` (60s TTL, cache tag `'group-tasks'`, domain in cache key — prevents cross-domain cache bleed)
- `src/lib/actions/tasks.ts` — `revalidateTag('group-tasks', { expire: 0 })` added to `createGroupTaskAction` and `createSubtaskAction` post-insert

### Prompt 2 — Tasks page Suspense streaming + deferred completed tasks

- `src/app/(dashboard)/tasks/page.tsx` — restructured as thin orchestrator; zero data-fetching in page body; `<Suspense fallback={<TasksSkeleton tab={tab}>}><TasksAsync /></Suspense>`
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — new async server component; direct `<Suspense>` child; fetches active tab data only; passes serialisable plain objects to `TasksShell`
- `src/app/(dashboard)/tasks/TasksSkeleton.tsx` — two variants (personal: 3 priority headers + 5 rows each; group: 4 group cards); stagger 0/80/160/240/320ms per §11.4; `var(--theme-paper-subtle)` shimmer — zero hardcoded colour
- `src/components/tasks/PersonalTasksTab.tsx` — completed tasks no longer fetched on mount; `hasLoadedCompleted` ref set before action call fires (prevents double-fetch on rapid accordion toggle); loads lazily on first completed section expand only

---

## 2026-05-29 — Earth canvas: grain texture + radial washes

Earth canvas: grain texture + espresso/olive/umber radial washes. Base `#0d0c0a`. `.layout-canvas` class introduced.

- `src/styles/design-tokens.css` — `--theme-canvas` and `--theme-sidebar-bg` updated to `#0d0c0a` in `:root` and `[data-theme="earth"]`; Earth-specific `--theme-canvas-grain-opacity` and `--theme-canvas-gradient-*` tokens added (other themes omit these → flat canvas)
- `src/app/globals.css` — `html`/`body` base colour `#0d0c0a` to prevent load flash; `.layout-canvas` class with grain SVG data URI + theme-scoped gradient layers
- `src/app/(dashboard)/layout.tsx` — inline canvas background migrated to `.layout-canvas min-h-screen`
- `CLAUDE.md` + `.cursorrules` — File Locations, Theme Quick Reference, and Earth canvas enhancement phase entry
- `docs/design-dna.md` — Earth token map, §3.1 shell diagram, §3.5 canvas texture, §6.6 texture spec updated to `.layout-canvas`

---

## 2026-05-29 — Page title dot: blinking accent period on all primary nav pages

Introduced `eia-page-dot-blink` keyframe and `.page-title-dot` utility class as the standard for all primary navigation page titles. All existing pages retrofitted. Rule codified in CLAUDE.md, .cursorrules, and design-tokens.css.

- `src/styles/design-tokens.css` — `@keyframes eia-page-dot-blink` (2.4s ease-in-out, opacity 1 → 0.2 → 1); `.page-title-dot { color: var(--theme-accent); animation: eia-page-dot-blink 2.4s ease-in-out infinite; }`; `.type-page-title` comment updated to reference dot requirement
- `src/app/(dashboard)/tasks/page.tsx` — existing inline dot replaced with `type-page-title` + `page-title-dot` classes
- `src/app/(dashboard)/leads/page.tsx` — dot added
- `src/app/(dashboard)/performance/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/campaigns/page.tsx` — dot added
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/profile/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/error-log/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/admin/users/page.tsx` — page-level `<h1>` added (previously absent); dot added; Add Member button moved to page header row
- `CLAUDE.md` + `.cursorrules` — "Page title dot" rule added to Component Quick Reference

**Rule:** Every primary navigation page `<h1>` ends with `<span className="page-title-dot">.</span>`. Use `className="type-page-title"` on the `<h1>`. Detail pages with back links (leads/[id], campaigns/[id], admin/users/[id]) are exempt.

---

## 2026-05-29 — TabSelector pill: dark canvas chip fill

Visual upgrade — zero structural changes. Active tab now renders as a dark canvas chip on the light tray, matching the sidebar/canvas aesthetic. All five themes correct — both `--theme-canvas` and `--theme-canvas-text` are theme-scoped tokens.

- `src/components/ui/TabSelector.tsx` — pill `motion.span`: `background` changed from `--theme-accent-surface` to `--theme-canvas`; `border` changed from `--theme-paper-border` to `--theme-sidebar-border`; `box-shadow` upgraded from `--shadow-1` to `--shadow-2`. Active text: changed from `--theme-accent` to `--theme-canvas-text`, moved onto an inner `<span style="position:relative; z-index:1">` content wrapper so the colour transition (`color var(--duration-fast) var(--ease-in-out)`) applies to the label only and doesn't colour the absolute pill element. Button root colour set to `transparent` for pill variant. `border-bottom` and `connected` variants, `TabsContent`, `TabsProps`, `TabsList`, `TabSelector` wrapper — all unchanged.
- `src/components/CLAUDE.md` — `TabSelector` row updated: pill canvas fill, `--theme-canvas-text` active label, z-index content span requirement documented.

---

## 2026-05-29 — TabSelector: compound component upgrade

TabSelector upgraded to compound component architecture. Controlled/uncontrolled support, `indicatorLayoutId`, `animatedContent`, and `forceMount` scroll preservation. `TabSelector` flat-prop wrapper retained for full backwards compatibility — all existing consumers unchanged.

- `src/components/ui/TabSelector.tsx` — exports `Tabs` (root), `TabsList`, `TabsTrigger`, `TabsContent` as named compound components. `TabsContext` provides `value`, `onValueChange`, `layoutId`, `animatedContent`, `variant` — children read from context, eliminating prop drilling. Controlled/uncontrolled pattern: `value` + `defaultValue` + `onValueChange`. `TabsContent` uses `display:none` (not unmount) to preserve scroll position per tab — `forceMount` behaviour. Inner `motion.div` rendered conditionally so `AnimatePresence mode="wait"` works correctly. Spring indicator uses `SPRING_CONFIG` from `motion.ts` — no hardcoded `stiffness`/`damping`. All three variants (`pill`, `border-bottom`, `connected`) preserved. `TabSelector` flat-prop wrapper composes the compound API internally — zero changes needed at existing call sites.
- `src/lib/constants/motion.ts` — `SPRING_CONFIG` added: `{ type: 'spring', stiffness: 400, damping: 30 }`. Shared by all tab indicator animations. No hardcoded spring values in components.
- `src/components/CLAUDE.md` — compound API documented: `Tabs` props, `indicatorLayoutId` collision warning, `forceMount` + Realtime subscription audit requirement, `AnimatePresence` behaviour.

---

## 2026-05-29 — BarChart `colorMap` prop added. ManagerCampaignWidget adopted wrapper. Flag 4 cleared.

- `src/components/ui/charts/useChartTokens.ts` — `resolveColorMap(map: Record<string, string>)` exported. Resolves CSS variable strings (e.g. `"var(--color-info)"`) to computed hex/rgb values via `getComputedStyle`. Required because SVG `fill`/`stroke` attributes do not resolve CSS custom properties in all browsers (notably older Safari). Re-export pattern is identical to what `useChartTokens` does internally.
- `src/components/ui/charts/BarChart.tsx` — `colorMap?: Record<string, string>` prop added. Values are resolved via `resolveColorMap` on mount and re-resolved on `data-theme` attribute change (same `MutationObserver` approach as `useChartTokens`). `colorMap[key] ?? positionalColor` fill logic — partial maps are valid; unmatched keys fall back to positional tokens. Built-in Recharts `<Legend>` is suppressed when `colorMap` is provided (caller owns the legend). Additional passthrough props added: `margin`, `barCategoryGap`, `xAxisProps`, `yAxisProps`, `tooltipProps`, `gridProps` — removes the need for split rendering (some Recharts primitives in wrapper, some inline).
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — inline Recharts import replaced with `ui/charts/BarChart`. `CHART_SERIES` static constant (7 statuses, labels from `LEAD_STATUS_LABELS`) defined above the component. `colorMap={STATUS_COLORS}` passed as bridge — `STATUS_COLORS` stays in the feature folder (domain knowledge). `stacked` prop preserves stacked layout. Inline legend unchanged — reads `STATUS_COLORS` directly, same source as `colorMap`; legend and bars always in sync. Zero `<Cell>` in migrated code — fill is on `<Bar>` via wrapper.
- `docs/component-sweep-flags.md` — Flag 4 marked resolved.
- `src/components/CLAUDE.md` — `BarChart` row updated with `colorMap` prop contract and `STATUS_COLORS` pattern. `resolveColorMap` documented on `useChartTokens` row.

---

## 2026-05-29 — InfoRow micro-sweep complete. Flag 7 cleared.

InfoRow micro-sweep complete. 10 replacements across 2 files. Flag 7 cleared.

- `src/components/leads/LeadInfoCard.tsx` — 8 contact-field rows migrated from local `DatumRow`/`DatumValue` to `InfoRow`. `DatumRow`, `DatumValue`, and `DATUM_ICON_STYLE` deleted (no other file imported them). Full Name row uses `style={{ gridColumn: '1 / -1' }}` on `InfoRow` root — verified `style` pass-through lands on root element, not inner wrapper.
- `src/components/tasks/SubTaskModal.tsx` — Deadline and Assigned To key-variable rows migrated to `InfoRow` with icon + `React.ReactNode` values (mono date, italic empty state, Avatar composite).
- `docs/component-sweep-flags.md` — Flag 7 marked resolved. 10 unsafe candidates documented (forms, dt/dd grid, attribution strip, metric cards, edit-mode fields).
- `src/components/CLAUDE.md` — `InfoRow` row updated: `value` accepts `React.ReactNode`; `style`/`className` root pass-through documented. Reference implementation updated from deleted `DatumRow` to `InfoRow`.

---

## 2026-05-29 — Tasks UI: contextual header button + SubTaskModal polish + bug fixes

- `src/app/(dashboard)/tasks/TasksShell.tsx` — `createTrigger: number` state added; header row now flex `space-between` with tabs on the left and a contextual `+ My Task` / `+ Group Task` accent button on the right; button label switches live with the active tab; button hidden on Group tab for agents (mirrors server-side auth guard); `useState`, `Plus` (lucide) imported.
- `src/components/tasks/PersonalTasksTab.tsx` — toolbar div (New Task button) removed; `createTrigger?: number` prop added; `useEffect` opens modal when `createTrigger > 0`; unused `Plus` import removed.
- `src/components/tasks/GroupTasksTab.tsx` — toolbar div (New Group Task button) removed; `createTrigger?: number` prop added; `useEffect` opens modal when `createTrigger > 0`.
- `src/components/tasks/SubTaskModal.tsx` — three non-existent CSS tokens fixed throughout: `--theme-surface` → `var(--theme-paper)` (4×), `--theme-surface-secondary` → `var(--theme-paper-subtle)` (8×), `--theme-border` → `var(--theme-paper-border)` (20×); `--theme-overlay` backdrop → `rgba(0,0,0,0.5)`; `backdropFilter: blur` removed (not a sanctioned surface); panel centering shifted to `left: 240px` so modal centers in the content area, not the full viewport including sidebar; `currentUserName` prop added and threaded to `TaskRemarksPanel`.
- `src/components/tasks/TaskRemarksPanel.tsx` — status-change pill row above composer removed (6 pills, grid layout, `ALL_STATUSES`, `TASK_STATUS` import, injected `<style>`, `statusChange` state, `handleStatusToggle`); panel header ("Updates" label) removed; message list redesigned as floating `var(--theme-paper)` cards with `var(--shadow-1)` per message; Zone B background transparent with two ambient CSS-only orbs (`trp-orb-a` / `trp-orb-b`) — GPU-only `transform + opacity` animation, `will-change`, `pointer-events: none`, `aria-hidden`; composer upgraded to `var(--theme-paper)` + `var(--shadow-2)` floating card; `seenIds` ref (seeded from `initialRemarks`) added as primary Realtime dedup guard — prevents Strict Mode double-mount from appending the same row twice regardless of content match; echo dedup changed from content-match to `author_id === currentUserId + any pending optimistic row` (content-match was broken because `sanitizeText` alters strings server-side); `TASK_STATUS` import removed.
- `src/components/tasks/GroupTaskWorkspace.tsx` — `currentUserName` prop now passed to `SubTaskModal`.

---

## 2026-05-29 — `MotionButton` wrapper shipped. `Button` converted to `forwardRef`. Flag 6 infrastructure complete.

- `src/components/ui/Button.tsx` — converted from plain function to `React.forwardRef`. Required by Framer Motion's `motion()` factory. Zero API changes — all existing call sites unaffected. `ref` forwarded to underlying `<button>`.
- `src/components/ui/MotionButton.tsx` — `motion(Button)` wrapper. Accepts all `ButtonProps` plus Framer Motion props (`whileHover`, `whileTap`, `animate`, `initial`, `exit`, `layoutId`). Exports `MOTION_BUTTON_DEFAULTS` for standard press-down feel: `whileTap: { scale: 0.97 }`, spring transition with `INSTANT_DURATION` (100ms). Zero Button internals duplicated.
- Full audit of `src/`: confirmed 1 actual `motion.button` instance (not 6 — original flag conflated raw `<button>` with `motion.button`). That instance (`GroupTasksTab` "Add subtask" trigger) is a full-width layout button that cannot map to `Button` variant props — documented as open sub-flag in `docs/component-sweep-flags.md`.
- `docs/component-sweep-flags.md` — Flag 6 marked partially resolved; sub-flag documented.
- `src/components/CLAUDE.md` — `MotionButton` and `Button` (forwardRef note) rows updated.

---

## 2026-05-29 — `TabSelector`: `connected` variant added. `CreateUserForm` adoption complete. Flag 3 cleared.

- `src/components/ui/TabSelector.tsx` — `connected` added to `TabSelectorVariant` union (`'pill' | 'border-bottom' | 'connected'`). Container: `border: 1px solid var(--theme-paper-border)`, `--radius-md`, `--theme-paper-subtle` bg, `2px` inset padding. Active tab: `motion.span layoutId="tab-connected"` slides via same spring (stiffness 400, damping 30) shared by all three variants. Active tab bg is `--theme-paper` + `--shadow-1`. Active text is `--theme-text-primary`; inactive is `--theme-text-secondary`. Tabs `flex: 1` inside connected container. `SPRING_TRANSITION` constant extracted at module level — all three `motion.span` indicators now share it.
- `src/components/admin/CreateUserForm.tsx` — inline 25-line mode-switcher (two raw `<button>` elements) removed. `TabSelector` imported. `MODE_TABS` constant (static `TabItem[]`) added above component. Call site: `<TabSelector variant="connected" tabs={MODE_TABS} activeTab={mode} onChange={(id) => setMode(id as ...)} />`. `useState<"password" | "invite">` preserved unchanged — no logic touched.
- `docs/component-sweep-flags.md` — Flag 3 marked resolved.
- `src/components/CLAUDE.md` — `TabSelector` row updated with `connected` variant description.

---

## 2026-05-29 — `AvatarStack` component shipped. `GroupTasksTab` adoption complete. Flag 1 cleared.

- `src/components/ui/AvatarStack.tsx` — new display-only component. Props: `users: AvatarStackUser[]`, `max?: number` (default 4), `size?: AvatarSize` (default `sm`), `overlap?: number` (default 8px). Separator ring on each avatar: `box-shadow: 0 0 0 2px var(--theme-paper)` — no layout shift. Overflow pill: `+N`, `--radius-full`, paper-subtle background, same `size` dimensions. Hover spread: Framer Motion `whileHover` + per-item `x` variant (`i * overlap/2`) — zero margin/padding animation (rule compliant). Overflow pill also spreads on hover.
- `src/components/ui/Avatar.tsx` — `box-shadow` composition fix: `callerShadow` and `selectedShadow` are comma-joined so `AvatarStack`'s separator ring and `selected` accent ring coexist. Neither overwrites the other. `style.boxShadow` destructured before spread; `restStyle` applied without conflict.
- `src/components/tasks/GroupTasksTab.tsx` — inline `AvatarStack` function (48 lines) removed. Import updated to `ui/AvatarStack`. `avatarExtra` computation removed. Call site maps `assignee_previews → AvatarStackUser[]` (`full_name → name`, `avatar_url → imageUrl`).
- `docs/component-sweep-flags.md` — Flag 1 marked resolved.
- `src/components/CLAUDE.md` — `AvatarStack` row added; `Avatar` row updated with composition rule note.

---

## 2026-05-29 — Avatar: `selected` prop + accent ring. ManagerLeadVolumeWidget: chart colour wired to `useChartTokens`. Flags 2 + 5 cleared.

- `src/components/ui/Avatar.tsx` — `selected?: boolean` added to `AvatarProps`. When `true`: `box-shadow: 0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)` ring rendered via CSS `box-shadow` (not `border`) — zero layout shift, ring paints outside the element. Animates via `transition: box-shadow var(--transition-interactive)`. No Framer Motion. No size change. Unblocks `AssigneePickerModal` migration (Flag 2 cleared).
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `useChartTokens()` called inside the component. `Line` `stroke` and `activeDot.fill` now use `chartColors[0]` (runtime-resolved `--theme-accent` hex via `getComputedStyle`). Fixes SVG attribute color resolution across browsers (SVG does not resolve CSS custom properties natively in all engines). Chart repaints on theme switch via the hook's `MutationObserver`. (Flag 5 cleared.)
- `docs/component-sweep-flags.md` — Flags 2 and 5 marked resolved with resolution notes.
- `src/components/CLAUDE.md` — `Avatar` row updated with `selected` prop description and ring pattern.

---

## 2026-05-29 — Component sweep — 33 safe inline UI patterns replaced with `src/components/ui/` library

Adoption sweep across all of `src/`. Zero functional changes. `pnpm tsc --noEmit` passes with zero errors after all replacements. 7 items flagged in `docs/component-sweep-flags.md`.

**Replacements made (33 total across 20 files):**

- `Spinner` adopted in: `CalledModal`, `AgentScratchpad`, `PersonalDetailsCard`, `ProfileAvatarSection` — all `Loader2` inline spinners removed
- `Button` adopted in: `login-form`, `forgot-password-form`, `update-password-form`, `CreateUserForm`, `EditAuthorizationForm`, `EditProfileForm`, `ProfileDetailsForm`, `PasswordChangeForm`, `CalledModal`, `StatusActionPanel`, `AddLeadModal`, `AddLeadButton`, `PersonalDetailsCard`, `AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` — all inline primary `<button>` elements removed
- `Toggle` adopted in: `NotificationPreferences`, `UserStatusControls` — custom `<button role="switch">` removed, helper functions `toggleStyle`/`thumbStyle` deleted
- `Avatar` adopted in: `TaskRemarksPanel`, `SubTaskModal`, `PersonalTasksTab`, `CreateGroupTaskModal`, `GroupTaskWorkspace`, `GroupTasksTab`, `UsersTable` — all local `getInitials()` helpers removed
- `SearchBar` adopted in: `UsersTable` — inline search `<input>` with manual icon positioning removed
- `Table` adopted in: `UsersTable` — raw `<table>/<thead>/<tbody>/<tr>/<td>` removed
- `TabSelector` (pill) adopted in: `ManagerLeadVolumeWidget`, `PerformancePeriodSelector` — inline period toggle buttons removed
- `TabSelector` (border-bottom) adopted in: `TasksShell` — custom underline tab bar with `onMouseEnter`/`onMouseLeave` imperative style mutations removed

**Flagged (7 items — not touched):** `AvatarStack` (no ui component), `AssigneePickerModal` selected avatar state, `CreateUserForm` connected-tab visual, `ManagerCampaignWidget` Recharts (7 semantic colors), `ManagerLeadVolumeWidget` Recharts (`--theme-accent` vs `--chart-1`), task icon-only `motion.button` instances (6 files), InfoRow candidates (not individually verified). See `docs/component-sweep-flags.md`.

---

## 2026-05-29 — Rule Q-12: mandatory codebase search before creating any code unit

- `docs/The_Rules.md` — Q-12 added to Section 6 (Code Quality): before creating any component, hook, util, or service function, search the codebase for an existing equivalent first; search by behaviour not filename; creating a duplicate is a violation regardless of whether names differ; applies to components, hooks, utils, service functions, constants, Zod schemas.
- `docs/The_Rules.md` — Section 8 (Never-Do List) updated: `NEVER create a component, hook, util, or service without first searching the codebase for an existing equivalent — search by behaviour, not filename (Q-12)`.
- `CLAUDE.md` + `.cursorrules` — new "Before Writing Any Code — Mandatory Sequence" block added above "When in Doubt": three-step order (read authority files → search by behaviour → write code). Replaces the implicit assumption that agents search before building.

---

## 2026-05-29 — UI-Foundation post-ship: useChartTokens MutationObserver + Table boundary docs

- `src/components/ui/charts/useChartTokens.ts` — `MutationObserver` added on `document.documentElement` watching `data-theme` attribute mutations. On every theme switch, `resolveTokens()` fires and all chart colours update immediately. No caller needs to pass `themeKey` in production — the hook is self-contained. `themeKey` prop kept as SSR/test escape hatch only. Observer cleaned up on unmount (`observer.disconnect()`).
- `src/components/ui/Table.tsx` — JSDoc added to `TableColumn<T>` clarifying the intended use boundary: Table<T> is for secondary/admin tables (audit logs, reporting grids). It is explicitly not intended to replace bespoke feature tables (LeadsTable, future task table) that need custom toolbars, column pickers, and drag-to-reorder. Prevents future misuse.
- `src/components/CLAUDE.md` — Three architectural decisions locked: (1) visual test surface = `/dev/components` route (no Storybook), (2) `useChartTokens` is MutationObserver-driven, (3) `Table<T>` vs bespoke feature table boundary.

---

## 2026-05-29 — Phase UI-Foundation — Component library shipped

Full display-only, token-compliant, theme-aware UI component library. All components live in `src/components/ui/`. All colours are CSS variables — zero hardcoded hex in any `.tsx` file. Zero business logic. Zero DB calls. `pnpm tsc --noEmit` passes with zero errors.

**New files:**

- `src/lib/constants/motion.ts` — shared Framer Motion constants (`ENTER_DURATION`, `EXIT_DURATION`, `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `FADE_VARIANTS`). All animation components import from here — never re-declare inline.
- `src/components/ui/Spinner.tsx` — three sizes (sm/md/lg); reuses `eia-spin` keyframe; canvas variant.
- `src/components/ui/Button.tsx` — five variants (primary/secondary/ghost/danger/success); four sizes; loading state; iconLeft/iconRight slots; `--theme-accent-fg` on primary (V-02 compliant).
- `src/components/ui/Avatar.tsx` — five sizes; square `--radius-md`; initials fallback with 6 semantic colour pairs from name hash (colour variety guaranteed); `loading="lazy"` (P-04).
- `src/components/ui/SearchBar.tsx` — controlled; Lucide Search icon; clear button; focus ring `--shadow-focus`; three sizes; `--theme-accent` border on focus.
- `src/components/ui/InfoRow.tsx` — label/value pair; optional icon; optional copy-to-clipboard; horizontal/stacked; border-bottom divider.
- `src/components/ui/TabSelector.tsx` — spring pill (Framer Motion `layoutId`); pill and border-bottom variants; count badge; `activeTab`/`onChange` API.
- `src/components/ui/Dialog.tsx` — Eia overlay (`--theme-canvas` at 0.72 opacity); `--theme-paper` surface; `--shadow-4`; `--radius-xl`; Framer Motion `AnimatePresence`; five sizes (sm/md/lg/xl/full); `--duration-enter`/`--duration-exit`; `EASE_OUT_EXPO`/`EASE_IN_EXPO`.
- `src/components/ui/FilterDropdown.tsx` — trigger with icon + label + chevron + active count badge; `--theme-paper` menu; `--shadow-3`; multi-select (checkbox) and single-select modes; `DROPDOWN_VARIANTS`.
- `src/components/ui/Table.tsx` — generic `TableColumn<T>` / `TableProps<T>`; sticky header option; `--theme-paper-subtle` header bg; selected row `--theme-accent-surface`; `virtualized` prop; dev-only `console.warn` when `rowCount > 100 && !virtualized` (P-03).
- `src/components/ui/ListRow.tsx` — left slot (avatar/icon), primary text, secondary text, right slot, optional chevron; `--theme-paper` bg; hover `--theme-paper-subtle`; `--radius-md`.
- `src/components/ui/ProgressBar.tsx` — auto-intent (value<33→danger, 33–66→warning, >66→success); `intent` override prop; Framer Motion fill animation (`--ease-spring`, `--duration-slow`); label slot.
- `src/components/ui/Toggle.tsx` — sm/md sizes; spring thumb animation; label + description slot; `--theme-accent` on track when checked.
- `src/components/ui/ChecklistItem.tsx` — `CheckSquare2`/`Square` icons; checked state: label strikethrough + `--color-success` icon.
- `src/components/ui/Checklist.tsx` — ordered list of `ChecklistItem`; `ProgressBar` at top; composes both without duplication.
- `src/components/ui/RadioGroup.tsx` — default and card variants; card fills `--theme-accent-surface` when selected; filled circle indicator.
- `src/components/ui/Calendar.tsx` — month grid; Framer Motion slide between months (`--ease-spring`); today underline dot; selected filled `--theme-accent`; range highlight `--theme-accent-surface`.
- `src/components/ui/DatePicker.tsx` — trigger + popover mounting `Calendar`; `DROPDOWN_VARIANTS`; focus ring `--shadow-focus`.
- `src/components/ui/EditButton.tsx` — icon-only Pencil button; ghost default; accent on hover; "Edit" tooltip; composes hover states without re-implementing Button internals.
- `src/components/ui/Accordion.tsx` — `ChevronDown` rotating 180° (`--ease-spring`); `AnimatePresence` height animate; single/multiple type; border `--theme-paper-border`; trigger bg `--theme-paper-subtle` when open.
- `src/components/ui/Modal.tsx` — semantic wrapper around `Dialog.tsx`; standard type exposes title/description/footer slots; `type="lia"` enforces exactly two actions (Approve + Dismiss) with `LiaGlyph` breathing; `maxWidth` prop for backward compat with existing callers.
- `src/components/ui/charts/useChartTokens.ts` — resolves 6 series colours + grid/axis/tooltip tokens from `getComputedStyle` at runtime; `themeKey` dep triggers re-resolve on theme switch; fallback values = Earth theme resolved values (only used SSR / before mount).
- `src/components/ui/charts/ChartSkeleton.tsx` — skeleton block matching chart dimensions; reuses `.skeleton` class (`eia-skeleton-pulse`).
- `src/components/ui/charts/LineChart.tsx` — Recharts `LineChart`; all colours via `useChartTokens`; `loading` → `ChartSkeleton`.
- `src/components/ui/charts/BarChart.tsx` — Recharts `BarChart`; stacked option; top-radius-only bars per §16.4; `Cell` per bar.
- `src/components/ui/charts/PieChart.tsx` — Recharts `PieChart`; token colours; legend.
- `src/components/ui/charts/DonutChart.tsx` — Recharts `PieChart` with `innerRadius`; optional `centerLabel` slot.
- `src/components/ui/charts/AreaChart.tsx` — Recharts `AreaChart`; gradient fill via `linearGradient` (token colour, not hex); stacked option.
- `src/components/ui/charts/ButterflyChart.tsx` — Recharts `BarChart` `layout="vertical"` with negative left series; axis formatter strips minus sign.

**Sign-off passed:**

- `pnpm tsc --noEmit` → 0 errors
- `grep` for `text-gray|bg-white|bg-black|text-white|#[hex]` in `src/components/ui/**/*.tsx` → 0 results
- Every component exports a named TypeScript interface for its props
- `Avatar` fallback: 6 semantic colour pairs derived from name hash — guaranteed variety
- `ProgressBar` auto-intent: 20→danger, 50→warning, 80→success ✓
- Charts: all colours resolved via `useChartTokens` at runtime — zero hardcoded hex passed to Recharts props ✓
- `Dialog` enter = `ENTER_DURATION` (400ms), exit = `EXIT_DURATION` (250ms) — matches tokens ✓
- `Table` logs dev-only `console.warn` when `rowCount > 100 && !virtualized` ✓
- No new Framer Motion keyframes — reuses `eia-spin`, `eia-skeleton-pulse` from `design-tokens.css` ✓
- No component imports from feature folders ✓
- No `useState` for data fetching in any component ✓

---

## 2026-05-29 — SubTaskModal: fix transparent background (bogus tokens)

- `src/components/tasks/SubTaskModal.tsx` — three non-existent CSS tokens replaced throughout: `--theme-surface` → `var(--theme-paper)` (4 occurrences), `--theme-surface-secondary` → `var(--theme-paper-subtle)` (8 occurrences), `--theme-border` → `var(--theme-paper-border)` (20 occurrences); `--theme-overlay` (backdrop) → `rgba(0,0,0,0.5)` matching `ui/modal.tsx` canonical; `backdropFilter: blur(4px)` removed from backdrop per NEVER rule (blur only sanctioned on TopBar, mobile sidebar overlay, command palette).

---

## 2026-05-29 — Task tags: DB persistence + tag filter

- `supabase/migrations/20260529000024_task_tags.sql` — `tags text[] NOT NULL DEFAULT '{}'` added to `tasks`; GIN index `idx_tasks_tags_gin` (partial: `task_category='personal'`) for array containment queries.
- `src/lib/types/database.ts` — `Task.tags: string[]` added; `Insert` type updated to make `tags` optional.
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema` now includes `tags: z.array(...).max(10).default([])`; new `UpdateTaskTagsSchema` + `UpdateTaskTagsInput` exported.
- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.tags?: string[]` added; `getPersonalTasks` applies `.contains('tags', filters.tags)` when tags are provided; new `getPersonalTaskTags(userId)` returns sorted distinct tags for a user.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction` now writes `tags` to DB; new `updateTaskTagsAction` (full replace, auth-gated); new `getPersonalTaskTagsAction` read action.
- `src/components/tasks/CreatePersonalTaskModal.tsx` — "Saved locally only (DB column pending)" stub removed; `tags` now passed to `createPersonalTaskAction` and included in `syntheticTask`; `useCallback` dep array updated.
- `src/components/tasks/PersonalTasksTab.tsx` — `availableTags` + `selectedTags` state added; tags loaded in parallel with tasks on mount; tag filter bar renders when tags exist (pill toggles, "Clear" link); `tasksByPriority` grouping filters by `selectedTags` client-side; empty state copy adapts to tag-filtered state.

---

## 2026-05-29 — Tasks ecosystem design polish

- `src/app/(dashboard)/tasks/page.tsx` — page `<h1>` converted from Tailwind `type-page-title` class to full inline token composition; accent period `<span style="color: var(--theme-accent)">.</span>` added per design-dna §03.
- `src/app/(dashboard)/tasks/TasksShell.tsx` — tab bar: tabs renamed "My Tasks" / "Group Tasks"; tab height set to 40px; `display: inline-flex` + `align-items: center` for correct vertical centering; font-weight upgraded to `--weight-medium` on inactive tabs; hover transition narrowed to `color + background` only; `transition: all` removed.
- `src/components/tasks/PersonalTasksTab.tsx` — "New Task" button: `--radius-md` → `--radius-sm` (§5.01 buttons always `--radius-sm`), fixed height 36px, opacity hover → `--theme-accent-hover` background per §5.01 state spec; completion circle and arrow button: `width/height '24px'` → `var(--space-6)`; assignee avatar: `'20px'` → `var(--space-5)`; task-count pill: `'1px'` padding → `var(--space-px)`; quick-add date input `'3px'` padding → `var(--space-1)`; assignee button `'28px'` → `var(--space-7)`; initials `'9px'` fontSize → `var(--text-2xs)`; cancel button `'24px'` → `var(--space-6)`.
- `src/components/tasks/GroupTasksTab.tsx` — "New Group Task" button: same fixes as above (radius, height, hover); AvatarStack: `'22px'` → `var(--space-6)`, `'8px'` fontSize → `var(--text-2xs)` throughout; group description `marginTop: '2px'` → `var(--space-px)`; "Open" link gap `'3px'` → `var(--space-1)`; group + subtask status pills: `'3px'/'2px'` padding → token equivalents, `'11px'` fontSize → `var(--text-xs)`, `'4px'` gap → `var(--space-1)`, `box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06)` added per §07 (pill shadow rule); subtask assignee avatar: `'20px'` → `var(--space-5)`, `'7px'` fontSize → `var(--text-2xs)`; add-subtask picker button `'26px'` → `var(--space-7)`, `'8px'` fontSize → `var(--text-2xs)`, save button `'2px'` padding → `var(--space-1)`; group empty state: card border + shadow added per §04 + §05.
- `src/components/tasks/CreateGroupTaskModal.tsx` — `max-w-3xl` → `max-w-2xl`; preview column 280px → 200px; two-column gap `--space-8` → `--space-6`; V-01 violations: `rgba(255,255,255,0.85)` swatch ring → CSS border/outline pattern; `'8px'/'9px'` fontSize → `var(--text-2xs)`; `'3px'` padding → token equivalents; `var(--space-9)` (non-existent) → `var(--space-8)`; icon buttons given fixed `height: 32` instead of bare padding; textarea `resize: none` → `resize: vertical`; `margin: '0 0'` on divider removed.

---

## 2026-05-29 — SubTaskModal + task attachments (checklist)

- `supabase/migrations/20260529000023_task_attachments.sql` — `ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'` to `tasks`; CHECK constraint `tasks_attachments_is_array` validates JSON array type; intentionally excluded from `log_task_changes()` trigger (auditing checklist toggles would flood `task_audit_log`).
- `src/lib/types/database.ts` — `ChecklistItem` type (`{ id, text, checked }`) added and exported; `Task.attachments: ChecklistItem[]` added.
- `src/lib/validations/task-schemas.ts` — `UpdateChecklistSchema` + `UpdateChecklistInput` added.
- `src/lib/actions/tasks.ts` — `updateChecklistAction` added: Zod → auth → RLS (user client) → application-layer canMutateTask → adminClient UPDATE; returns `ChecklistItem[]`.
- `src/components/tasks/SubTaskModal.tsx` — new `'use client'` component replacing `TaskModal.tsx`. Centered overlay (not bottom sheet). `max-width: 1100px`, `height: 90vh`. Scale entrance 0.96→1. Header: breadcrumb + status/priority inline dropdowns (optimistic) + edit pencil + ⋯ delete menu + ×. Zone A (38%): title, notes/objective, checklist with `@dnd-kit/sortable` in edit mode, key variables, metadata. Zone B (62%): `TaskRemarksPanel` with `composerPlaceholder` prop. Edit mode save calls `updateTaskAction` only — never inserts a remark. `AnimatePresence` must wrap conditional at call site.
- `src/components/tasks/TaskRemarksPanel.tsx` — `composerPlaceholder?: string` prop added (default `"Add an update…"`); textarea uses prop value.
- `src/components/tasks/TaskModal.tsx` — **deleted**. All call sites updated to `SubTaskModal`.
- `src/components/tasks/GroupTaskWorkspace.tsx`, `GroupTasksTab.tsx`, `PersonalTasksTab.tsx` — `TaskModal` import replaced with `SubTaskModal`; `AnimatePresence` wrapping added at call sites; props updated to new shape.
- `src/components/CLAUDE.md`, `src/app/(dashboard)/CLAUDE.md`, `supabase/migrations/CLAUDE.md` — updated to reflect SubTaskModal and migration 0023.

---

## 2026-05-29 — CreateGroupTaskModal

- `src/lib/constants/task-constants.ts` — `GROUP_TASK_ACCENT_COLORS` (10 muted hex colours with id/hex/label) and `GROUP_TASK_ICONS` (25 Lucide icon names as id/label pairs) added; both with TODO comments noting the DB columns they need.
- `src/components/tasks/CreateGroupTaskModal.tsx` — new `'use client'` modal composing `ui/modal.tsx` (`max-w-3xl`); two-column layout (280px preview + form, collapses to single-column at ≤640px); live preview card updates on every keystroke; fields: Title, Description, Domain (APP_DOMAINS select), Accent Colour swatches, Icon grid (dynamic Lucide lookup), Priority chips, Due Date, Add Members; accent_color/icon_key/memberIds are UI-only — no DB columns yet, NOT passed to `createGroupTaskAction`; member search stubs to empty until `searchProfilesAction` exists; `useTransition` + `isPending` guard; `onCreated` receives synthetic `TaskGroup` on success.
- `src/components/tasks/GroupTasksTab.tsx` — `groupRows` local state (initialized from `initialRows`); "New Group Task" toolbar button added (visible to manager/admin/founder only); `handleGroupCreated` converts `TaskGroup` → `TaskGroupRow` and prepends; empty-state copy updated to mention the button; `CreateGroupTaskModal` wired.
- `src/components/CLAUDE.md` — `CreateGroupTaskModal` contract section added.

---

## 2026-05-29 — CreatePersonalTaskModal

- `src/components/tasks/CreatePersonalTaskModal.tsx` — new `'use client'` modal composing `ui/modal.tsx`; fields: Title (autofocus, auto-grow 1→3 lines), Due date (Today/Tomorrow/Next week preset chips + specific `datetime-local` toggle; presets use IST end-of-day via explicit UTC+5:30 offset), Priority (Urgent/High/Normal single-select chips from `TASK_PRIORITY`; Normal is default/fallback), Tags (free-text chip input, Enter/comma to add, max 10; UI-only — `tasks.tags` column does not exist yet), Notes (collapsed "+ Add notes" toggle); client-side Zod validation before action call; `useTransition` + `isPending` guard; on success: `onCreated(syntheticTask)` fires so parent can prepend without re-fetch; on error: `toast.danger`, modal stays open.
- `src/components/tasks/PersonalTasksTab.tsx` — "New Task" header button now opens `CreatePersonalTaskModal` (was: inline quick-add row). Quick-add row is unchanged and independent. `onCreated` handler prepends the returned task to `activeTasks` state — no re-fetch needed. `createModalOpen` state added.
- `src/components/CLAUDE.md` — `CreatePersonalTaskModal` contract section added.

---

## 2026-05-29 — Group Task Workspace (`/tasks/[id]`)

- `src/lib/services/tasks-service.ts` — `getTaskGroupById(groupId): Promise<TaskGroup | null>` added; server Supabase client; RLS enforces domain-scoped access; null means no access or not found.
- `src/lib/actions/tasks.ts` — `getTaskGroupByIdAction(groupId)` added; thin wrapper; returns `ActionResult<TaskGroup>`.
- `src/app/(dashboard)/tasks/[id]/page.tsx` — new Server Component; fetches `getTaskGroupById` + `getGroupSubtasks` in parallel; null group → `redirect('/tasks?tab=group')` (no 404); passes data as props to `GroupTaskWorkspace`.
- `src/components/tasks/GroupTaskWorkspace.tsx` — new `'use client'` component; List view (priority DESC + due_at ASC) + Board view (5 columns: To Do, In Progress, In Review, Completed, Error/Cancelled); view persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}` (default `'list'`, hydrated after mount — no SSR mismatch); Realtime subscription `workspace-subtasks-${groupId}-${mountId}`; click row/card → `TaskModal`; status changes re-sync via `getGroupSubtasksAction` on modal close; floating `+ Add subtask` FAB (title + assignee + priority + due date; `createSubtaskAction`; re-fetches on success); no drag-and-drop; no inline complete.
- `src/components/tasks/GroupTasksTab.tsx` — "Open" link added to each group header row; `Link href="/tasks/${group.id}"` with `e.stopPropagation()` on click/keydown to prevent accordion expand.
- `src/app/(dashboard)/CLAUDE.md` — Group Task Workspace route documented.
- `src/components/CLAUDE.md` — `GroupTaskWorkspace` contract section added.

---

## 2026-05-29 — PersonalTasksTab full redesign: priority sections + completion circles

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.limit?: number` added (capped at 500 in service; default `PERSONAL_TASKS_PAGE_SIZE`); `getPersonalTasks` now derives `pageSize` from `filters.limit`, uses it for both the DB `.limit()` and the `hasMore` / `page.slice()` logic.
- `src/components/tasks/PersonalTasksTab.tsx` — **full rewrite**. Removed: filter bar (status pills, priority pills, due date range), cursor-stack pagination, `quickPriority` state. Added: three active priority sections (URGENT / HIGH / NORMAL) + COMPLETED section (collapsed by default, last 20); section collapse via `useRef` (never `useState`) so optimistic updates don't collapse sections; completion circle (24px) per row — own tasks clickable, assigned-to-other dashed non-interactive; optimistic status map keyed by `taskId` with rollback on error; due date chip (`var(--color-danger-text)` overdue / `var(--color-warning-text)` today / tertiary future); quick-add `useTransition` guard preserved from Problem 7; priority defaults to `'normal'` in quick-add; data fetched via parallel `Promise.all` on mount with `limit: 500` for active and `limit: 20` for completed.
- `src/components/CLAUDE.md` — `PersonalTasksTab` contract section added.

---

## 2026-05-29 — TaskModal redesign: TaskRemarksPanel replaces TaskChatPanel

- `src/components/tasks/TaskRemarksPanel.tsx` — new client component; replaces `TaskChatPanel`; timeline (oldest→newest, auto-scroll to bottom on mount/new remark); status chip per remark when `status_change` is set (colour-coded using `TASK_REMARK_STATUS_LABELS` + `STATUS_CHIP_COLORS`); suppressed-remark italic placeholder; Playfair italic empty state; compose area with textarea (auto-height, max 3 lines), 6 status-change toggle pills (3-col desktop, 2-col mobile via `.task-remarks-status-pills`), "Post update" button; `useTransition + isPending` guard; optimistic insert at 0.6 opacity confirmed on Realtime echo; channel name `task-remarks-${taskId}-${mountId}` (Strict Mode safe); exports `TaskRemarkWithAuthor` (re-exported from `tasks-service`).
- `src/components/tasks/TaskModal.tsx` — imports `TaskRemarksPanel`; `initialMessages` prop renamed to `initialRemarks`; both desktop and mobile sheet use `TaskRemarksPanel`.
- `src/components/tasks/TaskChatPanel.tsx` — **deleted**.
- `src/components/tasks/PersonalTasksTab.tsx` — import updated to `TaskRemarksPanel`; prop renamed `initialRemarks`.
- `src/components/tasks/GroupTasksTab.tsx` — prop renamed `initialRemarks`.
- `src/components/CLAUDE.md` — TaskModal and TaskRemarksPanel contracts updated; TaskChatPanel section removed.

---

## 2026-05-29 — Service + action layer for task_remarks

- `src/lib/validations/task-schemas.ts` — `AddTaskRemarkSchema` updated: `content` capped at 2000 chars; `statusChange: StatusEnum.optional()` field added.
- `src/lib/services/tasks-service.ts` — `getTaskMessages` replaced by `getTaskRemarks(taskId): Promise<TaskRemarkWithAuthor[]>`; queries `task_remarks` ordered ASC (oldest first); batch-resolves author profiles in one query (no N+1); `TaskRemarkWithAuthor` exported as the canonical type definition; `TaskWithMessages.messages` updated to `TaskRemarkWithAuthor[]`; `getTaskById` calls `getTaskRemarks`.
- `src/lib/actions/tasks.ts` — `addTaskMessageAction` replaced by `addTaskRemarkAction`: Zod → auth → task visibility check (assigned_to / created_by / manager+) → optional `updateTaskStatusAction` call (status logic not duplicated) → INSERT via adminClient; returns `ActionResult<TaskRemark>`. `suppressTaskMessageAction` replaced by `suppressTaskRemarkAction`: Zod → admin/founder guard → existence check (S-06) → idempotent suppression write; returns `ActionResult<{ remarkId }>`.
- `src/lib/constants/task-constants.ts` — `TASK_REMARK_STATUS_LABELS: Record<TaskStatus, string>` added; covers all 6 status values with past-tense labels for the timeline UI.
- `src/components/tasks/TaskChatPanel.tsx` — imports `addTaskRemarkAction`; imports and re-exports `TaskRemarkWithAuthor` from `tasks-service` (single canonical definition); `author` in optimistic insert now includes `id` field; deprecated `TaskMessageWithAuthor` alias removed.
- `src/lib/CLAUDE.md` — services/actions registry updated; `addTaskRemarkAction` and `suppressTaskRemarkAction` contract sections added.

---

## 2026-05-29 — Migration 0022: task_messages → task_remarks rename

- `supabase/migrations/20260529000022_task_remarks.sql` — Part A: `DROP TABLE task_messages CASCADE` (pre-production table, no data to preserve; CASCADE removes RLS policies, index, and Realtime publication entry automatically). Part B: creates `task_remarks` with all columns from `task_messages` plus `status_change text` (nullable, CHECK values mirror `tasks.status` CHECK — coupled, must stay in sync). RLS SELECT/INSERT mirror migration 0019 visibility rule (assigned_to, created_by, manager+); suppression UPDATE policy for admin/founder (row-level, column restriction enforced at action layer). `idx_task_remarks_task_id` on `(task_id, created_at ASC)` — ASC for oldest-first timeline. Realtime enabled on `task_remarks`.
- `src/lib/types/database.ts` — `TaskMessage` type removed; `TaskRemark` type added (adds `status_change: TaskStatus | null`); `task_messages` Database block removed; `task_remarks` Database block added with updated FK names.
- `src/lib/services/tasks-service.ts` — `getTaskMessages` now queries `task_remarks` with `ascending: true`; return type updated to `TaskRemark[]`; `TaskWithMessages.messages` updated accordingly.
- `src/lib/actions/tasks.ts` — `addTaskMessageAction` inserts into `task_remarks`; `suppressTaskMessageAction` reads/writes `task_remarks`; delete task comment updated.
- `src/lib/validations/task-schemas.ts` — `AddTaskMessageSchema` → `AddTaskRemarkSchema`; `SuppressTaskMessageSchema` → `SuppressTaskRemarkSchema`; input types renamed accordingly.
- `src/components/tasks/TaskChatPanel.tsx` — exports `TaskRemarkWithAuthor` (primary); `TaskMessageWithAuthor` kept as deprecated alias; Realtime channel renamed `task-remarks-${taskId}-${mountId}`; table filter updated to `task_remarks`; optimistic insert gains `status_change: null`.
- `src/components/tasks/TaskModal.tsx` — imports `TaskRemarkWithAuthor`; `initialMessages` prop type updated.
- `src/components/tasks/PersonalTasksTab.tsx` — imports `TaskRemarkWithAuthor`; `selectedTaskMessages` state renamed `selectedTaskRemarks` with correct type.
- `supabase/migrations/CLAUDE.md` — migration 0022 added to inventory; `task_remarks` append-only contract documented; `status_change` coupling warning added.
- `src/lib/CLAUDE.md` — service/action registry entries updated; `suppressTaskMessageAction` contract updated to reference `task_remarks`.
- `src/components/CLAUDE.md` — `TaskModal` and `TaskChatPanel` props updated; channel name and export updated.

---

## 2026-05-29 — Heap OOM fix: singleton browser client, Realtime teardown, dashboard hydration, tasks dual-fetch

- `src/lib/supabase/client.ts` — singleton pattern: module-level `_client` variable; `createClient()` returns same reference on every call; one WebSocket connection and channel registry across all components; `_resetClientForTests()` escape hatch gated to `NODE_ENV === 'test'`.
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Fix A: cleanup changed from `channel.unsubscribe()` to `supabase.removeChannel(channel)` to fully deregister from the singleton client's channel list. Fix B: channel name now includes `useId()` mount suffix (`agent-activity:${userId}:${mountId}`) to prevent Strict Mode double-mount from calling `.on()` on an already-subscribed channel.
- `src/hooks/useNotifications.ts` — audited; already uses `supabase.removeChannel(channel)` correctly; no change needed.
- `src/hooks/useDashboardLayout.ts` — hydration `useEffect` now calls `setStored` only when the persisted layout differs from the default already set synchronously; prevents full widget tree unmount/remount on every navigation.
- `src/components/dashboard/DashboardCanvas.tsx` — removed `isHydrated` skeleton gate; widgets render immediately with default layout; no layout shift on hydration because defaults and stored layout are often identical; `WidgetSkeleton` and `DEFAULT_LAYOUT_BY_ROLE` imports removed.
- `src/app/(dashboard)/tasks/page.tsx` — reads `searchParams.tab` and fetches only the active tab's data; inactive tab receives a zero-value sentinel; halves server work and RSC payload on every `/tasks` navigation.
- `src/lib/CLAUDE.md` — singleton contract and Realtime teardown pattern documented.
- `src/app/(dashboard)/CLAUDE.md` — hydration rule and tasks single-fetch rule updated.

## 2026-05-28 — Migration 0021: task_messages suppression + task_audit_log

- `supabase/migrations/20260528000021_task_suppression_audit.sql` — Part A: adds `is_suppressed` (bool NOT NULL DEFAULT false), `suppressed_by` (uuid FK → profiles ON DELETE SET NULL), `suppressed_at` (timestamptz) columns to `task_messages`; adds `task_messages_suppression_update` RLS UPDATE policy for admin/founder (row-level only — column restriction at action layer). Part B: creates `task_audit_log` append-only table (id, task_id, changed_by, field_name, old_value, new_value, changed_at) with `idx_task_audit_log_task_id` index; RLS SELECT for manager/admin/founder; no INSERT/UPDATE/DELETE policies; `log_task_changes()` SECURITY DEFINER trigger fires AFTER UPDATE on tasks, logs six fields (title, description, status, priority, due_at, assigned_to).
- `src/lib/types/database.ts` — `TaskMessage` type updated with suppression fields; `TaskAuditLog` type added; `task_messages` Database entry updated (Insert/Update types narrowed); `task_audit_log` Database entry added.
- `src/lib/validations/task-schemas.ts` — `SuppressTaskMessageSchema` + `SuppressTaskMessageInput` added.
- `src/lib/actions/tasks.ts` — `suppressTaskMessageAction` added: Zod → admin/founder guard → message existence check (S-06) → idempotent suppression write via adminClient.
- `src/components/tasks/TaskChatPanel.tsx` — suppressed messages render as "This message was removed." (tertiary italic, same row height); original content never shown for any role; optimistic inserts carry `is_suppressed: false`.

---

## 2026-05-28 — PersonalTasksTab: replace unbounded append with page-replace pagination (Fix — P-03)

Option A chosen: `@tanstack/virtual` was not in `package.json`; no new dependency added.

- `src/components/tasks/PersonalTasksTab.tsx` — `handleLoadMore` (append) removed; replaced with `handleNextPage` (replaces task list, pushes previous cursor onto `cursorStack`) and `handlePrevPage` (pops `cursorStack`, re-fetches that page); DOM is always max 50 rows; "Load more" button replaced with Previous/Next pagination footer showing current page number; filter-change `useEffect` resets to page 1 when `cursorStack.length > 0` so client-side filters apply against the first page (full dataset entry point) rather than a mid-stack page

---

## 2026-05-28 — TaskChatPanel: fix Realtime "cannot add callbacks after subscribe()" (Fix)

Root cause: `createBrowserClient` (Supabase SSR) is a singleton — same client instance on every call. The Supabase JS client reuses channel objects by name from an internal registry. React 18 StrictMode double-invokes effects: mount → cleanup → mount again. The first cleanup called `removeChannel` (async, not awaited), but by the time the second mount ran, the channel by the same name was still present in the registry in `SUBSCRIBED` or `LEAVING` state. Calling `.on()` on it threw `"cannot add postgres_changes callbacks after subscribe()"`.

Fix: `useId()` produces a stable, mount-scoped nonce that is unique across mounts. The channel name becomes `task-messages-${taskId}-${mountId}`, making each mount's channel name distinct. StrictMode's first cleanup fully removes its channel; the second mount creates a new channel under a different name and never collides with the prior one.

- `src/components/tasks/TaskChatPanel.tsx` — `useId` added to React import; `mountId = useId()` ref added; channel name changed from `` `task-messages-${taskId}` `` to `` `task-messages-${taskId}-${mountId}` ``

---

## 2026-05-28 — GroupTasksTab / PersonalTasksTab: fix server module in client bundle (Fix)

Root cause: both `'use client'` components imported value symbols directly from `src/lib/services/tasks-service.ts`, which calls `createClient()` from `src/lib/supabase/server.ts`, which imports `next/headers`. Next.js rejects any client bundle that transitively reaches `next/headers`.

Rule A-03: all DB queries go through `lib/services/`; but the service layer is server-only. Client components must use server actions as the boundary — never import service modules directly.

- `src/lib/actions/tasks.ts` — `getGroupSubtasksAction(groupId)` and `getPersonalTasksAction(filters?)` added; both call the service, verify session, and return `ActionResult<T>`; `userId` is derived from `getCurrentProfile()` server-side so the client never needs to supply it
- `src/components/tasks/GroupTasksTab.tsx` — `import { getGroupSubtasks } from '…/tasks-service'` replaced with `import { …, getGroupSubtasksAction } from '…/actions/tasks'`; call site updated; `cancelled` flag added (matches widget pattern)
- `src/components/tasks/PersonalTasksTab.tsx` — `import { getPersonalTasks } from '…/tasks-service'` removed; `getPersonalTasksAction` imported from actions; all three call sites (`handleNextPage`, `handlePrevPage`, filter-reset `useEffect`) updated

---

## 2026-05-28 — Migrations 0018/0019/0020: fix app_domain = text type error (Fix)

Root cause: `get_user_domain()` returns `app_domain` (enum). `task_groups.domain` is `text`. PostgreSQL will not implicitly cast enum → text — `ERROR 42883: operator does not exist: app_domain = text`. All three migrations built in the same session carried the same uncast comparison. The correct pattern (already in migration 0003) is `get_user_domain()::text`.

- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — `get_user_domain() = domain` → `get_user_domain()::text = domain` in both SELECT and UPDATE policies (3 occurrences); type-note comment added
- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` in both SELECT and INSERT policies (2 occurrences); type-note comment added
- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` (1 occurrence)

All three files were edited in-place: they had never successfully applied to the database (each failed at the type-mismatch error before any DDL committed).

---

## 2026-05-28 — AssigneePickerModal: fix z-index arithmetic V-05 violation (Fix)

- `src/styles/design-tokens.css` — `--z-modal-overlay: 61` and `--z-modal-nested: 62` added to the z-index scale; nested modal layering now has named tokens instead of arithmetic
- `src/components/tasks/AssigneePickerModal.tsx` — `calc(var(--z-modal) + 10)` → `var(--z-modal-overlay)`; `calc(var(--z-modal) + 11)` → `var(--z-modal-nested)`; file-header comment updated
- `src/components/CLAUDE.md` — AssigneePickerModal entry updated to reference new token names

No `--color-*` violations were found in `src/components/tasks/` — those tokens are legitimately defined in `design-tokens.css` (section 7) and are correct per the Surface Contract. The actual violation was V-05 (z-index arithmetic), not V-01.

---

## 2026-05-28 — PersonalTasksTab: fix duplicate task creation on fast Enter (Fix)

- `src/components/tasks/PersonalTasksTab.tsx` — `useTransition` now destructures `isPending`; `handleQuickAddSave` guards with `if (isPending) return` as first statement, making all subsequent Enter presses a no-op until the transition completes; `isSavingQuickAdd` boolean state removed entirely; title input gains `disabled={isPending}` + `opacity: isPending ? 0.6 : 1`; Save button uses `isPending` for `disabled`, `cursor`, `opacity`, and label text ("Saving…")

---

## 2026-05-28 — getPersonalTasks: fix NULL due_at cursor pagination bug (Fix)

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.cursor` changed from `string | null` to composite `PersonalTaskCursor = { due_at: string | null, id: string } | null`; `PersonalTasksResult.nextCursor` updated to the same composite type; `getPersonalTasks` now sorts by `due_at ASC NULLS LAST, id ASC` and uses a `.or()` condition covering all four cases of the composite continuation predicate; tasks with no deadline (`due_at IS NULL`) are now visible on every page after the first
- `src/components/tasks/PersonalTasksTab.tsx` — `cursor` state typed as `PersonalTaskCursor | null`; `PersonalTaskCursor` imported from service
- `src/lib/CLAUDE.md` — composite cursor pattern documented under a new "Composite cursor pattern for nullable sort columns" section

---

## 2026-05-28 — get_group_task_summaries: fix SECURITY DEFINER domain bypass (Security)

### What was wrong

Migration 0020's initial `get_group_task_summaries` RPC accepted `p_domain text` as a caller-supplied parameter and used it in `WHERE tg.domain = p_domain`. The comment incorrectly stated "the function does NOT bypass RLS — it runs as the calling user's session." Both claims were wrong: SECURITY DEFINER always runs as the function owner (postgres), which bypasses RLS entirely. Any authenticated caller could pass any domain value and receive results from that domain — the RLS domain guard was effectively off.

### What changed

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` rewritten (migration had not yet run in production): `p_domain` parameter removed; WHERE clause now replicates the `task_groups_select` policy from migration 0018 explicitly using `get_user_role()` and `get_user_domain()` (agent: created_by = auth.uid(); manager: domain = get_user_domain(); admin/founder: all); comment corrected to accurately describe SECURITY DEFINER behaviour
- `src/lib/services/tasks-service.ts` — `getGroupTasks` signature changed from `(domain: string, filters?)` to `(filters?)` — domain is no longer accepted or forwarded; scoping is fully server-enforced
- `src/app/(dashboard)/tasks/page.tsx` — call site updated from `getGroupTasks(profile.domain)` to `getGroupTasks()`
- `src/app/(dashboard)/CLAUDE.md` — updated to reflect the new signature and explain why domain is not passed
- `src/lib/CLAUDE.md` — RPC pattern rules updated: documents that SECURITY DEFINER bypasses RLS, that access control must be replicated in the WHERE clause, and that caller-supplied domain parameters must never be trusted for scoping

### Verified

- `pnpm tsc --noEmit` passes with zero errors
- Domain scoping is now enforced inside the RPC body, not by a caller-supplied parameter
- Comment accurately describes SECURITY DEFINER semantics

---

## 2026-05-28 — getGroupTasks: replace in-memory aggregation with Postgres RPC (Performance)

`getGroupTasks` previously fetched all subtask rows for every group in the domain and aggregated counts in Node. At scale (500 groups × 50 subtasks = 25 000 rows) this would transfer 25 000 rows to render a count badge and 4 avatars.

**Modified files:**

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `get_group_task_summaries(p_status, p_priority)` RPC; GROUP BY on `task_groups` LEFT JOIN `tasks`; returns `subtask_total`, `subtask_completed`, `assignee_ids uuid[]` per group; `SECURITY DEFINER SET search_path = public`; access control replicated in WHERE clause
- `src/lib/services/tasks-service.ts` — `getGroupTasks` rewritten: one RPC call + one batch profile fetch = exactly 2 DB round-trips; zero subtask rows transferred; `subtask_total`/`subtask_completed` cast with `Number()` (Q-09); `assignee_ids` sliced to max 4 in service layer; `GroupTaskSummaryRaw` internal type defined; `any` cast on `.rpc()` because generated types predate the migration
- `src/lib/CLAUDE.md` — RPC aggregation pattern documented for future reference

**Verified:** `pnpm tsc --noEmit` passes; `getGroupTasks` makes exactly 2 DB round-trips; no subtask rows fetched; `GroupTasksTab` component unchanged.

---

## 2026-05-28 — Trigger.dev reminder race window: documented as closed by SDK idempotency guarantee (A-12)

### Modified files

- `src/trigger/task-reminders.ts` — added a detailed comment block at the top of the file documenting the Trigger.dev v3 idempotency key deduplication guarantee for DELAYED runs; confirms the list-snapshot race described in A-12 is structurally impossible because `tasks.trigger()` with an idempotency key matching an existing DELAYED run returns the existing run handle (`isCached: true`) rather than creating a second distinct run; evidence cited from `@trigger.dev/core@4.4.6` apiClient types (line 55) and SDK shared.js (lines 1063–1110); no code change to scheduling or cancellation logic required; no migration required

### Decision log

- Approach chosen: document guarantee (not store-run-ID-in-DB), because the SDK evidence confirms deduplication makes a second concurrent DELAYED run with the same idempotency key impossible. The store-run-ID path would have required migration 0020 + adminClient write in scheduleTaskReminder — complexity not warranted when the race window does not exist.

---

## 2026-05-28 — Tech debt register created; TD-001 logged for leads.ts

### New files

- `docs/tech-debt.md` — tech debt register; tracks pre-existing violations identified but not fixed in the current session; each item has file, rule, what, fix, and logged date

### TD-001 logged

- `src/lib/actions/leads.ts` — inline `getCallerProfile()` is a Rule A-03 / Rule 04 duplicate of `getCurrentProfile()` from `profiles-service.ts`; inline comment added at the violation site referencing TD-001; fix path documented (delete inline fn, import canonical, replace 8 call sites); must be resolved when `leads.ts` is next touched for any reason

---

## 2026-05-28 — tasks.ts: replace local getCallerProfile duplicate with canonical getCurrentProfile (Rule 03/04)

### Modified files

- `src/lib/actions/tasks.ts` — removed local `getCallerProfile()` inline definition (was duplicating `getCurrentProfile` from `profiles-service.ts`); replaced with `import { getCurrentProfile } from '@/lib/services/profiles-service'`; all 7 call sites updated to `getCurrentProfile()`; `createClient` import retained because `canMutateTask` still uses it for the manager domain lookup (user-scoped client, not admin)

---

## 2026-05-28 — Security fix: updateTaskStatusAction + updateTaskAction missing application-layer auth (A-09/S-06)

### Modified files

- `src/lib/actions/tasks.ts` — added `canMutateTask(caller, task)` helper that explicitly enforces the same access rules as the tasks RLS UPDATE policy (agent: `assigned_to OR created_by`; manager: same OR group subtask in caller's domain via `task_groups` join; admin/founder: unrestricted); wired into `updateTaskStatusAction` (step 4 — was entirely absent) and `updateTaskAction` (step 4 — replaced the agent-only check that left managers unguarded); both actions now fetch `group_id` in their task select to support the manager domain check; both fetches still use the user client (RLS layer 1) before the `adminClient` write

---

## 2026-05-28 — Security fix: task_messages RLS creator visibility + manager domain scope (A-09)

### Migration 0019

- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — drops the A-09-violating `task_messages_select` and `task_messages_insert` policies from migration 0017; replaces both with three-tier visibility: (1) assignee or creator of the task — any role, always visible; (2) manager whose domain matches the parent `task_groups.domain` for `group_subtask` tasks; (3) admin/founder unrestricted; fixes two bugs: task creator locked out of own chat thread, and manager cross-domain message leak

---

## 2026-05-28 — Security fix: task_groups RLS domain enforcement (A-09)

### Migration 0018

- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — drops the A-09-violating `task_groups_select` and `task_groups_update` policies from migration 0017; replaces both with domain-scoped versions: `created_by = auth.uid() OR get_user_role() IN ('admin', 'founder') OR (get_user_role() = 'manager' AND get_user_domain() = domain)`; managers can no longer read or mutate task_groups rows belonging to a different domain

---

## 2026-05-28 — Tasks Page (Personal + Group tabs)

### New files

- `src/app/(dashboard)/tasks/page.tsx` — Server Component; fetches `getPersonalTasks` + `getGroupTasks` in `Promise.all`; passes data as props to `TasksShell`; guest → redirect `/dashboard`
- `src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'` tab shell; two tabs: "Personal" + "Group"; active tab persisted to `?tab=personal|group` URL param via `useSearchParams` + `useTransition` + `router.push`; browser back/forward works
- `src/components/tasks/PersonalTasksTab.tsx` — filter bar (Status multi-select pills, Priority multi-select pills, due date range); quick-add inline row (priority selector + title input + due date + assignee picker, Enter=save, Esc=cancel); task list rows with 3px priority left border, title, due date, status pill; click row → `TaskModal`; "Load more" cursor pagination; `AssigneePickerModal` portaled to `document.body`; Playfair italic empty state
- `src/components/tasks/GroupTasksTab.tsx` — accordion group list; one group expanded at a time (no conflicting Framer Motion); group row: title, priority border, status pill, due date, subtask count + progress%, member avatar stack (max 4 + overflow); subtask rows: title + status pill + assignee avatar; subtask add row at bottom of expanded group with assignee picker; click subtask → `TaskModal`; `AssigneePickerModal` portaled to `document.body`

### Modified files

- `src/lib/services/tasks-service.ts` — `getPersonalTasks` now returns `PersonalTasksResult = { tasks, hasMore, nextCursor }`; LIMIT 50 + 1 (detects `hasMore` without COUNT query); cursor pagination via `due_at > cursor`; new exports: `PersonalTasksResult`, `PERSONAL_TASKS_PAGE_SIZE`
- `src/components/layout/Sidebar.tsx` — "Tasks" nav item added (`CheckSquare`, `/tasks`); position: between Leads and Performance in `MAIN_NAV`

### Contracts established

- `getPersonalTasks` always returns `PersonalTasksResult` — never `Task[]` alone
- `hasMore` is detected by fetching `LIMIT + 1` rows — never a separate COUNT query
- Accordion: `expandedGroupId` state is a single `string | null` — guarantees only one group expanded at a time
- `AssigneePickerModal` always portals to `document.body` when rendered inside a scroll container (never inline)
- Tasks page data is fetched server-side on load — `TasksShell` does not re-fetch on tab switch

### Sign-off

- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ `?tab=` URL param persists on browser back/forward
- ✓ `getPersonalTasks` uses cursor pagination — no unbounded SELECT
- ✓ `AssigneePickerModal` portals to `document.body`
- ✓ Only one group task row expanded at a time (accordion)
- ✗ Tasks not fetched client-side on tab switch — data is passed from the Server Component

---

## 2026-05-28 — Task Modal + Chat Panel (Prompt 3)

### New files

- `src/components/tasks/TaskModal.tsx` — two-column task detail modal (55% details / 45% chat); inline title + description editing with 400ms debounce, flushed synchronously on close; 6-state segmented status control (2-col grid at ≤480px to prevent overflow); 3-pill priority selector; assignee avatar + meta fields; Framer Motion entrance 200ms ease-out-expo; mobile full-screen bottom sheet with swipe-down-to-dismiss; no `<form>` tag, no internal data fetching
- `src/components/tasks/TaskChatPanel.tsx` — scrollable message list with auto-scroll; Realtime subscription on `task_messages` filtered by `task_id`, channel `task-messages-${taskId}`; optimistic inserts confirmed on Realtime echo, rolled back + `toast.danger` on error; growing textarea (1–3 lines), Enter to send, Shift+Enter newline; Playfair italic empty state; exports `TaskMessageWithAuthor` type
- `src/components/tasks/AssigneePickerModal.tsx` — nested modal (`z-index: var(--z-modal) + 11`); domain tabs (only populated domains shown); client-side search; avatar + role badge per user row; single select + Confirm; exports `AssignableUser` type

### Contracts established

- `TaskChatPanel` channel name must always be `task-messages-${taskId}` — never bare `task-messages`
- `TaskModal` never fetches its own data — receives `task`, `assignee`, `initialMessages` as props
- Debounced inline edits (title/description) are always flushed synchronously in `flushAndClose` before unmounting — no silent data loss on quick close

### Sign-off

- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ Realtime channel uses `taskId` in name
- ✓ Debounced saves flush on modal close
- ✓ All colours reference CSS token vars — zero hex values
- ✓ Mobile status grid uses 2-col at ≤480px
- ✗ No `<form>` tags used anywhere in the three components

---

## 2026-05-28 — OS Tasks: service + action layer

### New files

- `src/lib/constants/task-constants.ts` — `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` typed const objects; labels, colors as CSS token names (never hex), sort order
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema`, `CreateGroupTaskSchema`, `CreateSubtaskSchema`, `UpdateTaskSchema`, `UpdateTaskStatusSchema`, `AddTaskMessageSchema`, `DeleteTaskSchema` + inferred input types; priority/status as inline `z.enum`; all text fields run through `sanitizeText`
- `src/lib/services/tasks-service.ts` — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskMessages`; `getGroupTasks` uses a single flat query + in-memory aggregation to avoid N+1; batch profile fetch for assignee avatars; composite types: `TaskGroupRow`, `SubtaskWithAssignee`, `TaskWithMessages`, `AssigneeSlim`
- `src/trigger/task-reminders.ts` — `scheduleTaskReminder(taskId, dueAt, assignedTo)` one-time delayed job; `cancelTaskReminder(taskId)` finds and cancels by tag (`task-reminder-${taskId}`); past-date guard: no-op when `dueAt - 30min < now()`; `sendTaskReminderTask` exported for Trigger.dev scan
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskMessageAction`; all actions: Zod first, `{ data, error }` return, no throws; `deleteTaskAction` cancels Trigger.dev reminder **before** DB delete — if cancel throws, delete is aborted

### Package added

- `@trigger.dev/sdk@4.4.6` — async job scheduling for task reminders; one-time delayed jobs via `tasks.trigger()` with `delay: Date`; cancellation via `runs.cancel()` using tag-based run discovery

### Updated docs

- `src/lib/CLAUDE.md` — services registry, actions registry, Trigger.dev jobs section, `createNotification` call sites for tasks

### Pre-mortem invariants met

- `getGroupTasks`: zero N+1 — one group query + one subtask query + one profile query, then O(subtasks) aggregation in memory
- `scheduleTaskReminder`: no-op guard when `dueAt - 30min <= now()`; never errors on past dates
- `deleteTaskAction`: Trigger.dev cancel precedes DB delete; cancel failure aborts delete
- All `TASK_STATUS` colors reference CSS token names (`var(--theme-accent)` etc.) — no hex values

---

## 2026-05-28 — Migration 0017: OS Tasks schema (task_groups, task_messages, tasks core upgrade)

### Migration `20260528000017_os_tasks.sql`

**Part A — tasks core table extended:**

- `title text NOT NULL` added; existing rows backfilled with `'(untitled)'`
- `description text` added (nullable)
- `priority text NOT NULL DEFAULT 'normal'` added; CHECK `IN ('urgent','high','normal')`
- `task_category text NOT NULL DEFAULT 'personal'` added; CHECK `IN ('personal','group_subtask','gia_followup')`; backfilled: rows with a `task_gia_meta` match → `'gia_followup'`, others → `'personal'`
- `group_id uuid` added; FK → `task_groups(id) ON DELETE CASCADE`; nullable
- Status enum migrated: `'pending'` → `'to_do'`, `'done'` → `'completed'`; new CHECK: `to_do | in_progress | in_review | completed | error | cancelled`
- New indexes: `idx_tasks_category`, `idx_tasks_group_id`, `idx_tasks_priority`

**Part B — `task_groups` table created:**

- Full RLS: SELECT (owner or manager+), INSERT (any authed), UPDATE (owner or manager+), DELETE (admin/founder)
- `update_updated_at()` trigger reused (not recreated)
- Indexes: `idx_task_groups_domain` (partial), `idx_task_groups_created_by`

**Part C — `task_messages` table created (append-only):**

- No UPDATE or DELETE RLS policies — enforced at policy level (rule A-11)
- SELECT/INSERT RLS mirrors tasks visibility via indexed EXISTS subquery (no full table scan)
- Realtime enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE task_messages`

**Part D — notifications type expanded:**

- `task_assigned` added to `notifications_type_check` CHECK constraint

### TypeScript (`src/lib/types/database.ts`)

- `TaskStatus` updated: `to_do | in_progress | in_review | completed | error | cancelled`
- `TaskPriority` type added: `urgent | high | normal`
- `TaskCategory` type added: `personal | group_subtask | gia_followup`
- `Task` type extended: `title`, `description`, `priority`, `task_category`, `group_id` added
- `TaskGroup` type added
- `TaskMessage` type added
- `NotificationType` extended: `task_assigned` added
- `Database` tables: `task_groups` and `task_messages` entries added; `tasks` Insert type updated

### Components

- `src/components/notifications/NotificationItem.tsx` — `task_assigned` case added to exhaustive switch (maps to `CheckSquare` icon); `task_due` was already present; Q-11 still satisfied

---

## 2026-05-28 — assertNever moved to shared util

- `src/lib/utils/assert-never.ts` — created. Single export, three lines. `assertNever(x: never): never` is now the canonical exhaustive-switch helper for the entire codebase. Use it as the final return of any `switch` over a union type — TypeScript errors at build time if any case is unhandled.
- `src/components/notifications/NotificationItem.tsx` — inline `assertNever` definition removed. Now imports from `@/lib/utils/assert-never`. `default: return Bell` branch removed — the switch is fully exhaustive over `NotificationType`.
- `docs/The_Rules.md` — Q-11 added: exhaustive switches must use `assertNever` from `lib/utils/assert-never.ts`. No `default` branch on union-type switches.

---

## 2026-05-28 — Phase 9 post-ship: toast store hardening + exhaustive notification icon map

- `src/lib/toast.ts` — `_update()` now patches items in `_queue` as well as `_toasts`. A `toast.resolve(id)` called while the loading toast is still queued (3 other toasts visible) no longer silently drops the patch — the resolved state is carried into the item when it promotes to visible. `subscribeQueue` removed from public API; `"queue"` renamed to `"_queue_internal"` to prevent external listeners from registering without cleanup.
- `src/components/ui/toast-provider.tsx` — `useEffect` made explicit: `unsubscribe` assigned to a named const before return, plus `setToasts(toastStore.getToasts())` on mount to sync any toasts fired before the provider mounted (hot reload edge case).
- `src/components/notifications/NotificationItem.tsx` — `default: return Bell` branch replaced with `return assertNever(type)`. Adding a new `NotificationType` to `database.ts` without updating the icon map now fails at build time, not silently at runtime.

---

## 2026-05-28 — Phase 9 — Toast system + Persistent notification inbox shipped

### Part A — Toast System (ephemeral, client-only, no DB)

- `src/lib/toast.ts` — singleton store with pub/sub via `EventTarget` (no React dependency, no zustand). Exports `toast.success/danger/warning/info/loading/lia/resolve/dismiss/dismissAll`. `danger` duration = 0 (never auto-dismisses). `loading` duration = 0 (lives until `resolve()`). `resolve()` patches in-place by same id — no flicker.
- `src/components/ui/toast-item.tsx` — single toast card. Section 13.2 anatomy. 3px living bar via `eia-toast-bar-breathe` CSS keyframe (fires once; `lia` type uses continuous `eia-lia-breathe`). Warning depletion bar via new `toast-deplete` CSS keyframe (linear timing — intentional). Icon crossfade on loading→resolved via `AnimatePresence mode="wait"`. Hover/focus pauses dismiss timer; leaving resumes remaining time.
- `src/components/ui/toast-provider.tsx` — subscribes to toast store. Max 3 in DOM, queue the rest. Section 13.6 stagger: scale 1.0/0.95/0.90, translateY 0/−8px/−14px. Desktop: bottom-right. Mobile: bottom full-width, clears 80px nav.
- `src/hooks/useToast.ts` — thin re-export of `toast` singleton for React consumers.
- `src/app/(dashboard)/layout.tsx` — `<ToastProvider />` added after `<Sidebar />`, outside scroll container.
- `src/styles/design-tokens.css` — `toast-deplete` keyframe added (Section 15, after existing animations).

### Part B — Persistent Notification Inbox (DB + Realtime + Bell UI)

- Migration `20260528000016_notifications.sql` — `notifications` table; `recipient_id` FK → `profiles(id)` ON DELETE CASCADE; `action_url` CHECK constraint rejects absolute URLs; partial index on unread; full index on all; RLS: SELECT own only, UPDATE own only (mark read), no INSERT policy (service-role only), no DELETE; `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`.
- `src/lib/types/database.ts` — `NotificationType`, `Notification` types added.
- `src/lib/services/notifications-service.ts` — `getUnreadNotifications`, `getNotifications`, `markNotificationRead`, `markAllNotificationsRead` (server client); `createNotification` (admin/service-role client only).
- `src/lib/actions/notifications.ts` — `markNotificationReadAction(id)`, `markAllReadAction()`. Both begin with Zod. Both return `{ data, error }`.
- `src/hooks/useNotifications.ts` — THE single owner of notification state. Seeds from server prop. Realtime subscription filtered strictly at channel level by `recipient_id=eq.${userId}`. Optimistic updates for markRead/markAllRead. Unsubscribes on unmount.
- `src/components/notifications/NotificationBell.tsx` — bell icon, single unread dot (never a number badge), wraps panel.
- `src/components/notifications/NotificationPanel.tsx` — dropdown 380px, scrollable list 420px max, empty state Playfair italic, header + mark-all-read, entrance 150ms ease-out-expo.
- `src/components/notifications/NotificationItem.tsx` — unread dot (always rendered, transparent when read), type icon, title/body/timestamp (`formatRelativeTime`). Validates `action_url` as relative path before `router.push`.
- `src/lib/utils/dates.ts` — `formatRelativeTime()` added.
- `src/components/layout/Sidebar.tsx` — stub bell replaced with `<NotificationBell>`. Accepts `initialNotifications` prop.
- `src/app/(dashboard)/layout.tsx` — fetches `getNotifications(profile.id)` and passes as `initialNotifications` to Sidebar.
- `src/lib/actions/leads.ts` — `createNotification` wired: `updateLeadStatus` → `won` notifies domain managers; `assignLead` → notifies receiving agent; `createManualLead` → notifies assigned agent when different from caller.
- `src/components/CLAUDE.md` — Toast system and Notification components documented.
- `src/components/notifications/CLAUDE.md` — created.
- `src/lib/CLAUDE.md` — `createNotification()` call sites and action patterns documented.

---

## 2026-05-28 — Performance page — fix: all_time delta arrows verified as "—", agentCount and mean-of-means documented

- `src/lib/services/performance-service.ts` — comments added: unweighted mean-of-means is intentional (each agent counts equally regardless of lead volume); `agentCount` is roster-based not activity-based; both design decisions documented with guidance on how to change them if ever needed
- `src/app/(dashboard)/performance/CLAUDE.md` — same two contracts documented: averaging method and agentCount distinction
- Verified (no code change needed): `all_time` period renders `"—"` on all four delta arrows. Chain: `getPreviousPeriodDateRange('all_time') → null` → `getPreviousPeriodCoreMetrics` returns `null` without querying → `CoreFourGrid` receives `previous={null}` → all four `delta:` entries short-circuit to `null` → `MetricCard` renders `"—"` in `--theme-text-tertiary`

---

## 2026-05-28 — Number formatting cleanup — formatCompact/formatPercent applied across 5 widget and campaign components — 2026-05-28

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — `tasks.length` and `newLeadsCount` wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `grandTotal`, `t.count` (legend), `agent.total` (per-agent row) wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `total` stat display wrapped with `formatCompact()`; `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/campaigns/CampaignCard.tsx` — `{count}` in `MetricPill` wrapped with `formatCompact(count)`

---

## 2026-05-28 — Campaign detail: metrics strip (6 stat cards + agent distribution) — Phase 8

- Migration `20260528000015_campaign_detail_metrics.sql` — `get_campaign_detail_metrics` RPC (status/outcome counts + `avg_hours_to_first_touch` via lateral join to `lead_activities`); `get_campaign_agent_distribution` RPC (single `GROUP BY assigned_to` join to `profiles` — never N+1)
- `src/lib/utils/numbers.ts` — `formatCompact`, `formatPercent`, `formatCount`, `formatCurrency` fully implemented per design-dna §8.2 (were stubs previously)
- `src/lib/types/database.ts` — `CampaignDetailMetrics` (extends `CampaignMetrics` + `avg_hours_to_first_touch: number | null`) and `AgentDistributionRow` types added
- `src/lib/services/leads-service.ts` — `getCampaignDetailMetrics(campaignName, filters)` and `getCampaignAgentDistribution(campaignName, filters)` added; both cast `bigint → Number()` per Q-09; both silently return null/[] on RPC error
- `src/components/campaigns/CampaignMetricsStrip.tsx` — server component; 6 stat cards (Total Leads, Won + conv. rate, Active Pipeline, Junk Rate, RNR, Avg. First Touch); division-by-zero guarded on all rate fields; all colours CSS tokens
- `src/components/campaigns/AgentDistributionBar.tsx` — `'use client'`; stacked bar `h-2 radius-full`; Framer Motion `layoutId` + `animate={{ width }}` per segment (never CSS width transition); legend with colour dots + name + count; hidden when `distribution.length <= 1`
- `src/components/campaigns/CampaignMetricsStripSkeleton.tsx` — 6 skeleton stat cards per §11.3; stagger 0→320ms per §11.4
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — two independent Suspense boundaries (metrics + table stream separately); `CampaignMetricsAsync` runs `Promise.all([getCampaignDetailMetrics, getCampaignAgentDistribution])` in parallel; `campaignName` decoded once and used identically for both RPCs and the leads query (no mismatch)
- `src/app/(dashboard)/campaigns/CLAUDE.md` — updated: detail page architecture, two new RPCs, Promise.all contract, division-by-zero guard, agent distribution bar rule

---

## 2026-05-28 — Campaign analytics command center — list + detail pages, get_campaign_metrics RPC, two indexes — Phase 8

- Migration `20260528000014_campaign_analytics.sql` — two partial indexes (`idx_leads_campaign_domain`, `idx_leads_campaign_status`); `get_campaign_metrics` SQL function (STABLE SECURITY DEFINER) using conditional `COUNT(*) FILTER (WHERE ...)` aggregates — one round trip regardless of campaign count; `p_domain`, `p_date_from`, `p_date_to` params
- `src/lib/types/database.ts` — `CampaignMetrics` type added; `CampaignFilters` type added
- `src/lib/services/leads-service.ts` — `getCampaignMetrics(role, callerDomain, filters)` added; manager domain constraint enforced before RPC call; RPC column names mapped to clean `CampaignMetrics` shape; `bigint` → `number` cast
- `src/components/campaigns/CampaignFilters.tsx` — `'use client'`; Domain (single select, hidden for manager), Date range; `useTransition` on all navigations; Clear button when any filter active
- `src/components/campaigns/CampaignCard.tsx` — interactive card per §5.04; hover `--shadow-2 + translateY(-1px)`; left: campaign name + domain badge; right: 7 metric pills (total/won/in_discussion/nurturing/lost/junk/rnr); Framer Motion staggered entrance §11.4; `router.push('/campaigns/[encodedName]')` on click
- `src/components/campaigns/CampaignListSkeleton.tsx` — 5 skeleton rows; card shell + name/domain-pill + 7 metric-pill skeletons; stagger 0/80/160/240/320ms §11.4
- `src/components/campaigns/CampaignListAsync.tsx` — async server component; direct child of Suspense; calls `getCampaignMetrics`; Playfair italic empty state
- `src/app/(dashboard)/campaigns/page.tsx` — server component; agent/guest → redirect `/dashboard`; manager domain pre-locked; `<CampaignFilters>` + `<Suspense><CampaignListAsync /></Suspense>`
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — server component; `id` = `encodeURIComponent(utm_campaign)`; `decodeURIComponent` on params; calls `getLeadsByRoleCached` with `{ campaign: decodedName }`; renders existing `<LeadsTable>` + `<LeadsPagination>`
- `src/components/layout/Sidebar.tsx` — "Campaigns" nav item added (`TrendingUp` icon, `/campaigns` route); visible for manager + admin + founder; "Analytics" section label added
- `src/app/(dashboard)/campaigns/CLAUDE.md` — created: RPC pattern, campaign id encoding contract, domain-lock rule, URL param keys

---

## 2026-05-28 — Performance page — team benchmarks layer (domain avg. touch rate, response time, conversion rate; agentCount guard; accent pip for above-average metrics) — Phase 9

- `src/lib/services/performance-service.ts` — `TeamBenchmarks` type exported; `getTeamBenchmarks(callerDomain, period)` added: 1 query for peer agent IDs, 3 flat queries scoped to `assigned_to IN (agentIds)` (never N queries); `agentCount < 2` guard returns all nulls; `leadsWon` intentionally excluded
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — sixth call added to `Promise.all`; `domain` prop added (server-side from `profile.domain`, never a URL param); `benchmarks` passed to `CoreFourGrid`
- `src/app/(dashboard)/performance/page.tsx` — `domain={profile.domain}` passed to `PerformanceAsync`
- `src/components/performance/CoreFourGrid.tsx` — `TeamBenchmarks` type imported; `benchmarks: TeamBenchmarks | null` prop added; benchmark line renders below delta per card (absent not "—" when null); accent pip on above-average metrics; response time uses inverse comparison (lower is better)
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — two extra skeleton lines added to Touch Rate, Avg Response Time, Conversion Rate cards; Leads Won card unchanged
- `src/app/(dashboard)/performance/CLAUDE.md` — updated with `getTeamBenchmarks` signature, `TeamBenchmarks` type, agentCount guard rule, benchmark null contract (absent vs "—")

---

## 2026-05-28 — Performance page — agent self-view (Core Four metrics, effort layer, call outcome breakdown, period selector) — Phase 8

- Migration `20260528000013_performance_indexes.sql` — three partial indexes: `idx_lead_activities_actor_status`, `idx_lead_notes_author_outcome`, `idx_leads_assigned_status_created`
- `src/lib/services/performance-service.ts` — new dedicated service; `getCoreFourMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getPreviousPeriodCoreMetrics`, `getPeriodDateRange`, `getPreviousPeriodDateRange`, `_getCoreFourMetricsForRange`; IST-correct period boundaries; null contract for `avgResponseTimeMinutes` and `conversionRate`
- `src/lib/utils/dates.ts` — `formatDuration(minutes: number | null)` added: null → "—", < 60m → "48m", ≥ 60m → "2h 34m"
- `src/app/(dashboard)/performance/page.tsx` — agent-only server component; non-agent roles redirect to `/dashboard`; reads `searchParams.period`; Suspense boundary around `PerformanceAsync`; `PerformanceMotivationalFooter` (Playfair italic, Lia's voice)
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — async server component; direct child of Suspense; calls all 5 service functions in `Promise.all`
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — 2×2 Tier-1 + 4 compact Tier-2 + 1 wide Tier-3; stagger 0/80/160/240ms per §11.4
- `src/components/performance/PerformancePeriodSelector.tsx` — `'use client'`; URL param only; `useTransition` on all pushes; tab-style ghost buttons
- `src/components/performance/CoreFourGrid.tsx` — `'use client'`; 2×2 grid; Playfair serif primary values; unicode delta arrows (↑ ↓); success/danger text colours; null → "—"
- `src/components/performance/EffortGrid.tsx` — `'use client'`; 4-col compact cards; live-state dots on in_discussion (info) and nurturing (warning); sans-serif numbers
- `src/components/performance/CallOutcomeBar.tsx` — `'use client'`; horizontal segmented bar; all CSS variable colours; Playfair italic empty state per V-09
- `src/components/layout/Sidebar.tsx` — Performance nav item added (BarChart2, below Leads)
- `src/app/(dashboard)/performance/CLAUDE.md` — created

---

## 2026-05-28 — Dashboard widgets — fix: startTransition called during render

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — initial data fetch moved from render-phase guard (`if (!loaded && !isPending)`) into `useEffect`; `cancelled` flag prevents state update on unmounted component
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — same fix applied
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same fix applied

Root cause: `startTransition` is a side effect and cannot be called during the render phase. React throws "Cannot call startTransition while rendering." All three widgets now use the same `useEffect` + `startTransition` pattern already present in `AgentActivityWidget` and `ManagerLeadVolumeWidget`.

---

## 2026-05-28 — Dashboard widget system: canvas, registry, useDashboardLayout hook, 5 Gia widgets (agent tasks, agent activity, manager status, manager volume, manager campaigns) — Phase 7

- `src/lib/constants/dashboard-widgets.ts` — widget registry: 5 entries with id, label, description, roles, domains, defaultSize, module; `DEFAULT_LAYOUT_BY_ROLE` per role; `WIDGET_MAP`, `isValidWidgetId`
- `src/hooks/useDashboardLayout.ts` — localStorage layout hook; key `eia:dashboard:layout:${userId}:v1`; validates ids against registry; hydrates after mount; returns layout + CRUD operations
- `src/components/dashboard/WidgetSkeleton.tsx` — size-aware shimmer skeleton
- `src/components/dashboard/DashboardWidgetSlot.tsx` — Suspense boundary; static `React.lazy` import map; 150ms min skeleton; edit mode chrome
- `src/components/dashboard/DashboardCanvas.tsx` — 2-col grid; `@dnd-kit/sortable` drag; edit mode toggle; hydration-safe full-canvas skeleton
- `src/lib/services/dashboard-service.ts` — dedicated dashboard queries; never mixed into `leads-service.ts`
- `src/lib/actions/dashboard.ts` — 5 server actions; all re-verify via `getCurrentProfile()`
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — overdue + today tasks + new leads count
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Realtime subscription filtered by actor_id; Framer Motion slide-in on new items; subscription cleaned up on unmount
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — stacked bar pipeline + per-agent breakdown
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — Recharts LineChart; period toggle; all colours CSS vars
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — Recharts stacked BarChart per utm_campaign
- `src/app/(dashboard)/dashboard/page.tsx` — replaced placeholder with `<DashboardCanvas>`
- `src/app/(dashboard)/CLAUDE.md` — created: full widget system documentation
- `recharts@3.8.1` — added (Q-05: first chart package; dashboard widgets only; Recharts not imported at page level — only inside widget components that use it)

---

## 2026-05-28 — Gia — Campaign ad video preview modal — Phase 6

Click `utm_campaign` on the lead dossier to play the Meta ad creative that generated the lead. If no creative row exists the field renders as plain static text — zero visual change.

- Migration 0012: `ad_creatives` table — `campaign_key` (UNIQUE, normalised via CHECK constraint), `video_url`, `thumbnail_url`, `ad_name`, `notes`; RLS: SELECT open to all authenticated, INSERT/UPDATE/DELETE admin/founder only; `idx_ad_creatives_campaign_key` index
- `src/lib/types/database.ts` — `AdCreative` type added; `ad_creatives` table added to `Database.public.Tables`
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign(campaignName)`: normalises input (toLowerCase + trim), queries `ad_creatives` by `campaign_key`, returns `AdCreative | null`, never throws
- `src/components/leads/CampaignVideoModal.tsx` — new modal composing `ui/modal.tsx`; `max-w-2xl`; native `<video>` with `autoPlay muted playsInline controls`; video.play() via ref after mount with silent `NotAllowedError` catch; Framer Motion entrance from `ui/modal.tsx` (350ms ease-out-expo)
- `src/components/leads/LeadInfoCard.tsx` — converted to `'use client'`; accepts `adCreative?: AdCreative | null` prop; `AttributionTrigger` sub-component added; campaign field renders as interactive trigger (cursor-pointer, hover → `--theme-accent` + underline, 150ms transition) when creative exists; `ad_name` field also interactive when `adCreative.ad_name === lead.ad_name`; `CampaignVideoModal` rendered conditionally
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativeForCampaign(lead.utm_campaign)` added to existing `Promise.all` block; skipped (returns null) when `lead.utm_campaign` is null; result passed as `adCreative` prop to `LeadInfoCard`

---

## 2026-05-28 — Gia — Won action restored on lead dossier (In Discussion)

`StatusActionPanel` — Won button + confirm modal when status is `in_discussion`; calls existing `updateLeadStatus('won')`. Restores spec behaviour removed during the Level Up refactor.

---

## 2026-05-28 — Gia — Leads table Assigned To column shows agent name

`getLeadsByRole` now joins `profiles!leads_assigned_to_fkey(full_name)` in the same query; `LeadWithAssignee` type added. `LeadsTable` Assigned To cell renders `assignee.full_name` instead of the raw UUID.

---

## 2026-05-28 — Layout — Sidebar logo: remove domain module label

Removed the italic module name (Gia, Hia, Sia, etc.) below the sidebar logo. Deleted unused `DOMAIN_MODULE_NAMES` from `src/lib/constants/domains.ts`.

---

## 2026-05-28 — Gia — Fix getNextLeadTask broken filter (Phase 6)

Inverted join direction in `getNextLeadTask` — now starts from `tasks` with `!inner` on `task_gia_meta` to filter by `lead_id`. Previous version started from `task_gia_meta` and used dot-notation (`.eq('tasks.status', ...)`, `.order('tasks.due_at', ...)`) which PostgREST / Supabase JS client silently drops, causing the status filter and ordering to be no-ops and `.limit(1)` to return an arbitrary row. Native column filters (`status`, `due_at`) are now applied directly on the root `tasks` table. Return type `Task | null` and `LeadDossierTasksAsync` unchanged.

---

## 2026-05-28 — Gia — Fix N+1 queries on lead dossier (Phase 6)

Repaired `Relationships` arrays in `database.ts` for `lead_notes`, `lead_activities`, `tasks`, and `task_gia_meta` — all were `[]` despite FK constraints existing in Postgres. Collapsed `getLeadNotesFull`, `getLeadActivitiesFull`, and `getNextLeadTask` from 5 sequential round trips to 3 parallel single-query joins using inline FK disambiguators. `getProfileNameMap` is no longer called from any lead service function (marked for future removal). Updated `LeadNoteWithAuthor` (`author.full_name`) and `LeadActivityWithActor` (`actor?.full_name`) types and all consumers (`LeadNotesSection`, `LeadActivityLog`). `pnpm tsc --noEmit` passes with zero errors.

---

## 2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

---

## 2026-05-28 — Gia — Leads page header: serif title + status summary pills

2026-05-28 — Gia — Leads page header: serif title + status summary pills (eyebrow removed per product)

---

## 2026-05-28 — Gia — LeadInfoCard contact fields redesign

LeadInfoCard contact fields redesigned — labelled datum row pattern with consistent icon rail, mono phone, micro-label typography; 2026-05-28, Phase 6.

---

## 2026-05-28 — Gia — Leads: server-side search, pagination, phone text index

Leads — server-side search (ilike across name/phone/email), pagination (50/page, URL-param driven), migration 0011 phone text index; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000011_lead_search_index.sql` — `idx_leads_phone_text` on `leads(phone text_pattern_ops) WHERE archived_at IS NULL`; enables ILIKE substring search without sequential scan.
- `src/components/leads/LeadsPagination.tsx` — `'use client'` component; "Showing X–Y of Z leads" count; Prev/Next buttons with `ChevronLeft`/`ChevronRight`; `useTransition` on all navigation; `pointer-events: none` on disabled state (not just `opacity`); rendered only when `totalCount > pageSize`.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters.search: string | null` added.
- `src/lib/services/leads-service.ts` — `getLeadsByRole` return type changed from `Lead[]` to `LeadsResult = { leads, totalCount }`. Count obtained via `{ count: 'exact', head: false }` on the same query builder — one round trip. Search applied as `.or(first_name.ilike.%term%,...,email.ilike.%term%)` after role constraints, before `.range()`. Term trimmed and lowercased in service.
- `src/components/leads/LeadsFilters.tsx` — search input added to filter bar (Section 5.10 spec); 500ms debounce via `useEffect`+`setTimeout`, no library; clear X button; `search` counted in active filter badge; `buildParams` deletes `page` on every change → automatic page-1 reset; `clearAll` clears search local state and URL simultaneously.
- `src/components/leads/LeadsTable.tsx` — all client-side search code removed (`useState`, `useMemo`, `Search` icon, search input, `filtered` variable). Table is now display-only — it renders what the server returned.
- `src/components/leads/LeadsTableAsync.tsx` — destructures `{ leads, totalCount }` from `getLeadsByRole`; renders `LeadsTable` + `LeadsPagination` (conditional on `totalCount > pageSize`); `search` filter included in `hasActiveFilters` check.
- `src/components/leads/LeadsTableSkeleton.tsx` — skeleton rows increased from 5 to 50 (matches `pageSize`); prevents layout height jump between skeleton and real content during pagination navigation.
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` now includes `search: getString('search')`.
- `src/app/(dashboard)/leads/CLAUDE.md` — updated with server-side search spec, `LeadsResult` return shape, pagination render condition, 500ms debounce rule, and page-reset contract.

---

## 2026-05-28 — Gia — Leads filter: Suspense-split architecture + server-side URL-param filters

Leads filter — Suspense-split architecture, server-side URL-param filters (status, outcome, source, campaign, agent, date range), migration 0010 indexes; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000010_lead_filter_indexes.sql` — three partial indexes on `leads`: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` (all `WHERE archived_at IS NULL`). `IF NOT EXISTS` on indexes only — no RLS changes.
- `src/lib/constants/lead-sources.ts` — `LEAD_SOURCES`, `LeadSource`, `LEAD_SOURCE_LABELS` constants. Values: `meta | google | website`. No inline literals in components.
- `src/components/leads/LeadsFilters.tsx` — `'use client'` filter bar. Reads/writes URL params only. Six controls: Status (multi), Outcome (multi), Source (single), Campaign (single, server prop), Agent (single, server prop, absent for `agent` role), Date range. Active filter badge. `useTransition` on all `router.push` calls. Never fetches data.
- `src/components/leads/LeadsTableAsync.tsx` — async server component. Calls `getLeadsByRole` with `LeadFilters`. Renders `<LeadsTable>`. No UI of its own. Direct child of `<Suspense>` in `page.tsx`.
- `src/app/(dashboard)/leads/CLAUDE.md` — documents the three-component split, `LeadFilters` type location, `showAgentFilter` contract, `date_to` end-of-day rule, `getLeadFilterOptions` call location, and `page`/`pageSize` pagination readiness.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters` type added (status, last_call_outcome, agent_id, source, campaign, date_from, date_to, page, pageSize).
- `src/lib/services/leads-service.ts` — `getLeadsByRole` extended to accept `LeadFilters`; builds a single chained Supabase query; `.range()` always applied (never conditional); agent role constraint enforced before `LeadFilters.agent_id`; `date_to` end-of-day transform (`T23:59:59.999Z`) in service, not component. New `getLeadFilterOptions(role, domain)` returns `{ campaigns, agents }` — called once at page level.
- `src/components/leads/LeadsTable.tsx` — accepts `hasActiveFilters` prop; internal `statusFilter` state removed (server-side now); Framer Motion entrance `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}` per Section 11.5 (250ms, 100ms delay, ease-out-expo); empty state updated to "Nothing matches these filters." (Section 8.6).
- `src/components/leads/LeadsTableSkeleton.tsx` — rebuilt to spec: 5 rows (Section 11.3), staggered pulse per Section 11.4 (0/80/160/240/320ms), column widths match spec.
- `src/app/(dashboard)/leads/page.tsx` — restructured as thin orchestrator: fetches `filterOptions` once, parses `searchParams` into `LeadFilters`, renders `<LeadsFilters>` (stable) + `<Suspense><LeadsTableAsync /></Suspense>`.

---

## 2026-05-28 — Gia — LeadInfoCard AttributionStrip

LeadInfoCard: UTM section redesigned as AttributionStrip with accent-tone treatment and campaign repatriated — 2026-05-28, Phase 6

---

## 2026-05-28 — Gia — Leads table column visibility picker + drag-to-reorder

### New packages (Q-05)

- `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` — drag-to-reorder in the column picker. Selected over `react-beautiful-dnd` (unmaintained) and hand-rolled pointer listeners (no accessible keyboard support). `@dnd-kit` is now the **canonical drag library for all of Eia** (see rule Q-07).

### Files added

- `src/lib/constants/lead-columns.ts` — column registry: 11 columns, each with a stable `id` (localStorage key — never rename after shipping), `label`, `defaultVisible`, `locked`. `status` and `name` are locked always-visible.
- `src/hooks/useLeadColumnPreferences.ts` — `useLeadColumnPreferences(userId)` reads/writes `localStorage` at `eia:leads:columns:${userId}:v1`; validates stored ids against registry on load (unrecognised ids silently dropped); locked columns always enforced in `visibleColumns`; hydrates after mount (no SSR mismatch). Returns `{ visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults }`. This hook is the **canonical pattern** for per-user table column preferences across Eia (see rule Q-08).
- `src/components/leads/LeadColumnPicker.tsx` — popover panel (not a modal); `@dnd-kit/sortable` for visible-column drag-to-reorder; locked rows show `Lock` icon and are excluded from the drag context; hidden columns shown below a divider, non-draggable; "Reset to defaults" footer; 200ms `opacity/y` entrance animation matching dropdown spec from design-dna.md §5.09.

### Files modified

- `src/components/leads/LeadsTable.tsx` — accepts `userId` prop; "Columns" ghost button (`Columns` lucide icon, `w-4 h-4`, stroke `1.5`) opens picker before filter controls; table renders only `orderedVisible` columns in stored order via a `LeadCell` switch covering all 11 ids; no Supabase re-query on toggle — purely presentational.
- `src/app/(dashboard)/leads/page.tsx` — passes `profile.id` as `userId` to `LeadsTable`.

### Conventions locked in

- Rule Q-07 added to `The_Rules.md`: `@dnd-kit` is the only drag library permitted in Eia.
- Rule Q-08 added to `The_Rules.md`: column preference hooks always follow the `useLeadColumnPreferences` signature and `eia:[module]:columns:${userId}:v1` key format.

## 2026-05-28 — Gia — Add Lead modal: removed E.164 hint and intent chips; added Source field (WhatsApp, Website, Meta, Google, Referral, YPO, Events) stored in form_data.manual_source

---

## 2026-05-28 — Gia — Add Lead modal: manual lead creation with phone dedup, domain enforcement, and agent assignment

---

## 2026-05-28 — Documentation

README.md created at repo root — project overview, phase status, stack, RBAC, planned modules. 2026-05-28.

---

## 2026-05-27 — Phase 6 complete

### `ui/Modal` primitive + modal refactor

- `src/components/ui/modal.tsx` — chrome-only Modal primitive: backdrop (`fixed inset-0`, `rgba(0,0,0,0.5)`, `backdrop-blur-sm`, `z-[--z-overlay]`), container (`bg var(--theme-paper)`, `radius-lg`, `shadow-3`, `z-[--z-modal]`), header, body slot, footer slot; Framer Motion `AnimatePresence` — enter `{ opacity:0, y:10, scale:0.98 }→{ opacity:1, y:0, scale:1 }` at 350ms `ease-out-expo`, exit `{ opacity:0, scale:0.97 }` at 150ms; Escape key listener; backdrop click → `onClose`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId()`; zero hardcoded colour values
- `CalledModal`, `ConfirmModal`, `ReasonModal` refactored to compose `Modal`; own chrome deleted; hardcoded `#fff`/`#ffffff` violations replaced with CSS tokens
- `src/components/CLAUDE.md` updated with props contract and the rule that every future modal composes the primitive

Props: `open: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `footer: React.ReactNode`, `maxWidth?: string` (default `max-w-lg`)

---

## 2026-05-27

### Personal details card on lead dossier

#### Personal details enrichment (Migration 0009)

- `personal_details JSONB` column added to `leads` — stores agent-collected enrichment keyed by field name; existing RLS covers it; no extra policies needed
- `Lead.personal_details: Record<string, string> | null` added to `database.ts`
- `UpdatePersonalDetailsSchema` added to `lead-schema.ts` — five fields (company, occupation, interests, city, notes); each passes through `sanitizeText()`
- `updatePersonalDetails` server action in `leads.ts` — Zod → auth → two-layer access check → merge into existing JSONB (preserves prior keys, strips empty strings)
- `PersonalDetailsCard` — inline card on the dossier left column; dormant read-only view until user clicks a field; 2-col grid (Company, Occupation, Interests, City) + full-width Details textarea; Save + Cancel footer appears only when active; follows `AgentScratchpad` card pattern
- Card is visible to all roles with dossier access; editable by assigned agent, manager (domain), admin, founder

---

### Post-Phase 5 hardening

#### Atomic round-robin agent assignment (Migration 0007)

- Replaced three-query application-layer round-robin with a single `get_next_round_robin_agent()` SECURITY DEFINER function
- `SELECT FOR UPDATE SKIP LOCKED` on `agent_routing_config` — two concurrent webhook calls cannot pick the same agent
- O(agents) not O(leads) — `MAX(assigned_at) GROUP BY` subquery, not a full table scan
- Two-step fallback for agents without a routing config row
- Added `idx_leads_assigned_to_assigned_at` partial index

#### Lead deduplication by phone (Migration 0008)

- Phone is the dedup key. Active lead (`new | touched | in_discussion | nurturing`) → log `duplicate_submission` activity, return existing lead, no new row created
- Terminal lead (`lost | junk | won`) → create new lead, set `previous_lead_id` FK to predecessor
- `get_active_lead_by_phone()` SECURITY DEFINER function with `idx_leads_phone_active` partial index
- `previous_lead_id` self-referential FK added to `leads` table (`ON DELETE RESTRICT`)
- `duplicate_submission` registered as valid `action_type` on `lead_activities`
- `Lead.previous_lead_id` and `duplicate_submission` added to `database.ts` types
- `IngestionResult` union extended with `duplicate: boolean` flag

#### Activity log — assignee name resolution

- `LeadActivityWithActor` type extended with `assignee_name: string | null`
- `getLeadActivitiesFull()` now batch-resolves `details.assigned_to` UUIDs alongside `actor_id` in a single `getProfileNameMap` call — zero extra DB queries
- `LeadActivityLog` component: `lead_created` now reads "Lead entered the system"; `agent_assigned` now reads "Assigned to [Name]"

---

## 2026-05-27 — Phase 5 complete

### Profile page + theme system

- `GET /profile` — server component; 6 card sections (avatar, details, theme, password, notifications)
- `ProfileAvatarSection` — click-to-upload via Supabase Storage `avatars` bucket; initials fallback; role/domain badges
- `ThemeSelector` — 5 swatches; instant DOM switch + async DB persist; no flash on load
- `PasswordChangeForm` — re-authenticates before `updateUser`; live 4-step strength bar
- `NotificationPreferences` — stubbed; "Coming soon"
- Inline `<script>` in dashboard layout sets `data-theme` synchronously before paint
- Sidebar footer → `<Link href="/profile">` with active-state styling

---

## 2026-05-27 — Raw payload logging

- Migration 0004: `lead_raw_payloads` table — immutable JSONB log; `lead_id` backfilled after insert; admin/founder only
- Migration 0005: `ingestion_error` column on `lead_raw_payloads` — marks failed ingestions for the error log
- `lead-ingestion.ts` — logs raw payload as step 1; logging failure is non-fatal
- `adapters.ts` — `adaptMeta` handles three payload shapes: Meta native, Pabbly, flat top-level keys; multi-key fallback for phone/email/ad fields
- `GET /error-log` — admin/founder page showing all errored raw payloads

---

## 2026-05-27 — Phase 4 complete

### Lead dossier + full lifecycle

- `GET /leads/[id]` — server component; parallel fetches; page-level access gate mirrors action-level
- `LeadInfoCard` — contact fields, UTM params, domain/platform/intent
- `StatusActionPanel` — Called/Won/Nurturing/Lost/Junk actions; owns CalledModal + ConfirmModal + ReasonModal
- `CalledModal` — call outcome dropdown + required note; auto-advances `new → touched`
- `AgentScratchpad` — debounced auto-save (1s); assigned agent + admin only
- `LeadNotesSection` — chronological notes timeline with author names + call outcome badges
- `LeadJourneyTimeline` — visual 4-stage path (`new → touched → in_discussion → won`); dwell times; resolution badge
- `LeadActivityLog` — append-only activity history; newest first
- `LeadDossierTasksAsync` — async server component; next pending task; overdue state highlighted

---

## 2026-05-27 — Phase 3 complete

### Gia module: lead ingestion, assignment, lead list

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` with full RLS
- Webhook `POST /api/webhooks/leads` — Bearer auth + in-memory rate limiting
- `ingestLead()` — validate → sanitize → resolve domain → round-robin assign → insert → log activities
- `LeadsTable` — client-side status filter + search; role-aware (agent/manager/admin/founder)
- Sidebar: Leads nav link added

---

## 2026-05-27 — Phase 2 complete

### User management + agent routing

- `agent_routing_config` table; auto-created on `role=agent` via trigger
- `toggleAgentRouting` server action (manager/admin/founder)
- `inviteUser` action — magic-link invite via `inviteUserByEmail`
- `UsersTable` — client-side filters (role, domain, search)
- `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`
- `GET /admin/users/[id]` — user detail page

---

## 2026-05-26 — Phase 1 complete

### Profiles system + user creation

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table; RLS; `get_user_role()` / `get_user_domain()`; `on_auth_user_created` trigger; `profile_audit_log`
- `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive` server actions
- Dashboard layout; Sidebar; TopBar
- `GET /admin/users` — user list
- `GET /admin/users/new` — create user form

---

## 2026-05-26 — Phase 0 complete

### Foundation

- Next.js 16 App Router scaffolded; Supabase connected; Tailwind v4; shadcn/ui
- `design-tokens.css` — all CSS variables; five themes (Earth, Air, Water, Fire, Cosmos)
- Supabase client files: `client.ts`, `server.ts`, `middleware.ts`
- Auth pages: login, forgot-password, update-password
- Shared utilities: `sanitize.ts`, `phone.ts`, `dates.ts`, `numbers.ts`, `chart-tokens.ts`, `scroll.ts`
