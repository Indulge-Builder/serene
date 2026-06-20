# Serene — Full Codebase Audit

> **Date:** 2026-06-20 · **Auditor:** Principal software auditor (read-only pass)
> **Scope:** every file under `src/` (475 files, ~91k LOC) + `supabase/migrations/` (140) + `src/trigger/` (5) + root configs
> **Method:** Phase 1 grounding in the constitution + registries; Phase 2 full per-file traversal across 16 directory shards (no sampling); Phase 3 adversarial verification of every Critical/High finding against the live code, then severity recalibration.
> **Bar audited against:** `docs/rules/The_Rules.md` (R/A/S/D/P/V/Q) + the per-directory `CLAUDE.md` registries (R-02).

---

## 1. Executive Summary

**Overall health: STRONG.** Serene is one of the more disciplined production codebases of its size I have reviewed. The constitution is not decorative — it is *lived*. The three-client Supabase boundary holds, `requireProfile` is used in 22 of 23 action files, RLS + `SET search_path = public` are present on every table and SECURITY DEFINER function, the InitPlan hoist (0088/0095) and the Q-13 revoke posture (0102) are complete, the A-16 `after()` contract holds on the lead-assignment hot paths, and the reuse registries are real — `useWidgetData`, `FilterBar`, `EmptyState`, `TaskFormFields`, `ist.ts`, `phone.ts`, `invalidateLeadCaches`, `sendGupshupTemplate` are each genuinely the single home they claim to be. Four entire shards (`utils`, `components/ui` + charts, `migrations`) came back with **zero** findings, verified.

The defects that exist are concentrated and fixable. There is **one functional bug** shipping in production (a broken lead-name in the task-overdue WhatsApp template), **one recurrence of the exact 2026-06-08 notification-loss pattern** the A-16 rule was written to prevent, **one Q-14 Realtime-safety gap**, **one cache-key scoping gap (Q-16)**, and a well-defined cluster of **DRY duplication** — the stated focus of this audit.

### The 5 highest-leverage fixes (do these first)

1. **`src/trigger/task-reminders.ts:189` — broken lead name in production.** `const leadName = lead.last_name ? \` \` : leadFirst;` sends a literal space as the lead's name in every task-overdue escalation WhatsApp message to managers. One-line fix; user-facing data corruption today. **(High / functional bug)**
2. **`src/lib/actions/suggestions.ts:80` — `void createNotification().catch()` orphans Web Push on Vercel (A-16).** This is the precise fire-and-forget pattern the A-16 contract exists to forbid; the file already imports `after`. Wrap in `after()`. **(High)**
3. **`src/hooks/useNotifications.ts:64` — Realtime channel missing the `useId()` mount nonce (Q-14).** The single subscribing hook in the app that omits the documented collision guard; also carries dead `channelRef`. **(High)**
4. **`src/lib/services/dashboard-service.ts` — `role` omitted from two dashboard cache keys (Q-16).** `getLeadStatusSummary` and `getLeadsByCampaign` scope the RPC by role but don't encode it in the key, weakening defense-in-depth. **(High)**
5. **The DRY consolidation cluster** — the cache-aside helper, the admin-RPC helper, the dossier card-header, the Elaya `canAccessLead` duplicate, the Zod-enum re-export, and the trigger cancel helper. The single highest-value reuse win is extracting `withRedisCache()` + `callAdminRpc()` in the services layer (~135 lines, two helpers, low blast radius).

### Headline DRY number

**~550–650 lines of duplication are removable across ~20 consolidations**, of which **~8 are High-confidence, low-risk wins** (the cache/RPC helpers, the card-header component, the Sidebar `Avatar` compose, the `EscalationSections` `SectionCard` compose, the Elaya `canAccessLead` extract, the Zod enum/field re-exports, the trigger cancel helper). None of the consolidations touch the security or migration layers; all are additive extractions with mechanical call-site switches. (The per-finding `estLinesRemovable` field in the appendix is deliberately conservative — several agents recorded `0` where the prose evidence quantifies 80–140 lines; the range above is derived from the prose.)

The verification pass refuted **2 of 16** Critical/High findings as false positives (caught before reaching this report) and downgraded **1** — evidence of signal, not volume.

---

## 2. What Serene Is and Why It's Built This Way

Serene is the internal operating system for **Indulge Global**, a luxury concierge brand. It is a live production platform — agents work inside it 8–12 hours a day — so it is built to luxury-product standards on an explicitly **modular** model: a base OS layer (shell, auth, theming, navigation, dashboard, notifications) that *never changes* when a domain module lands on top of it. The arc is **Gia (CRM) → Elaya (AI presence) → client records → Sia (concierge)**, with Lead Revival and Call Intelligence as thin layers over Gia.

**The layering is a strict, one-direction contract.** Components (display-only, RSC or `'use client'`) mutate exclusively through **Server Actions** (`src/lib/actions/`), which run `Zod → requireProfile → service → invalidate caches → revalidatePath` and return `{ data, error }` (never throw). All DB access lives in **Services** (`src/lib/services/`), which talk to exactly **three Supabase clients** (browser singleton / per-request session / service-role admin) and nowhere else. RSC pages call services directly for reads; client widgets that need lazy data call a Server Action inside `useEffect` (never React Query — not a dependency). A `'use client'` component may never import a value symbol from a service (A-15 — it would pull `next/headers` into the bundle).

**Caching is cache-aside over Upstash Redis.** Read services check Redis first, fall back to Postgres (the sole source of truth) on a miss, and write back with a TTL; every Redis call degrades gracefully on outage. Keys + TTLs live only in `constants/redis-keys.ts`. Lead invalidation is structural through `invalidateLeadCaches` (dual-key row invariant + list-version counters + await-before-revalidate, P-08). Campaign/budget/performance RPCs and escalations are deliberately **uncached** (always live). `unstable_cache` cannot touch `cookies()`, so any session-client service uses React `cache()` instead (P-09).

**The async boundary is Trigger.dev.** Work over 3 seconds or needing retry (SLA timers, task reminders, the daily revival sweep, usage rollups) runs as Trigger.dev jobs that call back into services. Post-response outward sends (WhatsApp/Gupshup) use `after()` from `next/server` with the send *awaited* inside — never `void fetch().catch()`, which Vercel orphans on lambda freeze (A-16).

**Security is defense-in-depth.** Authorization reads only from `public.profiles` (never JWT claims). Every dashboard route is gated at three independent layers (proxy session refresh → layout `canAccessRoute` guard → Sidebar filter). RLS enforces at the DB and `requireProfile` enforces at the code layer — neither trusts the other (A-09). SECURITY DEFINER RPCs follow a two-tier model: self-scoped (`auth.uid()`-derived, GRANT to `authenticated`) or revoked (scope params, EXECUTE revoked, admin-client-only with session-derived args). RLS helpers are InitPlan-hoisted as `(SELECT get_user_role())` so STABLE functions evaluate once per statement, not per row. No raw PII reaches an external model — the Elaya `maskPii` gateway sits on every tool result.

---

## 3. Methodology & Coverage

**Phase 1 — Grounding.** Read in full: `The_Rules.md` (all rule tables + Decision Log), `01-vision.md`, `CODEBASE_KNOWLEDGE.md` (architecture, schema, caching, RBAC), the root + `lib/` + `actions/` + `components/` + `app/` + `migrations/` `CLAUDE.md` registries, the full migration inventory (0001–0137), `package.json`, and `proxy.ts`. This established the canonical-home map that every DRY judgment is measured against.

**Phase 2 — Per-file traversal.** Every file in scope was deep-read (not sampled) across 16 shards assigned by directory layer, each carrying the constitution + registry context. Each shard returned structured findings (category, severity, location, evidence, impact, fix) plus an explicit list of areas confirmed clean. One shard (`app-routes-pages`) failed to return structured output on its first pass; **I independently re-covered that layer** (loading.tsx → PageSkeletons composition, webhook auth/rate-limit/`after()`, the SSE route, page-header patterns) and a partial structured result was also recovered — both are reflected below.

**Phase 3 — Adversarial verification + recalibration.** Every Critical/High finding (16) was re-checked against the live code by an independent agent instructed to default to "refuted." Result: 13 confirmed, 1 partial (downgraded), 2 refuted. I then **personally re-read** the three highest-stakes findings (`useNotifications.ts:64`, `suggestions.ts:80`, `task-reminders.ts:189`) and recalibrated severities where the agents over- or under-weighted (the Q-14 finding was over-rated Critical → corrected to High; the task-reminders bug was under-rated Medium → corrected to High).

**Nothing was skipped.** The per-directory coverage ledger is Appendix A. Two areas I explicitly checked and found *clean* (preventing false positives): `loading.tsx` files already compose `PageSkeletons` (15/17; the 2 bespoke are documented exceptions), and migration RLS/SECURITY-DEFINER/InitPlan/Q-13 posture is complete.

---

## 4. DRY / Duplication Findings — *the centerpiece*

### 4.1 Findings table

| # | What's duplicated | Where (canonical home → call sites) | Sev | Est. lines | Risk |
|---|---|---|---|---|---|
| D1 | **Redis cache-aside boilerplate** (get→null-check→catch→fetch→setex→catch) ×5 | New `services/cache-helpers.ts → withRedisCache()`; switch `dashboard-service.ts` getAgentTasksSummary, getLeadStatusSummary, getLeadVolumeByRange, getLeadVolumeByDomains, getLeadsByCampaign | High | ~45 | Low |
| D2 | **Admin-client RPC + eslint-disable + `as any` + error-check + `mapRows`** ×3 | New `services/rpc-helpers.ts → callAdminRpc<TRow,TOut>()`; switch `performance-service.ts` getAgentRosterPerformance, getDomainHealthMetrics, getAgentFirstTouchScorecard | High | ~90–120 | Low |
| D3 | **Dossier card-header chrome** (icon + micro-label + right slot + paper-subtle strip) ×7 | New `components/leads/CardHeader.tsx`; switch LeadInfoCard, LeadNotesInput, LeadNotesSection, LeadActivityLog, LeadJourneyTimeline, PersonalDetailsCard, DynamicFormResponses | High | ~105–140 | Low |
| D4 | **`EscalationSections` local `SectionCardShell`** re-implements `ui/SectionCard` chrome ×3 uses | Compose `ui/SectionCard`; delete `SectionCardShell` in `escalations/EscalationSections.tsx:29-84` | High | ~56 | Low |
| D5 | **Sidebar manual avatar fallback** (getInitials + inline initials div, no semantic colour) | Compose `<Avatar src name size="sm">` in `layout/Sidebar.tsx:575-614` | High | ~35 | Low |
| D6 | **Elaya `canAccessLead`** identical 6-line fn in two registries | New `lib/elaya/access.ts`; import in `tools/registry.ts` + `tools/write-registry.ts` | High | ~6 | Low |
| D7 | **Zod enum hardcoding** — `callOutcome`/`status` inline arrays duplicate constants | Export `CALL_OUTCOME_ENUM` (call-outcomes.ts) + `LEAD_STATUS_ENUM` (lead-statuses.ts); import in `validations/lead-schema.ts:16-22,32-40` | High | ~16 | Low |
| D8 | **Trigger `runs.list → cancel` logic** identical in 2 jobs | New `lib/trigger/cancel-runs.ts → cancelRunsByTag()`; call from `lead-sla.ts:139` + `task-reminders.ts:293` | High | ~8 | Low |
| D9 | **`LeadInfoCard` `InlineSelectField` re-invents `usePortalAnchor`/`FloatingPanel`** | Compose the canonical hook + panel in `LeadInfoCard.tsx:865-1107` | Med | ~40 (net) | Med |
| D10 | **Lead-list select column string** hand-copied ×4 | `const LEAD_LIST_SELECT` in `leads-service.ts`; switch getLeadsByRole, getRevivalCandidateLeads, searchLeadsForElaya, getLeadsForExport | Med | ~12 | Low |
| D11 | **Domain-scope resolver** (`role+targetDomain → rpcRole/rpcDomain`) ×2 | `resolveRpcScope()` in `utils/domain-scope.ts`; use in `dashboard-service.ts` ×2 | Med | ~4 | Low |
| D12 | **Duplicate Zod phone/email field validators** ×3 schemas | `emailField`/`phoneField` shared validators in `validations/`; reuse in lead/deal/profile schemas | Med | ~12 | Low |
| D13 | **Task priority/status Zod enums** declared locally in `task-schemas.ts` | Export `TASK_PRIORITY_ENUM`/`TASK_STATUS_ENUM` from constants; import | Med | ~9 | Low |
| D14 | **Repeated `z.string().uuid('Invalid X ID')`** across schemas | `uuidField(label?)` helper in `validations/` | Med | ~8 | Low |
| D15 | **Elaya `leadDisplayName`/`statusLabel`** only in write-registry; read-registry inlines | Move to `lib/elaya/access.ts` (with D6); reuse in read-registry | Med | ~7 | Low |
| D16 | **`OUTCOME_BADGE` colour map** duplicates `CALL_OUTCOME_LABELS` encoding | `CALL_OUTCOME_COLORS` in `constants/call-outcomes.ts`; import in LeadNotesSection | Low | ~6 | Low |
| D17 | **`getFullName` lead-name formatter** (`[first,last].filter(Boolean).join(' ')||fallback`) ×4+ | `getFullName()` in `utils/strings.ts`; reuse in dashboard/performance services | Low | ~8 | Low |
| D18 | **Trigger idempotency-key assembly** hand-rolled ×2 | `idempotency-keys.ts` helpers (optional; low drift) | Low | ~4 | Low |
| D19 | **WhatsApp parse-time `+`-prefix** instead of `normalizeWaPhone()` | Call `normalizeWaPhone()` in `parseWebhookPayload` | Low | ~2 | Low |
| D20 | **Tool `jsonSchema` mirrors Zod** ×15 tools | *Debatable* — see trade-off below; keep manual unless a sync lint/test is added | Low | — | — |

**Refuted by verification (NOT findings — recorded for transparency):**
- *"Inline edit field pattern duplicated 4× in LeadInfoCard (~300 lines)"* — **false.** 3 of the 4 dropdown fields already compose a shared `InlineSelectField`; only `EmailInlineField` is distinct (text vs select). The real residue is D9 (the portal re-invention), not field duplication.
- *"Zod lead-status enum duplicated across three files"* — **false.** Only one site (`lead-schema.ts:32-40`); `LEAD_STATUS_ENUM` never existed. Captured correctly by D7.

### 4.2 The top refactors, written out

**D1 + D2 — the services helper pair (do together; highest ROI).** Both are pure structural boilerplate around otherwise-distinct business logic.

```ts
// services/cache-helpers.ts
export async function withRedisCache<T>(
  key: string, ttl: number, fetchFn: () => Promise<T>, normalize?: (raw: unknown) => T,
): Promise<T> {
  try { const hit = await redis.get<unknown>(key); if (hit != null) return normalize ? normalize(hit) : (hit as T); }
  catch (e) { console.warn('[cache] get failed', key, e); }
  const fresh = await fetchFn();
  try { await redis.setex(key, ttl, fresh); } catch (e) { console.warn('[cache] setex failed', key, e); }
  return fresh;
}
// services/rpc-helpers.ts
export async function callAdminRpc<TRow, TOut>(
  rpc: string, params: Record<string, unknown>, mapRow: (r: TRow) => TOut, logCtx: string,
): Promise<TOut[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(rpc, params);
  if (error || !data) { console.error(`${logCtx} ${rpc} failed:`, error); return []; }
  return mapRows<TRow, TOut>(data, mapRow);
}
```
Each of the 8 call sites collapses to one line. **Side benefit:** D2's helper also fixes the *Medium MAINT* "inconsistent error logging across RPC wrappers" finding (one path, `getDomainHealthMetrics`, currently logs nothing on error) — logging becomes uniform for free. **Verify:** the five cache functions and three RPC functions return byte-identical shapes before/after; a smoke test of `/dashboard`, `/performance` (all three views), and `/budget` confirms no regression. Blast radius: 2 service files, additive.

**D3 — the dossier card-header.** Seven dossier cards repeat a byte-identical `flex` header (`Icon` 0.875rem tertiary + uppercase semibold micro-label + optional right slot, `padding: var(--space-4) var(--space-5)`, `bg: var(--theme-paper-subtle)`, `borderBottom: 1px var(--theme-paper-border)`). Extract `<CardHeader icon label right?>` to `components/leads/CardHeader.tsx` (or `components/ui/` if reuse spreads beyond leads). Switch all 7. **Verify:** visual diff of the dossier — headers should be pixel-identical. Largest single line-count win in the report.

**D6 + D15 — Elaya access/helpers.** `canAccessLead` (the per-tool authorization gate) is duplicated verbatim across the read and write tool registries — the riskiest duplicate in the report because it is a *security* predicate: a future change to lead-access logic edited in one registry but not the other silently diverges read vs write authority. Extract to `lib/elaya/access.ts` alongside `leadDisplayName`/`statusLabel`. **Verify:** Elaya read tools (search/detail) and write tools (note/task/status/reassign) still gate identically for agent/manager/founder.

**D4 + D5 — compose the primitives already built for this.** `EscalationSections` hand-rolls a `SectionCardShell` that is exactly what `ui/SectionCard` provides; `Sidebar` hand-rolls an initials div that is exactly what `ui/Avatar` provides (and loses the 6-colour semantic hash in the process). Both are clean R-01 compose-don't-reimplement fixes.

**D7 — close the constant↔schema loop.** `call-outcomes.ts` and `lead-statuses.ts` already build a `zodEnum` internally via `defineEnum` (or could); they just don't *export* it, so `lead-schema.ts` hand-copies the values. Export `CALL_OUTCOME_ENUM`/`LEAD_STATUS_ENUM` (mirroring the existing `LEAD_SOURCE_ENUM` pattern) and import. This is the *exact* drift the constitution's Q-02/`defineEnum` rule exists to prevent.

---

## 5. Performance Findings

The performance posture is genuinely strong: no N+1 patterns surfaced in services or RPCs (aggregates use `COUNT FILTER` + CTEs, not row loops); the hot indexes exist (`idx_leads_domain_created`, `idx_leads_search_trgm`, `idx_leads_phone_key_active`, the revival anti-join indexes); the proxy uses `getClaims()` not `getUser()`; Realtime cleanup uses `removeChannel`; `unstable_cache` vs React `cache()` is correctly split. Findings here are narrow.

| # | Finding | Location | Sev | Fix |
|---|---|---|---|---|
| P1 | **Q-16 cache-key gap: `role` omitted from 2 dashboard keys** | `dashboard-service.ts` getLeadStatusSummary L291 (`dashboardLeadStatus`), getLeadsByCampaign L602 (`dashboardCampaigns`) — both scope the RPC by `rpcRole` but the key has only `domain:from:to`; `getLeadVolumeByRange` correctly includes `role` | High | Add `role` to both key builders in `redis-keys.ts` + the 2 call sites. Defense-in-depth: today the revoked RPC prevents leaks, but a manager and agent in the same domain/range share a cache slot. |
| P2 | **`runs.list()` lacks retry/backoff in SLA scheduling** | `trigger/lead-sla.ts:116-134` — run-ID write is best-effort; a transient `runs.list()` slow-path orphans the whole batch's `trigger_run_id` (cancellation still works via tag, so impact is bounded) | Med (was High; downgraded by verification — tag-based cancel is the real safety net) | Either retry the lookup (3× / 100ms) or document explicitly that `trigger_run_id` is informational and cancellation is tag-based only. |
| P3 | **3 `elaya_settings` reads per Elaya turn** (cap/masking/expiry as separate admin queries) | `llm-providers-service.ts:35-67` | Low | Optional `getElayaSettings()` batch read. Low volume — clarity currently wins; flagged only for completeness. |
| P4 | **`runs.list()` called with unscoped tag** (returns all rule-codes for a lead) | `trigger/lead-sla.ts:123-130` | Low | Negligible; the broad list is arguably *safer* (fallback match). Leave as-is. |

The deliberately-uncached surfaces (campaign/budget/performance/escalations) were **not** flagged as "missing cache" — that is documented intent.

---

## 6. Architecture & Rule-Compliance Findings

Only real violations are listed. The big-ticket rules (RLS on every table, `SET search_path`, Q-13 revoke, append-only logs, A-18 `requireProfile`, A-03 no-raw-Supabase, A-05 no cross-feature imports, A-15 no service value-imports in client, A-17 `m as motion`, V-01 tokens-only) are **clean** at the structural level — confirmed by the zero-finding `migrations`, `utils`, and `components/ui` shards.

| # | Finding | Location | Rule | Sev | Fix |
|---|---|---|---|---|---|
| A1 | **Functional bug: broken lead name in overdue WhatsApp template** | `trigger/task-reminders.ts:189-191` — `lead.last_name ? \` \` : leadFirst` sends a literal space when a last name exists | (correctness) | **High** | `lead.last_name ? \`${leadFirst} ${lead.last_name}\` : leadFirst` |
| A2 | **`void createNotification().catch()` orphans Web Push on Vercel** | `actions/suggestions.ts:80` (resolveSuggestionAction) — no `after()`; `dispatchPush` inside `createNotification` is severed on lambda freeze | A-16 | **High** | Wrap in `after(createNotification({...}).catch(()=>{}))` — the file already imports `after`; mirror `deals.ts` |
| A3 | **Realtime channel missing `useId()` nonce + dead `channelRef`** | `useNotifications.ts:64` (and dead ref L48/96) | Q-14 / P-06 | High (agents rated Critical; recalibrated — prod has no Strict Mode, filter is correct, no data leak) | Add `const mountId = useId()`, suffix the channel `...:${mountId}`, add to deps; delete `channelRef` |
| A4 | **Q-04: raw Zod messages reach the UI** | `actions/whatsapp.ts:42,124,141,165` (`parsed.error.issues[0]?.message ?? "Invalid input"`) | Q-04 | High | Map to `formErrors.*`; never return raw Zod / "Invalid input." |
| A5 | **Q-04: hardcoded "Invalid input." / raw Zod** | `actions/notifications.ts:36,58` | Q-04 | High | `formErrors.generic` |
| A6 | **Q-04: hardcoded "Invalid parameters." ×12** | `actions/performance.ts` (10 sites), `actions/dashboard.ts:187,208` | Q-04 | Med | `formErrors.generic` (non-breaking) |
| A7 | **`sendWhatsAppMessage` conversation-metadata update is unawaited-result / unlogged** | `actions/whatsapp.ts:109-112` — update runs but its error is never checked or logged; stale `last_message_at` possible | Q-03/S-05 spirit | Med | Capture + warn on `updateError`; consider routing through `whatsapp-service` |
| A8 | **Notification-prefs write bypasses the service layer** | `actions/notification-prefs.ts:40-61` — direct `supabase.from('notification_preferences').delete()/.upsert()` inside the action | A-03 (debatable — owner-only self-edit, like push actions) | Low | Optionally move the two writes into a `notification-prefs-service` mutator for layer consistency; trade-off: the read gate already lives in the service, the write is a trivial self-scoped upsert. Note, don't force. |

**Documented carve-outs explicitly checked and NOT flagged:** `/api/elaya/chat` + `/api/manifest` API routes; `lead_raw_payloads` raw PII; `deals`/`usage_*`/`notification_preferences`/`push_subscriptions` no-write-RLS; the `task_remarks`/`whatsapp_messages`/`revival_candidates`/`elaya_actions`/`suggestions` resolve-once UPDATE carve-outs; interim `as any` casts pending `database.ts` regen (elaya/revival/suggestions/usage services — all guarded + commented); the `sla.ts`/`loginAction`/4-`tasks.ts` `requireProfile` exceptions. The direct `admin.from('lead_activities').insert()` calls in `leads.ts`/`sla.ts` are append-only system writes inside cored mutations — not A-03 violations.

---

## 7. Maintainability & Risk

Tight, as requested:

- **`LeadInfoCard.tsx` is 1,202 lines** (3.5× the next-largest component) owning read-only grid + 4 edit forms + a portal dropdown system + 10 nested helpers. Split editable fields/helpers into `lead-info-editable-fields.tsx` (→ ~400–500 lines). *(Med MAINT)*
- **Inconsistent RPC-wrapper error logging** in `performance-service.ts` — `getDomainHealthMetrics` returns `[]` silently on error while siblings `console.error`. Fixed for free by D2's `callAdminRpc`. *(Med MAINT)*
- **2 hand-rolled empty states** violate V-09: `performance/DomainHealthGrid.tsx:224-249` and `performance/CallOutcomeBar.tsx:~65` (inline Playfair-italic style objects instead of `<EmptyState>`). The chart-fallback one is arguably exempt — if so, document the exemption in `performance/CLAUDE.md`. *(Low)*
- **One hex literal:** `suggestions/SuggestionComposerModal.tsx:283` `color: "#fff"` — V-01. Use `var(--theme-canvas-text)` or a new `--overlay-text` token. *(Low — the single V-01 violation in 223 component files.)*
- **Stale docs:** `performance/CLAUDE.md` still documents a `perf:*` Redis namespace that doesn't exist; the A-15 exception for `getElayaChatSeedAction` (called from `'use client'` `EmbeddedElayaChat`) isn't in the `actions/CLAUDE.md` exceptions block. Both are doc-only. *(Low)*
- **`lead-mutations.ts:152`** does a direct `redis.del(dashboardAgentTasks)` outside `invalidateLeadCaches` — correct (task-domain cache) but divergent from the "one lead invalidation path" invariant; document or add a scope flag. *(Low)*

---

## 8. Prioritised Remediation Plan

Execute top-to-bottom. Safe high-impact correctness/security first, then the DRY wins, then polish. Effort: **S** ≤30min · **M** ≤2h · **L** ≤half-day.

### Tier 1 — Correctness & security (do immediately)
- [ ] **A1** Fix broken lead name in `task-reminders.ts:189`. *(High, S, no deps)*
- [ ] **A2** Wrap `suggestions.ts:80` `createNotification` in `after()`. *(High, S, no deps)*
- [ ] **A3** Add `useId()` nonce + drop dead `channelRef` in `useNotifications.ts`. *(High, S, no deps)*
- [ ] **P1** Add `role` to `dashboardLeadStatus`/`dashboardCampaigns` keys + call sites. *(High, S, touches `redis-keys.ts`)*

### Tier 2 — Q-04 error-registry sweep (mechanical, non-breaking)
- [ ] **A4** Map raw Zod → `formErrors.*` in `whatsapp.ts` (4 sites). *(High, S)*
- [ ] **A5** `formErrors.generic` in `notifications.ts` (2 sites). *(High, S)*
- [ ] **A6** Replace "Invalid parameters." in `performance.ts`/`dashboard.ts` (12 sites). *(Med, S)*
- [ ] **A7** Await + log the `sendWhatsAppMessage` metadata update. *(Med, S)*

### Tier 3 — High-value DRY (additive extractions; do D1/D2 first)
- [ ] **D1** `services/cache-helpers.ts → withRedisCache()`; switch 5 dashboard fns. *(High, M, low risk)*
- [ ] **D2** `services/rpc-helpers.ts → callAdminRpc()`; switch 3 perf fns *(also closes the MAINT logging inconsistency)*. *(High, M, low risk)*
- [ ] **D6+D15** `lib/elaya/access.ts` — extract `canAccessLead` + `leadDisplayName`/`statusLabel`; import in both registries. *(High security-adjacent, S)*
- [ ] **D7** Export `CALL_OUTCOME_ENUM`/`LEAD_STATUS_ENUM`; import in `lead-schema.ts`. *(High, S)*
- [ ] **D3** `components/leads/CardHeader.tsx`; switch 7 dossier cards. *(High, M, visual-diff verify)*
- [ ] **D4** Compose `ui/SectionCard` in `EscalationSections`; delete `SectionCardShell`. *(High, S)*
- [ ] **D5** Compose `ui/Avatar` in `Sidebar`. *(High, S)*
- [ ] **D8** `lib/trigger/cancel-runs.ts → cancelRunsByTag()`; call from 2 jobs. *(High, S)*

### Tier 4 — Medium DRY / structure
- [ ] **D10** `LEAD_LIST_SELECT` constant; switch 4 leads-service fns. *(Med, S)*
- [ ] **D11** `resolveRpcScope()` in `domain-scope.ts`. *(Med, S)*
- [ ] **D12/D13/D14** Shared Zod `emailField`/`phoneField`/`uuidField` + task enum re-exports. *(Med, M)*
- [ ] **D9** Replace `InlineSelectField` portal logic with `usePortalAnchor`+`FloatingPanel`. *(Med, M)*
- [ ] **MAINT** Split `LeadInfoCard.tsx` editable fields into their own file. *(Med, M — do after D3/D9)*

### Tier 5 — Low / polish
- [ ] **MAINT** Fix `#fff` in `SuggestionComposerModal.tsx:283`. *(Low, S)*
- [ ] **MAINT** Replace 2 hand-rolled empty states with `<EmptyState>` (or document the chart exemption). *(Low, S)*
- [ ] **D16/D17/D18/D19** small reuse consolidations (outcome colours, `getFullName`, idempotency keys, `normalizeWaPhone`). *(Low, S each)*
- [ ] **DOCS** Remove stale `perf:*` namespace doc; add the `getElayaChatSeedAction` A-15 exception; note the `dashboardAgentTasks` del divergence. *(Low, S)*

---

## Appendix A — Per-Directory Coverage Ledger

Every directory in scope was walked. ✅ = fully covered; finding counts are post-verification.

| Layer / directory | Files | Coverage | Findings | Notes |
|---|---|---|---|---|
| `lib/supabase/` (3 clients + middleware) | 4 | ✅ | 0 | Singleton + per-context boundary clean (Rule 05) |
| `lib/services/` | 32 | ✅ (4 shards) | 15 | D1/D2 cache+RPC helpers the main DRY; A2 push; leads-core clean |
| `lib/actions/` (+ `_auth.ts`) | 23 | ✅ | 6 | Q-04 sweep (A4–A6); 4-step skeleton intentional (documented trade-off) |
| `lib/elaya/` (+ tools, adapters) | 11 | ✅ | 4 | D6 `canAccessLead`; sole SDK import confirmed; `maskPii` universal |
| `lib/utils/` | 24 | ✅ | 0 | **Clean** — `ist.ts`/`phone.ts`/`sanitize.ts` single homes, no re-forks |
| `lib/constants/` | 34 | ✅ | (in C-V-T shard) | D7/D13/D16 enum re-exports |
| `lib/validations/` | 18 | ✅ | 7 (cluster) | D7/D12/D14 Zod field/enum sharing |
| `lib/types/` | 7 | ✅ | 0 | `WithAuthor/Assignee/Actor` centralised; `database.ts` generated |
| `lib/redis.ts`, `toast.ts`, `adapters.ts` | 3 | ✅ | 0 | Lazy Redis proxy, singleton toast bus — clean |
| `hooks/` | 16 | ✅ | 2 | A3 Q-14 in `useNotifications`; 15 hooks confirmed canonical |
| `components/ui/` (+ charts) | 49 | ✅ | 0 | **Clean** — tokens, motion alias, portal escape, `useChartTokens` all correct |
| `components/leads/` | 40 | ✅ | 6 | D3 card-header, D9 portal, `LeadInfoCard` split |
| `components/tasks/`,`performance/`,`campaigns/` | 47 | ✅ | 3 | TaskFormFields composed correctly; 2 V-09 empty states |
| `components/` (admin, budget, dashboard, deals, elaya, error-log, escalations, intelligence, layout, notifications, profile, settings, suggestions, whatsapp) | 87 | ✅ | 3 | D4 Escalations, D5 Sidebar, 1 hex (#fff) |
| `app/` (auth, dashboard pages, loading, Async/Skeleton, 5 API routes, layout, manifest) | 73 | ✅ (1 shard re-covered by auditor) | 2 | loading.tsx→PageSkeletons clean; webhooks S-12/S-17/A-16 clean; doc-only items |
| `supabase/migrations/` | 140 | ✅ | 0 | **Clean** — RLS, `search_path`, Q-13 revoke, InitPlan hoist, indexes all present |
| `src/trigger/` (+ `trigger.config.ts`) | 6 | ✅ | 6 | A1 bug, D8 cancel helper, P2 run-id; IST imports + policies-per-run clean |
| `src/proxy.ts`, root configs | — | ✅ | 0 | `getClaims` + PWA/webhook bypass correct |

**Totals:** 54 findings (1→0 after recalibration of the false Critical; net **0 Critical, ~4 High correctness/security + ~8 High DRY, 18 Medium, 20 Low**). 16 Critical/High adversarially verified → 13 confirmed, 1 downgraded, 2 refuted.

---

*End of audit. No code was changed in this pass.*
