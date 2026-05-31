## Context — Eia Codebase

You are working on Eia, the internal operating system for Indulge Global — a luxury concierge brand. This is a production codebase, not a prototype. Read carefully before touching anything.

### Authority Files — Read These First, Every Session

1. /CLAUDE.md — root rules, file locations, never-do list, phase status
2. /docs/The_Rules.md — all non-negotiable rules (A-_, S-_, P-_, V-_, Q-_, D-_)
3. /docs/The_Blueprint.md — architecture, stack, RBAC model
4. /supabase/migrations/CLAUDE.md — migration rules and RLS checklist

### Stack (final — do not suggest alternatives)

Next.js 16 App Router · TypeScript strict (no `any`) · Tailwind CSS v4 · shadcn/ui · Supabase (PostgreSQL 17, Auth, Realtime) · Framer Motion 11 · React Hook Form + Zod · Trigger.dev v3 · Vercel · pnpm

### Authorization Model

- Two axes: `role` (founder | admin | manager | agent | guest) and `domain` (concierge | onboarding | finance | marketing | tech | shop | b2b | house | legacy)
- Authorization reads ONLY from `public.profiles` — never from JWT claims
- Two helper functions exist: `get_user_role()` and `get_user_domain()` — SECURITY DEFINER, SET search_path = public. These are the only functions RLS policies call.
- Rule A-09: two-layer security always — RLS at DB level AND application check in the Server Action. Never rely on one layer alone.
- `get_user_domain()` returns `app_domain` (enum). When comparing with a `text` column (e.g. `task_groups.domain`), always cast: `get_user_domain()::text`. Never compare enum directly to text.

### Phase Status — What Has Been Built

**Phase 0 — Complete:** Foundation. Next.js 16, Supabase, Tailwind v4, design-tokens.css (five themes), auth pages, shared utils.

**Phase 1 — Complete:** Profiles system. `profiles` table, RLS, `get_user_role()` / `get_user_domain()`, `on_auth_user_created` trigger, `profile_audit_log`. Admin user management at `/admin/users`.

**Phase 2 — Complete:** Agent routing config. `agent_routing_config` table (auto-created on `role=agent`). `inviteUser` action. `UsersTable` with filters. `/admin/users/[id]` detail page.

**Phase 3 — Complete:** Gia module foundation. `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` tables with full RLS. Webhook ingestion. Lead list page `/leads`.

**Phase 4 — Complete:** Lead dossier (`/leads/[id]`). Full lifecycle: Called → Won/Nurturing/Lost/Junk. CalledModal, AgentScratchpad, LeadNotesSection, LeadJourneyTimeline, LeadActivityLog, LeadDossierTasksAsync.

**Phase 5 — Complete:** Profile page + theme system. ThemeSelector (5 swatches), PasswordChangeForm, ProfileAvatarSection with Supabase Storage upload. Inline `<script>` in dashboard layout for zero-flash theme.

**Phase 6 — Complete:** UI/Modal primitive. Lead list filters (Suspense-split), server-side search + pagination, column visibility picker + drag-to-reorder. Add Lead modal. Campaign ad video preview modal. Error log page.

**Phase 7 — Complete:** Dashboard widget system. 5 Gia widgets (AgentTasks, AgentActivity, ManagerLeadStatus, ManagerLeadVolume, ManagerCampaigns). `useDashboardLayout` hook. `@dnd-kit` drag-to-reorder. Dashboard RSC consolidation (single cached RPC, zero POST calls on initial load).

**Phase 8 — Complete:** Performance page (agent self-view). Core Four metrics, effort layer, call outcome breakdown, period selector. Campaign Analytics command center — list + detail pages, `get_campaign_metrics` RPC.

**Phase 9 — Complete:** Toast system + persistent notification inbox. Team benchmarks layer. Gia SLA Engine (8 rules, IST business hours, auto-task creation). Settings page (`/settings`) — Agent Roster + Shifts (unified single-page redesign).

**UI Foundation — Complete:** Full component library in `src/components/ui/`. 26+ components. Zero hardcoded colours. MutationObserver-driven chart token resolution. Component sweep — 33 inline patterns replaced. New primitives: `ComboboxDropdown`, `TimePicker`. `Button`, `TabSelector`, `FilterDropdown`, `SearchBar`, `DatePicker`, `Calendar` all spec-audited and hardened.

**OS Tasks — Complete:** Full task system across 15+ migrations and build sessions. `task_groups`, `task_remarks` (was `task_messages`), `tasks` extended. Personal tasks tab now uses `MyTasksCalendarView` (calendar + date-grouped layout, `TaskCompletionCircle`). Group task workspace (`/tasks/[id]`). `SubTaskModal` two-zone grid layout (brief left, activity right). Realtime remarks panel. SLA Engine hook points. Performance indexes. `add_task_remark_with_status` RPC (migration 0035) — 6 sequential awaits → 1 round-trip. `SubTaskModal` parent callbacks sync group list without page refresh.

**Phase 10 — Complete:** Performance page manager & founder views. Agent roster panel (sorted by top performer, first agent pre-fetched server-side for zero-flash). Domain tabs at top. Founder all-domains view. Filter bar (period + domain dropdowns, clear button). DRY audit — 10 violations fixed.

**WhatsApp Module — Complete:** Full WhatsApp integration. `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_conversation_reads`, `whatsapp_notification_logs` tables with RLS. Gupshup v1 inbound/outbound (dual-format parser, `x-gupshup-secret` auth). `/whatsapp` page — split layout, conversation list with period filter + seamless search rail, message panel, composer. Realtime message delivery. Unread count RPC (`get_wa_unread_count`). Agent assignment + SLA breach + founder lead notifications via Gupshup templates. `WhatsAppShell`, `ConversationList`, `ConversationPanel`, `MessageBubble`, `ConversationRow`, `EmptyConversationState`, `WhatsAppConversationPeriodFilter` components.

**Lead Dossier Hardening — Complete:** Inline lead reassignment (manager/admin/founder). Team Notes card in right column. Junk leads revivable back to In Discussion. Won deal capture flow. `CalledModal` outcome picker redesign. Lead slug URLs (migrations 0045–0046, collision-safe). Domain normalized to `app_domain` enum across `leads`, `task_groups`, `whatsapp_notification_logs`. `LeadInfoCard` inline combobox (assignee) using `ComboboxDropdown`.

**Admin/Profile Redesign — Complete:** `/admin/users` and `/admin/users/[id]` redesigned to canonical wide detail-page layout. New shared primitives `SectionCard` and `BackButton`. `/profile` widened to two-column layout matching admin pages. `NewUserClient.tsx` wrapper for client state lift. `CreateUserForm` mode prop (password / invite).

**Dashboard Bento Grid — Complete:** Widget resize controls (height + width). Bento grid layout replacing fixed 2-col. Domain tab selector on Lead Pipeline and Campaign Performance widgets. Lead Volume widget — domain picker + multi-line chart, merged domain footer. Live Lead Activity widget — role-scoped visibility. Agent dashboard summary RPC scoped to all task categories (migration 0047), activity limit 25 (migration 0048), role-scoped visibility (migration 0050).

---

### Database — What Exists (All Migrations)

| Migration | What it creates |
|-----------|----------------|
| 0001 | `user_role`, `app_domain` enums |
| 0002 | `profiles`, `profile_audit_log`, `get_user_role()`, `get_user_domain()`, `on_auth_user_created` trigger, `agent_routing_config` |
| 0003 | `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` |
| 0004 | `lead_raw_payloads` |
| 0005 | `ingestion_error` column on `lead_raw_payloads` |
| 0007 | `get_next_round_robin_agent()` — atomic `SELECT FOR UPDATE SKIP LOCKED` |
| 0008 | Lead dedup by phone — `previous_lead_id` FK, `get_active_lead_by_phone()` |
| 0009 | `personal_details JSONB` on `leads` |
| 0010 | Three partial indexes: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` |
| 0011 | `idx_leads_phone_text` (`text_pattern_ops`) for ILIKE search |
| 0012 | `ad_creatives` table |
| 0013 | Three partial indexes on `lead_activities`, `lead_notes`, `leads` (performance) |
| 0014 | `idx_leads_campaign_domain`, `idx_leads_campaign_status`, `get_campaign_metrics` RPC |
| 0015 | `get_campaign_detail_metrics` RPC, `get_campaign_agent_distribution` RPC |
| 0016 | `notifications` table, Realtime enabled |
| 0017 | `task_groups`, `task_messages` (later replaced), `tasks` extended: title, description, priority, task_category, group_id; status migrated `pending→to_do`, `done→completed` |
| 0018 | `task_groups` RLS domain enforcement (manager scoped) |
| 0019 | `task_messages` RLS creator visibility + manager domain scope |
| 0020 | `get_group_task_summaries` RPC (SECURITY DEFINER, self-enforcing access control) |
| 0021 | `task_messages` suppression columns + `task_audit_log` append-only table + `log_task_changes()` trigger |
| 0022 | `DROP task_messages CASCADE` → `CREATE task_remarks` (adds `status_change` nullable column) |
| 0023 | `attachments jsonb NOT NULL DEFAULT '[]'` on `tasks` (checklist) |
| 0024 | `tags text[] NOT NULL DEFAULT '{}'` on `tasks`, GIN index |
| 0025 | Task performance indexes (replace stale `pending`-filter indexes with `NOT IN completed/cancelled/error`) |
| 0026 | `get_personal_tasks` RPC with cursor pagination (keyset, 4-case WHERE clause) |
| 0027 | `status_changed_at`, `last_activity_at` on `leads`; SLA notification types |
| 0028 | `lead_sla_timers` table |
| 0029 | `get_dashboard_summary(p_role, p_domain, p_user_id)` RPC — single jsonb, 4 keys |
| 0030 | `add_lead_call_note(...)` RPC — single transaction replacing 9 sequential awaits |
| 0031 | `update_lead_status(...)` RPC — single transaction replacing 5 sequential awaits |
| 0032 | `whatsapp_conversations` table — lead_id FK, agent_id FK, phone, last_message_at, unread_count, RLS |
| 0033 | `whatsapp_messages` table — conversation_id FK, direction (inbound/outbound), content, metadata JSONB, RLS, Realtime |
| 0034 | `whatsapp_conversation_reads` table — marks last-read per user per conversation |
| 0035 | `add_task_remark_with_status(...)` RPC — inline auth check, conditional status update + remark insert in one transaction |
| 0036 | `get_wa_unread_count(p_user_id)` RPC — total unread conversations for a user |
| 0037 | `wa_messages_outbound_insert` RLS policy — allows authenticated insert on outbound messages |
| 0038 | `whatsapp_notification_logs` table — logs every template notification attempt with status + delivery result |
| 0039 | Fix `update_lead_status` RPC — adds `title` (NOT NULL) and `task_category='gia_followup'` to nurturing auto-task INSERT |
| 0040 | `add_lead_plain_note(...)` RPC — plain note insert without status change |
| 0041 | `normalize_lead_domain` — migrates `leads.domain` to `app_domain` enum; remaps TG_Global → onboarding |
| 0042 | Fix `get_group_task_summaries` domain type mismatch (42883) |
| 0043 | Fix `get_dashboard_summary` domain type mismatch (42883) |
| 0044 | Fix `get_campaign_metrics` domain type mismatch (42883) |
| 0045 | `lead_slug` column on `leads` — URL-safe unique slugs; backfill existing rows |
| 0046 | `generate_lead_slug` collision fix — appends `-2/-3` on collision; backfill re-run ordered by `created_at ASC` |
| 0047 | `get_dashboard_summary` — agent tasks CTE includes all task categories (not just personal) |
| 0048 | `get_dashboard_summary` — activity limit raised to 25 |
| 0049 | `leads.deal_duration` column — days between `created_at` and `status_changed_at` for won leads |
| 0050 | `get_dashboard_summary` — activity feed role-scoped (agent sees own, manager sees domain, admin/founder sees all) |
| 0051 | `add_task_remark_with_status` RPC auth fix — inline `auth.uid()` check; prevents unauthorized remark posting |

---

### File Map — Where Everything Lives

```
src/lib/
├── actions/
│   ├── agent-routing.ts     ← toggleAgentRouting, setAgentShiftAction
│   ├── auth.ts
│   ├── dashboard.ts         ← 5 server actions (widget data refresh)
│   ├── leads.ts             ← addLeadCallNote, updateLeadStatus, assignLead, createManualLead, updatePersonalDetails, updateScratchpad, listAgentsForDomain
│   ├── notifications.ts     ← markNotificationReadAction, markAllReadAction
│   ├── performance.ts       ← getAgentPerformanceAction, getAgentListForDomainAction
│   ├── profiles.ts          ← createUser, updateProfile, updateUserAuthorization, toggleUserActive, inviteUser, updateProfileAvatar
│   ├── sla.ts               ← scheduleSlaTimersForLead, cancelSlaTimersForLead, refreshActivitySlaTimers, fireSlaBreachAction
│   ├── tasks.ts             ← createPersonalTaskAction, createGroupTaskAction, createSubtaskAction, updateTaskStatusAction, updateTaskAction, deleteTaskAction, addTaskRemarkAction, suppressTaskRemarkAction, updateChecklistAction, updateTaskTagsAction, getPersonalTaskTagsAction, getTaskRemarksAction, getGroupSubtasksAction, getPersonalTasksAction, getTaskGroupByIdAction
│   └── whatsapp.ts          ← sendMessageAction, markConversationReadAction, getConversationsAction, getMessagesAction, searchConversationsAction
│
├── services/
│   ├── ad-creatives-service.ts      ← getAdCreativeForCampaign
│   ├── agent-routing-service.ts     ← getAgentRoutingConfig, getActiveRoutingConfigs, setRoutingActive, getAgentRosterByDomain, setAgentShift
│   ├── dashboard-service.ts         ← getDashboardSummary (React cache), getLeadVolumeByPeriod
│   ├── lead-ingestion.ts            ← ingestLead, validateAndSanitizeWebhookPayload, resolveDomainFromCampaign, assignLeadRoundRobin
│   ├── leads-service.ts             ← getLeadById, getLeadsByRole, getLeadsForAgent, getLeadsForDomain, getAllLeads, getLeadActivities, getLeadNotes, getNextRoundRobinAgent, getCampaignMetrics, getCampaignDetailMetrics, getCampaignAgentDistribution, getAgentsForDomain, getLeadFilterOptions
│   ├── notifications-service.ts     ← getUnreadNotifications, getNotifications, markNotificationRead, markAllNotificationsRead, createNotification
│   ├── performance-service.ts       ← getCoreFourMetrics, getEffortMetrics, getCallOutcomeBreakdown, getPreviousPeriodCoreMetrics, getTeamBenchmarks
│   ├── profiles-service.ts          ← getProfile, getCurrentProfile, getProfilesByDomain, getProfileById
│   ├── sla-service.ts               ← getSlaTimersForLead, createSlaTimer, cancelSlaTimersForLeadInDb, markSlaTimerFired, getOpenGiaFollowupTask, getManagersByDomain
│   ├── tasks-service.ts             ← getPersonalTasks, getGroupTasks (unstable_cache 60s), getGroupSubtasks, getTaskById, getTaskRemarks, getTaskGroupById, getPersonalTaskTags
│   ├── whatsapp-api.ts              ← sendTextMessage (Gupshup v1 outbound)
│   ├── whatsapp-ingestion.ts        ← processInboundMessage, resolveOrCreateConversation
│   └── whatsapp-service.ts          ← getConversations, getMessages, getConversation, markConversationRead, searchConversations, getUnreadCount
│
├── constants/
│   ├── call-outcomes.ts
│   ├── campaign-domain-map.ts
│   ├── dashboard-widgets.ts  ← widget registry, DEFAULT_LAYOUT_BY_ROLE
│   ├── domains.ts            ← APP_DOMAINS, GIA_DOMAINS, DOMAIN_LABELS
│   ├── lead-columns.ts       ← 11 columns, locked: status + name
│   ├── lead-sources.ts
│   ├── lead-statuses.ts
│   ├── motion.ts             ← ENTER_DURATION, EASE_OUT_EXPO, SPRING_CONFIG, MODAL_VARIANTS, MOTION_BUTTON_DEFAULTS, etc.
│   ├── roles.ts
│   ├── sla.ts                ← BUSINESS_HOURS (IST, Mon–Sat 09:00–19:00), SLA_RULES (8 rules), SLA_AUTO_TASK_TITLES
│   ├── task-constants.ts     ← TASK_PRIORITY, TASK_STATUS, TASK_CATEGORY, TASK_REMARK_STATUS_LABELS, GROUP_TASK_ACCENT_COLORS, GROUP_TASK_ICONS
│   ├── task-types.ts
│   ├── whatsapp.ts           ← WHATSAPP_CONVERSATIONS_PAGE_SIZE, WHATSAPP_MESSAGES_PAGE_SIZE
│   └── whatsapp-period.ts    ← WhatsAppPeriod type, WHATSAPP_PERIOD_OPTIONS
│
├── utils/
│   ├── assert-never.ts       ← assertNever(x: never): never — Q-11 canonical helper
│   ├── chart-tokens.ts
│   ├── dates.ts              ← formatDate, toUTC, formatRelativeTime, formatDuration
│   ├── numbers.ts            ← formatCount, formatCompact, formatPercent, formatCurrency
│   ├── phone.ts
│   ├── sanitize.ts
│   ├── scroll.ts
│   ├── sla.ts                ← nextBusinessDeadline, isWithinBusinessHours, businessMinutesBetween (IST)
│   └── whatsapp-period.ts    ← getWhatsAppPeriodRange, parseWhatsAppPeriodFromSearchParams
│
├── types/
│   ├── database.ts           ← All DB types; Lead, Profile, Task, TaskGroup, TaskRemark, TaskAuditLog, Notification, LeadSlaTimer, AgentRosterRow, DashboardSummary, ChecklistItem, etc.
│   ├── index.ts              ← DashboardSummary + 7 constituent types, ActionResult, etc.
│   └── whatsapp.ts           ← WhatsAppConversation, WhatsAppMessage, WhatsAppNotificationLog types
│
└── toast.ts                  ← singleton toast store; toast.success/danger/warning/info/loading/lia/resolve/dismiss

src/trigger/
├── lead-sla.ts               ← fireLeadSlaTask, scheduleLeadSlasTask, cancelLeadSlasByLeadTask
└── task-reminders.ts         ← scheduleTaskReminder, cancelTaskReminder, sendTaskReminderTask

src/hooks/
├── useDashboardLayout.ts     ← layout + CRUD; key: eia:dashboard:layout:${userId}:v1
├── useLeadColumnPreferences.ts ← column pref hook; key: eia:leads:columns:${userId}:v1
├── useNotifications.ts       ← owns all notification state; Realtime subscription
└── useToast.ts               ← thin re-export of toast singleton

src/components/ui/            ← 26+ display-only token-compliant components
  Spinner, Button (forwardRef), MotionButton, Avatar (selected prop), AvatarStack,
  SearchBar, InfoRow, TabSelector (pill | connected),
  Dialog, FilterDropdown, Table, ListRow, ProgressBar, Toggle, ChecklistItem, Checklist,
  RadioGroup, Calendar (taskDots prop), DatePicker (showTime prop), EditButton, Accordion,
  ComboboxDropdown (single-select searchable, viewport-flip, kbd nav),
  TimePicker (premium scroll-wheel, shared across app),
  BackButton (motion Link, shared across detail pages),
  SectionCard (shared section wrapper for admin/profile pages),
  Modal (wraps Dialog; type="lia" for two-action Lia proposals),
  charts/LineChart, BarChart (colorMap prop), PieChart, DonutChart, AreaChart, ButterflyChart,
  charts/useChartTokens (MutationObserver-driven), charts/ChartSkeleton,
  toast-item.tsx, toast-provider.tsx, lia-glyph.tsx

src/components/whatsapp/
  WhatsAppShell.tsx           ← outer split layout, hydrates conversation list + unread count
  ConversationList.tsx        ← scrollable list, period filter, search rail
  ConversationRow.tsx         ← avatar ring hover pattern
  ConversationPanel.tsx       ← message thread, Realtime, read tracking
  MessageBubble.tsx           ← inbound/outbound bubble variants
  EmptyConversationState.tsx  ← Playfair italic empty state
  WhatsAppConversationPeriodFilter.tsx ← period dropdown (Today/Week/Month/custom)
```

---

### Tasks System — Current State

**Tables:**
- `tasks` — core; extended with title, description, priority (urgent|high|normal), task_category (personal|group_subtask|gia_followup), group_id FK → task_groups, tags text[], attachments jsonb. Status: `to_do | in_progress | in_review | completed | error | cancelled`. Old values `pending` and `done` do not exist.
- `task_groups` — id, title, description, priority, status, due_at, created_by → profiles, domain, timestamps. RLS: manager scoped by domain.
- `task_remarks` — append-only (replaces `task_messages`). Adds `status_change` nullable column. Realtime enabled. No UPDATE, no DELETE (except suppression columns for admin/founder).
- `task_audit_log` — append-only. Logs changes to 6 fields: title, description, status, priority, due_at, assigned_to. `attachments` intentionally excluded (checklist toggles would flood the log).

**Key constants:**
- `tasks.status` CHECK values and `task_remarks.status_change` CHECK values are coupled — adding a new status requires a migration on both.
- `task_remarks` append-only contract: the ONLY mutation allowed is the suppression UPDATE by admin/founder.
- `task_remarks` RPC: `add_task_remark_with_status` (migration 0051) performs inline `auth.uid()` check, conditional status update (fires `log_task_changes()` trigger), and remark insert — all in one transaction. `addTaskRemarkAction` calls this RPC via `adminClient.rpc()`.

**task_remarks `status_change` coupling warning:** If `tasks.status` gains a new value, a new migration must extend `task_remarks.status_change` CHECK too.

**Personal tasks UI:** `PersonalTasksTab` is legacy/unmounted. The active personal tasks view is `MyTasksCalendarView` — calendar + date-grouped sections, `TaskCompletionCircle`, `useTaskCompletionToggle`. `TasksCreateContext` / `AddTaskButton` owns create modal trigger.

**`SubTaskModal` parent callbacks:** `onTaskUpdated` / `onTaskDeleted` propagate successful writes back to `GroupTasksTab` and `GroupTaskWorkspace` without a page refresh.

---

### WhatsApp System — Current State

**Provider:** Gupshup v1 (BSP). Auth: `x-gupshup-secret` header. Inbound: dual-format parser (Gupshup native + fallback). Outbound: `sendTextMessage()` in `whatsapp-api.ts`.

**Tables:**
- `whatsapp_conversations` — per-lead conversation thread. `lead_id` FK, `agent_id` FK, `phone`, `last_message_at`, `unread_count`.
- `whatsapp_messages` — individual messages. `conversation_id` FK, `direction` (inbound/outbound), `content`, `metadata JSONB`. Realtime enabled.
- `whatsapp_conversation_reads` — tracks last-read position per user per conversation.
- `whatsapp_notification_logs` — every template notification attempt logged with `status`, `delivery_result`, 4-digit phone suffix.

**Notification templates (Gupshup):**
| Event | Recipient | Template ID |
|-------|-----------|-------------|
| Agent lead assignment | Agent | `3bcebeb0` (3 params: leadName, leadPhone, domain) |
| Founder lead notification | Founder | `d5828042` |
| SLA breach (agent) | Agent | `54d5dd55` (4 params: leadName, leadPhone, status, lastUpdatedAt) |
| SLA breach (manager) | Manager | `682fd320` (5 params: + agentName) |

**Webhook route:** `POST /api/webhooks/whatsapp` — `x-gupshup-secret` auth; `GET` returns 200 for URL verification. Excluded from Next.js proxy session refresh.

**Unread count:** `get_wa_unread_count(p_user_id)` RPC (migration 0036) — total unread conversations. Called on `/whatsapp` page load.

**Page:** `/whatsapp` — split layout (conversation list left, message panel right). `WhatsAppShell` owns all hydration. `ConversationList` has period filter + seamless search rail. Realtime subscription on `whatsapp_messages`. Read state marked via `markConversationRead` on panel open.

---

### SLA Engine — Current State

**Business hours:** IST (Asia/Kolkata), Mon–Sat, 09:00–19:00. `BUSINESS_HOURS` in `src/lib/constants/sla.ts`.

**8 SLA rules:**
| Code | Status Trigger | Threshold | Recipient | Auto-task? |
|------|---------------|-----------|-----------|------------|
| SLA-01A | new | 15 min | Agent | Yes (urgent) |
| SLA-01B | new | 30 min | Manager | No |
| SLA-02A | touched | 24h | Agent | Yes (high) |
| SLA-02B | touched | 36h | Manager | No |
| SLA-03A | in_discussion | 24h | Agent | Yes (high) |
| SLA-03B | in_discussion | 36h | Manager | No |
| SLA-04A | nurturing | 4 biz-days | Agent | Yes (high) |
| SLA-04B | nurturing | 4 biz-days | Manager | No |

**Idempotency key:** `lead-sla-${leadId}-${ruleCode}` — Trigger.dev deduplicates DELAYED runs.
**Terminal statuses** (`won`, `lost`, `junk`) → cancel all SLA timers, schedule none.
**Stale-fire guard:** Job re-reads lead status on execution; exits cleanly if status no longer matches trigger.

---

### Non-Negotiable Rules Relevant to Every Fix

- A-02: mutations via Server Actions only — no direct Supabase writes from client components
- A-03: all DB queries through service functions in lib/services/ — no raw Supabase in components
- A-08: every table has RLS enabled — no exceptions
- A-09: two-layer security — RLS + application layer both enforce access
- A-14: never edit a migration that has already run in production — write a new one
- S-01: every Server Action Zod-validates first, before any DB call
- S-06: never trust client-supplied IDs without verifying ownership at the application layer
- V-01: every colour is a CSS variable from src/styles/design-tokens.css — no hex, no hardcoded Tailwind colours
- V-05: z-index values only from the --z-* token scale — no arithmetic on tokens, no z-[999]
- Q-11: every switch over a union type is exhaustive — use assertNever() from src/lib/utils/assert-never.ts, no default branch
- Q-12: search the codebase for an existing equivalent before creating any component, hook, util, or service function — search by behaviour, not filename

---

### How to Fix Anything in This Codebase

1. Read the relevant files before writing a single line
2. Search the codebase for the existing pattern — extend it, do not duplicate it
3. New migrations: new file, never edit an existing one
4. After every fix: pnpm tsc --noEmit must pass with zero errors
5. Update the relevant CLAUDE.md and add one line to docs/changelog.md

---

### Design System Quick Reference

- **Page title dot:** Every primary nav `<h1>` ends with `<span className="page-title-dot">.</span>`. Use `className="type-page-title"` on the `<h1>`. Detail pages with back links are exempt.
- **Canvas:** `.layout-canvas` class. Earth: `#0d0c0a` + grain SVG + three radial washes. Other themes: flat canvas until enhanced.
- **TabSelector:** Three variants — `pill` (spring slide), `border-bottom` (underline), `connected` (chip in tray). Active pill uses `--theme-canvas` bg + `--theme-canvas-text` label.
- **Supabase Realtime channels:** Always include a mount-scoped nonce (`useId()`) in channel names — `table-name-${id}-${mountId}`. Never use bare names — Strict Mode double-mounts will collide.
- **SVG fill/stroke:** Never use `--theme-accent` directly in Recharts props — SVG attributes do not resolve CSS variables in all browsers. Use `useChartTokens()` (MutationObserver-driven, resolves via `getComputedStyle`).
- **Empty states:** Always Playfair italic heading. Never "No data available."
- **Motion constants:** Import from `src/lib/constants/motion.ts` — never re-declare inline.
