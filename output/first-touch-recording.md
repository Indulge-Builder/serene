# First-touch recording — tables, columns, and arrival timestamps

**Short answer:** A logged call is stored primarily in **`lead_notes`** (`call_outcome`, `created_at`) with a parallel **`lead_activities`** row `action_type = 'call_logged'`. Lead **arrival** for metrics is **`leads.created_at`** — there is **no** `received_at` on `leads`. `lead_raw_payloads.received_at` is ingestion audit only.

**Important:** "First touch" is **not one universal column**. Different features use different proxies (first call note vs first `new → touched` status change).

---

## Call logged — write path

RPC: `add_lead_call_note` (migration 0030+, latest body in 0084/0112)

### `lead_notes` (canonical call row)

| Column | Value on call log |
| --- | --- |
| `lead_id` | FK |
| `author_id` | Agent who logged |
| `content` | Note text (sanitized upstream) |
| **`call_outcome`** | `rnr` \| `switched_off` \| `wrong_number` \| `conversing` \| `other` |
| **`created_at`** | Timestamp of the call log |

Also updates `leads`:

| Column | On call log |
| --- | --- |
| `call_count` | Incremented |
| `last_call_outcome` | Set to outcome |
| `last_call_outcome_at` | Set to `p_now` (migration 0112) |
| `last_activity_at` | Set to `p_now` |
| `status` | Auto `new` → `touched` on first call (`v_auto_advance`) |
| `status_changed_at` | Set when auto-advance fires |

### `lead_activities` (append-only audit)

#### Row 1 — call

| Column | Value |
| --- | --- |
| `action_type` | **`'call_logged'`** |
| `actor_id` | Author |
| `details` | `jsonb`: `{ "outcome": "<call_outcome>", "call_count": <n> }` |
| `created_at` | Same transaction time |

#### Row 2 — note mirror

| `action_type` | `'note_added'` |
| `details` | `{ "call_outcome": "<call_outcome>" }` |

#### Row 3 — optional status change

| `action_type` | `'status_changed'` (only when `new` → `touched`) |
| `details` | `{ "old_status": "new", "new_status": "touched" }` |

Allowed `action_type` values (CHECK / comment): `lead_created`, `status_changed`, `note_added`, `agent_assigned`, `call_logged`, `duplicate_submission`, `sla_breach`, …

---

## Lead arrival timestamp

| Table | Column | Used as "lead arrived"? |
| --- | --- | --- |
| **`leads`** | **`created_at`** | **Yes** — cohort filters, performance RPCs, campaign metrics, first-touch deltas |
| `lead_raw_payloads` | `received_at` | **No** for lead metrics — webhook ingestion log only (`source`, raw payload) |
| `leads` | `assigned_at` | Assignment time, not arrival |

There is **no** `leads.received_at`.

---

## How "first touch" is measured (by feature)

### A. Performance — avg response time (`get_agent_performance` / `_agent_core_metrics`)

**Proxy:** first `status_changed` activity where `details->>'new_status' = 'touched'`

```sql
AVG(EXTRACT(EPOCH FROM (la.created_at - l.created_at)) / 60.0)
FROM lead_activities la
JOIN leads l ON l.id = la.lead_id
WHERE la.action_type = 'status_changed'
  AND la.details->>'new_status' = 'touched'
  AND la.created_at >= l.created_at
```

- Wall-clock minutes from **`leads.created_at`** to touch activity
- Often coincides with first call (auto-advance) but is **status-based**, not `call_logged`
- Negative diffs excluded (`la.created_at >= l.created_at`)

### B. Campaign — `avg_hours_to_first_touch` (`get_campaign_detail_metrics`)

Same proxy as (A):

```sql
MIN(la.created_at) AS first_touched_at
FROM lead_activities la
WHERE la.lead_id = l.id
  AND la.action_type = 'status_changed'
  AND la.details->>'new_status' = 'touched'
```

Then `AVG((first_touched_at - l.created_at) / 3600)` — wall-clock hours.

### C. Performance — calls logged count / outcome breakdown

**Source:** `lead_notes` where `call_outcome IS NOT NULL` (period-scoped on `n.created_at`).

Not the same as "first touch" — counts **every** call in the period.

### D. Agent detail panel — call outcome breakdown (`getAgentDetailMetrics`)

**Source:** `leads.last_call_outcome` across assigned leads (latest outcome per lead, not historical notes).

### E. Activity feed / drill-downs

- `getAgentLeadActivityPage` — `lead_activities`; `call_logged` rows expose `details->>'outcome'`
- `getAgentCallsPageForManager` — `lead_notes WHERE call_outcome IS NOT NULL` (one row per call)

---

## Practical mapping for deck work

| Question | Answer |
| --- | --- |
| When did the lead arrive? | `leads.created_at` |
| When was a call logged? | `lead_notes.created_at` + `lead_activities` (`call_logged`, `details.outcome`) |
| When was the lead first "touched"? | `lead_activities` first `status_changed` with `new_status = 'touched'` (or infer from first call if always auto-advancing from `new`) |
| Business-hours-adjusted touch? | **Not stored** — would need runtime math via `lib/utils/sla.ts` |

---

## Key files

- `supabase/migrations/20260527000003_leads.sql` — `leads`, `lead_activities`, `lead_notes` schema
- `supabase/migrations/20260529000030_rpc_add_lead_call_note.sql` — `call_logged` insert shape
- `supabase/migrations/20260608000087_fix_campaign_first_touch_key.sql` — first-touch lateral join fix
- `supabase/migrations/20260611000101_agent_performance_rpcs.sql` — response-time + outcome RPCs
- `src/lib/actions/leads.ts` — `addLeadCallNote` (SLA schedule after RPC)
- `src/lib/services/performance-service.ts` — mappers for agent detail metrics
