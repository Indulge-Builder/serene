-- Migration 0072 — Create public.deals table
-- Reverses the 2026-05-31 "no deals table" decision.
-- Reason: one lead has one terminal 'won'; cannot hold repeat/renewal deals or walk-in sales.
-- Decision log entry: docs/master.md + The_Rules.md (2026-06-05).

CREATE TABLE public.deals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id     uuid NULL,              -- FK deferred to the clients migration; column only for now
  contact_name  text NOT NULL,
  contact_phone text NOT NULL,          -- E.164, normalised before insert (S-03)
  contact_email text NULL,
  domain        app_domain NOT NULL,
  deal_amount   numeric(12,2) NOT NULL CHECK (deal_amount > 0 AND deal_amount <= 100000000),
  deal_type     text NOT NULL CHECK (deal_type IN ('membership','retail')),
  deal_duration text NULL CHECK (deal_duration IS NULL OR deal_duration IN ('3_months','6_months','1_year')),
  assigned_to   uuid NULL REFERENCES public.profiles(id),
  won_at        timestamptz NOT NULL DEFAULT now(),  -- immutable after insert
  archived_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deals_membership_duration_check
    CHECK (deal_type <> 'membership' OR deal_duration IS NOT NULL)
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX deals_domain_idx        ON public.deals (domain)        WHERE archived_at IS NULL;
CREATE INDEX deals_assigned_to_idx   ON public.deals (assigned_to)   WHERE archived_at IS NULL;
CREATE INDEX deals_won_at_idx        ON public.deals (won_at DESC)   WHERE archived_at IS NULL;
CREATE INDEX deals_lead_id_idx       ON public.deals (lead_id);
CREATE INDEX deals_contact_phone_idx ON public.deals (contact_phone); -- future client backfill key

-- ── RLS Policies — two-layer security (A-09) ─────────────────────────────────
-- Layer 1: DB-level (here). Layer 2: action-layer access checks.
-- Writes go through Server Actions using the admin client (A-02) — no INSERT/UPDATE/DELETE
-- policies for regular users. Soft-delete only (D-02) — no hard-delete policy.

CREATE POLICY deals_agent_select ON public.deals
  FOR SELECT USING (
    get_user_role() = 'agent'
    AND assigned_to = auth.uid()
  );

CREATE POLICY deals_manager_select ON public.deals
  FOR SELECT USING (
    get_user_role() = 'manager'
    AND domain = get_user_domain()
  );

CREATE POLICY deals_admin_select ON public.deals
  FOR SELECT USING (
    get_user_role() IN ('admin', 'founder')
  );
