-- 0217 — member.members.wa_group_jid: the member's linked WhatsApp group, mirrored.
--
-- Why: the /members "No WhatsApp group" filter and the list's WhatsApp chip read
-- wa_invite_link (the invite URL from the old app export), which says nothing about
-- whether a Sia group is actually linked. Measured 2026-09-18: the filter listed 267
-- members, 115 of whom DO have a linked group, and hid 119 who truly have none. The real
-- link is sia.wag_groups.member_id, in another schema, and PostgREST cannot embed across
-- schemas (the 2026-09-17 leads-page lesson), so the list cannot join it at read time.
--
-- What: one derived column, written ONLY by the trigger below. sia.wag_groups.member_id
-- stays the single source of truth (the Sia panel, the member page and the mapper script
-- all write it); this column is its mirror on the member row, so "who still needs a group"
-- is one indexed predicate and the profiler gets a cheap "members with a group" read.
-- Never write wa_group_jid from application code.

ALTER TABLE member.members ADD COLUMN IF NOT EXISTS wa_group_jid text;

COMMENT ON COLUMN member.members.wa_group_jid IS
  'MIRROR of sia.wag_groups.member_id (the group linked to this member), maintained only by '
  'the sia.sync_member_wa_group trigger. NULL = no Sia group linked. wa_invite_link is a '
  'different fact (the invite URL from the app export) and proves nothing about a link.';

-- The one expression both the backfill and the trigger use: a member's group is the active
-- one first, then the most recently touched (today every member has at most one).
CREATE OR REPLACE FUNCTION sia.member_wa_group(p_member_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = sia, member, public AS $$
  SELECT g.group_jid
  FROM sia.wag_groups g
  WHERE g.member_id = p_member_id
  ORDER BY g.is_active DESC, g.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION sia.sync_member_wa_group()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, member, public AS $$
BEGIN
  -- Recompute for the member who lost the group and the member who gained it. A relink
  -- from A to B touches both; a plain unlink touches only the old one.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.member_id IS NOT NULL THEN
    UPDATE member.members m SET wa_group_jid = sia.member_wa_group(m.id) WHERE m.id = OLD.member_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.member_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    UPDATE member.members m SET wa_group_jid = sia.member_wa_group(m.id) WHERE m.id = NEW.member_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS wag_groups_sync_member_wa_group ON sia.wag_groups;
CREATE TRIGGER wag_groups_sync_member_wa_group
  AFTER INSERT OR UPDATE OF member_id, is_active OR DELETE ON sia.wag_groups
  FOR EACH ROW EXECUTE FUNCTION sia.sync_member_wa_group();

REVOKE ALL ON FUNCTION sia.member_wa_group(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.sync_member_wa_group() FROM PUBLIC, anon, authenticated;

-- Backfill from the truth, with the same expression the trigger uses.
UPDATE member.members m SET wa_group_jid = sia.member_wa_group(m.id);

-- The worklist read: members still without a group, in list order.
CREATE INDEX IF NOT EXISTS idx_members_no_wa_group
  ON member.members (full_name) WHERE wa_group_jid IS NULL;
