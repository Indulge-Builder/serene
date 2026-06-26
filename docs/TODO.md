# TODO

Open follow-up tasks for Serene. Check items off as they're done.

---

## Email / Brevo SMTP

- [ ] **Verify our sender domain on Brevo (DKIM/SPF) so auth emails stop landing in spam.**
  - Current state: custom Brevo SMTP is configured in Supabase and **emails are sending and working** (password reset, Elaya emails, etc.).
  - Problem: outgoing emails are currently delivered to the recipient's **spam/junk** folder.
  - Cause: the sender domain (`indulge.global`) is not yet fully authenticated in Brevo, so Gmail/Outlook flag the mail as untrusted.
  - Fix: in Brevo → **Senders, Domains & Dedicated IPs** → add and authenticate the `indulge.global` domain (add the **DKIM + SPF DNS records** Brevo provides). Ensure the Supabase SMTP "Sender email" exactly matches a verified Brevo sender.
  - After: send a test reset email and confirm it lands in the inbox (not spam).

## Task-assigned WhatsApp notification — ✅ LIVE (template approved + hardcoded)

- [x] **Template approved + id hardcoded in `whatsapp.ts`** (`1cb3c51f-de37-4ee3-9be1-60bb1659034e`, alongside the other 12). No env var, no Vercel step — it ships in the code. The assignee gets a WhatsApp ping when a task is assigned to them (personal-task-to-another OR a group subtask).
  - **4 variables**, in this order: `{{1}}` assignee first name · `{{2}}` who assigned it (manager/founder name) · `{{3}}` task title · `{{4}}` due date (already formatted IST, e.g. "26 Jun, 4:00 PM", or the literal "no due date" — never blank).
  - **Suggested template body to submit (category: Utility):**

    ```text
    Hi {{1}}, a new task has been assigned to you by {{2}}.

    📋 Task: {{3}}
    🗓 Due: {{4}}

    You've got this — all the best! 💪
    ```

  - Gupshup needs example values for each variable on submission (e.g. {{1}}=Arfam, {{2}}=Karan, {{3}}=Prepare the launch deck, {{4}}=26 Jun, 4:00 PM).
  - After approval: set `GUPSHUP_TASK_ASSIGNED_TEMPLATE_ID=<the id>` in env. If you change the variable order/count, update `templateParams` in `sendTaskAssignedNotification` (`src/lib/services/whatsapp-api.ts`) to match.

---

## Elaya — customer welcome blast (go-live)

- [ ] **Set `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` to your approved Gupshup welcome-template id.**
  - Until then it no-ops safely (no half-configured template fires at a customer).
  - If the approved template's variables differ from `{{1}} = first name`, adjust `templateParams` in `sendCustomerWelcomeTemplate` (`src/lib/services/whatsapp-api.ts`).

---

## Elaya — Notes section: semantic retrieval (embeddings)

- [ ] **Switch note retrieval from load-all to semantic (vector) search — when a user's notes outgrow the prompt budget.**
  - Current state (shipped 2026-06-26, Feature 3): `retrieveMemoryContext` / `getNotesForElaya` use **load-all** — fetch the user's notes newest-edited first, keep them until `ELAYA_NOTES_PROMPT_BUDGET` (6000 chars) is spent, drop the rest. Correct while every user's notes fit in 6000 chars.
  - **Trigger to build:** the moment a user keeps **more than ~6000 chars of notes**, the oldest-edited notes silently fall off the end and Elaya never sees them — regardless of whether they're relevant to the question asked. Build this when you see notes being dropped, or want an *old, relevant* note surfaced over a *new, irrelevant* one. (Cap is 50 notes × up to 4000 chars, so the ceiling is well above the budget.)
  - **The seam is already laid (this is why it's a small change):** `retrieveMemoryContext(principal, question)` already takes `question` (ignored today) and returns `{ learned, notes }`. The brain, `persona.ts`, and the UI all pass/consume the final shape — so **only the bodies of `retrieveMemoryContext` + `getNotesForElaya` change**; no caller, prompt assembly, or UI touches.
  - **What the change is:** at write time (`upsertNote`) compute an embedding of `title + body`; at read time embed the `question` and `ORDER BY embedding <=> $q LIMIT n` up to the same 6000-char budget. Return the *most relevant* notes instead of the *newest*.
  - **New work it actually requires (NOT a flip-a-switch):**
    1. An **embeddings provider** — there is none in the codebase yet (the Elaya `adapters/anthropic.ts` is chat-only; Anthropic has no embeddings endpoint). Add `lib/elaya/embeddings.ts` + a provider (Voyage / OpenAI `text-embedding-3`) + an API key — a genuinely new external dependency.
    2. A **migration**: add `embedding vector(1536)` to `elaya_notes` + an HNSW index (the `service_cases` 0110 dormant-column / deferred-index precedent — `vector` extension is already installed).
    3. A **one-time backfill** to embed existing notes.
    4. **PII call (D-01):** note text would go to an external embeddings API. It's the user's own self-authored work content (low-risk), but decide explicitly whether to mask before embedding, mirroring the `pii.ts` posture.
