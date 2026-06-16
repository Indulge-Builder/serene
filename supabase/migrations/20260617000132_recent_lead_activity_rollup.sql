-- Migration 0132: get_recent_lead_activity — the "recent leads worked" rollup
--
-- Reframes the dashboard "Recent Activity" widget from an EVENT stream (one row
-- per lead_activities insert — the same lead repeating across call/note/status
-- rows) into a LEAD rollup: one card per lead, the most-recently-worked first.
-- A manager/founder scrolls the last ~25 leads and sees, per lead, the current
-- state of the work — status, the latest call outcome (e.g. RNR), and the latest
-- note — exactly "what happened on this lead lately".
--
-- This SUPERSEDES migration 0131 (get_agent_recent_activity enrich). 0131 was
-- never applied (Docker down since it was authored), so there is no deployed
-- function to drop — 0131 simply becomes dead and is documented as superseded.
--
-- Why query `leads`, not `lead_activities`: `leads` already denormalises every
-- field this card needs — `status`, `last_call_outcome` (+ `_at`),
-- `last_activity_at`, `assigned_to`, name/slug/domain. So the rollup is a single
-- descent on `leads ORDER BY last_activity_at DESC` (naturally one row per lead),
-- joined to the latest note. No aggregation over lead_activities, no GROUP BY,
-- no dedup pass. Fast at 100×.
--
-- Scope (`p_scope`):
--   'mine' → leads assigned to the caller (p_user_id), regardless of role.
--   'team' → role-scoped: agent ALWAYS own leads (a crafted 'team' can never
--            widen an agent's scope); manager → p_domain; admin/founder →
--            p_domain when set, else all-org.
-- The service layer derives p_scope/p_domain/p_user_id from the verified profile
-- (Q-13 — the caller is the trust boundary). EXECUTE revoked from clients,
-- admin-client only, mirroring the 0102/0131 posture.

CREATE OR REPLACE FUNCTION get_recent_lead_activity(
  p_role    text,
  p_domain  app_domain,
  p_user_id uuid,
  p_scope   text DEFAULT 'team'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH recent_leads AS (
    SELECT
      l.id,
      l.slug,
      l.domain::text                                        AS domain,
      TRIM(l.first_name || ' ' || COALESCE(l.last_name, '')) AS lead_name,
      l.status,
      l.last_call_outcome,
      l.last_activity_at,
      l.assigned_to,
      assignee.full_name                                    AS assignee_name,
      -- The latest note on this lead (body + when). Correlated, one row,
      -- served by idx_lead_notes_lead_id (lead_id, created_at DESC).
      (
        SELECT LEFT(ln.content, 160)
        FROM lead_notes ln
        WHERE ln.lead_id = l.id
          AND ln.content IS NOT NULL
          AND ln.content <> ''
        ORDER BY ln.created_at DESC
        LIMIT 1
      )                                                     AS note_body
    FROM leads l
    LEFT JOIN profiles assignee ON assignee.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND l.last_activity_at IS NOT NULL
      AND CASE
            -- 'mine' is assignee-scoped for every role.
            WHEN p_scope = 'mine' THEN l.assigned_to = p_user_id
            -- 'team' is role-scoped. Agent can never widen past own leads.
            WHEN p_role = 'agent'              THEN l.assigned_to = p_user_id
            WHEN p_role = 'manager'            THEN l.domain = p_domain
            -- admin/founder: p_domain when given, else all-org.
            WHEN p_domain IS NOT NULL          THEN l.domain = p_domain
            ELSE TRUE
          END
    ORDER BY l.last_activity_at DESC
    LIMIT 25
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lead_id',           r.id,
        'lead_slug',         r.slug,
        'lead_name',         r.lead_name,
        'lead_domain',       r.domain,
        'status',            r.status,
        'last_call_outcome', r.last_call_outcome,
        'last_activity_at',  r.last_activity_at,
        'assigned_to',       r.assigned_to,
        'assignee_name',     r.assignee_name,
        'note_body',         r.note_body
      )
      ORDER BY r.last_activity_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM recent_leads r;

  RETURN v_result;
END;
$$;

-- Scope-param RPC (Q-13 revoked tier): admin client only, the service is the
-- trust boundary. EXECUTE revoked from clients; service_role only.
REVOKE EXECUTE ON FUNCTION get_recent_lead_activity(text, app_domain, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_recent_lead_activity(text, app_domain, uuid, text)
  TO service_role;
