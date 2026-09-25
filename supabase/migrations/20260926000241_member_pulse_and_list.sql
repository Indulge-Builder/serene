-- 0241 — the member pulse (activity numbers in SQL) and the members_list view
--
-- Why: the founder wants the Members list ordered by who is active and, on each member, a real
-- judgement built from everything we hold. Two things were missing under that. First, there was
-- no per-member activity number anywhere: "Last contact" on the list came from Freshdesk ticket
-- updates only (a member who talks every day in their WhatsApp group but never raises a ticket
-- read as silent), it was computed per page, and the list could only sort by name. Second, the
-- judgement needs a home the list can sort on.
--
-- The home is member.member_snapshot (0194's "fast snapshot per member": the table existed and
-- nothing filled it). Its `data` jsonb now carries `pulse` (this function) and `assessment`
-- (services/member-assessment.ts); `narrative` stays reserved for the profiler's weekly words.
-- Every write MERGES its own key (`data || {...}`) so no writer clobbers another's.
--
-- compute_member_pulse(): one statement over the WhatsApp mirror, the Freshdesk mirror and Sia's
-- tickets for EVERY member (about 600 rows): last message from the member side (a staff contact
-- is never the member; from_me is the connector), messages both ways in the last 30 days, tickets
-- in the last 90 days across both systems, open tickets, escalations, last contact = the latest
-- of message or ticket, and activity_score (0..100): recency 50 (100% within a day, fading to 0
-- at 60 days) + 30 for messages (20 in 30 days = full) + 20 for tickets (6 in 90 days = full).
-- SECURITY DEFINER because it reads three schemas the service role owns; EXECUTE revoked from
-- authenticated. Run hourly (src/trigger/member-assessment.ts) and before every judgement.
CREATE OR REPLACE FUNCTION member.compute_member_pulse()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE n integer;
BEGIN
  WITH staff AS (
    SELECT c.jid FROM sia.wag_contacts c WHERE c.staff_profile_id IS NOT NULL
  ),
  grp AS (
    SELECT g.group_jid, g.member_id FROM sia.wag_groups g WHERE g.member_id IS NOT NULL
  ),
  msgs AS (
    SELECT grp.member_id,
      max(m.wa_timestamp) FILTER (WHERE NOT m.from_me AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.jid = m.sender_jid))                                                        AS last_member_message_at,
      count(*)            FILTER (WHERE NOT m.from_me AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.jid = m.sender_jid) AND m.wa_timestamp >= now() - interval '30 days')    AS member_messages_30d,
      count(*)            FILTER (WHERE (m.from_me OR EXISTS (SELECT 1 FROM staff s WHERE s.jid = m.sender_jid)) AND m.wa_timestamp >= now() - interval '30 days')           AS staff_messages_30d
    FROM grp
    JOIN sia.wag_messages m ON m.chat_jid = grp.group_jid
    WHERE m.wa_timestamp >= now() - interval '365 days' AND m.type <> 'system' AND NOT m.is_revoked
    GROUP BY grp.member_id
  ),
  fd AS (
    SELECT t.member_id,
      max(t.fd_updated_at)                                                                   AS last_ticket_at,
      count(*) FILTER (WHERE t.fd_created_at >= now() - interval '90 days')                  AS tickets_90d,
      count(*) FILTER (WHERE t.status NOT IN (4, 5))                                         AS open_tickets,
      count(*) FILTER (WHERE t.is_escalated AND t.fd_created_at >= now() - interval '90 days') AS escalated_90d,
      count(*)                                                                               AS tickets_all
    FROM freshdesk.tickets t
    WHERE t.member_id IS NOT NULL AND NOT t.deleted AND NOT t.spam
    GROUP BY t.member_id
  ),
  st AS (
    SELECT t.member_id,
      max(t.updated_at)                                                                      AS last_ticket_at,
      count(*) FILTER (WHERE t.created_at >= now() - interval '90 days')                     AS tickets_90d,
      count(*) FILTER (WHERE t.status NOT IN ('resolved', 'closed', 'dropped'))              AS open_tickets
    FROM sia.tickets t
    GROUP BY t.member_id
  ),
  pulse AS (
    SELECT mm.id AS member_id,
      msgs.last_member_message_at,
      coalesce(msgs.member_messages_30d, 0)                          AS member_messages_30d,
      coalesce(msgs.staff_messages_30d, 0)                           AS staff_messages_30d,
      greatest(fd.last_ticket_at, st.last_ticket_at)                 AS last_ticket_at,
      coalesce(fd.tickets_90d, 0) + coalesce(st.tickets_90d, 0)      AS tickets_90d,
      coalesce(fd.open_tickets, 0) + coalesce(st.open_tickets, 0)    AS open_tickets,
      coalesce(fd.escalated_90d, 0)                                  AS escalated_90d,
      coalesce(fd.tickets_all, 0)                                    AS tickets_all,
      greatest(msgs.last_member_message_at, fd.last_ticket_at, st.last_ticket_at) AS last_contact_at
    FROM member.members mm
    LEFT JOIN msgs ON msgs.member_id = mm.id
    LEFT JOIN fd   ON fd.member_id = mm.id
    LEFT JOIN st   ON st.member_id = mm.id
  ),
  scored AS (
    SELECT p.*,
      round(
        CASE WHEN p.last_contact_at IS NULL THEN 0
             ELSE greatest(0, 50 - 50 * extract(epoch FROM (now() - p.last_contact_at)) / (60 * 86400)) END
        + 30 * least(1, p.member_messages_30d / 20.0)
        + 20 * least(1, p.tickets_90d / 6.0)
      )::int AS activity_score
    FROM pulse p
  )
  INSERT INTO member.member_snapshot (member_id, data, built_at, version)
  SELECT s.member_id,
    jsonb_build_object('pulse', jsonb_build_object(
      'activity_score',         s.activity_score,
      'last_contact_at',        s.last_contact_at,
      'last_member_message_at', s.last_member_message_at,
      'last_ticket_at',         s.last_ticket_at,
      'member_messages_30d',    s.member_messages_30d,
      'staff_messages_30d',     s.staff_messages_30d,
      'tickets_90d',            s.tickets_90d,
      'tickets_all',            s.tickets_all,
      'open_tickets',           s.open_tickets,
      'escalated_90d',          s.escalated_90d,
      'computed_at',            now()
    )),
    now(), 1
  FROM scored s
  ON CONFLICT (member_id) DO UPDATE
    SET data     = coalesce(member.member_snapshot.data, '{}'::jsonb) || EXCLUDED.data,
        built_at = now(),
        version  = member.member_snapshot.version + 1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION member.compute_member_pulse() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION member.compute_member_pulse() TO service_role;
COMMENT ON FUNCTION member.compute_member_pulse() IS
  'Recomputes the pulse (activity numbers + activity_score) for every member into member_snapshot.data->pulse, merging, never clobbering the other keys. Service role only; hourly from Trigger.dev.';

-- The list read: members + the snapshot''s pulse and judgement as plain columns, so /members can
-- sort on them. security_invoker: the members RLS (member_visible) decides who sees which row.
CREATE OR REPLACE VIEW member.members_list WITH (security_invoker = on) AS
SELECT
  m.id, m.full_name, m.primary_phone, m.queendom_id, m.tier, m.membership_status, m.membership_end,
  m.freshdesk_contact_id, m.zoho_customer_id, m.app_member_id, m.wa_group_jid, m.updated_at,
  (m.membership_status = 'Active')                                  AS is_active,
  (s.data->'pulse'->>'activity_score')::int                         AS activity_score,
  (s.data->'pulse'->>'last_contact_at')::timestamptz                AS last_contact_at,
  coalesce((s.data->'pulse'->>'open_tickets')::int, 0)              AS open_tickets,
  (s.data->'assessment'->>'score')::int                             AS assessment_score,
  s.data->'assessment'->>'risk'                                     AS assessment_risk,
  s.data->'assessment'->>'verdict'                                  AS assessment_verdict,
  (s.data->'assessment'->>'assessed_at')::timestamptz               AS assessed_at
FROM member.members m
LEFT JOIN member.member_snapshot s ON s.member_id = m.id;
GRANT SELECT ON member.members_list TO authenticated, service_role;
COMMENT ON VIEW member.members_list IS
  'The /members list read (0241): members with the pulse (activity_score, last_contact_at, open_tickets) and the judgement (assessment_*) as columns to sort on. security_invoker: RLS on members applies.';
