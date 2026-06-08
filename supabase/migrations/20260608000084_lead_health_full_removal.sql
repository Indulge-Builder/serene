-- Migration 0084: complete lead_health removal from production.
-- Migrations 0077–0079 introduced lead_health; 0082 reverted it and 0083 removed
-- the get_leads_status_counts p_health filter. An audit found production still
-- carrying the column, index, refresh_lead_health_bulk(), and lead_health SET
-- clauses in add_lead_call_note / add_lead_plain_note (0082 recorded but body
-- drift). This migration is fully idempotent (IF EXISTS / CREATE OR REPLACE).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop lead_health column (constraint leads_lead_health_check CASCADE-drops)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER TABLE public.leads DROP COLUMN IF EXISTS lead_health;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN undefined_table THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop stale partial index
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_leads_health;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop bulk refresh RPC
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.refresh_lead_health_bulk();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Replace add_lead_call_note — production body minus lead_health assignment
--    (matches migration 0030 / 0082; UPDATE sets only call_count, last_call_outcome,
--    last_activity_at, status, status_changed_at)
-- ─────────────────────────────────────────────────────────────────────────────

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
     SET call_count        = v_new_call_count,
         last_call_outcome = p_call_outcome,
         last_activity_at  = p_now,
         status            = CASE WHEN v_auto_advance THEN 'touched' ELSE status END,
         status_changed_at = CASE WHEN v_auto_advance THEN p_now ELSE status_changed_at END
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Replace add_lead_plain_note — production body minus lead_health assignment
--    (UPDATE sets only last_activity_at)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_lead_plain_note(
  p_lead_id    uuid,
  p_author_id  uuid,
  p_content    text,
  p_now        timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id  uuid;
BEGIN
  -- Verify lead exists
  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- Insert note with no call outcome (append-only — A-11)
  INSERT INTO lead_notes (lead_id, author_id, content, call_outcome)
  VALUES (p_lead_id, p_author_id, p_content, NULL)
  RETURNING id INTO v_note_id;

  -- Update last_activity_at on the lead
  UPDATE leads
     SET last_activity_at = p_now
   WHERE id = p_lead_id;

  -- Log note_added activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'note_added',
    jsonb_build_object('manual', true)
  );

  RETURN jsonb_build_object('note_id', v_note_id);
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_plain_note(uuid, uuid, text, timestamptz) TO authenticated;
