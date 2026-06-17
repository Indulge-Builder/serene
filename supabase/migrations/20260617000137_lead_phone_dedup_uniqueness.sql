-- Migration 0137 — lead phone canonical key + active-phone uniqueness (audit 2026-06-17)
--
-- PROBLEM (audit findings #1/#2/#3/#4/#7):
--   Lead dedup was a SELECT (get_active_lead_by_phone) followed by a SEPARATE
--   INSERT, with NO database-level uniqueness on phone. Two concurrent
--   submissions for the same new number (webhook×2, webhook+manual, or two
--   first-WhatsApp-messages) both passed the dedup read and both inserted —
--   producing two active leads for one human (TOCTOU race).
--
--   It was made worse by phone-format drift: the webhook stored the RAW phone
--   when E.164 normalization failed, while manual/WhatsApp stored normalized
--   E.164. So '98765 43210' and '+919876543210' were different strings and the
--   exact-match dedup never caught them.
--
-- FIX (this migration + the app changes that ship with it):
--   1. lead_phone_key(text) — THE canonical phone key (IMMUTABLE). E.164 cannot
--      be reconstructed in pure SQL without libphonenumber, so the DB key is the
--      digits-only collapse (the same regexp generate_lead_slug already uses).
--      The APP now stores phone consistently via canonicalizePhone() (E.164 when
--      parseable, else digits-only) — so for new rows phone IS already canonical
--      and lead_phone_key(phone) is stable. Keying the index on lead_phone_key()
--      (not the raw column) also makes it robust to the historical raw rows.
--   2. A partial UNIQUE index on lead_phone_key(phone) for ACTIVE leads only
--      (archived_at IS NULL, non-empty phone) — the structural backstop. A
--      second concurrent INSERT now fails with 23505; the app catches it and
--      returns the existing active lead (graceful, no duplicate).
--      Terminal leads (won/lost/junk) and archived leads are EXCLUDED so the
--      returning-prospect chain (previous_lead_id) is never blocked.
--
--   "Active" here MUST match get_active_lead_by_phone's status set exactly
--   (new/touched/in_discussion/nurturing) or the index and the dedup read
--   would disagree.
--
-- SAFETY: if dirty prod data already has duplicate active leads for one phone,
-- the UNIQUE index creation would hard-fail. The DO block below detects that
-- case, RAISES a WARNING listing the colliding keys, and falls back to a plain
-- (non-unique) index so the migration always applies. New duplicates are still
-- prevented by the app-layer canonical storage + 23505 catch; the listed
-- pre-existing collisions are for manual cleanup, after which this index can be
-- re-created UNIQUE in a follow-up.

-- ─────────────────────────────────────────────────────────
-- 1. lead_phone_key(text) — canonical dedup key (digits-only)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lead_phone_key(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

COMMENT ON FUNCTION lead_phone_key(text) IS
  'Canonical lead-phone dedup key (digits-only). Mirrors canonicalizePhone() in '
  'src/lib/utils/phone.ts for the non-E.164 fallback. The active-phone UNIQUE '
  'index and the dedup lookup both key on this. IMMUTABLE so it is index-safe.';

-- ─────────────────────────────────────────────────────────
-- 2. Active-phone uniqueness — UNIQUE when data is clean, else plain + WARNING
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_collisions int;
  v_sample     text;
BEGIN
  SELECT count(*), string_agg(k, ', ')
    INTO v_collisions, v_sample
    FROM (
      SELECT lead_phone_key(phone) AS k
        FROM leads
       WHERE archived_at IS NULL
         AND phone IS NOT NULL
         AND lead_phone_key(phone) <> ''
         AND status IN ('new', 'touched', 'in_discussion', 'nurturing')
       GROUP BY lead_phone_key(phone)
      HAVING count(*) > 1
    ) dups;

  IF coalesce(v_collisions, 0) > 0 THEN
    RAISE WARNING
      '[0137] % active-phone collision(s) already exist — creating a NON-unique index. '
      'Resolve these and re-create idx_leads_phone_key_active UNIQUE. Keys: %',
      v_collisions, left(coalesce(v_sample, ''), 500);

    CREATE INDEX IF NOT EXISTS idx_leads_phone_key_active
      ON leads (lead_phone_key(phone))
      WHERE archived_at IS NULL
        AND phone IS NOT NULL
        AND status IN ('new', 'touched', 'in_discussion', 'nurturing');
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_key_active
      ON leads (lead_phone_key(phone))
      WHERE archived_at IS NULL
        AND phone IS NOT NULL
        AND status IN ('new', 'touched', 'in_discussion', 'nurturing');
  END IF;
END;
$$;

COMMENT ON INDEX idx_leads_phone_key_active IS
  'One active lead per canonical phone (audit #1/#2/#7). Partial: active statuses '
  'only (matches get_active_lead_by_phone) so terminal/archived predecessors never '
  'block the returning-prospect previous_lead_id chain. The 23505 on a concurrent '
  'duplicate INSERT is caught in the app, which returns the existing active lead.';
