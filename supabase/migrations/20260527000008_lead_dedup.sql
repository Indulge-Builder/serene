-- Migration 0008: lead deduplication — phone as identity key
--
-- Design:
--   Phone is the deduplication key. When a webhook arrives for a phone number
--   that already has an active lead (new | touched | in_discussion | nurturing),
--   no new lead is created. Instead a duplicate_submission activity is logged on
--   the existing lead so the agent sees the re-enquiry immediately.
--
--   When the existing lead is terminal (lost | junk | won), a new lead IS created
--   because it represents a fresh enquiry / returning prospect. The new lead carries
--   a previous_lead_id FK pointing to its predecessor, forming a traversable chain.
--
-- previous_lead_id chain:
--   Self-referential FK. No CASCADE — deleting a lead must never cascade.
--   Each new lead points to the one immediately before it for the same phone.
--   Walk the chain to reconstruct the full history for any number.
--
-- Active statuses  : new | touched | in_discussion | nurturing
-- Terminal statuses: lost | junk | won

-- ─────────────────────────────────────────────────────────
-- 1. Add previous_lead_id column to leads
-- ─────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN previous_lead_id uuid
    REFERENCES leads(id)
    ON DELETE RESTRICT    -- never cascade; a lead's history must never be destroyed
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_leads_previous_lead_id
  ON leads(previous_lead_id)
  WHERE previous_lead_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────
-- 2. Phone lookup index
--    Partial index — only active (non-archived) leads.
--    The migration 0003 created idx_leads_phone ON leads(phone)
--    without the partial filter. We add the partial one here for
--    the dedup lookup hot path. Both can coexist; the planner picks the
--    more selective partial index for the dedup query.
-- ─────────────────────────────────────────────────────────
CREATE INDEX idx_leads_phone_active
  ON leads(phone)
  WHERE archived_at IS NULL AND phone IS NOT NULL AND phone <> '';

-- ─────────────────────────────────────────────────────────
-- 3. get_active_lead_by_phone(p_phone text)
--
--    Returns the single active lead row for a phone number, or NULL.
--    "Active" means: archived_at IS NULL AND status IN (active statuses).
--    Returns the full row so ingestion can branch on status without a
--    second round-trip.
--
--    If multiple active leads exist for the same phone (should not happen,
--    but possible from pre-dedup data), returns the most recently created one.
--
--    SECURITY DEFINER + SET search_path: rule A-10.
--    Called from service role in webhook context — no auth.uid() needed.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_active_lead_by_phone(p_phone text)
RETURNS SETOF leads
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM leads
   WHERE phone       = p_phone
     AND archived_at IS NULL
     AND status      IN ('new', 'touched', 'in_discussion', 'nurturing')
   ORDER BY created_at DESC
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_active_lead_by_phone(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_active_lead_by_phone(text) FROM authenticated;
-- service_role retains EXECUTE.

-- ─────────────────────────────────────────────────────────
-- 4. Register duplicate_submission as a valid action_type
--    (no DB constraint on the text column; this is documentation only)
--
--    details payload for duplicate_submission:
--    {
--      "source":        "meta",
--      "utm_campaign":  "TG_Global_...",
--      "domain":        "concierge",
--      "raw_payload_id": "<uuid>"
--    }
-- ─────────────────────────────────────────────────────────
COMMENT ON TABLE lead_activities IS
  'Append-only activity log. Valid action_type values:
   lead_created | status_changed | note_added | agent_assigned |
   call_logged  | duplicate_submission';
