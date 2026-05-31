-- Migration 0056: fix get_gia_tasks when 0055 ran before 0045 (leads.slug missing).
-- Symptom: PostgreSQL 42703 "column l.slug does not exist" on /tasks?tab=gia.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_slug ON leads(slug) WHERE slug IS NOT NULL;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_lead_slug'
  ) THEN
    UPDATE leads
    SET slug = generate_lead_slug(first_name, last_name, phone)
    WHERE slug IS NULL
      AND phone IS NOT NULL;
  END IF;
END;
$do$;

CREATE OR REPLACE FUNCTION get_gia_tasks(
  p_user_id  uuid,
  p_role     text,
  p_domain   app_domain
)
RETURNS TABLE (
  id            uuid,
  assigned_to   uuid,
  created_by    uuid,
  module        text,
  task_type     text,
  title         text,
  description   text,
  status        text,
  priority      text,
  task_category text,
  group_id      uuid,
  due_at        timestamptz,
  completed_at  timestamptz,
  attachments   jsonb,
  tags          text[],
  created_at    timestamptz,
  updated_at    timestamptz,
  lead_id       uuid,
  lead_first_name text,
  lead_last_name  text,
  lead_phone      text,
  lead_slug       text,
  lead_domain     app_domain
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.assigned_to,
    t.created_by,
    t.module,
    t.task_type,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.task_category,
    t.group_id,
    t.due_at,
    t.completed_at,
    t.attachments,
    t.tags,
    t.created_at,
    t.updated_at,
    m.lead_id,
    l.first_name  AS lead_first_name,
    l.last_name   AS lead_last_name,
    l.phone       AS lead_phone,
    l.slug        AS lead_slug,
    l.domain      AS lead_domain
  FROM tasks t
  INNER JOIN task_gia_meta m ON m.task_id = t.id
  INNER JOIN leads          l ON l.id     = m.lead_id
  WHERE
    t.task_category = 'gia_followup'
    AND (
      CASE
        WHEN p_role = 'agent'
          THEN t.assigned_to = p_user_id
        ELSE
          l.domain = p_domain
      END
    )
  ORDER BY
    CASE
      WHEN t.status IN ('to_do', 'in_progress', 'in_review') THEN 0
      ELSE 1
    END ASC,
    t.due_at ASC NULLS LAST,
    t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_gia_tasks(uuid, text, app_domain) TO authenticated;
