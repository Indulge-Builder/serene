-- 0215 — The member profiler's two working tables: the code-name vault and the per-group cursor.
--
-- Why: the twin's stores (member_facts / member_people / member_relations / member_events /
-- member_anticipations, 0194) exist but only the sheets ever filled them. The profiler reads
-- each LINKED member group's WhatsApp chat in windows and writes what it learns, every write
-- pointing at its sia.extraction_runs row. plan-sia-intelligence.md is the contract; two of
-- its decisions live here:
--   * decision 2, "vault first": identity is swapped for consistent code names before any
--     text reaches a model. sia.codenames is that vault — per group, one stable code per
--     participant (MEMBER_1, STAFF_GENIE_1, VENDOR_1 …), the same human keeps the same code
--     across every window forever, so a replay is comparable.
--   * rule 4, "linked or not read": only groups linked to a member are ever listed as due.
--
-- The plan's global wag_pipeline_cursors row cannot serve a windowed reader: a window closes
-- only after the group has been quiet for hours, so each group needs its own position.
-- sia.profiler_group_state is that position. Replay = delete the group's row.
--
-- Access: the sia schema's working tables are service-role only (the wag_ posture, 0172).

CREATE TABLE sia.codenames (
  group_jid   text        NOT NULL REFERENCES sia.wag_groups(group_jid) ON DELETE CASCADE,
  sender_jid  text        NOT NULL,
  code        text        NOT NULL,
  side        text        NOT NULL CHECK (side IN ('member', 'staff', 'vendor')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_jid, sender_jid),
  UNIQUE (group_jid, code)
);
ALTER TABLE sia.codenames ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sia.codenames TO service_role;

CREATE TABLE sia.profiler_group_state (
  group_jid        text        PRIMARY KEY REFERENCES sia.wag_groups(group_jid) ON DELETE CASCADE,
  last_message_at  timestamptz,                       -- the end of the last window read
  windows_done     integer     NOT NULL DEFAULT 0,
  last_run_id      uuid        REFERENCES sia.extraction_runs(id) ON DELETE SET NULL,
  last_error       text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sia.profiler_group_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sia.profiler_group_state TO service_role;
CREATE TRIGGER profiler_group_state_updated_at BEFORE UPDATE ON sia.profiler_group_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Groups with unread text: linked to a member, active, newest unread message first.
-- The quiet-gap rule (a window closes after N quiet hours) is applied by the reader, which
-- sees the messages; this only answers "where is there anything to read".
CREATE OR REPLACE FUNCTION sia.profiler_due_groups(p_limit integer DEFAULT 50)
RETURNS TABLE (group_jid text, member_id uuid, cursor_at timestamptz, newest_at timestamptz, pending integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = sia, pg_temp AS $$
  SELECT g.group_jid, g.member_id, s.last_message_at, x.newest_at, x.pending
  FROM sia.wag_groups g
  LEFT JOIN sia.profiler_group_state s ON s.group_jid = g.group_jid
  JOIN LATERAL (
    SELECT max(m.wa_timestamp) AS newest_at, count(*)::integer AS pending
    FROM sia.wag_messages m
    WHERE m.chat_jid = g.group_jid
      AND m.text IS NOT NULL
      AND m.wa_timestamp > COALESCE(s.last_message_at, '-infinity'::timestamptz)
  ) x ON x.pending > 0
  WHERE g.member_id IS NOT NULL AND g.group_kind = 'member' AND g.is_active
  ORDER BY x.newest_at DESC
  LIMIT p_limit;
$$;

-- Rule 4's guard: a sender present in many member groups is staff even without a roster tag,
-- so a non-roster colleague is never read as the member's family.
CREATE OR REPLACE FUNCTION sia.profiler_broad_senders(p_min_groups integer DEFAULT 6)
RETURNS TABLE (sender_jid text, groups integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = sia, pg_temp AS $$
  SELECT m.sender_jid, count(DISTINCT m.chat_jid)::integer
  FROM sia.wag_messages m
  JOIN sia.wag_groups g ON g.group_jid = m.chat_jid
  WHERE g.member_id IS NOT NULL
  GROUP BY m.sender_jid
  HAVING count(DISTINCT m.chat_jid) >= p_min_groups;
$$;

REVOKE ALL ON FUNCTION sia.profiler_due_groups(integer)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.profiler_broad_senders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.profiler_due_groups(integer)    TO service_role;
GRANT EXECUTE ON FUNCTION sia.profiler_broad_senders(integer) TO service_role;

-- The switch. OFF until the founder has read the pilot report (plan decision 4: read twenty
-- groups, check the quality, then approve). The cloud task reads this row on every run.
INSERT INTO public.elaya_settings (key, value) VALUES ('member_profiler_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE sia.codenames IS
  'The code-name vault (plan-sia-intelligence §5): per group, one stable code per participant. Text leaves for a model with codes, comes back with codes, and is swapped back before anything is stored.';
COMMENT ON TABLE sia.profiler_group_state IS
  'The member profiler''s per-group read position. Delete a row to replay that group from the start.';
