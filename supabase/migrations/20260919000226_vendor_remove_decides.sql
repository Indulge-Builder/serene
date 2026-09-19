-- 0226 — Remove deletes a junk row for real, and only hides one that carries history.
--
-- WHY
-- 0223 gave Remove one behaviour: set deleted_at, always. That is right for a vendor
-- with jobs on it -- those rows record money that actually moved, and someone having
-- filed them under the wrong name does not make them untrue -- but it is heavy-handed
-- for what the extractor mostly produces by mistake: a row called
-- "Client name- AKSHAT SHAH" with nothing attached at all. Hiding that forever leaves
-- a permanent shadow of a thing that was never a supplier. Founder, 2026-09-19: delete
-- it properly when deleting it costs nothing.
--
-- THE RULE, and it is decided HERE rather than in the browser
-- No engagements, no reviews, no notes -> the row is genuinely deleted.
-- Anything at all -> deleted_at, exactly as before, and every fact is kept.
--
-- Capabilities and agent preferences do NOT count as history. A capability is config
-- the extractor writes on sight, and a preference is one teammate's sticky note; both
-- CASCADE on delete and neither is a record of work done. Engagements, reviews and
-- notes are, and the FKs already say so.
--
-- The page shows which of the two is about to happen before anyone presses the button,
-- but the page is not trusted: the count is taken again inside this transaction, so a
-- job written between the page loading and the click cannot cause a delete.

-- Every removal, of either kind. A hard delete is the one thing in this module that
-- leaves nothing behind, so it leaves this: the whole row as it was, and who did it.
CREATE TABLE IF NOT EXISTS public.vendor_removals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No FK: on a hard delete the vendor is gone, which is the point.
  vendor_id     uuid        NOT NULL,
  vendor_name   text        NOT NULL,
  -- 'deleted' = the row is gone. 'hidden' = deleted_at set, everything kept.
  mode          text        NOT NULL CHECK (mode IN ('deleted', 'hidden')),
  -- The spine row as it stood. For a hidden vendor this is a convenience; for a
  -- deleted one it is the only copy there will ever be.
  vendor_row    jsonb       NOT NULL,
  -- What was attached at the moment of the decision, which is what made it.
  history       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  removed_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_removals_vendor ON public.vendor_removals (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_removals_at ON public.vendor_removals (created_at DESC);

COMMENT ON TABLE public.vendor_removals IS
  'One row per vendor removal (0226). Append-only: no UPDATE or DELETE, no user write policy. '
  'mode `deleted` means the spine row was genuinely removed because nothing was attached to it, and '
  'vendor_row is then the only surviving copy; `hidden` means deleted_at was set and everything was kept.';

ALTER TABLE public.vendor_removals ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_removals_select ON public.vendor_removals
  FOR SELECT TO authenticated
  USING ((SELECT public.can_access_vendors()));

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_vendor(
  p_vendor uuid,
  p_actor  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor  public.vendors%ROWTYPE;
  n_jobs    int;
  n_reviews int;
  n_notes   int;
  v_history jsonb;
  v_mode    text;
BEGIN
  IF p_vendor IS NULL THEN
    RAISE EXCEPTION 'remove_vendor: an id is required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor FOR UPDATE;
  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'remove_vendor: that vendor does not exist' USING ERRCODE = 'P0002';
  END IF;
  IF v_vendor.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'remove_vendor: that vendor is already removed' USING ERRCODE = '22023';
  END IF;

  -- Counted inside the transaction, under the row lock. The page shows the same
  -- numbers, but a job written a second ago must still win over what the page believed.
  SELECT count(*) INTO n_jobs    FROM public.vendor_engagements WHERE vendor_id = p_vendor;
  SELECT count(*) INTO n_reviews FROM public.vendor_reviews     WHERE vendor_id = p_vendor;
  SELECT count(*) INTO n_notes   FROM public.vendor_notes       WHERE vendor_id = p_vendor;

  v_history := jsonb_build_object('jobs', n_jobs, 'reviews', n_reviews, 'notes', n_notes);
  v_mode := CASE WHEN n_jobs = 0 AND n_reviews = 0 AND n_notes = 0 THEN 'deleted' ELSE 'hidden' END;

  -- Written BEFORE either branch, so the record exists even if the delete trips a
  -- reference this function does not know about — which would itself be the alarm.
  INSERT INTO public.vendor_removals (vendor_id, vendor_name, mode, vendor_row, history, removed_by)
  VALUES (p_vendor, v_vendor.name, v_mode, to_jsonb(v_vendor), v_history, p_actor);

  IF v_mode = 'deleted' THEN
    -- Capabilities and preferences CASCADE; sia.tickets and the WhatsApp links are
    -- ON DELETE SET NULL, so a ticket that named this vendor keeps its own history and
    -- simply stops pointing at a row that no longer exists.
    DELETE FROM public.vendors WHERE id = p_vendor;
  ELSE
    UPDATE public.vendors
       SET deleted_at = now(), deleted_by = p_actor
     WHERE id = p_vendor;
  END IF;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'vendor_id', p_vendor,
    'vendor_name', v_vendor.name,
    'history', v_history
  );
END;
$$;

COMMENT ON FUNCTION public.remove_vendor(uuid, uuid) IS
  'Remove a vendor: genuinely DELETE it when nothing is attached (no engagements, no reviews, no notes), '
  'otherwise set deleted_at and keep every fact (0226). Capabilities and preferences are config, not history, '
  'and do not stop a delete. The count is taken inside the transaction under a row lock, so the page''s view '
  'cannot cause one. Records public.vendor_removals either way — for a deleted vendor that row is the only '
  'surviving copy. Q-13 revoked tier: service_role only.';

REVOKE EXECUTE ON FUNCTION public.remove_vendor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_vendor(uuid, uuid) TO service_role;
