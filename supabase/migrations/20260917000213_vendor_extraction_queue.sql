-- Migration 0213: the vendor extractor's queue marker on the Freshdesk mirror.
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

-- The queue read: "the oldest notes nobody has extracted from yet". Partial, so
-- the index holds only the backlog (usually a handful of rows) rather than all
-- 210k, and empties itself as the extractor catches up.
CREATE INDEX IF NOT EXISTS idx_fd_conversations_vendor_pending
  ON freshdesk.conversations (fd_created_at)
  WHERE vendor_extracted_at IS NULL;

COMMENT ON COLUMN freshdesk.conversations.vendor_extracted_at IS
  'When the vendor extractor last read this note (services/vendor-extract-sync.ts). '
  'NULL = queued. Set once and PRESERVED across thread re-syncs -- a model read is the only '
  'billed step in that pipeline, so clearing this re-bills the whole thread. '
  'Backfilled to now() at 0213: the extractor is forward-only from 2026-09-17. To open the '
  'backlog for a window, set this back to NULL for that date range.';
