# Trigger.dev

> **Purpose:** the async-job layer — what runs on Trigger.dev, the idempotency/tag conventions, and the hook points in the action layer.
> **Audience:** engineers. · **Source-of-truth scope:** job mechanics and conventions. The SLA *business rules* (thresholds, recipients) live in `../modules/gia.md` § SLA Engine.
> **Last verified:** 2026-06-11 against `trigger.config.ts`, `src/trigger/lead-sla.ts`, `src/trigger/task-reminders.ts`, `src/lib/actions/sla.ts`.

---

## 1. Why it exists (A-12)

Any async work over 3 seconds or needing retry/delayed execution runs on Trigger.dev — never in
a route handler. In Serene that is exactly two job families: **lead SLA timers** and **task due
reminders**. (Sub-3-second post-response work — notification sends — uses `after()` instead;
see `whatsapp-gupshup.md` §4.)

## 2. Configuration

`trigger.config.ts`: project `proj_xfyyvwjmrumreyvawcwg`, runtime `node`, `maxDuration: 300`,
scan dir `src/trigger`. The installed SDK is `@trigger.dev/sdk` v4.x; **imports use the
`/v3` entry point** (`import { task, tasks, runs } from '@trigger.dev/sdk/v3'`) — that is the
SDK's stable API path, not a version mismatch. Auth uses the SDK's own env
(`TRIGGER_SECRET_KEY` — supplied by the Trigger.dev CLI/dashboard;
see `../operations/environments.md`).

Job files must be exported from `src/trigger/` for the scanner to register them — never move a
`task()` definition elsewhere.

## 3. The two job files

### `src/trigger/lead-sla.ts` — Gia follow-up engine jobs (SLA + cadence)

| Export | What it does |
| ------ | ------------ |
| `scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds, opts?)` | schedules one DELAYED run per (lead, rule); writes `trigger_run_id` back to `lead_sla_timers`. `opts.idempotencySuffix` appends to the key — daily cadence ticks pass the IST date of `fireAt` |
| `cancelLeadSlasByLeadTask(leadId)` | lists all DELAYED/QUEUED runs for tag `lead-sla-${leadId}`, cancels each, then `cancelSlaTimersForLeadInDb` |
| `fireLeadSlaTask` | the delayed task itself — calls `fireSlaBreachAction` (`lib/actions/sla.ts`), which loads the `sla_policies` row per fire and branches on `trigger_kind` (status breach vs CAD cadence tick) |

- **Idempotency key:** `lead-sla-${leadId}-${ruleCode}` (status rules) /
  `lead-sla-${leadId}-${ruleCode}-${YYYY-MM-DD}` (cadence ticks — date-scoped so one tick per
  lead per day is structural; an undated key would dedupe tomorrow's tick against today's
  completed run within the key TTL). Trigger.dev deduplicates non-terminal runs by key, so
  double-scheduling is structurally impossible.
- **Tags, not stored run IDs:** runs are tagged `lead-sla-${leadId}` — status rules AND cadence
  ticks. Cancellation queries by tag, which is exactly why a status change disarms the cadence
  for free. The DB's `trigger_run_id` is informational.
- **Stale-fire guard:** the job re-reads the lead at fire time **including
  `last_call_outcome` + `last_call_outcome_at`**; status rules exit when the status moved on,
  cadence ticks exit when the outcome/status changed or the outcome is older than the 7-day
  freshness window. The payload is a snapshot at scheduling time — stale by definition.
- **Config per fire:** `fireSlaBreachHandler` loads the policy row on every fire — a policy
  edit or `active=false` flip applies to already-DELAYED runs.
- **No session:** `lib/actions/sla.ts` runs without a user session — it is the documented
  `requireProfile()` exception and uses `createAdminClient()`.

### `src/trigger/task-reminders.ts` — task due reminders + overdue escalation

| Export | What it does |
| ------ | ------------ |
| `scheduleTaskReminder(taskId, dueAt, assignedTo)` | schedules the reminder; **no-op when `dueAt <= now()`** (never errors on past dates) |
| `cancelTaskReminder(taskId)` | cancels by tag `task-reminder-${taskId}` — sweeps the due reminder AND any pending overdue check (same tag) |
| `sendTaskReminderTask` | at due: `task_due` in-app for every category (unchanged); for `gia_followup` tasks additionally the `task_due_reminder` WhatsApp template to the agent (policy TASK-01A, channel-gated) and arming of the overdue check at due + TASK-01B threshold |
| `checkTaskOverdueTask` | at due+30 clock-min (TASK-01B): exits on any clearing event (task completed/cancelled, due_at moved, lead activity after due); otherwise stamps `tasks.overdue_at` **exactly once** (`UPDATE … WHERE overdue_at IS NULL`) and notifies the lead's domain managers in-app (`task_overdue_manager`) + WhatsApp |

- Idempotency keys: `task-reminder-${taskId}` (due reminder) and
  `task-overdue-${taskId}-${dueAtISO}` (overdue check — due-stamped so a due_at edit gets its
  own chain). No run IDs stored in the DB.
- Both jobs read their TASK-01A/B policy rows per run — never module-cached.
- `deleteTaskAction` cancels the reminder **before** the DB delete — if cancel throws, the
  delete is aborted (no orphaned reminders for deleted tasks).

## 4. Hook points in the action layer (`lib/actions/leads.ts`)

1. **`assignLead` / `createManualLead`** — after the assignment write: update
   `status_changed_at` + `last_activity_at`, then `scheduleSlaTimersForLead({ status: 'new' })`
   (via the `notifyLeadAssigned` orchestrator's `scheduleSla` flag).
2. **`updateLeadStatus`** — after the status write: terminal status →
   `cancelSlaTimersForLead`; otherwise cancel-then-reschedule for the new status.
3. **`addLeadCallNote`** — after the note write: if the call auto-advanced `new → touched`,
   reschedule; otherwise `refreshActivitySlaTimers` (SLA-02/03 only — SLA-01 is never refreshed
   by activity). In both branches, `armCadenceForOutcome` is **chained after the
   schedule/refresh settles** (their cancel-all would otherwise kill the fresh tick); it no-ops
   unless the outcome is rnr/switched_off/wrong_number and the status is armable.

Rule config lives in the `sla_policies` table (migration 0111 — read per run); the static
vocabulary (business hours, auto-task titles, cadence outcome set, parity-reference
`SLA_RULES`) lives in `src/lib/constants/sla.ts`. The rule table is documented in
`../modules/gia.md` §4.
