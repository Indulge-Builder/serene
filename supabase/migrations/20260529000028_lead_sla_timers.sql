-- ============================================================
-- Migration 0028 — lead_sla_timers table
--
-- Tracks Trigger.dev scheduled jobs for each SLA rule per lead.
-- NOT append-only: status, fired_at, cancelled_at, trigger_run_id
-- are updated by service-role Trigger.dev jobs when timers fire or cancel.
-- This is a documented exception to the append-only rule (A-11):
-- The table tracks mutable job state, not immutable audit events.
-- Only the service role (admin client) may mutate rows.
-- Regular users have SELECT only (scoped by their access level).
-- ============================================================

CREATE TABLE lead_sla_timers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_code         text        NOT NULL,
  scheduled_fire_at timestamptz NOT NULL,
  trigger_run_id    text,           -- Trigger.dev run ID; set after scheduling, nullable
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'fired', 'cancelled')),
  fired_at          timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Index: look up all timers for a lead (cancel-all pattern)
CREATE INDEX idx_lead_sla_timers_lead_id
  ON lead_sla_timers(lead_id);

-- Partial index: only pending timers queried at runtime (stale-fire guard)
CREATE INDEX idx_lead_sla_timers_pending
  ON lead_sla_timers(status)
  WHERE status = 'pending';

-- Composite: lead + rule_code for idempotency checks
CREATE INDEX idx_lead_sla_timers_lead_rule
  ON lead_sla_timers(lead_id, rule_code);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE lead_sla_timers ENABLE ROW LEVEL SECURITY;

-- Agents see timers for their own leads
CREATE POLICY "lead_sla_timers_agent_select"
  ON lead_sla_timers
  FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_sla_timers.lead_id
        AND l.assigned_to = auth.uid()
        AND l.archived_at IS NULL
    )
  );

-- Managers see timers for leads in their domain
CREATE POLICY "lead_sla_timers_manager_select"
  ON lead_sla_timers
  FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_sla_timers.lead_id
        AND l.domain = get_user_domain()::text
        AND l.archived_at IS NULL
    )
  );

-- Admin and founder see all
CREATE POLICY "lead_sla_timers_admin_founder_select"
  ON lead_sla_timers
  FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
  );

-- No INSERT policy for regular users — service role only (admin client bypasses RLS).
-- No UPDATE or DELETE policy for regular users — service role manages state.
-- This is intentional: SLA timers are system-managed, not user-editable.
