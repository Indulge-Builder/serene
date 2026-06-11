# Docs Restructure — Stage 1 Inventory & Proposal

> **Purpose:** one-pass restructure of `docs/` so every page, service, integration, design
> decision, rule, and invariant has exactly one documented home. Code is the source of truth.
> **Date:** 2026-06-11 · **Author:** docs-restructure pass (Claude)
> **Status:** Stage 1 deliverable. Stage 2 executes this file top to bottom.

---

## 1. Inventory Table

Every file currently in `docs/` (25 files + `.DS_Store`). "Updated" = last meaningful update
signal (file mtime + changelog sync entries).

| File | What it actually contains | Updated | Verdict |
| ---- | ------------------------- | ------- | ------- |
| `DESIGN-DNA.md` (7,049 ln) | The design constitution: 5 theme token maps + CSS, global tokens, layout, typography, components spec, micro-details (§5.99), motion/icons/texture (§6), responsiveness (§9), permanent decisions (§10), skeletons (§11), mobile (§12), toast (§13), forms (§7), data display (§8), page transitions (§14), Lia design language (§15), data-viz colour (§16), addenda A.1–A.4 | 2026-06-10 | **MOVE** → `design/DESIGN-DNA.md`; fix DOC-05 (noise 0.9 vs 0.68 self-contradiction) + DOC-06 (500 ms ceiling vs §14.3/§16.7) with "corrected" footnotes; fix stale tail-note citing deleted `docs/context.md` + non-existent `docs/design-tokens.css` mirror |
| `design-system.md` (1,006 ln) | Component implementation reference: shell, themes, surface contract, tokens, motion, component library, layout patterns, forms, empty states, data-viz, responsive, transitions, never-do, invariants | 2026-06-10 | **MOVE** → `design/design-system.md`; fix DOC-04 (claims `.type-card-title`/`.type-body`/`.type-label`/`.type-caption`/`.type-mono` exist — only `.type-eyebrow` + `.type-page-title` are in `design-tokens.css`) + DOC-01 (`.layout-canvas` described as the dashboard shell; dashboard actually mounts `.layout-shell`, `.layout-canvas` is mounted nowhere) |
| `The_Rules.md` (253 ln) | The engineering constitution: A/S/D/P/V/Q rule tables, sanctioned colour exceptions, naming conventions, Never-Do list, rule-change Decision Log | 2026-06-11 | **MOVE** → `rules/The_Rules.md`; its Decision Log stays (historical record of rule changes); design rules get a one-line pointer to DESIGN-DNA where duplicated |
| `The_Gia.md` (1,201 ln) | Gia module spec: leads schema, ingestion, domain resolution, round-robin, lifecycle, dossier, call logging, notes, lead tasks, list/access, deals, end-to-end flow, WhatsApp (§14), SLA (§15), file map, decision log | 2026-06-11 (but content drifted) | **REWRITE/SPLIT** → module narrative + lifecycle + SLA → `modules/gia.md`; §3–5 ingestion → `integrations/lead-ingestion.md`; §14 → `integrations/whatsapp-gupshup.md` + `pages/whatsapp.md`. Stale: cites `private_scratchpad` (dropped 0061), deal columns on `leads` (dropped 0097), Meta `X-Hub-Signature-256` webhook auth (actual: Gupshup `x-gupshup-secret`), `platform: 'whatsapp'` (now `source`, 0065), `docs/The_Blueprint.md` (deleted) |
| `master.md` (1,250 ln) | The whole-system reference: what Eia is, stack, naming, authorization model, roles/domains, profiles foundation, phase history, route map, 98-migration index, file map, services/actions/constants/utils/hooks registries, task system, WhatsApp system, SLA engine, rules copy, never-do copy, decision log, design quick-ref, Redis layer (§22), export system (§23) | 2026-06-09 | **SPLIT** → §1–2 → `architecture/overview.md`; §4–6 → `architecture/auth-and-rbac.md` + `architecture/database.md`; §9 → `architecture/migrations.md`; §22 → `architecture/caching.md`; §23 → `pages/leads.md`; §14–16 → `pages/tasks.md` / integrations / `modules/gia.md`; §17–18 rules copy → pointer to `rules/The_Rules.md` (drifted copy — e.g. its V-10 differs from The_Rules V-10); §19 decision log → preserved in `rules/The_Rules.md` log + relevant architecture docs; §7 phase table → `01-vision.md` + changelog pointer. Then archive |
| `changelog.md` (4,633 ln, 425 entries) | Reverse-chronological record of every shipped change since 2026-05-26 | 2026-06-11 | **KEEP-AS-IS** at `docs/changelog.md` (append-only historical record; old path strings inside entries are exempt from reference rewrite) |
| `database_architecture.sql` (400 KB) | `pg_dump` schema snapshot (PostgreSQL 17.6) | 2026-06-09 | **MOVE** → `architecture/database_architecture.sql` (companion dump to the new `architecture/database.md` narrative) |
| `call-intelligence-spec.md` (811 ln) | Planned call-intelligence/helpdesk module: taxonomy, schema, ingestion, retrieval, UI surfaces, migration plan, build sequence | 2026-06-09 | **MOVE** → `modules/call-intelligence.md` (status: spec, not built) |
| `decisions-to-take.md` (40 ln) | Open-decision backlog; single item: archived leads invisible to phone search (RLS wall) | 2026-06-10 | **MERGE-INTO** `pages/leads.md` § Open items (its only item is leads-scoped); archive original |
| `design-audit-2026-06.md` (654 ln) | Point-in-time design audit: findings C/H/M/L, theme completeness, DOC-01…06 drift table, remediation phases (1–2 complete) | 2026-06-11 | **MOVE** → `audits/design-audit-2026-06.md` (dated audit report; open items remain Phase 3–4) |
| `security-audit-2026-06.md` (453 ln) | Point-in-time security audit: RLS, SECURITY DEFINER RPCs, adminClient sites, actions, Redis isolation, webhooks; F-1…F-5 (F-2/F-3/F-4 fixed) | 2026-06-11 | **MOVE** → `audits/security-audit-2026-06.md` (F-1 open; F-5 decision recorded in `integrations/lead-ingestion.md`) |
| `performance-audit-2026-06-11.md` (433 ln) | Point-in-time perf audit: request shell, dossier waterfall, list scalability, bundle; phases (B, E partially fixed) | 2026-06-11 | **MOVE** → `audits/…` *(superseded during execution: Phase 5 completed in a parallel stream and the audit file was deliberately deleted — see changelog 2026-06-11; its do-not-regress rules live in the CLAUDE.md files)* |
| `dashboard-page.md` (729 ln) | Dashboard intelligence doc: data model, widget registry, hooks, page, widgets, actions, realtime, access, invariants | 2026-06-11 | **REWRITE** → `pages/dashboard.md` (template) |
| `lead-page.md` (849 ln) | Leads list + dossier intelligence doc: data model, ingestion, services, actions, list page, dossier, access, constants, invariants | 2026-06-11 | **SPLIT/REWRITE** → `pages/leads.md` (list) + `pages/lead-dossier.md` (dossier); ingestion section → pointer to `integrations/lead-ingestion.md` |
| `tasks-page.md` (1,037 ln) | Tasks intelligence doc: data model, RPCs, services, actions, Trigger.dev, filters, tabs, modals, workspace, flows, access, migrations, invariants | 2026-06-11 | **REWRITE** → `pages/tasks.md` (template) |
| `deals-page.md` (509 ln) | Deals intelligence doc: `public.deals` model, won-deal + walk-in flows, RPC, types, service, page, schemas, access, invariants | 2026-06-09 | **REWRITE** → `pages/deals.md` |
| `campaigns-page.md` (476 ln) | Campaigns intelligence doc: data model, RPCs, services, list + detail pages, types, access, invariants | 2026-06-09 | **REWRITE** → `pages/campaigns.md` |
| `performance-page.md` (527 ln) | Performance intelligence doc: indexes, period system, date-field rule, services, actions, role branching, three views, access, invariants | 2026-06-09 | **REWRITE** → `pages/performance.md` |
| `whatsapp-page.md` (698 ln) | WhatsApp page + system doc: tables, RPCs, three service files, webhook route, actions, templates, page architecture, realtime, access, invariants | 2026-06-09 | **SPLIT** → `pages/whatsapp.md` (page spec) + pipeline/webhook/templates → `integrations/whatsapp-gupshup.md` |
| `whatsapp-notifcation.md` (294 ln; filename typo) | Notification + ingestion pipeline analysis: Gupshup config, two pipelines, assignment paths, `notifyLeadAssigned`, 5 send functions, logging, open decisions | 2026-06-09 | **MERGE-INTO** `integrations/whatsapp-gupshup.md` (fixes the typo by retirement) |
| `settings-page.md` (382 ln) | Settings intelligence doc: `agent_routing_config`, service, actions, TimePicker/WorkDayPicker, AgentSettingsTable, SLA hook, access, invariants | 2026-06-09 | **REWRITE** → `pages/settings.md` |
| `user-management-page.md` (750 ln) | User mgmt intelligence doc: authorization principle, profiles data model, helpers, services, actions, schemas, three pages, primitives, access, edge cases, invariants | 2026-06-11 | **SPLIT/REWRITE** → `pages/user-management.md` (pages) ; profiles/RBAC foundations → `architecture/auth-and-rbac.md` + `architecture/database.md` |
| `ad-creatives-page.md` (388 ln) | Ad creatives intelligence doc: table, storage bucket, service, actions, schemas, page, video primitives, read surfaces, access, invariants | 2026-06-09 | **REWRITE** → `pages/ad-creatives.md` |
| `auth-pages.md` (572 ln) | Auth/session/profile doc: root route, 3 Supabase clients, proxy, pre-auth pages, dashboard layout, /profile, actions, session flow, invariants | 2026-06-09 | **SPLIT/REWRITE** → `pages/auth.md` (login/forgot/update) + `pages/profile.md` (/profile) ; proxy/session/clients → `architecture/auth-and-rbac.md`. Stale: cites `docs/The_Profile.md` (deleted) |
| `.DS_Store` | macOS artifact | — | **DELETE** (ignore; not a doc) |

---

## 2. Duplication Map

Topics documented in ≥2 places, the proposed single home, and what every other location becomes.

| Topic | Currently in | Single home | Other locations become |
| ----- | ------------ | ----------- | ---------------------- |
| Engineering rules (A/S/D/P/Q) | `The_Rules.md` · `master.md` §17–18 (drifted copy) · root `CLAUDE.md` (operational digest — out of docs/ scope) | `rules/The_Rules.md` | master §17–18 not migrated (archived); root CLAUDE.md keeps its digest (command layer, not docs) |
| Design rules (V-*) + Never-Do | `The_Rules.md` §5 · `DESIGN-DNA.md` §10 + Never-Do · `design-system.md` §14–15 · `master.md` §18 | `design/DESIGN-DNA.md` (design law) — `rules/The_Rules.md` §5 keeps only the *coded* V-rules table with a pointer line "full design law: DESIGN-DNA" | design-system §14/§15 → one-line pointer; master archived |
| Surface contract (text-on-surface table) | root `CLAUDE.md` · `master.md` §21 · `design-system.md` §4 · `DESIGN-DNA.md` | `design/DESIGN-DNA.md` (THE SURFACE CONTRACT) | design-system §4 → pointer + implementation notes only; master archived |
| Theme token maps (5 themes) | `DESIGN-DNA.md` §1 · `design-system.md` §3 · `master.md` §21 | `design/DESIGN-DNA.md` (values live in `src/styles/design-tokens.css`) | design-system §3 → behaviour/usage notes only |
| Motion constants & rules | `DESIGN-DNA.md` §6 · `design-system.md` §6 · `master.md` §21 | `design/DESIGN-DNA.md` §6 (rules); implementation table in `design-system.md` points there | master archived |
| Z-index scale + confirm-dialog stacking | `master.md` §21 · `DESIGN-DNA.md` §3.6 · root CLAUDE.md pattern note | `design/DESIGN-DNA.md` §3.6 | master archived |
| Decision Log (engineering/product) | `The_Rules.md` log · `master.md` §19 · `The_Gia.md` §17 | `rules/The_Rules.md` Decision Log (rule + architecture decisions) — master/Gia rows not already there get appended during migration | master/Gia archived; architecture docs cite decisions inline with date |
| Decision Log (design) | scattered: `The_Rules.md` 2026-06-11 rows · design-audit asks for one | **NEW** `design/decision-log.md` — seeded with already-made calls (status-solid tokens, `--color-*-fg` family, overlay contract, agent-palette de-semanticisation, gold-shimmer scoping, BAR_COLORS retirement, 500 ms ceiling reconciliation TODO) | The_Rules log rows stay (historical); new design decisions go to design/decision-log.md only |
| Roles & domains (RBAC matrix) | `master.md` §4–5 · `user-management-page.md` §2 · root `README.md` §4 (drifted: describes a "grants" system that does not exist) | `architecture/auth-and-rbac.md` | user-management → pointer + page-level role gates only; root README §4 corrected to pointer |
| `profiles` schema + trigger + audit log | `master.md` §6 · `user-management-page.md` §3 | `architecture/auth-and-rbac.md` (authz parts) + `architecture/database.md` (schema row) | user-management → pointer |
| Migration index (98 migrations) | `master.md` §9 (only home) | `architecture/migrations.md` | page docs keep per-page "related migrations" lists as pointers to it |
| Redis keys/TTLs/invalidation | `master.md` §22 · root CLAUDE.md pattern notes · `src/lib/CLAUDE.md` | `architecture/caching.md` | src CLAUDE.md keeps code-adjacent registry (command layer); integrations/upstash-redis.md points to caching.md |
| SLA engine (8 rules, business hours) | `master.md` §16 · `The_Gia.md` §15 · `settings-page.md` §10 | `modules/gia.md` § SLA Engine | pages/settings.md → pointer; integrations/trigger-dev.md covers only the job mechanics |
| WhatsApp pipeline + templates + logs | `whatsapp-page.md` §5–7 · `whatsapp-notifcation.md` · `The_Gia.md` §14 · `master.md` §15 | `integrations/whatsapp-gupshup.md` | pages/whatsapp.md = UI/page only, pointer for pipeline; gia.md → one paragraph + pointer |
| Lead ingestion (webhook, round-robin, dedup) | `The_Gia.md` §3–5 · `lead-page.md` §3 · `whatsapp-notifcation.md` §3 | `integrations/lead-ingestion.md` | pages/leads.md + modules/gia.md → pointer |
| Task system (3 categories, RPCs, invariants) | `master.md` §14 · `tasks-page.md` | `pages/tasks.md` | master archived |
| Deals model + flows | `deals-page.md` · `The_Gia.md` §12 · `master.md` §19 rows | `pages/deals.md` | gia.md → one paragraph + pointer |
| Export system (CSV/XLSX) | `master.md` §23 (only home) | `pages/leads.md` § Export | — |
| `leads` schema narrative | `The_Gia.md` §2 · `lead-page.md` §2 | `architecture/database.md` (schema) — `pages/leads.md` keeps column-behaviour notes the UI depends on | gia.md → pointer |
| Standard page layout contract | root `CLAUDE.md` · `master.md` §21 · `design-system.md` §8 | `design/design-system.md` §8 (implementation home; DNA holds the law) | master archived |
| Phase/build history | `master.md` §7 · root `README.md` §5 · root `CLAUDE.md` phase table | `changelog.md` (record) + `01-vision.md` (forward roadmap + module status) | README §5 trimmed to pointer (Stage 2 touches root README only for dead paths + this pointer) |
| Tech stack table | `master.md` §2 · root `README.md` §3 | `architecture/overview.md` | README §3 stays (harmless duplication outside docs/ is allowed but will note source of truth) |

---

## 3. Gap List

Code surfaces with **no documentation home today** → the new doc that covers each.

| Gap | Evidence | New home |
| --- | -------- | -------- |
| `/error-log` page (admin/founder raw-payload error log) | `src/app/(dashboard)/error-log/page.tsx`; master route map says "(see CLAUDE.md)" — nothing exists | `pages/error-log.md` |
| Auth callback route | `src/app/api/auth/callback/route.ts` (P-02 names it; no doc describes it) | `pages/auth.md` § Callback |
| Env var registry — `.env.example` is **incomplete**: code reads 17 vars; example lists 7. Missing: `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (+ Trigger.dev's own `TRIGGER_SECRET_KEY` implied by SDK) | `grep process.env src/` vs `.env.example` | `operations/environments.md` (names/purpose/where-used/server-only — NO values). `.env.example` itself is src-adjacent — flagged as TODO for a code PR, not edited in this pass |
| Deployment topology (Vercel, `maxDuration` exports on webhook routes, Supabase project, Upstash, Trigger.dev v4 config) | scattered in CLAUDE.md pattern notes | `operations/deployment.md` |
| Trigger.dev integration (jobs, idempotency keys, tags, v4-not-v3, hook points) | `src/trigger/*.ts`, `lib/CLAUDE.md` only | `integrations/trigger-dev.md` |
| Upstash Redis connection + failure-tolerance policy | `src/lib/redis.ts`, master §22 | `integrations/upstash-redis.md` (connection/policy; keys live in `architecture/caching.md`) |
| Supabase Storage buckets (`avatars` 0071, `ad-creatives` 0012/0092-93) as a topic | scattered in page docs + migrations | `architecture/database.md` § Storage |
| Supabase Realtime usage registry (notifications, `task_remarks`, whatsapp ×2, workspace subtasks; channel-nonce pattern) | scattered | `architecture/overview.md` § Realtime |
| In-app notification system (bell, panel, `notifications` table, `useNotifications`, sound) | no page doc owns TopBar features | `architecture/overview.md` § Shell features (Sidebar/TopBar/notifications/toasts) |
| Hooks registry — 13 hooks in `src/hooks/`; master lists only 9 (missing `useMountOnFirstOpen`, `usePortalAnchor`, `useUrlFilters`, `useWidgetData`) | `ls src/hooks` | `architecture/overview.md` § Client-side patterns (one-liner each, pointer to src CLAUDE.md) |
| Services without a page doc: `lead-cache.ts`, `lead-assignment-notify.ts` | named only in CLAUDE.md | `architecture/caching.md` (lead-cache) · `integrations/whatsapp-gupshup.md` (notify) |
| RBAC route authorization (`canAccessRoute`, `DOMAIN_ROUTE_MAP`, proxy, layout guard) | split across auth-pages.md/master/CLAUDE.md | `architecture/auth-and-rbac.md` |
| SECURITY DEFINER policy + F-1 posture (post-audit) | security audit only | `architecture/auth-and-rbac.md` § RLS philosophy |
| Raw-payload PII retention decision (F-5) | security audit note | `integrations/lead-ingestion.md` § Raw payload policy |
| Lia (AI presence) — design language exists (DNA §15) but no module/status doc | DNA §15, CLAUDE.md quick ref | `modules/lia.md` (status: in design, not built) |
| Sia (Concierge module) | one-line mentions only | `modules/sia.md` stub |
| Elia | **appears nowhere in the repo** — named only in the restructure brief | `modules/elia.md` stub with "TODO: verify scope" |
| Non-technical explanation of the whole product | none | `00-for-the-board.md` |
| Product vision / module roadmap / "done" per module | fragments in master §7, README §5 | `01-vision.md` |
| Docs index + reading orders | none | `README.md` (docs/) |

---

## 4. Proposed Tree

Adapted from the brief: added `audits/`, `modules/lia.md`, `pages/error-log.md`;
`database_architecture.sql` moves under `architecture/`; `changelog.md` stays at root.

```text
docs/
├── README.md                      ← index: every file's contract, reading orders (engineer/designer/board), "want X → read Y" routing table, page-spec template definition
├── 00-for-the-board.md            ← plain-English: what Eia is, modules, live-vs-build, lead journey, what each screen shows, roadmap; zero jargon/paths
├── 01-vision.md                   ← product vision, module roadmap (Gia→Lia→Sia→Elia), per-module "done", phase history pointer
├── changelog.md                   ← unchanged (single source of truth for what shipped)
├── architecture/
│   ├── overview.md                ← system diagram in words (Next.js↔Supabase↔Redis↔Trigger.dev↔Gupshup↔Vercel), request flow, shell features, Realtime registry, client patterns/hooks
│   ├── database.md                ← schema narrative: every table, purpose, key columns, relationships, storage buckets; companion to the dump
│   ├── database_architecture.sql  ← pg_dump snapshot (moved)
│   ├── auth-and-rbac.md           ← role×domain matrix, profiles foundation, get_user_role/domain, requireProfile, proxy/session, route authorization, RLS + SECURITY DEFINER policy (F-1 posture), GIA_DOMAINS vs APP_DOMAINS
│   ├── caching.md                 ← Redis key registry, TTLs, version-counter pattern, dual-key invariant, invalidation rules (lead-cache.ts), cache() vs unstable_cache
│   └── migrations.md              ← 98-migration index + conventions (timestamp ordering caveat, guards, repair migrations, RLS checklist pointer)
├── design/
│   ├── DESIGN-DNA.md              ← design constitution (moved; DOC-05/06 corrected)
│   ├── design-system.md           ← component implementation reference (moved; DOC-01/04 corrected)
│   └── decision-log.md            ← NEW dated design decisions; seeded with the already-made calls
├── rules/
│   └── The_Rules.md               ← engineering constitution + rule-change Decision Log (moved; design section points to DNA)
├── pages/                         ← one spec per route, one template (defined in README.md):
│   ├── dashboard.md  ├── leads.md  ├── lead-dossier.md  ├── tasks.md
│   ├── deals.md      ├── campaigns.md  ├── performance.md  ├── whatsapp.md
│   ├── settings.md   ├── auth.md   ├── profile.md  ├── user-management.md
│   ├── ad-creatives.md  └── error-log.md
├── modules/
│   ├── gia.md                     ← what Gia is, lifecycle, SLA engine, surfaces, status
│   ├── lia.md                     ← AI presence: design language pointer, surfaces, status (in design)
│   ├── sia.md                     ← stub: concierge module, not started
│   ├── elia.md                    ← stub: TODO verify scope (no repo source)
│   └── call-intelligence.md       ← existing spec, moved
├── integrations/
│   ├── whatsapp-gupshup.md        ← Gupshup config, webhook contract, inbound pipeline, 5 templates, notify orchestrator, logs table, open items
│   ├── lead-ingestion.md          ← Pabbly/Meta webhook, validation, domain resolution, round-robin, dedup, raw-payload policy (F-5)
│   ├── trigger-dev.md             ← jobs, idempotency/tags, v4 conventions, hook points
│   └── upstash-redis.md           ← connection, failure tolerance, pointer to architecture/caching.md
├── operations/
│   ├── environments.md            ← all 17+ env vars: name, purpose, where used, public/server-only (no values)
│   └── deployment.md              ← Vercel/Supabase/Upstash/Trigger.dev setup, maxDuration, build commands
├── audits/
│   ├── design-audit-2026-06.md
│   ├── security-audit-2026-06.md
│   └── performance-audit-2026-06-11.md
└── _archive/                      ← originals of split/merged/rewritten files (delete in a later pass)
```

### Page-spec template (every `pages/*.md`)

```text
Header block: purpose (1 line) · audience · source-of-truth scope · last-verified date
1. Purpose            — what the page is for, in two sentences
2. Who sees it        — role × domain matrix, route guards
3. Data sources       — services / RPCs / actions (tables)
4. Components         — component inventory + key props contracts
5. States             — loading / empty / error behaviour
6. Invariants         — "must never be violated" list (preserved from old docs, verified)
7. Open items         — known gaps, deferred decisions
8. Deep dive          — preserved still-true detail sections from the old intelligence doc
```

---

## 5. Reference-Breakage Table

Every live in-repo reference to a docs/ path that changes (or is already dead). Historical
records are exempt and listed at the bottom.

| Location | Current reference | Update to |
| -------- | ----------------- | --------- |
| root `CLAUDE.md` (4 sites: L7, L98, L398, L572) | `docs/design-dna.md` | `docs/design/DESIGN-DNA.md` |
| root `CLAUDE.md` folder structure (L~90-100) | `docs/The_Blueprint.md` (deleted file!), `docs/The_Rules.md`, `docs/design-dna.md` | new tree map (Stage 2 final step) |
| root `CLAUDE.md` phase-status pointer (L369) | `docs/master.md §7` + `§9` | `docs/changelog.md` + `docs/architecture/migrations.md` + `docs/01-vision.md` |
| root `README.md` L239–243 (doc table) | `docs/The_Blueprint.md` (deleted), `docs/DESIGN-DNA.md`, `docs/The_Rules.md`, `docs/The_Gia.md` | new paths (`design/…`, `rules/…`, `modules/gia.md`); Blueprint row → `docs/README.md` |
| root `README.md` L147–148 | `docs/The_Gia.md` Section 14.3 / 14.6 | `docs/pages/whatsapp.md` / `docs/integrations/whatsapp-gupshup.md` |
| root `README.md` L257 | `docs/The_Rules.md` | `docs/rules/The_Rules.md` |
| `src/components/CLAUDE.md` L119 | Decision Log in `docs/The_Rules.md` | `docs/design/decision-log.md` (overlay contract is a design decision; The_Rules row stays historical) |
| `src/components/CLAUDE.md` L690 | link to `docs/component-sweep-flags.md` (deleted file) | remove link; keep inline summary (L672 already notes "since deleted") |
| `src/app/(dashboard)/CLAUDE.md` L243 | `docs/tasks-page.md` §4 | `docs/pages/tasks.md` |
| `src/lib/CLAUDE.md` L57 | Q-17 in `docs/The_Rules.md` | `docs/rules/The_Rules.md` |
| `src/lib/actions/_auth.ts` L14 (comment) | `docs/dry-audit-master.md` (deleted file) | drop the stale path (comment-only edit) |
| `docs/The_Rules.md` (Q-05, Q-06a, Never-Do ×2) | `docs/changelog.md` | unchanged (path survives) |
| `docs/design-system.md` L804 | `DESIGN-DNA.md` §3.7 + `docs/auth-pages.md` | `DESIGN-DNA.md` (same folder) + `docs/pages/auth.md` |
| `docs/DESIGN-DNA.md` L1359 | `docs/auth-pages.md` | `docs/pages/auth.md` |
| `docs/DESIGN-DNA.md` L7049 (tail note) | `docs/context.md` (deleted), `docs/design-tokens.css` (does not exist) | rewrite note: canonical tokens `src/styles/design-tokens.css`; history `docs/changelog.md` |
| `docs/The_Gia.md` L236 | `docs/The_Blueprint.md` §Tasks (deleted) | content migrates to `modules/gia.md` → `docs/pages/tasks.md` |
| `docs/auth-pages.md` L103 | `docs/The_Profile.md` §15 (deleted) | content migrates → cite `architecture/auth-and-rbac.md` (proxy `last_seen_at` rule, verified in `src/proxy.ts`) |
| `docs/deals-page.md` L15 | `docs/master.md` §19 | `docs/rules/The_Rules.md` Decision Log (2026-06-05 deals entry) |
| `docs/decisions-to-take.md` L38 | `docs/lead-page.md` | merged into `pages/leads.md` |
| `docs/security-audit-2026-06.md` (L10, 450, 452) | `docs/database_architecture.sql`, `docs/master.md` | `docs/architecture/database_architecture.sql`, `docs/architecture/overview.md` |
| `docs/performance-audit-2026-06-11.md` (L8, 431–432) | `docs/database_architecture.sql`, `docs/master.md` | same as above |
| `docs/design-audit-2026-06.md` L5 | `docs/DESIGN-DNA.md`, `docs/design-system.md` | `docs/design/…` paths |
| `docs/master.md` (all internal refs) | page docs, design-system | file archived — no update needed beyond the archive banner |

**Exempt (historical records — never rewritten):**

- `docs/changelog.md` entries (append-only history; entries citing `docs/master.md`, `docs/dry-audit-master.md`, old page-doc paths, etc. describe the state at the time)
- `supabase/migrations/20260605000072_create_deals_table.sql` L4 comment (A-14: migrations are never edited after running)
- `docs/The_Rules.md` Decision Log rows + audit findings text (point-in-time records)

**Post-pass guard:** grep repo for `docs/[A-Za-z_-]+\.(md|sql)` — every hit must be either a
new-tree path, `docs/changelog.md`, or inside the exempt set.

---

## 6. Stage 2 Execution Order

1. Create `docs/_archive/`, `architecture/`, `design/`, `rules/`, `pages/`, `modules/`, `integrations/`, `operations/`, `audits/`.
2. Pure moves first (git mv): DESIGN-DNA, design-system, The_Rules, call-intelligence-spec, audits ×3, database_architecture.sql. Fix DOC-01/04/05/06 + stale refs inside them.
3. Write `design/decision-log.md` (seeded).
4. Split `master.md` → architecture/ ×5 (verify each claim against code; correct drift); archive master.md.
5. Write integrations/ ×4 from whatsapp-notifcation.md + The_Gia.md §3–5/§14 + code; archive sources.
6. Migrate page specs → `pages/` (template header + restructure; verify high-risk claims; preserve still-true content). Archive originals.
7. Write modules/ (gia from The_Gia.md remainder; lia/sia/elia stubs).
8. Write operations/ ×2 (env sweep + deployment from code/config).
9. Write `00-for-the-board.md`, `01-vision.md`, `docs/README.md`.
10. Execute the full breakage table; grep-verify zero dead refs.
11. Diff every archived file against its targets; list dropped content + reason (in `_archive/README.md`).
12. changelog.md entry; update root CLAUDE.md doc map; sign-off checklist.

**Drift corrections required by rule 1 (code is truth), found during Stage 1:**

- DOC-01…DOC-06 (design-audit §4) — correct in destination docs, never copy forward.
- `The_Gia.md`: scratchpad (dropped 0061) · deal columns on leads (dropped 0097) · WhatsApp webhook auth is Gupshup `x-gupshup-secret`, not Meta signature · `platform` → `source` (0065) · Gia decision-log row "Scratchpad on reassignment" is obsolete.
- `master.md` §17 V-10 ("form field labels use label-micro") differs from The_Rules V-10 ("micro labels are always text-[10px]…") — The_Rules is canonical.
- root `README.md` §4 "grants" system — does not exist (master: "There is no grants table"; one domain per user). Corrected via pointer.
- `master.md` hooks list (9) vs actual 13 hooks.
- `.env.example` missing 9+ vars (documented in environments.md; example file fix deferred to a code PR).
