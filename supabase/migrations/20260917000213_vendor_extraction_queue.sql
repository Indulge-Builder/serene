-- Migration 0213: the vendor extractor's queue marker on the Freshdesk mirror,
-- its retry counter, and the `freshdesk_live` source value.
--
-- WHY A COLUMN AND NOT A TABLE
-- The mirror (0193) already carries two markers of exactly this shape on this
-- exact table: `conversations_synced_at` on the ticket and `media_synced_at` on
-- the conversation. Both use NULL as the queue flag, because PostgREST cannot
-- compare two columns and a NULL is something it CAN filter on. A third marker
-- for "has the vendor extractor read this note yet" belongs beside them, not in
-- a table of its own that would have to be joined on every pass.
--
-- WHAT IT COSTS TO GET THIS WRONG
-- A note is read by a model exactly once, and that read is the only part of the
-- pipeline that costs money. If a thread re-sync cleared this marker the way it
-- clears `media_synced_at`, every old note on a busy ticket would be re-read and
-- re-billed each time a new note landed on it. So the extractor's upsert path
-- must PRESERVE this column, exactly as `upsertTickets` preserves
-- `conversations_synced_at`. That is enforced in code (freshdesk-sync.ts
-- normalizeConversation), and stated here because the cost of forgetting is
-- silent and recurring rather than a visible failure.
--
-- FORWARD ONLY
-- Existing rows are backfilled to now(), not left NULL: the founder's decision
-- (2026-09-17) is that the extractor starts from today and does not re-read the
-- 210,773 notes already mirrored. Leaving them NULL would queue every one of
-- them on the first run. The backlog can be opened later at any time by setting
-- this column back to NULL for a date range -- that is the whole reason the
-- marker is per-row rather than a single watermark.

ALTER TABLE freshdesk.conversations
  ADD COLUMN IF NOT EXISTS vendor_extracted_at timestamptz;

-- Everything mirrored before this migration is considered read. See FORWARD ONLY.
UPDATE freshdesk.conversations SET vendor_extracted_at = now() WHERE vendor_extracted_at IS NULL;

-- HOW MANY TIMES A NOTE HAS FAILED TO READ
-- A note that fails for a permanent reason -- a file the model API refuses, a
-- reply that never parses -- would otherwise come back every five minutes
-- forever, and since the queue is oldest-first, forty such notes would block
-- everything behind them, silently (reviewer, 2026-09-18). The extractor bumps
-- this on every failed read and stops claiming a note at EXTRACT_MAX_ATTEMPTS
-- (constants/vendors.ts). A note at the cap keeps vendor_extracted_at NULL, so
-- "gave up" is a state you can query, not one that hides inside "read":
--   SELECT * FROM freshdesk.conversations
--    WHERE vendor_extracted_at IS NULL AND vendor_extract_attempts >= 3;
-- Re-queue one by setting the counter back to 0.
ALTER TABLE freshdesk.conversations
  ADD COLUMN IF NOT EXISTS vendor_extract_attempts smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN freshdesk.conversations.vendor_extract_attempts IS
  'Failed vendor-extraction reads of this note. The queue stops offering a note at EXTRACT_MAX_ATTEMPTS '
  '(3); it keeps vendor_extracted_at NULL so a give-up stays visible. Reset to 0 to re-queue.';

-- The queue read: "the oldest notes nobody has extracted from yet". Partial, so
-- the index holds only the backlog (usually a handful of rows) rather than all
-- 210k, and empties itself as the extractor catches up. Given-up notes stay in
-- it -- a handful at most, and the attempts filter is cheap over that.
CREATE INDEX IF NOT EXISTS idx_fd_conversations_vendor_pending
  ON freshdesk.conversations (fd_created_at)
  WHERE vendor_extracted_at IS NULL;

COMMENT ON COLUMN freshdesk.conversations.vendor_extracted_at IS
  'When the vendor extractor last read this note (services/vendor-extract-sync.ts). '
  'NULL = queued. Set once and PRESERVED across thread re-syncs -- a model read is the only '
  'billed step in that pipeline, so clearing this re-bills the whole thread. '
  'Backfilled to now() at 0213: the extractor is forward-only from 2026-09-17. To open the '
  'backlog for a window, set this back to NULL for that date range.';

-- ─────────────────────────────────────────────────────────────────────────────
-- `freshdesk_live` -- a source of its own for the live extractor's rows.
-- ─────────────────────────────────────────────────────────────────────────────
-- The first draft tagged these rows source = 'ticket'. Our own vocabulary
-- reserves `ticket` for Sia's in-app tickets, which now exist: the rows would
-- have rendered as "In-app ticket", and once Sia jobs start logging, the two
-- sets would be indistinguishable and neither reversible on its own. They could
-- not share `freshdesk` either -- scripts/vendors/load-vendors.ts --wipe deletes
-- every `freshdesk` row when the archive is re-run and would take the live rows
-- with it. So: one new value (reviewer, 2026-09-18), mirrored in
-- VENDOR_SOURCE_DEF (constants/vendors.ts) and in these two CHECKs.
--
-- The constraint names are Postgres's own for an inline unnamed CHECK
-- (<table>_<column>_check) -- what 0183 and 0185 produced.
ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_sources_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_sources_check
  CHECK (sources <@ ARRAY['freshdesk', 'freshdesk_live', 'sia', 'manual', 'ticket']::text[]);

ALTER TABLE public.vendor_engagements
  DROP CONSTRAINT IF EXISTS vendor_engagements_source_check;
ALTER TABLE public.vendor_engagements
  ADD CONSTRAINT vendor_engagements_source_check
  CHECK (source IN ('freshdesk', 'freshdesk_live', 'sia', 'manual', 'ticket'));
