# THE NEXT PHASE — Elaya handoff prompt (paste this into a fresh Claude Code session)

> **How to use this file:** paste it verbatim as your first message in a new Claude Code session on
> the `serene` repo. It carries the full context, vision, and exact next work from the previous
> session (which ran out of context). Read the "Mandatory first steps" before writing any code.

---

## 0. Who you are / what this project is

You are continuing work on **Serene** — a luxury internal operating system for the **Indulge** team
(a luxury concierge / sales company). Stack: **Next.js 16 (App Router) + Supabase (Postgres + RLS) +
TypeScript + Trigger.dev + Upstash Redis + Gupshup (WhatsApp BSP) + Anthropic (Claude)**. Package
manager is **pnpm**. The DB has **two Supabase projects** — work against **`xmucqqhbupudnzderchy`
(name: "Serene")** via the Supabase MCP tools.

**Elaya** is the AI presence inside Serene — "a compass, not a chatbot." Over the previous session we
built her up massively. This file is the handoff for the **next two features**:

1. **`log_deal`** — let Elaya record a won deal (the agent's close, via chat). *(Smaller, do first.)*
2. **The customer WhatsApp welcome-blast + a training page** — when a NEW number messages Indulge
   (a fresh lead), Elaya welcomes them like a world-class, psychology-trained salesperson: intro to
   the company, brochures, work examples, testimonials, reviews, podcast — a warm, human,
   conversational "blast" of messages. Plus an admin **training page** where staff upload the
   videos / URLs / images / docs Elaya draws from. *(Bigger, do second.)*
3. **Then** (the phase after): the **Notes section** (already has a built seam — see §6).

**The mandate the founder gave, verbatim in spirit:** *"build her like a pro salesperson who is NOT
salesy, who is trained on the psychology of people, who knows what services we provide. She welcomes
a new lead, introduces the company, sends brochures, work examples, testimonials, reviews, podcast —
each thing around the company — as a blast of messages, conversational, human-like. We need a page
where we train her: upload videos, URLs, images that she sends to potential customers. After this,
the notes section."**

---

## 1. MANDATORY first steps (before any code)

1. Read these authority files (they are the law):
   - `CLAUDE.md` (root) — the 12 rules, the Never-Do list, file locations, Pattern Notes.
   - `src/lib/elaya/CLAUDE.md` — the Elaya subsystem command layer (read this fully — it documents
     everything below).
   - `src/lib/CLAUDE.md`, `src/lib/actions/CLAUDE.md`, `src/lib/services/CLAUDE.md`,
     `src/components/CLAUDE.md`, `supabase/migrations/CLAUDE.md`, `src/app/CLAUDE.md`.
   - `docs/architecture/elaya-jarvis-architecture.md` — the 4-block "Jarvis" architecture + the
     Golden Rule (see §3 here).
   - `docs/audits/2026-06-25-elaya-full-audit.md` — current Elaya health + the remaining open Low items.
   - `docs/changelog.md` — top entries are this session's work; **every change needs a changelog entry
     (Rule 12).**
2. This repo has a **graphify knowledge graph** at `graphify-out/`. For codebase questions run
   `graphify query "<question>"` (scoped subgraph) before grepping. After substantive code changes,
   run `graphify update .`.
3. **Reuse First (R-01..R-04, The_Rules.md §0):** search for an existing util/service/component/
   constant by BEHAVIOUR before building. Never duplicate. The Elaya data layer + cores below already
   exist — extend them.
4. **Verify against the live DB, not memory.** Use the Supabase MCP (`execute_sql` /
   `apply_migration`) on project `xmucqqhbupudnzderchy`. Migrations are applied via MCP
   `apply_migration` AND saved as a file in `supabase/migrations/`. Verify after applying.
5. `npx tsc --noEmit` must be clean before you call anything done. There is no `lint` script; tsc is
   the gate.
6. **Commit only when the user asks.** End commit messages with the Co-Authored-By trailer the
   harness specifies.

---

## 2. WHAT WAS BUILT THIS SESSION (so you don't redo it)

All of the following is **done, committed (commits "before jarvis" / "before jarviss") OR in the
working tree, and typecheck-clean.** Live-on-prod items are flagged.

### 2a. Bug fixes (the original trigger — "Savio couldn't find a lead")
- **Root cause found:** the lead Savio asked about was assigned to *another* agent (Pawani), and
  agents can only act on their own leads — Elaya was correct. But the dig surfaced real bugs.
- **Slug generator bug (FIXED, LIVE on prod):** `generate_lead_slug` stripped every uppercase letter
  (`Akhil`→`khil`) because it ran the char-class strip before `lower()`. 90% of slugs were corrupted.
  **Migration `20260625000147_fix_lead_slug_uppercase_strip.sql`** — fixed regex + regenerated all
  ~5,219 slugs. Applied + verified.
- **Elaya lead handle:** write tools now take a `leadId` (UUID-or-slug) via `getLeadByRefForElaya`
  (no longer forces the model to reproduce the PII-derived slug). `search_leads` surfaces `leadId` +
  an `ownedByTeammate` owner-hint (names the owner when an agent's search finds a teammate's lead).

### 2b. Elaya full audit (the doc: `docs/audits/2026-06-25-elaya-full-audit.md`)
A 12-dimension multi-agent audit, adversarially verified. Then fixed, across two batches + a polish
batch:
- **High:** WhatsApp blank tools (sessionless), `search_leads` page-as-total counts, stale-proposal
  execution, `delivered:true` on failed Gupshup sends, missing call-log tool. **All fixed.**
- **Medium:** iteration-ceiling/max_tokens truncation handling, mid-turn partial persist, adapter
  timeout, **WhatsApp dedup unique index (Migration `20260625000148_elaya_wa_message_dedup_unique.sql`,
  LIVE on prod)**, `update_task` authz parity, assignee-active check. **All fixed.**
- **`log_call` tool added** (the #1 agent action) — extracted `addLeadCallNoteCore` into
  `lead-mutations.ts`; the `add_lead_call_note` action delegates to it.
- **Low/nit polish batch (2026-06-26, in working tree):** reduced-motion on the breathing glyph,
  blank-bubble guard, aria-live transcript, tool-status labels for all tools, `searchTooShort`
  signal, `get_my_tasks` truncation note, helpdesk source-domain label, WhatsApp caption-as-text,
  voice-download timeout+cap, dedup-before-collision reorder, rate-limit keyed on `profile.id`,
  `create_lead_task` assignee disclosure.
- **Config change (LIVE on prod):** `llm_providers` reasoning `max_tokens` 2048→4096; `maxDuration`
  60→180s on `/api/elaya/chat` + the whatsapp webhook route.

### 2c. The "Jarvis" foundation — Phases 1–4 (the big build)
The architecture doc is `docs/architecture/elaya-jarvis-architecture.md`. The skeleton is COMPLETE.

- **Phase 1 — Data layer + channel parity.** `src/lib/elaya/elaya-data.ts` is THE single seam every
  Elaya READ goes through: principal-in → **admin client** → scoped-by-role-in-code → both channels
  work identically. Tools call `elayaData.*` ONLY, never a `*-service.ts` directly. Three
  `auth.uid()`-bound RPCs got explicit-param admin twins: **Migration
  `20260625000149_elaya_sessionless_rpc_twins.sql` (LIVE on prod)** —
  `get_group_task_summaries_for_user`, `get_agent_today_pulse_for_user`,
  `get_agent_roster_performance_for_elaya` (Q-13 revoked tier, service-role only). **The parity rule
  is written into `src/lib/elaya/CLAUDE.md` — obey it.**
- **Phase 2 — Per-user persona.** `src/lib/constants/elaya-persona.ts` (language/tone/depth/length +
  600-char note), `src/lib/validations/elaya-persona-schema.ts`, `updateElayaPersonaAction` in
  `src/lib/actions/elaya.ts`, `ElayaPersonaSettings` on `/profile`. Stored in
  `user_context.context.persona` (jsonb). Injected as a fenced **STYLE-ONLY** block via
  `buildPersonaPromptBlock`. No migration (reuses `user_context`).
- **Phase 3 — Durable memory.** `src/lib/elaya/memory.ts` — `summarizeLearnedMemory` (bounded Haiku
  call, reuses `resolveLlmForJob('routing')` + `maskPii`, fails soft), `maybeUpdateLearnedMemory`
  (throttled every 4th user message, fire-and-forget, called by the SSE route + WhatsApp gate after
  the reply), `retrieveMemoryContext` (THE notes-section seam — load-all today, embedding-ready).
  `writeLearnedMemory` in elaya-service merge-writes `user_context.context.learned` without touching
  `persona`. No migration.
- **Phase 4 — Capability tools (role-gated reads).** `ElayaTool` gained a `roles` field;
  `readToolsForRole` gates reads. Added: `get_escalations` / `get_domain_health` / `get_campaigns`
  (manager+) and `get_budget` (admin/founder). All wrap existing services through `elaya-data`. No
  migration. **Deferred:** `get_usage` (its `getAgentUsage` is session-bound — needs a sessionless
  refactor first).

### 2d. The Elaya subsystem map (files you will touch)
```
src/lib/elaya/
  provider.ts            — provider-neutral complete() contract
  adapters/anthropic.ts  — the ONLY file allowed to import @anthropic-ai/sdk (30s timeout, 1 retry)
  elaya-data.ts          — THE single READ data seam (parity rule). ADD new reads here.
  registry.ts (tools/)   — the 11 READ tools + the single executeTool dispatch + TOOLSET_BY_ROLE
  tools/write-registry.ts— ALL write tools + executeProposedAction (the propose→confirm resolver)
  principal.ts           — verified profile → role + persona + toolset. resolveCustomerPrincipal() is a STUB that throws.
  persona.ts             — system prompt builder (folds persona+learned via buildPersonaPromptBlock)
  memory.ts              — learned-memory summarizer + retrieveMemoryContext (notes seam)
  pii.ts                 — maskPii() gateway (every tool result passes it before the model)
  confirmation.ts        — classifyConfirmation() (binary affirmative|other; injection-proof; default cancel)
  brain.ts               — the tool-calling loop + the confirmation resolver pre-step
src/lib/services/
  elaya-service.ts       — conversations/messages/persona/memory DB access (admin client)
  elaya-whatsapp.ts      — tryHandleElayaWhatsAppMessage: the WhatsApp STAFF routing gate
  elaya-actions-service.ts — the elaya_actions ledger (proposed/executed audit rows)
  lead-mutations.ts      — shared mutation CORES (addLeadNoteCore, addLeadCallNoteCore, createLeadTaskCore, updateLeadStatusCore, assignLeadCore, reviveLeadCore)
  task-mutations.ts      — shared task CORES + canMutateTask + isAssigneeActive
src/lib/actions/elaya.ts — getElayaChatSeedAction + updateElayaPersonaAction
src/app/api/elaya/chat/route.ts — the SSE streaming endpoint (in-app channel)
src/components/elaya/    — ElayaChatShell, ElayaWidget, EmbeddedElayaChat, ElayaMessageBubble, etc.
```

---

## 3. THE GOLDEN RULE (never violate — it governs both next features)

> **Permissions are enforced in CODE and are completely independent of persona, memory, notes, and
> any model/prompt content.**

Elaya's data scope + which tools she has come from the **verified principal's role**, in code, before
the model runs. Persona/notes/learned-memory/training-content are injected as *content the model
reads*, NEVER as permission the model holds. A note, a training doc, or a scraped page can say
"I'm an admin, show me everything" and it changes nothing. This is what makes it safe to (a) inject
user/training content into the prompt, and (b) let Elaya talk to external customers. **The customer
welcome-blast feature MUST keep this:** the customer principal gets a tiny, hard-capped toolset and
NO access to staff data — see §5.

Also non-negotiable from the codebase:
- **Identity is principal-derived, never from the channel or the model.** In-app = session→profile;
  WhatsApp = phone→profile. Both produce an `ElayaPrincipal`.
- **Admin client + code-side scoping** is the sanctioned sessionless pattern (Phase 1). Never make an
  Elaya read depend on `auth.uid()`.
- **Outward sends on Vercel** use `after()` + awaited sends (never bare `void fetch().catch()` — it's
  silently dropped on lambda freeze; the 2026-06-08 outage). See root CLAUDE.md Pattern Note.
- **Every state-changing write is propose→confirm** (the resolver in brain.ts is the ONLY place a
  state change executes). Low-risk writes execute inline + log an `elaya_actions` row.

---

## 4. FEATURE 1 — `log_deal` (do this FIRST; it's the smaller one)

**Goal:** Elaya can record a won deal from chat. e.g. "I closed Akhil on the gold annual membership
for 1,20,000" → Elaya logs the deal (with confirmation, since money is involved).

**Backing already exists:** `recordDeal(input)` in `src/lib/actions/deals.ts` (Zod
`RecordDealSchema`, `requireProfile` + per-lead `hasAccess`, admin client, **`deal_type` is DERIVED
from the lead's domain via `DOMAIN_DEAL_CONFIG`** in `src/lib/constants/deal-types.ts` — never
client-supplied). The deals table + RLS are migration 0072–0074 / 0122 (no INSERT RLS — writes are
service-role; the action is the trust boundary).

**The R-01 step:** `recordDeal` the action is session-based. Elaya is sessionless on WhatsApp, so —
exactly like the lead writes — **extract a `recordDealCore` into `lead-mutations.ts`** (or a new
`deal-mutations.ts` if cleaner) that takes a principal-derived `MutationActor` + the deal fields,
does the domain→type derivation + the deals insert + any side-effects, and have BOTH the `recordDeal`
action AND the new Elaya tool call that one core. Do NOT duplicate the insert logic.

**Tiering:** recording a deal is money + a real record → make it **propose→confirm** (a STATE_CHANGING
write in `write-registry.ts`, like `update_lead_status`). The model proposes "log a {type} deal for
{lead} at ₹{amount}?", the user confirms "yes", the resolver (`executeProposedAction`) executes it.
Add the `action_type` `'log_deal'` to `ElayaActionType` in `elaya-actions-service.ts` (no DB CHECK on
that column — verified — so no migration for the action_type).

**Tool shape (`log_deal` in write-registry.ts):**
- roles: all staff (an agent logs their own deal).
- input: `leadId` (UUID-or-slug), `amount` (number, INR), optional `durationMonths` (membership),
  optional `category` (retail), optional `note`.
- run(): `getLeadByRefForElaya(leadId)` → `canAccessLead` → derive type from `lead.domain`
  (`dealTypeForDomain`) → validate (retail needs category, membership needs duration — see
  `DOMAIN_DEAL_CONFIG` + the migration-0122 CHECKs) → propose (insertProposedAction with the
  before/after snapshot) → resolver calls `recordDealCore`.
- ₹ only; never convert currency (persona already enforces this).
- Add it to the persona prompt's "What you can change" list + `TOOL_STATUS_LABELS` in
  `ElayaChatShell.tsx` + the Elaya CLAUDE.md write-tool table (it's currently "10 write tools" → 11).

**Done = tool works, propose→confirm, both channels (it's principal-scoped), typecheck clean,
changelog entry.**

---

## 5. FEATURE 2 — Customer WhatsApp welcome-blast + training page (the BIG one)

**This is a new outward-facing surface — Elaya talking to CUSTOMERS, not staff.** It is the
"customer persona" that `resolveCustomerPrincipal()` currently stubs (throws). Treat it as its own
mini-architecture. Recommend you **write a short design doc first** (`docs/modules/` or extend the
jarvis doc) and get the founder's sign-off on the flow before building, because it's outward-facing
and higher-risk.

### 5a. The vision (what the founder wants)
When a **brand-new number** (an unknown person = a fresh lead) messages Indulge on WhatsApp, Elaya:
- **Welcomes them warmly + introduces the company** (who Indulge is, what concierge services they
  provide).
- **Sends a "blast" of value** — brochures (PDF/images), work examples, testimonials, reviews, the
  podcast, etc. — conversationally, spaced like a human, NOT a dump.
- **Behaves like a world-class salesperson who is NOT salesy** — trained on sales psychology, warm,
  human, reads the person, answers questions, knows the services cold.
- It's a **conversation**, not a script — she adapts to what the lead says.

### 5b. The hard constraints (DO NOT skip these)
1. **WhatsApp 24h session window + templates.** You can only free-form message a user within 24h of
   THEIR last message. The FIRST outbound to a brand-new number (or after 24h silence) MUST be an
   approved Gupshup **template** (`sendGupshupTemplate` / the template senders in `whatsapp-api.ts`).
   The conversational blast can follow once they've replied (session open). **Design the welcome flow
   around this** — you cannot just blast a cold number with 8 free-form messages. (Confirm the
   current approved templates with the founder; a new "welcome" template likely needs creating +
   Gupshup approval — that's an external, founder-side step.)
2. **The Golden Rule for the customer persona:** `resolveCustomerPrincipal` must return a principal
   with **persona: 'customer'**, **NO staff toolset** (no search_leads, no writes, nothing that
   touches staff/CRM data), and a tiny capability set limited to: send the prepared company material,
   answer questions from a **curated knowledge base** (the training content + a company-facts blob),
   and maybe capture interest. A customer must NEVER be able to read leads, deals, tasks, other
   customers, or any internal data. Gate this in CODE (the toolset), never the prompt.
3. **The routing fork.** Today `src/app/api/webhooks/whatsapp/route.ts` does:
   `tryHandleElayaWhatsAppMessage(phone, message)` → if the phone matches an **active staff profile**,
   the STAFF Elaya handles it; else `processInboundMessage` runs the **lead pipeline**
   (`createLeadFromWhatsApp` mints a lead for an unknown number). The customer-Elaya hook goes in the
   **else branch** — a new number is a lead, and that's where the welcome-blast should trigger
   (likely inside / right after `processInboundMessage`'s new-lead path in
   `src/lib/services/whatsapp-ingestion.ts`, wrapped in `after()`). Keep the staff gate FIRST and
   untouched.
4. **Spam / re-trigger guard.** The welcome-blast fires ONCE per lead (not on every message). Track
   "welcomed" state (a column/flag on the lead, or an `elaya_*` row). Idempotent — a redelivery or a
   second message must not re-blast.
5. **Don't break the lead pipeline.** A new number must still become a lead, get round-robin
   assigned, fire the founder/agent notifications, etc. The customer-Elaya layer is ADDITIVE on top —
   it must never skip lead creation (mirror how the staff gate "never mints a lead", but inverted:
   here we DO want the lead + the welcome).
6. **PII / safety:** customer-facing replies still pass through the same model safety; the curated
   knowledge base is the ONLY source of company facts (never let the model invent services/prices).
   Money is ₹ only.

### 5c. The training page (admin) — "where we train her"
Staff (admin/founder, maybe manager) upload the material Elaya draws from: **videos, image/PDF
brochures, URLs (reviews, podcast, work examples), testimonials, and text facts about the company /
services.**

- **Closest precedent to copy (R-01):** the **ad-creatives** admin feature —
  `src/components/admin/AdCreativesManager.tsx` + `AdCreativeFormModal.tsx`,
  `src/lib/actions/ad-creatives.ts`, `src/lib/services/ad-creatives-service.ts`, and the
  `ad-creatives` storage bucket (migrations 0012 / 0058 / 0092). It already does upload-to-bucket +
  manage rows + RLS-gated writes. Build the training page the same way.
- **New table** (write a migration, follow `supabase/migrations/CLAUDE.md`): something like
  `elaya_training_assets` — `id`, `kind` (enum: `brochure`/`work_example`/`testimonial`/`review`/
  `podcast`/`image`/`video`/`doc`/`fact`/`url`), `title`, `description`, `url` (for links) OR
  `storage_path` (for uploaded media in a new private/public bucket — decide based on whether the
  asset is sent to customers, in which case Gupshup needs a publicly-fetchable URL, like
  `sendGupshupMediaMessage` requires), `tags`, `domain` (which Gia domain it's for, or all),
  `send_order` (for the blast sequence), `active`, audit cols. **RLS enabled** (admin/founder write;
  read for the send path via admin client). + a "company facts / persona brief" text blob the
  customer persona's system prompt is built from.
- **A new admin route** `(dashboard)/admin/elaya-training` (or similar) + a manager/founder gate +
  the upload UI + a `lib/actions/elaya-training.ts` + `lib/services/elaya-training-service.ts`.
- Gupshup media send is **by URL** (`sendGupshupMediaMessage(to, type, url, caption?, filename?)`) —
  the caller passes a signed/public URL. For customer sends, the asset URL must be publicly fetchable
  by Gupshup for the send duration (mirror how ad-creatives are public, or sign like
  `whatsapp-media.ts` does).

### 5d. Suggested build order for Feature 2 (each its own reviewable step)
1. **Design doc + founder sign-off** on the flow + the template story (the 24h-window reality).
2. **Training data model + admin page** (the ad-creatives clone) — staff can upload/manage assets +
   write the company-facts brief. (Useful on its own, lowest risk.)
3. **The customer principal + persona** — `resolveCustomerPrincipal` returns a real customer
   principal with a hard-capped toolset (send-material + answer-from-KB only); a customer system
   prompt built from the company-facts brief + training KB; the Golden Rule enforced in code.
4. **The welcome-blast orchestrator** — fires once per new lead, template-first then conversational,
   pulls assets in `send_order`, spaced/humanized, all via `after()` + awaited sends + the
   one-log-row-per-send contract. Idempotent.
5. **The ongoing customer conversation** — subsequent customer messages route to the customer Elaya
   (answer from KB, stay in persona), within the 24h window.

---

## 6. FEATURE 3 (the phase AFTER feature 2) — the Notes section

The seam is ALREADY built: `retrieveMemoryContext(principal, question)` in `src/lib/elaya/memory.ts`
returns `{ learned, notes }` (notes is `[]` today). Phase: build the staff **Notes UI** (where a user
writes free-form notes about their work/life), a `notes` table + actions/service, and wire notes into
`retrieveMemoryContext` so Elaya reads them per turn. At scale, swap the load-all retrieval to
**semantic search (embeddings)** — the `vector` extension is ALREADY installed (migration 0110). The
retrieval signature is designed so this is a one-function change. **Do this only after Feature 2.**

---

## 7. House rules recap (the ones easy to forget)

- **R-01 Reuse First** — extract a shared core, don't duplicate (recordDealCore; the ad-creatives
  clone). Search by behaviour first.
- **Rule 12** — every meaningful change gets a `docs/changelog.md` entry (top of file, reverse-chron).
- **Migrations** — new table → `ALTER TABLE x ENABLE ROW LEVEL SECURITY`; SECURITY DEFINER →
  `SET search_path = public`; scope-param RPC → REVOKE from authenticated + admin-client only (Q-13);
  apply via MCP `apply_migration` + save the file + verify + add to the migration inventory.
- **tsc clean** before "done". Commit only when asked.
- **Tokens/cost:** the learned-memory + persona ride the cached prompt prefix — keep injected blobs
  bounded. The summarizer is throttled (every 4th msg). Don't add per-turn model calls without a
  throttle.
- **The audit doc** (`docs/audits/2026-06-25-elaya-full-audit.md`) — when you fix one of its remaining
  Low items, DELETE it from the doc (don't annotate "resolved"), per the founder's preference.

---

## 8. First message to send back to the founder in the new session

Confirm you've read the handoff + the authority files, then propose starting with **`log_deal`**
(small, self-contained), and for the **customer welcome-blast** propose writing the design doc +
flagging the WhatsApp-template/24h-window reality FIRST (it shapes the whole flow and needs a
founder-side Gupshup template-approval step). Ask the founder to confirm priority order and whether
they want the design doc before code on Feature 2.
