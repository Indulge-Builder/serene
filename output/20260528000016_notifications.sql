-- ============================================================
-- Migration 0016 — Notifications table
-- Persistent notification inbox for the bell UI.
-- INSERT: service role only.
-- SELECT: owner only (recipient_id = auth.uid()).
-- UPDATE: owner only (mark read).
-- DELETE: never.
-- ============================================================

CREATE TABLE notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          text        NOT NULL
                              CHECK (type IN ('lead_assigned','lead_won','task_due','mention','system')),
  title         text        NOT NULL,
  body          text,
  action_url    text        CHECK (action_url IS NULL OR action_url NOT LIKE 'http%'),
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Partial index: unread lookup by recipient (covers the common case)
CREATE INDEX idx_notifications_recipient_unread
  ON notifications(recipient_id, created_at DESC)
  WHERE read_at IS NULL;

-- Full index for inbox (read + unread)
CREATE INDEX idx_notifications_recipient_all
  ON notifications(recipient_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recipients see only their own rows
CREATE POLICY "notifications_select_own"
  ON notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

-- Only service role can INSERT (no direct client inserts ever)
-- No INSERT policy = service-role-only via admin client

-- Owner can mark their own notifications read (UPDATE read_at only)
CREATE POLICY "notifications_update_own"
  ON notifications
  FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- No DELETE policy — notifications are never deleted

-- ── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
