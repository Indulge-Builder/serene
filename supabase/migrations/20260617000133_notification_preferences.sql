-- Migration 0133: Notification preferences (per-user channel control)
--
-- Lets every user start/stop each notification CATEGORY on each CHANNEL
-- (in-app, whatsapp) for THEMSELVES. The per-user twin of sla_policies.channels[]:
-- same per-channel on/off idea, new grain (per user × category, not per org rule).
--
-- ── ABSENCE = ON (sparse mute-rows) ──────────────────────────────────────────
-- A row exists ONLY once a user has touched a checkbox. No row for a (user, key)
-- pair = both channels ON (the implicit default everywhere). The gate
-- (notification-prefs-service.ts) fails OPEN: missing/malformed/thrown → send.
-- Consequences, all deliberate:
--   * Adding a new category is on-for-everyone automatically — zero backfill.
--   * At 100x users the table holds only deliberate opt-outs, never N×categories.
--   * When a user re-checks BOTH boxes for a key, the action DELETES the row
--     (back to implicit-on) — see setNotificationPrefAction.
--
-- ── OWNER-ONLY RLS (the push_subscriptions 0120 posture) ─────────────────────
-- The user edits their OWN prefs on the session client → owner SELECT/INSERT/
-- UPDATE/DELETE. The cross-user READ at notification fan-out time runs on the
-- service-role admin client (RLS-bypassing), exactly like dispatchPush reading
-- every recipient's push_subscriptions. InitPlan-hoisted auth.uid() per 0088.
--
-- NEVER silenceable (no key here, never a row): lead_initiation (opens the legal
-- 24h WhatsApp window, can throw) and elaya_reply (a direct reply to a staff
-- message). Those are transactional sends, not preferences — the gate hard-skips
-- them; they have no category key at all.

CREATE TABLE notification_preferences (
  user_id          uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Semantic category key (notification-categories.ts). Mirrors that whitelist;
  -- a new category there needs a new migration extending this CHECK (the theme /
  -- app_icon precedent). One key per (event × role-that-differs).
  notification_key text        NOT NULL
                                CHECK (notification_key IN (
                                  'lead_assigned',
                                  'new_lead_founder_alert',
                                  'lead_won',
                                  'deal_created',
                                  'task_assigned',
                                  'task_due',
                                  'task_overdue_manager',
                                  'sla_breach',
                                  'sla_escalation'
                                )),
  -- Per-channel switches. DEFAULT true so an INSERT that flips only one channel
  -- still records the other as on (matches absence = on).
  in_app           boolean     NOT NULL DEFAULT true,
  whatsapp         boolean     NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_key)
);

-- The hot read at fan-out time: all of a recipient's mute rows. The PK
-- (user_id, notification_key) already serves both the per-user whole-set read
-- and the point (user, key) lookup in one descent — no extra index needed.

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs (the session client both reads its seed and writes).
CREATE POLICY "notif_prefs_select_own"
  ON notification_preferences FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "notif_prefs_insert_own"
  ON notification_preferences FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "notif_prefs_update_own"
  ON notification_preferences FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "notif_prefs_delete_own"
  ON notification_preferences FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- updated_at maintenance (reuse the earliest-migration function, never recreate).
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE notification_preferences IS
  'Per-user notification channel control (migration 0133). One row per (user, '
  'category) ONLY when the user has opted out of a channel — absence of a row '
  'means both channels ON (the gate fails OPEN). Owner-only RLS (user_id = '
  'auth.uid()); the cross-user read at notification fan-out runs service-role, '
  'the same posture as push_subscriptions. lead_initiation and elaya_reply are '
  'transactional and have NO key here — never silenceable.';
