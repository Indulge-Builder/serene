-- Migration 0119: Lead Revival (Phase R1)
--
-- Recover dormant-but-warm leads that silently died. Silence detection (the daily
-- Trigger.dev sweep, src/trigger/lead-revival.ts) finds leads past a per-status
-- silence threshold; a cheap LLM suppression gate (the Elaya 'routing'/Haiku
-- provider) reads recent notes and returns revive / unsure. Confident revivals
-- become normal assigned tasks (via createLeadTaskCore — the E2 path) badged
-- "Revived"; everything else lands in the review tab.
--
-- THIS IS A LAYER OVER leads. Revival NEVER mutates the lead's own status or
-- columns. The only lead-facing write is a follow-up TASK (through the existing
-- create_lead_gia_task RPC); the candidate ledger lives entirely in the two
-- tables below.
--
-- Two tables:
--   revival_candidates — the per-lead candidate ledger (open → actioned/dismissed)
--   revival_policies   — config: per-status silence thresholds + daily cap (editable)

-- ─────────────────────────────────────────────────────────────────────────────
-- revival_policies — config table (the sla_policies pattern, migration 0111)
--
-- One row per silenceable lead status. The sweep reads this table per run via the
-- admin client — never cached at module scope — so a threshold edit applies on the
-- next sweep without a deploy. Admin/founder edit it from /settings.
--
-- COLD is deliberately OUT OF SCOPE as a trigger — only touched / in_discussion /
-- nurturing rows exist. daily_cap_per_agent throttles AUTO-revive tasks per agent
-- per IST day; confident revivals over the cap fall to the review tab (status
-- 'open'), never dropped.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE revival_policies (
  trigger_status       text        PRIMARY KEY
                       CHECK (trigger_status IN ('touched', 'in_discussion', 'nurturing')),
  silence_days         integer     NOT NULL CHECK (silence_days >= 0),
  daily_cap_per_agent  integer     NOT NULL DEFAULT 25 CHECK (daily_cap_per_agent >= 0),
  active               boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER revival_policies_updated_at
  BEFORE UPDATE ON revival_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE revival_policies ENABLE ROW LEVEL SECURITY;

-- Admin/founder SELECT for the settings UI; writes service-role only (edits go
-- through the admin-gated updateRevivalPolicyAction on the admin client).
-- InitPlan-hoisted (SELECT get_user_role()) per the 0088 convention.
CREATE POLICY "revival_policies_admin_founder_select"
  ON revival_policies
  FOR SELECT
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

INSERT INTO revival_policies (trigger_status, silence_days, daily_cap_per_agent, active)
VALUES
  ('touched',       60, 25, true),
  ('in_discussion', 60, 25, true),
  ('nurturing',     90, 25, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- revival_candidates — the candidate ledger (append-only-ish state machine)
--
-- A-11 NOTE (the elaya_actions precedent, migration 0118): this is a STATE-MACHINE
-- table that doubles as an audit trail, NOT a pure append-only log. The
-- open → actioned/dismissed flip is a resolve-once UPDATE via the service-role
-- admin client (RLS-bypassing, same mechanism as whatsapp_messages delivery
-- receipts / task_remarks suppression / elaya_actions resolution).
-- verdict / ai_reasoning / lead_id / trigger_status / created_at are write-once;
-- only the resolution fields (status, resolved_at, resolved_by) move, and only
-- forward. A-11 governs UPDATE/DELETE RLS *policies* on LOG tables — this migration
-- adds NONE, and there must NEVER be a user INSERT/UPDATE/DELETE policy here.
-- Column restriction (only status/resolved_at/resolved_by change) is enforced at
-- the application layer (revival-service markCandidate*), not in SQL.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE revival_candidates (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  -- The lead's assignee at candidate-creation time, denormalised so the daily-cap
  -- count is a native column filter — NOT a PostgREST embed filter (which is
  -- silently dropped on a head:true/count query, the getNextLeadTask caveat).
  assigned_to          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  verdict              text        NOT NULL CHECK (verdict IN ('revive', 'unsure')),
  ai_reasoning         text        NOT NULL,
  status               text        NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'actioned', 'dismissed')),
  -- The lead status that tripped silence (touched / in_discussion / nurturing).
  trigger_status       text        NOT NULL,
  -- The gate's suggested revive timing (nullable — the gate may decline to suggest).
  suggested_revive_at  timestamptz,
  -- Set on the open → actioned/dismissed flip. resolved_by NULL = system (sweep
  -- auto-revive); a profile id = the human who actioned/dismissed from the review tab.
  resolved_at          timestamptz,
  resolved_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- One-open-candidate-per-lead guard (STRUCTURAL): a lead can never hold two open
-- candidates at once. The sweep's anti-join is the first line; this partial UNIQUE
-- index is the DB backstop against a concurrent double-insert.
CREATE UNIQUE INDEX idx_revival_candidates_one_open
  ON revival_candidates (lead_id)
  WHERE status = 'open';

-- Serves the review predicate (resolve open candidate lead_ids → .in('id', ids))
-- and the daily-cap count (actioned rows since IST midnight).
CREATE INDEX idx_revival_candidates_open
  ON revival_candidates (created_at DESC)
  WHERE status = 'open';

CREATE INDEX idx_revival_candidates_lead
  ON revival_candidates (lead_id, created_at DESC);

-- Serves the daily-cap count: actioned auto-revives per agent since IST midnight.
CREATE INDEX idx_revival_candidates_agent_actioned
  ON revival_candidates (assigned_to, resolved_at DESC)
  WHERE status = 'actioned' AND resolved_by IS NULL;

ALTER TABLE revival_candidates ENABLE ROW LEVEL SECURITY;

-- SELECT scoped by role/domain LIKE leads — the EXISTS pattern from lead_activities
-- / lead_notes (migration 0003), InitPlan-hoisted per 0088. Agent → own assigned
-- leads; manager → own domain; admin/founder → all. No INSERT/UPDATE/DELETE policy
-- (all writes are service-role admin-client only, per the A-11 note above).
CREATE POLICY "revival_candidates_select"
  ON revival_candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = revival_candidates.lead_id
        AND (
          ((SELECT get_user_role()) = 'agent' AND l.assigned_to = (SELECT auth.uid()))
          OR ((SELECT get_user_role()) = 'manager' AND l.domain = (SELECT get_user_domain()))
          OR (SELECT get_user_role()) IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );

COMMENT ON TABLE revival_candidates IS
  'Lead-revival candidate ledger (migration 0119). State machine open → actioned/dismissed; '
  'a layer over leads that NEVER mutates the lead row. Service-role writes only — the '
  'resolve-once status UPDATE is an A-11 carve-out (cf. elaya_actions, migration 0118). '
  'One open candidate per lead enforced by idx_revival_candidates_one_open.';
