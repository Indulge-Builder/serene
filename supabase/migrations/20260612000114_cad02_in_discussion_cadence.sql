-- Migration 0114: CAD-02A — the In Discussion 48-hour cadence config row.
--
-- The original Phase 2 seed (0111) carried the status-breach rules (SLA-03A/B
-- fire ONCE at 24h/36h) and the outcome cadence family (CAD-01A/B/C, daily).
-- The "In Discussion 48h cadence" from the engine spec was NOT seeded — this
-- row completes it.
--
-- Semantics (engine extension shipped alongside this migration in
-- lib/actions/sla.ts): a CAD-prefixed code marks a policy as a CADENCE rule
-- regardless of trigger_kind. CAD-02A is trigger_kind='status' — it arms with
-- the other in_discussion status policies on every status change / activity
-- refresh, but on fire it takes the cadence path: create a follow-up task for
-- the agent (open-task guard applies) and RE-ARM threshold_minutes ahead,
-- repeating for as long as the lead sits in in_discussion. Leaving the status
-- (or any call note, which resets the clock via refreshActivitySlaTimers)
-- disarms/re-bases it structurally via the existing cancel-all.
--
-- channels '{}' — the created task IS the nudge (CAD family convention).
-- 2880 business minutes = 48 business hours on the agent's shift.

INSERT INTO sla_policies
  (code, trigger_kind, trigger_value, threshold_minutes, recipient_role, auto_task, channels, hours_mode, active)
VALUES
  ('CAD-02A', 'status', 'in_discussion', 2880, 'agent', true, '{}', 'agent_shift', true)
ON CONFLICT (code) DO NOTHING;
