# The Elaya Plan. The AI layer, from today to the beast.

> **Proposed reliability and efficiency tranche, 2026-10-01:** use [Elaaya reliable agent architecture](elaya-reliable-agent-plan.md) for the new execution paths, freshness/evidence contracts, action receipts and incremental rollout. Its measured basis is the [October cost audit](../audits/2026-10-01-elaya-cost-architecture.md). These are planned changes, not a replacement of the shipped-status history below or a restart of the full Python migration.

> **Where this stands on 2026-09-30.** Moved here from the repo root (`plan-elaya.md`) on
> 2026-09-30. Today's truth is `docs/modules/elaya.md` and `docs/modules/elaya-analyst.md`; the
> overall order and a full status board are in `master-plan.md` section 6.
>
> - **Phase 0, evals:** shipped 2026-08-27. About 60 cases today (35 core, 25 founder), fewer than
>   the 150 to 200 planned. "Last week" and the Marathi yes are still known failures. The failure
>   dashboard took other shapes: `evals/review.py`, the Elaya chats page (2026-09-29), silent-turn
>   alerts and the team's improvement requests (0237).
> - **Phase 1, the Python brain:** mostly shipped. Both channels run on Python since 2026-09-04.
>   The router and specialists came 2026-08-28 (4, now 10); on 2026-09-24 tool search replaced
>   router gating, and the router now only picks the tools loaded up front and a playbook. No
>   Bedrock (the direct Anthropic API is used), no CI/CD, and the rollback has been kept far longer
>   than a week (Node brain retirement targeted for 2026-10-16).
> - **Phase 2, writes in Python:** changed course. Writes stay in Node's cores and the Python brain
>   calls them through `/api/elaya/bridge` ("Python thinks, Node mutates").
> - **Phase 3:** 3a partly (the deep read runs long jobs, 0235; no PDF). 3b partly (the founder
>   brief twice a day, repeat task reminders, the alert sweep built but off; no agenda injection).
>   3c shipped, but in Node, not Python (members, tickets, vendors, the profiler; see
>   `member-ticket-plan.md`). 3d not started (confirmation is English and Hinglish only).
> - **Phase 4:** 4b, real-time voice, was built first (LiveKit, 2026-09-28, 0247) and is not
>   deployed yet. 4a, spoken replies on chat and WhatsApp, is not started.
> - **Phases 5 and 6:** not started. The `/m` phone layer stands in for the app.
> - **Decisions:** 1 held for the brain only; 2, 3 and 4 held; 5 (Bedrock) did not happen; 6 and
>   7 are still "later".
>
> **Purpose:** the module plan for everything AI: the evals, the Python brain, the router and specialists, reports, proactive Elaya, voice, multilingual, and our own models.
> **Sits under:** `master-plan.md` (start there for the overall sequence and the locked decisions). This file is the deep detail for the AI track.
> **Audience:** us. Written in plain language on purpose.
> **Decided:** 2026-08-24, after the full Elaya audit (see `docs/audits/2026-08-24-elaya-workflow.md`).
> **Status:** agreed direction. Phase 0 (evals) is the immediate work.

---

## 1. The vision, in one paragraph

Elaya becomes the personal AI agent for every Indulge employee. She understands what you want in any language you speak, she is firm on real data and corrects you when the data disagrees, she does the manual work herself (reports, PDFs, task assignment, reminders), she talks in real time voice, she profiles every client from thousands of live WhatsApp chats and builds concierge tickets that make our agents faster, and over time she runs on models trained on our own data. White labeled as Indulge OS. The most powerful internal system Indulge has.

---

## 2. The big decisions, made

These were debated. They are now decided. We do not reopen them without new evidence.

| # | Decision | The call |
| --- | --- | --- |
| 1 | **Backend language** | We move the backend to **Python (FastAPI)**. Not because Python is faster (it is not, the model API is the latency, not the language). Because: (a) the serious future work is AI-heavy and that ecosystem lives in Python (profiling pipelines, embeddings, voice pipelines, and later fine-tuning our own models), (b) the mobile app needs a real API backend anyway, and one Python API can serve web + mobile + WhatsApp, (c) the team reads Python as well as Node, (d) the codebase is the smallest it will ever be right now, so the port is cheapest today. |
| 2 | **When to switch** | **Now, at the AWS move, but only after evals exist.** Evals are the safety net that proves the Python version behaves exactly like the current one. We never flip a switch without the exam score to back it. |
| 3 | **How to switch** | **Strangler migration, never big bang.** The current system keeps running and serving users. We port one organ at a time to Python, prove it with evals, flip traffic, then port the next. At no point is Serene down or half-broken. |
| 4 | **Hosting** | **Backend on AWS (ECS Fargate). React frontend stays on Vercel.** Supabase stays exactly where it is (it is our database, auth, storage, and realtime, and it is already hosted). Redis stays on Upstash for now. |
| 5 | **The model** | **Claude via AWS Bedrock** once we are on AWS. Same models, same intelligence, but running inside our AWS account. One bill, better data story, fits the white label narrative. We do NOT self-host a big model (see section 8, the honest physics). |
| 6 | **Our own model** | Comes **later, through distillation**, not through pretraining. We are already collecting the perfect training data every day (every Elaya conversation and every confirmed action in the ledger). In time we fine-tune small fast models on that data for routing and easy tasks. The big reasoning brain stays on the frontier API model. |
| 7 | **Mobile** | **React Native app, later** (Phase 5). The architecture we build now (thin frontend, one Python API) is exactly what makes the mobile app cheap to build when its time comes. Until then the browser shortcut works on phones. |

---

## 3. The laws that never change

The rebuild changes the language and the hosting. It does NOT change the laws. Every one of these carries over to Python, byte for byte in spirit. `docs/audits/2026-08-24-elaya-workflow.md` is the full spec and it is the port instruction manual.

1. **The Golden Rule.** Permissions live in code, decided from the verified identity BEFORE the model runs. No prompt, note, memory, chat message, or training content can ever widen access.
2. **The two tier write protocol.** Small writes happen instantly. Big writes (status change, reassign, deal, delete) record a proposal and wait for a human yes. The yes is classified by pure code reading only the human's message.
3. **One write path.** Every mutation goes through one shared core that owns cache invalidation, SLA, notifications, and audit. The UI and Elaya call the SAME core. Never two copies of "update lead status" alive at once. This rule is what the migration must protect hardest.
4. **The parity rule.** Anything Elaya can do on one channel she can do on every channel, by construction. Reads take the verified principal and scope in code, never from a login session.
5. **The audit ledger.** Every write Elaya makes leaves a row with before and after snapshots. Always.
6. **The PII gateway.** Tool results are masked before any model sees them.
7. **Evals gate every change.** After Phase 0 exists, no prompt, tool, or model change ships without running the exam. Score up, ship. Score down, fix first.

---

## 4. The target architecture

```
  React web app          React Native app         WhatsApp (Gupshup)
   (Vercel)               (later, Phase 5)              |
      |                        |                        |
      +------------------------+------------------------+
                               |
                               v
              PYTHON BACKEND  (FastAPI on AWS Fargate)
              THE one API for everything
              |
              |-- Elaya agent runtime
              |     router (fast, small model) -> specialist agents
              |     (Leads agent, Tasks agent, Analytics agent, General)
              |     each = trimmed toolset + focused prompt + model tier
              |
              |-- Mutation cores (the ONE write path)
              |-- SIA: client profiling pipeline (group chats -> profiles -> tickets)
              |-- Job workers (reports, PDFs, scheduled nudges, reminders)
              |-- Voice service (WebSocket, realtime, Phase 4)
              |
              |-- Claude via AWS Bedrock (the intelligence)
              |
              v
       Supabase (Postgres + RLS + Auth + Storage + Realtime)   [stays put]
       Redis (Upstash)                                          [stays put]
```

Why this shape wins:
- **One API serves three frontends.** Web today, WhatsApp today, mobile later. Build a feature once, every surface gets it.
- **A persistent server, not serverless.** No 180 second ceiling, no frozen lambdas, WebSockets work, Elaya can wake up on her own schedule. This is what unlocks voice, long reports, and proactive reminders.
- **The database does not move.** The riskiest part of most migrations (the data) has zero risk here because Supabase stays exactly where it is. Old backend and new backend read the same tables during the whole transition.

---

## 5. The phases

### Phase 0. Evals and quick wins. (2 to 3 weeks, starts now, on the CURRENT system)

This comes first because everything else depends on it.

**What is an eval, in plain words:** an exam paper for the AI. We collect 150 to 200 REAL messages our team actually sent to Elaya (straight from the database, typos and Hinglish included), and for each one we write the answer key: which tools she must call, with which arguments, and what she must NOT do. A script runs all of them and prints a score: "183 out of 200 passed, here are the 17 failures." 

**Why it matters this much:**
- Today every prompt tweak ships blind. Fix one bug, silently break three others, nobody knows until a user hits it. That is exactly why bugs keep appearing. With evals, every change gets a score before it ships.
- "Elaya is buggy" becomes a ranked list: "she fails 8 of 10 date questions and 5 of 10 name questions." Now we know what to fix first.
- It is the migration insurance. The Python port is DONE when it scores equal or better on the same exam. Not before.

**The work:**
1. Build the eval harness **in Python** (it hits the API from outside, so the same harness tests the old system now and the new one later, unchanged).
2. Pull real conversations from `elaya_messages`, annotate the golden set.
3. Check the live `llm_providers.reasoning` row and upgrade the model. One database edit, likely the single biggest accuracy jump available. Verify with the evals.
4. Small failure dashboard from data we already log (turn errors, tool failures, dismissed proposals, iteration ceiling hits).
5. Fix the top bugs the evals reveal. Known suspects: date edge cases, name disambiguation, wrong tool picks, the missing "last week" period, non-Hinglish affirmatives being treated as a no.

**Done when:** the exam runs with one command, the score is stable and known, and the top 5 bug classes are fixed.

---

### Phase 1. AWS foundation and the Python brain. (6 to 8 weeks)

The port begins. Strangler style: the current system keeps serving users the whole time.

**The work:**
1. Stand up the AWS side: ECS Fargate, the FastAPI skeleton, Bedrock access, CI/CD (push code, container deploys itself).
2. Port the Elaya agent runtime to Python using `docs/audits/2026-08-24-elaya-workflow.md` as the spec: principal resolver, the tool registries, the PII gateway, the confirmation classifier, the brain loop, the persona builder. Same laws, same gates, same caps.
3. Build the **router and specialists** directly in the new brain (do not port the 24-tools-in-one-prompt design, it is a known weakness):
   - A fast small model classifies each message in about 300ms: is this about leads, tasks, analytics, or general chat?
   - It hands off to a specialist: trimmed toolset (5 to 8 tools instead of 24), short focused prompt, right sized model.
   - Fewer tools per prompt = fewer wrong tool picks = fewer bugs, faster, cheaper. This is the orchestrator vision, right sized.
4. Point the WhatsApp webhook and the chat endpoint at the Python service **behind a flag**, run the SAME eval set against both brains.
5. Flip traffic when the Python brain scores equal or better. Keep the old path for one week as the instant rollback.

**Done when:** all Elaya traffic (in app + WhatsApp) runs through Python on AWS, eval score is equal or better than the old system, rollback path retired.

---

### Phase 2. One write path in Python. (3 to 4 weeks)

1. Port the mutation cores (lead and task writes, with their cache invalidation, SLA arming, notifications, audit) to the Python API.
2. The Next.js server actions become thin callers of the Python API. The React app changes almost nothing visually.
3. From this point there is exactly ONE place in the company that knows how to update a lead. Web, WhatsApp, Elaya, and the future mobile app all call it.

**Done when:** no business write happens in TypeScript anymore. Next.js is a display layer.

---

### Phase 3. The serious new capabilities. (parallel tracks, 2 to 3 months)

Now the new stuff gets born natively in Python. Three tracks, can overlap.

**3a. Reports and long jobs.**
- A third tool tier: the "long job". Elaya says "On it, your report will be on WhatsApp in a minute", dispatches a background job, and delivers when done. No more everything-must-finish-inside-one-turn.
- The PDF generator on our template. Manager asks on WhatsApp "send me last week's onboarding report", Elaya pulls the real data, renders the PDF, sends it as a WhatsApp document. The flagship use case, fully closed.

**3b. Proactive Elaya.**
- **Agenda injection** (days of work, huge felt intelligence): when a user starts talking to Elaya, she already fetched their due-soon tasks, overdue items, and pending things, and naturally weaves them in. "Haan bolo. By the way, Advita wali report kal 4 baje due hai, progress theek hai?"
- **She speaks first**: scheduled sweeps that send a WhatsApp or push nudge before a deadline. With hard caps and per-user controls so she is helpful, never spammy.

**3c. Client profiling and concierge tickets. (the SIA module, the bigger half of Serene)**

Sia is the client-operations side of Serene, separate from Gia (the onboarding CRM and its Gupshup WhatsApp). Sia's data comes from the Baileys group-watching layer, planned fully in `sia-whatsapp-plan.md`.
- Every inbound WhatsApp chat feeds a live client profile: who they are, what they want, budget signals, occasions, preferences, history. Extracted by the model, stored structured, updated continuously.
- Concierge tickets are built on top of profiles, so an agent picking up a client sees the full picture in one card instead of scrolling a thousand messages.
- This module gets its own detailed spec before building (like the Elaya doc). It is a pipeline: ingest, extract, merge into profile, index, surface. Python native, built once, powering both Elaya's answers and the agents' screens.

**3d. Full multilingual.**
- Text: mostly free, the persona already mirrors language. Add Marathi, Kannada, Urdu, and others to the confirmation classifier so a "ho kara" yes is not treated as a cancel.
- Voice input: replace the hardcoded Hinglish transcription setting with language detection, so a Marathi voice note transcribes correctly.

---

### Phase 4. Voice. (after 3 is moving)

- **4a, voice replies:** Elaya answers with a voice message (text to speech) on the existing chat and WhatsApp. Cheap, ships fast, feels magical.
- **4b, realtime conversation:** open the app, talk, she talks back, live. A WebSocket voice pipeline in the Python backend (this is exactly why we moved to a persistent server). Full company data, full tool access, same permission laws.

---

### Phase 5. The mobile app.

- React Native (so the React knowledge transfers), iOS first.
- It consumes the SAME Python API as the web app. Because of Phase 2, most features exist the day the app shell is built. Push notifications, voice, Elaya, tasks, all of it.

---

### Phase 6. Our own models.

- By now the ledger holds months of real conversations, real tool calls, and real human confirmations. That is a labeled training dataset, collected free, that no competitor has.
- We fine-tune (distill) small open models on it for the high-volume easy work: the router, call logging, simple lookups. Self-hosted on a modest GPU, answering in 200 to 400ms, genuinely ours, genuinely cheap at that size.
- The heavy reasoning stays on the frontier model via Bedrock. Small fast us-models for the easy 70 percent, frontier brain for the hard 30 percent. That hybrid IS the beast.
- Only shipped when evals prove each small model matches the big one on its slice. Numbers decide, not vibes.

---

## 6. The order, at a glance

```
NOW      Phase 0   Evals + model upgrade + top bug fixes        (current system)
NEXT     Phase 1   AWS + Python brain + router/specialists      (the port, evals gate the flip)
THEN     Phase 2   One write path in Python                     (Next.js becomes display only)
THEN     Phase 3   Reports/PDF, proactive Elaya, client         (the serious new work,
                   profiling + tickets, full multilingual        born in Python)
THEN     Phase 4   Voice: replies first, realtime after
THEN     Phase 5   React Native mobile app (same API)
LATER    Phase 6   Distilled own models for the easy 70%
```

Rough honest timeline: Phases 0 through 2 are about one quarter. Phase 3 is the following quarter. 4 and 5 after that. Dates flex, the ORDER does not, because each phase is the foundation of the next.

---

## 7. The rules of the migration

1. **Evals before the port. The port is done when the score says so.** Never flip on a feeling.
2. **Strangler, never big bang.** The old system serves users until the new organ provably works. Rollback stays available for a week after every flip.
3. **One write path, always.** The transition window where writes exist in two languages is kept as short as possible, and during it, each entity has exactly one owner.
4. **The database never moves.** Supabase is the fixed ground both systems stand on.
5. **The laws port unchanged.** Golden Rule, propose and confirm, parity, ledger, PII gateway, caps. `docs/audits/2026-08-24-elaya-workflow.md` is the contract.
6. **No new feature lands in the old backend** once Phase 1 starts. New work waits for, or lands in, Python. Otherwise the pile to port grows forever.

---

## 8. Things we decided NOT to do, and why (so we do not re-debate them)

| Not doing | Why |
| --- | --- |
| Self-hosting a big model for latency | Nobody can host Claude (weights are never released). Open models big enough to matter cost lakhs per month in GPUs and are WORSE at tool calling, so bugs would go up. And the latency belief is wrong anyway: a reply spends about 90 percent of its time on the model thinking, not on the network. Hosting it next door saves a few hundred milliseconds of a five second turn. The real speed wins are the router, streaming, caching, and acknowledge-then-deliver. |
| Big bang rewrite | Every bug scar in the current code (double delivery races, IST dates, stale caches, stale confirmations) was paid for with a real incident. A from-scratch rewrite pays for all of them again. The strangler keeps them paid. |
| Building N fine-tuned models now | Specialists today are profiles (toolset + prompt + model tier), not separate trained models. Training comes in Phase 6 when the data has accumulated and evals can judge the result. |
| Moving off Supabase | It already does Postgres, auth, RLS, storage, and realtime, hosted. Moving it is all risk, no reward. |

---

## 9. What we start this week

1. **Eval harness + golden set** (Python, hitting the current API). First 100 real messages annotated.
2. **Check and upgrade the live `reasoning` model row.** One DB edit, measured by the new evals.
3. **The failure dashboard** from the data already being logged.
4. **Draft the specialist split on paper** (Leads / Tasks / Analytics / General) so Phase 1 starts with a spec, not a debate.

That is the plan. Foundation first, port with a safety net, then the serious work, then voice, then mobile, then our own models. Every phase makes the next one cheaper.
