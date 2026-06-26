-- Migration 0151: customer welcome-blast plumbing (FEATURE 2, Blocks 3–4).
--
-- (1) leads.welcomed_at — the one-blast-per-lead idempotency stamp. NULL = the
--     customer welcome has never fired for this lead; a non-null timestamp = it has.
--     The send path stamps it under a guard (UPDATE … WHERE welcomed_at IS NULL
--     RETURNING — only the call that wins the stamp sends), the exactly-once
--     markTaskOverdueOnce / overdue_at pattern. Combined with the wa_message_id
--     dedup, a redelivered first message can never double-blast.
--
-- (2) whatsapp_notification_logs.type — two new outbound log types for the customer
--     channel: 'customer_welcome' (the approved Gupshup welcome TEMPLATE — the first
--     cold-number touch) and 'customer_reply' (a free-form session message Elaya sends
--     a customer inside the 24h window — the blast material + conversational replies).
--     Mirrors the elaya_reply (0117) addition. DROP + re-ADD re-listing all 10 existing
--     values + the 2 new ones (a CHECK can't be ALTERed in place).

-- ── 1. leads.welcomed_at ──
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;

COMMENT ON COLUMN leads.welcomed_at IS
  'Customer welcome-blast idempotency stamp (migration 0151). NULL = never welcomed; '
  'set once by the customer-Elaya send path under an UPDATE … WHERE welcomed_at IS NULL '
  'guard so the blast fires exactly once per lead. Layer over leads — NOT a lifecycle column.';

-- ── 2. whatsapp_notification_logs.type CHECK widen ──
ALTER TABLE whatsapp_notification_logs
  DROP CONSTRAINT IF EXISTS whatsapp_notification_logs_type_check;

ALTER TABLE whatsapp_notification_logs
  ADD CONSTRAINT whatsapp_notification_logs_type_check
  CHECK (type = ANY (ARRAY[
    'agent_assignment'::text,
    'founder_alert'::text,
    'sla_breach'::text,
    'lead_initiation'::text,
    'task_due_reminder'::text,
    'task_overdue_manager'::text,
    'task_due_soon'::text,
    'task_overdue_agent'::text,
    'task_overdue_manager_generic'::text,
    'elaya_reply'::text,
    'customer_welcome'::text,
    'customer_reply'::text
  ]));
