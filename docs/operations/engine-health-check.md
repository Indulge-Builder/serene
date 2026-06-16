# Engine Health Check — daily runbook

The SLA / cadence / task-reminder / revival engine runs on **Trigger.dev**. The
Next.js app *schedules* timers; a deployed Trigger.dev worker *fires* them later.
If the worker is down, the app keeps scheduling timers but nothing ever fires —
silently. This check catches that without opening the Trigger.dev dashboard.

## Run it

`scripts/engine-health-check.sql` — run in the Supabase SQL editor (project
**Serene**), or:

```bash
psql "$DATABASE_URL" -f scripts/engine-health-check.sql
```

It returns one row per signal: `metric | value | status`.

## Read it

| Row | Healthy | React if not |
| --- | --- | --- |
| **SLA timers fired (last 24h)** | `> 0` once leads flow | 🔴 `0` while timers are being scheduled = worker down → `npm run trigger:deploy`, confirm a current prod deployment in the Trigger.dev dashboard |
| **Overdue pending timers** | `0` | 🔴 `>0` for over an hour = worker not processing → same fix as above |
| **Oldest stuck timer lag** | `none` | minutes-behind = how far the worker is lagging |
| **SLA breach / task reminder / revival** rows | informational | volume sanity-check — `0` across the board on a busy day is suspicious |
| **New SLA timers scheduled** | `> 0` on an active day | `0` while leads are coming in = the *app* (not the worker) isn't arming timers — check `scheduleSlaTimersForLead` call sites in `lib/actions/leads.ts` |

The single most important signal is the **first row**. The classic failure mode
is: *new timers scheduled = healthy number, but timers fired = 0*. That pattern
means scheduling works and firing doesn't → **redeploy the Trigger.dev worker.**

## Go-live week

Run it each morning. Expect the first row to read `🔴 0` until the worker is
deployed; after the first real SLA breach fires it flips to `✅ firing` and
stays there. That flip is your "engine is alive" confirmation.

## Related

- Engine code: `src/lib/actions/sla.ts`, `src/trigger/lead-sla.ts`, `src/trigger/task-reminders.ts`, `src/trigger/lead-revival.ts`
- Live rule config: `sla_policies` table (read per fire — edit a row, no redeploy needed)
- Deploy: `npm run trigger:deploy` (project `proj_xfyyvwjmrumreyvawcwg`, see `trigger.config.ts`)
