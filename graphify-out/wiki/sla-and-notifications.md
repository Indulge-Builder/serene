# SLA engine & Notifications

> **Purpose:** A config-driven SLA engine (status triggers + outcome cadences) that schedules per-lead
> Trigger.dev delayed jobs and, on breach, routes notifications through WhatsApp + the in-app inbox
> (which fans out to Web Push).

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md). See also [push-notifications.md](push-notifications.md).

---

## Entry points & data flow

- **Policy config** — `getSlaPolicies()` (admin client, active only) is read **per job run**, never cached
  — a threshold edit must apply on the next fire.
- **Schedule on assignment** — `scheduleSlaTimersForLead({ leadId, status, assignedTo, … })` (`actions/sla.ts`)
  reads matching `sla_policies` and, per rule, schedules a Trigger.dev delayed job (`scheduleLeadSlasTask`).
- **Cadence arm** — `armCadenceForOutcome(leadId, callOutcome)` schedules a daily tick at IST midnight; the
  idempotency key includes the IST date → one tick per lead per rule per day.
- **Activity refresh** — `refreshActivitySlaTimers(leadId, status)` re-arms activity-gated rules after a call.
- **Timer fire** — `fireLeadSlaTask(leadId, ruleCode)` (`trigger/lead-sla.ts`): re-reads the lead
  (**stale-fire guard** — if the status no longer matches the rule trigger, exit cleanly), then creates a
  task or notifies.
- **Breach notify** — creates an in-app `notifications` row (→ `dispatchPush` fan-out inside
  `createNotification`) + Gupshup agent/manager templates.
- **Settings UI** — `getAllSlaPolicies()` (session, includes inactive) + `updateSlaPolicyAction`
  (admin/founder; only threshold/channels/hours_mode/active are writable).

---

## Canonical helpers

- `isCadenceCode(code)` (cadence tick vs status breach), `nextBusinessDeadline(...)` +
  `buildAgentShiftOverride()` (`lib/utils/sla.ts`, business-hours math), `toIst` / `toISTMidnight` (IST module).
- `createNotification(...)` (`notifications-service.ts`) — the single in-app + push fan-out seam.

---

## Key tables

| Table | Holds |
|---|---|
| `sla_policies` | `code`, trigger (status/outcome), recipient, `channels` text[], `threshold_minutes`, `hours_mode`, `active`, `auto_task` |
| `lead_sla_timers` | `lead_id`, `rule_code`, `status`, `fire_at`, `trigger_run_id`, `fired_at`, `cancelled_at` |
| `notifications` | in-app inbox rows; push fan-out via `dispatchPush` |
| `push_subscriptions` | device push endpoints (see [push-notifications.md](push-notifications.md)) |

---

## Invariants / gotchas

- **Policies read per run, never cached** — config edits apply on the next fire (same pattern as Elaya config).
- **Idempotency key `(leadId, ruleCode, IST date)`** — one cadence tick per lead per rule per day, structurally.
- **Stale-fire guard** — the timer payload is a snapshot; the job re-reads the lead and exits cleanly if the
  status no longer matches (not an error).
- **Cadence vs status rules** — `CAD-xx` (outcome ticks) re-arm daily after a call note; `SLA-xx` (status
  breaches) arm once per status until the status changes.
- **`auto_task` rules** create a follow-up task with `task_gia_meta.rule_code` (+ `call_outcome` on the cadence path).
- **Notifications from routes use `after()` + `await`** for the WhatsApp send (Vercel freeze rule); the
  Trigger.dev engine awaits naturally for the lambda lifetime.

---

## File map

| File | Role |
|---|---|
| `src/trigger/lead-sla.ts` | `scheduleLeadSlasTask`, `fireLeadSlaTask`, cancel-by-lead |
| `src/lib/services/sla-service.ts` | Policy queries (admin), timer CRUD, open-task dedup, manager lookups |
| `src/lib/actions/sla.ts` | schedule / cancel / refresh / arm-cadence / fire-breach |
| `src/lib/actions/sla-policies.ts` | `updateSlaPolicyAction` (settings write, admin/founder) |
| `src/lib/constants/sla.ts` | `SLA_RULES` vocabulary (parity reference for the 0111 seed) |
| `src/lib/utils/sla.ts` | `nextBusinessDeadline`, `buildAgentShiftOverride` (business-hours math) |
| `src/lib/services/notifications-service.ts` | `createNotification` (in-app row + push fan-out) |
| `src/lib/services/lead-assignment-notify.ts` | `notifyLeadAssigned` (agent + founder sends) |
| `src/components/settings/SlaPoliciesPanel.tsx` | Policy list + edit form (threshold/channels/active) |
| `src/app/(dashboard)/escalations/page.tsx` | Manager breach surface (escalated/overdue/going-cold, live) |
