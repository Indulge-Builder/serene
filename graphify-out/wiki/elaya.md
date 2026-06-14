# Elaya — the AI compass

> **Purpose:** A staff-facing AI agent that searches leads/deals/tasks, reads history, proposes
> state changes (status / reassignment) under human confirmation, and executes low-risk writes
> (notes / tasks) inline — all behind a provider-neutral architecture that isolates the Anthropic SDK
> to one adapter file. *Not a chatbot — a presence.*

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md). Migrations: `0116` (foundation), `0117` (reply log), `0118` (actions phase 2).

---

## Entry points

A "turn" starts in exactly two places:

1. **In-app SSE chat** — `POST /api/elaya/chat` (`src/app/api/elaya/chat/route.ts`). Gate chain:
   `getCurrentProfile()` → burst rate limit → Zod (`ElayaChatRequestSchema`) → daily-cap check →
   `insertUserMessage()` → `runElayaTurn()` → SSE stream. Client: `ElayaChatShell.tsx`.
   *(This is the sanctioned P-02 API-route exception — no other API routes besides webhooks + this.)*
2. **WhatsApp staff channel** — `tryHandleElayaWhatsAppMessage(phone, message)`
   (`src/lib/services/elaya-whatsapp.ts`). Called by the WhatsApp webhook **inside `after()`, BEFORE**
   the lead pipeline: phone normalize → `getActiveProfileByPhone()` match → full brain turn (no
   streaming) → one `sendElayaWhatsAppReply()`. A staff-number match returns `true` on every path so a
   staff message **never** falls through to mint a lead.

---

## The turn lifecycle (`brain.ts` → `runElayaTurn`)

In order:

1. **Principal resolution** — `resolveStaffPrincipal(profile)` (`principal.ts`) → `{ userId, role, domain,
   displayName, toolset }`. Toolset comes from `TOOLSET_BY_ROLE`. Identity is **always** session-derived.
2. **Provider/registry lookup** — `resolveLlmForJob('reasoning')` (`registry.ts`) reads the active
   `llm_providers` row **per request, never cached** → `{ adapter, model, maxTokens }`. The adapter is
   the *only* code that imports `@anthropic-ai/sdk` (`adapters/anthropic.ts`).
3. **System prompt** — `buildElayaSystemPrompt(principal, userContext, channel)` (`persona.ts`). Warm,
   Hinglish-aware; data comes ONLY from tools; authorization lives in the tool layer.
4. **History load** — `getModelContextMessages(conversationId)` (`elaya-service.ts`), last 10 messages,
   text only (tool results are not replayed from history).
5. **Confirmation resolver (E3) — the ONLY place a state change executes.** Runs **before** the model
   turn, both channels. `resolvePendingAction()` reads `getLatestProposedAction()` and runs
   `classifyConfirmation(lastUserMessage)`. If `affirmative` → `executeProposedAction()` (re-resolve
   lead, re-check access, verify before-snapshot, call the mutation core, flip the ledger row to
   `executed`/`failed`). Anything else → dismiss the proposal. Either way the new message is then
   processed fresh. See [§Confirmation](#5-the-confirmation--proposal-mechanism-e3).
6. **Tool definitions** — `getToolDefinitionsForPrincipal(principal)`, filtered by `principal.toolset`.
7. **Model loop** — up to `MAX_TOOL_ITERATIONS = 5`. Each iteration: `adapter.complete(req)` (streaming
   via `onTextDelta`); if `stopReason !== 'tool_use'` → break; else execute each tool call.
8. **Tool execution gate** — `executeTool(principal, name, input, maskingDepth, ctx)`. Refuses any name
   outside `principal.toolset`. Executes AS the principal. **`maskPii(result, depth)` on EVERY result**
   before it reaches the model. Results truncated at `TOOL_RESULT_MAX_CHARS = 12_000`.
9. **Persist** — `insertAssistantMessage()` (role, content, `tool_calls`, `meta`) + `touchConversation()`.

---

## 4. The tools

All read tools execute inline and wrap an existing `lib/services` function (never a raw query).

**6 read tools** (`tools/registry.ts`):

| Tool | Wraps | Returns |
|---|---|---|
| `search_leads` | `getLeadsByRole` | counts + compact lead list (access-rechecked) |
| `get_lead_details` | `getLeadBySlug` + `getLeadNotesFull` | full row + ≤5 recent notes |
| `get_my_tasks` | `getPersonalTasks` | caller's tasks for a period |
| `search_deals` | `getDealsByRole` | role-scoped deals |
| `get_performance_snapshot` | `getAgentTodayPulse` / roster | agent's core stats |
| `get_helpdesk_content` | `getCasesForLead` + `getHooksForCategories` | cases + hooks for domain/interests |

**4 write tools** (`tools/write-registry.ts`):

| Tool | Tier | Behaviour | Calls |
|---|---|---|---|
| `add_lead_note` | E2 inline | executes in `run()`, writes `executed` ledger row | `addLeadNoteCore` |
| `create_lead_task` | E2 inline | executes in `run()`, writes `executed` ledger row | `createLeadTaskCore` |
| `update_lead_status` | **E3 propose-only** | `run()` records a `proposed` row, mutates nothing | resolver → `updateLeadStatusCore` |
| `reassign_lead` | **E3 propose-only** | `run()` records a `proposed` row, mutates nothing | resolver → `assignLeadCore` |

The E3 tools **never** call a core in their `run()` — that structural separation makes
execution-in-proposal-turn impossible. Mutation happens only in `executeProposedAction()`.

---

## 5. The confirmation / proposal mechanism (E3)

Three-turn contract:

- **Turn N (propose):** model calls `update_lead_status` → tool records a `proposed` `elaya_actions`
  row (with a before-snapshot) and returns an "awaiting confirmation" message. `supersedePriorProposals`
  cancels any earlier live proposal — **one live proposal per conversation**.
- **Turn N+1 (confirm):** before the model runs, `resolvePendingAction` calls `classifyConfirmation` on
  the latest **user** message. `affirmative` only for unambiguous yes-tokens (English + Hinglish:
  yes/ok/confirm, haan/ji/theek hai/kar do…). **Default is `'other'` → dismiss.** The verdict reads the
  human message only — tool results / lead-sourced text in context can never *be* the confirmation
  (prompt-injection defence). On affirmative: re-resolve + re-check access + verify the before-snapshot
  still matches (optimistic concurrency), call the core, flip the row to `executed`. The confirmation
  line is **code-generated**, never model-authored.

---

## Key tables (migration 0116 / 0118)

| Table | Holds |
|---|---|
| `elaya_conversations` | one active per user across channels; `channel`, `last_message_at` (24h expiry), `archived_at` |
| `elaya_messages` | append-only; `role` (user/assistant), `content`, `tool_calls` jsonb, `meta` (provider/model/usage) |
| `elaya_actions` | the trust/rollback ledger: `action_type`, `payload` (before/after snapshots), `status` (proposed/executed/failed/dismissed), `resolved_at/by` |
| `llm_providers` | `job_type` (reasoning/routing) → provider/model/max_tokens/active; read per request |
| `elaya_settings` | `daily_message_cap`, `pii_masking_depth`, `session_expiry_hours`; read per request |
| `user_context` | one row per user; durable facts injected into the system prompt |

---

## Invariants / gotchas

- **Only `adapters/anthropic.ts` imports the SDK.** A new provider = one new adapter file + a `registry.ts`
  switch entry. Zero brain changes.
- **`brain.ts` is the only place state changes.** Write tools call cores; cores own cache + activity +
  SLA + notify. No tool runs a raw `supabase.from()`.
- **PII gateway on every tool result** (`maskPii`), depth from `elaya_settings` per turn (off/light/strict).
- **One active conversation per user across channels** — a WhatsApp message continues the in-app session
  if one is live (24h window). Daily cap is shared across channels, checked before the model + persist.
- **Config read per request, never module-cached** — change `llm_providers` / `elaya_settings` row,
  applies next message, no deploy (same pattern as `sla_policies`).
- **No prompt contents logged** (D-05). Voice notes transcribed in-memory, never stored (see
  [voice-dictation.md](voice-dictation.md)).
- **Tool name must be in `principal.toolset`** — permission is toolset membership, not a prompt instruction.

---

## File map

| File | Role |
|---|---|
| `src/lib/elaya/provider.ts` | Provider-neutral `complete()` request/response contract |
| `src/lib/elaya/registry.ts` | `resolveLlmForJob` — config row → adapter, per request |
| `src/lib/elaya/principal.ts` | Verified profile → role + toolset (`TOOLSET_BY_ROLE`) |
| `src/lib/elaya/persona.ts` | Warm, Hinglish-aware system-prompt builder |
| `src/lib/elaya/brain.ts` | Tool-calling loop + the confirmation resolver pre-step |
| `src/lib/elaya/confirmation.ts` | `classifyConfirmation` — safety-biased affirmation gate |
| `src/lib/elaya/pii.ts` | `maskPii` — the PII gateway (off/light/strict) |
| `src/lib/elaya/tools/registry.ts` | 6 read tools + the single `executeTool` dispatch |
| `src/lib/elaya/tools/write-registry.ts` | 4 write tools + `executeProposedAction` (resolver-only) |
| `src/lib/elaya/adapters/anthropic.ts` | ONLY SDK importer; streaming + normalization |
| `src/lib/services/elaya-service.ts` | Conversations/messages (append-only); session expiry |
| `src/lib/services/elaya-actions-service.ts` | The `elaya_actions` ledger state machine |
| `src/lib/services/elaya-whatsapp.ts` | Staff routing gate; voice→brain→reply |
| `src/lib/services/llm-providers-service.ts` | LLM config + PII depth + cap + expiry reads |
| `src/app/api/elaya/chat/route.ts` | SSE endpoint; auth/burst/zod/cap gates |
| `src/components/elaya/ElayaChatShell.tsx` | Transcript state, SSE loop, composer, cap banner |
| `src/components/elaya/ElayaMessageBubble.tsx` | One bubble; `ChatMarkdown` for assistant text |
| `src/lib/constants/elaya.ts` | Greetings, starter prompts, daily lines |
| `src/lib/validations/elaya-schema.ts` | `ElayaChatRequestSchema` |
