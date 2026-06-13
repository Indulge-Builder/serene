# Elaya

> **Purpose:** the AI presence inside Eia — chat surface today, the substrate for every future AI feature (lead revival, reports, agentic writes, customer bot).
> **Audience:** engineers. · **Source-of-truth scope:** Elaya architecture + phase contracts.
> **Last verified:** 2026-06-13 · **Status:** Foundation (read-only chat) + WhatsApp staff channel + **Phase 2 agentic writes (E3)**.

Historical note: this module was tracked as "Elia" in the roadmap; the shipped name is **Elaya**
(matching the pre-existing presence card in `src/lib/constants/elaya.ts`). File stays `elia.md`
so roadmap references resolve.

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
                  lib/elaya/tools/registry.ts — 6 read-only tools, executed AS the principal
                                              │  every result → pii.ts maskPii() before the model
                                              ▼
                              existing lib/services functions (RLS + service scoping)
```

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
| `user_context` | Durable per-user context injected into the persona prompt (writes: later phase) |
| `elaya_actions` | Agentic-write ledger — filled by Phase 2/E3 (proposed → executed/failed/dismissed + before/after audit). Migration 0118 added the pending partial index + lifecycle COMMENT |
| `llm_providers` | `routing` → claude-haiku-4-5 · `reasoning` → claude-sonnet-4-6 (seeds) |
| `elaya_settings` | `daily_message_cap` 200 · `pii_masking_depth` 'light' · `session_expiry_hours` 24 |

The `routing` job row is seeded but unused by the foundation brain (reserved for cheap intent
triage / channel routing in later phases).

### Tools (read-only, wrap services only — never query tables)

`search_leads` · `get_lead_details` · `get_my_tasks` · `search_deals` ·
`get_performance_snapshot` (agent pulse / manager+ roster) · `get_helpdesk_content`.
Per-role toolsets live in `TOOLSET_BY_ROLE` (guests: zero tools). Phase 2/E3 write-tools are a
separate module (`tools/write-registry.ts`) merged into the one `executeTool` dispatch — never
added to this read registry. See "Phase 2 — agentic writes (E3)" below.

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

## Phase 2 — agentic writes (E3, shipped 2026-06-13)

Elaya can mutate CRM state on the sender's behalf — but only through the same action-shaped
mutations the UI calls (never raw tables), and only under a confirmation protocol split by risk.
Four write tools, two tiers:

| Tool | Tier | Roles | Wraps |
| --- | --- | --- | --- |
| `add_lead_note` | low-risk — executes inline | all staff | `addLeadNoteCore` → `add_lead_plain_note` |
| `create_lead_task` | low-risk — executes inline | all staff | `createLeadTaskCore` → `create_lead_gia_task` |
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
   Acknowledgements are code-generated, never model-authored.
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

## Later phases (not built)

- **WhatsApp customer persona:** `resolveCustomerPrincipal()` stub becomes real; narrow
  lead-scoped toolset. (The staff WhatsApp channel above is live; the customer persona stub
  still throws.)
- **In-app proposal cards:** the confirmation today is a plain yes/no reply on both channels.
  The Lia two-action Approve/Dismiss card (over the same `elaya_actions` proposal rows) is a
  later UI affordance — the gate and ledger are already in place for it.
- **Context writer:** Elaya populates `user_context` from conversations.
- **Routing job:** Haiku-tier intent triage in front of the reasoning brain.
- **Voice/avatar:** out of scope here; `transcription-service` already exists for the voice channel.
