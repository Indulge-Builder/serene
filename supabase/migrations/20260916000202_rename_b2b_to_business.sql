-- 0202 — Rename the app_domain value 'b2b' to 'business'.
--
-- Why: the founder renamed the domains to one word each (Concierge, Onboarding, Finance,
-- Marketing, Tech, Shop, Business, House, Legacy — 2026-09-16). Eight keys already matched
-- their label; 'b2b' was the one internal key that did not. The label alone changed that
-- morning; this makes the key match so code, SQL and screen say the same word.
--
-- What:
--   1. RENAME VALUE on the enum — every column typed app_domain (13 tables: profiles, leads,
--      deals, task_groups, task_events, activity_events, conversation_hooks, service_cases,
--      domain_targets, elaya_training_assets, usage_daily, usage_heartbeats,
--      whatsapp_notification_logs) reads the new spelling at once. Rows are NOT rewritten —
--      the type's label changes — so the append-only tables (task_events, activity_events)
--      stay untouched (Rule 08). Live footprint at write time: 1 profile, 1 task_event,
--      1 activity_event; zero everywhere else.
--   2. subscriptions.departments is a text[] with a CHECK that spells the nine keys out
--      (0163) — drop and re-add with the new word. Zero rows carried 'b2b'.
--
-- No SQL function, policy or RPC contains the literal 'b2b' (0041 was a one-time backfill;
-- past migrations are never edited). RENAME VALUE runs inside a transaction (unlike ADD VALUE).
-- Idempotent: skipped when the old label is already gone.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_domain' AND e.enumlabel = 'b2b'
  ) THEN
    ALTER TYPE public.app_domain RENAME VALUE 'b2b' TO 'business';
  END IF;
END
$$;

-- The subscriptions departments vocabulary — the SQL mirror of APP_DOMAINS.
UPDATE public.subscriptions
SET departments = array_replace(departments, 'b2b', 'business')
WHERE 'b2b' = ANY (departments);

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_departments_valid;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_departments_valid
  CHECK (departments <@ ARRAY[
    'concierge','onboarding','finance','marketing','tech','shop','business','house','legacy'
  ]::text[]);
