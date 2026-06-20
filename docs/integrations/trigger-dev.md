# Trigger.dev

> **Purpose:** the async-job layer — what runs on Trigger.dev, the idempotency/tag conventions, and the hook points in the action layer.
> **Audience:** engineers. · **Source-of-truth scope:** job mechanics and conventions. The SLA *business rules* (thresholds, recipients) live in `../modules/gia.md` § SLA Engine.
> **Last verified:** 2026-06-20 against `trigger.config.ts`, `src/trigger/lead-sla.ts`, `src/trigger/task-reminders.ts`, `src/trigger/lead-revival.ts`, `src/trigger/usage-snapshot.ts`, `src/trigger/usage-rollup.ts`, `src/lib/services/revival-service.ts`, `src/lib/actions/sla.ts`.

---

## 1. Why it exists (A-12)

Any async work over 3 seconds or needing retry/delayed execution runs on Trigger.dev — never in
a route handler. In Serene that is four job families across **five trigger files**: **lead SLA
timers**, **task due reminders**, the daily **lead-revival sweep**, and the **usage
snapshot/rollup** pair (adoption tracking). The first two are event/queue jobs (scheduled or
cancelled in response to a lead/task action); the rest are scheduled (cron) tasks that fire on a
fixed clock, not in response to an event — the lead-revival sweep was the project's **first**
`schedules.task`. (Sub-3-second post-response work — notification sends — uses `after()` instead;
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

## 3. The job files

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

### `src/trigger/lead-revival.ts` — daily silence-detection sweep (Lead Revival R1)

The project's **first `schedules.task` (cron) job** — every other Trigger.dev job above is
event-driven (scheduled/cancelled by a lead or task action). This one fires on a fixed clock.
It is the single periodic entry point the revival spec calls for — **not** a second scheduler and
**not** a duplicate of the SLA engine's per-lead delayed runs.

| Export | What it does |
| ------ | ------------ |
| `sweepRevivalCandidatesTask` | `schedules.task`, `id: 'sweep-revival-candidates'`, cron `0 2 * * *` timezone `Asia/Calcutta` = **07:30 IST daily** (the gate runs at shift-open so freshly-created "Revived" tasks are waiting when agents start their day). `maxDuration: 300`. Server-only modules are pulled in via dynamic `import()` inside `run()` to keep them out of the Trigger.dev module scan. **Timezone alias:** use `Asia/Calcutta`, **never** `Asia/Kolkata` — Trigger.dev's cloud validator checks the cron timezone against `Intl.supportedValuesOf('timeZone')`, whose ICU build canonicalises IST to the older `Asia/Calcutta` alias and **rejects** `Asia/Kolkata`. Same UTC+5:30 zone — spelling only. Copying a `Asia/Kolkata` value into code would fail at deploy |

**The sweep, per run:**

1. Read the active `revival_policies` rows (admin-client, **per run — never module-cached**, the
   `sla_policies` pattern). Each policy is keyed by `trigger_status` and carries a per-status
   `silence_days` threshold + a `daily_cap_per_agent`. Editable from `/settings`; empty → no-op.
2. Per status: `findSilentLeadsForStatus(status, silence_days)` returns leads silent past the
   threshold with **no `revival_candidate` of ANY status** — the **judge-once anti-join**: a lead
   already judged (including one previously `dismissed`) is **never re-judged**, so dead leads
   don't re-enter the pool nightly. The partial UNIQUE index additionally **backstops the one-OPEN
   race** (a concurrent double-insert).
3. Per lead: the **note-AI suppression gate** (`judgeLeadForRevival`, `revival-gate.ts`) — ONE
   structured call returning one of **three verdicts** + reasoning, reusing the Elaya `routing`/Haiku
   provider + `maskPii` (no tools, no new SDK import). It **fails closed to `unsure`** on any
   error — a glitch never auto-revives AND never auto-dismisses:
   - **`dismiss`** (confident junk) → a candidate written `status = 'dismissed'` at creation. It is
     the audit/training log; the review tab filters `status = 'open'`, so it **never surfaces for a
     human**. No task, no review.
   - **`revive` under the agent's daily cap** → `reviveLeadCore` (`lead-mutations.ts`) creates a
     **"Revived"** follow-up task via the **E2/E3 `createLeadTaskCore` path** (inheriting cache
     invalidation, activity logging, SLA rails, and the task reminder identically — it **NEVER**
     touches the leads row), plus an `actioned` candidate. Due date via
     `nextBusinessDeadline(now, REVIVAL_TASK_DUE_BUSINESS_MINUTES)`.
   - **`revive` but cap reached**, or **`unsure`** → an **open** candidate routed to the review tab
     (`/leads?revival=true`). Cap-overflow revivals are **never dropped, never auto-tasked**.
4. The daily cap is tracked per agent in-run: seeded from `countAutoRevivesToday(agentId)` then
   decremented locally (the DB count only sees rows already written, so a single run also respects
   the cap). The cap is only decremented when the `actioned` candidate row actually lands — if the
   one-open guard rejects a racing duplicate, the task still exists but the count isn't
   double-spent.

- **Idempotency:** the **daily cron** + the **one-open-candidate guard** make a re-run safe — a lead
  with a live open candidate is skipped in step 2, and the partial UNIQUE index backstops any
  concurrent double-insert. Trigger.dev also dedups the scheduled run itself per `scheduleId` per
  tick. (If `reviveLeadCore` fails, **no candidate is written** so the lead is simply re-judged on
  the next sweep — the cap isn't burned.)
- **Layer over leads, never a mutation:** the sweep only writes `revival_candidates` and creates
  tasks. It never updates lead status or columns. Full contract: `../modules/revival.md`.

### `src/trigger/usage-snapshot.ts` — the 1-minute active-presence snapshot (adoption tracking)

A `schedules.task` (migration 0126) — the second cron family. It powers `/admin/usage`.

| Export | What it does |
| ------ | ------------ |
| `snapshotUsagePresenceTask` | `schedules.task`, `id: 'snapshot-usage-presence'`, cron `* * * * *` (every minute, no timezone — a minute-grain tick is timezone-agnostic), `maxDuration: 60`. Reads the **live Redis `presence:*` keys** (`listLivePresence` — the client heartbeat SETs them only while active: visible + recently interacted, 150s TTL) and appends one `usage_heartbeats` row per active user (`insertUsageHeartbeats`, admin client). Server-only deps via dynamic `import()` inside `run()` |

- **The ONLY writer of `usage_heartbeats`:** the request/heartbeat path never touches Postgres
  (that would be a write storm at 300 users; the hot path is one Redis SET). The rollup job turns
  these ticks into `usage_daily`.
- **Idempotency:** each tick is an independent append of "who was active in the last interval". A
  same-minute duplicate adds at most one extra row per user — and the rollup counts DISTINCT
  minute-buckets, so it collapses to the same active minute. No dedup key needed; Trigger.dev also
  dedups the scheduled tick.

### `src/trigger/usage-rollup.ts` — the `usage_daily` rollup (adoption tracking)

Two `schedules.task` exports (migration 0126), both writing the SAME `usage_daily` table via the
SAME idempotent `rollupUsageForDays` core (Option 2). Also feeds `/admin/usage`. Both use timezone
`Asia/Calcutta` (never `Asia/Kolkata` — same validator constraint as the revival sweep above; same
UTC+5:30 zone). Server-only deps via dynamic `import()` inside `run()`.

| Export | What it does |
| ------ | ------------ |
| `rollupUsageTodayTask` | `id: 'rollup-usage-today'`, cron `*/15 * * * *` timezone `Asia/Calcutta`, `maxDuration: 120`. Re-rolls **today (IST)** every 15 min so `/admin/usage` shows near-current active minutes without waiting for the nightly pass |
| `rollupUsageNightlyTask` | `id: 'rollup-usage-nightly'`, cron `20 0 * * *` timezone `Asia/Calcutta` (00:20 IST — a 20-min cushion past midnight so the last ticks have been snapshotted), `maxDuration: 300`. Finalises the **prior IST day** (+ today as cheap boundary insurance), then `pruneOldHeartbeats(30)` drops raw `usage_heartbeats` > 30 days (`usage_daily` is never pruned) |

- **Idempotent recompute-and-UPSERT:** `rollupUsageForDays` RECOMPUTES `active_minutes` from the
  raw ticks (`COUNT(DISTINCT minute-bucket)`) and UPSERTs on the `(day, user_id, domain)` PK — it
  **OVERWRITES, never increments**. Running either task twice yields identical `usage_daily` rows;
  the two may even overlap on "today" near midnight with no double-count.
- IST dates are derived via `istDateString()` in `usage-service` — never re-fork the IST offset
  math here.

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
