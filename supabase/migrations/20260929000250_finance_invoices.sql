-- 0250 — Finance, step 1: the reimbursement invoice made from Serene (2026-09-29)
--
-- docs/architecture/finance-plan.md. A genie pays for a member's request, writes the template
-- note on the Freshdesk ticket and moves it to Invoice Due. A finance person opens the ticket
-- in Serene, checks the invoice Serene prepared from that note, and confirms. Serene then
-- creates the invoice in Zoho Books and writes the note, the invoice number, billable = Yes
-- and the tag "Invoice Done" back to the Freshdesk ticket, under that finance person's own
-- Freshdesk name. The ticket's STATUS is never changed from here: a genie resolves.
--
-- Three tables:
--   finance_invoices       one row per invoice Serene made (or tried to make) for a ticket
--   finance_invoice_log    append-only: every call to Zoho or Freshdesk, who clicked, what came back
--   staff_freshdesk_keys   each finance person's own Freshdesk API key, encrypted (vault-crypto)
--
-- One live invoice per ticket: the partial unique index below. A failed attempt may be retried
-- (its row resumes from the step it reached); a voided one frees the ticket.

CREATE TABLE public.finance_invoices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         bigint      NOT NULL,                                   -- freshdesk.tickets.id
  member_id         uuid        NOT NULL,                                   -- member.members.id (the invoice is on this member)
  zoho_customer_id  text        NOT NULL,
  status            text        NOT NULL DEFAULT 'creating'
                    CHECK (status IN ('creating', 'invoiced', 'failed', 'void')),
  -- what the finance person confirmed: { date, items: [{ description, amount, vendor, mode, note_id }], apply_credit }
  draft             jsonb       NOT NULL,
  total             numeric(14,2) NOT NULL CHECK (total > 0),
  zoho_invoice_id   text,
  invoice_number    text,
  credit_applied    numeric(14,2) NOT NULL DEFAULT 0,
  balance           numeric(14,2),
  -- which steps have landed, so a retry resumes and never repeats:
  -- { zoho_created, zoho_sent, credits_applied, fd_note, fd_fields }
  steps             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fd_note_id        bigint,
  error             text,
  created_by        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_by_name   text        NOT NULL,
  genie_nudged_at   timestamptz,                                            -- the 24 hour reminder
  escalated_at      timestamptz,                                            -- the 48 hour word to the bishop and queen
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.finance_invoices IS
  'Every reimbursement invoice Serene made for a Freshdesk ticket (0250). Written only by finance-mutations.ts. steps records what landed so a retry resumes; never deleted.';
CREATE UNIQUE INDEX uq_finance_invoices_live_ticket ON public.finance_invoices (ticket_id) WHERE status IN ('creating', 'invoiced');
CREATE INDEX idx_finance_invoices_ticket ON public.finance_invoices (ticket_id, created_at DESC);
CREATE INDEX idx_finance_invoices_open_nudge ON public.finance_invoices (created_at) WHERE status = 'invoiced' AND escalated_at IS NULL;
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_invoices_select" ON public.finance_invoices FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder') OR public.get_user_domain() = 'finance');
GRANT SELECT ON public.finance_invoices TO authenticated;
GRANT ALL ON public.finance_invoices TO service_role;

CREATE TABLE public.finance_invoice_log (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id  uuid        REFERENCES public.finance_invoices(id) ON DELETE RESTRICT,
  ticket_id   bigint      NOT NULL,
  actor_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  system      text        NOT NULL CHECK (system IN ('zoho', 'freshdesk', 'serene')),
  step        text        NOT NULL,
  ok          boolean     NOT NULL,
  http_status integer,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,                     -- ids returned, the error text; never a key
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.finance_invoice_log IS
  'Append-only trail of every call Serene made to Zoho Books or Freshdesk for an invoice (0250). No UPDATE, no DELETE.';
CREATE INDEX idx_finance_invoice_log_invoice ON public.finance_invoice_log (invoice_id, created_at);
ALTER TABLE public.finance_invoice_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_invoice_log_select" ON public.finance_invoice_log FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder') OR public.get_user_domain() = 'finance');
GRANT SELECT ON public.finance_invoice_log TO authenticated;
GRANT ALL ON public.finance_invoice_log TO service_role;

-- A person's own Freshdesk API key. No policy for signed-in users: the secret is read only by
-- the service role, inside the write core, and never returned to a browser or a model.
CREATE TABLE public.staff_freshdesk_keys (
  profile_id     uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext     text        NOT NULL,
  nonce          text        NOT NULL,
  key_version    integer     NOT NULL,
  fd_agent_id    bigint      NOT NULL,                                      -- who Freshdesk says this key is
  fd_agent_name  text        NOT NULL,
  last_four      text        NOT NULL,
  verified_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.staff_freshdesk_keys IS
  'Each finance person''s own Freshdesk API key, AES-256-GCM encrypted with the profile id as authenticated data (0250). Service role only; a write to Freshdesk made with it shows in Freshdesk under that person''s name.';
ALTER TABLE public.staff_freshdesk_keys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.staff_freshdesk_keys TO service_role;

-- The switch. Every invoice is confirmed by a person, so the door ships open; false stops every
-- write to Zoho and Freshdesk from this module at once.
INSERT INTO public.elaya_settings (key, value) VALUES ('finance_invoicing_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
