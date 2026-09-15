-- 0196 — freshdesk.ticket_overview(): the /freshdesk overview strip in ONE scan
--
-- Why: the five numbers above the ticket list (open, created today, resolved today,
-- escalated, matching) and the by-status pills were computed by thirteen separate
-- HEAD-count queries that ignored the filter bar, so the strip never agreed with the
-- table under it. This function takes the SAME filters the list takes and answers
-- everything in one pass over freshdesk.tickets (count(*) FILTER per status, summed
-- outside). The leads page does the same with get_leads_status_counts.
--
-- Semantics (mirrors listFreshdeskTickets in lib/services/freshdesk-service.ts):
--   * deleted = false AND spam = false always
--   * group / agent / category / priority / created-at range / search / client apply to EVERYTHING
--   * the status filter applies to the five tiles but NOT to by_status — the pills show
--     the status mix of the filtered set so the user can see what a status pick would do
--   * search: subject ILIKE, requester_name ILIKE, or the exact ticket id when numeric
--     (the caller strips PostgREST-unsafe characters first, the same searchToken())
--   * created_today / resolved_today count against p_today_start (IST midnight, computed
--     by the caller with lib/utils/ist — never re-fork IST math in SQL)
--
-- Access: the freshdesk schema is service_role only (0193); this function follows.

CREATE OR REPLACE FUNCTION freshdesk.ticket_overview(
  p_status      integer[]   DEFAULT NULL,
  p_group       bigint      DEFAULT NULL,
  p_agent       bigint      DEFAULT NULL,
  p_category    text        DEFAULT NULL,
  p_priority    integer     DEFAULT NULL,
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_search      text        DEFAULT NULL,
  p_client      uuid        DEFAULT NULL,
  p_today_start timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = freshdesk, pg_temp
AS $$
  WITH per_status AS (
    SELECT
      b.status,
      count(*)                                                        AS n,
      count(*) FILTER (WHERE b.m)                                     AS n_matching,
      count(*) FILTER (WHERE b.m AND b.fd_created_at >= p_today_start) AS created_today,
      count(*) FILTER (WHERE b.m AND b.resolved_at   >= p_today_start) AS resolved_today,
      count(*) FILTER (WHERE b.m AND b.is_escalated)                  AS escalated
    FROM (
      SELECT
        t.status, t.fd_created_at, t.resolved_at, t.is_escalated,
        (p_status IS NULL OR cardinality(p_status) = 0 OR t.status = ANY (p_status)) AS m
      FROM freshdesk.tickets t
      WHERE t.deleted = false
        AND t.spam = false
        AND (p_group    IS NULL OR t.group_id     = p_group)
        AND (p_agent    IS NULL OR t.responder_id = p_agent)
        AND (p_category IS NULL OR t.category     = p_category)
        AND (p_priority IS NULL OR t.priority     = p_priority)
        AND (p_from     IS NULL OR t.fd_created_at >= p_from)
        AND (p_to       IS NULL OR t.fd_created_at <= p_to)
        AND (p_client   IS NULL OR t.client_id     = p_client)
        AND (
          p_search IS NULL OR p_search = ''
          OR t.subject        ILIKE '%' || p_search || '%'
          OR t.requester_name ILIKE '%' || p_search || '%'
          OR (p_search ~ '^[0-9]{1,18}$' AND t.id = p_search::bigint)
        )
    ) b
    GROUP BY b.status
  )
  SELECT jsonb_build_object(
    'by_status',      COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', n) ORDER BY status), '[]'::jsonb),
    'total',          COALESCE(sum(n_matching), 0),
    'open',           COALESCE(sum(n_matching)  FILTER (WHERE status NOT IN (4, 5)), 0),
    'created_today',  COALESCE(sum(created_today), 0),
    'resolved_today', COALESCE(sum(resolved_today), 0),
    'escalated_open', COALESCE(sum(escalated)   FILTER (WHERE status NOT IN (4, 5)), 0)
  )
  FROM per_status;
$$;

REVOKE ALL ON FUNCTION freshdesk.ticket_overview(integer[], bigint, bigint, text, integer, timestamptz, timestamptz, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION freshdesk.ticket_overview(integer[], bigint, bigint, text, integer, timestamptz, timestamptz, text, uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION freshdesk.ticket_overview IS
  'The /freshdesk overview strip in one scan: by_status (all filters except status), total/open/created_today/resolved_today/escalated_open (all filters). Service role only; the admin/founder page gate is the trust boundary.';

-- The cheap first cut of every overview scan: the live (not deleted, not spam) rows.
CREATE INDEX IF NOT EXISTS idx_freshdesk_tickets_live_status
  ON freshdesk.tickets (status, fd_created_at DESC)
  WHERE deleted = false AND spam = false;
