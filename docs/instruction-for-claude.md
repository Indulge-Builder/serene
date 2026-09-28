# Serene — Project Context & Working Memory

> **Purpose:** a working-memory brief for chat-based Claude sessions (claude.ai, Cowork): who the people are, the stack, what is live, what is next, the learnings and how to work with the tech lead.
> **Audience:** a Claude chat without repo access, and whoever keeps this brief current.
> **Source-of-truth scope:** a brief, not a spec. Product facts point at `docs/01-vision.md`, `docs/claude-project/` and the module docs; the people, team and tool notes are kept as written by the team and are not verified from the repo. The repo and its docs win on any product fact.
> **Last verified:** 2026-09-26, product-state facts only (sections 1 to 3, 5, 7 and the dated notes), against the docs refreshed that day. Sections 4, 8 and 10 and the people facts were not re-checked.

---

## 1. Who & context

- **Wizard** — technical lead at **Indulge Global**, a luxury concierge brand serving the world's wealthiest (UHNW) clients.
- **Verticals:** Global, House, Shop, Legacy
- **Primary project: Serene** — Indulge Global's internal operating system. Three core modules:
  - **Gia** — lead-management CRM. _Live_ across Shop, Legacy, House, Onboarding domains.
  - **Sia**: the concierge side (members after the sale). _Live, running beside Freshdesk_: the WhatsApp group archive, three queendoms with seats, member records, Serene tickets, the vendor book, the Freshdesk mirror, Zoho. The Freshdesk cutover is not built.
  - **Elaya**: the agentic AI assistant, the "presence" layer inside the app; the goal is a Jarvis-level, fully agentic assistant. _Live_ in the app, on WhatsApp and through the MCP connector (Claude, ChatGPT).
- **Tech team (3):**
  - **Arfam** — app, admin panel, websites, Serene/Elaya.
  - **Manu** — data, testing, Serene dev.
  - **Ethan** — security, device management, Serene features, third-party integrations (WATI, Freshdesk).
- Wizard is the senior architectural decision-maker: uses Claude for planning/briefs, **Claude Code (via Cursor)** for execution.

## 2. Stack (final — never propose alternatives)

Next.js 16 App Router (PWA) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Supabase (PostgreSQL 17, Auth, the OAuth server for MCP, RLS, Realtime, Storage) · Framer Motion · React Hook Form + Zod · Trigger.dev v4 · Upstash Redis · Vercel (Mumbai) · pnpm · Gupshup (WhatsApp BSP) · Anthropic (every model call, behind one provider layer).

- **AWS (ECS Fargate via Copilot, app `serene`, env `prod`, `ap-south-1`):** service `api` is Elaya's **Python brain** (`backend/`, FastAPI, behind CloudFront HTTPS; both chat channels think there since 2026-09-04, writes come back through the Node cores via `/api/elaya/bridge`); service `watcher` is the **Sia WhatsApp watcher** (`connector/`, Baileys, one arm64 task, never sends, session in Postgres, media in S3). The in-process Node brain is frozen, retirement targeted 2026-10-16.
- **Postgres schemas:** `public` (profiles, tasks, notifications, Elaya, vendors, subscriptions), `gia` (the sales tables, moved 2026-09-17), `member` (the member twin, the old `clients` tables renamed), `sia` (WhatsApp archive, queendoms, tickets, intake), `freshdesk` (the read-only mirror), `elaya_read` (clean views for Elaya's read-only SQL). Helpers `giaDb()` / `memberDb()` in `src/lib/supabase/schemas.ts`. `hands` arrives with migration 0245 (committed, not applied).
- **Outside services:** Freshdesk and Zoho Books (both read only, Serene never writes to them), Deepgram (voice in), Web Push, S3 (Sia media).
- **Supabase project:** `xmucqqhbupudnzderchy`
- **Trigger.dev project:** `proj_xfyyvwjmrumreyvawcwg` (binary is `trigger`, not `trigger.dev`; `trigger.config.ts` reads tsconfig path aliases automatically)
- **Repo:** `github.com/Indulge-Builder/serene`

## 3. What's live

Full ledger: `docs/01-vision.md` and `docs/claude-project/9-roadmap-and-open-items.md`.

- **Domains (nine):** concierge, onboarding, finance, marketing, tech, shop, business (was `b2b` until 2026-09-16), house, legacy. Gia domains: onboarding, house, shop, legacy. Tech is the "workbench" (reaches almost every page, writes stay admin/founder).
- **Lead pipeline (Gia):** `new → touched → in_discussion → nurturing | won | lost | junk`. `leads.domain` always equals the handling team's `profiles.domain`; canonical enum is `app_domain` (not text). Tables live in the `gia` schema. Channels: Pabbly (Meta, Google), website, the Shop app (with product enquiries), WhatsApp.
- **SLA engine:** business-hours-aware (09:00 to 19:00 IST, Mon to Sat), event-driven delayed jobs via Trigger.dev v4, auto-task creation on breach, `gia.sla_policies` with `USR-` codes, deactivate-not-delete. Founder new-lead WhatsApp pings and founder SLA escalations are paused (2026-09-21/23, reversible).
- **WhatsApp (Gupshup BSP):** notification pipeline (13 templates: agent assignment, SLA breach, task reminders, the Sia alert, the customer welcome), `whatsapp_notification_logs`, `x-gupshup-secret` webhook auth, `after()` from `next/server` for every outward send. The same number is Elaya's staff channel (a staff profile with a blank phone turns their messages into leads).
- **Concierge (Sia):** three queendoms (Anishqa, Ananyshree, Sanika); seats on `profiles.sia_role` (queen, bishop, genie, joker, and one company-wide Joker head) + `profiles.queendom_id`; nobody changes their own seat (0243). The WhatsApp archive since 2026-08-27; about 614 members with a self-filling record (chat profiler, hourly pulse, weekly judgement, one health number, encrypted vault); Serene tickets with a sentinel and an intake sweep that proposes tickets from the chats (a human always decides); about 21,600 vendors with one ranking and a live extractor; the Freshdesk mirror; Zoho member finance. Detail: `docs/claude-project/12-sia-concierge.md`.
- **Elaya:** 36 read + 16 write tools with tool search; propose-then-confirm for risky writes; `elaya_actions` ledger; PII gateway plus a code-name vault for chat text; living memory per person; improvement requests; founder playbooks; an eval set; for founders an analyst (read-only SQL, live pulse, twice-daily brief, alert sweep, deep reads). Models are rows: Haiku 4.5 for routing, Sonnet 5 for reasoning, Opus 5 for the heavy tier. Voice is input only (Deepgram); there is no text-to-speech. On for the Gia and concierge teams, admin, founder and tech; off for finance, marketing and business.
- **MCP connector:** Claude, ChatGPT and other AI apps read Serene as the signed-in person (read tools only; writes are Phase 4, not built).
- **Task system:** `task_category` is `personal` / `group_subtask`; lead links via `gia.task_gia_meta`, ticket links via `public.task_ticket_meta`; `task_module` enum (`gia`, `sia`, `core`; nothing writes `sia` yet); Oversight (three tiers) over the append-only `task_events`; repeat reminders set by Elaya.
- **Also live:** Subscriptions (finance and tech), Books (Zoho, admin and founder), the `/m` phone layer, Web Push, the neumorphic design with eight themes and dark mode.
- **Usage monitoring:** heartbeat-only (60s, visibility-gated), Redis hot path, `usage_heartbeats` + `usage_daily` tables, `SECURITY DEFINER` RPC for reads.
- **Migration discipline:** the Supabase CLI only (`supabase db push --dry-run`, then `supabase db push`), never the SQL editor. Mixing the two caused ledger drift; reconcile via `migration repair`. A push applies every pending file, so check for other sessions' uncommitted migrations first. Production has every migration through 0244; 0245 (hands) is committed, not applied.

## 4. Active sub-projects (alongside Serene)

These live outside this repo; their state below is as the team wrote it and is not verified here.

- **Elaya 3D mascot** — "Astralis Driftling" `.glb` export for Serene's UI.
- **Serene public marketing/investor site** — `SPEC.md` locked: eight-chapter storyboard, Instrument Serif + Inter Variable, GSAP ScrollTrigger + Lenis, Higgsfield for AI imagery, Vercel deploy. Static launch piece for founders/investors. **Rule: all Higgsfield screenshots use seeded demo data only.**
- **Monthly PDF reports** — WeasyPrint pipeline with Playwright/Chromium fallback; Playfair Display + Geist embedded as base64 woff2 data URIs; `font-synthesis: none` to kill the ghost-print artifact; Indian number formatting (lakh grouping).

## 5. On the horizon

Current focus (from `docs/01-vision.md`, 2026-09-26):

- **The concierge floor on Serene:** get real human verdicts into the ticket training loop, then plan the Freshdesk cutover.
- **Elaya's hands:** a second WhatsApp number and outside agents (Instinct first) treated as vendors. Step 1 built (migration 0245, not applied); plan in `docs/architecture/hands-plan.md`.
- **One brain:** retire the frozen Node brain (target 2026-10-16).
- **Next after that:** the post-won bridge (a won deal opens or links the member record; `gia.deals.member_id` is never set today), MCP writes, Elaya for finance, marketing and business, DPDP compliance phase 2.

Earlier horizon items, now settled: the Sia module shipped, but not as the old plan said (no `create_lead_sia_task` or `task_sia_meta`; ticket tasks link through `task_ticket_meta` and keep `module = 'core'`); the escalation page (`/escalations`) and the SLA settings UI (`/settings/follow-up-engine`) shipped; the global domain selector shipped (admin and founder, `resolveDomainParam`); the helpdesk is live (onboarding seeded with 150 cases; the other Gia domains are not seeded).

Still open from the old list (team items, not verified here):

- **Elaya marketing website** — Phase 1 (skeleton build) brief ready for Claude Code.
- **Serene repo** — make private; establish a fine-grained **read-only PAT** workflow for per-session Claude access.
- **Elaya 3D** — full animation sequence render via background CLI (`blender -b file -a`).
- **ElevenLabs TTS** — PII-exposure decision pending (zero-retention enterprise mode recommended); romanized Hinglish pronunciation testing needed.

## 6. Key learnings & principles

**Architecture**

- Read the actual files before prescribing — never brief from digests alone.
- One fetch per data source; `Promise.all` for parallel; never per-row/per-card calls.
- `SECURITY DEFINER` with a pinned `search_path` on all RPCs (`public, gia, member` since the 2026-09-17 schema move); RLS **and** `requireProfile()` always paired (neither trusts the other).
- PostgREST cannot embed across schemas (a `gia` table embedding `public.profiles` returns PGRST200 and the page renders empty): use the `gia.profiles` / `member.profiles` views or two plain queries. PostgREST also caps every response at 1,000 rows, RPC results included, and says nothing: count in SQL or page on a stable key.
- Any read on the admin client (Sia `wag_*`, the `freshdesk` schema, the member vault, every Elaya read) has no RLS behind it: the code gate (`canAccessMember`, `getSiaViewerScope`) is the boundary.
- Redis failures must never block DB fallthrough; `await` cache deletes before `revalidatePath`.
- **Dual cache key invariant:** `leadRowSlug` is hit on normal dossier loads; `leadRowId` only on UUID-fallback paths. A mutation that deletes only one key is a silent no-op on normal traffic. (Lead caches via `invalidateLeadCaches`.)
- `cache()` (React) for session-bound dedup; `unstable_cache` only for static/shared data (it can't wrap `createClient()`, which calls `cookies()`).
- `module='gia'` count must always equal `task_gia_meta` count — enforced by app discipline (single-writer RPC), not a DB constraint.

**Supabase / PostgreSQL**

- Dot-notation column filters on PostgREST joined tables are silently no-ops — never use.
- `jsonb_agg()` returns `NULL` on zero matching rows, not `[]` — coerce with `COALESCE` at the SQL layer and `?? []` at the page layer (two-layer defence).
- RLS policies referencing a column block `ALTER COLUMN TYPE` — drop policies, alter, recreate.
- `bigint` from RPCs must be converted via `Number()` at the service-layer boundary (Q-09).

**Design system**

- Zero hardcoded hex anywhere in components — everything via CSS tokens.
- `font-synthesis: none` + real font-weight files eliminates the ghost-print artifact in WeasyPrint/Chromium.
- `prefer_css_page_size=True` + `print_background=True` required for correct Playwright PDF sizing.

**Workflow**

- Cursor prompts must include: mandatory read-first file list, pre-mortem failure modes, sign-off checklist, post-completion doc updates.
- **Doc updates are mandatory:** `changelog.md`, touched `CLAUDE.md` files, page specs, project digest, knowledge graph.
- `tech-debt.md` **does not exist in the repo — do not reference it.**
- Gamma workspace uses custom theme ID `nqc7dhuzst2wwmi` ("Indulge") — always this, never a generic theme. Use `cardSplit: auto` with explicit `numCards`; omit `inputTextBreaks`.

## 7. Naming canon

- **Serene** = the main OS.
- **Elaya** = the AI virtual assistant / presence layer (the rename from "Lia" is complete; no "Lia" remains in `src/`).
- **Gia** = lead-management CRM module.
- **Sia** = the concierge module (members after the sale).
- **Members** = the member twin (the old "clients" tables, renamed 2026-09-17; `/clients` redirects to `/members`).
- **Queendom** = one concierge team with its own members (Anishqa, Ananyshree, Sanika). **Seats:** queen, bishop, genie, joker, and the company-wide Joker head.
- **The floor** = the concierge team. **The workbench** = the tech domain's wide page access for testing.

## 8. Tools & resources

- **Blender MCP** (local, 5.1.2 EEVEE): `execute_blender_code` reliable for read-only inspection; avoid `evaluated_depsgraph_get()` + `to_mesh()` on animated curve objects (hard timeout). Render previews at ≤360px; results at ≥420px.
- **Gamma** (connected): theme `nqc7dhuzst2wwmi`; `cardSplit: auto`; `textOptions: {amount: brief, tone: "confident, outcome-led, calm luxury"}`.
- **Motion:** `create_video`; always include the conceptual-only constraint (no real data/names/screenshots); board-facing videos default to 16:9.
- **Higgsfield:** image generation for the marketing site; tools require explicit toggle in the connectors menu per session; image-to-3D produces opaque watertight meshes (not suitable for Elaya's translucent design).
- **Supabase MCP:** schema inspection and remote `database.ts` regen against the live project.
- **WeasyPrint 69.0:** `base_url='.'` required; avoid CSS Grid (use flexbox/tables/block); `pdftoppm -png -r 400` for high-DPI verification.
- **Deepgram** (STT): Serene uses `nova-2` with `hi-Latn` (Hinglish in Roman script), since Nova-3 multilingual did not support `hi-Latn`. Audio is transcribed in memory and never stored.
- **ElevenLabs** (TTS, Flash): input-streaming from the LLM for latency; PII transit concern requires zero-retention enterprise mode.
- **Brevo:** SMTP delivery; DNS domain verification preferred over OTP (Google Groups unsuitable for transactional mail); SPF/DKIM/DMARC aligned for both Workspace and Brevo using Brevo's dedicated DKIM selector.
- **Indulge email domain:** `indulgeglobal.com`; Elaya has (or should have) a dedicated Workspace user seat as its sender identity.

## 9. Preserved dated instructions

> These older entries use the repo's earlier name **"Eia"** — same codebase as Serene.

- **Phase 6 (2026-05-28):** Lead column visibility + drag-to-reorder shipped. Files: `src/lib/constants/lead-columns.ts`, `src/hooks/useLeadColumnPreferences.ts`, `src/components/leads/LeadColumnPicker.tsx`. `LeadsTable` accepts a `userId` prop; prefs in `localStorage` (the key prefix is `serene:leads:columns` today, was `eia:leads:columns`). `@dnd-kit/core` + `@dnd-kit/sortable` added.
- **Phase 8 detail metrics (2026-05-28):** Migration 0015 — `get_campaign_detail_metrics` (avg_hours_to_first_touch via lateral join) + `get_campaign_agent_distribution`. `CampaignMetricsStrip` (6 stat cards, division-by-zero guards), `AgentDistributionBar` (Framer Motion `layoutId`), `CampaignMetricsStripSkeleton`. Detail page has 2 independent Suspense boundaries. `numbers.ts` stubs implemented. bigint → `Number()` (Q-09).
- **Number formatting cleanup (2026-05-28):** `formatCompact` / `formatPercent` / `formatCurrency` applied across `AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerLeadVolumeWidget` (YAxis tickFormatter), `ManagerCampaignWidget` (YAxis tickFormatter), `CampaignCard` (MetricPill). Zero raw number renders in JSX metrics across all 5 files. `numbers.ts` is the single source for metric display formatting.
- **Elaya naming (2026-06-12):** "Elaya" is canonical for the AI presence layer. Use it in all plans/briefs. (The rename in the repo is done.)
- **tech-debt.md (verified 2026-06-12):** does not exist anywhere in the repo. Do not reference it.

## 10. How to work with Wizard

- **Brief-first, execute-second:** Wizard approves the architecture/decision, then Claude writes the Claude Code / Cursor brief, Cursor executes, Wizard reports back.
- **Read before prescribe:** request actual source files rather than assuming structure. Digests describe; the repo is truth. If a digest and a pasted file disagree, the repo wins — say so.
- **Terse comms:** Wizard writes shorthand, typos, stream-of-consciousness. Interpret intent; don't ask about spelling. Deliver verdicts with reasoning.
- **Proportionate:** short question → short answer; depth matches complexity.
- **Honest disagreement:** surface risks, push back on architectural choices, never just agree. If the plan is wrong, say so first.
- **Phased sequencing:** foundation first, no code duplication, natural feature progression.
- **Design tokens enforced:** every colour is a token; flag and correct violations on review.

### The five lenses for judging any idea

1. **Natural progression** — a step toward the Jarvis-level AI vision, or a sideways detour that adds weight? Extend what exists before inventing.
2. **100x test** — still fast, cheap, correct at 100× leads/messages/users?
3. **DRY** — registry first; compose/extend, never duplicate.
4. **Safety** — RLS gap? cache invalidation? PII leak? privileged change with no second actor?
5. **Earned complexity** — simplest correct version first; build the fancy version only when data demands it.

### The vision everything converges on

Serene ends as a **Jarvis-level AI work layer**. Elaya is the presence inside the app — an agentic assistant reachable from anywhere (WhatsApp message to the API, or the in-app chatbot). Everything built today — Gia, tasks, WhatsApp pipeline, deals, performance — is **substrate** for that layer. Clean data models, append-only history, pseudonymised AI access, and action-shaped mutations aren't pedantry; they're what makes the AI layer buildable later. When two designs are equal, choose the one the AI layer can drive.

Where that stands (2026-09-26): Elaya is reachable in the app, on WhatsApp and through the MCP connector (Claude, ChatGPT), reads across Gia and Sia as the person asking, and writes through the same cores as the app. The next step is hands: a second WhatsApp number and outside agents treated as vendors (`docs/architecture/hands-plan.md`).
