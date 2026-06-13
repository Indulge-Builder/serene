-- Migration 0118 — Elaya Phase 2: agentic-write lifecycle on elaya_actions.
--
-- No columns, no CHECK, no RLS changes. The 0116 schema already carries the full
-- status vocabulary (proposed/approved/dismissed/executed/failed) and the
-- resolved_at/resolved_by columns. This migration adds exactly two things:
--   1. a partial index serving the affirmation resolver's per-turn hot query;
--   2. a COMMENT ON TABLE recording the Phase 2 lifecycle + write posture
--      (the 0116 inline note "EMPTY until Phase 2" is now stale).
--
-- A-11 NOTE (for the record): elaya_actions is a STATE-MACHINE table that doubles
-- as an audit trail (cf. leads/tasks), NOT a pure append-only log (cf. elaya_messages,
-- lead_activities, task_audit_log — none of which have status/resolved_at/resolved_by).
-- The proposed -> executed/failed flip is a resolve-once UPDATE via the service-role
-- admin client (RLS-bypassing, same mechanism as the whatsapp_messages delivery-receipt
-- and task_remarks suppression updates). payload/action_type/created_at are write-once;
-- only the resolution fields move, and only forward. A-11 governs UPDATE/DELETE RLS
-- *policies* on LOG tables — this migration adds none, and there must NEVER be a user
-- INSERT/UPDATE/DELETE policy on elaya_actions. Do not "fix" the resolve path into a
-- second insert.

-- Affirmation resolver hot path (runs every user turn, before the brain):
--   WHERE conversation_id = $1 AND status = 'proposed' ORDER BY created_at DESC LIMIT 1
-- Partial on status='proposed' so the index holds only live rows (~0–1 per
-- conversation); the common "no pending confirmation" case is an empty-range probe,
-- not a scan of the user's resolved history. Mirrors the 0116 partial indexes
-- (idx_elaya_conversations_user_recent WHERE archived_at IS NULL;
--  idx_elaya_messages_sender_day WHERE role = 'user').
CREATE INDEX idx_elaya_actions_pending
  ON elaya_actions (conversation_id, created_at DESC)
  WHERE status = 'proposed';

COMMENT ON TABLE elaya_actions IS
  'Elaya agentic-write ledger (Phase 2). State-machine row + audit trail, NOT a pure '
  'append-only log. Lifecycle: state-changing writes (lead status, reassignment) land '
  'as status=proposed and resolve to executed or failed after the user confirms; '
  'low-risk writes (notes, tasks) are inserted directly as executed. '
  'payload/action_type/created_at are write-once; resolution sets status + resolved_at '
  '+ resolved_by once, forward-only. ALL writes (insert and the resolve UPDATE) go '
  'through the service-role admin client and bypass RLS — there is no user INSERT/UPDATE/'
  'DELETE policy and there must never be one (the authed chat route + the code-side '
  'confirmation protocol are the trust boundary). Same service-role-UPDATE posture as '
  'whatsapp_messages (delivery receipts) and task_remarks (suppression). A-11 governs '
  'append-only LOG tables (elaya_messages, lead_activities, task_audit_log); it does not '
  'forbid this resolve UPDATE. See migration 0118.';
