-- Migration 0112: leads.last_call_outcome_at — when the latest call outcome was logged.
--
-- leads.last_call_outcome has existed since 0003 and add_lead_call_note already
-- denormalizes it on every call note. What the outcome-cadence engine (Phase 2)
-- additionally needs is the TIMESTAMP of that outcome: the cadence's 7-day
-- freshness window reads it at every tick, so stale/pre-go-live outcomes can
-- never arm a daily follow-up task.
--
-- Backfill stamps the latest historical outcome note's created_at. Those
-- timestamps are historical, and arming only ever happens from a live
-- add_lead_call_note (or a cadence tick re-arming itself) — so the backfill
-- arms nothing; it only makes the freshness check truthful for leads whose
-- next tick asks "how old is this outcome?".

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_outcome_at timestamptz;

-- ── Backfill from the latest outcome-bearing note per lead ───────────────────

UPDATE leads l
   SET last_call_outcome_at = n.latest_outcome_at
  FROM (
    SELECT lead_id, max(created_at) AS latest_outcome_at
      FROM lead_notes
     WHERE call_outcome IS NOT NULL
     GROUP BY lead_id
  ) n
 WHERE n.lead_id = l.id
   AND l.last_call_outcome IS NOT NULL
   AND l.last_call_outcome_at IS NULL;

-- ── add_lead_call_note — stamp last_call_outcome_at alongside last_call_outcome
--    Body identical to 0084 except the one new SET line in step 4.

CREATE OR REPLACE FUNCTION add_lead_call_note(
  p_lead_id      uuid,
  p_author_id    uuid,
  p_content      text,
  p_call_outcome text,
  p_now          timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          text;
  v_call_count      int;
  v_assigned_to     uuid;
  v_domain          text;
  v_new_call_count  int;
  v_auto_advance    boolean;
  v_note_id         uuid;
BEGIN
  -- 1. Fetch current lead state
  SELECT status, call_count, assigned_to, domain
    INTO v_status, v_call_count, v_assigned_to, v_domain
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- 2. Insert note (append-only — A-11)
  INSERT INTO lead_notes (lead_id, author_id, content, call_outcome)
  VALUES (p_lead_id, p_author_id, p_content, p_call_outcome)
  RETURNING id INTO v_note_id;

  -- 3. Compute derived values
  v_new_call_count := COALESCE(v_call_count, 0) + 1;
  v_auto_advance   := (v_status = 'new');

  -- 4. Single UPDATE on leads
  UPDATE leads
     SET call_count           = v_new_call_count,
         last_call_outcome    = p_call_outcome,
         last_call_outcome_at = p_now,
         last_activity_at     = p_now,
         status               = CASE WHEN v_auto_advance THEN 'touched' ELSE status END,
         status_changed_at    = CASE WHEN v_auto_advance THEN p_now ELSE status_changed_at END
   WHERE id = p_lead_id;

  -- 5. Log call_logged activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'call_logged',
    jsonb_build_object('outcome', p_call_outcome, 'call_count', v_new_call_count)
  );

  -- 6. Log note_added activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'note_added',
    jsonb_build_object('call_outcome', p_call_outcome)
  );

  -- 7. Conditionally log status_changed activity (new → touched only)
  IF v_auto_advance THEN
    INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
    VALUES (
      p_lead_id,
      p_author_id,
      'status_changed',
      jsonb_build_object('old_status', 'new', 'new_status', 'touched')
    );
  END IF;

  -- 8. Return data the action layer needs for SLA side-effects
  RETURN jsonb_build_object(
    'note_id',          v_note_id,
    'new_call_count',   v_new_call_count,
    'did_auto_advance', v_auto_advance,
    'assigned_to',      v_assigned_to,
    'domain',           v_domain,
    'old_status',       v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_call_note(uuid, uuid, text, text, timestamptz) TO authenticated;
