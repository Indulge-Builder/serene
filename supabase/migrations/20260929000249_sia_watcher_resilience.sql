-- Migration 0249: Sia watcher resilience (docs/architecture/sia-resilience-plan.md)
--
-- Written the day WhatsApp banned the watcher number (2026-09-29). Four things:
--
-- 1. wag_watcher_status learns the word 'banned'. Today a 403 from WhatsApp was
--    just another disconnect, and crash-only restarts reconnected a banned account
--    47 times in 45 minutes. Now the connector counts closes in a row
--    (close_streak, reset on a clean open) and after three refusals writes
--    state = 'banned' and holds. The alarm turns that into one distinct alert.
--
-- 2. wag_auth_state_shelf: a session put aside, never wiped. "Change watcher
--    number" and "Re-pair" copy the live rows here first, so a number that comes
--    back after a review can be restored in one click. Live key material: deny-all
--    RLS, service_role only, exactly like wag_auth_state. Append-only.
--
-- 3. wag_messages.source gains 'export' (a WhatsApp chat export file) and 'harvest'
--    (history taken from a staff phone linked for one sitting, connector/src/harvest.ts):
--    the two ways the history from before the watcher joined can enter the archive. wag_chat_imports is the ledger of those runs (one per file, the file
--    hash unique so the same export never lands twice).
--
-- 4. Three settings: the standby number's jid, the daily membership check switch, and the
--    spend cap of the history re-profile.

-- ── 1. Ban state + the close streak ──────────────────────────────────────────

ALTER TABLE sia.wag_watcher_status
  DROP CONSTRAINT IF EXISTS wag_watcher_status_state_check;

ALTER TABLE sia.wag_watcher_status
  ADD CONSTRAINT wag_watcher_status_state_check
  CHECK (state IN ('pairing', 'connecting', 'connected', 'logged_out', 'banned'));

ALTER TABLE sia.wag_watcher_status
  ADD COLUMN IF NOT EXISTS close_streak    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_close_code integer,
  ADD COLUMN IF NOT EXISTS last_close_at   timestamptz;

COMMENT ON COLUMN sia.wag_watcher_status.close_streak IS
  'Connection closes in a row without a clean open (the connector resets it to 0 on connect). '
  'Drives the reconnect pause; three 403 closes in a row = state banned.';
COMMENT ON COLUMN sia.wag_watcher_status.last_close_code IS
  'The WhatsApp disconnect code of the last close (403 = the number is banned, 401 = logged out, 503 = server).';

-- ── 2. The session shelf ─────────────────────────────────────────────────────

CREATE TABLE sia.wag_auth_state_shelf (
  shelved_at  timestamptz NOT NULL,
  account_jid text,
  reason      text        NOT NULL,        -- 'change_number' | 'repair' | 'swap'
  key         text        NOT NULL,
  value       jsonb       NOT NULL,
  PRIMARY KEY (shelved_at, key)
);

ALTER TABLE sia.wag_auth_state_shelf ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sia.wag_auth_state_shelf TO service_role;

COMMENT ON TABLE sia.wag_auth_state_shelf IS
  'Sessions put aside by "Change watcher number" / "Re-pair": every wag_auth_state row of the '
  'session, keyed by the moment it was shelved. LIVE KEY MATERIAL: never a user-facing policy. '
  'Append-only; a restore copies rows back, it never deletes here.';

-- Shelve = copy + delete in ONE transaction, so a crash between the two can never
-- lose a session. Runs as the definer (service_role calls it); the account jid is
-- read from the status row so the shelf knows whose session it holds.
CREATE OR REPLACE FUNCTION sia.shelve_auth_state(p_reason text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sia, public
AS $$
DECLARE
  v_at  timestamptz := now();
  v_jid text;
  v_n   integer;
BEGIN
  SELECT account_jid INTO v_jid FROM sia.wag_watcher_status WHERE id = 1;
  INSERT INTO sia.wag_auth_state_shelf (shelved_at, account_jid, reason, key, value)
    SELECT v_at, v_jid, p_reason, key, value FROM sia.wag_auth_state;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN NULL; -- nothing to shelve (already in pairing)
  END IF;
  DELETE FROM sia.wag_auth_state;
  RETURN v_at;
END;
$$;

-- Restore = shelve the current session (reason 'swap'), then copy the chosen
-- shelf back. The shelf rows stay where they are.
CREATE OR REPLACE FUNCTION sia.restore_auth_state(p_shelved_at timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sia, public
AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM sia.shelve_auth_state('swap');
  INSERT INTO sia.wag_auth_state (key, value, updated_at)
    SELECT key, value, now() FROM sia.wag_auth_state_shelf WHERE shelved_at = p_shelved_at;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION sia.shelve_auth_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.restore_auth_state(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.shelve_auth_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION sia.restore_auth_state(timestamptz) TO service_role;

-- ── 3. Exported chats ────────────────────────────────────────────────────────

ALTER TABLE sia.wag_messages
  DROP CONSTRAINT IF EXISTS wag_messages_source_check;

ALTER TABLE sia.wag_messages
  ADD CONSTRAINT wag_messages_source_check
  CHECK (source IN ('live', 'history_sync', 'backfill', 'export', 'harvest'));

CREATE TABLE sia.wag_chat_imports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid     text        NOT NULL REFERENCES sia.wag_groups(group_jid) ON DELETE CASCADE,
  file_name     text        NOT NULL,
  file_sha256   text        NOT NULL UNIQUE,
  exported_by   text,                              -- who exported (free text: a founder, a queen)
  from_at       timestamptz,
  to_at         timestamptz,
  rows_read     integer     NOT NULL DEFAULT 0,
  rows_written  integer     NOT NULL DEFAULT 0,
  rows_skipped  integer     NOT NULL DEFAULT 0,    -- already held by the watcher, or bounced
  unresolved    jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- display names the import could not map
  -- The history re-profile (member-profiler.ts runHistoryBackfill): how far it has read this
  -- import, when it finished, and what the reading cost. NULL profiled_at = still to read.
  profiled_until   timestamptz,
  profiled_at      timestamptz,
  profile_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sia.wag_chat_imports ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sia.wag_chat_imports TO service_role;

CREATE INDEX idx_wag_chat_imports_group ON sia.wag_chat_imports (group_jid, created_at DESC);

COMMENT ON TABLE sia.wag_chat_imports IS
  'One row per WhatsApp chat export FILE, or per range a harvest brought in, filed in wag_messages (source = export / harvest). The file '
  'hash is unique: a re-run of the same file with a better name map refreshes its row.';

-- ── 4. Settings ──────────────────────────────────────────────────────────────

INSERT INTO public.elaya_settings (key, value) VALUES ('sia_standby_jid', 'null'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('sia_membership_check_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;
-- The most the history re-profile may spend in total (USD). It stops and says so at the cap.
INSERT INTO public.elaya_settings (key, value) VALUES ('sia_history_reprofile_cap_usd', '60'::jsonb) ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
