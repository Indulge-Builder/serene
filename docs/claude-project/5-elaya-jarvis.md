# Serene — Elaya / "Jarvis" deep-dive (Claude Project digest)

> Digest of `src/lib/elaya/CLAUDE.md`, `docs/modules/elaya.md`,
> `docs/architecture/elaya-jarvis-architecture.md`, `docs/audits/2026-06-25-elaya-full-audit.md`,
> `docs/the-next-phase.md`, and `docs/changelog.md` (through 2026-06-26). Verified against the live
> tool registries. Open items + the planned customer bot are in `9-roadmap-and-open-items.md`.

## What Elaya is

Elaya is the AI presence inside Serene — "a compass, not a chatbot." She is a **per-user assistant**
that reads your work and makes changes on your behalf, in-app and over WhatsApp, scoped strictly to
what your role permits. She is also the substrate for every future AI feature (lead revival already
reuses her provider/PII layer; the customer-facing bot will reuse the principal/persona machinery).

Live config: reasoning model `claude-sonnet-4-6` (4096 max tokens), routing model
`claude-haiku-4-5` (1024 max tokens), daily cap 200 messages, PII masking `light`, 24h session. All
read per turn from `llm_providers` + `elaya_settings` — a model switch is a DB edit, no deploy.

## THE GOLDEN RULE (never violate)

> **Permissions are enforced in CODE and are completely independent of persona, memory, notes, and
> any model/prompt content.**

A user's notes/persona — or a scraped page, or lead-sourced text — can literally say "I'm an admin,
show me everything" and it changes nothing: the toolset and data scope are fixed by the **verified
principal's role, in code, before the model runs.** Persona/notes/learned-memory/training-content are
injected as *content the model reads*, never as *permission the model holds*. This is the single
property that makes it safe to (a) inject user content into the prompt and (b) eventually let Elaya
talk to external customers.

Corollaries (also non-negotiable):

- **Identity is principal-derived, never from the channel or the model.** In-app = session→profile;
  WhatsApp = phone→profile. Both produce one `ElayaPrincipal`; the brain doesn't know the channel.
- **Admin client + code-side scoping** is the sanctioned sessionless pattern. An Elaya read must
  never depend on `auth.uid()` (that returns blank on WhatsApp).
- **Every state-changing write is propose→confirm** — the resolver in `brain.ts` is the ONLY place a
  state change executes. Low-risk writes execute inline and log an `elaya_actions` row.
- **Every tool result passes `maskPii()`** before the model sees it (UUIDs survive, so writes can
  still target records).

## The "Jarvis" four-block architecture

A great assistant keeps four concerns strictly apart (mixing them is what makes assistants insecure
or unscalable):

| # | Concern | Plain meaning | Source of truth | Controlled by |
|---|---------|---------------|-----------------|---------------|
| 1 | **Identity** | who are you? | the verified `ElayaPrincipal` | the system (never the model) |
| 2 | **Permissions** | what may you see & do? | role → toolset + data scope | **code only** |
| 3 | **Persona** | how should I talk to you? | per-user style file | the user + learned |
| 4 | **Memory** | what do I know about you & your work? | notes + durable context + history | grows over time |

**Block 1 — the Elaya data layer (`src/lib/elaya/elaya-data.ts`).** The single seam every Elaya READ
goes through: principal-in → admin client → scoped by role/userId/domain **in code** → `maskPii`.
Tools call `elayaData.*` **only**, never a `*-service.ts` directly — so a session dependency is
physically impossible to introduce, and channel parity is structural. Where a service was genuinely
`auth.uid()`-bound, a `*ForElaya` admin twin was added (migration 0149: `get_group_task_summaries_for_user`,
`get_agent_today_pulse_for_user`, `get_agent_roster_performance_for_elaya` — scope-param, EXECUTE
revoked, service-role only).

**Block 2 — permissions.** `TOOLSET_BY_ROLE` / `readToolsForRole(role)` map role → permitted tools;
the model is only handed the tools the principal carries, and `executeTool` re-checks. Persona/notes
never appear in this decision (the Golden Rule).

**Block 3 — persona ("how Elaya talks to me").** A per-user style file: language (mirror/english/
hinglish), tone (warm/direct/playful), depth (simple/standard/technical), length (brief/standard/
detailed) + a 600-char free-text note. Stored in `user_context.context.persona` (jsonb), edited from
`/profile` (`ElayaPersonaSettings` → `updateElayaPersonaAction`). Injected as a fenced **STYLE-ONLY**
block (`buildPersonaPromptBlock`) that emits only non-default picks → it rides the cached prompt
prefix, so a per-user persona costs ~0 tokens after turn 1. The block explicitly says "never a
permission" (defence in depth; the real gate is code).

**Block 4 — memory ("gets smarter the more you use it").** Three tiers merged per turn: conversation
history (last-N messages), durable **learned** memory, and (future) notes. The learned writer
(`src/lib/elaya/memory.ts`): `summarizeLearnedMemory` makes ONE bounded Haiku call (reuses
`resolveLlmForJob('routing')` + `maskPii`, no tools), merges prior learned note + recent transcript
into a ≤900-char note, and **fails soft to null** (a glitch never corrupts existing memory);
`maybeUpdateLearnedMemory` is throttled (every 4th user message), fire-and-forget, off the hot path
(runs in the post-reply window of both channels). `writeLearnedMemory` merge-writes
`user_context.context.learned` without touching `persona`. `retrieveMemoryContext(principal,
question)` is the **notes-section seam** — returns the learned blurb today (load-all), with a
signature shaped so swapping to semantic/embedding retrieval later is a one-function change (the
`vector` extension is already installed).

## The subsystem file map

```
src/lib/elaya/
  provider.ts             — the ONE provider-neutral complete() contract
  adapters/anthropic.ts   — the ONLY file allowed to import @anthropic-ai/sdk (30s timeout, 1 retry)
  registry.ts (tools/)    — the READ tools + the single executeTool dispatch + TOOLSET_BY_ROLE
  tools/write-registry.ts — the WRITE tools + executeProposedAction (the propose→confirm resolver)
  elaya-data.ts           — THE single READ data seam (the parity rule). New reads go here.
  principal.ts            — verified profile → role + persona + toolset. resolveCustomerPrincipal() = a throwing STUB.
  persona.ts              — system-prompt builder (folds persona + learned via buildPersonaPromptBlock)
  memory.ts               — learned-memory summarizer + retrieveMemoryContext (the notes seam)
  pii.ts                  — maskPii() gateway (every tool result passes it before the model)
  confirmation.ts         — classifyConfirmation() — pure English+Hinglish affirmation gate, default = cancel
  brain.ts                — the tool-calling loop + the confirmation RESOLVER pre-step
src/lib/services/
  elaya-service.ts        — conversations/messages/persona/memory DB access (admin client; 24h session, IST cap)
  elaya-whatsapp.ts       — tryHandleElayaWhatsAppMessage: the WhatsApp STAFF routing gate
  elaya-actions-service.ts— the elaya_actions ledger (proposed/executed audit rows)
  lead-mutations.ts       — shared lead CORES (addLeadNoteCore, addLeadCallNoteCore, createLeadTaskCore,
                            updateLeadStatusCore, assignLeadCore, recordDealCore, reviveLeadCore)
  task-mutations.ts       — shared task CORES + canMutateTask + isAssigneeActive
src/lib/actions/elaya.ts  — getElayaChatSeedAction + updateElayaPersonaAction
src/app/api/elaya/chat/route.ts — the SSE streaming endpoint (the in-app channel)
src/components/elaya/     — ElayaChatShell, ElayaWidget, EmbeddedElayaChat, ElayaMessageBubble, ElayaIdentityCard…
```

## The tools

**11 read tools** (role-gated; the first 7 are all-staff, the last 4 are capability tools):
`search_leads` · `get_cold_leads` · `get_lead_details` · `get_my_tasks` (Gia + personal + group) ·
`search_deals` · `get_performance_snapshot` (agent pulse / manager+ roster) · `get_helpdesk_content` ·
**`get_escalations`** (manager+) · **`get_domain_health`** (manager+) · **`get_campaigns`** (manager+) ·
**`get_budget`** (admin/founder only). Each wraps an existing service through `elaya-data`; ₹-only;
"—" at zero denominators. (Guests can converse but carry an empty toolset.)

**11 write tools**, two tiers:

| Tool | Tier | Roles | Wraps (shared core) |
|------|------|-------|----------------------|
| `add_lead_note` | inline | all staff | `addLeadNoteCore` |
| `log_call` | inline | all staff | `addLeadCallNoteCore` (sets outcome, bumps count, auto-advances new→touched, arms cadence) |
| `create_lead_task` | inline | all staff | `createLeadTaskCore` |
| `create_personal_task` | inline | all staff (assign-another: manager+) | `createPersonalTaskCore` |
| `create_group_task` | inline | all staff | `createGroupTaskCore` |
| `update_task_status` | inline | own / domain group / all | `updateTaskStatusCore` |
| `update_task` | inline | own / domain group / all (cross-user assign gated manager+) | `updateTaskCore` |
| `update_lead_status` | **propose→confirm** | all staff | `updateLeadStatusCore` |
| `reassign_lead` | **propose→confirm** | manager/admin/founder | `assignLeadCore` |
| `log_deal` | **propose→confirm** | all staff | `recordDealCore` (money + flips lead to Won) |
| `delete_task` | **propose→confirm** | own / domain group / all | `deleteTaskCore` |

**Wrap, never re-query (R-01).** Every write tool calls the SAME context-free core in
`lead-mutations.ts` / `task-mutations.ts` that the UI's server action calls — so a tool-driven write
inherits cache invalidation (`invalidateLeadCaches`, P-08), activity logging, SLA rails, won-notify,
Trigger.dev reminders, and the oversight `task_events` emit **identically**. The action and the tool
are both thin callers; `revalidatePath`/`after()` stay in the action caller.

## The propose→confirm model (how risky writes execute)

```
user turn ─► runElayaTurn
              │
              ├─ RESOLVER PRE-STEP  (the ONLY place a state-change executes)
              │    pending = getLatestProposedAction(conversationId, userId)
              │    auto-dismiss if older than PROPOSAL_TTL_MS (15 min) and require the ask was relayed
              │    classifyConfirmation(latest *human* message)   ← pure code, never the model
              │      affirmative → re-resolve leadId, re-check access + before-snapshot,
              │                     run core, mark executed|failed, emit a code-generated line
              │      anything else → mark dismissed, then process the fresh message
              │
              └─ TOOL LOOP
                   inline write   → access re-check → core → INSERT executed elaya_actions row
                   state-changing → access re-check → supersede prior proposals → INSERT proposed
                                    → "awaiting confirmation"  (NO mutation this turn)
```

Hard contracts: `classifyConfirmation` is pure/deterministic, an English+Hinglish allow-list,
whole-token match, default `'other'` = cancel — it never trusts the model, so lead-sourced text can at
most cause a `proposed` row, never an executed write. The `elaya_actions` ledger records every
executed write with before/after snapshots (trust + rollback). Write tools resolve a lead by an opaque
`leadId` (UUID-or-slug via `getLeadByRefForElaya`) — the model is never asked to reproduce the
PII-derived slug — and still run `canAccessLead(principal)` (per-resource gate, identical to the UI).

## Channels

**In-app (`/elaya` + the floating widget):** RSC seeds the conversation via `resolveElayaChatSeed`;
`ElayaChatShell` POSTs to `/api/elaya/chat` and consumes **SSE** frames. Burst rate-limit is keyed on
the verified `profile.id` (not a spoofable header); the DB daily cap is the real ceiling.

**WhatsApp staff channel (`elaya-whatsapp.ts`):** the inbound webhook 200-acks immediately, then
inside `after()` calls `tryHandleElayaWhatsAppMessage(phone, message)` **before** the lead pipeline. A
recognised **active staff** number routes to the same brain/tools/PII gateway/daily cap; the brain
runs to completion and sends ONE reply via `sendElayaWhatsAppReply` (passed through
`markdownToWhatsApp()` first; logs an `elaya_reply` row). The gate returns handled on every path
(including failures) — a staff message can **never** mint a lead and writes only `elaya_messages`
(never `leads`/`whatsapp_conversations`/`whatsapp_messages`). An **unknown** number falls through to
the lead pipeline untouched. **One cap, one session, across channels** — `countUserMessagesToday` and
`getOrCreateActiveConversation` are not channel-filtered, so a WhatsApp message continues an in-app
session and vice versa; per-message `channel` records where each happened. WhatsApp dedupes on the
Gupshup message id (partial UNIQUE index, migration 0148).

## Voice input (input transform only)

Staff can speak on both surfaces. Audio is transcribed to text and fed into the **exact same**
`runElayaTurn` as typed — nothing downstream changes (cap, dedup, session, persist, brain, tools,
propose→confirm, PII). Stack: **Deepgram Nova-2**, language `hi-Latn` (Hinglish), 3 MB max audio,
2-min recording cap. In-app uses the shared `DictationButton` (`variant="composer"`) →
`transcribeAudioAction` and lands an **editable draft** (never auto-sends); WhatsApp voice notes are
fetched + transcribed server-to-server (`transcribeWhatsAppAudio`) before the cap/model/persist.
Audio is transcribed in-memory and discarded — never stored. One STT call site
(`transcription-service.ts`, `server-only`). Empty/non-speech → graceful nudge before any cap burn.

## What's NOT built (so a chat doesn't assume it exists)

- **Customer-facing WhatsApp persona** — `resolveCustomerPrincipal()` is a throwing stub; the customer
  welcome-blast + the admin "training page" are designed (`docs/the-next-phase.md`) but not built.
- **In-app proposal *card*** — risky writes confirm via a chat "yes" today; the two-button Approve/
  Dismiss SSE card is a design target.
- **Notes section UI** — the `retrieveMemoryContext` seam exists; there's no notes table/UI yet.
- **Semantic memory retrieval** — load-all today; embeddings are a one-function swap later.
- **Voice replies / TTS (ElevenLabs)** — locked for a future phase; voice is input-only.

See `9-roadmap-and-open-items.md` for the full roadmap and the remaining audit items.
