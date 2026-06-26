# Elaya

> **Purpose:** the AI presence inside Serene — chat surface today, the substrate for every future AI feature (lead revival, reports, agentic writes, customer bot).
> **Audience:** engineers. · **Source-of-truth scope:** Elaya architecture + phase contracts.
> **Last verified:** 2026-06-26 (migrations 0116–0121 + the "Jarvis" build: 0148 WhatsApp dedup index, 0149 sessionless RPC twins) · **Status:** Foundation chat + WhatsApp staff channel + **Phase 2 lead agentic writes (E3)** + **Phase 3 task agentic writes** + **voice input (E4a)** + **"Jarvis" Phases 1–4** (channel-parity data layer · per-user persona · durable learned-memory · role-gated capability tools) + **`log_deal`**. Now **11 read tools** (role-gated) + **11 write tools**. The customer-facing persona is **designed, not built** (`customer-welcome-blast.md`; `resolveCustomerPrincipal()` still throws). See the **"Jarvis" build** section below — it is the current authority where it differs from the phase-history sections.

Historical note: this presence was tracked as both "Elaya" (the original design vision) and
"Elaya" (the roadmap name) before shipping; the canonical name is **Elaya** (matching the
presence card in `src/lib/constants/elaya.ts`). The old `elaya.md` / `elaya.md` module docs were
consolidated into this file during the Serene→Serene / Elaya→Elaya rename — the original design
vision lives in the "Design vision" section at the end of this doc.

## What shipped in the foundation (2026-06-12)

Read-only, in-app chat at `/elaya` (all roles), built so later phases plug in without rework.
Full implementation record: `docs/changelog.md` (2026-06-12 Elaya foundation entry).

### Architecture

```text
/elaya page (RSC seed) ──► ElayaChatShell ──► POST /api/elaya/chat (SSE)
                                                   │  auth → burst limit → Zod → DAILY CAP (all server-side)
                                                   ▼
                                            lib/elaya/brain.ts  (tool loop, ≤5 iterations)
                                              │ system prompt: persona.ts + user_context
                                              │ history: last 10 messages verbatim
                                              ▼
                  lib/elaya/registry.ts ──► llm_providers row (per turn, no cache)
                                              │              └─► adapters/anthropic.ts (ONLY SDK import)
                                              ▼
                  lib/elaya/tools/registry.ts — read tools, executed AS the principal
                                              │  every result → pii.ts maskPii() before the model
                                              ▼
                              lib/elaya/elaya-data.ts (the single read seam; see the "Jarvis" build)
                                              │  admin client + code-side scoping → parity both channels
                                              ▼
                              existing lib/services functions (explicit identity, no auth.uid())
```

> The diagram shows the foundation shape. Since the **"Jarvis" build** (2026-06-25, below) every read
> flows through `elaya-data.ts`, the read set grew from 6 → **11** (the last 4 role-gated), and
> `user_context` is now actively written (persona + learned memory). Read the "Jarvis" section for
> the current architecture; the phase-history sections below remain accurate for what each phase
> shipped.

### Persona currency contract (2026-06-15)

The staff persona (`persona.ts`, "Data rules" block) pins **every monetary amount to Indian
Rupees** — `₹` symbol + Indian digit grouping (₹1,00,000), never AED/USD/`$`/`€`/"Rs", never western
grouping. Amounts from tools are already rupees, so the rule states the currency rather than
converting. This mirrors the `formatCurrency()` INR convention (`₹`, `en-IN`); it is a prompt rule,
not a formatter — Elaya emits text, the contract just stops the model guessing a non-INR currency.
Prompt-only; no tool/schema/formatter change.

### The five hard contracts (sign-off invariants — never weaken)

1. **Tools execute as the caller.** `principal.ts` resolves the verified session profile to
   role + persona + permitted toolset. Identity args to services are principal-derived;
   the model supplies filter values only. An agent asking for another agent's leads is
   refused by the tool layer (`getLeadsByRole` role constraint + `canAccessLead` re-check
   in `get_lead_details` — explicit because the lead row Redis cache is shared).
2. **No provider shape leaks past its adapter.** `lib/elaya/provider.ts` is the one
   `complete()` contract; `adapters/anthropic.ts` is the only `@anthropic-ai/sdk` import.
   A new provider = one adapter file + one `llm_providers` row.
3. **Config over deploy.** `llm_providers` and `elaya_settings` are read per request
   (sla_policies pattern). Switching `reasoning` from `claude-sonnet-4-6` to another model
   is a DB edit. An unimplemented provider fails loud — never a silent fallback.
4. **Caps and expiry are server-side.** The 200/day message cap (`elaya_settings.daily_message_cap`)
   is counted from IST midnight and rejected in the route BEFORE persisting or calling a model.
   The 24h conversation window is resolved in `elaya-service`, never client-side.
5. **PII gateway in the pipeline.** Every tool result passes `maskPii()` (light mode default,
   depth via `elaya_settings.pii_masking_depth`). The vault (D-01 reversible pseudonymisation)
   mounts at this same gateway when it lands.

### Schema (migration 0116)

| Table | Role |
| --- | --- |
| `elaya_conversations` | One row per chat session; `channel` (`in_app` today, `whatsapp` later) |
| `elaya_messages` | Append-only transcript (A-11); `sender_id` denormalised for the cap count |
| `user_context` | Per-user `context jsonb` injected into the system prompt. Since "Jarvis" P2/P3 it carries `persona` (user-set style) + `learned` (Elaya-accumulated memory) — **now actively written** (no longer "later phase"). See the "Jarvis" build |
| `elaya_actions` | Agentic-write ledger — filled by Phase 2/E3 (proposed → executed/failed/dismissed + before/after audit). Migration 0118 added the pending partial index + lifecycle COMMENT |
| `llm_providers` | `routing` → claude-haiku-4-5 · `reasoning` → claude-sonnet-4-6 (seeds) |
| `elaya_settings` | `daily_message_cap` 200 · `pii_masking_depth` 'light' · `session_expiry_hours` 24 |

The `routing` job row (Haiku) is unused by the foundation chat brain, but it is **live in
production** — Lead Revival's note-AI suppression gate makes one structured three-verdict call
through this exact provider (`resolveLlmForJob('routing')` + `maskPii`, no tools, no new SDK
import). The "reserved for later phases" framing is stale: the routing tier ships today. See
"Routing provider in production (Lead Revival)" below and `docs/modules/revival.md`.

### Tools (read-only, wrap services only — never query tables)

The 7 all-staff reads: `search_leads` · `get_cold_leads` · `get_lead_details` · `get_my_tasks`
(all three task kinds — Gia lead follow-ups, personal tasks, **and** group/team workspaces) ·
`search_deals` · `get_performance_snapshot` (agent pulse / manager+ roster) · `get_helpdesk_content`.
The "Jarvis" Phase 4 added **4 role-gated capability reads** (below): `get_escalations` /
`get_domain_health` / `get_campaigns` (manager+) and `get_budget` (admin/founder) — **11 read tools
total**. Per-role toolsets live in `TOOLSET_BY_ROLE` / `readToolsForRole(role)` (guests: zero tools);
the model is only handed the tools the principal carries, and `executeTool` re-checks. Write tools are
a separate module (`tools/write-registry.ts`) merged into the one `executeTool` dispatch — never added
to this read registry. See "Phase 2 — agentic writes (E3)" and the "Jarvis" build below.

## Floating chat widget — second in-app entry point (shipped 2026-06-15)

A circular **Elaya** button floats in the bottom-right corner of every dashboard route **except
`/elaya`**; clicking it opens a modal that renders the **same `ElayaChatShell`** the `/elaya` page
renders (`hideIdentity` — chat-only column, no identity rail). It is a second *entry point*, not a
second chat surface — zero shell fork, so every chat capability shows up in the widget automatically.

- **One seed, two callers (R-01).** `resolveElayaChatSeed(profile)` (`elaya-service.ts`) is THE
  source of the four `ElayaChatShell` props. The `/elaya` RSC page calls it directly; the widget
  calls it via `getElayaChatSeedAction()` (`actions/elaya.ts`). Same conversation, same cap, same
  greeting — the widget never mints a parallel session.
- **Server boundary (A-15).** The widget is `'use client'` and imports only the `ElayaChatSeed`
  **type** from the service; data crosses the action on each open, so the modal reflects the
  conversation's current state.
- **No double-stream / double-count.** Hidden on `/elaya` (`pathname` check) so two live shells on
  one conversation can't co-exist and burn the daily cap twice. The cap + 24h session stay
  server-enforced regardless of which entry point is used.
- **Phase-6 portal.** Button + modal `createPortal` to `document.body`; the heavy shell is
  `next/dynamic` (loads on first open).
- **Single-surface modal (DESIGN-DNA §15.3 Surface A).** The chat **is** the modal surface — not a
  card-in-a-card. The widget opens a `Dialog` with `bodyPadding={false}` + `hideCloseButton` and
  renders the shell with **`embedded`** (strips the card's own border/shadow/radius so it fills the
  panel flush) + **`onClose`** (the lone close X sits in the shell's own refined presence header:
  breathing glyph in an accent disc with the signature glow, Playfair name). The `/elaya` page passes
  neither → free-standing card, no close X (byte-identical to before). The refined presence header +
  the §15.4 bubble polish (sender-side "tail" corner, hairline lift, centered 46rem reading column)
  apply to **both** surfaces — the chat surface stays consistent everywhere, never forked.

## WhatsApp staff channel (shipped 2026-06-12)

Staff can message Elaya on the existing shared Gupshup number. WhatsApp is a second channel,
not a second system: same brain, same principal resolver, same tools, same PII gateway.

```text
Gupshup webhook POST ──► 200 ack immediately; processing inside after()
                              │
                  normalizeWaPhone(sender)  ← THE shared normalizer (lead pipeline uses it too)
                              │
            getActiveProfileByPhone (profiles-service)
                 │ match                        │ no match
                 ▼                              ▼
   lib/services/elaya-whatsapp.ts      processInboundMessage — lead pipeline, UNTOUCHED
   (staff turn, runs to completion)
```

Contracts (extend the five foundation invariants — never weaken):

- **Routing precedence is explicit:** a number on both a profile AND an active lead row goes to
  Elaya (profile wins); the collision is warn-logged. Once a profile matches, the gate returns
  handled on every path — including failures — so a staff message can never mint a lead.
- **Caller-scoped despite the admin client:** the webhook context uses `createAdminClient()`
  mechanically, but the principal is resolved from the matched profile
  (`resolveStaffPrincipal`) and every tool executes as that principal — identical guarantees
  to the in-app route.
- **No streaming:** the brain runs to completion (`emit` no-op), one reply via
  `sendElayaWhatsAppReply` (free-form session message — the staff member just messaged us, so
  the 24h Gupshup session window is open). Every reply attempt writes one
  `whatsapp_notification_logs` row (`type 'elaya_reply'`, migration 0117). Send failures are
  logged, never retried.
- **One cap, one session, across channels:** `countUserMessagesToday` counts per user
  regardless of channel; `getOrCreateActiveConversation` deliberately does NOT filter on
  channel — a WhatsApp message continues a live in-app session (and vice versa), so context
  follows the user. Per-message `channel` records where each message happened. Cap reached →
  polite static refusal, nothing persisted, no model call (same as the route).
- **Persona knows the surface:** `buildElayaSystemPrompt(principal, ctx, 'whatsapp')` appends
  a channel block — very short replies, WhatsApp-native emphasis only. Belt-and-braces: the
  reply also passes `markdownToWhatsApp()` (`lib/utils/whatsapp-format.ts`) before sending —
  models emit markdown regardless of prompts, so `**x**`→`*x*`, `*x*`→`_x_`, headings → bold
  line, md bullets → "- ", links → `text (url)`. The transcript keeps the raw model text;
  only the wire format is converted.
- **Isolation:** the Elaya branch never writes `whatsapp_conversations` / `whatsapp_messages` /
  `leads`. Its only writes are `elaya_messages` inserts + the audit row. Idempotency mirrors
  the lead pipeline: `hasProcessedWaMessage` dedups on the Gupshup message id
  (`elaya_messages.meta->>wa_message_id`).
- Non-text messages get a polite "text only" reply — no cap burn, no model call.

## Routing provider in production (Lead Revival)

The `routing` (Haiku) provider — seeded in 0116 and long described as "reserved" — is **live in
production today**, first consumed by Lead Revival (R1, shipped 2026-06-14). The note-AI
suppression gate (`src/lib/services/revival-gate.ts`) reuses the Elaya provider + PII layer
unchanged: `resolveLlmForJob('routing')` + `maskPii`, **no tools, no new SDK import**. It makes
ONE structured three-verdict call (`revive` / `dismiss` / `unsure`) over a lead's recent notes,
failing **closed** to `unsure` on any bad verdict — never auto-reviving and never
auto-dismissing a warm lead. This is the first real use of the routing tier; the foundation chat
brain still runs on `reasoning` (Sonnet). Full contract: `docs/modules/revival.md`.

## Phase 2 — agentic writes (E3, shipped 2026-06-13)

Elaya can mutate CRM state on the sender's behalf — but only through the same action-shaped
mutations the UI calls (never raw tables), and only under a confirmation protocol split by risk.
Four write tools, two tiers:

| Tool | Tier | Roles | Wraps |
| --- | --- | --- | --- |
| `add_lead_note` | low-risk — executes inline | all staff | `addLeadNoteCore` → `add_lead_plain_note` |
| `create_lead_task` | low-risk — executes inline | all staff | `createLeadTaskCore` → `create_lead_gia_task` (a zoneless `dueAt` is interpreted as **IST** at the tool boundary via `normalizeDueAtToIstInstant` before it becomes an instant; an already-zoned ISO string passes through) |
| `update_lead_status` | state-changing — propose → confirm | all staff | `updateLeadStatusCore` → `update_lead_status` |
| `reassign_lead` | state-changing — propose → confirm | manager/admin/founder | `assignLeadCore` |

```text
user turn ─► runElayaTurn
              │
              ├─ RESOLVER PRE-STEP  (the ONLY place a state-change executes)
              │    pending = getLatestProposedAction(conversationId, userId)
              │    classifyConfirmation(latest *human* message)   ← pure code, never the model
              │      affirmative → re-resolve slug, re-check access + before-snapshot,
              │                     run core, mark executed|failed, emit code-gen line
              │      anything else → mark dismissed (ambiguity NEVER executes), process fresh
              │
              └─ TOOL LOOP  (ctx = {conversationId, channel} threaded into executeTool)
                   low-risk tool  → access re-check → core → INSERT executed audit row
                   state tool     → access re-check → supersede prior → INSERT proposed row
                                    → "awaiting confirmation"  (NO lead mutation this turn)
```

### The E3 hard contracts (extend the foundation invariants — never weaken)

1. **Wrap, never re-query (R-01 / Q-13).** Every write tool calls a shared mutation core in
   `src/lib/services/lead-mutations.ts`, which wraps the exact RPC + context-free side-effects
   (`invalidateLeadCaches` awaited per P-08, SLA, won-notify, Trigger.dev reminder) the UI action
   uses. Both the `leads.ts` action (session caller) and the tool (Elaya principal, admin client)
   are thin callers, so a tool-driven write inherits cache invalidation + activity logging + SLA +
   notifications identically. `revalidatePath`/`after()` are request-context-only and stay in the
   callers (the WhatsApp path has none; the executor plain-awaits `notifyLeadAssigned` inside a
   context that already keeps the lambda alive — A-16).
2. **The confirmation gate is in code, not the prompt.** State-changing tools record a `proposed`
   `elaya_actions` row and return "awaiting confirmation" — they never mutate. Execution happens
   only in the resolver pre-step (inside `runElayaTurn`, so both channels inherit it), only on
   `classifyConfirmation(...) === 'affirmative'`. "Execute a state-change in its proposal turn" is
   structurally impossible — the tool's `run()` has no branch that reaches a core.
   `classifyConfirmation` (`src/lib/elaya/confirmation.ts`) is pure, deterministic, English+Hinglish
   allow-list, tokenized whole-string match; default branch `'other'` (safety bias). Ambiguity /
   a new instruction / "no" → `dismissed`, processed fresh. Stale/moved target → `failed`.
   Acknowledgements are code-generated, never model-authored — and they tell the truth about
   what actually happened: `updateLeadStatusCore` returns `result.changed`, so the resolver
   emits "Done — now {status}" **only** when the row actually moved; a no-op (the lead was
   already in the target status — `ok: true, changed: false`) resolves the proposal `executed`
   but emits an honest "{lead} was already {status} — nothing to change" instead of claiming a
   change that never occurred. (The core already skips `invalidateLeadCaches` on the no-op — nothing moved.)
3. **`elaya_actions` is the trust + rollback ledger** (`elaya-actions-service.ts`, admin client).
   Every executed write (both tiers) appends a row: `user_id`, `action_type` (tool name),
   `payload.target` (slug+id), `payload.channel`, and targeted before/after snapshots. Low-risk →
   one terminal `executed` row (`before: null`); state-changing → `proposed` → `executed`/`failed`/
   `dismissed`. One live proposal per conversation (supersede on new proposal). State-machine +
   audit row, not a pure append-only log (migration 0118 COMMENT; A-11 carve-out — resolve-once
   admin-client UPDATE, no user write policy by design).
4. **Lead resolution for writes is stricter than reads.** Write tools take a **slug**, re-check
   access via `getLeadBySlug` + `canAccessLead(principal)`. The persona instructs `search_leads`
   first + ask-on-0/multiple; the tool layer is the hard backstop. Ambiguous name halts the write.
5. **Injection cannot reach an executed write.** Lead-sourced text in context (notes via
   `get_lead_details`/`search_leads`) can at most cause a `proposed` row; execution needs an
   affirmative the resolver reads from the human's user-role message ONLY (never tool/lead text),
   and the toolset is derived from the verified profile, never model output. Role gating is the
   dispatch-level toolset-membership check (agents have no `reassign_lead`).

### Schema (migration 0118)

`elaya_actions` was reserved empty in 0116; 0118 fills it for use. Adds the partial index
`idx_elaya_actions_pending (conversation_id, created_at DESC) WHERE status='proposed'` (the
resolver's per-turn query) and a `COMMENT ON TABLE` documenting the lifecycle. The `proposed →
executed/failed/dismissed` status flip is a service-role admin-client UPDATE (RLS-bypassing) — no
user UPDATE policy, by design.

## Phase 3 — task agentic writes (shipped 2026-06-15)

Closes the "Elaya only works on leads" gap. She can now create and manage **general tasks** —
not just lead-attached follow-ups. Five tools wrap the `task-mutations.ts` cores (the same bodies
`actions/tasks.ts` calls — R-01), gated by `canMutateTask` (the per-resource access check the
caller owns; the core stays ungated — Q-13). Same two-tier confirmation model as E3, applied to
tasks: four execute inline, `delete_task` alone proposes and waits.

| Tool | Tier | Roles | Wraps |
| --- | --- | --- | --- |
| `create_personal_task` | low-risk — executes inline | all staff (assign-to-another: manager+) | `createPersonalTaskCore` |
| `create_group_task` | low-risk — executes inline | all staff | `createGroupTaskCore` |
| `update_task_status` | low-risk — executes inline | all staff | `updateTaskStatusCore` |
| `update_task` | low-risk — executes inline | all staff | `updateTaskCore` |
| `delete_task` | **state-changing — propose → confirm** | all staff | `deleteTaskCore` (in the resolver only) |

```text
TOOL LOOP (tasks)
  create_personal_task  → assignee-policy gate (manager+ to assign another) → core → INSERT executed
  create_group_task     → core (domain locked to actor unless admin/founder) → INSERT executed
  update_task_status /   → admin-client fetch → canMutateTask(admin, principalCaller) → core → INSERT executed
    update_task
  delete_task           → admin-client fetch → canMutateTask → supersede prior → INSERT proposed
                          → "awaiting confirmation"  (NO delete this turn)

RESOLVER PRE-STEP (delete_task on an affirmative)
  executeProposedAction routes a task-shaped target → executeProposedTaskDelete:
    re-fetch by taskId → if gone: resolve executed + "already removed" (NOT an error)
                       → else: re-run canMutateTask → deleteTaskCore → "Done — deleted …"
```

### The Phase-3 hard contracts (extend E3 — never weaken)

1. **Same core, same gate posture.** Each tool builds a `MutationActor` (`actorFromPrincipal`) and a
   `CallerProfile` (`callerFromPrincipal`) from the **principal**, never model output. `canMutateTask`
   takes the **admin client** (the tool has no session) — safe, because it uses the client only for a
   read-only `task_groups` domain lookup and never reads `auth.uid()`/RLS; the `{id,role,domain}`
   caller object IS the identity. Create tools have no existing row to gate, so the policy is on the
   *assignee*: assigning a personal task to **another** user is manager+ (mirrors
   `createPersonalTaskAction`); a **group** task has no assignee (it is a container — subtasks carry
   assignees), so `create_group_task` is all-staff and deliberately does **not** inherit
   `reassign_lead`'s MANAGER_UP gate.
2. **Tiering is structural.** The four inline tools call the core in `run()` then `insertExecutedAction`.
   `delete_task`'s `run()` has **no branch that reaches `deleteTaskCore`** — it only records a
   `proposed` row and returns "awaiting confirmation". The delete lands solely in
   `executeProposedTaskDelete`, reached only when `classifyConfirmation(human message) === 'affirmative'`.
3. **Optimistic-concurrency on delete (failure mode c).** `deleteTaskCore`'s `.delete().eq(id)` returns
   `ok: true` even on a **missing** row (Supabase reports no error for a zero-row delete) — so a stale
   delete would falsely claim "Done". `executeProposedTaskDelete` therefore re-fetches by `taskId`
   **first**; a gone row resolves the proposal `executed` and emits an honest *"… was already removed —
   nothing to delete"* rather than running the core or erroring.
4. **The delete label is code-derived.** The `proposed` payload stores the task's `taskId` + a
   sanitized **title** read from the DB row (never model/lead/note text), so the confirmation line
   names the right task and no injected text can sit in it. The delete target is the stored `taskId` —
   prompt-injection text can neither become the affirmative (resolver reads the human message only) nor
   redirect the delete to a different task.
5. **IST at every boundary.** Every `dueAt` a task tool accepts passes through `normalizeDueAtToIstInstant`
   (R-01 — the helper E3 already uses): a zoneless `"2026-06-16T15:00"` is interpreted as **IST** (→
   `09:30Z`) before it becomes an instant; an already-zoned ISO string passes through. Zoneless = IST, always.
6. **The model needs a handle.** `get_my_tasks` now surfaces `taskId` (followUps + personalTasks) and
   `groupId` (groupTasks) so the model can target update/delete — without an id it cannot name a task.
   This exposed a latent PII-gateway bug: `maskPii`'s `PHONE_RE` matches a UUID's digit/dash run and
   corrupted the id. Fixed at the gateway — an **exact-UUID string leaf** is now skipped (a UUID is an
   opaque identifier, not PII), so any tool surfacing an id is safe.

The `elaya_actions` ledger is unchanged at the DB level — `ElayaActionType` gains the five task types
and `payload.target` becomes a union (lead `{slug, leadId}` | task `{taskId?, groupId?}`); jsonb column,
**no migration**, TS contract only.

## Phase 4a — voice input (E4a, shipped 2026-06-14)

Staff can speak to Elaya on both surfaces. **Voice is an input transform only** — audio is
transcribed to text, then fed into the **exact same `runElayaTurn`** the typed path uses. No
change to the brain, tools, the E3 propose→confirm protocol, the PII gateway, the daily cap, the
session, or replies. Replies stay text. Concrete stack: **Deepgram NOVA-2**, language `hi-Latn`
(Hinglish / Roman-script Hindi), **3 MB max audio** (`MAX_VOICE_NOTE_BYTES`), 2-min recording cap
(`DEFAULT_MAX_RECORDING_MS`). In-app capture is the shared **`DictationButton`** component
(`variant="composer"`) over `useAudioRecorder` → **`transcribeAudioAction`**.

```text
WhatsApp voice note ─► webhook builds type:'audio' MetaInboundMessage (Gupshup CDN url + contentType)
                        │
                        ▼  elaya-whatsapp.ts  transcribeWhatsAppAudio(url, mime)
                        │     fetch(url) → transcribeAudio()  ← THE shared notes STT, never a 2nd path
                        ▼     (empty/non-speech → graceful nudge, BEFORE cap/model/persist)
                  ── identical to a typed message from here ──► cap → session → insert → runElayaTurn → reply

In-app mic (ElayaChatShell) ─► useAudioRecorder → transcribeAudioAction → transcript fills the composer
                                as an EDITABLE DRAFT + focus → user reviews and presses send (never auto-send)
```

### The E4a hard contracts (extend the foundation/E3 invariants — never weaken)

1. **One STT path, reused.** Both surfaces use `transcription-service.transcribeAudio` (the notes
   section's Deepgram call site) — the in-app mic through `transcribeAudioAction` (the same action
   `LeadNotesInput`/`CalledModal` use), the WhatsApp path server-to-server. No second integration.
2. **Voice changes nothing downstream.** Once audio is text, the cap, dedup
   (`hasProcessedWaMessage`), session, persist, brain, reply, and E3 confirmation gate are
   byte-identical to a typed message. A voice-note status-change still records a `proposed`
   `elaya_actions` row and waits for an affirmative — a mistranscribed write is caught by the same
   E3 gate, so no separate echo/confirm step exists.
3. **A voice note = one message.** It burns exactly one slot of the shared daily cap, like typing.
4. **In-app never auto-sends.** The transcript lands in the composer `input` state as an editable
   draft (reusing the starter-prompt prefill+focus path); only the user's send dispatches it. A
   garbled prompt cannot reach a brain that can write to the CRM without human review.
5. **Empty / non-speech / failure is graceful.** An empty transcript replies "couldn't catch that"
   **before** the cap, model, or any persist — never an empty prompt at the brain. A download or
   transcription failure throws to the gate's try/catch → `REPLY_UNAVAILABLE`, still handled, no
   lead minted, webhook still 200s.
6. **Audio PII is the same interim D-01 stance as text.** External STT accepted; audio is
   transcribed in-memory and discarded, never persisted. The transcript flows through the existing
   `maskPii` gateway exactly as typed text. Documented, not gated.

**ElevenLabs** is locked for E5/E4b (voice *replies* / TTS) and is **not used here** — E4a is
input transcription only (Deepgram), replies stay text.

## Web Push delivery (notifications, shipped 2026-06-14)

Orthogonal to the chat brain but worth noting here for delivery completeness: **Web Push (VAPID,
the `web-push` lib, no SaaS; migration 0120) is now a second delivery channel layered behind
`createNotification`.** The fan-out seam lives *inside* `createNotification` — after the in-app
row insert it calls `dispatchPush(recipient_id, {title, body, url})`, so every existing caller
(lead-assignment-notify, lead-mutations, sla, tasks, task-reminders) gets push for free with zero
call-site edits. `dispatchPush` is non-fatal (never throws; the in-app row stays source of truth)
and prunes dead 404/410 endpoints. Full contract: `docs/changelog.md` (2026-06-14 Web Push entry).

## The "Jarvis" build — Phases 1–4 (shipped 2026-06-25)

Elaya became a true **per-user personal assistant**. The design doc is
`docs/architecture/elaya-jarvis-architecture.md` (the four-concern model + the Golden Rule); this is
the build record. Four concerns are kept strictly apart: **Identity** (the verified principal),
**Permissions** (role → toolset + data scope, **code only**), **Persona** (how Elaya talks to you),
**Memory** (what she knows about your work).

### THE GOLDEN RULE (governs everything below — never weaken)

> **Permissions are enforced in code and are completely independent of persona, memory, notes, and
> any model/prompt content.**

Toolset + data scope are fixed from the verified principal's **role, in code, before the model runs**
— so an injected persona note, learned memory, a future scraped page, or lead-sourced text can never
widen access. This is the single property that makes it safe to inject user content into the prompt
and (later) to let Elaya talk to external customers.

### Phase 1 — the data layer + channel parity (`src/lib/elaya/elaya-data.ts`)

The single seam **every** Elaya read flows through: principal-in → **admin client** → scoped by the
principal's role/userId/domain **in code** → `maskPii()`. Tools call `elayaData.*` only, never a
`*-service.ts` directly — so a session dependency (`auth.uid()`, which is NULL on WhatsApp) is
*physically impossible* to re-introduce, and channel parity is structural rather than remembered.
Three reads genuinely self-scoped in SQL got sessionless admin twins (**migration 0149**,
`*_for_user` / `*_for_elaya`, Q-13 revoked tier — see `../architecture/auth-and-rbac.md` §13):
`get_group_task_summaries`, `get_agent_today_pulse`, `get_agent_roster_performance`. The per-resource
gate (`canAccessLead`/`canMutateTask`) stays the trust boundary. The parity rule is written into
`src/lib/elaya/CLAUDE.md`.

### Phase 2 — per-user persona ("how Elaya talks to me")

A per-user style file: `language` (mirror/english/hinglish), `tone` (warm/direct/playful), `depth`
(simple/standard/technical), `length` (brief/standard/detailed) + a 600-char free-text note. Stored
in `user_context.context.persona`; edited from `/profile` (`ElayaPersonaSettings` →
`updateElayaPersonaAction`, `requireProfile` + sanitize). Injected via `buildPersonaPromptBlock` as a
**fenced STYLE-ONLY block** that emits only non-default picks, so it rides the cached prompt prefix
(~0 marginal tokens after turn 1). The block literally says "never a permission" — defence in depth
on top of the code gate. No migration (reuses `user_context`).

### Phase 3 — durable memory ("gets smarter the more you use it")

`src/lib/elaya/memory.ts`. `summarizeLearnedMemory` makes ONE bounded **Haiku** call
(`resolveLlmForJob('routing')` + `maskPii`, no tools) merging the prior learned note + recent
transcript into a ≤900-char note, and **fails soft to null** (a glitch never corrupts existing
memory). `maybeUpdateLearnedMemory` is throttled (every 4th user message), fire-and-forget, off the
hot path (runs in the post-reply window on both channels). `writeLearnedMemory` merge-writes
`user_context.context.learned` **without touching `persona`**. `retrieveMemoryContext(principal,
question)` is the **notes-section seam** — returns the learned blurb today (load-all), shaped so a
later swap to semantic/embedding retrieval is one function (the `vector` extension is already
installed). No migration.

### Phase 4 — capability tools (role-gated reads)

`ElayaTool` gained a `roles` field; `readToolsForRole(role)` gates the read set. Added (all wrap
existing services through `elaya-data`, no new SQL): **`get_escalations`** / **`get_domain_health`** /
**`get_campaigns`** (manager+) and **`get_budget`** (admin/founder only). A manager never sees
`get_budget`; an agent never sees the oversight reads. **`get_usage` is deferred** (its `getAgentUsage`
is session-bound — needs a sessionless refactor first). No migration.

### `log_deal` — the 11th write tool (propose→confirm)

Elaya can record a won deal from chat ("I closed Akhil on the gold annual membership for ₹1,20,000").
It wraps the shared **`recordDealCore`** (extracted into `lead-mutations.ts` so the `recordDeal` action
and the tool share one insert — R-01), derives `deal_type` from the lead's domain
(`DOMAIN_DEAL_CONFIG`), and is **state-changing** (money + flips the lead to Won) → it proposes and
waits for an affirmative, exactly like `update_lead_status`. `action_type` has no DB CHECK, so it
needed no migration. This brings the write set to **11 tools** (7 inline + 4 propose→confirm:
`update_lead_status`, `reassign_lead`, `log_deal`, `delete_task`).

### Net effect

11 read tools (role-gated) + 11 write tools, identical on both channels by construction, with a
per-user persona + accumulating memory — all under the Golden Rule. The Phase 1–4 skeleton is
complete; "Phase 5" (the notes-section UI, semantic retrieval, web super-powers) is the future layer.

## Later phases (not built)

- **WhatsApp customer persona:** `resolveCustomerPrincipal()` stub becomes real; a narrow
  customer-only toolset (send-material + answer-from-KB, no CRM access — the Golden Rule). The staff
  WhatsApp channel above is live; the customer persona stub still throws. **Designed in detail** in
  `customer-welcome-blast.md` (awaiting founder sign-off).
- **Notes section:** the `retrieveMemoryContext` seam (Phase 3) is in place; the staff notes UI +
  `notes` table + per-turn read are the remaining work, then a swap to embedding retrieval.
- **In-app proposal cards:** the confirmation today is a plain yes/no reply on both channels.
  The Elaya two-action Approve/Dismiss card (over the same `elaya_actions` proposal rows) is a
  later UI affordance — the gate and ledger are already in place for it.
- **Routing job in the chat brain:** Haiku-tier intent triage in front of the reasoning brain is
  still unbuilt — but the `routing` provider itself is already in production via Lead Revival's
  note-AI gate (see "Routing provider in production" above), so this is no longer the tier's first use.
- **Voice replies / avatar (E5/E4b):** voice *output* (TTS, ElevenLabs locked) + avatar are out of
  scope. Voice *input* shipped in E4a above (Deepgram, both surfaces).

## Design vision

> Folded in from the original `elaya.md` (the pre-Elaya design doc) during the Serene→Serene /
> Elaya→Elaya rename. This is the design language the presence was conceived against; the shipped
> surfaces above are the first realisation of it.

Elaya is the agentic AI presence that lives inside Serene. She is not a chatbot — she is a
presence: a compass that surfaces the right insight on the right surface at the right moment.

**Design language (DESIGN-DNA §15):**

- Full design language — glyph (always breathing when present), four surfaces (Panel,
  Conversation, Inline Suggestion, Action Proposal), motion rules, voice: `DESIGN-DNA.md` §15.
- Operating rules (root `CLAUDE.md` quick reference): inline suggestions always delay 400 ms;
  proposal cards have exactly two actions (Approve / Dismiss); one dot or nothing — never a
  number badge; her colour is always `--theme-accent`; cross-domain insights are always
  labelled with the source domain.
- Privacy constraint that shapes the build: **no raw PII reaches any external AI model** (D-01)
  — pseudonymisation before anything leaves the vault. The PII gateway (`pii.ts`) is the
  interim enforcement point until the vault lands (see foundation invariant 5 above).

**The presence in code:** `src/components/ui/elaya-glyph.tsx` (the breathing SVG mark, the
`ElayaGlyph` component), the `elaya` toast/modal types, and the live Elaya subsystem
(`src/lib/elaya/`) documented above.
