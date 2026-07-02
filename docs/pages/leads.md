# Leads List — Page Spec

> **Purpose:** spec for `/leads` — the Gia pipeline list: URL-driven server-side filters, Suspense streaming, column preferences, Add Lead, export.
> **Audience:** engineers. · **Source-of-truth scope:** the list route + `leads-service.ts` reads + `leads.ts` actions + the export system. The dossier is `lead-dossier.md`; ingestion is `../integrations/lead-ingestion.md`; schema narrative is `../architecture/database.md`.
> **Last verified:** 2026-07-02 (bulk-edit flow documented: `LeadsSelectionToolbar` + `BulkEditLeadsModal` + `bulkUpdateLeads`; `updateLeadCity` row; `update_lead_status` nurturing wording updated to the 0138 category collapse; slug fix 0147 cited); 2026-06-24 (manager All Leads ↔ My Leads `?view=` toggle; `getAssignableUsers({ roles })` refactor; FilterBar immediate-commit model; going-cold cutoff DRY (migration 0140); phone-dedup uniqueness (migration 0137); shared `fetchLeadsByIds` id-set reader); 2026-06-15 (Lead Revival review surface + voice dictation in dossier note inputs); 2026-06-09 full pass; 2026-06-11 restructure (perf C-1/C-2 totalCount fold + `search_text` reflected).

## 1. Purpose

Indulge's sales-pipeline list. Inbound leads arrive via webhook (Meta/Google/website) or manual
entry, are round-robin-assigned by domain, and progress through the fixed lifecycle
`new → touched → in_discussion → nurturing → won | lost | junk`. The list is display-only:
filters/search/pagination run server-side from URL params; column visibility + order persist per
user in `localStorage`.

## 2. Who sees it

Agents: own assigned leads. Managers: **their own assigned leads by default** (the "My Leads"
view — managers carry and call leads too), and the whole domain via the **All Leads / My Leads**
toggle (`?view=all`, §6f). Admin/founder: all (optional domain slice). Non-Gia domains never
reach the route (`DOMAIN_ROUTE_MAP`). Full operation×layer matrix: Deep dive §8.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `leads-service.ts` — `getLeadsByRole` (Redis 30s, version-counter invalidation), `getLeadFilterOptions` (300s), `getLeadsForExport`, `searchLeadsForTask` |
| RPCs | `get_leads_status_counts` (0080/0099 — single predicate scan; totalCount = sum of rows), `get_active_lead_by_phone` (dedup) |
| Actions | `leads.ts` — `createManualLead`, `assignLead`, `searchLeadsAction`, `exportLeadsAction`, … (full table: Deep dive §5) |
| Search | `leads.search_text` STORED column + `idx_leads_search_trgm` (0098) — all four search paths use it |
| Going-cold cutoff | `goingColdCutoff()` in `src/lib/constants/leads.ts` (`COLD_LEAD_THRESHOLD_DAYS = 5`, rolling window) — the ONE TS source (migration 0140); the count RPC receives it as `p_going_cold`; the dashboard widget reads `public.cold_lead_cutoff()` in SQL. Never re-inline `new Date(Date.now() − …)`. See §6 Going Cold + leads/CLAUDE.md |
| Phone dedup | `lead_phone_key(text)` normalisation + the `idx_leads_phone_key_active` UNIQUE backstop (migration 0137) collapse format variants (`+919876543210` / `919876543210` / `9876543210`) to one dedup key; `get_active_lead_by_phone` resolves the existing active lead. See §2c + §2d |
| Cache | `../architecture/caching.md` — `lead:list:*` namespace (one MGET: version counter + entry; cache key includes `view` so My/All never share a slot) |

## 4. Components

`page.tsx` + `LeadsTableAsync` (Suspense child) · `LeadsFilters` (composes `<FilterBar>` +
`useUrlFilters`; **immediate-commit only** — the Apply/draft model was removed 2026-06-12, never
reintroduce it) · `LeadsTable` (bespoke — never `Table<T>`; toolbar holds the manager All Leads /
My Leads `TabSelector`, Going Cold chip, sort toggle, Columns, Export; memoised `LeadRow`) ·
`LeadColumnPicker` + `useLeadColumnPreferences` (`serene:leads:columns:${userId}:v1`) ·
`LeadsPagination` (hidden ≤30 rows) · `AddLeadButton` + `AddLeadModal` (on-intent `next/dynamic`)
· `ExportButton` + `ExportModal` · `LeadsSelectionToolbar` + `BulkEditLeadsModal` (bulk-edit flow,
2026-06-24: row selection in `LeadsTable` → the selection toolbar appears above the table
(`AnimatePresence`, when any row is checked) → the modal → `bulkUpdateLeads`).

## 5. States

- **Loading:** `leads/loading.tsx` composes `PageHeaderSkeleton` + `FilterBarSkeleton` + table skeleton; ≥150 ms (V-08).
- **Empty:** `<EmptyState>` serif-italic variants — distinct copy for "no leads at all" vs "no matches for these filters".
- **Error:** service errors degrade (totalCount falls back to `offset + rows.length` with a logged warning); action errors via `{ data, error }` → toast/inline.

## 6. Invariants

Maintained in Deep dive §10 (34 items) — Suspense direct-child rule, `LeadsResult` shape,
no-second-count-scan rule, `page`-param reset, fixed pageSize 30, search ownership, dual-key
cache invalidation, slug immutability, manager My-Leads view scope, …

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

## 8a. Lead Revival review surface (`?revival=true`)

The list route doubles as the **Lead Revival review tab** — no new list component, no second
dossier. Full module contract: `../modules/revival.md`.

- **`?revival=true` URL predicate** — filters the list to leads holding an **open**
  `revival_candidates` row. `getLeadsByRole` short-circuits to the private `getRevivalCandidateLeads`
  when `filters.revival` is set: it resolves candidate `lead_id`s first (indexed `WHERE
  status='open'`, RLS-scoped on the session client), pages the id set, then delegates the row fetch
  to the shared private **`fetchLeadsByIds`** (2026-06-24, R-01 — THE id-set → list-rows reader with
  the identical column subset + assignee join + latest-note batch + role scope as the main query; the
  public `getLeadsByIds` for the performance first-touch bucket drill reuses the same function). The
  total is the resolved-set length; the `get_leads_status_counts` RPC and the Redis list cache are
  **bypassed** for this predicate (it is a cross-table subquery the RPC can't express, C-1).
  A `dismissed` candidate is never `open`, so confident-junk leads are structurally excluded from
  review. There is no toolbar chip today — the view is reached from the dossier / a saved link.
- **`RevivalReviewBanner`** renders above the reused `LeadsTable` when the predicate is active —
  it frames the surface as "leads the nightly sweep flagged for a human call" rather than the
  generic pipeline list.
- **AI-reasoning candidate surface.** Each reviewed lead carries the gate's `ai_reasoning` (the
  three-verdict note-AI gate's explanation) shown beside the candidate, so the reviewer sees *why*
  the sweep surfaced it before acting.
- **`<ReviveLeadButton>` — one component, two mounts.** It mounts in the review-context column of
  `LeadsTable` (here) **and** on the dossier; never two implementations. Clicking it calls
  `createLeadTaskCore` (the E2/E3 auto-task path) to create a **"Revived"** follow-up task and flips
  the candidate `open → actioned` — it **never mutates the lead's own `status` or columns**.

> **Distinct from the dossier `StatusActionPanel` "Revive Lead" button.** That control is a
> **lead status change** — on a `junk` (or `lost`) lead it transitions the lead back to
> `in_discussion` via `updateLeadStatus` (Deep dive §2d transition table). Lead Revival's
> `ReviveLeadButton` is a **layer** that adds a follow-up task + resolves a candidate ledger row and
> leaves the lead's status untouched. Same verb, two different mechanisms — never conflate them.

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
| `slug` | `text` | YES | UNIQUE partial index; immutable (`20260530000045_lead_slug.sql`, collision fix `00046`, uppercase-strip fix `20260625000147`; `generate_lead_slug` previously stripped uppercase letters, corrupting most slugs) |
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
| `get_active_lead_by_phone` | `p_phone text` | Returns newest active lead row (`new`/`touched`/`in_discussion`/`nurturing`, not archived) or empty set. Format variants of the same number collapse via `lead_phone_key()` normalisation (migration 0137), backed by the `idx_leads_phone_key_active` UNIQUE index on `lead_phone_key(phone)` for active leads — so `+919876543210` / `919876543210` / `9876543210` resolve to one dedup key. | `20260527000008_lead_dedup.sql`; normalisation + uniqueness backstop in `20260617000137_lead_phone_dedup_uniqueness.sql` |
| `get_next_round_robin_agent` | `p_domain text` | Atomic pick of next eligible agent (`FOR UPDATE SKIP LOCKED` on routing config); returns `uuid` or NULL. | `20260527000007_round_robin_fn.sql` |
| `add_lead_call_note` | `p_lead_id uuid`, `p_author_id uuid`, `p_content text`, `p_call_outcome text`, `p_now timestamptz` | Note + increment `call_count` + optional `new→touched` + activities; returns `jsonb`. | `20260529000030_rpc_add_lead_call_note.sql` |
| `update_lead_status` | `p_lead_id uuid`, `p_actor_id uuid`, `p_status text`, `p_reason text`, `p_now timestamptz` | Status update + activity; nurturing creates the 3-month follow-up as a `'personal'` task + `module='gia'` + `task_gia_meta` row (the `gia_followup` category was collapsed in migration 0138; that value no longer exists); returns `jsonb`. | `20260529000031_rpc_update_lead_status.sql` (+ nurturing fix `00039`; RPC recreated in `20260617000138_collapse_gia_category_module_enum.sql`) |
| `add_lead_plain_note` | `p_lead_id uuid`, `p_author_id uuid`, `p_content text`, `p_now timestamptz` | Plain note + `last_activity_at` + `note_added` activity; returns `{ note_id }`. | `20260530000040_rpc_add_lead_plain_note.sql` |
| `create_lead_gia_task` | `p_lead_id`, `p_assigned_to`, `p_created_by`, `p_task_type`, `p_title`, `p_description`, `p_priority`, `p_due_at` | Atomic `tasks` + `task_gia_meta` insert; returns `tasks` row. | `20260531000054_create_lead_gia_task.sql` |
| `get_leads_status_counts` | `p_agent_id uuid`, `p_date_from timestamptz`, `p_date_to timestamptz`, `p_campaign text`, `p_search text`, `p_source text`, `p_outcomes text[]`, `p_statuses text[]`, `p_domain app_domain`, `p_going_cold timestamptz` (all DEFAULT NULL) | Returns `TABLE(status text, cnt bigint)` for the full filtered dataset — and, summed, the list's `totalCount` (the paginated query carries no `{ count: 'exact' }` since perf C-1). Role/domain self-enforced via `get_user_role()`/`get_user_domain()`; `p_domain` is honoured only on the admin/founder branch (Gia slice). `p_agent_id` mirrors the table query's `assigned_to` constraint exactly (param-sync rule): agent → own id; **manager in "My Leads" view → own id**; otherwise the explicit `agent_id` filter (null when absent) — so the pills match the table in every view. `p_going_cold` is the rolling cold cutoff supplied by `getLeadsByRole` from `goingColdCutoff()` (`COLD_LEAD_THRESHOLD_DAYS = 5`, `src/lib/constants/leads.ts`) so the RPC and the table can never drift; search is `search_text ILIKE` (same generated column as the table query); `p_date_to` inclusive. Empty arrays treated as "no filter". (The revival `?revival=true` predicate **bypasses** this RPC entirely — it is a cross-table subquery the RPC can't express; §8a.) | `20260611000099_status_counts_total_fold.sql` (v3 — supersedes `...083`/`...080`; note: a pre-0099 version of this row documented `p_going_cold` that the DB never had — that doc/DB drift was the empty-pills bug) |
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
| `getLeadsByRole` | `role`, `userId`, `domain`, `filters?` | `Promise<LeadsResult>` | Single query: explicit column list (no `*`); role constraints (agent → own; **manager → domain, plus `assigned_to = userId` when `filters.view === 'mine'`** — the My Leads default; admin/founder → optional Gia slice) → filters → search via `search_text ILIKE` (generated column, trgm-indexed; term trimmed+lowercased) → optional `going_cold` (`last_activity_at < goingColdCutoff() AND status NOT IN (won,lost,junk)`) → `.range()`; **no count option** — `totalCount` is the sum of the `get_leads_status_counts` rows (perf C-1). Filter values hoisted once and shared verbatim by the query and the RPC. Redis cache-aside (versioned list key, scoped by `view`). Runs the RPC in `Promise.all` alongside the paginated query, then batch-fetches latest note per lead (one `.in()` query). Returns `LeadListItemWithAssignee[]`, not `LeadWithAssignee[]`. **Short-circuits to `getRevivalCandidateLeads` when `filters.revival` is set** (§8a — the only path that does not call the count RPC). | `LeadsTableAsync` |
| `getLeadsByRoleCached` | same | `Promise<LeadsResult>` | React `cache(getLeadsByRole)` | `LeadsTableAsync` (primary) |
| `getLeadFilterOptions` | `role`, `callerDomain`, `filterDomain?` | `Promise<LeadFilterOptions>` | Distinct `utm_campaign`; agents (`role = 'agent'`) from `profiles`. Signature is `(role, callerDomain, filterDomain: GiaDomain \| null = null)`. | `leads/page.tsx` once |
| `getRevivalCandidateLeads` (private) | `role`, `userId`, `domain`, `filters` | `Promise<LeadsResult>` | Revival predicate (§8a): resolve OPEN `revival_candidates` `lead_id`s (session client, RLS-scoped), page the id set, then delegate row fetch to `fetchLeadsByIds`. `totalCount` = resolved-set length; `statusCounts` = `{}`; count RPC + Redis bypassed. | `getLeadsByRole` (when `filters.revival`) |
| `fetchLeadsByIds` (private) | `role`, `userId`, `domain`, `ids`, `ascending?` | `Promise<LeadListItemWithAssignee[]>` | THE id-set → list-rows reader (2026-06-24, R-01): same column subset + assignee join + latest-note batch + role scope as `getLeadsByRole`. Both `getRevivalCandidateLeads` and the public `getLeadsByIds` reuse it — never re-inline an id-set lead fetch. | `getRevivalCandidateLeads`, `getLeadsByIds` |
| `getLeadsByIds` | `role`, `userId`, `domain`, `ids` | `Promise<LeadListItemWithAssignee[]>` | Public wrapper over `fetchLeadsByIds` for the performance First-Touch bucket drill-down (`getFirstTouchBucketLeadsAction`). | `actions/performance.ts` |
| `getLeadActivities` | `leadId` | `Promise<LeadActivity[]>` | No join | Rare |
| `getLeadNotes` | `leadId` | `Promise<LeadNote[]>` | No join | Rare |
| `getLeadNotesFull` | `leadId` | `Promise<LeadNoteWithAuthor[]>` | Join `author:profiles!lead_notes_author_id_fkey(full_name)` | Dossier (see §7a note) |
| `getLeadActivitiesFull` | `leadId` | `Promise<LeadActivityWithActor[]>` | Join `actor:profiles!lead_activities_actor_id_fkey(full_name)` | Dossier (see §7a note) |
| `getNextLeadTask` | `leadId` | `Promise<Task \| null>` | From `tasks` + inner `task_gia_meta` | Retired on dossier |
| `getErroredPayloads` | — | `Promise<LeadRawPayload[]>` | `ingestion_error IS NOT NULL` | Admin error log |
| `getAssignableUsers` (profiles-service) | `{ domain?, roles? }` | `Promise<AssignableUser[]>` | Active non-guest; `domain` scopes to one domain; `roles` restricts to a role set (lead/deal pools pass `LEAD_ASSIGNABLE_ROLES = ['agent','manager']` from `constants/roles` — managers carry leads; empty/omitted = no role filter). React `cache()`-memoised per request behind the public wrapper (primitive `domain` + sorted `rolesKey` args). The old boolean `agentsOnly` param no longer exists. | Dossier reassign, Add Lead (THE assignable-users query — dry-audit M-11) |
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
| `getAssignableUsersAction` (in `actions/profiles.ts`) | — (`domain?`) | Logged in | `getAssignableUsers(...)` — no domain → all active non-guest users; with domain → admin/founder get every active user in it, others agents only | None | `{ data: AssignableUser[], error }` |
| `createLeadTaskAction` | `CreateLeadTaskSchema` | Standard lead access | RPC `create_lead_gia_task` | `scheduleTaskReminder` if `dueAt`; `revalidatePath(/leads/${slug\|id})` | `{ data: Task, error }` |
| `searchLeadsAction` | `SearchLeadsSchema` | Profile | `searchLeadsForTask` | None | `{ data: LeadSearchResult[], error }` |
| `bulkUpdateLeads` (2026-06-24) | `BulkUpdateLeadsSchema` | Any session role; access checked **per lead**, mirroring the single-edit rules (domain/assignedTo require manager+, managers scoped to own domain; source/status follow field-edit access). Ineligible leads are skipped, never failing the batch | Each field reuses the SAME write path as its single-edit twin (R-01): assignedTo → `assignLeadCore`, status → `updateLeadStatusCore`, domain/source → admin update + activity. Order within a lead: domain → assignedTo → status → source | Same SLA/notify/activity/cache side-effects as the single edits, per lead | `{ data: { updated, skipped, failed }, error }` |
| `updateLeadCity` | `UpdateLeadCitySchema` | `assertLeadFieldEditAccess` | Admin UPDATE `city` | `revalidateLeadDossier` | `{ data: { leadId }, error }` |

**Voice dictation in the dossier note inputs.** `LeadNotesInput` (plain note → `addLeadNote`) and
`CalledModal` (call note → `addLeadCallNote`) each mount the **inline** `<DictationButton>`
(`variant="inline"`, `src/components/ui/DictationButton.tsx`) — the single mic → transcribe →
`onTranscript(text)` cluster. The transcript lands as an **editable draft** in the existing note
field; it is **never auto-sent** — the consumer's own write path (the actions above) still submits
it. Transcription runs server-side through `transcribeAudioAction` → `transcription-service.ts`
(Deepgram Nova-2, language `hi-Latn` / Hinglish); audio is transcribed in-memory and discarded,
never persisted. The button renders `null` when `MediaRecorder` is unsupported. (These are two of
the four voice surfaces; the other two are the Elaya and WhatsApp composers via `variant="composer"`.)

---

### 6. The Lead List Page (`/leads`)

#### 6a. Page Component (`page.tsx`)

**Fetches (parallel):**

- `getLeadFilterOptions(profile.role, profile.domain, filters.domain if Gia)` — once per page load.  
- `getAssignableUsers({ domain: profile.domain, roles: admin|founder ? undefined : LEAD_ASSIGNABLE_ROLES })` for the Add Lead modal — admin/founder get every active user in their domain; everyone else gets the lead-carrying roles (`['agent','manager']`).

**Manager My Leads default (resolved here):** after `parseFilters`, `page.tsx` force-sets
`filters.view = 'mine'` for a manager unless the URL carries `?view=all`. Agents are always
own-scoped; admin/founder have no toggle (their `view` is unused downstream). The manager toggle
is documented in §6f.

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
| `going_cold` | `going_cold='true'` → `true`; absent → `undefined` |
| `revival` | `revival='true'` → `true`; absent → `undefined` (the Lead Revival review predicate, §8a) |
| `view` | `view='all'` → `'all'`; `view='mine'` → `'mine'`; else `null`. Managers are force-set to `'mine'` in `page.tsx` unless `?view=all` (§6f); ignored for agent/admin/founder |
| `sort_order` | `'asc'` or `'desc'`; default `'desc'` |
| `page` | `page`, default `1` |
| `pageSize` | fixed `30` |

**Gates:** guest → `/dashboard`; `showDomainFilter = admin \| founder`.
`showAgentFilter` is role-dependent: for a **manager** it is `filters.view === 'all'` (the agent
dropdown is hidden in My Leads, where the list is already scoped to the manager — an agent pick
would be a silent no-op); for everyone else it is `role !== 'agent'` (admin/founder always; agent
never). The dropdown is absent from the DOM when false — never CSS-hidden.

**Tree:**

```text
main
  h1 + AddLeadButton
  LeadsFilters (paper strip)
  Suspense → LeadsTableAsync
```

#### 6b. LeadsFilters

`LeadsFilters` composes `<FilterBar layout="scroll">` + `useUrlFilters`. **Immediate-commit only**
— the Apply/draft model was removed 2026-06-12 (root CLAUDE.md FilterBar contract); there is no
`FilterDraft`, no `draftFromParams`, no `isDirty`, and no Apply button — never reintroduce them.
Every change pushes the URL the moment it happens, and each `push` merges into the existing params
(`buildFilterParams`) so selections compound.

| Control | URL param | Options source | Commit path |
| ------- | --------- | -------------- | ----------- |
| Search | `search` | `useUrlFilters` `searchInput`, 350ms debounce | URL on debounce |
| Status | `status` | `LEAD_STATUSES` / `LEAD_STATUS_LABELS` | Multi-select via `useMultiSelectUrlParam` — instant checkbox echo, toggle burst → one debounced (350ms) `router.push` |
| Outcome | `outcome` | `CALL_OUTCOMES` / `CALL_OUTCOME_LABELS` | Same multi-select path |
| Source | `source` | `LEAD_SOURCES` / `LEAD_SOURCE_LABELS` | Immediate `push({ source })` |
| Campaign | `campaign` | `options.campaigns` from page (rendered only if non-empty) | Immediate `push({ campaign })` |
| Agent | `agent_id` | `options.agents` — only if `showAgentFilter` && items exist | Immediate `push({ agent_id })` |
| Domain | `domain` | `GIA_DOMAIN_FILTER_ITEMS` — only if `showDomainFilter` | Immediate `push({ domain, agent_id: null, campaign: null })` |
| Date from / to | `date_from`, `date_to` | `<FilterBar>` Range/Dates panels (`DateRangeFields` / preset list) | Immediate `push` |

The **Going Cold chip**, the **sort-order toggle**, and the manager **All Leads / My Leads
`TabSelector`** are NOT in `LeadsFilters` — they live in the `LeadsTable` toolbar (§6c, §6f).

> **Health filter removed.** The `health` control and `p_health` RPC param were dropped (migration `20260608000083_status_counts_drop_health.sql`). It no longer exists in `LeadsFilters.tsx` or the `LeadFilters` type — do not reintroduce.

**`push` / `buildParams`:** every commit goes through `useUrlFilters`'s `push(updates)` →
`buildFilterParams(current, updates, { resetKeys: ['page'] })` — every filter change deletes
`page` (back to page 1). Single-select `push` and the debounced multi-select `pushDebounced` drain
the same accumulator ref, so an immediate single-select can never race a pending multi-select into
dropping a key.

**Search:** `useUrlFilters` owns `searchInput` (controlled, updates every keystroke), debounced
350ms via `useDebounce`; the push effect guards `trimmed === (params.get('search') ?? '')`.
`clearAll()` calls `setSearchInput('')` immediately (no 350ms wait).

**`activeCount`:** counts active URL params (what the table is showing) — used only to show/hide
the Clear button. `showCountBadge={false}` — there is no numeric badge in the bar.

**Single-row layout** (`layout="scroll"`, `flexWrap: nowrap`, `overflowX: auto`): SlidersHorizontal
icon → `SearchBar` (`flex 1 1 180px`, max 280px) → 1px divider → Status → Outcome → Source →
Campaign (if options exist) → Agent (if `showAgentFilter`) → Domain (if `showDomainFilter`) →
Range/Dates triggers → Clear (when `activeCount > 0`). All `FilterDropdown` chips pass `menuPortal`
so menus render `position: fixed` on `document.body` — required by the `overflowX: auto` parent.

**Domain change:** atomically sets `domain` and clears `agent_id` + `campaign` in the same `push()`
call — invariant 17. Never a separate `useEffect`.

#### 6c. LeadsTable + LeadsTableAsync + LeadsTableSkeleton

**LeadsTableAsync:** destructures `{ leads, totalCount } = getLeadsByRoleCached(role, userId, domain, filters)` (it does **not** read `statusCounts` — the summary pills toolbar was removed 2026-06-12). Passes `leads, userId, role, filters, hasActiveFilters, goingCold, enableViewToggle` to `LeadsTable`; renders `<LeadsPagination>` below when `totalCount > pageSize`; and, when `filters.revival`, builds `RevivalReviewRow[]` from `getOpenCandidatesForCaller(sessionClient)` and renders `<RevivalReviewBanner>` above the table (§8a). Direct child of `<Suspense>`. `hasActiveFilters` is true when any of status/outcome/domain/agent_id/source/campaign/date_from/date_to/search/going_cold/revival is set.

**Columns (13):** Registry `src/lib/constants/lead-columns.ts`

| ID | Label | Default visible | Locked |
| -- | ----- | --------------- | ------ |
| `status` | Status | yes | **yes** |
| `name` | Name | yes | **yes** |
| `phone` | Phone | yes | no |
| `email` | Email | no | no |
| `campaign` | Campaign | yes | no |
| `source` | Source | no | no |
| `medium` | Medium | no | no |
| `assigned_to` | Assigned To | no | no |
| `created_at` | Created | yes | no |
| `last_call_outcome` | Last Outcome | yes | no |
| `call_count` | Calls | no | no |
| `domain` | Domain | no | no |
| `latest_note` | Latest Note | no | no |

There is **no `platform` column** in the leads table — the platform value surfaces on the dossier (`LeadInfoCard` via `attribution.platform`), not as a list column. `medium` renders plain text via `getMetaMediumLabel()` from `lib/constants/lead-sources.ts` — shows `—` when null.

**Column prefs:** `useLeadColumnPreferences(userId)` — key `serene:leads:columns:${userId}:v1`. Locked columns always visible; drag reorder via `@dnd-kit/sortable` in `LeadColumnPicker`; locked columns pinned to front on reorder.

**Prefetch on hover:** Each `LeadRow` `<tr>` calls `router.prefetch('/leads/${lead.slug ?? lead.id}')` on `onMouseEnter` — same href as the `onClick` push. Uses the single `useRouter()` instance at the top of `LeadRow`. Next.js deduplicates repeated prefetch calls internally; no debounce needed.

**Empty state:**

- `hasActiveFilters === true`: heading *"Nothing matches these filters."*; sub *"Try adjusting or clearing your filters."*  
- `hasActiveFilters === false`: heading *"No leads yet."*; sub *"Leads will appear here once the webhook receives its first submission."*

Playfair italic heading (`var(--font-serif)`). Table has **zero** filter/sort/count logic.
When `goingCold` is set, the empty state uses dedicated copy ("No cold leads." / "All leads have
had recent activity.") ahead of the generic `hasActiveFilters` text.

**Status summary pills toolbar removed (2026-06-12):** `LeadsTable` no longer renders a per-status
count strip and no longer receives `statusCounts` — the `get_leads_status_counts` RPC still runs in
`getLeadsByRole`, but only to derive `totalCount` (the sum of its rows, perf C-1). **Per-row** status
pills (`.status-pill--lead-*` in `design-tokens.css`, theme-invariant) remain on each `LeadRow`.

**Toolbar (one line):** left cluster — the manager All Leads / My Leads `TabSelector` (§6f, when
shown) then the Going Cold chip; right cluster — sort-order toggle ("Newest first" / "Oldest
first"), Columns picker, Export. Below md the sort and Export labels compress to icons and the
Columns picker is hidden (the mobile card stack ignores column prefs); Going Cold keeps its label.

**Bulk edit (2026-06-24):** rows are selectable; when any row is checked, a
`LeadsSelectionToolbar` mounts above the table (inside `AnimatePresence`) with the selected ids,
a Clear action, and the entry to `BulkEditLeadsModal`. The modal commits one or more field
changes across the selection via the `bulkUpdateLeads` action (§5), which reuses the single-edit
write cores per lead and reports `{ updated, skipped, failed }`.

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

#### 6f. Manager All Leads / My Leads view toggle (`?view=`)

Managers carry and call leads too, so on `/leads` they default to **their own assigned leads** (My
Leads) — the same daily worklist an agent gets — not the whole domain. Full feature contract:
`src/app/(dashboard)/leads/CLAUDE.md` § "Manager All Leads / My Leads view toggle".

- **`view` is a `LeadFilters` flag** (`'mine' | 'all' | null`, `database.ts`), parsed in
  `parseFilters` and force-set to `'mine'` for a manager in `page.tsx` unless `?view=all`. Agents and
  admin/founder never get this default (their `view` is unused downstream).
- **Service:** `getLeadsByRole` applies `assigned_to = userId` on top of the domain constraint when
  `role === 'manager' && filters.view === 'mine'`; the count RPC's `p_agent_id` mirrors it (manager
  in My Leads passes their own id) so pills/totals match — **no migration** (the existing RPC already
  honours `p_agent_id`). `getLeadsForExport` mirrors the same scope.
- **Toggle UI:** a sliding-pill `TabSelector` (`variant="accent"`,
  `indicatorLayoutId="leads-view-switch"`) — the **first control in the `LeadsTable` toolbar's left
  cluster** (Going Cold sits to its right), gated on `enableViewToggle && role === 'manager'`
  (`LeadsTableAsync` sets `enableViewToggle`). Two segments — **"My Leads"** (`mine`, default) and
  **"Team Leads"** (`all` → `?view=all`). The active segment names the CURRENT view
  (`activeTab={viewIsAll ? 'all' : 'mine'}`). Selecting `all` writes `?view=all`; selecting `mine`
  drops the param AND `agent_id`; re-selecting the active segment is a no-op (`setView` early-returns).
- **Agent filter interaction:** `showAgentFilter` is `true` for a manager only in All Leads (§6a) —
  the agent dropdown is hidden in My Leads (it would be a no-op).
- **Cache key** includes `view` (`buildLeadListKey`) — My/All never share a Redis slot.
- **Clear** (`LeadsFilters`) pushes a bare pathname → a manager resets back to the My Leads default.
- The campaign drill-down forces `filters.view = 'all'` with the switcher off (analytics view of
  every campaign lead — a manager there must see the whole domain).

---

### 8. Access Control Summary

| Operation | RLS enforces | Action-level check |
| --------- | ------------ | ------------------ |
| List leads | Agent: own; manager: domain (RLS ceiling); admin/founder: all | `getLeadsByRole` role constraints before filters; a manager's default `view='mine'` further narrows to `assigned_to=userId` as an additive WHERE (UI default, not an RLS change — §6f) |
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

`serene:leads:columns:${userId}:v1`

---

### 10. Known Invariants (must never be violated)

1. **`LeadsTableAsync` MUST be the direct child of `<Suspense>`.** If it is a sibling of the skeleton, the boundary does nothing.

2. **`getLeadsByRole` returns `Promise<LeadsResult>` — never `Lead[]` alone.** Every call site destructures `{ leads, totalCount, statusCounts }`.

3. **`totalCount` is the sum of the `get_leads_status_counts` rows** (one predicate scan — perf C-1). The paginated query carries **no count option**; re-adding `{ count: 'exact' }` re-introduces a second full scan per load, and a separate `SELECT COUNT(*)` is a bug. On RPC error the total degrades to `offset + rows.length` with a logged warning.

4. **Every URL param push that changes a filter or search must delete the `page` param.** Enforced in `buildParams()` via `resetKeys: ['page']`. Never bypass with hand-built `router.push`. Exception: `clearAll()` pushes pathname with no params.

5. **Search lives in `LeadsFilters.tsx` only** — debounced 350ms, URL pushed on debounce. **`LeadsTable.tsx` contains zero filtering, searching, sorting, or counting logic.**

6. **`LeadsPagination` absent from DOM when `totalCount <= 30`.** `pageSize` is fixed at 30. Do not add a page size selector.

7. **Search is debounced 350ms and pushed directly to URL** (immediate-commit, like every filter — there is no Apply step). `useUrlFilters` owns `searchInput` + `useDebounce` + a push effect guarded by an equality check against the live param. `clearAll()` calls `setSearchInput('')` immediately.

8. **`showAgentFilter`:** `true` → agent dropdown rendered; `false` → **absent from DOM entirely** (not CSS-hidden). Computed in `page.tsx` as `role === 'manager' ? filters.view === 'all' : role !== 'agent'` — admin/founder always; agent never; a manager only in the All Leads view (in My Leads the list is already self-scoped, so the dropdown is hidden). Never set `true` for an agent.

9. **`date_to` end-of-day:** `filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')` in `leads-service.ts` only. **`date_from` IST midnight:** bare `YYYY-MM-DD` suffixed to `T00:00:00+05:30` in `leads-service.ts` only.

10. **`getLeadFilterOptions` called once in `leads/page.tsx`.** Never inside `LeadsTableAsync` or filter components.

11. **Agent filter security:** `getLeadsByRole` applies `assigned_to = auth.uid()` for agents **before** `LeadFilters.agent_id`. Crafted `agent_id` URL cannot leak other agents' leads.

12. **Lead slug immutable after insert.** Generated by `generate_lead_slug()` / `trg_lead_slug` (fixed in migration `20260625000147`; the original lowercase-only character class stripped uppercase letters and corrupted most slugs). `getLeadBySlug` — exact match only, never `LIKE`. Table href: `lead.slug ?? lead.id`.

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

27. **Sort order (`sort_order`):** `LeadFilters.sort_order?: 'asc' | 'desc'` (default `'desc'`). The toggle lives in the **`LeadsTable` toolbar** (right cluster, left of Columns), commits immediately to the URL via `buildFilterParams` (resets `page`) — not in `LeadsFilters`, not behind any Apply step. `sort_order=asc` is the only value written; default `desc` omits the param. `getLeadsByRole` applies `.order('created_at', { ascending: filters.sort_order === 'asc' })`.

28. **`LeadsTable.tsx` has zero sort logic.** No sort props, no column-header click handlers, no `.sort()` on the `leads` array. Sort is entirely service-layer via `sort_order` filter.

29. **`latest_note` is fetched via a single batch query — never per-row.**

30. **Latest-note batch fetch — one query, never per-row.** `getLatestNotesForLeads(leadIds, supabase)` (private, not exported) runs one `.in('lead_id', leadIds)` query ordered `created_at DESC`. The `Map<leadId, LatestNote>` is built by iterating the result once, skipping duplicate `lead_id` keys (first = latest). Empty `leadIds` returns an empty Map without querying. Any loop or per-lead call against `lead_notes` in `getLeadsByRole` is a violation of this invariant.

31. **No status-count display lives in `LeadsTable`.** The summary status-pills toolbar was removed 2026-06-12 — `LeadsTable` no longer receives `statusCounts` and `LeadsTableAsync` no longer reads it; the `useMemo` that counted from `leads[]` is deleted. The `statusCounts` map exists only inside `getLeadsByRole` to derive `totalCount` (its row-sum). Per-row status pills remain. Never reintroduce a count strip (or count logic) inside `LeadsTable`.

32. **The count RPC and the paginated query run in `Promise.all` — never sequentially.** The `get_leads_status_counts` RPC params (incl. `p_agent_id`, `p_domain`, `p_going_cold`) must mirror the filter chain in `getLeadsByRole` exactly — the hoisted filter-value block exists so both sides receive identical bounds, and `totalCount` is the sum of the RPC rows. `p_agent_id` carries the manager My-Leads scope (own id) so the total matches the table in every view. When a new filter is added to `LeadFilters`, update the paginated query, the RPC call, **and** the RPC itself (migration) simultaneously. On RPC error, `totalCount` degrades to `offset + rows.length` with a logged warning. (The `?revival=true` predicate bypasses this RPC — §8a.)

33. **`/leads` has no date soft-default.** `page.tsx` does not redirect to inject `date_from`; an absent `date_from` means an all-time list (no lower bound). "Clear" (`clearAll()`) pushes `pathname` with no params → all-time. Do not reintroduce a 30-day-redirect default without a spec change. (Superseded 2026-06-09 — the prior 30-day redirect was removed.)

34. **`getLeadsForExport` never calls `.range()`.** It mirrors `getLeadsByRole` filter and role-constraint logic exactly but with no pagination and a hard `.limit(5000)`. Never modify `getLeadsByRole` to skip `.range()` — pagination is a structural invariant of that function.

---

### Related: Deals (`/deals`) — Blueprint §8 / decision log

`public.deals` is a first-class table (migrations 0072–0074). `recordDeal` inserts a deal row (`deal_type`, `deal_duration` membership-only, `deal_amount`, `won_at`) then calls `updateLeadStatus('won')`. `/deals` reads via `getDealsByRole`; aggregates via `get_deals_summary` RPC. The dossier reads a lead's deal via `getLeadDeal(leadId)`. The old `leads.deal_*` columns were dropped in migration 0097.
