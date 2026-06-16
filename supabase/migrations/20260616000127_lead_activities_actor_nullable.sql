-- Migration 0127: lead_activities.actor_id — restore NULLABLE (schema drift fix)
--
-- The original table definition (migration 0003) declares:
--   actor_id uuid REFERENCES profiles(id),   -- NULL = system/webhook action
-- i.e. actor_id is intentionally nullable: a system/webhook-originated activity
-- (lead_created, agent_assigned, duplicate_submission from the ingestion pipeline)
-- has no human actor.
--
-- The live database had drifted to actor_id NOT NULL (no DEFAULT) — no migration
-- in history added that constraint, so it was applied out-of-band. The drift was
-- invisible while database.ts carried a hand-loosened `actor_id?: string | null`,
-- but a fresh `supabase gen types` (2026-06-16) generated the accurate non-null
-- `actor_id: string`, surfacing it: src/lib/services/lead-ingestion.ts inserts
-- `actor_id: null` in five system/webhook activity paths, every one of which would
-- throw a NOT NULL violation at runtime. (No such row exists yet — those paths
-- have not fired against this DB.)
--
-- This re-aligns the live schema with migration 0003's documented intent and the
-- ingestion code. The FK and the "NULL = system action" semantics are unchanged.

ALTER TABLE public.lead_activities
  ALTER COLUMN actor_id DROP NOT NULL;

COMMENT ON COLUMN public.lead_activities.actor_id IS
  'Profile that performed the action. NULL = system/webhook-originated activity (lead_created, agent_assigned, duplicate_submission) — see lib/services/lead-ingestion.ts.';
