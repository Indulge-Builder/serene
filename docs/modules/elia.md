# Elaya

> **Purpose:** the AI presence inside Eia — chat surface today, the substrate for every future AI feature (lead revival, reports, agentic writes, customer bot).
> **Audience:** engineers. · **Source-of-truth scope:** Elaya architecture + phase contracts.
> **Last verified:** 2026-06-12 · **Status:** Foundation shipped (read-only chat) + WhatsApp staff channel.

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
| `elaya_actions` | **Empty until Phase 2** — agentic action proposals (approve/dismiss) |
| `llm_providers` | `routing` → claude-haiku-4-5 · `reasoning` → claude-sonnet-4-6 (seeds) |
| `elaya_settings` | `daily_message_cap` 200 · `pii_masking_depth` 'light' · `session_expiry_hours` 24 |

The `routing` job row is seeded but unused by the foundation brain (reserved for cheap intent
triage / channel routing in later phases).

### Tools (read-only, wrap services only — never query tables)

`search_leads` · `get_lead_details` · `get_my_tasks` · `search_deals` ·
`get_performance_snapshot` (agent pulse / manager+ roster) · `get_helpdesk_content`.
Per-role toolsets live in `TOOLSET_BY_ROLE` (guests: zero tools). Phase 2 write-tools will be a
separate module gated behind `elaya_actions` proposals — never added to this registry.

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
  a channel block — very short plain-text replies, no markdown.
- **Isolation:** the Elaya branch never writes `whatsapp_conversations` / `whatsapp_messages` /
  `leads`. Its only writes are `elaya_messages` inserts + the audit row. Idempotency mirrors
  the lead pipeline: `hasProcessedWaMessage` dedups on the Gupshup message id
  (`elaya_messages.meta->>wa_message_id`).
- Non-text messages get a polite "text only" reply — no cap burn, no model call.

## Later phases (not built)

- **Phase 2 — agentic writes:** proposal cards (Approve/Dismiss, the Lia two-action contract)
  backed by `elaya_actions`; write-tools behind explicit approval.
- **WhatsApp customer persona:** `resolveCustomerPrincipal()` stub becomes real; narrow
  lead-scoped toolset. (The staff WhatsApp channel above is live; the customer persona stub
  still throws.)
- **Context writer:** Elaya populates `user_context` from conversations.
- **Routing job:** Haiku-tier intent triage in front of the reasoning brain.
- **Voice/avatar:** out of scope here; `transcription-service` already exists for the voice channel.
