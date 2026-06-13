# Supplemental Diagrams — Lead Lifecycle, SLA & Ingestion

> Companion assets to [`../CODEBASE_KNOWLEDGE.md`](../CODEBASE_KNOWLEDGE.md) §8.

## Lead Status State Machine

```mermaid
stateDiagram-v2
    [*] --> new : ingest / manual / walk-in
    new --> touched : first call note (auto)
    new --> in_discussion : manual
    touched --> in_discussion : manual
    touched --> nurturing : manual
    in_discussion --> nurturing : manual
    in_discussion --> won : recordDeal
    touched --> won : recordDeal
    in_discussion --> lost : manual + reason
    in_discussion --> junk : manual + reason
    nurturing --> won : recordDeal
    won --> [*]
    lost --> [*]
    junk --> [*]
    note right of won
        Inserts deals row BEFORE flip
        Notifies managers/admins/founders
        Cancels all SLA timers
    end note
    note right of nurturing
        Auto-creates gia_followup task
        Cancels SLA-01/02/03, schedules SLA-04
    end note
```

A terminal lead (`won`/`lost`/`junk`) re-enquiring spawns a **new** lead row with `previous_lead_id` linking the chain.

## Ingestion Pipeline Sequence

```mermaid
sequenceDiagram
    participant Src as Meta/Pabbly/Google/Website
    participant WH as /api/webhooks/leads
    participant ING as ingestLead()
    participant DB as Postgres (RPCs)
    participant Notify as notifyLeadAssigned (after())

    Src->>WH: POST ?source=...
    WH->>WH: rate limit (before body read)
    WH->>WH: parse JSON
    WH->>DB: log raw payload (before auth)
    WH->>WH: Bearer token check (safeSecretCompare)
    WH->>ING: ingestLead(payload, source, rawId)
    ING->>ING: adapter normalize + Zod + sanitize
    ING->>ING: resolve domain (campaign prefix → default)
    ING->>DB: get_active_lead_by_phone (dedup)
    alt active duplicate
        DB-->>ING: existing lead → log duplicate_submission, no new row
    else terminal / none
        ING->>DB: get_next_round_robin_agent (SKIP LOCKED)
        ING->>DB: INSERT lead (status=new) + activities
    end
    ING-->>WH: IngestionResult
    WH->>Notify: after(notifyLeadAssigned(...))
    WH-->>Src: 201 { leadId }
    Notify->>Notify: agent + founder WhatsApp (awaited, parallel)
    Notify->>Notify: in-app notification + schedule SLA timers
```

## SLA Timer Lifecycle

```mermaid
sequenceDiagram
    participant Act as leads.ts action
    participant Sched as scheduleSlaTimersForLead
    participant TD as Trigger.dev
    participant Fire as fireSlaBreachHandler
    participant Pol as sla_policies (read per run)

    Act->>Sched: status change / assignment / call note
    Sched->>Pol: getSlaPolicies()
    Sched->>TD: scheduleLeadSlasTask(leadId, ruleCode, fireAt) [idempotency key]
    Note over TD: delayed job, tag lead-sla-${leadId}
    TD->>Fire: fireLeadSlaTask at fireAt
    Fire->>Pol: load policy per fire
    Fire->>Fire: re-read lead (STALE-FIRE GUARD)
    alt status still matches trigger_value
        Fire->>Fire: notify (in_app + whatsapp) + auto-task (open-task guard)
        opt cadence rule (CAD-*)
            Fire->>TD: re-arm next tick (same IST-date idempotency suffix)
        end
    else status changed
        Fire->>Fire: log STALE_FIRE, exit cleanly
    end
```
