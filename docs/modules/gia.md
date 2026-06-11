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
3. **First contact** — agent opens the dossier from the notification, calls outside Eia,
   logs outcome + note via `CalledModal` → `add_lead_call_note` RPC (0030) — note insert,
   `call_count++`, auto-advance `new → touched`, activities, all in one transaction.
4. **Progression** — status updates as the lead warms; team notes; Gia follow-up tasks
   (`create_lead_gia_task`, 0054) appear on the dossier and the `/tasks` Gia tab.
5. **Resolution** — Won: `WonDealModal` → `recordDeal` (deals row, then status flip; managers
   notified). Nurturing: auto follow-up task + SLA-04. Lost/Junk: reason required.
6. **After won** — the deal lives on `/deals`; the future clients module takes over from
   `deals.client_id` (reserved).

## 4. The SLA engine

Business hours: IST, Mon–Sat 09:00–19:00 (`src/lib/constants/sla.ts`; per-agent shift
overrides from `/settings` via `buildAgentShiftOverride`). Eight rules:

| Code | Trigger status | Threshold | Recipient | Auto-task? |
| ---- | -------------- | --------- | --------- | ---------- |
| SLA-01A | `new` | 15 min | agent | yes (urgent) |
| SLA-01B | `new` | 30 min | manager | no |
| SLA-02A | `touched` | 24 h | agent | yes (high) |
| SLA-02B | `touched` | 36 h | manager | no |
| SLA-03A | `in_discussion` | 24 h | agent | yes (high) |
| SLA-03B | `in_discussion` | 36 h | manager | no |
| SLA-04A | `nurturing` | 4 biz-days | agent | yes (high) |
| SLA-04B | `nurturing` | 4 biz-days | manager | no |

Mechanics (idempotency keys, tags, stale-fire guard, hook points):
`../integrations/trigger-dev.md`. Timer state: `lead_sla_timers`
(service-role only). Breach notifications: the two SLA Gupshup templates +
in-app `sla_breach_*` notifications. Activity refreshes SLA-02/03 only — SLA-01 is never
refreshed by activity, only by leaving `new`.

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
