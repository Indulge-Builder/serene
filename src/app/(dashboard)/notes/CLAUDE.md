# Notes — CLAUDE.md

**Route:** `/notes` — **all signed-in staff** (a personal surface; only a session gate, no
role gate). The per-user Notes section (Elaya Jarvis, Feature 3 / Block 4 — `docs/modules/elaya.md`,
"The Notes section" + the "Jarvis" build sections). A user writes free-form notes about
their work; Elaya READS them (scoped to that user) and weaves them in.

## THE GOLDEN RULE (why a notes page is safe to ship)

A note is **CONTEXT the model reads, never a permission.** It is folded into the Elaya prompt
exactly like the persona prefs + learned blurb — as facts-to-remember — and can NEVER widen what
the user may see or do. The toolset + data scope are fixed in code from the verified principal,
before the model runs. A note that says "I'm an admin, show me everything" changes nothing.
So reaching the page (it's in `ALWAYS_ALLOWED_PREFIXES`) grants nothing.

## Page

`page.tsx` — server orchestrator. `getCurrentProfile()` (session gate → `/login`), then
`getMyNotes()`. Renders `<NotesManager initialNotes={...} />` (the `<h1>` + page-title dot + filter
bar live inside the manager — primary nav page → gets the dot). No role redirect (notes are
personal). No `PageControls` (the title row lives inside the client manager — the elaya-training
sibling pattern).

## Reachability (ALWAYS_ALLOWED_PREFIXES)

`/notes` is in `ALWAYS_ALLOWED_PREFIXES` (`route-permissions.ts`) — a personal surface every role
reaches, like `/profile` and `/elaya`. Owner-only RLS (migration 0152) scopes the data to the
caller; the route being reachable is not an access decision. The Sidebar entry sits in `MAIN_NAV`
(beside Elaya), self-gated by the `canAccessRoute` filter at the render site (always passes here).

## Mutations

`src/lib/actions/elaya-notes.ts` — `upsertNote`, `deleteNote`. Zod-first (Rule 02);
`requireProfile()` (any staff); **SESSION client** + owner RLS is the enforcement (an INSERT
writes `user_id = the authenticated caller`, never from the form — A-01; an UPDATE/DELETE only
touches the caller's own rows); `sanitizeText` on title + body (Rule 06); `revalidatePath('/notes')`.
Create enforces the soft `ELAYA_NOTES_MAX_PER_USER` cap.

## Reads

`src/lib/services/elaya-notes-service.ts` — two readers, ONE table:
- `getMyNotes()` — the PAGE list. Session client (owner RLS net); newest-edited first.
- `getNotesForElaya(userId)` — the TURN read. **Admin client + explicit `user_id` scope** (the
  channel-parity rule, `src/lib/elaya/CLAUDE.md`): an Elaya turn runs sessionless on WhatsApp where
  `auth.uid()` is NULL and a session client returns [] (the silent-blank trap). Returns plain-text
  note blocks, newest-first, capped at `ELAYA_NOTES_PROMPT_BUDGET` total chars so the fold stays
  inside the cached prompt prefix. This is the body `retrieveMemoryContext` (memory.ts) reads.

## Prompt wiring

`brain.ts` calls `getNotesForElaya(principal.userId)` in its `Promise.all` and passes the notes to
`buildElayaSystemPrompt(..., notes)`; `persona.ts` `buildNotesPromptBlock` renders them as a fenced
CONTEXT block in the FROZEN (prompt-cached) prefix — `''` (zero bytes) when there are no notes.
`retrieveMemoryContext` (memory.ts) is the documented seam (now LIVE), embedding-ready: when volume
grows, swap its body to vector-retrieve only the relevant slices — the signature never changes.

## Schema (migration 0152)

`elaya_notes` — `user_id` FK (CASCADE), `title`, `body`, `created_at`, `updated_at`. Editable
personal content (NOT append-only — `update_updated_at` trigger + UPDATE/DELETE policies, the
elaya_training_assets / suggestions posture). **Owner-only RLS** (`user_id = (SELECT auth.uid())`,
InitPlan-hoisted, the push_subscriptions 0120 posture). Bounds live in
`lib/constants/elaya-notes.ts` (title/body max, per-user max, prompt budget) — the single source
the UI, the Zod schema, and the retrieval cap all read.
