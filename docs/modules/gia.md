# Gia: The Sales Module

> **Purpose:** what Gia is: the lead lifecycle, the end-to-end flow from ad to deal, the follow-up (SLA) engine, where Gia's data lives, and the map of Gia surfaces.
> **Audience:** engineers (and a readable narrative for anyone technical).
> **Source-of-truth scope:** module narrative, lifecycle semantics, SLA business rules, the Gia data home. Page mechanics live in `../pages/*.md`; ingestion in `../integrations/lead-ingestion.md`; WhatsApp sends and templates in `../integrations/whatsapp-gupshup.md`; timer mechanics in `../integrations/trigger-dev.md`.
> **Last verified:** 2026-09-26 against `src/lib/supabase/schemas.ts`, `src/lib/constants/{domains,route-permissions,lead-sources,whatsapp,notification-categories}.ts`, `src/lib/services/{gia-task-links,lead-mutations,sla-service,lead-assignment-notify}.ts`, migrations 0210 and 0202, and the changelog through 2026-09-26.

---

## 1. What Gia is

Gia handles the whole journey of a lead: a form on a Meta ad, a Google campaign, the website,
the Indulge Shop app, or an inbound WhatsApp message, through ingestion, assignment,
conversation and resolution. Its principle: **no lead falls through the cracks, no agent is
overwhelmed, no prospect waits longer than they should.**

Gia serves the four sales domains in `GIA_DOMAINS` (`src/lib/constants/domains.ts`):
**onboarding**, **house**, **shop**, **legacy**. The other app domains (concierge, finance,
marketing, tech, business) are not Gia domains. `business` (the old `b2b` key, renamed
2026-09-16, migration 0202) can reach `/leads`, `/deals` and `/campaigns` through the route map,
but it has no deal shape, no interest vocabulary and no lead flow: a stray `TG_B2B` lead is
coerced into `onboarding` at ingestion (`src/lib/constants/campaign-domain-map.ts`).

Who sees what: an agent sees only their own assigned leads; a manager sees their domain (and
defaults to their own leads on `/leads`); admin and founder see everything. Gia does not replace
WhatsApp or phone calls, it records them. The agent calls outside Serene and comes back to log
what happened.

## 2. Where Gia's data lives

Since 2026-09-17 (migration 0210) Gia's 22 tables live in the **`gia` schema**, not `public`:
`leads`, `lead_activities`, `lead_notes`, `lead_raw_payloads`, `lead_sla_timers`,
`lead_product_enquiries`, `deals`, `sla_policies`, `agent_routing_config`, `revival_candidates`,
`revival_policies`, `domain_targets`, `ad_creatives`, `ad_spend_daily`, `ad_account_recharges`,
`task_gia_meta`, the four `whatsapp_*` tables, `service_cases` and `conversation_hooks`.

What this means in code:

- Every query on these tables goes through `giaDb(client)` from `src/lib/supabase/schemas.ts`
  (works with the session client and the admin client). ESLint refuses an unscoped
  `.from('<moved table>')` in `src/`.
- The RPCs stayed in `public`; migration 0210 widened their `search_path` to include `gia`, so no
  `.rpc()` call changed.
- **PostgREST cannot embed across schemas** (error PGRST200). A `gia` table can still embed
  `profiles(full_name)` because migrations 0212/0213 added a read-only `gia.profiles` view
  (`id`, `full_name` only). But `public.tasks` cannot embed `gia.task_gia_meta`. Every
  lead-to-task read goes through `src/lib/services/gia-task-links.ts`: `getTaskIdsForLead`,
  `getGiaLinksForTasks`, `isLeadTask`. Never re-add a `task_gia_meta` embed on a `public` query.
- `tasks` and `activity_events` stay in `public`.

The full table narrative is in `../architecture/database.md`; the move itself is in
`../architecture/schema-restructure-plan.md`.

## 3. The lead lifecycle

```text
new → touched → in_discussion → won
                     ↘ nurturing | lost | junk
```

| Status | Meaning | Auto-action |
| ------ | ------- | ----------- |
| `new` | arrived, not yet called | none |
| `touched` | first call attempt made | set automatically by the first call log |
| `in_discussion` | active conversation | none |
| `won` | converted | `recordDealCore` inserts a `gia.deals` row **before** the status flip (0072 to 0074; the old `leads.deal_*` columns were dropped in 0097) |
| `nurturing` | not ready now | creates a lead follow-up task (due in 3 months) inside the same RPC transaction |
| `lost` / `junk` | will not convert / invalid | needs a `resolution_reason` (0060) |

Every transition runs through the atomic `update_lead_status` RPC (0031), called by
`updateLeadStatusCore` in `src/lib/services/lead-mutations.ts`. Won notifications and SLA
scheduling or cancelling stay in the application layer (Trigger.dev cannot be rolled back by
Postgres). A `junk` lead can be revived back to `in_discussion` from the dossier ("Revive
Lead"), keeping all history and clearing `resolution_reason`; `won` and `lost` have no status
buttons. Terminal statuses cancel all SLA timers. (Lead Revival, `revival.md`, is a different
thing: it adds a task and never changes the status.)

The lead write cores in `lead-mutations.ts` (`addLeadNoteCore`, `addLeadCallNoteCore`,
`createLeadTaskCore`, `reviveLeadCore`, `updateLeadStatusCore`, `recordDealCore`,
`assignLeadCore`) are shared by the server actions and Elaya's write tools, and each emits an
`activity_events` row for the mobile Activity room (`../modules/mobile-ops.md`).

## 4. End-to-end flow (ad to deal)

1. **Ingestion.** Webhook (Pabbly for Meta, Google, website; the Shop app posts direct with its
   own secret) or an inbound WhatsApp message from an unknown number → validate → resolve domain
   → dedup by phone → insert the lead (`status='new'`, slug from a trigger) → round-robin
   assignment → activities. A repeat enquiry from the Shop app lands on the existing lead as a
   row in `lead_product_enquiries` (0180) instead of a second lead. Detail:
   `../integrations/lead-ingestion.md`.
2. **Notify and arm SLA.** `after(notifyLeadAssigned(...))` sends the agent a WhatsApp and an
   in-app notification and arms the SLA timers. The founder "new lead" WhatsApp is **paused**
   (see §6). Detail: `../integrations/whatsapp-gupshup.md`.
3. **First contact.** The agent opens the dossier, calls outside Serene, and logs the outcome and
   a note in `CalledModal` → `add_lead_call_note` RPC (0030): note, `call_count + 1`, the
   `new → touched` advance and activities in one transaction. The same modal can also create a
   follow-up task with a due date.
4. **Progression.** Status moves as the lead warms; team notes; lead follow-up tasks
   (`create_lead_gia_task`, 0054) show on the dossier's tasks card. The `/tasks` page has no Gia
   tab any more (a legacy `?tab=gia` falls back to My Tasks).
5. **Resolution.** Won: `WonDealModal` → `recordDeal` (deal row, then the status flip). Nurturing:
   automatic follow-up task plus SLA-04. Lost or junk: a reason is required.
6. **After won.** The deal lives on `/deals`. `deals.member_id` has a foreign key to the member
   spine since 0202 (`member.members`, see `members.md`), but no code writes it yet: the Gia to
   Sia hand-off (a won deal becoming a membership) is not built.

## 5. The follow-up engine (SLA, cadence, task-due rules)

Business hours: IST, Monday to Saturday, 09:00 to 19:00 (`src/lib/constants/sla.ts`), with
per-agent shift overrides from `/settings` (`buildAgentShiftOverride`).

**Config-driven (migration 0111).** Every rule is a row in `gia.sla_policies` (code,
`trigger_kind` `status|outcome|task_due`, `trigger_value`, `threshold_minutes`,
`recipient_role` `agent|manager|founder`, `auto_task`, `channels` `{in_app,whatsapp}`,
`hours_mode` `agent_shift|business|clock`, `active`). The engine reads policies **per job run**
through the admin client, never cached, so an edit applies on the next fire without a deploy.
`SLA_RULES` in `constants/sla.ts` is the parity reference for the seed, not an engine input. A
deactivated policy makes pending fires exit as stale.

The seed (the live rows can be edited from `/settings/follow-up-engine`, so the database is the
truth for current thresholds):

| Code | Kind | Trigger | Threshold | Recipient | Auto-task? |
| ---- | ---- | ------- | --------- | --------- | ---------- |
| SLA-01A | status | `new` | 15 min | agent | yes (urgent) |
| SLA-01B | status | `new` | 30 min | manager | no |
| SLA-01C | status | `new` | 45 min | founder | no |
| SLA-02A | status | `touched` | 24 h | agent | yes (high) |
| SLA-02B | status | `touched` | 36 h | manager | no |
| SLA-03A | status | `in_discussion` | 24 h | agent | yes (high) |
| SLA-03B | status | `in_discussion` | 36 h | manager | no |
| SLA-04A | status | `nurturing` | 4 business days | agent | yes (high) |
| SLA-04B | status | `nurturing` | 4 business days | manager | no |
| CAD-01A/B/C | outcome | `rnr` / `switched_off` / `wrong_number` | daily | agent | yes (the cadence task) |
| CAD-02A | status | `in_discussion` | every 48 business hours | agent | yes (the cadence task) |
| TASK-01A | task_due | lead follow-up due | at due | agent | no (in-app + WhatsApp reminder) |
| TASK-01B | task_due | lead follow-up due | +30 clock minutes | manager | no (overdue escalation) |

**The `gia_followup` label (migration 0138).** The `gia_followup` task category no longer exists.
A lead follow-up is a `personal` task plus a `gia.task_gia_meta` row (single writer: the
`create_lead_gia_task` RPC). The `trigger_value='gia_followup'` strings on the TASK-01 rows were
left in place as inert labels.

**Authoring rules.** An admin or founder can add a rule from the Follow-up Engine settings page.
The code is system-generated (`USR-<id>`; the `SLA-`, `CAD-` and `TASK-` prefixes are reserved)
and `trigger_value` is checked against `trigger_kind`, so a rule that can never fire is refused.
Spec: `../pages/settings.md`.

**Arming does not need an owner.** A lead created with no agent (empty round-robin pool) still
arms its manager (SLA-01B) and founder (SLA-01C) timers. The agent rule skips itself at fire time
when `assigned_to` is null. The Trigger.dev idempotency key carries no agent, so a later
assignment dedupes against the timers already armed.

**Outcome cadence (CAD-01).** A call note with an unreached outcome (`rnr`, `switched_off`,
`wrong_number`) arms a daily tick at the start of the agent's next shift day. Each tick re-reads
the lead and creates one follow-up task (type `call`, due two business hours into the shift),
then re-arms. It repeats until the outcome or status changes. Three guards stop duplicate storms:
date-scoped idempotency keys (`lead-sla-{lead}-{code}-{IST date}`), the open-task guard
(`getOpenGiaFollowupTask`, which reads through `gia-task-links.ts`), and a 7-day freshness window
on `leads.last_call_outcome_at` (0112). Only `new`, `touched` and `in_discussion` leads receive
cadence tasks. Cadence runs ride the `lead-sla-${leadId}` tag, so a status change cancels them.

**Status cadence (CAD-02A, 0114).** Every `CAD-` code is a cadence (`isCadenceCode`). CAD-02A
fires 48 business hours after the lead enters `in_discussion`; if the lead is still there it
creates a follow-up task (same path and open-task guard) and re-arms. A call note resets the
clock.

**Task-due rules (TASK-01A/B).** At a lead follow-up's due time the agent gets the in-app
`task_due` notification plus the `task_due_reminder` WhatsApp template. Thirty clock minutes
later, with no clearing event (task done or cancelled, or any lead activity after due),
`tasks.overdue_at` is stamped once and the domain's managers get `task_overdue_manager` in-app
and on WhatsApp.

**Every task gets WhatsApp pings (0142, 0153).** Not only lead tasks: any task sends its assignee
a "due soon" ping 30 minutes before due and an overdue ping at due; a non-lead task that goes
overdue escalates to the assignee's manager; assignment itself pings the assignee. Repeat
reminders ("remind Karan every 3 hours", 0232) are a tasks feature. Owner: `../pages/tasks.md`.

Mechanics (idempotency keys, tags, stale-fire guard, hook points) are in
`../integrations/trigger-dev.md`. Timer state lives in `gia.lead_sla_timers` (service-role only).
Activity refreshes SLA-02 and SLA-03 only; SLA-01 ends only when the lead leaves `new`.

> **The 2026-09-21 key incident is resolved in practice.** That day the changelog recorded that
> `TRIGGER_SECRET_KEY` on Vercel did not match the Trigger.dev project, so every run armed
> **from the website** (lead SLA timers, task reminders, cancel-by-tag) failed quietly. No
> resolution entry was written, but the engine health check on 2026-09-26 showed 21 SLA timers
> fired in the last 24 hours, so website-armed runs arrive again. A separate problem remains:
> about 1,877 timer rows are left `pending` after their fire time (see
> `../operations/engine-health-check.md`).

## 6. Notifications to founders are paused

Two pauses, both reversible, neither removes code:

- **New-lead WhatsApp to founders** (2026-09-21): `FOUNDER_LEAD_ALERTS_PAUSED = true` in
  `src/lib/constants/whatsapp.ts`. `notifyLeadAssigned` skips the founder send while it is on.
  The agent's assignment WhatsApp, the in-app notification and the SLA timers are unchanged.
- **Founder SLA escalations and `lead_won`** (2026-09-23): per-founder rows in
  `notification_preferences` (the 0133 control plane) turn off `sla_escalation` (in-app and
  WhatsApp), `new_lead_founder_alert` (WhatsApp) and `lead_won` (in-app). Each founder can turn
  them back on from `/profile`. Agent and manager alerts still fire.

Detail and how to resume: `../integrations/whatsapp-gupshup.md`.

## 7. Gia surfaces

| Surface | Spec |
| ------- | ---- |
| `/dashboard` (Gia widgets) | `../pages/dashboard.md` |
| `/leads` list, export, bulk edit, revival review view | `../pages/leads.md` |
| `/leads/[id]` dossier | `../pages/lead-dossier.md` |
| `/deals` | `../pages/deals.md` |
| `/campaigns` and `/campaigns/[id]` | `../pages/campaigns.md` |
| `/budget` (ad spend, recharges) | `../pages/budget.md` |
| `/admin/ad-creatives` | `../pages/ad-creatives.md` |
| `/performance` | `../pages/performance.md` |
| `/helpdesk` (Call Intelligence library) | `../pages/helpdesk.md`, `call-intelligence.md` |
| `/whatsapp` inbox | `../pages/whatsapp.md` |
| `/escalations` (SLA breaches, overdue tasks, going cold) | `../pages/escalations.md` |
| `/oversight` (manager+ work-in-progress drill) | `../pages/oversight.md` |
| `/tasks` (lead follow-ups show on the dossier, not in a Gia tab) | `../pages/tasks.md` |
| `/settings/follow-up-engine`, `/settings/lead-revival` | `../pages/settings.md`, `revival.md` |
| `/m` mobile rooms (founder's pocket view) | `mobile-ops.md` |
| `/error-log` (failed ingestions) | `../pages/error-log.md` |

Elaya reads and writes Gia through the same services and cores (lead search, notes, calls,
tasks, status, reassign, `log_deal`). Elaya is switched on for the Gia domains
(`ELAYA_DOMAINS`, 2026-09-26). Tool list: `elaya.md`. For founders and admins, Elaya's
read-only SQL layer also sees cleaned views of Gia's data in the `elaya_read` schema (`leads`,
`lead_notes`, `lead_activities`, `lead_sla_timers`, `lead_whatsapp_messages`, `deals`,
`ad_spend_daily`, `domain_targets`, `product_enquiries`, `revival_candidates`, with no phone,
email or WhatsApp id): `elaya-analyst.md`. The Gia scheduled jobs (the SLA timers, the task
reminders, the revival sweep) are listed with the rest in `../integrations/trigger-dev.md`.

## 8. Status

**Live in production use.** Shipped: ingestion (Pabbly, WhatsApp, the Shop app channel with
product enquiries, 2026-08-31), round-robin (managers in the pool, 0124), the full lifecycle,
the dossier, deals, campaigns, budget and recharges, performance, the WhatsApp inbox, the SLA
engine, notifications and Web Push, Redis caching, export and bulk edit, `/escalations`,
`/oversight`, Call Intelligence (`call-intelligence.md`), Lead Revival (`revival.md`), the mobile
rooms (`mobile-ops.md`), and the customer-facing WhatsApp Elaya (`customer-welcome-blast.md`).
Lead sources include `shop_app` (0180) and `self` (0182).

Not built: the Gia to Sia hand-off on `deals.member_id`; a `business` sales flow.
