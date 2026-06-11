# Trigger.dev

> **Purpose:** the async-job layer — what runs on Trigger.dev, the idempotency/tag conventions, and the hook points in the action layer.
> **Audience:** engineers. · **Source-of-truth scope:** job mechanics and conventions. The SLA *business rules* (thresholds, recipients) live in `../modules/gia.md` § SLA Engine.
> **Last verified:** 2026-06-11 against `trigger.config.ts`, `src/trigger/lead-sla.ts`, `src/trigger/task-reminders.ts`, `src/lib/actions/sla.ts`.

---

## 1. Why it exists (A-12)

Any async work over 3 seconds or needing retry/delayed execution runs on Trigger.dev — never in
a route handler. In Eia that is exactly two job families: **lead SLA timers** and **task due
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

### `src/trigger/lead-sla.ts` — Gia SLA engine jobs

| Export | What it does |
| ------ | ------------ |
| `scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds)` | schedules one DELAYED run per (lead, rule); writes `trigger_run_id` back to `lead_sla_timers` |
| `cancelLeadSlasByLeadTask(leadId)` | lists all DELAYED/QUEUED runs for tag `lead-sla-${leadId}`, cancels each, then `cancelSlaTimersForLeadInDb` |
| `fireLeadSlaTask` | the delayed task itself — calls `fireSlaBreachAction` (`lib/actions/sla.ts`) |

- **Idempotency key:** `lead-sla-${leadId}-${ruleCode}` — Trigger.dev deduplicates non-terminal
  runs by key, so double-scheduling is structurally impossible (two simultaneous webhooks for
  the same lead produce one DELAYED run).
- **Tags, not stored run IDs:** runs are tagged `lead-sla-${leadId}`; cancellation queries by
  tag. The DB's `trigger_run_id` is informational.
- **Stale-fire guard:** the job re-reads the lead at fire time; if the status no longer matches
  the rule's trigger it exits with `outcome: 'stale_fire'`. The payload is a snapshot at
  scheduling time — stale by definition.
- **No session:** `lib/actions/sla.ts` runs without a user session — it is the documented
  `requireProfile()` exception and uses `createAdminClient()`.

### `src/trigger/task-reminders.ts` — task due reminders

| Export | What it does |
| ------ | ------------ |
| `scheduleTaskReminder(taskId, dueAt, assignedTo)` | schedules the reminder; **no-op when `dueAt <= now()`** (never errors on past dates) |
| `cancelTaskReminder(taskId)` | cancels by tag `task-reminder-${taskId}` |

- Idempotency key `task-reminder-${taskId}`; no run IDs stored in the DB.
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
   by activity).

The SLA rule table (8 rules, IST business hours, auto-task titles) lives in
`src/lib/constants/sla.ts` and is documented in `../modules/gia.md` § SLA Engine.
