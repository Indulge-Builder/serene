# Engine Health Check: daily runbook

> **Purpose:** a daily SQL check that the Trigger.dev engine (SLA, cadence, task reminders, revival) is actually firing, without opening the Trigger.dev dashboard, plus quick heartbeats for the newer scheduled jobs.
> **Audience:** engineers and ops. · **Source-of-truth scope:** the runbook for `scripts/engine-health-check.sql` and the extra heartbeat queries below. Job mechanics: `../integrations/trigger-dev.md`. Deploy: `deployment.md`.
> **Last verified:** 2026-09-26 against `scripts/engine-health-check.sql` (unchanged since 2026-06-17), `src/lib/supabase/schemas.ts` (`GIA_TABLES`), `src/lib/actions/sla.ts` (notification types), `src/trigger/`, and the table DDL in `supabase/migrations/` (0175, 0193, 0194, 0214, 0126).

The SLA, cadence, task-reminder and revival engine runs on Trigger.dev. The Next.js app
*schedules* timers; a deployed Trigger.dev worker *fires* them later. If the worker is down, or
the website's `TRIGGER_SECRET_KEY` is wrong, timers stop firing and nothing complains. This check
catches that without opening the Trigger.dev dashboard.

## Run it

> **The script is stale.** It names `lead_sla_timers`, `whatsapp_notification_logs` and
> `revival_candidates` without a schema, and all three moved to `gia` on 2026-09-17 (migration
> 0210). Run as written, it fails with "relation does not exist". Until the script is updated,
> set the search path first, in the same session:

In the Supabase SQL editor (project **Serene**), put this line above the pasted script and run
both together:

```sql
SET search_path = public, gia;
```

Or with `psql` (the `-c` runs first, in the same session):

```bash
psql "$DATABASE_URL" -c "SET search_path = public, gia" -f scripts/engine-health-check.sql
```

It returns one row per signal: `metric | value | status`.

## Read it

| Row | Healthy | React if not |
| --- | --- | --- |
| **SLA timers fired (last 24h)** | `> 0` once leads flow | 🔴 `0` while timers are being scheduled = the worker is down or not deployed. Run `pnpm trigger:deploy` and confirm a current prod deployment in the Trigger.dev dashboard |
| **Overdue pending timers** | `0` | 🔴 `>0` for over an hour = the worker is not processing. Same fix |
| **Oldest stuck timer lag** | `none` | minutes behind = how far the worker lags |
| **SLA breach notifications / task due reminders / revival candidates** | informational | a volume check. `0` across the board on a busy day is suspicious |
| **New SLA timers scheduled** | `> 0` on an active day | `0` while leads are coming in = the *app* is not arming timers. Check `TRIGGER_SECRET_KEY` on Vercel first (a wrong key fails every arm silently; 2026-09-21), then the `scheduleSlaTimersForLead` call sites in `src/lib/services/lead-mutations.ts` and `src/lib/services/lead-assignment-notify.ts` (the function lives in `src/lib/actions/sla.ts`) |

**Last reading, 2026-09-26 (production):** timers fired in 24h: 21 (✅); new timers scheduled:
37; SLA breach notifications: 17; task due reminders: 3; revival candidates: 0. **Overdue
pending timers: 1,877 (🔴), oldest about 101 days.** That red row is a standing backlog, not a
dead worker: timers are firing, but a steady trickle of rows is never moved out of `pending`
after its fire time (about 50 to 400 a week since mid-June, 58 in the last 7 days). The likely
cause is timer rows not being closed when their run is skipped or cancelled; it has not been
diagnosed. Until it is, read row 2 as "is the count growing faster than usual?", and lean on
row 1. Tracked in `../TODO.md`.

The most important signal is the **first row**. The classic failure is *new timers scheduled is a
healthy number, but timers fired is 0*: scheduling works and firing does not, so redeploy the
worker.

Notes on what the rows count:

- "New SLA timers scheduled" counts `gia.lead_sla_timers` rows, which the app writes whether or
  not the Trigger.dev arm succeeded. A healthy count here does not prove runs were armed; a
  growing "overdue pending" count alongside it points at the arm (the key) or the worker.
- The SLA notification row counts in-app `notifications` of types `sla_breach_agent`,
  `sla_breach_manager` and `sla_breach_founder`. Since 2026-09-23 the founders have muted
  `sla_escalation`, so founder rows are expected to be near zero.
- "Task due reminders sent" counts only the lead-shaped `task_due_reminder` WhatsApp (lead tasks).
  The task-shaped reminders log as `task_due_soon` and `task_overdue_agent`.
- The script's comment says the revival cron runs at 07:30 IST. The task actually fires at 02:00
  IST (`../integrations/trigger-dev.md` §3b), so the revival row counts that run.

## Quick heartbeats for the other scheduled jobs

The script has no rows for the jobs added since June. These read the tables those jobs write.
All read-only.

```sql
-- Freshdesk mirror: a 'poll' row every minute or so while Freshdesk is configured.
select kind, max(started_at) as last_run,
       count(*) filter (where ok is false) as failed_last_hour
from freshdesk.sync_runs
where started_at > now() - interval '1 hour'
group by kind order by last_run desc;

-- Model-run ledger: the profiler, intake, ticket creator, sentinel reads, lessons,
-- judgements. A switched-off job or a quiet day writes nothing; a run of failures
-- usually means the Anthropic account hit its limit.
select kind, max(started_at) as last_run, count(*) as runs,
       count(*) filter (where ok is false) as failed
from sia.extraction_runs
where started_at > now() - interval '24 hours'
group by kind order by last_run desc;

-- Vendor extractor queue: unread Freshdesk conversations. It should not grow steadily;
-- 'given_up' are notes that failed three reads and will not be offered again.
select count(*) filter (where vendor_extract_attempts < 3)  as waiting,
       count(*) filter (where vendor_extract_attempts >= 3) as given_up
from freshdesk.conversations
where vendor_extracted_at is null;

-- The Sia watcher's own heartbeat (the alarm task reads this every minute).
select state, beat_at, state_since, now() - beat_at as beat_age
from sia.wag_watcher_status;

-- Usage snapshot: the newest tick. Only moves while someone is active in Serene.
select max(captured_at) as last_tick from public.usage_heartbeats;
```

A worker that is down stops every one of these at once. When several go quiet together, look at
the Trigger.dev deployment and the worker's env before anything else.

## Go-live week

Run it each morning. Expect the first row to read `🔴 0` until the worker is deployed; after the
first real SLA breach fires it flips to `✅ firing` and stays there. That flip is the "engine is
alive" confirmation.

## Related

- Engine code: `src/lib/actions/sla.ts`, `src/trigger/lead-sla.ts`, `src/trigger/task-reminders.ts`, `src/trigger/lead-revival.ts`.
- Live rule config: `gia.sla_policies` (read per fire; edit a row, no redeploy needed).
- Deploy: `pnpm trigger:deploy` (project `proj_xfyyvwjmrumreyvawcwg`, see `trigger.config.ts`).
- Every other background job, its schedule and its switch: `../integrations/trigger-dev.md` §3.
