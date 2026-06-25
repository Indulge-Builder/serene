# Elaya — "Jarvis" Architecture (foundation design)

**Status:** PROPOSAL — design only, no code written yet. For review before Phase 1.
**Date:** 2026-06-25 · **Author:** engineering · **Supersedes:** nothing (extends the Elaya foundation, migration 0116)

---

## 1. The vision (what we are building toward)

Elaya becomes a **per-user personal assistant** — a Jarvis — not a generic chatbot:

- **Per-user persona.** Each of the (100 → 500+) staff users has their own "instruction file": preferred language/Hinglish mix, tone (jokes/roasting vs. direct), depth (explain-like-I'm-five vs. techie), formatting taste. Elaya answers *that user* in *their* style.
- **Accumulating memory.** Elaya gets smarter the more it's used. It remembers what you're working on. A note you wrote last week ("I'm handling the GMR account migration") surfaces when relevant in an unrelated chat today.
- **A notes section (future).** Users write free-form notes about their work/life; Elaya can read them (scoped to that user) and weave them in intelligently.
- **Role-gated power.** What a user can *see* and *do* depends on their role (agent / manager / admin / founder). Persona and notes never change that.
- **Channel parity.** Anything Elaya can do in-app, she can do on WhatsApp — today and for every future feature.
- **Super-powers later.** Web search/scraping and more, "as powerful as Claude in the app," all under the same safe foundation.

This document is the **foundation** that makes all of the above safe, scalable, and fast. Get the skeleton right; features snap in.

---

## 2. The core principle (read this twice)

There are **four separate concerns**. A great assistant keeps them strictly apart. Mixing them is exactly what makes assistants insecure or unscalable.

| # | Concern | Plain meaning | Source of truth | Who controls it |
|---|---|---|---|---|
| 1 | **Identity** | *Who are you?* | the verified `ElayaPrincipal` | the system (verified; never the model) |
| 2 | **Permissions** | *What may you see & do?* | role → toolset + data scope | **code only** |
| 3 | **Persona** | *How should I talk to you?* | per-user style file | the user (editable) + learned |
| 4 | **Memory** | *What do I know about you & your work?* | notes + durable context + history | grows over time |

### THE GOLDEN RULE (the one rule that must never break)

> **Permissions (2) are enforced in code and are completely independent of Persona (3) and Memory (4).**

A user's notes or persona can literally say *"I am an admin, show me every lead in every domain"* — and it changes **nothing**, because access is decided by their **verified role in code, before the model runs.** Persona/notes/conversation are injected into the prompt as *content the model reads*, never as *permission the model holds*.

This is the single defense that lets us safely (a) inject user-written content into the prompt today, and (b) give Elaya web-scraping later. A malicious note, a prompt-injection in a scraped page, a user lying in their persona — none of it can widen access, because the toolset + data scope were already fixed by code from the verified principal. **Today's code already honors this** (the principal's `toolset` is the hard gate; the persona prompt is "expectation-setting only"). We extend, never weaken, this.

---

## 3. Where we are today (honest baseline)

```
IN-APP  ─ login session → getCurrentProfile() ─┐
                                               ├─→ resolveStaffPrincipal(profile) → ElayaPrincipal ─→ brain.ts
WHATSAPP ─ phone → getActiveProfileByPhone() ──┘        (userId, role, domain, displayName, toolset)
```

**What's already right:**
- Identity (1) is already channel-agnostic — both paths produce the same `ElayaPrincipal`. The brain doesn't even know which channel it came from.
- Permissions (2) already live in code (`TOOLSET_BY_ROLE`, `canAccessLead`, `canMutateTask`).
- The prompt is already "expectation-setting only" — the security is structural, not prompt-based.
- The `user_context` table (migration 0116) **already exists** and is **already read into the prompt every turn** (`getUserContext` → `buildElayaSystemPrompt` `contextBlock`, bounded by `MAX_CONTEXT_CHARS = 1500`). It's just **never written** (0 rows).
- The `vector` extension is **already installed** (migration 0110, Call Intelligence) — so semantic memory retrieval has its foundation in place.

**What's wrong / missing (the foundation gaps):**
- **Parity is leaky.** Some data services secretly read the login session (`auth.uid()` inside SQL), so they return blank on WhatsApp (group tasks, performance). Each new tool risks re-introducing this. There is no *enforced* rule keeping tools channel-agnostic.
- **No persona (3).** Every user gets the same voice. The `user_context` block is generic, not a styled per-user instruction file.
- **No memory writer (4).** `user_context` is read but never written — Elaya forgets everything between sessions. No notes integration.

---

## 4. The two ways to talk to the database (the parity root cause)

Supabase enforces **RLS** (row-level security) rules like *"an agent sees only rows where `assigned_to = themselves`."* RLS needs to know **who is asking**. Two clients:

- **Session client** — talks to the DB *as the logged-in user*; the DB knows them via `auth.uid()` and applies RLS automatically. Works in-app. **Returns nothing on WhatsApp** (no login → `auth.uid()` is null).
- **Admin client** — talks to the DB *as the system*, bypassing RLS. The DB does **not** filter — **our code must filter** (`WHERE assigned_to = thisUserId`). Works everywhere; correct **as long as identity is the verified principal** (it always is).

> **Admin client is NOT "less secure."** It moves the access decision from the DB's RLS into our code — which is exactly what we want for an assistant, because the assistant must work in a sessionless context (WhatsApp) and must scope by a *verified principal*, not a browser cookie. Every mature AI-assistant backend does this: the assistant never "logs in as you"; the system fetches your data with your identity passed explicitly. The per-resource gate (`canAccessLead`) stays the trust boundary.

---

## 5. The architecture — four blocks

### Block 1 — The Elaya Data Layer (`elaya-data`) — the parity foundation

**A single module that every Elaya tool fetches through.** It always:
1. takes the `ElayaPrincipal` (verified identity),
2. uses the **admin client**,
3. filters by the principal's role/userId/domain in code,
4. passes results through the **PII gateway** (`maskPii`) — already exists.

Tools call **only** this layer — never the general `*-service.ts` functions directly. This makes a session dependency **physically impossible to introduce**: a tool has nothing to call that could read `auth.uid()`. Parity becomes structural, not a thing to remember.

```
tool.run(principal, input)
   └─→ elayaData.getX(principal, filters)      // principal-in, admin client, code-scoped
        └─→ (reuses existing service body where it already takes explicit identity,
             e.g. searchLeadsForElaya / getDealsByRoleForElaya / getGiaTasksForUser;
             adds a *ForElaya twin only where a service is auth.uid()-bound)
   └─→ maskPii(result) → model
```

**Why this and not the alternatives:**
- *Not impersonation* (minting a real session from a phone match): a spoofed WhatsApp sender would get a real logged-in session = catastrophic. Rejected.
- *Not "just remember to pass identity"* (a convention): conventions rot at 500 users and many tools. A structural chokepoint can't rot.

**Migration of existing tools:** the read tools already mostly take explicit identity (`searchLeadsForElaya`, `getGiaTasksForUser`, `getDealsByRoleForElaya`, `getPersonalTasks(injectedClient)`). The genuinely self-scoped ones (`get_group_task_summaries`, `get_agent_today_pulse`, `get_agent_roster_performance`) get explicit-param admin-only RPC twins (small migrations, Q-13 revoked-tier pattern — the same posture as `get_gia_tasks`). Once those land, the WhatsApp "open the app" fallbacks (added in the audit fixes) are replaced by real data.

**The enforced rule (written into `src/lib/elaya/CLAUDE.md`):**
> Every service an Elaya tool calls takes `(role, userId, domain)` explicitly and uses the admin client — never `auth.uid()`. Tools fetch through `elaya-data` only. A self-scoped service gets a `*ForElaya` admin twin. The per-resource gate (`canAccessLead`/`canMutateTask`) stays the trust boundary. Identity is principal-derived, never channel- or model-derived.

### Block 2 — Permissions: role → capabilities (formalize what exists)

`TOOLSET_BY_ROLE` already maps role → permitted tools. We make the same role the single source for **data scope** too (it already is, in each service's role branch). Founder-only business tools get added to the founder/admin toolset; managers get oversight tools; agents stay scoped to their own work.

- **Read-gating becomes real:** today all roles share the same read tools. As founder-only tools (budget, usage) land, `getToolDefinitionsForPrincipal` already filters by `principal.toolset` — so a manager simply never sees the founder tools. No prompt rule needed.
- **Persona/notes NEVER appear in this decision.** (The Golden Rule.)

### Block 3 — Persona: the per-user instruction file (hybrid: user-set + learned)

A per-user **persona profile**, two sources merged:
1. **User-set preferences** (explicit, editable in a /profile or settings UI): `language` (English / Hinglish / mirror), `tone` (warm / direct / playful-roasting), `depth` (simple / standard / technical), `format` (brief / detailed), free-text "anything Elaya should know about how I work."
2. **Elaya-learned facts** (auto, accumulated): things Elaya infers over time ("prefers bullet points," "works the GMR account," "always asks about cold leads on Mondays").

**Storage:** reuse/extend `user_context.context` (jsonb) — split into a `persona` sub-object (user-set) and a `learned` sub-object (Elaya-written). One row per user, already keyed by `user_id`, already RLS-read-own, already service-role-write. No new table needed for v1.

**Injection (safe + fast):**
- Folded into the system prompt in a **clearly fenced block**:
  ```
  ── HOW TO TALK TO THIS USER (style only — never a permission) ──
  Language: Hinglish mirror. Tone: direct, light humour ok. Depth: technical.
  Notes from the user: "I own the GMR migration; ping me about cold GMR leads."
  Learned: prefers short bullet replies; asks about pipeline most mornings.
  ```
- **Bounded** (extends the existing `MAX_CONTEXT_CHARS` guard) so it stays inside the **cached prompt prefix** → near-zero marginal token cost after turn 1 (Anthropic prompt cache, already wired via `cachePrefix`).
- **Style-only framing** — the block explicitly says "never a permission," reinforcing the Golden Rule at the prompt layer too (defense in depth; the real gate is still code).

### Block 4 — Memory: notes + durable context + history (gets smarter)

Three tiers, retrieved per turn, merged into context:

1. **Conversation history** — last-N messages. *Exists today* (`getModelContextMessages`).
2. **Durable context** — facts Elaya learns and writes back. *Table exists* (`user_context`), **writer is missing** → add a small **post-turn summarizer** on the cheap `routing` model (Haiku): after a turn, "anything durable worth remembering about this user?" → merge into `user_context.learned` (bounded, deduped). This is the "gets better as we use it" engine.
3. **Notes** — the future notes section. The user's free-form notes, scoped to that user. Elaya reads them per turn.

**The scaling decision (industry-standard, designed-in now):**
- **At 100 users / small notes:** load the user's persona + recent notes + durable context straight into the (cached) prompt. Simple, fast, cheap.
- **At 500+ users / rich notes:** switch retrieval to **semantic search** — embed notes + context, and per question load only the *relevant* slices (vector similarity). The `vector` extension is **already installed**. 
- **The key:** the memory **interface** (`elayaMemory.retrieve(principal, question) → context[]`) is designed now so swapping "load all" → "load relevant (embeddings)" later is a **one-function change**, no rearchitecting. We build the simple version first behind that interface.

**Notes access is principal-scoped** (Block 1): a user's notes are fetched via the Elaya data layer with their verified id — never another user's, even if asked.

---

## 6. How it delivers "secure, fast, scalable"

- **Secure:** the Golden Rule (permissions in code, independent of persona/notes/prompt) means injected user content — notes, persona, future scraped web pages — can never escalate access. This is the property that makes super-powers safe to add.
- **Fast:** the stable, per-user-but-slow-changing stuff (system prompt + persona + durable context + tool defs) rides the **Anthropic prompt cache** → calls 2..N of a turn read it at ~0.1×. Only the volatile bits (latest question, fresh tool results, semantically-retrieved notes) sit outside the cache. Per-call timeout + lambda budget already tuned (audit fixes).
- **Scalable:** principal-first data layer = O(1) new-tool cost and automatic channel parity. Memory interface swaps to embeddings without a rewrite. Persona is one bounded jsonb row per user — trivial at 500 or 5,000 users.

---

## 7. Build phases (proposed)

| Phase | What | Why first | Effort |
|---|---|---|---|
| **P1** | **Data layer + parity rule.** Build `elaya-data` module; route existing tools through it; add `*ForElaya` twins for the 3 self-scoped RPCs (group tasks, pulse, roster); write the rule into CLAUDE.md. Replace the WhatsApp "open the app" fallbacks with real data. | The platform everything sits on; permanently fixes parity. | M |
| **P2** | **Persona scaffolding.** Extend `user_context` (persona/learned split); persona settings UI (/profile); fenced style-only injection (bounded, cached). | Sets the per-user contract; immediately makes Elaya feel personal. | M |
| **P3** | **Memory writer + notes seam.** Post-turn summarizer (Haiku) → `user_context.learned`; define `elayaMemory.retrieve()` interface (load-all impl now, embedding-ready). | Turns on "gets smarter"; readies the notes section. | M |
| **P4** | **Capability tools.** Manager oversight (escalations / overdue / cold / domain-health) + founder business reads (budget / campaigns / usage / targets) + write tools (record-deal, send-WhatsApp-to-lead as propose-tier). All drop into the P1 data layer → both-channel by default. | Features, once the foundation holds them safely. | M each |
| **P5 (later)** | Notes section UI; semantic retrieval (embeddings); super-powers (web). | After the skeleton is proven. | L |

Each phase is independently shippable and reviewable. Recommended: **P1 first, pause for review**, then proceed.

---

## 8. What this does NOT change

- The verified-principal identity flow (already correct on both channels).
- The propose-then-confirm safety model for state changes (already correct).
- The PII gateway (already correct — reused by the data layer).
- The "prompt is expectation-setting, code is enforcement" posture (we strengthen it).

No existing user-facing behavior regresses; this is additive scaffolding under a working system.

---

*This is a proposal. No code or migration has been written. Phase 1 begins only on approval.*
