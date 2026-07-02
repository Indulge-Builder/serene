# TODO

Open follow-up tasks for Serene. Check items off as they're done.
Last verified: 2026-07-02.

---

## Email / Brevo SMTP

- [ ] **Verify our sender domain on Brevo (DKIM/SPF) so auth emails stop landing in spam.**
  - Current state: custom Brevo SMTP is configured in Supabase and **emails are sending and working** (password reset, Elaya emails, etc.).
  - Problem: outgoing emails are currently delivered to the recipient's **spam/junk** folder.
  - Cause: the sender domain (`indulge.global`) is not yet fully authenticated in Brevo, so Gmail/Outlook flag the mail as untrusted.
  - Fix: in Brevo → **Senders, Domains & Dedicated IPs** → add and authenticate the `indulge.global` domain (add the **DKIM + SPF DNS records** Brevo provides). Ensure the Supabase SMTP "Sender email" exactly matches a verified Brevo sender.
  - After: send a test reset email and confirm it lands in the inbox (not spam).

## Elaya — customer welcome blast (go-live)

- [ ] **Set `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` to your approved Gupshup welcome-template id.**
  - Until then it no-ops safely (no half-configured template fires at a customer).
  - If the approved template's variables differ from `{{1}} = first name`, adjust `templateParams` in `sendCustomerWelcomeTemplate` (`src/lib/services/whatsapp-api.ts`).

---

## Elaya — Notes section: semantic retrieval (embeddings)

- [ ] **Switch note retrieval from load-all to semantic (vector) search — when a user's notes outgrow the prompt budget.**
  - Current state (shipped 2026-06-26, Feature 3): `getNotesForElaya` uses **load-all**, fetching the user's notes newest-edited first, keeping them until `ELAYA_NOTES_PROMPT_BUDGET` (6000 chars) is spent, dropping the rest. Correct while every user's notes fit in 6000 chars. (The old `retrieveMemoryContext` seam was removed 2026-07-02; the brain calls `getUserPersona` + `getNotesForElaya` directly.)
  - **Trigger to build:** the moment a user keeps **more than ~6000 chars of notes**, the oldest-edited notes silently fall off the end and Elaya never sees them — regardless of whether they're relevant to the question asked. Build this when you see notes being dropped, or want an *old, relevant* note surfaced over a *new, irrelevant* one. (Cap is 50 notes × up to 4000 chars, so the ceiling is well above the budget.)
  - **Where the change starts:** the brain reads notes via `getNotesForElaya(userId)` (`src/lib/services/elaya-notes-service.ts`), called from `brain.ts`. The embeddings change swaps that read's body (and threads the user's question into it) plus the callers that pass the question in; prompt assembly and the UI keep consuming the same shape.
  - **What the change is:** at write time (`upsertNote`) compute an embedding of `title + body`; at read time embed the `question` and `ORDER BY embedding <=> $q LIMIT n` up to the same 6000-char budget. Return the *most relevant* notes instead of the *newest*.
  - **New work it actually requires (NOT a flip-a-switch):**
    1. An **embeddings provider** — there is none in the codebase yet (the Elaya `adapters/anthropic.ts` is chat-only; Anthropic has no embeddings endpoint). Add `lib/elaya/embeddings.ts` + a provider (Voyage / OpenAI `text-embedding-3`) + an API key — a genuinely new external dependency.
    2. A **migration**: add `embedding vector(1536)` to `elaya_notes` + an HNSW index (the `service_cases` 0110 dormant-column / deferred-index precedent — `vector` extension is already installed).
    3. A **one-time backfill** to embed existing notes.
    4. **PII call (D-01):** note text would go to an external embeddings API. It's the user's own self-authored work content (low-risk), but decide explicitly whether to mask before embedding, mirroring the `pii.ts` posture.
