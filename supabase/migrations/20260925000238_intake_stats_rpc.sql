-- 0238 — sia.intake_stats(p_since): the intake training numbers, counted in SQL
--
-- Why: the "Suggested by Serene" strip on /tickets showed its training numbers by pulling
-- every intake model run of the last 7 days (with the full output jsonb, 2.4 MB, 4,100 rows)
-- plus every card plus every health event into the app, then doing sixty separate HEAD
-- counts against the Freshdesk mirror for the free exam. Two things went wrong at once:
-- the strip arrived about two seconds after the page had painted (and pushed the whole
-- page down when it landed), and PostgREST's 1,000-row response cap silently cut the run
-- list, so "chats read" and the cost were wrong. This function answers everything in one
-- statement, counted where the rows are.
--
-- Semantics (mirrors the old getIntakeStats in lib/services/intake-service.ts):
--   * runs: sia.extraction_runs with kind = 'intake' since p_since, dry runs excluded
--     (input_ref->>'dry_run' = 'true'); by_kind = output->'verdict'->>'kind' of ok runs;
--     tokens summed so the caller prices them (the price stays in one place, in TS)
--   * cards: sia.intake_proposals created since p_since, by status, dismiss reason, and
--     whether an accept changed nothing (fields_changed empty)
--   * the free exam: of the newest p_exam request cards, how many have a Freshdesk ticket
--     for the same member created between 30 minutes before and 2 hours after the first
--     message (freshdesk.tickets.member_id, fd_created_at)
--   * health: member.member_health_events written by intake (evidence->>'source' = 'intake')
--     since p_since, by signal
--
-- Access: SECURITY INVOKER, EXECUTE revoked from authenticated and anon. The strip's numbers
-- are company-wide (they cross three schemas), so only the admin client calls this, and the
-- page decides who sees them (admin and founder). Q-13 revoked tier.
CREATE OR REPLACE FUNCTION sia.intake_stats(p_since timestamptz, p_exam integer DEFAULT 60)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH runs AS (
    SELECT r.ok, r.tokens_in, r.tokens_out, r.output->'verdict'->>'kind' AS kind
    FROM sia.extraction_runs r
    WHERE r.kind = 'intake' AND r.started_at >= p_since
      AND coalesce(r.input_ref->>'dry_run', 'false') <> 'true'
  ),
  by_kind AS (
    SELECT jsonb_object_agg(kind, n) AS j
    FROM (SELECT kind, count(*) AS n FROM runs WHERE ok AND kind IS NOT NULL GROUP BY kind) k
  ),
  cards AS (
    SELECT p.id, p.member_id, p.kind, p.status, p.dismiss_reason, p.fields_changed, p.first_message_at
    FROM sia.intake_proposals p
    WHERE p.created_at >= p_since
  ),
  reasons AS (
    SELECT jsonb_object_agg(dismiss_reason, n) AS j
    FROM (SELECT dismiss_reason, count(*) AS n FROM cards WHERE status = 'dismissed' AND dismiss_reason IS NOT NULL GROUP BY dismiss_reason) d
  ),
  exam AS (
    SELECT c.id,
      EXISTS (
        SELECT 1 FROM freshdesk.tickets t
        WHERE t.member_id = c.member_id
          AND t.fd_created_at >= c.first_message_at - interval '30 minutes'
          AND t.fd_created_at <= c.first_message_at + interval '2 hours'
      ) AS agreed
    FROM (SELECT * FROM cards WHERE kind = 'request' ORDER BY first_message_at DESC LIMIT p_exam) c
  ),
  health AS (
    SELECT jsonb_object_agg(signal, n) AS j
    FROM (
      SELECT h.signal, count(*) AS n
      FROM member.member_health_events h
      WHERE h.evidence->>'source' = 'intake' AND h.created_at >= p_since
      GROUP BY h.signal
    ) s
  )
  SELECT jsonb_build_object(
    'bursts_read',        (SELECT count(*) FROM runs),
    'tokens_in',          (SELECT coalesce(sum(tokens_in), 0) FROM runs),
    'tokens_out',         (SELECT coalesce(sum(tokens_out), 0) FROM runs),
    'by_kind',            coalesce((SELECT j FROM by_kind), '{}'::jsonb),
    'proposed',           (SELECT count(*) FROM cards),
    'open',               (SELECT count(*) FROM cards WHERE status = 'open'),
    'accepted',           (SELECT count(*) FROM cards WHERE status = 'accepted'),
    'accepted_untouched', (SELECT count(*) FROM cards WHERE status = 'accepted' AND coalesce(cardinality(fields_changed), 0) = 0),
    'dismissed',          (SELECT count(*) FROM cards WHERE status = 'dismissed'),
    'dismissed_by_reason', coalesce((SELECT j FROM reasons), '{}'::jsonb),
    'expired',            (SELECT count(*) FROM cards WHERE status = 'expired'),
    'freshdesk_agreed',   (SELECT count(*) FROM exam WHERE agreed),
    'freshdesk_checked',  (SELECT count(*) FROM exam),
    'health_by_signal',   coalesce((SELECT j FROM health), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION sia.intake_stats(timestamptz, integer) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION sia.intake_stats(timestamptz, integer) TO service_role;

COMMENT ON FUNCTION sia.intake_stats(timestamptz, integer) IS
  'The intake training numbers since p_since in one statement (runs, cards, the Freshdesk exam on the newest p_exam request cards, health signals). Admin client only; the page gates.';
