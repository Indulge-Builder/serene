# Trigger.dev

> **Purpose:** the background-job layer. Every task that runs on Trigger.dev, what starts it, what switches it off, how the jobs are deployed, and the conventions they share.
> **Audience:** engineers. · **Source-of-truth scope:** job mechanics, the task inventory and the conventions. The business rules each job serves live in its module doc (linked per row). SLA rules: `../modules/gia.md` § SLA Engine.
> **Last verified:** 2026-09-26 against `trigger.config.ts`, `package.json`, all 18 files in `src/trigger/`, `src/lib/trigger/cancel-runs.ts`, `src/lib/services/llm-providers-service.ts` (the switch getters), `src/lib/services/lead-mutations.ts`, `src/lib/services/task-mutations.ts`, `src/lib/actions/sla.ts`.

---

## 1. Why it exists (Rule 11 / A-12)

Any async work that takes over 3 seconds, needs a retry, or must fire later runs on Trigger.dev,
never inside a route handler or a server action. Short post-response work (a WhatsApp send after a
webhook answers) uses `after()` instead; see `whatsapp-gupshup.md` §4.

Trigger.dev now carries three kinds of work:

1. **Delayed runs armed by the app.** Lead SLA timers, task reminders and repeat nudges. The app
   schedules a run for a future moment and cancels it by tag when the world moves on.
2. **Scheduled (cron) sweeps.** The revival sweep, usage rollups, the Sia watcher alarm, the
   Freshdesk mirror, the vendor extractor, the member profiler and pulse, ticket intake and the
   sentinel, the Elaya brief, alerts and label top-up, the lesson writer, the member judgement.
3. **On-demand jobs fired by a button or a tool.** The deep read, one member judgement, one
   lesson writing.

## 2. Configuration and deploy

`trigger.config.ts`: project `proj_xfyyvwjmrumreyvawcwg`, runtime `node`, default
`maxDuration: 300` (a task can set its own), scan directory `src/trigger`. Only files in
`src/trigger/` are scanned, so a `task()` must be exported from there. Plain helpers that are not
tasks live in `src/lib/trigger/` on purpose (see `cancel-runs.ts` below).

**Versions are pinned together.** `@trigger.dev/sdk`, `@trigger.dev/build` and the
`trigger.dev` CLI are all 4.4.6 (`package.json`, checked in `node_modules`). A newer CLI refuses
a project built on an older SDK. Imports use the SDK's `/v3` entry point
(`import { task, schedules, tasks, runs } from '@trigger.dev/sdk/v3'`); that is the stable API
path in v4, not a version mismatch.

**Deploy:** `pnpm trigger:deploy` from the repo root (runs the local 4.4.6 CLI;
`npx trigger.dev@4.4.6 deploy` is the same thing). Deploy whenever `src/trigger/`,
`trigger.config.ts`, or any service a task imports has changed: the worker runs its own bundle,
so a Vercel deploy does NOT update the jobs. Several September changelog entries end with
"needs `pnpm trigger:deploy`"; a new schedule does not exist until that deploy. `pnpm trigger:dev`
runs tasks locally against the DEV environment.

**Cron timezone.** Every IST schedule uses `timezone: "Asia/Calcutta"`, never `Asia/Kolkata`.
Trigger.dev's cloud validator checks the zone against `Intl.supportedValuesOf('timeZone')`, whose
ICU build only knows the older alias, and rejects `Asia/Kolkata` at deploy. Same UTC+5:30 zone,
spelling only. A pattern with a timezone is read in that zone: `0 2 * * *` with
`Asia/Calcutta` fires at 02:00 IST.

**Server-only code is imported inside `run()`.** Every task pulls its services with a dynamic
`import()` inside `run()`. The build still evaluates every module on those import chains (the
June 2026 deploy failed until two modules stopped throwing on a missing env var at import time),
so a module must never read and throw on a secret at the top level: read env on first use, as
`createAdminClient`, `redis.ts` and `assertGupshupConfigured()` do.

**`server-only` is harmless here.** The Trigger.dev CLI's build replaces the `server-only`
package with an empty module (`polyshedPlugin` in `trigger.dev/dist/esm/build/plugins.js`).
That is why tasks whose import chains reach `server-only` (the SLA, reminder, revival, usage and
Sia alarm tasks, and since 2026-09-24 the brief through `zoho-service.ts`) deploy and run. The
"no `server-only` chain" rule some service headers mention matters for running a service from a
laptop with `tsx` (bench and pilot scripts), where `server-only` throws on import.

**Environment.** The worker has its own environment variables, set in the Trigger.dev dashboard
for the prod environment, separate from Vercel. Which variables the worker needs is listed in
`../operations/environments.md`.

**The key that arms runs from the website.** Runs armed by the app (SLA timers, task reminders,
nudges, deep reads, lesson writes, member judgements, and every cancel-by-tag) authenticate with
`TRIGGER_SECRET_KEY` in the Vercel environment. Production must hold the `tr_prod_…` key; the
`tr_dev_…` key in `.env.local` arms runs in the DEV environment, which the production workers never
execute (so a local test can "work" while production does nothing).

> **Incident, 2026-09-21.** The Vercel key did not match the project, so every run armed from the
> website had been failing with "Invalid API key", silently, because most arm and cancel calls end
> in `.catch(() => {})`. The scheduled sweeps were unaffected (they run on Trigger.dev's own clock).
> It surfaced only because the new nudge core logs its arm error. The fix is operator-only: paste
> the `tr_prod_` key from cloud.trigger.dev (Project, API keys) into Vercel Production, then
> redeploy. The changelog records the finding but no resolution entry. **Resolved in practice:**
> on 2026-09-26 the engine health check showed 21 lead SLA timers fired in the last 24 hours
> (37 scheduled) and 3 task due reminders sent, so runs armed from the website are arriving
> again. See `../operations/engine-health-check.md` for the separate stuck-timer backlog.

## 3. Task inventory

Every task in `src/trigger/` (18 files, 26 tasks). Times are IST. "Gate" is what turns the task
off without a deploy. The `elaya_settings` switch rows are read on every run by getters in
`llm-providers-service.ts`: "OFF unless true" means the task does nothing until the row is set to
`true`; "ON unless false" means it runs unless the row says `false`. Current values live in
`public.elaya_settings`; read them there, not from this doc.

### 3a. Delayed and on-demand tasks (armed by the app)

| Task id | File | Armed by | Gate | What it does | Owner doc |
| ------- | ---- | -------- | ---- | ------------ | --------- |
| `fire-lead-sla` | `lead-sla.ts` | `scheduleLeadSlasTask` (via `scheduleSlaTimersForLead` in `lib/actions/sla.ts`) | the rule's row in `gia.sla_policies` (`active`), read per fire | Fires one SLA or cadence rule for one lead; stale-fire guard. 3 attempts | `../modules/gia.md` |
| `send-task-due-soon` | `task-reminders.ts` | `scheduleTaskReminder` (at due minus 30 min) | TASK-01A row + its `whatsapp` channel | The assignee's "due soon" WhatsApp for any still-open task | `../pages/tasks.md` |
| `send-task-reminder` | `task-reminders.ts` | `scheduleTaskReminder` (at due) | TASK-01A / TASK-01B rows | In-app `task_due`, the agent's overdue WhatsApp, arms the overdue check, and the lead-shaped reminder for lead tasks. 3 attempts | `../pages/tasks.md` |
| `check-task-overdue` | `task-reminders.ts` | `send-task-reminder` (at due plus the TASK-01B threshold) | TASK-01B row | Stamps `tasks.overdue_at` once, emits the oversight event, escalates to managers | `../pages/tasks.md` |
| `send-task-nudge` | `task-reminders.ts` | `scheduleTaskNudge` (from `setTaskNudgeCore`, migration 0232) | the task's `nudge_every_minutes` / `nudge_until` | One repeat reminder ("remind him every 3 hours"): in-app plus the `task_assigned` WhatsApp, then arms the next. 3 attempts | `../pages/tasks.md`, `../modules/elaya.md` (Elaya's `remindEveryHours`) |
| `elaya-deep-read` | `elaya-deep-read.ts` | `startDeepReadJob(jobId)` (Elaya's `start_deep_read` tool, the nightly top-up, a continuation) | none (the spend cap is inside the job) | Reads and judges every relevant row for one question, saves labels, answers on the asking channel. A 25-minute budget (`DEEP_READ_MAX_MINUTES`, `maxDuration` 26 min) after which it queues a continuation job; 1 attempt, 2 at a time | `../modules/elaya-analyst.md` |
| `intake-lesson-write` | `intake-lessons.ts` | `startIntakeLessonWrite(kind)` ("Write a lesson now" on /settings/tickets) | none | Writes one lesson draft for one kind of work, even below the minimum | `../modules/tickets.md` |
| `member-assess-one` | `member-assessment.ts` | `startMemberAssessment(memberId)` ("Assess now", and a big health signal via `member-health.ts`) | none | Refreshes the pulse, then one fresh judgement for one member. 2 at a time | `../modules/members.md` |

### 3b. Scheduled tasks

| Task id | File | Schedule | Gate | What it does | Owner doc |
| ------- | ---- | -------- | ---- | ------------ | --------- |
| `sweep-revival-candidates` | `lead-revival.ts` | `0 2 * * *` Asia/Calcutta = **02:00 IST** (see note below) | active rows in `gia.revival_policies` (none = no-op) | Finds silent leads, runs the note-AI gate, creates "Revived" tasks or review candidates | `../modules/revival.md` |
| `snapshot-usage-presence` | `usage-snapshot.ts` | every minute | none | Copies live Redis presence keys into `usage_heartbeats` | `../pages/usage.md` |
| `rollup-usage-today` | `usage-rollup.ts` | every 15 min | none | Re-rolls today into `usage_daily` | `../pages/usage.md` |
| `rollup-usage-nightly` | `usage-rollup.ts` | 00:20 | none | Finalises yesterday, prunes heartbeats older than 30 days | `../pages/usage.md` |
| `sia-silence-watch` | `sia-silence.ts` | every minute | none | The Sia watcher alarm: down / session lost / unreachable / quiet, 10-minute reminders, founders join after an hour | `sia-connector.md`, `connector/RUNBOOK.md` |
| `sia-staff-link` | `sia-staff-link.ts` | every 15 min | none | Links WhatsApp contacts to Serene accounts by phone | `../modules/sia.md` |
| `freshdesk-sync` | `freshdesk-sync.ts` | every minute | Freshdesk env present (else a quiet no-op) | One budgeted cycle of the Freshdesk mirror (poll, threads, contacts, backfill, files). 30 s time budget | `freshdesk.md` |
| `vendor-extract` | `vendor-extract.ts` | every 5 min (`maxDuration` 300) | none (without `ANTHROPIC_API_KEY` on the worker every read fails closed and the notes stay queued) | Reads unread Freshdesk notes for vendor facts; settles finished jobs | `../modules/vendors.md` |
| `member-profiler` | `member-profiler.ts` | every 10 min | `member_profiler_enabled`, OFF unless true | Reads finished member-group conversations into the member twin | `../modules/members.md` |
| `member-pulse` | `member-assessment.ts` | minute 7 of every hour | none | Recomputes every member's activity numbers in one SQL statement | `../modules/members.md` |
| `member-assessment-weekly` | `member-assessment.ts` | Sunday 04:00 | `member_assessment_enabled`, ON unless false | Serene's judgement for Active members not judged in the last week | `../modules/members.md` |
| `ticket-intake` | `ticket-intake.ts` | every minute | `ticket_intake_enabled`, OFF unless true | Reads new member-group messages and files a suggested-ticket card for real requests | `../modules/tickets.md` |
| `ticket-sentinel` | `ticket-sentinel.ts` | every minute | none | Claims tickets whose alarm rang and runs one wake each (rules, then a model read only on new text) | `../modules/tickets.md` |
| `intake-lessons-weekly` | `intake-lessons.ts` | Monday 06:00 | `intake_lessons_enabled`, ON unless false | One lesson draft per kind from new human verdicts; a founder approves it | `../modules/tickets.md` |
| `elaya-briefing-morning` | `elaya-briefing.ts` | 10:00 | `daily_briefing_enabled`, OFF unless true | The founders' brief for yesterday 18:00 to 10:00 | `../modules/elaya-analyst.md` |
| `elaya-briefing-evening` | `elaya-briefing.ts` | 18:00 | `daily_briefing_enabled`, OFF unless true | The founders' brief for 10:00 to 18:00 | `../modules/elaya-analyst.md` |
| `elaya-alerts` | `elaya-alerts.ts` | every 5 min | `elaya_alerts_enabled`, OFF unless true | The live alert sweep: waiting members, escalating tickets, sour chats, Elaya's own silent turns | `../modules/elaya-analyst.md` |
| `elaya-labels-refresh` | `elaya-labels-refresh.ts` | 05:30 | `elaya_labels_refresh_enabled`, ON unless false | Queues one `refresh` deep-read job per recently asked label set | `../modules/elaya-analyst.md` |

Schedules without a timezone (the every-N-minutes ones and `member-pulse`) run on UTC, which does
not matter at that grain.

> **The revival sweep runs at 02:00 IST, whatever the comments say.** The code comment in
> `lead-revival.ts`, root `CLAUDE.md` and `scripts/engine-health-check.sql` all say "07:30 IST
> (02:00 UTC)". But the task has carried `timezone` IST since it was written (2026-06-14), so
> `0 2 * * *` fires at 02:00 IST. Production confirms it: every row in `gia.revival_candidates`
> was created between 02:00 and 02:02 IST (checked 2026-09-26). Still open: decide whether 02:00
> is the wanted time. If 07:30 was meant, change the pattern to `30 7 * * *`; otherwise fix the
> comments (`../TODO.md`).

## 4. Conventions every task follows

**One run at a time, a time budget, and leave when late.** A sweep that can outlast its interval
uses `queue: { concurrencyLimit: 1 }`, a time budget inside `run()` well under the interval, and
an early exit when the run starts long after its scheduled minute (`payload.timestamp`). This is
the lesson of 2026-09-18: with one slot and a cycle longer than its schedule, the queue can only
grow (the Freshdesk task reached 173 stale runs and a 17-hour lag). `maxDuration` is only the
backstop. Current late-exit thresholds: `freshdesk-sync` 150 s, `ticket-intake` 50 s,
`member-profiler` 9 min, `elaya-alerts` 240 s.

**Idempotency keys and tags, not stored run ids.** Delayed runs carry an idempotency key, so a
double arm returns the existing run instead of a second one, and a tag, so a cancel can find them.

| Family | Idempotency key | Tag |
| ------ | --------------- | --- |
| Lead SLA status rule | `lead-sla-${leadId}-${ruleCode}` | `lead-sla-${leadId}`, `sla-rule-${ruleCode}` |
| Lead cadence tick | `lead-sla-${leadId}-${ruleCode}-${YYYY-MM-DD}` (IST date of the fire, so one tick per day is structural) | same |
| Task due reminder | `task-reminder-${taskId}` | `task-reminder-${taskId}` |
| Task due-soon ping | `task-due-soon-${taskId}-${dueAtISO}` | `task-reminder-${taskId}` |
| Task overdue check | `task-overdue-${taskId}-${dueAtISO}` | `task-reminder-${taskId}` |
| Task nudge | `task-nudge-${taskId}-${nudgeUntil}-${seq}` | `task-reminder-${taskId}` |
| Deep read | `elaya-deep-read-${jobId}` | `elaya-job-${jobId}` |
| Lesson write | `intake-lesson-write-${kind}-${hour}` | `intake-lesson-${kind}` |
| Member judgement | `member-assess-${memberId}-${hour}` | `member-${memberId}` |

The due-stamped keys give an edited due date its own chain while retries still dedupe. Because
every task reminder rides the one `task-reminder-${taskId}` tag, completing, deleting or re-dating
a task sweeps the due-soon ping, the reminder, the overdue check and any nudges together.

**`cancelRunsByTag(tag)`** (`src/lib/trigger/cancel-runs.ts`) is THE cancel: it lists DELAYED and
QUEUED runs for the tag and cancels them with `Promise.allSettled`. Both cancel paths
(`cancelLeadSlasByLeadTask`, `cancelTaskReminder`) call it. It lives outside `src/trigger/` so the
task scan skips it. Never re-inline the list-and-cancel loop.

**Policy rows are read per run, never cached in module scope.** A policy edit, or an `active`
flip, reaches runs that are already waiting.

**Make failures visible.** An arm or send that ends in `.catch(() => {})` is invisible, which is
how the 2026-09-21 key problem hid for weeks. New code logs its arm error at least.

## 5. The delayed families in detail

### Lead SLA timers (`lead-sla.ts`)

- `scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds, opts?)`
  arms one run per (lead, rule). A `fireAt` in the past fires at once rather than being skipped
  (the SLA was already breached when it was armed). It then writes the run id back to
  `gia.lead_sla_timers.trigger_run_id`, best effort and informational only.
- `cancelLeadSlasByLeadTask(leadId)` cancels by the `lead-sla-${leadId}` tag, then marks the
  timer rows cancelled (`cancelSlaTimersForLeadInDb`). Status rules and cadence ticks share the
  tag, which is why a status change disarms the cadence for free.
- `fire-lead-sla` calls `fireSlaBreachHandler` (`lib/actions/sla.ts`), which loads the
  `gia.sla_policies` row on every fire and branches on `trigger_kind` (status breach or `CAD`
  cadence tick). The handler re-reads the lead, including `last_call_outcome` and
  `last_call_outcome_at`: a status rule exits if the status moved on; a cadence tick exits if the
  outcome or status changed or the outcome is older than the 7-day freshness window. A stale fire
  returns `STALE_FIRE`, which is not retried; any other error throws and uses the 3 attempts.
- `lib/actions/sla.ts` runs without a session. It is the documented `requireProfile()` exception
  and uses the admin client.

**Where the app arms and cancels them.** The lead mutation cores in
`src/lib/services/lead-mutations.ts` call the SLA actions, so the server actions in
`lib/actions/leads.ts` and Elaya's write tools get the same behaviour:

1. `assignLeadCore` (and `createManualLead`, `bulkUpdateLeads`, the lead webhook, WhatsApp-origin
   leads) hand off to `notifyLeadAssigned({ scheduleSla: true })`, which calls
   `scheduleSlaTimersForLead` for status `new`, whether or not an agent was assigned.
2. `updateLeadStatusCore`: a terminal status calls `cancelSlaTimersForLead`; any other status
   cancels and re-arms for the new status.
3. `addLeadCallNoteCore`: a call that auto-advances `new → touched` re-arms; otherwise
   `refreshActivitySlaTimers` (SLA-02/03 only; SLA-01 is never refreshed by activity). In both
   branches `armCadenceForOutcome` is chained AFTER the arm or refresh settles, because their
   cancel-all would otherwise kill the new tick. It does nothing unless the outcome is
   rnr / switched_off / wrong_number and the status can be armed.

Rule config lives in `gia.sla_policies` (migration 0111, moved to `gia` in 0210). The static
vocabulary lives in `src/lib/constants/sla.ts`. The rule table itself is documented in
`../modules/gia.md` §4.

### Task reminders and nudges (`task-reminders.ts`)

- `scheduleTaskReminder(taskId, dueAt, assignedTo)` does nothing for a due date in the past. It
  also arms `send-task-due-soon` at due minus 30 minutes (at once when less than 30 minutes
  remain; a failure there is logged and does not stop the main reminder).
- `send-task-reminder` does four things at the due moment: (1) the `task_due` in-app notification
  for every task (`notificationKey: 'task_due'`); (2) the agent's own "task just went overdue"
  WhatsApp for every still-open task, lead or not; (3) arms `check-task-overdue` at due plus the
  TASK-01B threshold; (4) for lead tasks only (a `gia.task_gia_meta` row exists), the lead-shaped
  `task_due_reminder` WhatsApp.
- `check-task-overdue` exits on any clearing event (task done or cancelled, due date moved, for a
  lead task a lead activity after the due time). Otherwise it stamps `tasks.overdue_at` exactly
  once (`UPDATE … WHERE overdue_at IS NULL`; the losing racer gets zero rows and sends nothing),
  emits the oversight `overdue` event, then escalates: a lead task to the lead's domain managers
  (in-app `task_overdue_manager` plus the lead-shaped WhatsApp), any other task to the assignee's
  manager (`reports_to` when active, else the domain managers) with the generic template.
- `send-task-nudge` (migration 0232) re-reads the task every time and stops when it is not
  `to_do` / `in_progress`, when the repeat was cleared, when a newer repeat replaced it
  (`nudge_until` differs), or when the window ended. Otherwise it sends the in-app reminder and the
  `task_assigned` WhatsApp, updates `tasks.nudge_count`, and arms the next nudge. Bounds (every 30
  minutes to 24 hours, for at most 3 days) are enforced where the repeat is set.
- `cancelTaskReminder(taskId)` cancels by the task's tag. `deleteTaskCore`
  (`task-mutations.ts`) calls it BEFORE the delete; since the cores refactor a cancel failure is
  logged and the delete goes ahead (earlier docs said the delete was aborted; that is no longer
  true).
- All four tasks read the TASK-01A / TASK-01B policy rows per run.

### Lead revival sweep (`lead-revival.ts`)

The first `schedules.task` in the project. It is the one periodic entry point the revival spec
calls for, not a second scheduler and not a copy of the SLA engine. Per run: read the active
`gia.revival_policies`; per status, find leads silent past the threshold with no candidate of any
status (the judge-once anti-join, pushed into the `get_silent_leads_for_revival` RPC); run the
note-AI gate (one routing-tier call through the Elaya provider and `maskPii`, failing closed to
`unsure`); then `revive` under the agent's daily cap creates a "Revived" task through
`reviveLeadCore`, while `unsure` or a revive over the cap opens a review candidate, and `dismiss`
writes a dismissed candidate as the audit log. The sweep never updates the lead row. Full
contract: `../modules/revival.md`.

### Usage snapshot and rollups (`usage-snapshot.ts`, `usage-rollup.ts`)

`snapshot-usage-presence` is the only writer of `usage_heartbeats`: it copies the live Redis
`presence:*` keys (set by the client heartbeat only while a user is active, 150 s TTL) into one
row per active user. The hot path never touches Postgres. The two rollups share one idempotent
core, `rollupUsageForDays`, which recomputes `active_minutes` from the raw ticks
(`COUNT(DISTINCT minute)`) and upserts on `(day, user_id, domain)`: it overwrites, never
increments, so the two may overlap near midnight with no double count. IST dates come from
`istDateString()` in `usage-service.ts`. Page: `../pages/usage.md`.

## 6. The newer scheduled families, in one paragraph each

- **Sia watcher alarm** (`sia-silence.ts`): judges liveness by the watcher's own heartbeat row
  (`sia.wag_watcher_status`, a beat every 60 s), never by group traffic. Tier 1 (the named tech
  responders in `constants/sia-alerts.ts`) hear it at once and every 10 minutes (a Redis latch per
  alert kind); founders join after one unresolved hour; recovery is announced once. In-app, push
  and the Sia alert WhatsApp template (mission-critical, not gated by preferences). Details:
  `sia-connector.md` and `connector/RUNBOOK.md`.
- **Freshdesk mirror** (`freshdesk-sync.ts`): since 2026-09-18 the account allows 400 calls a
  minute, but the ticket endpoints the mirror uses are capped at 100 a minute, shared with the
  member app. Each cycle spends at most `FD_RUN_MAX_CALLS` (80), stops when fewer than
  `FD_RATE_RESERVE` (15) remain, and has a 30 s time budget; a run that stops early is finished by
  the next. (The task file's header still says 50 a minute; `constants/freshdesk.ts` is current.)
  The webhook route brings latency down to seconds; the poll stays the truth path. Details:
  `freshdesk.md`.
- **Vendor extractor** (`vendor-extract.ts`): calls Freshdesk not at all; it reads the mirror and
  spends model tokens, paced at every 5 minutes to bound the ceiling. Details:
  `../modules/vendors.md`.
- **Members** (`member-profiler.ts`, `member-assessment.ts`): the profiler reads finished
  conversations of member-linked groups (Active members only); the pulse is pure SQL every hour;
  the weekly judgement costs about ₹2 a member. Details: `../modules/members.md`.
- **Tickets** (`ticket-intake.ts`, `ticket-sentinel.ts`, `intake-lessons.ts`): intake only
  proposes cards, a human creates the ticket; the sentinel's claim is leased
  (`claim_sentinel_wakes`) so a second worker never takes the same ticket, and it never moves a
  ticket itself except the quiet close after resolved. Details: `../modules/tickets.md`.
- **Elaya analyst** (`elaya-briefing.ts`, `elaya-alerts.ts`, `elaya-deep-read.ts`,
  `elaya-labels-refresh.ts`): the twice-daily founders' brief, the 5-minute alert sweep, the deep
  read and its nightly top-up. The brief and the alerts send founders WhatsApp free text inside
  their 24-hour window, else a one-line template ping (`whatsapp-gupshup.md` §6). Details:
  `../modules/elaya-analyst.md`.

## 7. Is it running?

- `../operations/engine-health-check.md`: the daily SQL check for the SLA / reminder / revival
  engine, plus quick heartbeats for the newer sweeps.
- The Trigger.dev dashboard (project `proj_xfyyvwjmrumreyvawcwg`, prod environment): run history
  per task, the next run of each schedule, and the queue depth of the one-at-a-time sweeps.
- A worker that is down fails silently for every task on this page. After an env change on either
  Vercel or Trigger.dev, count real runs on the Trigger.dev side before calling it fixed.
