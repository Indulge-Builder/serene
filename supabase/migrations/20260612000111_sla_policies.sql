-- Migration 0111: sla_policies — the config table behind the Gia follow-up engine.
--
-- One row per rule. The engine (lib/actions/sla.ts + src/trigger jobs) reads this
-- table per job run via the admin client — never cached at module scope — so a
-- threshold edit applies on the next fire without a deploy.
--
-- trigger_kind:
--   'status'   — lead sat in trigger_value (a lead status) for threshold_minutes
--                of business/shift time (the original 8 SLA rules + SLA-01C)
--   'outcome'  — latest call outcome equals trigger_value (a CallOutcome value);
--                daily cadence tick, threshold_minutes unused (next-day-in-shift
--                semantics live in the engine)
--   'task_due' — gia_followup task due-time rules; trigger_value is the task
--                category; threshold_minutes is CLOCK minutes after due_at
--                (0 = at due time, 30 = overdue escalation)
--
-- hours_mode:
--   'agent_shift' — deadline math uses the agent's shift override when set,
--                   falling back to global BUSINESS_HOURS (the A-rule behaviour)
--   'business'    — global BUSINESS_HOURS always (the B-rule behaviour)
--   'clock'       — plain wall-clock minutes, no business-hours snapping
--
-- channels gates notification delivery ('in_app', 'whatsapp'). Rules whose fire
-- creates a task instead of a notification (the CAD family) carry '{}'.
--
-- Seed values for SLA-01A..04B are copied verbatim from src/lib/constants/sla.ts
-- (SLA_RULES) so behaviour is provably identical before and after the engine
-- reads from the DB. One deliberate translation: the constants' statusTrigger
-- 'active' is stored here as the real lead status 'nurturing' (the constant
-- version mapped active→nurturing at fire time; the DB stores the truth).

CREATE TABLE sla_policies (
  code              text        PRIMARY KEY,
  trigger_kind      text        NOT NULL CHECK (trigger_kind IN ('status', 'outcome', 'task_due')),
  trigger_value     text        NOT NULL,
  threshold_minutes integer     NOT NULL DEFAULT 0 CHECK (threshold_minutes >= 0),
  recipient_role    text        NOT NULL CHECK (recipient_role IN ('agent', 'manager', 'founder')),
  auto_task         boolean     NOT NULL DEFAULT false,
  channels          text[]      NOT NULL DEFAULT '{}',
  hours_mode        text        NOT NULL CHECK (hours_mode IN ('agent_shift', 'business', 'clock')),
  active            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sla_policies_updated_at
  BEFORE UPDATE ON sla_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Engine reads/writes are service-role only (Trigger.dev context — no session).
-- Admin/founder SELECT for the Phase 3 settings UI. No write policies: edits go
-- through a future admin-gated server action on the admin client.

ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla_policies_admin_founder_select"
  ON sla_policies
  FOR SELECT
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO sla_policies
  (code, trigger_kind, trigger_value, threshold_minutes, recipient_role, auto_task, channels, hours_mode, active)
VALUES
  -- The eight live rules (parity with SLA_RULES in src/lib/constants/sla.ts)
  ('SLA-01A', 'status', 'new',           15,   'agent',   true,  '{in_app,whatsapp}', 'agent_shift', true),
  ('SLA-01B', 'status', 'new',           30,   'manager', false, '{in_app,whatsapp}', 'business',    true),
  ('SLA-02A', 'status', 'touched',       1440, 'agent',   true,  '{in_app,whatsapp}', 'agent_shift', true),
  ('SLA-02B', 'status', 'touched',       2160, 'manager', false, '{in_app,whatsapp}', 'business',    true),
  ('SLA-03A', 'status', 'in_discussion', 1440, 'agent',   true,  '{in_app,whatsapp}', 'agent_shift', true),
  ('SLA-03B', 'status', 'in_discussion', 2160, 'manager', false, '{in_app,whatsapp}', 'business',    true),
  ('SLA-04A', 'status', 'nurturing',     5760, 'agent',   true,  '{in_app,whatsapp}', 'agent_shift', true),
  ('SLA-04B', 'status', 'nurturing',     5760, 'manager', false, '{in_app,whatsapp}', 'business',    true),
  -- New founder escalation on untouched new leads
  ('SLA-01C', 'status', 'new',           45,   'founder', false, '{in_app,whatsapp}', 'business',    true),
  -- Outcome cadence family — daily next-day-in-shift follow-up task while the
  -- latest outcome stays unreached (vocabulary from constants/call-outcomes.ts)
  ('CAD-01A', 'outcome', 'rnr',          0, 'agent', true, '{}', 'agent_shift', true),
  ('CAD-01B', 'outcome', 'switched_off', 0, 'agent', true, '{}', 'agent_shift', true),
  ('CAD-01C', 'outcome', 'wrong_number', 0, 'agent', true, '{}', 'agent_shift', true),
  -- gia_followup task due-time rules (clock minutes after due_at)
  ('TASK-01A', 'task_due', 'gia_followup', 0,  'agent',   false, '{in_app,whatsapp}', 'clock', true),
  ('TASK-01B', 'task_due', 'gia_followup', 30, 'manager', false, '{in_app,whatsapp}', 'clock', true);
