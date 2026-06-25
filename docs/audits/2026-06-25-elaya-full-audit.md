# Elaya — Capability & Health Report

**Date:** 2026-06-25 · **Audience:** Founder + engineering · **Scope:** Elaya AI subsystem (brain, tools, chat, WhatsApp, persona, roadmap) across 12 audit dimensions + completeness critic

> **Method:** 12 parallel deep-readers (one per dimension) read the actual code and catalogued capabilities + findings; every finding was then adversarially verified against the real code (default-to-refuted). A completeness critic swept for missed surface area. Live production config + usage gathered via MCP on 2026-06-25.
>
> **Status (updated 2026-06-25):** the confirmed High-severity findings and the correctness Medium findings have been FIXED and removed from this document — it now lists only what is still outstanding. See `docs/changelog.md` ("Elaya audit fixes" batches 1 + 2) for what shipped.

---

## 1. Executive Summary

Elaya is **fundamentally healthy and production-safe**. The security architecture is the strongest part of the system: identity is principal-derived (never model-supplied), every lead/task write re-checks per-resource access, state-changing actions execute only through a propose-then-confirm resolver with optimistic-concurrency guards, and the daily cap fails closed.

**No critical bugs, and no High-severity bugs remain open** — the silent-wrong-answer / silent-failure class (WhatsApp blank tools, page-as-total counts, stale-proposal execution, `delivered:true` on failed sends) and the missing call-logging tool have all been fixed. What remains is **enhancement work, not defects**: the in-app proposal card (UX/contract polish — the backend confirm is already injection-proof and works via typed "yes"), the unbuilt capability tools (manager oversight, founder business reads, deal-record, WhatsApp-send), and a Low/nit polish cluster.

**Outstanding findings:** **~4 Medium** (1 proposal-card UX + the capability gaps) + **~23 Low/nit**.

**The two biggest strategic facts:** (1) the **customer-facing WhatsApp persona is unbuilt** (hard stub) and **durable memory (`user_context`) is wired but never written** (0 rows) — Elaya has no cross-session memory; (2) **manager oversight + founder business questions have no tools yet**, though every backing service already exists.

**Live usage signal (2026-06-25):** 37 conversations · 12 distinct users · ~41 in-app + ~46 WhatsApp user messages · writes executing across notes/tasks/status. Config: reasoning=`claude-sonnet-4-6` (4096 tok), routing=`claude-haiku-4-5` (1024 tok); daily cap 200; PII masking `light`; session 24h.

---

## 2. What Elaya Can Do Today (by role + channel)

Channels: **IA** = in-app (`/elaya`, floating widget, dashboard presence card), **WA** = WhatsApp staff channel. Both run the identical brain/toolset/principal.

### Capability matrix

| Capability | Tool | Agent | Manager | Admin/Founder | IA | WA | Health |
|---|---|---|---|---|---|---|---|
| Search leads (scoped) | `search_leads` | own assigned | own domain | all domains | ✅ | ✅ | ✅ true full-set counts + `hasMore` |
| Cold/stale leads | `get_cold_leads` | own | domain | all | ✅ | ✅ | ✅ |
| Lead dossier + notes | `get_lead_details` | own | domain | all | ✅ | ✅ | ✅ |
| My tasks (Gia+personal+group) | `get_my_tasks` | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ IA; WA shows Gia + personal, refers group tasks to the app |
| Closed deals/revenue | `search_deals` | own | domain | all | ✅ | ✅ | ✅ (admin-client twin works on WA) |
| Performance snapshot | `get_performance_snapshot` | self pulse | roster (own domain) | roster (all) | ✅ | ◐ | ✅ IA; WA refers to the app (no false zeros); no domain arg for admin/founder (Low) |
| Helpdesk / call intelligence | `get_helpdesk_content` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (non-Gia silently remapped to onboarding — nit) |
| Add lead note | `add_lead_note` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ inline (no confirm; WA voice = no review — Low) |
| **Log a call (with outcome)** | `log_call` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ sets outcome, new→touched, arms SLA cadence |
| Create lead follow-up | `create_lead_task` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ unassigned lead → task lands on caller (Low) |
| Change lead status | `update_lead_status` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ propose→confirm (15-min TTL + relayed-ask gate) |
| Reassign lead | `reassign_lead` | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ propose→confirm; inactive/missing assignee rejected all roles |
| Create personal task | `create_personal_task` | self only | +others | +others | ✅ | ✅ | ✅ cross-user gated manager+ + assignee-active check |
| Create group workspace | `create_group_task` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (but cannot add subtasks — gap) |
| Change task status | `update_task_status` | own | +domain group | ✅ | ✅ | ✅ | ✅ |
| Edit task | `update_task` | own | +domain group | ✅ | ✅ | ✅ | ✅ cross-user reassign gated manager+ + assignee-active check |
| Delete task | `delete_task` | own | +domain group | ✅ | ✅ | ✅ | ✅ propose→confirm (no before-snapshot — Low) |
| Voice input | (Deepgram) | ✅ | ✅ | ✅ | ✅ draft | ✅ auto | ✅ |

**Guest role:** can converse on both channels (burns the daily cap) but has an empty toolset — gets a chatbot that can never answer a data question (nit, intentional).

**◐ on WhatsApp:** group-task workspaces and performance numbers are self-scoped via `auth.uid()` in SQL and can't run in the sessionless webhook, so over WhatsApp those tools now say "open Serene in the app" rather than returning a false blank/zero. Full sessionless RPC twins for them are deferred (see roadmap).

---

## 3. How It Works Under the Hood

```
                         ┌─────────────────────────────────────────────┐
  IN-APP  POST           │                  BRAIN (brain.ts)            │
  /api/elaya/chat  ──────▶  resolveStaffPrincipal(verified profile)     │
   (cookie session,      │     │  identity = userId/role/domain         │
    SSE streaming)       │     ▼                                        │
                         │  [1] CONFIRMATION RESOLVER (pre-step)        │
  WHATSAPP webhook ──────▶     getLatestProposedAction → TTL check →    │
   (after(), no session, │     classify latest USER msg → affirmative?  │
    one final reply)     │       → executeProposedAction (THE only      │
                         │         place a state-change runs)           │
                         │  [2] TOOL-CALLING LOOP (max 5 iterations)    │
                         │     llm.complete() ⇄ executeTool ⇄ tool_result│
                         └───────────────┬─────────────────────────────┘
                                         │
  PER-TURN CONFIG (no deploy):           ▼
  llm_providers: reasoning=          executeTool (registry dispatch)
   sonnet-4-6 (4096 tok),            │ toolset membership gate (hard)
   routing=haiku-4-5 (1024)          │ → run() → service / *Core
  elaya_settings: cap=200,           │ → maskPii(result, depth) ← PII GATEWAY
   pii=light, session=24h            │ → 12k truncation → model
                                     ▼
                    READ tools → admin-client services w/ code-enforced scope
                    WRITE tools → shared *Core (lead-mutations / task-mutations)
                                  = same body the UI actions call (R-01)
                                     ▼
                    elaya_actions AUDIT LEDGER (executed / proposed → resolved)
```

**Key invariants that make it safe:**

- **Identity is structural.** `resolveStaffPrincipal(profile)` builds role/userId/domain from the verified profile; tools pass these as scope args. Model text can never widen scope.
- **Per-resource re-check.** Every lead-ref tool calls `getLeadByRefForElaya` (admin client) then `canAccessLead(principal, lead)` immediately. Same for `canMutateTask` on tasks.
- **State changes are two-turn.** `STATE_CHANGING` = {`update_lead_status`, `reassign_lead`, `delete_task`}; their `run()` only inserts a `proposed` row. The mutation runs only in `executeProposedAction` on an affirmative reply, re-checking access + an optimistic before-snapshot, only within a 15-min TTL, and only when the ask was actually relayed.
- **Confirmation is injection-proof.** `classifyConfirmation` reads only the latest `role==='user'` message, whole-token matched, default = cancel.
- **PII gateway** masks every tool result before the model sees it; exact-UUID leaves survive so write handles (`leadId`/`taskId`) work.
- **Second LLM consumer:** the daily lead-revival cron (`revival-gate.ts`) reuses the same provider/PII stack via the `routing` job — a bad `routing` provider row breaks revival, not chat.

**Type-debt note (cross-cutting):** every Elaya table is read/written through `(supabase as any)` casts because `database.ts` was never regenerated after migration 0116 (`src/lib/types/elaya.ts` is hand-declared "TEMPORARY"). A column rename won't fail compile.

---

## 4. Outstanding Findings

> The confirmed High findings (WhatsApp sessionless tools, page-as-total counts, stale-proposal execution, `delivered:true` on failed sends, missing call-log tool) and the correctness Mediums (task-tool authz parity, iteration-ceiling / max-tokens truncation, mid-turn partial persist, adapter timeout, WhatsApp dedup race) have been FIXED — see the changelog. Refuted findings excluded throughout.

### 🟡 Medium

**M8 — No in-app proposal card; E3 confirmations are plain text on both channels.**
*Where:* SSE contract has no `proposal` frame (`route.ts`, `ElayaChatShell.tsx`); no Approve/Dismiss component exists.
*What:* CLAUDE.md mandates "Proposal cards always have exactly two actions: Approve and Dismiss." The safety-relevant interaction (lead state change / reassign / delete) is confirmed by typing "yes," with no before/after card. The backend is strong (default-cancel, injection-proof, TTL + relayed-ask gate), so this is a **UX/contract gap, not a silent-execution hole**.
*Fix:* Add a `proposal` SSE event `{tool, summary, before, after, actionId}`; render via `modal.tsx type='elaya'` (already Approve+Dismiss) wired to `executeProposedAction`. Architectural (new client-driven execute path) — keep WhatsApp on text. **L effort.**

**H4b — No template fallback / retry when the WhatsApp 24h window is closed.**
*Where:* `sendElayaWhatsAppReply` (now correctly reports non-delivery after the H4 fix).
*What:* Delivery truth is now logged correctly, but when the session window is closed the staff member still gets nothing — there is no template-based fallback to re-open the window or a retry. Lower priority now that it fails loudly instead of silently.
*Fix:* On a closed-window non-delivery, send a session-reopen template (or queue + notify in-app).

**M9–M12 — Capability gaps (see §5).** No deal-record tool, no WhatsApp-to-lead send, no manager oversight reads (escalations / overdue / domain-health), no admin/founder business reads (budget / campaign / usage / targets), customer persona unbuilt. Backing services exist for the read tools — these are "wrap + wire + per-role gate," not new queries.

### 🟢 Low / nit (grouped — all still open)

- **`create_lead_task` on unassigned lead** silently assigns to caller (`lead-mutations.ts`) — disclose the resolved assignee.
- **Inline WhatsApp writes from voice** have no review step (in-app mic lands as editable draft; WhatsApp auto-routes). Echo transcript before write.
- **`get_my_tasks` caps (25/20/25)** drop tasks with no "showing N of M" note.
- **3-char search gate** silently degrades a 1-2 char query to an unfiltered listing (`registry.ts`) — return `searchTooShort:true`.
- **`get_performance_snapshot`** has no domain arg for admin/founder.
- **`get_helpdesk_content`** remaps non-Gia domains to onboarding without labelling the source.
- **`executed`-row audit insert failure is swallowed** (`elaya-actions-service.ts`) — a real write can leave no ledger row. Add a metrics counter.
- **`supersedePriorProposals` failure swallowed** → two live proposals possible. A partial UNIQUE index on `(conversation_id) WHERE status='proposed'` would enforce one-live at the DB.
- **`executeProposedAction` can leave a `proposed` row after the write succeeded** — stamp-at-execution-start so a lingering row auto-dismisses.
- **No "no"/cancel acknowledgement** — add a deterministic decline line.
- **`delete_task` has no before-snapshot** (only existence re-check).
- **No per-turn inline-write idempotency** — a model double-emit creates duplicate notes/tasks.
- **Cross-channel confirmation** — a "yes" on WhatsApp confirms an in-app proposal (session is channel-agnostic). Document or compare channel.
- **Token accounting ignores cache read/creation tokens** — usage meta undercounts (no consumer today, dormant).
- **`isError` flag discarded by the brain** — thread it into the Anthropic `is_error` field.
- **Breathing glyph ignores `prefers-reduced-motion`** (`design-tokens.css`) — add the media-query gate (the codebase already gates `.serene-oversight-pulse`).
- **Empty/whitespace final reply renders a blank bubble** (`ElayaChatShell.tsx`) — use `content.trim().length === 0` in the done/finally paths.
- **Streamed transcript has no `aria-live`** (`ElayaChatShell.tsx`) — `role="log" aria-live="polite"`.
- **Tool-status labels drift** — `TOOL_STATUS_LABELS` covers some read tools, none of the write tools; a mutation shows "Checking Serene…". Derive from the registry.
- **Mid-stream disconnect** leaves a frozen partial bubble; server persists full text → reload divergence.
- **Per-IP rate limit** is in-memory per-lambda and keyed on spoofable `x-forwarded-for`; the DB daily cap is the real bound. Key on `profile.id`.
- **PII gateway is a model-input boundary, not a transcript boundary** — assistant prose persists real names + last-4 phones (staff-readable, no new leak; doc clarity).
- **Cap check is TOCTOU** — concurrent messages can exceed the soft cap by one.
- **WhatsApp media caption discarded** — a screenshot + typed question gets the "text only" nudge; route the caption as text.
- **Voice download has no timeout/size cap** (`elaya-whatsapp.ts`) — add AbortController + byte cap (mirror 32MB `MAX_INBOUND_MEDIA_BYTES`).
- **Collision lead lookup runs before the idempotency check** (`elaya-whatsapp.ts`) — reorder.

---

## 5. Gaps & Missing Capabilities

### By role — what each still can't do

| Role | Can't do via Elaya |
|---|---|
| **Agent** | Record a won deal; send WhatsApp to a lead (only a reminder task); get tasks/group/performance fully over WhatsApp (group + performance refer to the app) |
| **Manager** | See escalations / SLA breaches, overdue Gia tasks, or domain-health — the **entire oversight loop** is outside Elaya (services exist: `getEscalatedLeads`, `getOverdueGiaTasks`, `getDomainHealthMetrics`) |
| **Admin/Founder** | Ask about **budget/spend, campaign CPL/ROAS, usage/adoption, domain targets** — every backing service exists (`getBudgetSummary`, `getCampaignMetrics`, `getAgentUsage`, `getDomainTargets`), none wrapped. Also no domain-scoped performance |
| **Everyone** | **Cross-session memory** (`user_context` read but never written, 0 rows), add a task remark / subtask / edit checklist or tags after creation (`createSubtaskCore` exists, unwrapped) |
| **Customer (future)** | **Everything** — `resolveCustomerPrincipal()` is a hard-throwing stub; no customer toolset, persona branch, or inbound routing |

### Unbuilt scaffolding (paid for, no behaviour)

- **`user_context` durable memory** — read every turn into the cached prompt, but zero writers anywhere. The "from past sessions" prompt line never renders (gated on non-empty).
- **Customer WhatsApp persona** — declared roadmap phase, intentionally fenced behind a throw.
- **Inline-suggestion surface** + 400ms-delay — documented in CLAUDE.md as one of four surfaces, not built.
- **Uniform read toolset** — all roles get the same read tools; `TOOLSET_BY_ROLE` supports per-role reads but only writes use it. Will need real read-gating once founder-only business tools land.
- **Sessionless RPC twins for group-tasks + performance** — would let those WhatsApp tools return real data instead of referring to the app (needs explicit-param, admin-only RPC variants — scope-param migrations, Q-13 posture).

---

## 6. Enhancement Roadmap (remaining)

Effort: **S** ≤1 day · **M** ≈2-4 days · **L** ≈1-2 weeks.

| # | Item | Effort | Value |
|---|---|---|---|
| R-1 | **Manager oversight reads** — `get_escalations`, `get_domain_health` (M11) | M | Serves the manager's primary question; services already exist |
| R-2 | **Founder business reads** — budget/campaign/usage/targets, role-gated (M12) | M | Highest-leverage questions for the top role; services exist |
| R-3 | **In-app proposal card** (M8) | L | Brings the safety-critical surface on-spec; clear before/after |
| R-4 | **Sessionless RPC twins for group-tasks + performance** | M | Restores those two tool families fully on WhatsApp (currently refer to the app) |
| R-5 | **`user_context` writer** (routing-tier post-turn summarizer, bounded 1500 chars) | M | Activates dormant cross-session memory |
| R-6 | **Deal-record + WhatsApp-send tools** (M9/M10, propose-tier) | M | Completes the sales-day close + outbound contact |
| R-7 | **`create_subtask` tool** (wrap existing `createSubtaskCore`) + `update_task` tags | S | Makes `create_group_task` actually useful |
| R-8 | **Customer WhatsApp persona** (principal + persona branch + webhook routing) | L | Opens the revenue-side external surface |
| R-9 | **Per-role read toolset gating** + **regenerate `database.ts`** (drop `as any`) | S/M | Prereq for founder tools; removes standing type-debt |
| R-10 | **WhatsApp closed-window template fallback** (H4b) | M | Re-opens the session window when a reply can't be delivered |
| R-11 | **Low/nit cluster** — reduced-motion, blank-bubble, aria-live, tool-label drift, caption routing, etc. | S | UX/a11y compliance |

---

## 7. Quick Wins (remaining — small fixes, outsized payoff)

1. **Reduced-motion gate for `.elaya-breathe`** — one `@media` block; fixes a WCAG vestibular issue on an always-on element.
2. **Blank-bubble guard** — change `length === 0` to `content.trim().length === 0` in the done/finally handlers; stops the empty-bubble-on-success glitch.
3. **`aria-live` on the streamed transcript** — `role="log" aria-live="polite"` so screen readers announce replies.
4. **Tool-status labels from the registry** — so a mutation doesn't show "Checking Serene…".
5. **`create_subtask` tool** — wrap the existing `createSubtaskCore` so `create_group_task` is actually usable.
6. **Reorder WhatsApp collision lookup after the idempotency check** — saves a DB round-trip per message/duplicate.

---

*Sources: 12-dimension capability + adversarial-verification audit (verifier `isReal` verdicts honoured throughout), completeness critic, and live production config gathered 2026-06-25. Fixed findings removed 2026-06-25 after batches 1 + 2 shipped; see `docs/changelog.md`.*
