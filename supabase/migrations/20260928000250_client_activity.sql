-- 0250 — Jokers: Activity. How much the client's side is talking in their groups.
--
-- The Jokers' second dashboard (owner, 2026-09-28) counts what the CLIENT'S SIDE sends in the
-- linked member groups: the member, family, a plus-one, an assistant. Our team's messages are
-- never counted. One WhatsApp group is one client entry; a client with their own group and a
-- family group is two. No model reads anything: this is counting.
--
--   sia.team_senders           every WhatsApp id that is NOT the client's side, with why, and
--                              until when (a row is never deleted: an id that stops being team
--                              gets `team_until`, so a recount never moves a leaver's old
--                              messages to the client's side)
--   sia.client_activity_daily  one row per linked member group per India day: the client's
--                              messages and reactions, how many people on the client's side
--                              wrote, their first and last message, and our team's last message
--                              (the dashboard's "Last word: Our team")
--   sia.client_side(member, sender, at, from_me)  THE one answer to "is this the client's side?"
--   sia.refresh_team_senders() the checks, done once, in one place
--   sia.refresh_client_activity(p_from, p_to)  recount those days
--   sia.client_activity_messages(...)  the client's side's own messages behind a chart mark
--   sia.client_activity_board(p_days)  the dashboard's one read: every group, and the days the
--                              client's side was active, with their hours (compact JSON)
--
-- Who is the client's side, per message, first answer wins:
--   1. sent from our own number (from_me)                       → not the client
--   2. the member's own number, in their own group              → the client, whatever else is true
--   3. an id in team_senders that was team when it was sent     → not the client
--        account      linked to a Serene account by phone (sia-staff-link, every 15 minutes)
--        position     tagged genie / bishop / queen / joker / founder / watcher
--        vendor       linked to a vendor (vendors are never in client groups; a safety net)
--        indulge_name "Indulge" in the WhatsApp name
--        many_groups  wrote in 6+ different member groups in the last 90 days: no client does
--   4. anyone else                                              → the client's side
--
-- What counts as a message: everything a person sends, including a message later deleted.
-- Not counted: WhatsApp notices (`system`), edits (the same message again), the album envelope
-- (`album`: its photos arrive as their own messages) and `unknown` (WhatsApp's own traffic:
-- key exchange, encrypted edits). A reaction makes the client active; it is not a message.
--
-- Writes are the refresh functions' only (service role, from the Trigger.dev job). The
-- dashboard reads through the admin client behind its page gate; nobody else sees a row.

CREATE TABLE sia.team_senders (
  jid            text PRIMARY KEY,
  reasons        text[] NOT NULL CHECK (cardinality(reasons) > 0
                   AND reasons <@ ARRAY['account', 'position', 'vendor', 'indulge_name', 'many_groups']::text[]),
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  team_until     timestamptz,          -- null = team now
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sia.client_activity_daily (
  group_jid         text NOT NULL REFERENCES sia.wag_groups(group_jid) ON DELETE CASCADE,
  day               date NOT NULL,     -- India time
  member_id         uuid NOT NULL REFERENCES member.members(id) ON DELETE CASCADE,
  client_messages   integer NOT NULL DEFAULT 0,
  client_reactions  integer NOT NULL DEFAULT 0,
  client_senders    integer NOT NULL DEFAULT 0,
  first_client_at   timestamptz,
  last_client_at    timestamptz,
  last_team_at      timestamptz,       -- our team's last message that day
  message_hours     integer[] NOT NULL DEFAULT array_fill(0, ARRAY[24]),  -- client messages per India hour, [1] = 00:00
  reaction_hours    integer[] NOT NULL DEFAULT array_fill(0, ARRAY[24]),
  refreshed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_jid, day)
);
CREATE INDEX idx_client_activity_day    ON sia.client_activity_daily (day);
CREATE INDEX idx_client_activity_member ON sia.client_activity_daily (member_id, day);

ALTER TABLE sia.team_senders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.client_activity_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sia.team_senders, sia.client_activity_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON sia.team_senders, sia.client_activity_daily TO service_role;

-- THE side rule. Our own number is not the client; the member's own number in their own group always
-- is; an id that was team when it wrote is not; anyone else is the client's side.
CREATE OR REPLACE FUNCTION sia.client_side(p_member uuid, p_who text, p_at timestamptz, p_from_me boolean)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = sia, pg_temp AS $$
  SELECT NOT p_from_me AND (
    EXISTS (SELECT 1 FROM sia.wag_contacts c WHERE c.member_id = p_member AND (c.jid = p_who OR c.lid = p_who))
    OR NOT EXISTS (SELECT 1 FROM sia.team_senders t WHERE t.jid = p_who AND (t.team_until IS NULL OR p_at < t.team_until))
  );
$$;

-- The checks, done once. Adds the ids that are team now, refreshes their reasons, and closes the
-- ones no longer team (team_until = now). An id that comes back is reopened.
CREATE OR REPLACE FUNCTION sia.refresh_team_senders()
RETURNS TABLE (team_now integer, ended integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, pg_temp AS $$
DECLARE v_ended integer;
BEGIN
  DROP TABLE IF EXISTS _team_now;
  CREATE TEMP TABLE _team_now ON COMMIT DROP AS
  WITH facts AS (
    SELECT c.jid, c.lid, r.reason
    FROM sia.wag_contacts c
    CROSS JOIN LATERAL (VALUES
      (CASE WHEN c.staff_profile_id IS NOT NULL THEN 'account' END),
      (CASE WHEN c.participant_role IN ('genie', 'bishop', 'queen', 'joker', 'founder', 'watcher') THEN 'position' END),
      (CASE WHEN c.vendor_id IS NOT NULL OR c.participant_role = 'vendor' THEN 'vendor' END),
      (CASE WHEN coalesce(c.push_name, '') ~* '\mindulge\M' THEN 'indulge_name' END)
    ) AS r(reason)
    WHERE r.reason IS NOT NULL
  ), broad AS (
    SELECT m.sender_jid
    FROM sia.wag_messages m
    JOIN sia.wag_groups g ON g.group_jid = m.chat_jid
    WHERE g.member_id IS NOT NULL AND g.group_kind = 'member'
      AND NOT m.from_me AND m.wa_timestamp >= now() - interval '90 days'
    GROUP BY m.sender_jid
    HAVING count(DISTINCT m.chat_jid) >= 6
  ), ids AS (
    SELECT jid, reason FROM facts
    UNION SELECT lid, reason FROM facts WHERE lid IS NOT NULL
    UNION SELECT sender_jid, 'many_groups' FROM broad
    -- the other id of the same person (phone id ↔ hidden id)
    UNION SELECT c.jid, 'many_groups' FROM broad b JOIN sia.wag_contacts c ON c.lid = b.sender_jid
    UNION SELECT c.lid, 'many_groups' FROM broad b JOIN sia.wag_contacts c ON c.jid = b.sender_jid WHERE c.lid IS NOT NULL
  )
  SELECT jid, array_agg(DISTINCT reason ORDER BY reason) AS reasons FROM ids GROUP BY jid;

  INSERT INTO sia.team_senders AS t (jid, reasons)
  SELECT jid, reasons FROM _team_now
  ON CONFLICT (jid) DO UPDATE SET reasons = EXCLUDED.reasons, team_until = NULL, updated_at = now()
  WHERE t.reasons IS DISTINCT FROM EXCLUDED.reasons OR t.team_until IS NOT NULL;

  UPDATE sia.team_senders t SET team_until = now(), updated_at = now()
  WHERE t.team_until IS NULL AND NOT EXISTS (SELECT 1 FROM _team_now x WHERE x.jid = t.jid);
  GET DIAGNOSTICS v_ended = ROW_COUNT;

  RETURN QUERY SELECT (SELECT count(*)::integer FROM _team_now), v_ended;
END;
$$;

-- Recount the India days p_from..p_to for every linked member group. Replaces those days' rows.
CREATE OR REPLACE FUNCTION sia.refresh_client_activity(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, pg_temp AS $$
DECLARE
  v_from timestamptz := p_from::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_to   timestamptz := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_rows integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'refresh_client_activity: a from..to range, from first'; END IF;

  DELETE FROM sia.client_activity_daily WHERE day BETWEEN p_from AND p_to;

  INSERT INTO sia.client_activity_daily (group_jid, day, member_id, client_messages, client_reactions, client_senders,
                                         first_client_at, last_client_at, last_team_at, message_hours, reaction_hours)
  WITH grp AS (
    SELECT group_jid, member_id FROM sia.wag_groups WHERE member_id IS NOT NULL AND group_kind = 'member'
  ), ev AS (
    SELECT m.chat_jid AS group_jid, g.member_id, m.sender_jid AS who, m.wa_timestamp AS at, 'm'::text AS kind, m.from_me
    FROM sia.wag_messages m JOIN grp g ON g.group_jid = m.chat_jid
    WHERE m.wa_timestamp >= v_from AND m.wa_timestamp < v_to
      AND m.type NOT IN ('system', 'album', 'unknown') AND m.edit_of_wa_message_id IS NULL
    UNION ALL
    SELECT r.chat_jid, g.member_id, r.reactor_jid, r.reacted_at, 'r', false
    FROM sia.wag_reactions r JOIN grp g ON g.group_jid = r.chat_jid
    WHERE r.reacted_at >= v_from AND r.reacted_at < v_to
  ), side AS (
    SELECT e.group_jid, e.member_id, e.who, e.at, e.kind,
           (e.at AT TIME ZONE 'Asia/Kolkata')::date AS day,
           extract(hour FROM e.at AT TIME ZONE 'Asia/Kolkata')::int AS h,
           sia.client_side(e.member_id, e.who, e.at, e.from_me) AS client
    FROM ev e
  ), daily AS (
    SELECT group_jid, day, member_id,
           count(*) FILTER (WHERE client AND kind = 'm') AS cm,
           count(*) FILTER (WHERE client AND kind = 'r') AS cr,
           count(DISTINCT who) FILTER (WHERE client) AS cs,
           min(at) FILTER (WHERE client) AS fc, max(at) FILTER (WHERE client) AS lc,
           max(at) FILTER (WHERE NOT client AND kind = 'm') AS lt
    FROM side GROUP BY group_jid, day, member_id
  ), hrs AS (
    SELECT group_jid, day, h, count(*) FILTER (WHERE client AND kind = 'm') AS cm, count(*) FILTER (WHERE client AND kind = 'r') AS cr
    FROM side GROUP BY group_jid, day, h
  ), arr AS (
    SELECT d.group_jid, d.day,
           array_agg(coalesce(x.cm, 0)::integer ORDER BY g.h) AS mh,
           array_agg(coalesce(x.cr, 0)::integer ORDER BY g.h) AS rh
    FROM daily d CROSS JOIN generate_series(0, 23) AS g(h)
    LEFT JOIN hrs x ON x.group_jid = d.group_jid AND x.day = d.day AND x.h = g.h
    GROUP BY d.group_jid, d.day
  )
  SELECT d.group_jid, d.day, d.member_id, d.cm, d.cr, d.cs, d.fc, d.lc, d.lt, a.mh, a.rh
  FROM daily d JOIN arr a ON a.group_jid = d.group_jid AND a.day = d.day;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- The client's side's own messages behind a chart mark: a window, optionally some groups, an India
-- weekday (0 = Sunday) and hour, a word to search. Newest first, with the total for the pager.
CREATE OR REPLACE FUNCTION sia.client_activity_messages(
  p_from timestamptz, p_to timestamptz, p_group_jids text[] DEFAULT NULL,
  p_weekday integer DEFAULT NULL, p_hour integer DEFAULT NULL, p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS TABLE (group_jid text, member_id uuid, wa_message_id text, sent_at timestamptz, sender_name text, type text, body text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = sia, pg_temp AS $$
  SELECT m.chat_jid, g.member_id, m.wa_message_id, m.wa_timestamp,
         (SELECT c.push_name FROM sia.wag_contacts c WHERE (c.jid = m.sender_jid OR c.lid = m.sender_jid) AND c.push_name IS NOT NULL LIMIT 1),
         m.type, m.text, count(*) OVER ()
  FROM sia.wag_messages m
  JOIN sia.wag_groups g ON g.group_jid = m.chat_jid AND g.member_id IS NOT NULL AND g.group_kind = 'member'
  WHERE m.wa_timestamp >= p_from AND m.wa_timestamp < p_to
    AND (p_group_jids IS NULL OR m.chat_jid = ANY (p_group_jids))
    AND m.type NOT IN ('system', 'album', 'unknown') AND m.edit_of_wa_message_id IS NULL
    AND (p_weekday IS NULL OR extract(dow FROM m.wa_timestamp AT TIME ZONE 'Asia/Kolkata')::int = p_weekday)
    AND (p_hour IS NULL OR extract(hour FROM m.wa_timestamp AT TIME ZONE 'Asia/Kolkata')::int = p_hour)
    AND (p_search IS NULL OR m.text ILIKE '%' || p_search || '%')
    AND sia.client_side(g.member_id, m.sender_jid, m.wa_timestamp, m.from_me)
  ORDER BY m.wa_timestamp DESC
  LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0);
$$;

-- The dashboard's one read. Every linked member group the watcher is in (one group = one client
-- entry), with its member, queendom, membership and the last time each side wrote; then, for the
-- last p_days India days, only the days the client's side was active, each with its non-zero hours
-- as [hour, messages, reactions]. Days are [group, day, messages, reactions, hours].
CREATE OR REPLACE FUNCTION sia.client_activity_board(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = sia, pg_temp AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d),
  grp AS (
    SELECT g.group_jid, g.member_id, g.subject, m.full_name, m.membership_status,
           nullif(regexp_replace(coalesce(q.name, ''), '\s*queendom$', '', 'i'), '') AS queendom
    FROM sia.wag_groups g
    JOIN member.members m ON m.id = g.member_id
    LEFT JOIN sia.queendoms q ON q.id = m.queendom_id
    WHERE g.group_kind = 'member' AND g.is_active
  ), last AS (
    SELECT a.group_jid, max(a.last_client_at) AS lc, max(a.last_team_at) AS lt
    FROM sia.client_activity_daily a GROUP BY a.group_jid
  )
  SELECT jsonb_build_object(
    'today', (SELECT d FROM today),
    'groups', coalesce((
      SELECT jsonb_agg(jsonb_build_object('gid', g.group_jid, 'mid', g.member_id, 'name', coalesce(g.full_name, g.subject),
               'subject', g.subject, 'qd', g.queendom, 'mem', g.membership_status, 'lc', l.lc, 'lt', l.lt) ORDER BY g.group_jid)
      FROM grp g LEFT JOIN last l ON l.group_jid = g.group_jid), '[]'::jsonb),
    'days', coalesce((
      SELECT jsonb_agg(jsonb_build_array(a.group_jid, a.day, a.client_messages, a.client_reactions,
               (SELECT coalesce(jsonb_agg(jsonb_build_array(i - 1, a.message_hours[i], a.reaction_hours[i]) ORDER BY i), '[]'::jsonb)
                FROM generate_subscripts(a.message_hours, 1) AS i WHERE a.message_hours[i] + a.reaction_hours[i] > 0))
             ORDER BY a.day, a.group_jid)
      FROM sia.client_activity_daily a JOIN grp g ON g.group_jid = a.group_jid
      WHERE a.day > (SELECT d FROM today) - p_days AND a.client_messages + a.client_reactions > 0), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION sia.client_activity_board(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.client_activity_board(integer) TO service_role;
REVOKE ALL ON FUNCTION sia.client_side(uuid, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.client_activity_messages(timestamptz, timestamptz, text[], integer, integer, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.client_side(uuid, text, timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION sia.client_activity_messages(timestamptz, timestamptz, text[], integer, integer, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION sia.refresh_team_senders()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.refresh_client_activity(date, date)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.refresh_team_senders()               TO service_role;
GRANT EXECUTE ON FUNCTION sia.refresh_client_activity(date, date)  TO service_role;

COMMENT ON TABLE sia.team_senders IS
  'Every WhatsApp id that is NOT the client''s side in a member group (0250): our team (account, position, "Indulge" name, 6+ member groups), vendors. team_until is set when an id stops being team; rows are never deleted, so a recount judges each message by who the sender was when it was sent.';
COMMENT ON TABLE sia.client_activity_daily IS
  'The Jokers'' Activity dashboard (0250): one row per linked member group per India day. Counts the CLIENT''S SIDE only (member, family, plus-one, assistant); one group = one client entry. Active = a message or reaction in the last 14 days; Silent = none for 14+ days. Written only by sia.refresh_client_activity().';
