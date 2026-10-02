# The Master Plan

> **Proposed AI reliability/efficiency tranche, 2026-10-01:** the [reliable agent plan](elaya-reliable-agent-plan.md) details how to reduce repeated reasoning while improving freshness, correctness and actions on the existing Python/Node/Supabase stack. Start with instrumentation and one proven concierge workflow before expanding. See the [cost audit](../audits/2026-10-01-elaya-cost-architecture.md) for measurements. This proposal does not mark any roadmap item shipped.

> **Where this stands on 2026-09-30.** Moved here from the repo root on 2026-09-30, with
> `port-inventory.md` merged in as Appendix A. This was the map for moving Serene onto a Python
> backend on AWS. The map changed course partway, and this note says how. Today's truth lives in
> `docs/01-vision.md` (status per module), `docs/modules/elaya.md` (the brain),
> `docs/modules/sia.md` (the concierge side) and `docs/operations/deployment.md` (what runs where).
> The step-by-step status is the new board at the top of section 6.
>
> - **What happened to the big idea.** Only Elaya's thinking moved to Python. Since 2026-09-04
>   both staff channels (in-app and WhatsApp) run on the Python brain on AWS Fargate. Every write,
>   most tool reads, all 22 background jobs and all of the Sia, member, ticket, vendor and analyst
>   intelligence were built in Node. The brain reaches them through one bridge,
>   `POST /api/elaya/bridge`: "Python thinks, Node mutates" (Decision Log 2026-08-30 and
>   2026-09-16 in `docs/rules/The_Rules.md`). Step 5 was dropped in favour of that bridge.
> - **The locked decisions.** 2 (strangler), 4 (frontend on Vercel) and 5 (Supabase stays) held.
>   3 (evals gate everything) held for the brain flip; later AI changes were mostly checked by hand.
>   6 (Bedrock) never happened: the model is reached through the direct Anthropic API. 1 (all new
>   work in Python) and 8 (Node only for the Baileys connector) changed course; a second Node
>   Baileys process was even added for Hands (0245). 7 (Sia and Gia never mix) mostly held, though
>   Gia kept changing (0180, 0251) and the won-deal to member link is still not built.
> - **The Step 0 freeze did not hold.** Since 2026-08-25 the Node side grew from 30 to 47 action
>   files, 44 to 109 services, 5 to 22 Trigger.dev tasks and 5 to 8 API routes. Only the narrower
>   freeze of the Node thinking loop (2026-09-16) holds: the Node staff brain is kept as the
>   rollback, with retirement targeted for 2026-10-16.
>
> **Purpose:** the one map of everything we are building. A dev starts HERE to know what to do and in what order, then opens the module plan for the deep detail of their phase.
> **Audience:** everyone working on Serene. Plain language on purpose.
> **Decided:** 2026-08-25.
> **Status:** live. Update the status board (section 6) as steps complete.

---

## 1. The vision, in one paragraph

Serene becomes Indulge OS: one system, powered by our AI, running the whole company. Elaya is the personal agent for every employee, in any language, by text or voice, doing the manual work herself. Sia watches every client and vendor WhatsApp group, turning years of conversation into live client profiles, concierge tickets, reviews, and staff and vendor intelligence. Everything runs on our Python backend on AWS, and over time the easy work moves onto small models trained on our own data.

---

## 2. The document family, and how to use it

| File | What it holds | Open it when |
| --- | --- | --- |
| `master-plan.md` | THIS file. The locked decisions, the full step order, the status board. | Always start here. |
| `elaya-plan.md` | The AI track in depth: evals, the Python brain port, router and specialists, reports, proactive Elaya, multilingual, voice, our own models. | You are working on anything AI. |
| `sia-whatsapp-plan.md` | The Sia data layer in depth: Baileys, the `wag_` database design, the connector, the Serene UI, privacy, profiling. | You are working on anything WhatsApp-groups / Sia. |
| `docs/audits/2026-08-24-elaya-workflow.md` | The complete as-built spec of TODAY'S Elaya: every tool, guardrail, and cap. | You are porting the brain to Python (this is the port manual), or you need to know how current Elaya behaves. |

Rule: this file owns the ORDER and the DECISIONS. The module plans own the DETAIL. If they ever disagree on sequence, this file wins.

---

## 3. The locked decisions

Debated, decided, closed. Full reasoning lives in the module plans.

| # | Decision |
| --- | --- |
| 1 | **Full Python backend (FastAPI), built directly on AWS, starting now.** All new work is born in Python so we never pay a migration tax later. |
| 2 | **Strangler migration, never big bang.** The current system keeps serving users; each piece flips only when its Python replacement proves itself. Always a rollback path. |
| 3 | **Evals gate everything.** The exam (real messages + answer keys) is built first, against the current system. No port flips and no AI change ships without the score to back it. |
| 4 | **React frontend stays on Vercel.** It becomes a pure display layer calling the Python API. The future React Native mobile app calls the SAME API. |
| 5 | **Supabase never moves.** One database, both backends read it during the whole transition. |
| 6 | **Claude via AWS Bedrock** once on AWS. No self-hosting the big model (worse and costlier). Our own models come later by distilling small models on our accumulated data. |
| 7 | **Sia and Gia never mix.** Gia = the onboarding CRM and its Gupshup WhatsApp, frozen as is. Sia = the client-operations half, the Baileys group world, all new. They meet only in the client profile. |
| 8 | **The one Node exception:** the Baileys connector (a dumb 500-line ear). Everything intelligent is Python. |

---

## 4. The steps, in order

Two tracks run in parallel after the foundation. A dev picks a step, reads the pointed section, builds, updates the board.

### Step 0. Freeze and scan

Nothing new lands in the old Node backend from here on. Scan and list what the current backend does (the inventory that Step 3 and Step 5 port). `docs/audits/2026-08-24-elaya-workflow.md` already covers the AI side; the remaining server actions and services get a short inventory doc.

### Step 1. The exam, and the first Sia bricks (parallel, starts now)

| Work | Detail lives in |
| --- | --- |
| Build the eval harness in Python + the golden set of 150 to 200 real messages, run it against CURRENT Elaya. Fix the top bugs it reveals. Upgrade the live `reasoning` model row (one DB edit, measured by the evals). | `elaya-plan.md` Phase 0 |
| Write the Sia `wag_` database migrations (schema, partitions, indexes, RLS). Zero dependencies, can ship immediately. | `sia-whatsapp-plan.md` Phase W2 + section 3 |

### Step 2. The AWS foundation (the shared ground)

ECS Fargate cluster, the FastAPI skeleton, Bedrock access, S3 buckets (private for Sia media), CI/CD, health checks and alerts. Two service homes: the Python backend and the Baileys connector.

Detail: `elaya-plan.md` Phase 1 (first half) + `sia-whatsapp-plan.md` Phase W1.

### Step 3. The Python brain (AI track)

Port Elaya's runtime to Python using `docs/audits/2026-08-24-elaya-workflow.md` as the spec: principal, tools, PII gateway, confirmation protocol, brain loop. Build the router + specialists in directly (never port the 24-tools-in-one-prompt weakness). Run the SAME evals against old and new. Flip when equal or better. Old path stays one week as rollback.

Detail: `elaya-plan.md` Phase 1.

### Step 4. The Sia ear and eyes (Sia track, overlaps Step 3)

The Baileys connector (thin socket handler, raw-first writes, direct service-role Postgres, media download and decrypt with dead-letter, dual watchers) and the Sia UI in Serene (groups, chat viewer, search, health panel, the mapping tool). Ten pilot groups, two weeks of zero-loss proving.

Detail: `sia-whatsapp-plan.md` Phases W3 + W4, sections 8 and 10.

### Step 5. One write path in Python (AI track)

Port the mutation cores. Next.js server actions become thin callers of the Python API. From here, exactly one place in the company knows how to update a lead or a task, and the mobile app's API already exists.

Detail: `elaya-plan.md` Phase 2.

### Step 6. The serious capabilities (both tracks, parallel)

| Work | Detail lives in |
| --- | --- |
| Reports and long jobs: "send me last week's onboarding report" → real data → PDF on our template → WhatsApp. | `elaya-plan.md` Phase 3a |
| Proactive Elaya: agenda injection ("Advita wali report kal due hai") + scheduled nudges. | `elaya-plan.md` Phase 3b |
| Client profiling, concierge tickets, reviews, vendor profiling, staff monitoring, all fed by the Sia data. | `elaya-plan.md` Phase 3c + `sia-whatsapp-plan.md` Phase W5 |
| Full multilingual: Hindi, Marathi, Kannada, Urdu and more, in text, voice input, and the yes/no confirmation classifier. | `elaya-plan.md` Phase 3d |
| Embeddings over the chat history (pgvector, masked text only). | `sia-whatsapp-plan.md` section 10.5 |

### Step 7. Voice

Voice replies first (TTS on existing chat), then true realtime talk over WebSockets on the Python backend.

Detail: `elaya-plan.md` Phase 4.

### Step 8. The mobile app

React Native, iOS first, consuming the same Python API. Most features exist the day the shell is built, because of Step 5.

Detail: `elaya-plan.md` Phase 5.

### Step 9. Our own models

Distill small, fast, self-hosted models for the easy 70 percent (routing, simple tasks) from the interaction data the ledger has been collecting all along. Frontier model keeps the hard 30 percent. Only shipped when evals prove each one.

Detail: `elaya-plan.md` Phase 6.

---

## 5. The laws that never change

Short form; the full versions live in `elaya-plan.md` section 3 and `sia-whatsapp-plan.md` sections 6 to 10.

1. Permissions live in code, decided before any model runs. Nothing a model reads can widen access.
2. Big writes propose and wait for a human yes. The yes is classified by pure code.
3. One write path. One implementation of every mutation, everything calls it.
4. Raw first, append-only truth. Store before parsing; tag deletes, never remove.
5. Mask identity at every AI border (model calls AND embeddings), never mask intent. Full detail stays inside our fortress.
6. Evals before flips. Score up, ship. Score down, fix.
7. Sia and Gia never mix.

---

## 6. Status board

### Where each step stands on 2026-09-30

Checked against the code, the module docs and the changelog on 2026-09-30. The board below this
one is the original, kept exactly as it read on 2026-08-28.

| Step | Work | Where it stands |
| --- | --- | --- |
| 0 | Freeze and scan | Scan done (Appendix A). The freeze did not hold; see the note at the top. |
| 1a | Evals | Shipped 2026-08-27. About 60 cases today (35 core, 25 founder). "Last week" and the Marathi yes are still known failures. |
| 1b | Model upgrade | Shipped 2026-08-27 (reasoning on Sonnet 5), then three tiers: routing, reasoning, heavy (0176). |
| 1c | Sia `wag_` tables | Shipped 2026-08-27 (0169), moved into the `sia` schema (0172). |
| 2 | AWS foundation | Partly. Fargate, S3 and a CloudFront front are live. No Bedrock and no CI/CD pipeline: every deploy is run by hand (`docs/operations/deployment.md`). |
| 3 | Python brain | Shipped. WhatsApp flipped 2026-09-03, in-app 2026-09-04 (0179). The router and specialists came 2026-08-28; tool search replaced router gating 2026-09-24. The Node brain is the frozen rollback. |
| 4a | Baileys connector | Shipped 2026-08-27, on Fargate. WhatsApp banned the watcher number for about six and a half hours on 2026-09-29; the answer is `sia-resilience-plan.md` (0249, not applied yet). |
| 4b | Sia UI | Shipped 2026-08-27 (`/sia`), later scoped to each person's queendom. |
| 5 | One write path in Python | Dropped. Writes stay in the Node cores behind the bridge. |
| 6a | Reports, PDF, long jobs | Partly. Long jobs exist as the deep read (0235, in Node). No PDF. |
| 6b | Proactive Elaya | Partly. The twice-daily founder brief (on since 2026-09-19, 0225), repeat task reminders (0232), the alert sweep (0235, built, off) and Desks (0248, built, off). No agenda injection. |
| 6c | Profiling, tickets, reviews, vendors | Shipped, in Node: vendors (0183 on), the member twin and tickets (0194, 0195 on), the chat profiler (0215), vendor job reviews. See `member-ticket-plan.md`. |
| 6d | Full multilingual | Not started. Confirmation is English and Hinglish only; WhatsApp voice notes are fixed to Hinglish. |
| 6e | Embeddings | Not started. `member.member_chunks` exists (0194) but nothing writes to it. |
| 7 | Voice | Partly, in a different order: real-time calls first. The LiveKit channel was built 2026-09-28 (0247) and is not deployed to AWS yet. Spoken replies on chat and WhatsApp are not built. |
| 8 | Mobile app | Not started. The `/m` phone layer serves phones instead. |
| 9 | Our own models | Not started. |

### The original board, as of 2026-08-28

Update this as work completes. This is the living pulse of the plan.

| Step | Work | Status |
| --- | --- | --- |
| 0 | Freeze old backend, inventory scan | **done 2026-08-25** (Appendix A below; freeze active) |
| 1a | Eval harness + golden set + top bug fixes | **live 2026-08-27**: 30 cases, baseline ALL GREEN after the propose-protocol persona fix (first real bug caught + fixed); 2 known gaps tracked |
| 1b | Model row upgrade (measured) | **done 2026-08-27**: reasoning → Sonnet 5 (28/28 vs 27/28 baseline, ~33% cheaper per turn); fuzzy-gate hardened structurally along the way |
| 1c | Sia `wag_` migrations | **live 2026-08-27** (migration 0169): 9 tables, monthly partitions + DEFAULT nets, dedup wall + soft references smoke-verified in prod; contract in `sia-whatsapp-plan.md` §11 |
| 2 | AWS foundation (Fargate, FastAPI skeleton, Bedrock, S3, CI/CD) | **core live 2026-08-27**: Copilot app `serene`, env `prod` (ap-south-1) — service `api` (FastAPI skeleton, `/healthz` green, behind an ALB) and service `watcher` (Sia, below). S3 done with W1 (the sia-media bucket + a scoped `serene-sia-media-reader` IAM identity). Deploys = `cd backend && copilot svc deploy --name <svc> --env prod`. Remaining: Bedrock enablement (with Step 3), CI/CD pipeline |
| 3 | Python brain + router/specialists, eval-gated flip | **foundation live 2026-08-28**: FastAPI brain on the Fargate `api` service — router (Haiku classifies → specialist profile, code-validated) + 4 specialists (leads/tasks/analytics/general; analytics rides the new `heavy` tier), **three DB-driven model tiers** (migration 0176: routing=Haiku 4.5, reasoning=Sonnet 5, heavy=Opus 5 — switching = an UPDATE, no deploy), faithful ports of the PII gateway / confirmation classifier / principal resolver / single-dispatch tool gate, prompt-cached turn loop, `POST /v1/elaya/chat` SSE **wire-compatible with elaya-stream.ts** (the flip = a URL change). First 2 tools ported and proven live end-to-end. Remaining before the flip: the other 22 tools + writes + resolver, persona parity, persistence + caps, evals vs Python, WhatsApp channel |
| 4a | Baileys connector, pilot groups proving | **built + deployed + audit-hardened 2026-08-27**: `connector/` (Baileys 7.0, read-only, thin-handler, raw-first) proved on the real number (79k+ messages, 466 groups), moved to **AWS Fargate** with **media on S3**, then hardened per the full-pipeline audit ("Sia Watcher Audit" artifact): session identity in **Postgres** (`sia.wag_auth_state`, no EFS — Baileys' own prod guidance), crash-only lifecycle, loggedOut self-recovery, the **heartbeat alarm** (the watcher beats its own pulse every 60s — migration 0175; Trigger.dev classifies down / session-lost / unreachable / quiet-6h so night-time group silence never false-alarms), historical-media backfill (14.5k pending rows → done/expired), `connector/RUNBOOK.md` (ONE-RUNNER law, pairing, session SQL). Remaining: the ONE clean pairing (founder links when ready) + `npx trigger.dev deploy` for the alarm |
| 4b | Sia UI (groups, viewer, search, health, mapping) | **done 2026-08-27, polish shipped same day**: `/sia` is the WhatsApp-Web reading in Serene material — preview rail (migration 0173), live 4s tail with new-message pill, inline media (images, stickers, voice-note player, tap-to-load video, document download), reactions + quoted replies in-bubble, and the Sia console (gear with live status dot → health + full mapping manager). Sia lives in its own `sia` schema (0170–0173). Push transport + S3 media swap arrive with W1 |
| 5 | Mutation cores in Python, one write path | not started |
| 6a | Reports + PDF + long jobs | not started |
| 6b | Proactive Elaya | not started |
| 6c | Profiling, tickets, reviews, vendor + staff intelligence | not started |
| 6d | Full multilingual | not started |
| 6e | Embeddings (pgvector) | not started |
| 7 | Voice (TTS, then realtime) | not started |
| 8 | Mobile app (React Native) | not started |
| 9 | Distilled own models | not started |

---

## Appendix A. Backend Port Inventory (merged in from `port-inventory.md`, 2026-09-30)

> **What became of it (2026-09-30):** PY-3 partly happened: the brain loop, persona, PII masking,
> confirmation, the identity check, storage and 12 reads were ported, while the tool registries,
> the mutation cores, the memory reader, the customer brain and the Node provider layer stay in
> Node for good (Decision Log 2026-09-16). PY-5 was dropped for the bridge. PY-6 never started:
> jobs grew from 5 to 22 Trigger.dev tasks, all Node. BRIDGE is half done: the WhatsApp gate and
> the chat route call Python through `src/lib/elaya/python-brain.ts`. STAYS held, and grew. Of
> the "born in Python" list in section 6, only the voice worker is Python. The inventory below is
> kept exactly as scanned on 2026-08-25.
>
> **Purpose:** master-plan Step 0. The complete list of what the current Node backend does, and where each piece goes in the Python migration. This is the checklist Steps 3 and 5 port against.
> **Freeze:** as of 2026-08-25, no NEW feature lands in the old Node backend. Bug fixes only. New work waits for, or lands in, Python.
> **Scanned:** 2026-08-25 against the live tree. 30 action files, 44 services, 5 API routes, 5 Trigger.dev tasks.

---

### Destinations, defined

| Destination | Meaning |
| --- | --- |
| **PY-3** | Ports in master-plan Step 3 (the Python brain). Spec: `docs/audits/2026-08-24-elaya-workflow.md`. |
| **PY-5** | Ports in Step 5 (the one write path / business API). Next.js actions become thin callers. |
| **PY-6** | Moves during Step 6 era (jobs, pipelines) into Python workers. Keeps running on Trigger.dev until then. |
| **STAYS** | Stays in Next.js forever (frontend concern: auth session plumbing, display reads until their API exists, PWA manifest). |
| **BRIDGE** | Stays in Next.js during transition but its Elaya branch calls the Python service over internal HTTP at the Step 3 flip; fully moves at PY-5. |

---

### 1. The Elaya subsystem — PY-3 (the first port)

Everything under `src/lib/elaya/` plus its services. The full behavioral spec is `docs/audits/2026-08-24-elaya-workflow.md`; port to parity, evals gate the flip.

| Piece | Files |
| --- | --- |
| Provider contract + Anthropic adapter (→ Bedrock in Python) | `lib/elaya/provider.ts`, `adapters/anthropic.ts`, `registry.ts` |
| Principal, persona, PII gateway, confirmation classifier, access gate | `principal.ts`, `persona.ts`, `customer-persona.ts`, `pii.ts`, `confirmation.ts`, `access.ts` |
| Brains (staff + customer) + memory | `brain.ts`, `customer-brain.ts`, `memory.ts` |
| Tool registries (12 read + 12 write + 2 customer) + the data seam | `tools/registry.ts`, `tools/write-registry.ts`, `tools/customer-registry.ts`, `elaya-data.ts` |
| Elaya services | `elaya-service.ts`, `elaya-actions-service.ts`, `elaya-notes-service.ts`, `elaya-training-service.ts`, `elaya-whatsapp.ts`, `elaya-customer.ts`, `llm-providers-service.ts` |
| The SSE chat route | `app/api/elaya/chat/route.ts` → a FastAPI streaming endpoint; the Next.js route becomes a thin proxy (or the client points at the new URL) at flip time |

Note for the port: the brain calls mutation cores (lead/task writes). Until PY-5 lands, the Python brain reaches those writes through a minimal internal endpoint in front of the existing cores, OR the write cores port together with the brain — decide at Step 3 kickoff. Never two live implementations of a core.

### 2. Mutation cores + their services — PY-5 (the one write path)

| Area | Files (services) | Actions that become thin callers |
| --- | --- | --- |
| Lead writes | `lead-mutations.ts` (7 cores), `lead-cache.ts`, `lead-assignment-notify.ts`, `sla-service.ts` (arming side) | `actions/leads.ts` (15 fns), `actions/deals.ts` (3), `actions/revival.ts` (3) |
| Task writes | `task-mutations.ts` (7 cores + gates), `task-events.ts` | `actions/tasks.ts` (14 fns) |
| Lead ingestion | `lead-ingestion.ts`, `webhooks/leads/route.ts` | (webhook moves whole) |
| WhatsApp (Gia) sends + ingestion | `whatsapp-api.ts`, `whatsapp-ingestion.ts`, `whatsapp-media.ts`, `whatsapp-service.ts`, `webhooks/whatsapp/route.ts` | `actions/whatsapp.ts` (8) — BRIDGE at Step 3 (its Elaya gate calls Python), fully PY-5 |
| Notifications + push | `notifications-service.ts`, `notification-prefs-service.ts`, `push-service.ts` | `actions/notifications.ts`, `actions/notification-prefs.ts`, `actions/push.ts` |
| Profiles/admin writes | `profiles-service.ts` (write half), `agent-routing-service.ts` | `actions/profiles.ts` (8), `actions/agent-routing.ts` (2) |
| Config writes | `domain-targets-service.ts`, SLA policy writes | `actions/sla-policies.ts`, `actions/sla.ts` |
| Content writes | `intelligence-service.ts`, `ad-creatives-service.ts`, `ad-spend-service.ts`, `subscriptions-service.ts`, `suggestions-service.ts` | `actions/intelligence.ts`, `actions/ad-creatives.ts`, `actions/ad-spend.ts`, `actions/recharge.ts`, `actions/subscriptions.ts` |
| Elaya user-facing writes | (notes/training/persona services already listed in §1) | `actions/elaya-notes.ts`, `actions/elaya-training.ts`, `actions/elaya.ts` |
| Voice input | `transcription-service.ts` | `actions/transcription.ts` |

### 3. Read/display layer — STAYS until its Python API exists, migrates gradually with PY-5+

RSC pages + read actions that only fetch and shape for display: `dashboard-service.ts` + `actions/dashboard.ts` (7), `performance-service.ts` + `actions/performance.ts` (14), `deals-service.ts` / `leads-service.ts` (read halves), `tasks-service.ts` (reads), `oversight-service.ts`, `activity-service.ts`, `mobile-service.ts` + `actions/mobile.ts` (4), `usage-service.ts`, `actions/search.ts`, `cache-helpers.ts`, `rpc-helpers.ts`. These keep reading Supabase directly from Next.js until each domain's Python endpoint exists; no rush, no risk — reads cannot corrupt anything.

### 4. Jobs — PY-6 (keep on Trigger.dev until the Python workers land)

`src/trigger/`: `lead-sla.ts` (SLA timers), `task-reminders.ts`, `lead-revival.ts` (daily sweep + note-AI gate), `usage-rollup.ts`, `usage-snapshot.ts`. Plus `lib/trigger/cancel-runs.ts`. The revival gate's model call moves with the Elaya provider layer (PY-3) behind an internal endpoint if needed.

### 5. STAYS in Next.js forever

`app/api/auth/callback` (Supabase auth redirect), `app/api/manifest` (PWA icons), `proxy.ts` (session refresh for the web app), `lib/supabase/*` clients (the web app still reads), all `validations/` and `constants/` that the UI consumes (Python gets its own Pydantic mirrors where the API needs them), everything under `components/`, `hooks/`, `styles/`.

### 6. New, born in Python (never ported)

The Sia connector's downstream pipeline, client/vendor profiling, tickets, reports + PDF, proactive scheduler, voice service, embeddings — per `sia-whatsapp-plan.md` and `elaya-plan.md` Phase 3+. (The Baileys connector itself: Node, by decision 8.)
