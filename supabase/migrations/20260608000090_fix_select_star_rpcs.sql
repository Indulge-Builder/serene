-- Migration 0090 — get_active_lead_by_phone: explicit column projection (no SELECT *)
--
-- get_personal_tasks is unchanged: RETURNS SETOF tasks requires the full row type;
-- SELECT * is the correct projection for that return contract.

DROP FUNCTION IF EXISTS public.get_active_lead_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_active_lead_by_phone(p_phone text)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  phone text,
  status text,
  assigned_to uuid,
  domain public.app_domain,
  slug text,
  archived_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.first_name,
    l.last_name,
    l.phone,
    l.status,
    l.assigned_to,
    l.domain,
    l.slug,
    l.archived_at
  FROM leads l
  WHERE l.phone       = p_phone
    AND l.archived_at IS NULL
    AND l.status      IN ('new', 'touched', 'in_discussion', 'nurturing')
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_lead_by_phone(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_lead_by_phone(text) FROM authenticated;
-- service_role retains EXECUTE.
