# Leads List — Page Spec

> **Purpose:** spec for `/leads` — the Gia pipeline list: URL-driven server-side filters, Suspense streaming, column preferences, Add Lead, export.
> **Audience:** engineers. · **Source-of-truth scope:** the list route + `leads-service.ts` reads + `leads.ts` actions + the export system. The dossier is `lead-dossier.md`; ingestion is `../integrations/lead-ingestion.md`; schema narrative is `../architecture/database.md`.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure (perf C-1/C-2 totalCount fold + `search_text` reflected; stale scratchpad rows corrected).

## 1. Purpose

Indulge's sales-pipeline list. Inbound leads arrive via webhook (Meta/Google/website) or manual
entry, are round-robin-assigned by domain, and progress through the fixed lifecycle
`new → touched → in_discussion → nurturing → won | lost | junk`. The list is display-only:
filters/search/pagination run server-side from URL params; column visibility + order persist per
user in `localStorage`.

## 2. Who sees it

Agents: own assigned leads. Managers: their domain. Admin/founder: all (optional domain slice).
Non-Gia domains never reach the route (`DOMAIN_ROUTE_MAP`). Full operation×layer matrix:
Deep dive §8.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `leads-service.ts` — `getLeadsByRole` (Redis 30s, version-counter invalidation), `getLeadFilterOptions` (300s), `getLeadsForExport`, `searchLeadsForTask` |
| RPCs | `get_leads_status_counts` (0080/0099 — single predicate scan; totalCount = sum of rows), `get_active_lead_by_phone` (dedup) |
| Actions | `leads.ts` — `createManualLead`, `assignLead`, `searchLeadsAction`, `exportLeadsAction`, … (full table: Deep dive §5) |
| Search | `leads.search_text` STORED column + `idx_leads_search_trgm` (0098) — all four search paths use it |
| Cache | `../architecture/caching.md` — `lead:list:*` namespace |

## 4. Components

`page.tsx` + `LeadsTableAsync` (Suspense child) · `LeadsFilters` (composes `<FilterBar>` +
`useUrlFilters`) · `LeadsTable` (bespoke — never `Table<T>`; status pills toolbar; memoised
`LeadRow`) · `LeadColumnPicker` + `useLeadColumnPreferences`
(`eia:leads:columns:${userId}:v1`) · `LeadsPagination` (hidden ≤30 rows) · `AddLeadButton` +
`AddLeadModal` (on-intent `next/dynamic`) · `ExportButton`.

## 5. States

- **Loading:** `leads/loading.tsx` composes `PageHeaderSkeleton` + `FilterBarSkeleton` + table skeleton; ≥150 ms (V-08).
- **Empty:** `<EmptyState>` serif-italic variants — distinct copy for "no leads at all" vs "no matches for these filters".
- **Error:** service errors degrade (totalCount falls back to `offset + rows.length` with a logged warning); action errors via `{ data, error }` → toast/inline.

## 6. Invariants

Maintained in Deep dive §10 (24 items) — Suspense direct-child rule, `LeadsResult` shape,
no-second-count-scan rule, `page`-param reset, fixed pageSize 30, search ownership, dual-key
cache invalidation, slug immutability, …

## 7. Open items

- **Archived leads are invisible to phone search** (from the former `decisions-to-take.md`):
  RLS SELECT policies bake in `archived_at IS NULL` for every role, so an agent searching a
  phone number cannot see that the contact was a previous won/lost/junk lead. Fix requires a
  SECURITY DEFINER RPC + service function + an `ArchivedLeadsStrip` surface on the list, and an
  invariant update here. Thought through; not yet executed (confidence/timing).
- Re-ping on duplicate resubmission is an open product question — `../integrations/whatsapp-gupshup.md` §7.

## 8. Export system (CSV / XLSX)

All export code is **client-side only** — `src/lib/utils/export.ts` (`buildCSV`,
`buildLeadsCSV`, `buildXLSXWorkbook` — async, lazy-imports SheetJS; `triggerBrowserDownload`)
+ `src/lib/constants/export-columns.ts` (`LEAD_EXPORT_HEADERS`, `ACTIVITY_EXPORT_HEADERS`,
`NOTE_EXPORT_HEADERS` — the single source of column order/labels). Never import either from a
server action or service. Export respects the user's current filter scope (export what the
table shows, fetched via `exportLeadsAction` → `getLeadsForExport`), keeping PII off any export
endpoint.

---

## 9. Deep dive

> The ingestion pipeline section that used to live here moved to
> `../integrations/lead-ingestion.md`. Section numbers below are preserved from the original
> intelligence document.

### 2. Data Model

#### 2a. Tables

##### `leads`

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
| `source` | `text` | YES | Was `utm_source`. Manual/dossier-editable channel |
| `medium` | `text` | YES | Was `utm_medium`. fb\|ig\|msg\|an for Meta |
| `utm_campaign` | `text` | YES | |
| `attribution` | `jsonb` | YES | `{ platform, campaign_id, ad_name, adset_name }` — platform-specific ad metadata (migration 0065) |
| `form_data` | `jsonb` | YES | Immutable after insert (convention) |
| `call_count` | `integer` | NOT NULL | Default `0` |
| `last_call_outcome` | `text` | YES | Call outcome enum |
| `created_at` | `timestamptz` | NOT NULL | Default `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `leads_updated_at` trigger |
| `archived_at` | `timestamptz` | YES | Soft delete |
| `previous_lead_id` | `uuid` | YES | FK → `leads(id)` ON DELETE RESTRICT (`20260527000008_lead_dedup.sql`) |
| `personal_details` | `jsonb` | YES | Agent enrichment (`20260527000009_lead_personal_details.sql`) |
| `slug` | `text` | YES | UNIQUE partial index; immutable (`20260530000045_lead_slug.sql`, collision fix `00046`) |
| `status_changed_at` | `timestamptz` | YES | SLA (`20260529000027_lead_sla_columns.sql`) |
| `last_activity_at` | `timestamptz` | YES | SLA |

> **Deal columns removed (migration 0097):** `deal_amount`, `deal_type`, `deal_duration` were dropped from `leads`. Deal data lives on `public.deals` (migrations 0072–0074); `recordDeal` writes there, never to `leads`. The dossier reads the linked deal via `getLeadDeal(leadId)` and renders `LeadDealCard` (see §7a).

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

##### `lead_activities` (append-only)

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

##### `lead_notes` (append-only)

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

##### `lead_raw_payloads` (append-only)

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

##### `task_gia_meta`

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

##### `lead_sla_timers` (mutable job state — service role writes)

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

#### 2b. Indexes (partial on `leads` unless noted)

| Index | Columns | WHERE |
| ----- | ------- | ----- |
| `idx_leads_domain_status` | `(domain, status)` | `archived_at IS NULL` |
| `idx_leads_assigned_to` | `(assigned_to)` | `archived_at IS NULL` |
| `idx_leads_created_at` | `(created_at DESC)` | `archived_at IS NULL` |
| `idx_leads_phone` | `(phone)` | (full table) |
| `idx_leads_phone_active` | `(phone)` | `archived_at IS NULL AND phone IS NOT NULL AND phone <> ''` |
| `idx_leads_previous_lead_id` | `(previous_lead_id)` | `previous_lead_id IS NOT NULL` |
| `idx_leads_assigned_to_assigned_at` | `(assigned_to, assigned_at DESC)` | `archived_at IS NULL AND assigned_to IS NOT NULL` |
| `idx_leads_source` | `(source)` | `archived_at IS NULL` |
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

#### 2c. RPCs

| Function | Parameters | One-line behaviour | Migration |
| -------- | ------------ | ------------------ | --------- |
| `get_active_lead_by_phone` | `p_phone text` | Returns newest active lead row (`new`/`touched`/`in_discussion`/`nurturing`, not archived) or empty set. | `20260527000008_lead_dedup.sql` |
| `get_next_round_robin_agent` | `p_domain text` | Atomic pick of next eligible agent (`FOR UPDATE SKIP LOCKED` on routing config); returns `uuid` or NULL. | `20260527000007_round_robin_fn.sql` |
| `add_lead_call_note` | `p_lead_id uuid`, `p_author_id uuid`, `p_content text`, `p_call_outcome text`, `p_now timestamptz` | Note + increment `call_count` + optional `new→touched` + activities; returns `jsonb`. | `20260529000030_rpc_add_lead_call_note.sql` |
| `update_lead_status` | `p_lead_id uuid`, `p_actor_id uuid`, `p_status text`, `p_reason text`, `p_now timestamptz` | Status update + activity; nurturing creates 3-month `gia_followup` task + `task_gia_meta`; returns `jsonb`. | `20260529000031_rpc_update_lead_status.sql` (+ nurturing fix `00039`) |
| `add_lead_plain_note` | `p_lead_id uuid`, `p_author_id uuid`, `p_content text`, `p_now timestamptz` | Plain note + `last_activity_at` + `note_added` activity; returns `{ note_id }`. | `20260530000040_rpc_add_lead_plain_note.sql` |
| `create_lead_gia_task` | `p_lead_id`, `p_assigned_to`, `p_created_by`, `p_task_type`, `p_title`, `p_description`, `p_priority`, `p_due_at` | Atomic `tasks` + `task_gia_meta` insert; returns `tasks` row. | `20260531000054_create_lead_gia_task.sql` |
| `get_leads_status_counts` | `p_agent_id uuid`, `p_date_from timestamptz`, `p_date_to timestamptz`, `p_campaign text`, `p_search text`, `p_source text`, `p_outcomes text[]`, `p_statuses text[]`, `p_domain app_domain`, `p_going_cold timestamptz` (all DEFAULT NULL) | Returns `TABLE(status text, cnt bigint)` for the full filtered dataset — and, summed, the list's `totalCount` (the paginated query carries no `{ count: 'exact' }` since perf C-1). Role/domain self-enforced via `get_user_role()`/`get_user_domain()`; `p_domain` is honoured only on the admin/founder branch (Gia slice); `p_going_cold` is the cold-threshold timestamp (now − `COLD_LEAD_THRESHOLD_DAYS`); search is `search_text ILIKE` (same generated column as the table query); `p_date_to` inclusive. Empty arrays treated as "no filter". | `20260611000099_status_counts_total_fold.sql` (v3 — supersedes `...083`/`...080`; note: a pre-0099 version of this row documented `p_going_cold` that the DB never had — that doc/DB drift was the empty-pills bug) |
| `get_campaign_metrics` | `p_domain app_domain`, `p_date_from`, `p_date_to` | Campaign aggregates for `/campaigns`. | `20260528000014_campaign_analytics.sql` |
| `get_campaign_detail_metrics` | `p_campaign`, `p_date_from`, `p_date_to` | Single-campaign metrics. | `20260528000015_campaign_detail_metrics.sql` |
| `get_deals_summary` | (role-scoped args) | Won-lead aggregates for `/deals`. | `20260531000052_get_deals_summary.sql` |

**Application-layer round-robin:** `leads-service.getNextRoundRobinAgent()` still implements a three-query JS fallback using `createAdminClient()`; webhook ingestion calls this, not the DB function directly in current `lead-ingestion.ts`.

---

#### 2d. Lead Status Enum

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

### 4. Services — `leads-service.ts`

| Function | Parameters | Return type | Query pattern | Called by |
| -------- | ------------ | ------------- | ------------- | --------- |
| `getLeadById` | `leadId: string` | `Promise<LeadWithAssignee \| null>` | `leads` + `assignee:profiles!leads_assigned_to_fkey(full_name)`; `archived_at IS NULL` | Dossier slug fallback |
| `getLeadBySlug` | `slug: string` | `Promise<LeadWithAssignee \| null>` | `eq('slug', slug)` exact | Dossier primary lookup |
| `getLeadsForAgent` | `agentId: string` | `Promise<Lead[]>` | `assigned_to`, not archived, `created_at DESC` | Legacy |
| `getLeadsForDomain` | `domain: string` | `Promise<Lead[]>` | `domain`, not archived | Legacy |
| `getAllLeads` | — | `Promise<Lead[]>` | All non-archived | Legacy |
| `getLeadsByRole` | `role`, `userId`, `domain`, `filters?` | `Promise<LeadsResult>` | Single query: explicit column list (no `*`); role constraints → filters → search via `search_text ILIKE` (generated column, trgm-indexed; term trimmed+lowercased) → optional `going_cold` (`last_activity_at < threshold AND status NOT IN (won,lost,junk)`) → `.range()`; **no count option** — `totalCount` is the sum of the `get_leads_status_counts` rows (perf C-1). Filter values hoisted once and shared verbatim by the query and the RPC. Redis cache-aside (versioned list key). Runs the RPC in `Promise.all` alongside the paginated query, then batch-fetches latest note per lead (one `.in()` query). Returns `LeadListItemWithAssignee[]`, not `LeadWithAssignee[]`. | `LeadsTableAsync` |
| `getLeadsByRoleCached` | same | `Promise<LeadsResult>` | React `cache(getLeadsByRole)` | `LeadsTableAsync` (primary) |
| `getLeadFilterOptions` | `role`, `callerDomain`, `filterDomain?` | `Promise<LeadFilterOptions>` | Distinct `utm_campaign`; agents from `profiles` | `leads/page.tsx` once |
| `getLeadActivities` | `leadId` | `Promise<LeadActivity[]>` | No join | Rare |
| `getLeadNotes` | `leadId` | `Promise<LeadNote[]>` | No join | Rare |
| `getLeadNotesFull` | `leadId` | `Promise<LeadNoteWithAuthor[]>` | Join `author:profiles!lead_notes_author_id_fkey(full_name)` | Dossier (see §7a note) |
| `getLeadActivitiesFull` | `leadId` | `Promise<LeadActivityWithActor[]>` | Join `actor:profiles!lead_activities_actor_id_fkey(full_name)` | Dossier (see §7a note) |
| `getNextLeadTask` | `leadId` | `Promise<Task \| null>` | From `tasks` + inner `task_gia_meta` | Retired on dossier |
| `getErroredPayloads` | — | `Promise<LeadRawPayload[]>` | `ingestion_error IS NOT NULL` | Admin error log |
| `getAssignableUsers` (profiles-service) | `{ domain?, agentsOnly? }` | `Promise<AssignableUser[]>` | Active non-guest; `agentsOnly` → `role=agent` | Dossier reassign, Add Lead (THE assignable-users query — dry-audit M-11) |
| `getCampaignMetrics` | `role`, `callerDomain`, `filters` | `Promise<CampaignMetrics[]>` | RPC `get_campaign_metrics` | Campaigns list |
| `getCampaignDetailMetrics` | `campaignName`, `filters` | `Promise<CampaignDetailMetrics \| null>` | RPC | Campaign detail |
| `getCampaignAgentDistribution` | `campaignName`, `filters` | `Promise<AgentDistributionRow[]>` | RPC | Campaign detail |
| `getNextRoundRobinAgent` | `domain` | `Promise<string \| null>` | Admin client: agents + routing + last assignment sort | `lead-ingestion.ts` |
| `searchLeadsForTask` | `query`, `role`, `domain`, `userId` | `Promise<LeadSearchResult[]>` | `search_text ILIKE` (name/phone/email/city), limit 8, role-scoped | `searchLeadsAction` |

**Types exported from service:**

```typescript
export type LeadNoteWithAuthor = LeadNote & { author: { full_name: string } };
export type LeadActivityWithActor = LeadActivity & { actor: { full_name: string } | null };
export type LeadWithAssignee = Lead & { assignee: { full_name: string } | null };

// Local type (not exported) — shape of the batch-fetched latest note per lead.
type LatestNote = { content: string; created_at: string; author_name: string | null };

// List path only — explicit column subset; form_data, personal_details, attribution, deal/SLA columns excluded.
export type LeadListItem = Pick<Lead,
  'id' | 'slug' | 'first_name' | 'last_name' | 'phone' | 'email' |
  'domain' | 'assigned_to' | 'status' | 'lead_intent' |
  'source' | 'medium' | 'utm_campaign' | 'call_count' |
  'last_call_outcome' | 'created_at'
> & { latest_note: LatestNote | null };
export type LeadListItemWithAssignee = LeadListItem & { assignee: { full_name: string } | null };
export type LeadsResult = {
  leads:        LeadListItemWithAssignee[];
  totalCount:   number;
  statusCounts: Partial<Record<LeadStatus, number>>;  // from get_leads_status_counts RPC; {} on error
};
```

**`date_from` IST midnight transform:** A bare `YYYY-MM-DD` `date_from` is suffixed to `YYYY-MM-DDT00:00:00+05:30` before the `.gte()` query. Strings already containing `T` are passed through unchanged. Without this, PostgREST treats the bare date as UTC midnight — 5.5 hours into the IST calendar day, silently excluding early-morning leads. Same fix applied in `getLeadsForExport`.

---

### 5. Server Actions — `leads.ts`

| Action | Zod schema | Auth | DB / RPC | Side effects | Return |
| ------ | ---------- | ---- | -------- | ------------ | ------ |
| `addLeadCallNote` | `AddCallNoteSchema` | Agent own / manager domain / admin / founder | RPC `add_lead_call_note` | SLA: auto-advance → `scheduleSlaTimersForLead`; else `refreshActivitySlaTimers` | `{ data: { noteId }, error }` |
| `updateLeadStatus` | `UpdateLeadStatusSchema` | Same | RPC `update_lead_status` | Won → `lead_won` notifications; SLA cancel or reschedule | `{ data: { leadId }, error }` |
| `assignLead` | `AssignLeadSchema` | manager / admin / founder; manager must own the lead's domain and the target agent must be an active member of it (security F-3, 2026-06-11) | Admin UPDATE lead; INSERT activity | `lead_assigned` in-app notification (`.catch()` fire-and-forget); WhatsApp assignment + founder via `after(notifyLeadAssigned(...))`; SLA schedule (`.catch()`) | `{ data: { leadId }, error }` |
| `updatePersonalDetails` | `UpdatePersonalDetailsSchema` | Agent own / manager domain / admin / founder | Admin UPDATE `personal_details` JSONB merge | None | `{ data: null, error }` |
| `createManualLead` | `CreateManualLeadSchema` | Logged in; agent domain locked | Dedup RPC; INSERT lead + activities | `lead_assigned` in-app notification when `assignedTo !== caller.id`; WhatsApp via `after(notifyLeadAssigned(...))`; SLA schedule if assigned | `{ data: { leadId, duplicate? }, error }` |
| `updateLeadEmail` | `UpdateLeadEmailSchema` | `assertLeadFieldEditAccess` | UPDATE email; activity `note_added` `{type:'lead_email_updated'}` | `revalidatePath` dossier | `{ data: { leadId }, error }` |
| `updateLeadDomain` | `UpdateLeadDomainSchema` | Same; **blocks agent** | UPDATE domain; activity | `revalidatePath` | `{ data: { leadId }, error }` |
| `updateLeadSource` | `UpdateLeadSourceSchema` | Field edit access | UPDATE `source`; activity `lead_source_updated` | `revalidatePath` dossier | `{ data: { leadId }, error }` |
| `updateLeadInterests` | `UpdateLeadInterestsSchema` | Field edit access (`assertLeadFieldEditAccess` — same gate, no widening/narrowing) | Drops unknowns vs lead domain via `extractServiceInterests`; UPDATE `service_interests`; activity `lead_interests_updated` `{old, new}` (no-op edits skip write + activity) | `revalidateLeadDossier` (dual-key row del via `invalidateLeadCaches`) → `ServiceInterestCard` re-matches | `{ data: { leadId, interests }, error }` |
| `addLeadNote` | `AddLeadNoteSchema` | Standard lead access | RPC `add_lead_plain_note` | `last_activity_at` only (in RPC) | `{ data: { noteId }, error }` |
| `recordDeal` | `RecordDealSchema` | Standard lead access | Thin re-export → `recordDeal` in `actions/deals.ts`: **INSERT into `public.deals`** (`deal_type`, `deal_amount`, `deal_duration` membership-only, `won_at`) via `adminClient`; then `updateLeadStatus({ status: 'won' })`. Never writes `leads.deal_*` (dropped, migration 0097). | Won notifications + SLA via nested `updateLeadStatus` | `{ data: { leadId }, error }` |
| `getAssignableUsersAction` (in `actions/profiles.ts`) | — (`domain?`) | Logged in | `getAssignableUsers({ domain, agentsOnly })` — admin/founder get all active users, others agents only | None | `{ data: AssignableUser[], error }` |
| `createLeadTaskAction` | `CreateLeadTaskSchema` | Standard lead access | RPC `create_lead_gia_task` | `scheduleTaskReminder` if `dueAt`; `revalidatePath(/leads/${slug\|id})` | `{ data: Task, error }` |
| `searchLeadsAction` | `SearchLeadsSchema` | Profile | `searchLeadsForTask` | None | `{ data: LeadSearchResult[], error }` |

---

### 6. The Lead List Page (`/leads`)

#### 6a. Page Component (`page.tsx`)

**Fetches (parallel):**

- `getLeadFilterOptions(profile.role, profile.domain, filters.domain if Gia)` — once per page load.  
- `getAssignableUsers({ domain: profile.domain, agentsOnly: !admin/founder })` for Add Lead modal.

**No date-range soft default (2026-06-09 verified):** `page.tsx` does **not** redirect to inject a `date_from`. `parseFilters` reads `date_from` straight from the URL (`getString('date_from')`); when absent, `filters.date_from` is `null` and the query has **no lower bound** — the list shows all-time by default. A previous "30-day soft default" redirect has been removed. `date_from`/`date_to` are applied only when the user picks a range in the portaled Range panel.

**`date_from` IST midnight fix (service layer):** `getLeadsByRole` (and `getLeadsForExport`) transform a bare `YYYY-MM-DD` `date_from` to `YYYY-MM-DDT00:00:00+05:30` before `.gte()`. Without this, PostgREST treats the bare date as UTC midnight — 5.5 h into the IST calendar day, silently excluding leads created before 05:30 IST. The transform guards against strings that already contain `T`.

**`parseFilters(searchParams)` → `LeadFilters`:**

| Field | URL / default |
| ----- | ------------- |
| `status` | `status` comma-separated |
| `last_call_outcome` | `outcome` comma-separated |
| `domain` | `domain` via `parseGiaDomainParam` |
| `agent_id` | `agent_id` |
| `source` | `source` |
| `campaign` | `campaign` |
| `date_from` | `date_from`; absent = no lower bound (all-time); YYYY-MM-DD |
| `date_to` | `date_to`; absent = no upper bound |
| `search` | `search` |
| `going_cold` | `'true'` → `true`; absent → `undefined` |
| `sort_order` | `'asc'` or `'desc'`; default `'desc'` |
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

#### 6b. LeadsFilters

| Control | URL param | Options source | Commit path |
| ------- | --------- | -------------- | ----------- |
| Search | `search` | Draft state, 350ms debounce | URL on debounce |
| Status | `status` | `LEAD_STATUSES` / `LEAD_STATUS_LABELS` | Draft → Apply |
| Outcome | `outcome` | `CALL_OUTCOMES` | Draft → Apply |
| Source | `source` | `LEAD_SOURCES` | Draft → Apply |
| Campaign | `campaign` | `options.campaigns` from page | Draft → Apply |
| Agent | `agent_id` | `options.agents` — only if `showAgentFilter` | Draft → Apply |
| Domain | `domain` | `GIA_DOMAIN_FILTER_ITEMS` — only if `showDomainFilter` | Draft → Apply |
| Going Cold | `going_cold` | — | Immediate commit (bypasses draft/Apply) |
| Date from / to | `date_from`, `date_to` | `DatePicker` in portaled Range panel | Draft → Apply |
| Sort order | `sort_order` | Toggle in filter bar | Draft → Apply |

> **Health filter removed.** The `health` control and `p_health` RPC param were dropped (migration `20260608000083_status_counts_drop_health.sql`). It no longer exists in `LeadsFilters.tsx` or the `LeadFilters` type — do not reintroduce.

**`buildParams`:** delegates to `buildFilterParams(current, updates, { resetKeys: ['page'] })` — every filter change deletes `page`.

**FilterDraft:** All filter controls (except search and Going Cold) write into a local `FilterDraft` state. URL updated only on Apply. `isDirty` is a computed boolean comparing `draft` against live `params` — never a `useState`. `committedCount` (badge) counts active URL params, not draft values. With no date soft-default, `committedCount` can legitimately be `0` (no filters applied → all-time view).

**Search:** `searchInput` state debounced 350ms via `useDebounce`. URL pushed on debounce (not on Apply). `clearAll()` calls `setSearchInput('')` immediately without waiting for debounce.

**Going Cold chip:** immediate-commit — `router.push` fires directly; clears `status` and `outcome` from URL when activating. Bypasses `FilterDraft` entirely. Active when `params.get('going_cold') === 'true'`.

**Single-row layout:** `flexWrap: nowrap`, `overflowX: auto`. Left to right: SlidersHorizontal icon + `committedCount` badge → `SearchBar` (flex 1, max 280px) → 1px divider → Status → Outcome → Source → Campaign (if options exist) → Agent (if `showAgentFilter`) → Domain (if `showDomainFilter`) → Going Cold → Range trigger → Sort order toggle → Apply (animated, `isDirty` only) → Clear. All `FilterDropdown` chips use `menuPortal` so menus render `position: fixed` on `document.body` — required by `overflowX: auto` parent.

**Apply button:** `Button variant="primary" size="sm"` (not `MotionButton`) wrapped in `AnimatePresence motion.div` (`scale 0.95→1`, 150ms). Rendered only when `isDirty`.

**Active count (badge) vs committed count:** badge shows `committedCount` (URL state). `isDirty` compares draft against URL. Never swap these.

**Domain change:** atomically sets `domain`, clears `agent_id` and `campaign` in the same `setDraft` call — invariant 17.

#### 6c. LeadsTable + LeadsTableAsync + LeadsTableSkeleton

**LeadsTableAsync:** `getLeadsByRoleCached(role, userId, domain, filters)` → `{ leads, totalCount, statusCounts }`; passes all three to `LeadsTable` alongside `hasActiveFilters`. Direct child of `<Suspense>`.

**Columns (14):** Registry `src/lib/constants/lead-columns.ts`

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
| `latest_note` | Latest Note | no | no |

`platform` renders as a pill (`var(--theme-accent-subtle)` bg, `var(--theme-text-secondary)` text). `medium` renders plain text via `getMetaMediumLabel()` from `lib/constants/lead-sources.ts` — shows `—` when null.

**Column prefs:** `useLeadColumnPreferences(userId)` — key `eia:leads:columns:${userId}:v1`. Locked columns always visible; drag reorder via `@dnd-kit/sortable` in `LeadColumnPicker`; locked columns pinned to front on reorder.

**Prefetch on hover:** Each `LeadRow` `<tr>` calls `router.prefetch('/leads/${lead.slug ?? lead.id}')` on `onMouseEnter` — same href as the `onClick` push. Uses the single `useRouter()` instance at the top of `LeadRow`. Next.js deduplicates repeated prefetch calls internally; no debounce needed.

**Empty state:**

- `hasActiveFilters === true`: heading *"Nothing matches these filters."*; sub *"Try adjusting or clearing your filters."*  
- `hasActiveFilters === false`: heading *"No leads yet."*; sub *"Leads will appear here once the webhook receives its first submission."*

Playfair italic heading (`var(--font-serif)`). Table has **zero** filter/sort/count logic.

**Status pills (toolbar):** Derived exclusively from the `statusCounts` prop (`Partial<Record<LeadStatus, number>>`), which comes from the `get_leads_status_counts` RPC via `LeadsTableAsync`. Counts reflect the full filtered dataset, not just the current page slice. Pills are hidden when count is 0. `LeadsTable` never reads `leads[]` for count display.

#### 6d. LeadsPagination

- **`pageSize`:** `30` (fixed in `parseFilters`, not user-configurable).  
- **Absent when:** `totalCount <= pageSize` (not in DOM).  
- **Showing text:** `from = (page-1)*pageSize+1`, `to = min(page*pageSize, totalCount)`.  
- **`useTransition`** on Prev/Next `router.push`; disabled buttons `pointer-events: none`, `opacity: 0.4`.

#### 6e. AddLeadModal

**Schema:** `CreateManualLeadSchema` — `first_name`, `last_name?`, `phone` (E.164), `email?`, `domain` (`GIA_DOMAIN_ENUM`), `assigned_to?`, `source?` (`LEAD_SOURCE_ENUM`), `service_interests?` (string[], default `[]`).

**Duplicate:** `createManualLead` → `get_active_lead_by_phone`; returns `{ leadId, duplicate: true }`; banner with link `/leads/${duplicateLeadId}`; modal stays open.

**Submit action:** `createManualLead`.

**Agent fetch guard:** `getAssignableUsersAction(domain)` only when `watchedDomain !== initialDomain`; restoring initial domain resets `initialAgents` without network.

**Service interests (call-intelligence Phase 1.1):** optional `FormChip` multi-select row below the Source/Domain/Assign grid — options from `getDomainInterests(watchedDomain)`, labels via `getServiceCategoryLabel()` (never a re-typed list). The domain-change effect filters the current selection to the new domain's vocabulary on every switch (out-of-vocabulary picks never silently submit). Server side, `createManualLead` drops unknown values against the *resolved* domain via `extractServiceInterests` — the same dropper as webhook/WhatsApp ingestion — and writes `text[]` on the same INSERT (no path fork; assignment/SLA/notifications untouched). Empty selection = `'{}'`, byte-identical to pre-1.1 behaviour.

---

### 8. Access Control Summary

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
| Plain note | lead_notes SELECT policy | Same as lead access |
| Gia task create | tasks + meta via service role | Lead access in action |
| SLA timers SELECT | Scoped by lead | Writes service role only |

---

### 9. Constants & Config

#### `CAMPAIGN_DOMAIN_MAP` (prefix → domain string)

| Prefix | Domain |
| ------ | ------ |
| `TG_Global` | `onboarding` |
| `TG_Shop` | `shop` |
| `TG_Legacy` | `legacy` |
| `TG_House` | `house` |
| `TG_B2B` | `b2b` |

#### `DEFAULT_LEAD_DOMAIN`

`'onboarding'` — used when campaign prefix unmatched or missing (`campaign-domain-map.ts`). Migrated from legacy `concierge` in domain normalisation migration.

#### `GIA_DOMAINS` (`lib/constants/domains.ts`)

`onboarding`, `house`, `shop`, `legacy` — used for Zod enums and domain filter dropdown. (`b2b` is in `CAMPAIGN_DOMAIN_MAP` and `APP_DOMAINS` but not in the `GIA_DOMAINS` const array.)

#### `LEAD_SOURCES` + labels

| Value | Label |
| ----- | ----- |
| `meta` | Meta |
| `google` | Google |
| `website` | Website |
| `whatsapp` | WhatsApp |
| `referral` | Referral |
| `ypo` | YPO |
| `events` | Events |

#### Column preferences localStorage key

`eia:leads:columns:${userId}:v1`

---

### 10. Known Invariants (must never be violated)

1. **`LeadsTableAsync` MUST be the direct child of `<Suspense>`.** If it is a sibling of the skeleton, the boundary does nothing.

2. **`getLeadsByRole` returns `Promise<LeadsResult>` — never `Lead[]` alone.** Every call site destructures `{ leads, totalCount, statusCounts }`.

3. **`totalCount` is the sum of the `get_leads_status_counts` rows** (one predicate scan — perf C-1). The paginated query carries **no count option**; re-adding `{ count: 'exact' }` re-introduces a second full scan per load, and a separate `SELECT COUNT(*)` is a bug. On RPC error the total degrades to `offset + rows.length` with a logged warning.

4. **Every URL param push that changes a filter or search must delete the `page` param.** Enforced in `buildParams()` via `resetKeys: ['page']`. Never bypass with hand-built `router.push`. Exception: `clearAll()` pushes pathname with no params.

5. **Search lives in `LeadsFilters.tsx` only** — debounced 350ms, URL pushed on debounce. **`LeadsTable.tsx` contains zero filtering, searching, sorting, or counting logic.**

6. **`LeadsPagination` absent from DOM when `totalCount <= 30`.** `pageSize` is fixed at 30. Do not add a page size selector.

7. **Search is debounced 350ms and pushed directly to URL** (not gated behind Apply). `searchInput` state + `useDebounce` + `useEffect` guarded by equality check. `clearAll()` calls `setSearchInput('')` immediately.

8. **`showAgentFilter`:** `true` → agent dropdown rendered; `false` → **absent from DOM entirely** (not CSS-hidden). `showAgentFilter = profile.role !== 'agent'`.

9. **`date_to` end-of-day:** `filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')` in `leads-service.ts` only. **`date_from` IST midnight:** bare `YYYY-MM-DD` suffixed to `T00:00:00+05:30` in `leads-service.ts` only.

10. **`getLeadFilterOptions` called once in `leads/page.tsx`.** Never inside `LeadsTableAsync` or filter components.

11. **Agent filter security:** `getLeadsByRole` applies `assigned_to = auth.uid()` for agents **before** `LeadFilters.agent_id`. Crafted `agent_id` URL cannot leak other agents' leads.

12. **Lead slug immutable after insert.** Generated by `generate_lead_slug()` / `trg_lead_slug`. `getLeadBySlug` — exact match only, never `LIKE`. Table href: `lead.slug ?? lead.id`.

13. **Dossier lookup:** `getLeadBySlug(id)` first, then `getLeadById(id)` for UUID links.

14. **FK join disambiguators:** `lead_notes_author_id_fkey`, `lead_activities_actor_id_fkey`, `leads_assigned_to_fkey`. `getProfileNameMap` deleted — do not reintroduce.

15. **`getNextLeadTask` join direction:** root `tasks` with `!inner` on `task_gia_meta` when filtering by `lead_id`.

16. **AddLeadModal:** `getAssignableUsersAction(domain)` only when selected domain ≠ `initialDomain`; `initialDomain` / `initialAgents` not in effect deps.

17. **Domain filter (list):** URL `domain`; `GIA_DOMAIN_FILTER_ITEMS`; `showDomainFilter` admin/founder only; managers locked to `profile.domain`; changing domain clears `agent_id` and `campaign`.

18. **`.range()` always applied in `getLeadsByRole`.** Unfiltered first load fetches exactly `pageSize` rows — never full table.

19. **Every modal composes `ui/modal.tsx`** — never reimplement modal chrome.

20. **`createManualLead`:** agent role → `domain = caller.domain` server-side always.

21. **Manual lead duplicate:** `{ data: { leadId, duplicate: true }, error: null }` — never silent insert.

22. **Multi-write lead actions use RPCs** (`add_lead_call_note`, `update_lead_status`, `add_lead_plain_note`, `create_lead_gia_task`) — access control stays in actions; SLA/notifications stay out of RPCs.

23. **`create_lead_gia_task` required** for dossier Gia tasks — never insert `tasks` without `task_gia_meta`.

24. **Dossier tasks:** `getAllLeadTasks` — not `getNextLeadTask` on the dossier page (`LeadDossierTasksAsync` retired).

25. **Column registry IDs** (`lead-columns.ts`) are stable localStorage keys — never rename after shipping.

26. **`useLeadColumnPreferences`:** locked columns always in `visibleColumns`; invalid stored ids dropped on load.

27. **Sort order (`sort_order`):** `LeadFilters.sort_order?: 'asc' | 'desc'` (default `'desc'`). Authored in `LeadsFilters.tsx` draft. URL param `sort_order=asc` written by Apply; omitted when default. `getLeadsByRole` applies `.order('created_at', { ascending: filters.sort_order === 'asc' })`. `LeadsTable.tsx` owns zero sort logic.

28. **`LeadsTable.tsx` has zero sort logic.** No sort props, no column-header click handlers, no `.sort()` on the `leads` array. Sort is entirely service-layer via `sort_order` filter.

29. **`latest_note` is fetched via a single batch query — never per-row.**

30. **Latest-note batch fetch — one query, never per-row.** `getLatestNotesForLeads(leadIds, supabase)` (private, not exported) runs one `.in('lead_id', leadIds)` query ordered `created_at DESC`. The `Map<leadId, LatestNote>` is built by iterating the result once, skipping duplicate `lead_id` keys (first = latest). Empty `leadIds` returns an empty Map without querying. Any loop or per-lead call against `lead_notes` in `getLeadsByRole` is a violation of this invariant.

31. **Status pill counts come only from `statusCounts` prop — never from `leads[]`.** `LeadsTable` receives `statusCounts: Partial<Record<LeadStatus, number>>` from `LeadsTableAsync`. The `useMemo` that counted from `leads[]` is deleted. Any reintroduction of counting logic inside `LeadsTable` is a violation.

32. **`statusCounts` and the paginated query run in `Promise.all` — never sequentially.** The `get_leads_status_counts` RPC params (incl. `p_domain`, `p_going_cold`) must mirror the filter chain in `getLeadsByRole` exactly — the hoisted filter-value block exists so both sides receive identical bounds, and `totalCount` is the sum of the RPC rows. When a new filter is added to `LeadFilters`, update the paginated query, the RPC call, **and** the RPC itself (migration) simultaneously. On RPC error, `statusCounts` is `{}` (pills show no counts) and `totalCount` degrades to `offset + rows.length`.

33. **`/leads` has no date soft-default.** `page.tsx` does not redirect to inject `date_from`; an absent `date_from` means an all-time list (no lower bound). "Clear" (`clearAll()`) pushes `pathname` with no params → all-time. Do not reintroduce a 30-day-redirect default without a spec change. (Superseded 2026-06-09 — the prior 30-day redirect was removed.)

34. **`getLeadsForExport` never calls `.range()`.** It mirrors `getLeadsByRole` filter and role-constraint logic exactly but with no pagination and a hard `.limit(5000)`. Never modify `getLeadsByRole` to skip `.range()` — pagination is a structural invariant of that function.

---

### Related: Deals (`/deals`) — Blueprint §8 / decision log

`public.deals` is a first-class table (migrations 0072–0074). `recordDeal` inserts a deal row (`deal_type`, `deal_duration` membership-only, `deal_amount`, `won_at`) then calls `updateLeadStatus('won')`. `/deals` reads via `getDealsByRole`; aggregates via `get_deals_summary` RPC. The dossier reads a lead's deal via `getLeadDeal(leadId)`. The old `leads.deal_*` columns were dropped in migration 0097.
