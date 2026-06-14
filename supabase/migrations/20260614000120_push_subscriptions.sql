-- Migration 0120: Web Push subscriptions (PWA push delivery channel)
--
-- Adds Web Push (VAPID, the web-push library — no SaaS) as a SECOND delivery
-- channel behind the existing notification spine. The in-app row insert +
-- Realtime + bell remain the source of truth; this table holds the per-device
-- push endpoints so a notification can also reach an installed PWA when the app
-- is closed (iOS 16.4+ standalone, Android, desktop).
--
-- Fan-out: dispatchPush(recipientId, payload) (src/lib/services/push-service.ts)
-- is called INSIDE createNotification after the row insert — so every existing
-- createNotification call site gets push for free, with zero call-site edits.
--
-- ONE USER → MANY DEVICES (phone + desktop + …). The unique key is the push
-- `endpoint`, NOT profile_id — a user holds one row per subscribed device. A
-- re-subscribe on the same device produces the same endpoint, so the upsert is
-- ON CONFLICT (endpoint) and re-binds it to the current owner.

CREATE TABLE push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- The push service endpoint URL. Globally unique — it identifies one browser
  -- on one device. UNIQUE here is what makes the one-row-per-device upsert work.
  endpoint    text        NOT NULL UNIQUE,
  -- The two subscription keys the web-push library needs to encrypt the payload.
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  -- Diagnostic only (which device/browser) — never used for routing.
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The hot read in dispatchPush: all endpoints for one recipient.
CREATE INDEX idx_push_subscriptions_profile
  ON push_subscriptions (profile_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner-only access. The browser subscribes/unsubscribes on the SESSION client,
-- so the owner needs SELECT/INSERT/DELETE on their own rows. There is no UPDATE
-- policy — a device re-subscribe is an upsert (insert + ON CONFLICT) on the
-- service-role path, never a user UPDATE. The cross-user read + the dead-endpoint
-- prune in dispatchPush run on the service-role admin client (RLS-bypassing),
-- the same posture as createNotification's insert. InitPlan-hoisted auth.uid()
-- per the 0088 convention.
CREATE POLICY "push_subscriptions_own_select"
  ON push_subscriptions FOR SELECT
  USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "push_subscriptions_own_insert"
  ON push_subscriptions FOR INSERT
  WITH CHECK (profile_id = (SELECT auth.uid()));

CREATE POLICY "push_subscriptions_own_delete"
  ON push_subscriptions FOR DELETE
  USING (profile_id = (SELECT auth.uid()));

COMMENT ON TABLE push_subscriptions IS
  'Web Push (VAPID) per-device endpoints (migration 0120). One row per subscribed '
  'browser/device; UNIQUE(endpoint), so one user holds many rows. Owner-only RLS '
  '(profile_id = auth.uid()); the cross-user read and the 404/410 dead-endpoint '
  'prune in dispatchPush run service-role. Push is a non-fatal second channel — '
  'the in-app notification row stays the source of truth.';
