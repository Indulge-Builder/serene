-- Migration 0185: public.vendor_notes — many timestamped notes per vendor.
--
-- The vendor spine (0182) carries a single `notes` text column, which can hold
-- one anonymous blob. What the floor actually needs is the `lead_notes` shape:
-- several notes per vendor, each keeping WHO wrote it and WHEN, newest first
-- ("Prefers WhatsApp over email — Ria, 1 Sep"). That is this table.
--
-- `vendors.notes` is NOT dropped: it is where the Freshdesk import's free-text
-- lands, and dropping a column that already holds imported prose to replace it
-- with an empty table would lose data. The vendor page reads this table; the
-- spine column stays as import provenance beside `import_raw`.
--
-- APPEND-ONLY (Rule 08 / A-11): no UPDATE, no DELETE policy, ever. A correction
-- is a new note, the same contract `lead_notes` and `vendor_reviews` carry.
--
-- NOT APPLIED. Runs through the normal deployment process, never directly
-- against production.

CREATE TABLE public.vendor_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE (not RESTRICT like the ledger): a note is commentary, not history.
  -- If a vendor row is ever removed, its notes go with it.
  vendor_id  uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  -- RESTRICT: a note must always be able to say who wrote it. Deactivate a
  -- profile, never delete one that has authored anything.
  author_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content    text        NOT NULL CHECK (char_length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The vendor page's read: newest first for one vendor.
CREATE INDEX idx_vendor_notes_vendor ON public.vendor_notes (vendor_id, created_at DESC);

COMMENT ON TABLE public.vendor_notes IS
  'Free-text notes on a vendor, one row per note, with author and timestamp (the lead_notes shape). '
  'APPEND-ONLY (A-11): no UPDATE or DELETE policy, ever — a correction is a new note. '
  'Reads admin/founder; writes service-role only (addVendorNoteCore is the one write path). '
  'Distinct from vendors.notes, which holds the import free-text.';

-- RLS mirrors the rest of the vendor module (0182/0184): admin/founder SELECT,
-- no user write policy — every insert is service-role via actions/vendors.ts
-- behind requireProfile(). InitPlan-hoisted `(SELECT get_user_role())` per 0088.
ALTER TABLE public.vendor_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_notes_select_admin ON public.vendor_notes
  FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));
