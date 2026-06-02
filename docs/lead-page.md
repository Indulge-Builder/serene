# Lead Page — Full Intelligence Document

Last verified: 2026-06-01

## 1. Module Overview

The Gia leads module is Indulge’s sales pipeline surface: inbound leads arrive via webhook (Meta / Google / website) or manual entry, are assigned to agents by domain, and progress through a fixed status lifecycle on a per-lead dossier. Managers see domain-scoped lists; agents see only assigned leads; admin and founder see all (with optional domain slice). The list page (`/leads`) uses URL-driven server-side filters, Suspense streaming, and column preferences in `localStorage`. The dossier (`/leads/[id]`) uses slug-first lookup (UUID fallback), parallel server fetches, inline field edits, call notes, team notes, scratchpad, Gia follow-up tasks, journey timeline, and activity log. Deal capture on Won writes `deal_type`, `deal_duration`, and `deal_amount` on `leads` (no separate `deals` table); won leads with `deal_amount` appear on `/deals`.

### Routes

| Route | Purpose |
| ----- | ------- |
| `/leads` | Primary nav list: filters, search, pagination, column picker, Add Lead. |
| `/leads/[id]` | Lead dossier: `id` is slug (`priya-sharma-9182`) or UUID (legacy links). |

---

## 2. Data Model

### 2a. Tables

#### `leads`

**Migration:** `20260527000003_leads.sql` (+ later ALTER migrations listed per column).

| Column | Type | Nullable | Notes |
| ------ | ---- | -------- | ----- |
| `id` | `uuid` | NOT NULL | PK, `gen_random_uuid()` |
| `first_name` | `text` | NOT NULL | |
| `last_name` | `text` | YES | |
| `email` | `text` | YES | |
| `phone` | `text` | YES | E.164 at app layer |
| `domain` | `app_domain` | NOT NULL | Normalised in `20260530000041_normalize_lead_domain.sql` |
| `assigned_to` | `uuid` | YES | FK → `profiles(id)` |
| `assigned_at` | `timestamptz` | YES | |
| `status` | `text` | NOT NULL | Default `'new'`; values in §2d |
| `lead_intent` | `text` | YES | `hot` \| `cold` (app) |
| `campaign_id` | `text` | YES | |
| `ad_name` | `text` | YES | |
| `platform` | `text` | YES | `meta` \| `google` \| `website` \| `whatsapp` |
| `utm_source` | `text` | YES | Also stores manual/dossier “Source” |
| `utm_medium` | `text` | YES | |
| `utm_campaign` | `text` | YES | |
| `utm_content` | `text` | YES | |
| `form_data` | `jsonb` | YES | Immutable after insert (convention) |
| `call_count` | `integer` | NOT NULL | Default `0` |
| `last_call_outcome` | `text` | YES | Call outcome enum |
| `private_scratchpad` | `text` | YES | Column SELECT revoked for `authenticated`; see `get_lead_scratchpad` |
| `created_at` | `timestamptz` | NOT NULL | Default `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `leads_updated_at` trigger |
| `archived_at` | `timestamptz` | YES | Soft delete |
| `previous_lead_id` | `uuid` | YES | FK → `leads(id)` ON DELETE RESTRICT (`20260527000008_lead_dedup.sql`) |
| `personal_details` | `jsonb` | YES | Agent enrichment (`20260527000009_lead_personal_details.sql`) |
| `slug` | `text` | YES | UNIQUE partial index; immutable (`20260530000045_lead_slug.sql`, collision fix `00046`) |
| `status_changed_at` | `timestamptz` | YES | SLA (`20260529000027_lead_sla_columns.sql`) |
| `last_activity_at` | `timestamptz` | YES | SLA |
| `deal_amount` | `numeric(12,2)` | YES | (`20260531000049_leads_deal_duration.sql`) |
| `deal_type` | `text` | YES | CHECK `membership` \| `retail` |
| `deal_duration` | `text` | YES | CHECK `3_months` \| `6_months` \| `1_year` or NULL |

**FK:** `assigned_to` → `profiles(id)`; `previous_lead_id` → `leads(id)`.

**RLS (SELECT)** — from `20260527000003_leads.sql` (domain comparisons updated in `00041` to `app_domain`):

```sql
CREATE POLICY "leads_agent_select"
  ON leads FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND assigned_to = auth.uid()
    AND archived_at IS NULL
  );

CREATE POLICY "leads_manager_select"
  ON leads FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND domain = get_user_domain()
    AND archived_at IS NULL
  );

CREATE POLICY "leads_admin_founder_select"
  ON leads FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
    AND archived_at IS NULL
  );
```

**RLS (UPDATE):**

```sql
CREATE POLICY "leads_update"
  ON leads FOR UPDATE
  USING (
    (get_user_role() = 'agent' AND assigned_to = auth.uid())
    OR (get_user_role() = 'manager' AND domain = get_user_domain())
    OR get_user_role() IN ('admin', 'founder')
  );
```

No INSERT policy for app users — webhook and server actions use service role.

---

#### `lead_activities` (append-only)

| Column | Type | Nullable |
| ------ | ---- | -------- |
| `id` | `uuid` | NOT NULL |
| `lead_id` | `uuid` | NOT NULL → `leads(id)` |
| `actor_id` | `uuid` | YES → `profiles(id)` |
| `action_type` | `text` | NOT NULL |
| `details` | `jsonb` | YES |
| `created_at` | `timestamptz` | NOT NULL |

**RLS (SELECT only):**

```sql
CREATE POLICY "lead_activities_select"
  ON lead_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_activities.lead_id
        AND (
          (get_user_role() = 'agent' AND l.assigned_to = auth.uid())
          OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
          OR get_user_role() IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );
```

No UPDATE or DELETE policies.

---

#### `lead_notes` (append-only)

| Column | Type | Nullable |
| ------ | ---- | -------- |
| `id` | `uuid` | NOT NULL |
| `lead_id` | `uuid` | NOT NULL → `leads(id)` |
| `author_id` | `uuid` | NOT NULL → `profiles(id)` |
| `content` | `text` | NOT NULL |
| `call_outcome` | `text` | YES |
| `created_at` | `timestamptz` | NOT NULL |

**RLS (SELECT only):**

```sql
CREATE POLICY "lead_notes_select"
  ON lead_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_notes.lead_id
        AND (
          (get_user_role() = 'agent' AND l.assigned_to = auth.uid())
          OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
          OR get_user_role() IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );
```

---

#### `lead_raw_payloads` (append-only)

| Column | Type | Nullable |
| ------ | ---- | -------- |
| `id` | `uuid` | NOT NULL |
| `lead_id` | `uuid` | YES → `leads(id)` |
| `source` | `text` | NOT NULL |
| `payload` | `jsonb` | NOT NULL |
| `received_at` | `timestamptz` | NOT NULL |
| `ingestion_error` | `text` | YES (`20260527000005_lead_raw_payloads_error.sql`) |

**RLS:**

```sql
CREATE POLICY "lead_raw_payloads_admin_founder_select"
  ON lead_raw_payloads FOR SELECT
  USING (get_user_role() IN ('admin', 'founder'));
```

No UPDATE/DELETE for app users; webhook marks `ingestion_error` via service role.

---

#### `task_gia_meta`

| Column | Type | Nullable |
| ------ | ---- | -------- |
| `task_id` | `uuid` | NOT NULL PK → `tasks(id)` ON DELETE CASCADE |
| `lead_id` | `uuid` | NOT NULL → `leads(id)` |
| `call_outcome` | `text` | YES |

**RLS (SELECT):**

```sql
CREATE POLICY "task_gia_meta_select"
  ON task_gia_meta FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_gia_meta.task_id
        AND (
          (get_user_role() = 'agent' AND t.assigned_to = auth.uid())
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );
```

---

#### `lead_sla_timers` (mutable job state — service role writes)

| Column | Type | Nullable | Notes |
| ------ | ---- | -------- | ----- |
| `id` | `uuid` | NOT NULL | |
| `lead_id` | `uuid` | NOT NULL | → `leads(id)` ON DELETE CASCADE |
| `rule_code` | `text` | NOT NULL | |
| `scheduled_fire_at` | `timestamptz` | NOT NULL | |
| `trigger_run_id` | `text` | YES | |
| `status` | `text` | NOT NULL | CHECK `pending` \| `fired` \| `cancelled` |
| `fired_at` | `timestamptz` | YES | |
| `cancelled_at` | `timestamptz` | YES | |
| `created_at` | `timestamptz` | NOT NULL | |

**RLS:** SELECT only for agent (own lead), manager (domain), admin/founder — see `20260529000028_lead_sla_timers.sql`.

---

### 2b. Indexes (partial on `leads` unless noted)

| Index | Columns | WHERE |
| ----- | ------- | ----- |
| `idx_leads_domain_status` | `(domain, status)` | `archived_at IS NULL` |
| `idx_leads_assigned_to` | `(assigned_to)` | `archived_at IS NULL` |
| `idx_leads_created_at` | `(created_at DESC)` | `archived_at IS NULL` |
| `idx_leads_phone` | `(phone)` | (full table) |
| `idx_leads_phone_active` | `(phone)` | `archived_at IS NULL AND phone IS NOT NULL AND phone <> ''` |
| `idx_leads_previous_lead_id` | `(previous_lead_id)` | `previous_lead_id IS NOT NULL` |
| `idx_leads_assigned_to_assigned_at` | `(assigned_to, assigned_at DESC)` | `archived_at IS NULL AND assigned_to IS NOT NULL` |
| `idx_leads_utm_source` | `(utm_source)` | `archived_at IS NULL` |
| `idx_leads_utm_campaign` | `(utm_campaign)` | `archived_at IS NULL` |
| `idx_leads_last_call_outcome` | `(last_call_outcome)` | `archived_at IS NULL` |
| `idx_leads_phone_text` | `(phone text_pattern_ops)` | `archived_at IS NULL` |
| `idx_leads_slug` | `(slug)` UNIQUE | `slug IS NOT NULL` |
| `idx_leads_status_changed_at` | `(status_changed_at)` | `archived_at IS NULL` |
| `idx_leads_last_activity_at` | `(last_activity_at)` | `archived_at IS NULL` |
| `idx_lead_activities_lead_id` | `(lead_id, created_at DESC)` | — |
| `idx_lead_notes_lead_id` | `(lead_id, created_at DESC)` | — |
| `idx_lead_raw_payloads_lead_id` | `(lead_id)` | — |
| `idx_lead_raw_payloads_source` | `(source, received_at DESC)` | — |
| `idx_task_gia_meta_lead_id` | `(lead_id)` | — |

Performance indexes on related tables: `idx_lead_activities_actor_status`, `idx_lead_notes_author_outcome`, `idx_leads_assigned_status_created` (`20260528000013_performance_indexes.sql`).

---

### 2c. RPCs

| Function | Parameters | One-line behaviour | Migration |
| -------- | ------------ | ------------------ | --------- |
| `get_active_lead_by_phone` | `p_phone text` | Returns newest active lead row (`new`/`touched`/`in_discussion`/`nurturing`, not archived) or empty set. | `20260527000008_lead_dedup.sql` |
| `get_next_round_robin_agent` | `p_domain text` | Atomic pick of next eligible agent (`FOR UPDATE SKIP LOCKED` on routing config); returns `uuid` or NULL. | `20260527000007_round_robin_fn.sql` |
| `add_lead_call_note` | `p_lead_id uuid`, `p_author_id uuid`, `p_content text`, `p_call_outcome text`, `p_now timestamptz` | Note + increment `call_count` + optional `new→touched` + activities; returns `jsonb`. | `20260529000030_rpc_add_lead_call_note.sql` |
| `update_lead_status` | `p_lead_id uuid`, `p_actor_id uuid`, `p_status text`, `p_reason text`, `p_now timestamptz` | Status update + activity; nurturing creates 3-month `gia_followup` task + `task_gia_meta`; returns `jsonb`. | `20260529000031_rpc_update_lead_status.sql` (+ nurturing fix `00039`) |
| `add_lead_plain_note` | `p_lead_id uuid`, `p_author_id uuid`, `p_content text`, `p_now timestamptz` | Plain note + `last_activity_at` + `note_added` activity; returns `{ note_id }`. | `20260530000040_rpc_add_lead_plain_note.sql` |
| `create_lead_gia_task` | `p_lead_id`, `p_assigned_to`, `p_created_by`, `p_task_type`, `p_title`, `p_description`, `p_priority`, `p_due_at` | Atomic `tasks` + `task_gia_meta` insert; returns `tasks` row. | `20260531000054_create_lead_gia_task.sql` |
| `get_lead_scratchpad` | `p_lead_id uuid` | Returns scratchpad text for agent/admin/founder only; NULL for manager. | `20260527000006_scratchpad_rls.sql` |
| `get_campaign_metrics` | `p_domain app_domain`, `p_date_from`, `p_date_to` | Campaign aggregates for `/campaigns`. | `20260528000014_campaign_analytics.sql` |
| `get_campaign_detail_metrics` | `p_campaign`, `p_date_from`, `p_date_to` | Single-campaign metrics. | `20260528000015_campaign_detail_metrics.sql` |
| `get_deals_summary` | (role-scoped args) | Won-lead aggregates for `/deals`. | `20260531000052_get_deals_summary.sql` |

**Application-layer round-robin:** `leads-service.getNextRoundRobinAgent()` still implements a three-query JS fallback using `createAdminClient()`; webhook ingestion calls this, not the DB function directly in current `lead-ingestion.ts`.

---

### 2d. Lead Status Enum

**TypeScript (`LeadStatus`):** `new` | `touched` | `in_discussion` | `won` | `nurturing` | `lost` | `junk`

**Journey path (UI):** `new` → `touched` → `in_discussion` → terminal stage (`won`, or `lost`/`junk`/`nurturing` as resolution).

**Transition rules (enforced in UI + actions, not a DB CHECK):**

| From | Allowed transitions (UI / actions) |
| ---- | ----------------------------------- |
| `new` | **Called** → auto `touched` via `add_lead_call_note` when first call logged; manual status changes via `updateLeadStatus` |
| `touched` | **Level Up** → `in_discussion`; **Junk** → `junk` (reason); **Called** |
| `in_discussion` | **Won** → `recordDeal` then `won`; **Nurture** → `nurturing`; **Lost** → `lost` (reason); **Called** |
| `nurturing` | **Called** only (no other status buttons in `StatusActionPanel`) |
| `won` | Terminal — **Called** disabled; read-only status pill |
| `lost` | Terminal — **Called** disabled |
| `junk` | **Revive Lead** → `in_discussion`; **Called** disabled until revived |

**Dedup active statuses:** `new`, `touched`, `in_discussion`, `nurturing` (`get_active_lead_by_phone`).  
**Terminal for dedup (new row allowed):** `won`, `lost`, `junk`.

**SLA terminal:** `won`, `lost`, `junk` — timers cancelled in `updateLeadStatus`.

---

## 3. Ingestion Pipeline

### Webhook route + auth

- **Path:** `POST /api/webhooks/leads?source=meta|google|website` (default `website`).
- **Auth:** `Authorization: Bearer <PABBLY_WEBHOOK_SECRET>`; mismatch → `401`, payload already logged with `ingestion_error: 'unauthorized'`.
- **Rate limit:** In-memory per IP, 100 req / 60s → `429`.
- **Order:** rate limit → parse JSON → `logRawPayload` → Bearer check → `ingestLead(rawPayload, source, rawPayloadId)`.
- **Success:** `201 { leadId }`; assignment WhatsApp notifications fire-and-forget.
- **File:** `src/app/api/webhooks/leads/route.ts`

### Source adapters

`src/lib/leads/adapters.ts` — `selectAdapter(source)` → `adaptMeta` | `adaptGoogle` | `adaptWebsite`.

| Adapter | Input shape | `platform` | Notes |
| ------- | ------------- | ------------ | ----- |
| **meta** | Pabbly `raw_data.res3.field_data` (JSON string or array); `res3.campaign_name`, `ad_name`, `campaign_id` | `meta` | Strips `res2` (page token) in `sanitizeRawPayload`; `utm_source: 'meta'` |
| **google** | Flat Pabbly key-value | `google` | |
| **website** | Flat keys | `website` | |

Phone via `normalizeToE164(raw, 'IN')` with raw fallback + warn.

### Domain resolution

1. Explicit `domain` on normalized payload (if present).  
2. Else `resolveDomainFromCampaign(utm_campaign)` using `CAMPAIGN_DOMAIN_MAP` prefix match (longest-prefix via `Object.entries` find + `startsWith`).  
3. Else `DEFAULT_LEAD_DOMAIN` (`'onboarding'`).

Unknown campaign prefix logs console warning when default used.

### Phone dedup

**Spec (gia-workflow Stage 3):** `get_active_lead_by_phone()` before insert; active dup → `duplicate_submission` activity, return existing `leadId`; terminal prior lead → new row with `previous_lead_id`.

**Implementation (2026-06-01 audit):** `ingestLead()` in `lead-ingestion.ts` does **not** call dedup — every webhook POST inserts a new lead. Dedup **is** implemented in `createManualLead` via `get_active_lead_by_phone` → `{ duplicate: true, leadId }`.

### Round-robin assignment

After domain resolution, `getNextRoundRobinAgent(domain)` (`leads-service.ts`, admin client): active agents in domain with `agent_routing_config.is_active`, pick least recent `assigned_at`. Logs `agent_assigned` activity with `method: 'round_robin'`. DB function `get_next_round_robin_agent(p_domain)` exists for atomic assignment but is not called from current ingestion path.

### SLA timer scheduling

Not in webhook path on first insert unless extended elsewhere. After assignment via actions:

- `assignLead`, `createManualLead` (if assigned): `scheduleSlaTimersForLead` fire-and-forget.  
- `updateLeadStatus`: terminal → `cancelSlaTimersForLead`; else reschedule.  
- `addLeadCallNote`: auto `new→touched` → full reschedule; else `refreshActivitySlaTimers` for `touched`/`in_discussion`.  
- `addLeadNote`: updates `last_activity_at` only — **no** SLA timer change.

Idempotency: Trigger.dev key `lead-sla-${leadId}-${ruleCode}`.

---

## 4. Services — `leads-service.ts`

| Function | Parameters | Return type | Query pattern | Called by |
| -------- | ------------ | ------------- | ------------- | --------- |
| `getLeadById` | `leadId: string` | `Promise<LeadWithAssignee \| null>` | `leads` + `assignee:profiles!leads_assigned_to_fkey(full_name)`; `archived_at IS NULL` | Dossier slug fallback |
| `getLeadBySlug` | `slug: string` | `Promise<LeadWithAssignee \| null>` | `eq('slug', slug)` exact | Dossier primary lookup |
| `getLeadsForAgent` | `agentId: string` | `Promise<Lead[]>` | `assigned_to`, not archived, `created_at DESC` | Legacy |
| `getLeadsForDomain` | `domain: string` | `Promise<Lead[]>` | `domain`, not archived | Legacy |
| `getAllLeads` | — | `Promise<Lead[]>` | All non-archived | Legacy |
| `getLeadsByRole` | `role`, `userId`, `domain`, `filters?` | `Promise<LeadsResult>` | Single query: explicit column list (no `*`); role constraints → filters → search `.or(ilike…)` → `.range()`; `{ count: 'exact', head: false }`. Returns `LeadListItemWithAssignee[]`, not `LeadWithAssignee[]`. | `LeadsTableAsync` |
| `getLeadsByRoleCached` | same | `Promise<LeadsResult>` | React `cache(getLeadsByRole)` | Optional dedup per request |
| `getLeadFilterOptions` | `role`, `callerDomain`, `filterDomain?` | `Promise<LeadFilterOptions>` | Distinct `utm_campaign`; agents from `profiles` | `leads/page.tsx` once |
| `getLeadActivities` | `leadId` | `Promise<LeadActivity[]>` | No join | Rare |
| `getLeadNotes` | `leadId` | `Promise<LeadNote[]>` | No join | Rare |
| `getLeadNotesFull` | `leadId` | `Promise<LeadNoteWithAuthor[]>` | Join `author:profiles!lead_notes_author_id_fkey(full_name)` | Dossier (see §7a note) |
| `getLeadActivitiesFull` | `leadId` | `Promise<LeadActivityWithActor[]>` | Join `actor:profiles!lead_activities_actor_id_fkey(full_name)` | Dossier (see §7a note) |
| `getNextLeadTask` | `leadId` | `Promise<Task \| null>` | From `tasks` + inner `task_gia_meta` | Retired on dossier |
| `getErroredPayloads` | — | `Promise<LeadRawPayload[]>` | `ingestion_error IS NOT NULL` | Admin error log |
| `getAgentsForDomain` | `domain` | `Promise<{id, full_name}[]>` | `role=agent`, active | Dossier reassign, Add Lead |
| `getActiveUsersForDomain` | `domain` | `Promise<{id, full_name, role}[]>` | Non-guest active users | Add Lead (admin/founder assignee list) |
| `getCampaignMetrics` | `role`, `callerDomain`, `filters` | `Promise<CampaignMetrics[]>` | RPC `get_campaign_metrics` | Campaigns list |
| `getCampaignDetailMetrics` | `campaignName`, `filters` | `Promise<CampaignDetailMetrics \| null>` | RPC | Campaign detail |
| `getCampaignAgentDistribution` | `campaignName`, `filters` | `Promise<AgentDistributionRow[]>` | RPC | Campaign detail |
| `getNextRoundRobinAgent` | `domain` | `Promise<string \| null>` | Admin client: agents + routing + last assignment sort | `lead-ingestion.ts` |
| `searchLeadsForTask` | `query`, `role`, `domain`, `userId` | `Promise<LeadSearchResult[]>` | ILIKE name/phone, limit 8, role-scoped | `searchLeadsAction` |

**Types exported from service:**

```typescript
export type LeadNoteWithAuthor = LeadNote & { author: { full_name: string } };
export type LeadActivityWithActor = LeadActivity & { actor: { full_name: string } | null };
export type LeadWithAssignee = Lead & { assignee: { full_name: string } | null };

// List path only — explicit column subset; form_data, personal_details, deal/SLA columns excluded.
export type LeadListItem = Pick<Lead,
  'id' | 'slug' | 'first_name' | 'last_name' | 'phone' | 'email' |
  'domain' | 'assigned_to' | 'status' | 'lead_intent' | 'platform' |
  'utm_source' | 'utm_medium' | 'utm_campaign' | 'call_count' |
  'last_call_outcome' | 'created_at'
>;
export type LeadListItemWithAssignee = LeadListItem & { assignee: { full_name: string } | null };
export type LeadsResult = { leads: LeadListItemWithAssignee[]; totalCount: number };
```

---

## 5. Server Actions — `leads.ts`

| Action | Zod schema | Auth | DB / RPC | Side effects | Return |
| ------ | ---------- | ---- | -------- | ------------ | ------ |
| `addLeadCallNote` | `AddCallNoteSchema` | Agent own / manager domain / admin / founder | RPC `add_lead_call_note` | SLA: auto-advance → `scheduleSlaTimersForLead`; else `refreshActivitySlaTimers` | `{ data: { noteId }, error }` |
| `updateLeadStatus` | `UpdateLeadStatusSchema` | Same | RPC `update_lead_status` | Won → `lead_won` notifications; SLA cancel or reschedule | `{ data: { leadId }, error }` |
| `assignLead` | `AssignLeadSchema` | manager / admin / founder only | Admin UPDATE lead + scratchpad null; INSERT activity | `lead_assigned` notification; WhatsApp assignment + founder; SLA schedule | `{ data: { leadId }, error }` |
| `updateScratchpad` | `UpdateScratchpadSchema` | Agent assigned / admin / founder | Admin UPDATE `private_scratchpad` | None | `{ data: null, error }` |
| `updatePersonalDetails` | `UpdatePersonalDetailsSchema` | Agent own / manager domain / admin / founder | Admin UPDATE `personal_details` JSONB merge | None | `{ data: null, error }` |
| `createManualLead` | `CreateManualLeadSchema` | Logged in; agent domain locked | Dedup RPC; INSERT lead + activities | Notifications + SLA if assigned | `{ data: { leadId, duplicate? }, error }` |
| `updateLeadEmail` | `UpdateLeadEmailSchema` | `assertLeadFieldEditAccess` | UPDATE email; activity `note_added` `{type:'lead_email_updated'}` | `revalidatePath` dossier | `{ data: { leadId }, error }` |
| `updateLeadDomain` | `UpdateLeadDomainSchema` | Same; **blocks agent** | UPDATE domain; activity | `revalidatePath` | `{ data: { leadId }, error }` |
| `updateLeadUtmSource` | `UpdateLeadUtmSourceSchema` | Field edit access | UPDATE `utm_source`; activity | `revalidatePath` | `{ data: { leadId }, error }` |
| `addLeadNote` | `AddLeadNoteSchema` | Standard lead access | RPC `add_lead_plain_note` | `last_activity_at` only (in RPC) | `{ data: { noteId }, error }` |
| `recordDeal` | `RecordDealSchema` | Standard lead access | UPDATE deal fields; then `updateLeadStatus({ status: 'won' })` | Won notifications + SLA via nested update | `{ data: { leadId }, error }` |
| `listAgentsForDomain` | — (domain string) | Logged in | `getAgentsForDomain` or `getActiveUsersForDomain` | None | `{ data: users[], error }` |
| `createLeadTaskAction` | `CreateLeadTaskSchema` | Standard lead access | RPC `create_lead_gia_task` | `scheduleTaskReminder` if `dueAt`; `revalidatePath(/leads/${slug\|id})` | `{ data: Task, error }` |
| `searchLeadsAction` | `SearchLeadsSchema` | Profile | `searchLeadsForTask` | None | `{ data: LeadSearchResult[], error }` |

---

## 6. The Lead List Page (`/leads`)

### 6a. Page Component (`page.tsx`)

**Fetches (parallel):**

- `getLeadFilterOptions(profile.role, profile.domain, filters.domain if Gia)` — once per page load.  
- `getActiveUsersForDomain(profile.domain)` if admin/founder else `getAgentsForDomain(profile.domain)` for Add Lead modal.

**`parseFilters(searchParams)` → `LeadFilters`:**

| Field | URL / default |
| ----- | ------------- |
| `status` | `status` comma-separated |
| `last_call_outcome` | `outcome` comma-separated |
| `domain` | `domain` via `parseGiaDomainParam` |
| `agent_id` | `agent_id` |
| `source` | `source` |
| `campaign` | `campaign` |
| `date_from` / `date_to` | ISO dates |
| `search` | `search` |
| `page` | `page`, default `1` |
| `pageSize` | fixed `30` |

**Gates:** guest → `/dashboard`; `showAgentFilter = role !== 'agent'`; `showDomainFilter = admin \| founder`.

**Tree:**

```text
main
  h1 + AddLeadButton
  LeadsFilters (paper strip)
  Suspense → LeadsTableAsync
```

### 6b. LeadsFilters

| Control | URL param | Options source |
| ------- | --------- | -------------- |
| Search | `search` | Local state; 500ms debounce → URL |
| Status | `status` | `LEAD_STATUSES` / `LEAD_STATUS_LABELS` |
| Outcome | `outcome` | `CALL_OUTCOMES` |
| Source | `source` | `LEAD_SOURCES` |
| Domain | `domain` | `GIA_DOMAIN_FILTER_ITEMS` — only if `showDomainFilter` |
| Campaign | `campaign` | `options.campaigns` from page |
| Agent | `agent_id` | `options.agents` — only if `showAgentFilter` |
| Date from / to | `date_from`, `date_to` | `DatePicker` |

**`buildParams`:** delegates to `buildFilterParams(current, updates, { resetKeys: ['page'] })` — every filter change deletes `page`.

**Active count:** +1 each for: search, status multi, outcome multi, source, campaign, domain, agent_id, date_from, date_to.

**Domain change:** `push({ domain, agent_id: null, campaign: null })` — clears scoped filters.

### 6c. LeadsTable + LeadsTableAsync + LeadsTableSkeleton

**LeadsTableAsync:** `getLeadsByRoleCached(role, userId, domain, filters)` → `{ leads, totalCount }`; passes `hasActiveFilters` to table. Direct child of `<Suspense>`.

**Columns (13):** Registry `src/lib/constants/lead-columns.ts`

| ID | Label | Default visible | Locked |
| -- | ----- | --------------- | ------ |
| `status` | Status | yes | **yes** |
| `name` | Name | yes | **yes** |
| `phone` | Phone | yes | no |
| `email` | Email | no | no |
| `campaign` | Campaign | yes | no |
| `source` | Source | no | no |
| `platform` | Platform | no | no |
| `medium` | Medium | no | no |
| `assigned_to` | Assigned To | no | no |
| `created_at` | Created | yes | no |
| `last_call_outcome` | Last Outcome | yes | no |
| `call_count` | Calls | no | no |
| `domain` | Domain | no | no |

`platform` renders as a pill (`var(--theme-accent-subtle)` bg, `var(--theme-text-secondary)` text). `medium` renders plain text via `getMetaMediumLabel()` from `lib/constants/lead-sources.ts` — shows `—` when null.

**Column prefs:** `useLeadColumnPreferences(userId)` — key `eia:leads:columns:${userId}:v1`. Locked columns always visible; drag reorder via `@dnd-kit/sortable` in `LeadColumnPicker`; locked columns pinned to front on reorder.

**Prefetch on hover:** Each `LeadRow` `<tr>` calls `router.prefetch('/leads/${lead.slug ?? lead.id}')` on `onMouseEnter` — same href as the `onClick` push. Uses the single `useRouter()` instance at the top of `LeadRow`. Next.js deduplicates repeated prefetch calls internally; no debounce needed.

**Empty state:**

- `hasActiveFilters === true`: heading *"Nothing matches these filters."*; sub *"Try adjusting or clearing your filters."*  
- `hasActiveFilters === false`: heading *"No leads yet."*; sub *"Leads will appear here once the webhook receives its first submission."*

Playfair italic heading (`var(--font-serif)`). Table has **zero** filter/sort logic.

### 6d. LeadsPagination

- **`pageSize`:** `30` (fixed in `parseFilters`, not user-configurable).  
- **Absent when:** `totalCount <= pageSize` (not in DOM).  
- **Showing text:** `from = (page-1)*pageSize+1`, `to = min(page*pageSize, totalCount)`.  
- **`useTransition`** on Prev/Next `router.push`; disabled buttons `pointer-events: none`, `opacity: 0.4`.

### 6e. AddLeadModal

**Schema:** `CreateManualLeadSchema` — `first_name`, `last_name?`, `phone` (E.164), `email?`, `domain` (`GIA_DOMAIN_ENUM`), `assigned_to?`, `utm_source?` (`LEAD_SOURCE_ENUM`).

**Duplicate:** `createManualLead` → `get_active_lead_by_phone`; returns `{ leadId, duplicate: true }`; banner with link `/leads/${duplicateLeadId}`; modal stays open.

**Submit action:** `createManualLead`.

**Agent fetch guard:** `listAgentsForDomain` only when `watchedDomain !== initialDomain`; restoring initial domain resets `initialAgents` without network.

---

## 7. The Lead Dossier Page (`/leads/[id]`)

### 7a. Page Component

**Lookup:** `getLeadBySlug(id)` then `getLeadById(id)` if null. No access → `redirect('/leads')`.

**Parallel fetch (batch 2):**

| Call | Returns | Note |
| ---- | ------- | ---- |
| `getLeadNotesFull(id)` | `LeadNoteWithAuthor[]` | **Uses URL param `id`, not `lead.id`** — slug URLs pass slug as `lead_id` unless param is UUID |
| `getLeadActivitiesFull(id)` | `LeadActivityWithActor[]` | Same |
| `getAdCreativesForCampaign(utm_campaign)` | `AdCreative[]` | Skipped if no campaign |
| `getAgentsForDomain(lead.domain)` | agents[] | Only if `canReassign` |

**Access gates (page-level, mirrors actions):**

| Capability | Agent | Manager | Admin | Founder |
| ---------- | ----- | ------- | ----- | ------- |
| View dossier | Own assigned only | Same `domain` | All | All |
| `canEditLeadFields` (email, source, assignee UI) | Own | Domain | ✓ | ✓ |
| `canEditDomain` | ✗ | ✓ | ✓ | ✓ |
| `canReassign` | ✗ | ✓ | ✓ | ✓ |
| `canEditScratchpad` | Own | ✗ | ✓ | ✓ |
| `canEditPersonalDetails` / `canAdd` notes | Own | Domain | ✓ | ✓ |

Matches gia-workflow Stage 7: agent = own leads; manager = domain; admin/founder = all; scratchpad and domain rules as above.

**Layout:** `StatusActionPanel` → 2-col grid (LeadInfoCard, PersonalDetails, Form data | Tasks, LeadNotesInput, Scratchpad) → Notes → Journey → Activity log.

**Tasks:** `<Suspense><LeadTasksAsync leadId={lead.id} /></Suspense>`.

### 7b. StatusActionPanel

Returns `null` if caller cannot act (same as edit gate for actions).

| Current status | Actions shown |
| -------------- | ------------- |
| `new` | Status pill; **Called** |
| `touched` | Pill; **Level Up** → `in_discussion`; **Junk** (reason modal); **Called** |
| `in_discussion` | Pill; **Won** (`WonDealModal` → `recordDeal`); **Nurture**; **Lost** (reason); **Called** |
| `nurturing` | Pill; **Called** only |
| `won` / `lost` | Pill only; **Called** disabled (`isTerminal`) |
| `junk` | Pill; **Revive Lead** → `in_discussion`; **Called** disabled |

Terminal = `won` \| `lost` \| `junk` for Called disable only.

**Optimistic status (`useOptimistic`):** The status pill and all button conditionals read from `optimisticStatus` (`useOptimistic(lead.status)`), not `lead.status` directly. Every status-changing path calls `setOptimisticStatus(newStatus)` inside `startTransition` before the action fires, then `throw new Error(result.error)` on failure — the throw is what signals React to revert `optimisticStatus` back to `lead.status` (actions return `{ data, error }` and never throw natively). `isPending` from `useTransition` is the disabled/loading signal for all buttons — no separate `isLoading` state.

**Called button — `new → touched` optimistic advance:** The Called `onClick` checks `lead.status === 'new'` (server truth, not `optimisticStatus`) and if true fires its own `startTransition(() => setOptimisticStatus('touched'))` before opening `CalledModal`. The parent owns this decision; `CalledModal` has no `initialStatus` or callback props. The `add_lead_call_note` RPC always auto-advances `new → touched` — that invariant is what makes the pre-emptive set safe. Using `lead.status` (not `optimisticStatus`) for the guard prevents a double-advance race on mid-transition re-renders.

### 7c. LeadInfoCard

**Read-only:** Full Name, Phone, Call count, Received, Last modified — not inline-edited (name/phone are not mutable in UI).

**Inline-editable (`canEdit`):** Email → `updateLeadEmail`; Source (`utm_source`) → `updateLeadUtmSource` via `FilterDropdown` / select pattern.

**Domain (`canEditDomain`):** `updateLeadDomain` — `GIA_DOMAIN_FILTER_ITEMS`; agents cannot.

**Assignee (`canReassign`):** `assignLead` via `AssigneeCombobox` (searchable); optimistic name + checkmark.

**Attribution (no separate `AttributionStrip` component):** Source and Campaign live in the contact grid. Campaign uses `CampaignLinkTrigger` when `adCreatives.length > 0` — hover `var(--theme-accent)`, opens modal.

**CampaignVideoModal trigger:** `adCreatives.length > 0 && lead.utm_campaign` — modal receives full `adCreatives[]` (multi-video per migration 0058).

### 7d. PersonalDetailsCard

**Fields (JSONB keys):** `company`, `occupation`, `interests`, `city`, `notes` (wide textarea).

**Edit mode:** Click dormant card → form with Save/Cancel footer.

**Storage:** `leads.personal_details` via `updatePersonalDetails`.

### 7e. AgentScratchpad

**Visibility:** `canEditScratchpad` — assigned agent, admin, founder only (managers do not receive edit on dossier).

**Auto-save:** 1000ms debounce → `updateScratchpad`.

**Cleared on:** `assignLead` sets `private_scratchpad: null` (incoming agent starts blank).

### 7f. CalledModal

**Required:** call outcome (`CALL_OUTCOMES`) + note content (`AddCallNoteSchema`).

**`call_count`:** RPC increments `call_count` by 1 on `leads`.

**Activities:** `call_logged` `{ outcome, call_count }`; `note_added` `{ call_outcome }`; if status was `new`, also `status_changed` `{ old_status: 'new', new_status: 'touched' }`.

**Status:** Auto `new` → `touched` when first call on `new` lead (in RPC). The optimistic pill update for this transition is handled entirely by `StatusActionPanel` before the modal opens — `CalledModal` has no `initialStatus` or status-callback props.

### 7g. LeadNotesInput vs LeadNotesSection

**LeadNotesInput:** Plain team note → `addLeadNote` → RPC `add_lead_plain_note`; `call_outcome` null; does not increment `call_count`. Submit button or ⌘+Enter. Header uses `var(--color-info-dark-*)` tokens.

**LeadNotesSection:** Read-only timeline from props; author `note.author.full_name`; **call outcome badge** when `note.call_outcome` set (styled via `OUTCOME_BADGE` tokens e.g. `var(--color-warning-light)`). Chronological display from server order (newest first in service).

### 7h. LeadJourneyTimeline

**Data:** `lead.created_at` for `new`; first `status_changed` activity per target status from `lead_activities`.

**Stages rendered:** `new`, `touched`, `in_discussion`, plus fourth slot = terminal status if `won`|`lost`|`junk`|`nurturing`, else placeholder `won`.

**Dwell:** Between stage timestamps; format `Xd` / `Xh` / `Xm`; active stage suffix `" here"`.

### 7i. LeadActivityLog

**Data:** `activities` prop (`LeadActivityWithActor[]`).

**Actor:** `act.actor.full_name` when present.

**Filters out:** `note_added` rows (duplicate of `call_logged`).

**Labels:** e.g. `lead_created` → "Lead ingested"; `call_logged` → "Called — {outcome}"; `status_changed` → "Status: A → B"; `agent_assigned` → "Agent assigned".

### 7j. LeadTasksAsync + LeadTasksCard + CreateLeadTaskModal

**Fetch:** `getAllLeadTasks(leadId)` in `tasks-service.ts` — `task_category = 'gia_followup'`, inner join `task_gia_meta`, sort active before terminal in JS.

**Task types (CreateLeadTaskModal / `TASK_TYPE_LABELS`):** `call` → "Call", `whatsapp_message` → "WhatsApp", `other` → "Other".

**Action:** `createLeadTaskAction` → RPC `create_lead_gia_task`; `revalidatePath(/leads/${slug ?? id})`; optional `scheduleTaskReminder`.

**Overdue due date colour:** `var(--color-danger)` when overdue; else `var(--theme-text-tertiary)`.

### 7k. DynamicFormResponses

**Source:** `leads.form_data` JSONB from props.

**Render:** Key/value pairs when `form_data` has keys; omitted from tree when empty.

---

## 8. Access Control Summary

| Operation | RLS enforces | Action-level check |
| --------- | ------------ | ------------------ |
| List leads | Agent: own; manager: domain; admin/founder: all | `getLeadsByRole` role constraints before filters |
| View dossier | Same via lead SELECT | Page redirect if no access |
| View notes/activities | EXISTS on lead access | — |
| View raw payloads | Admin/founder only | — |
| Update lead fields | `leads_update` USING | Per-action profile + assignment/domain |
| Insert lead (webhook) | Service role bypass | Bearer secret |
| Insert lead (manual) | Service role | `createManualLead` + dedup |
| Add call note | Note visible via lead | RPC after access check |
| Update status | Lead UPDATE | RPC after access check |
| Assign lead | Lead UPDATE | manager+ only |
| Scratchpad read | Column revoked; optional `get_lead_scratchpad` | Agent/admin/founder |
| Scratchpad write | Service role in action | Agent assigned / admin / founder |
| Plain note | lead_notes SELECT policy | Same as lead access |
| Gia task create | tasks + meta via service role | Lead access in action |
| SLA timers SELECT | Scoped by lead | Writes service role only |

---

## 9. Constants & Config

### `CAMPAIGN_DOMAIN_MAP` (prefix → domain string)

| Prefix | Domain |
| ------ | ------ |
| `TG_Global` | `onboarding` |
| `TG_Shop` | `shop` |
| `TG_Legacy` | `legacy` |
| `TG_House` | `house` |
| `TG_B2B` | `b2b` |

### `DEFAULT_LEAD_DOMAIN`

`'onboarding'` — used when campaign prefix unmatched or missing (`campaign-domain-map.ts`). Migrated from legacy `concierge` in domain normalisation migration.

### `GIA_DOMAINS` (`lib/constants/domains.ts`)

`onboarding`, `house`, `shop`, `legacy` — used for Zod enums and domain filter dropdown. (`b2b` is in `CAMPAIGN_DOMAIN_MAP` and `APP_DOMAINS` but not in the `GIA_DOMAINS` const array.)

### `LEAD_SOURCES` + labels

| Value | Label |
| ----- | ----- |
| `meta` | Meta |
| `google` | Google |
| `website` | Website |
| `whatsapp` | WhatsApp |
| `referral` | Referral |
| `ypo` | YPO |
| `events` | Events |

### Column preferences localStorage key

`eia:leads:columns:${userId}:v1`

---

## 10. Known Invariants (must never be violated)

1. **`LeadsTableAsync` MUST be the direct child of `<Suspense>`.** If it is a sibling of the skeleton, the boundary does nothing.

2. **`getLeadsByRole` returns `Promise<LeadsResult>` — never `Lead[]` alone.** Every call site destructures `{ leads, totalCount }`.

3. **`totalCount` comes from `{ count: 'exact', head: false }` on the same query builder** that has all role constraints, filters, and search applied. A second `SELECT COUNT(*)` is a bug.

4. **Every URL param push that changes a filter or search must delete the `page` param.** Enforced in `buildParams()` via `resetKeys: ['page']`. Never bypass with hand-built `router.push`. Exception: `clearAll()` pushes pathname with no params.

5. **Search lives in `LeadsFilters.tsx` only** — debounced 500ms, URL param `search`. **`LeadsTable.tsx` contains zero filtering, searching, or sorting logic.**

6. **`LeadsPagination` absent from DOM when `totalCount <= 30`.** `pageSize` is fixed at 30. Do not add a page size selector.

7. **Search debounce: 500ms** via `useEffect` + `setTimeout`/`clearTimeout`. Never push search on every keystroke.

8. **`showAgentFilter`:** `true` → agent dropdown rendered; `false` → **absent from DOM entirely** (not CSS-hidden). `showAgentFilter = profile.role !== 'agent'`.

9. **`date_to` end-of-day:** `filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')` in `leads-service.ts` only.

10. **`getLeadFilterOptions` called once in `leads/page.tsx`.** Never inside `LeadsTableAsync` or filter components.

11. **Agent filter security:** `getLeadsByRole` applies `assigned_to = auth.uid()` for agents **before** `LeadFilters.agent_id`. Crafted `agent_id` URL cannot leak other agents' leads.

12. **Lead slug immutable after insert.** Generated by `generate_lead_slug()` / `trg_lead_slug`. `getLeadBySlug` — exact match only, never `LIKE`. Table href: `lead.slug ?? lead.id`.

13. **Dossier lookup:** `getLeadBySlug(id)` first, then `getLeadById(id)` for UUID links.

14. **FK join disambiguators:** `lead_notes_author_id_fkey`, `lead_activities_actor_id_fkey`, `leads_assigned_to_fkey`. `getProfileNameMap` deleted — do not reintroduce.

15. **`getNextLeadTask` join direction:** root `tasks` with `!inner` on `task_gia_meta` when filtering by `lead_id`.

16. **AddLeadModal:** `listAgentsForDomain` only when selected domain ≠ `initialDomain`; `initialDomain` / `initialAgents` not in effect deps.

17. **Domain filter (list):** URL `domain`; `GIA_DOMAIN_FILTER_ITEMS`; `showDomainFilter` admin/founder only; managers locked to `profile.domain`; changing domain clears `agent_id` and `campaign`.

18. **`.range()` always applied in `getLeadsByRole`.** Unfiltered first load fetches exactly `pageSize` rows — never full table.

19. **Every modal composes `ui/modal.tsx`** — never reimplement modal chrome.

20. **`createManualLead`:** agent role → `domain = caller.domain` server-side always.

21. **Manual lead duplicate:** `{ data: { leadId, duplicate: true }, error: null }` — never silent insert.

22. **`assignLead` clears `private_scratchpad`** on reassignment.

23. **Multi-write lead actions use RPCs** (`add_lead_call_note`, `update_lead_status`, `add_lead_plain_note`, `create_lead_gia_task`) — access control stays in actions; SLA/notifications stay out of RPCs.

24. **`create_lead_gia_task` required** for dossier Gia tasks — never insert `tasks` without `task_gia_meta`.

25. **Dossier tasks:** `getAllLeadTasks` — not `getNextLeadTask` on the dossier page (`LeadDossierTasksAsync` retired).

26. **Column registry IDs** (`lead-columns.ts`) are stable localStorage keys — never rename after shipping.

27. **`useLeadColumnPreferences`:** locked columns always in `visibleColumns`; invalid stored ids dropped on load.

---

## Related: Deals (`/deals`) — Blueprint §8 / decision log

There is no `deals` table. Won leads with `deal_amount IS NOT NULL` power `/deals`. `recordDeal` writes `deal_type`, `deal_duration` (membership only), `deal_amount` then `updateLeadStatus('won')`. Aggregates via `get_deals_summary` RPC (migrations 0052–0053).
