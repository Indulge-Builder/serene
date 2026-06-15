# Gia — The CRM Module

> **Purpose:** what Gia is — the lead lifecycle, the end-to-end flow from ad to deal, the SLA engine, and the map of Gia surfaces.
> **Audience:** engineers (+ a readable narrative for anyone technical). · **Source-of-truth scope:** module narrative, lifecycle semantics, SLA business rules. Page mechanics live in `../pages/*.md`; ingestion in `../integrations/lead-ingestion.md`; WhatsApp in `../integrations/whatsapp-gupshup.md`.
> **Last verified:** 2026-06-11 (rewritten from the retired `The_Gia.md`; pre-0072 deal-column claims and pre-0061 scratchpad claims corrected).

---

## 1. What Gia is

Gia handles the complete journey of a lead — from a form submitted on a Meta ad, Google
campaign, website, or an inbound WhatsApp message, through ingestion, validation, assignment,
conversation, and resolution. Its principle: **no lead falls through the cracks, no agent is
overwhelmed, no prospect waits longer than they should.**

Gia is domain-scoped to the four active sales domains — `GIA_DOMAINS`: **onboarding**,
**house**, **shop**, **legacy** (Q-17; display names from `DOMAIN_LABELS`). An agent sees only
their own assigned leads; a manager sees their domain; admin/founder see all. Gia does not
replace WhatsApp or phone calls — it records them. The agent calls outside the system and
comes back to Gia to log what happened.

## 2. The lead lifecycle

```text
new → touched → in_discussion → won
                     ↘ nurturing | lost | junk
```

| Status | Meaning | Auto-action |
| ------ | ------- | ----------- |
| `new` | arrived, not yet called | — |
| `touched` | first call attempt made | auto-set on first call log |
| `in_discussion` | active conversation | — |
| `won` | converted to client | `recordDeal` inserts a `public.deals` row **before** the status flip (0072–0074; the old `leads.deal_*` columns are gone — 0097) |
| `nurturing` | not ready now | auto-creates a Gia follow-up task (due +3 months) inside the same RPC transaction |
| `lost` / `junk` | won't convert / invalid | requires a `resolution_reason` (0060) |

Every transition runs through the atomic `update_lead_status` RPC (0031). Won notifications,
SLA scheduling/cancellation stay in the action layer (Trigger.dev can't be rolled back by
Postgres). **Revive** is supported (`junk → in_discussion`), preserving all history and
clearing `resolution_reason`. Terminal statuses cancel all SLA timers.

## 3. End-to-end flow (ad → deal)

1. **Ingestion** — webhook (or inbound WhatsApp from an unknown number) → validate → resolve
   domain → dedup by phone → insert lead (`status='new'`, trigger-generated slug) →
   atomic round-robin assignment → activities logged. Detail:
   `../integrations/lead-ingestion.md`.
2. **Notify + arm SLA** — `after(notifyLeadAssigned(...))`: agent WhatsApp, founder WhatsApp,
   in-app notification, SLA-01 timers. Detail: `../integrations/whatsapp-gupshup.md` §4.
3. **First contact** — agent opens the dossier from the notification, calls outside Serene,
   logs outcome + note via `CalledModal` → `add_lead_call_note` RPC (0030) — note insert,
   `call_count++`, auto-advance `new → touched`, activities, all in one transaction.
4. **Progression** — status updates as the lead warms; team notes; Gia follow-up tasks
   (`create_lead_gia_task`, 0054) appear on the dossier and the `/tasks` Gia tab.
5. **Resolution** — Won: `WonDealModal` → `recordDeal` (deals row, then status flip; managers
   notified). Nurturing: auto follow-up task + SLA-04. Lost/Junk: reason required.
6. **After won** — the deal lives on `/deals`; the future clients module takes over from
   `deals.client_id` (reserved).

## 4. The follow-up engine (SLA + cadence + task-due rules)

Business hours: IST, Mon–Sat 09:00–19:00 (`src/lib/constants/sla.ts`; per-agent shift
overrides from `/settings` via `buildAgentShiftOverride`).

**Config-driven since 2026-06-12 (migration 0111):** every rule is a row in
`sla_policies` (code, trigger_kind `status|outcome|task_due`, trigger_value,
threshold_minutes, recipient_role `agent|manager|founder`, auto_task, channels
`{in_app,whatsapp}`, hours_mode `agent_shift|business|clock`, active). The engine
reads policies **per job run** via the admin client — never cached at module
scope, so a threshold edit applies on the next fire without a deploy. `SLA_RULES`
in `constants/sla.ts` is the parity reference for the seed, not an engine input.
A deactivated policy (`active=false`) makes pending fires exit as stale.

| Code | Kind | Trigger | Threshold | Recipient | Auto-task? |
| ---- | ---- | ------- | --------- | --------- | ---------- |
| SLA-01A | status | `new` | 15 min | agent | yes (urgent) |
| SLA-01B | status | `new` | 30 min | manager | no |
| SLA-01C | status | `new` | 45 min | founder | no |
| SLA-02A | status | `touched` | 24 h | agent | yes (high) |
| SLA-02B | status | `touched` | 36 h | manager | no |
| SLA-03A | status | `in_discussion` | 24 h | agent | yes (high) |
| SLA-03B | status | `in_discussion` | 36 h | manager | no |
| SLA-04A | status | `nurturing` | 4 biz-days | agent | yes (high) |
| SLA-04B | status | `nurturing` | 4 biz-days | manager | no |
| CAD-01A/B/C | outcome | `rnr` / `switched_off` / `wrong_number` | daily | agent | yes (the cadence task) |
| CAD-02A | status | `in_discussion` | every 48 biz-h | agent | yes (the cadence task) |
| TASK-01A | task_due | `gia_followup` due | at due | agent | no (in-app + WhatsApp reminder) |
| TASK-01B | task_due | `gia_followup` due | +30 clock-min | manager | no (overdue escalation) |

**Authoring rules from `/settings` (2026-06-15):** an admin/founder can add a rule over this
catalog through the Follow-up Engine panel's "New rule" form — no developer, no migration. The
code is system-generated as an inert `USR-<id>` (never user-supplied; reserved `SLA-`/`CAD-`/`TASK-`
prefixes rejected structurally — a `CAD-` code would become a self-re-arming task generator), and
`trigger_value` is validated against `trigger_kind` server-side (a value that can never fire is
rejected, not armed into a permanent `STALE_FIRE`). A new row arms on the next matching lead. Spec:
`../pages/settings.md §4`.

**Arming is decoupled from assignment (2026-06-15):** a lead created with **no agent** (round-robin
pool empty) still arms its manager (`SLA-01B`) and founder (`SLA-01C`) escalation timers — the
escalation must fire even when nobody owns the lead. `notifyLeadAssigned` arms SLA on `scheduleSla`
alone (not on `assigned_to`); `ScheduleSlaSchema.assignedTo` is nullable; `resolveAgentShift(null)`
falls back to `BUSINESS_HOURS`. The agent rule (`SLA-01A`) self-skips at fire when `assigned_to` is
null; manager/founder rules resolve recipients from the lead's domain. The Trigger.dev idempotency
key carries no agent, so a later assignment re-arming the same rule dedupes against the unassigned
timer (no double-arming). *(Before this fix, an unassigned lead armed zero timers — nobody was told
it was rotting.)*

**Outcome cadence (CAD-01 family):** when a call note lands with an unreached
outcome (vocabulary = the rnr/switched_off/wrong_number subset of
`CALL_OUTCOMES`), `addLeadCallNote` arms a daily tick — scheduled at the start
of the agent's **next shift day** (an RNR logged 19:30 ticks tomorrow at shift
open, never 19:30+24h). Each tick re-reads the lead and creates one follow-up
task (`create_lead_gia_task`, type `call`, due 2 business hours into the shift),
then re-arms for tomorrow. It repeats daily until the outcome or status changes.
Three duplicate-storm layers, all required: date-scoped idempotency keys
(`lead-sla-{lead}-{code}-{IST date}`), the open-task guard
(`getOpenGiaFollowupTask` — an open gia task for the lead+agent skips creation;
the overdue rule chases it), and the 7-day freshness window on
`leads.last_call_outcome_at` (migration 0112 — pre-go-live/backfilled outcomes
never arm; NULL timestamp = never fresh). Armable statuses:
`new`/`touched`/`in_discussion` only — junk/lost/nurturing/terminal never
receive cadence tasks. Status changes disarm structurally: cadence runs ride
the `lead-sla-${leadId}` tag, so the existing cancel-all sweeps them.

**Status cadence (CAD-02A, migration 0114):** every CAD-prefixed code is a
cadence regardless of trigger_kind (`isCadenceCode` in `constants/sla.ts`).
CAD-02A arms with the other `in_discussion` status policies on every status
change / activity refresh and fires 48 business hours later; if the lead is
STILL `in_discussion` it creates a follow-up task (same `create_lead_gia_task`
path + open-task guard as CAD-01) and re-arms `threshold_minutes` ahead —
repeating until the lead leaves the status. A call note resets the 48h clock
(`refreshActivitySlaTimers` cancel-all + re-schedule); no outcome/freshness
guards apply — the status itself is the liveness condition.

**Task-due rules (TASK-01A/B):** at a `gia_followup` task's due time the
existing `task_due` in-app notification is joined by the `task_due_reminder`
WhatsApp template to the agent (gia tasks only — the template is lead-shaped;
personal/group tasks stay in-app only). 30 clock-minutes later, if there is no
clearing event (task completed/cancelled OR any lead activity after due),
`tasks.overdue_at` is stamped **exactly once** (UPDATE … WHERE overdue_at IS
NULL — never a status value; the status CHECK did not grow) and the lead's
domain managers get `task_overdue_manager` in-app + WhatsApp.

Mechanics (idempotency keys, tags, stale-fire guard, hook points):
`../integrations/trigger-dev.md`. Timer state: `lead_sla_timers`
(service-role only; CAD ticks ride the same table). Breach notifications: the
SLA Gupshup templates + in-app `sla_breach_*` notifications (founder rules use
`sla_breach_founder` + the SLA manager template). Activity refreshes SLA-02/03
only — SLA-01 is never refreshed by activity, only by leaving `new`.

## 5. Gia surfaces

| Surface | Spec |
| ------- | ---- |
| `/leads` list + export | `../pages/leads.md` |
| `/leads/[id]` dossier | `../pages/lead-dossier.md` |
| `/deals` | `../pages/deals.md` |
| `/campaigns` analytics | `../pages/campaigns.md` |
| `/performance` | `../pages/performance.md` |
| `/whatsapp` inbox | `../pages/whatsapp.md` |
| `/tasks` Gia tab | `../pages/tasks.md` |
| Dashboard Gia widgets | `../pages/dashboard.md` |
| `/error-log` | `../pages/error-log.md` |

## 6. Status

**Live in production use.** Shipped: ingestion (both pipelines), round-robin, full lifecycle,
dossier, deals, campaigns, performance, WhatsApp inbox, SLA engine, notifications, Redis
caching, export. In design/planned: the WhatsApp AI chatbot (auto-engagement until the agent
takes over — schema columns exist, no code), client records (post-won flow), call
intelligence (`call-intelligence.md`).
