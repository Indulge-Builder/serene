-- ============================================================
-- Migration 0138 — Collapse gia_followup category; model module-links by meta table
-- ============================================================
-- GOAL
--   tasks.task_category carried three values: 'personal', 'group_subtask',
--   'gia_followup'. The first two describe STRUCTURE (standalone vs child-of-a-
--   group). The third described a LINK (task → lead) — which is already, and
--   redundantly, recorded by the existence of a task_gia_meta row. We collapse
--   the category to TWO structural values ('personal', 'group_subtask'). A lead
--   follow-up is now simply a 'personal' task that HAS a task_gia_meta row.
--   The module a task belongs to moves onto a corrected `module` column,
--   converted here from free text to a native enum task_module('gia','sia','core').
--
-- THE SINGLE-WRITER INVARIANT (load-bearing — read this before touching anything)
--   A task_gia_meta row exists IFF the task is a lead follow-up, for all time.
--   This holds because the link-creating RPC (create_lead_gia_task) is the ONLY
--   thing that writes a task_gia_meta row, and it ALWAYS writes one in the same
--   transaction as the task, AND it is the ONLY writer of module='gia'. A future
--   create_lead_sia_task will be the sole writer of module='sia'. Every other
--   insert path uses module='core' and writes NO meta row.
--   Because of this invariant, `EXISTS (task_gia_meta row)` / `tgm.lead_id IS NOT
--   NULL` is a PERMANENTLY correct substitute for the retired
--   `task_category = 'gia_followup'` check. The correctness of the rewritten
--   dashboard CTE below is NOT local to the query — it is BORROWED from the write
--   path. Every gia-detection site re-keyed in this migration carries an inline
--   note to that effect so a future engineer finds the answer in place.
--
-- Pre-mortem checklist:
--   1. §0 cleans up the 60 known prod orphans FIRST (delete terminal, cancel
--      active — see §0), then §1 HARD-FAILS on any remaining ACTIVE orphan. A
--      'gia_followup' task with no meta row would otherwise vanish post-collapse
--      (the lead-task readers INNER-join). Forensics (2026-06-20): the orphans
--      are lead-less 'Call'/'WhatsApp' tasks from a pre-0054 create window with
--      no recoverable lead link — NOT the SLA breach insert (which titles
--      differently). The SLA non-atomic insert is still closed in app code
--      alongside this migration to prevent future orphans.
--   2. Category backfill ('gia_followup' → 'personal') runs BEFORE the CHECK swap.
--   3. module is backfilled as TEXT (meta row → 'gia', else → 'core') BEFORE the
--      enum retype, so the USING cast always sees a valid label.
--   4. idx_tasks_module is dropped before the enum retype (a type change
--      invalidates it) and recreated after.
--   5. Tag indexes are GUARDED against lead tasks; the My Tasks reader is WIDENED
--      to include them (see section 6 — each choice documented inline).
--   6. NOT touched: sla_policies.trigger_value = 'gia_followup' is a DIFFERENT
--      column (the SLA "task due" rule catalog, migration 0111) — it is NOT
--      tasks.task_category and is deliberately left as-is.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. Pre-collapse orphan cleanup (one-time, data-driven).
--    A pre-flight against prod (2026-06-20) found 60 'gia_followup' tasks with
--    NO task_gia_meta row — all created 2026-05-31..06-03 (a pre-atomic-RPC
--    window: create_lead_gia_task shipped 0054 on 2026-05-31), titled
--    'Call'/'WhatsApp' (task_type call/whatsapp_message). Their lead link is
--    IRRECOVERABLE: tasks carries no lead_id, and zero lead_activities rows
--    reference these task ids. They are lead-less follow-ups.
--
--    Resolution (chosen 2026-06-20):
--      • TERMINAL orphans (completed/error/already-cancelled) → DELETE. Dead, no
--        lead, no value.
--      • ACTIVE orphans (to_do/in_progress/in_review) → status='cancelled'.
--        Preserve the row + its audit trail (the log_task_changes trigger fires);
--        cancelling keeps them off active surfaces without destroying history.
--    ORDER IS LOAD-BEARING: the DELETE (0a) runs FIRST on the originally-terminal
--    set, THEN the active rows are cancelled (0b). Doing it the other way would
--    let the DELETE's terminal predicate also sweep the just-cancelled active
--    rows — destroying the very rows we mean to preserve. With this order, the
--    cancelled-in-0b rows never see a DELETE, so the 25 active orphans survive as
--    cancelled (audited) and only the originally-terminal rows are removed.
--    This MUST run before the §1 orphan check (so it passes) and the §2 backfill.
--    Guarded to lead-less rows only (NOT EXISTS task_gia_meta) — a real lead task
--    is never touched. Idempotent: re-running finds zero orphans.
-- ─────────────────────────────────────────────────────────────

-- 0a. Delete the ORIGINALLY-terminal orphans (must precede 0b — see note above).
DELETE FROM tasks t
 WHERE t.task_category = 'gia_followup'
   AND t.status IN ('completed', 'cancelled', 'error')
   AND NOT EXISTS (SELECT 1 FROM task_gia_meta m WHERE m.task_id = t.id);

-- 0b. Cancel the active orphans (audit-preserving; these rows are KEPT).
UPDATE tasks t
   SET status = 'cancelled'
 WHERE t.task_category = 'gia_followup'
   AND t.status IN ('to_do', 'in_progress', 'in_review')
   AND NOT EXISTS (SELECT 1 FROM task_gia_meta m WHERE m.task_id = t.id);


-- ─────────────────────────────────────────────────────────────
-- 1. Orphan backstop — FAIL HARD if any ACTIVE gia_followup task lacks a meta
--    row. An ACTIVE lead-less task is the dangerous case: post-collapse it would
--    surface on My Tasks / the dashboard as a context-less follow-up (every
--    lead-task reader INNER-joins task_gia_meta, so it loses its lead entirely).
--    §0 just cancelled all known active prod orphans, so this finds ZERO here;
--    it remains as a backstop for any OTHER environment with active orphans §0
--    didn't cover — never migrate over a live lead-less follow-up.
--
--    Why ACTIVE-only (reconciling with §0b): §0b deliberately KEEPS the 25 active
--    orphans as *cancelled* rows (audit trail). Those cancelled rows are still
--    gia_followup-with-no-meta at this point, but they are benign — they collapse
--    to cancelled personal/core tasks and never appear on an active surface. A
--    status-blind check would abort on exactly the rows §0b means to preserve.
--    So the backstop gates on active status only; the cancelled remnants pass
--    through and are handled by the §2 backfill like any other personal task.
-- ─────────────────────────────────────────────────────────────
DO $orphan$
DECLARE
  v_orphans int;
BEGIN
  SELECT COUNT(*)
    INTO v_orphans
    FROM tasks t
    LEFT JOIN task_gia_meta m ON m.task_id = t.id
   WHERE t.task_category = 'gia_followup'
     AND t.status IN ('to_do', 'in_progress', 'in_review')
     AND m.task_id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Migration 0138 aborted: % ACTIVE gia_followup task(s) have no task_gia_meta row. Resolve before collapsing (see §0 cleanup / §4d, the SLA non-atomic insert hole).',
      v_orphans;
  END IF;
END;
$orphan$;


-- ─────────────────────────────────────────────────────────────
-- 2. Backfill category: every gia_followup task becomes a plain personal task.
--    Its lead link survives entirely in its task_gia_meta row.
-- ─────────────────────────────────────────────────────────────
UPDATE tasks SET task_category = 'personal' WHERE task_category = 'gia_followup';


-- ─────────────────────────────────────────────────────────────
-- 3. Re-constrain task_category to the two structural values.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_category_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_category_check
  CHECK (task_category IN ('personal', 'group_subtask'));


-- ─────────────────────────────────────────────────────────────
-- 4. module: free text → native enum task_module('gia','sia','core').
--    'gia'  — lead follow-up (sole writer: create_lead_gia_task)
--    'sia'  — ticket module (future; sole writer: create_lead_sia_task)
--    'core' — everything else (personal to-dos, group subtasks)
--    Backfill as TEXT first (meta row → 'gia', else → 'core') so the USING cast
--    below sees only valid labels. The OLD column was always the literal 'gia';
--    only meta-linked rows keep 'gia', the rest become 'core'.
-- ─────────────────────────────────────────────────────────────
CREATE TYPE task_module AS ENUM ('gia', 'sia', 'core');

-- Backfill while still text. EXISTS(task_gia_meta) is the meta-presence signal —
-- correct by the single-writer invariant (header).
UPDATE tasks t
   SET module = CASE
                  WHEN EXISTS (SELECT 1 FROM task_gia_meta m WHERE m.task_id = t.id)
                    THEN 'gia'
                  ELSE 'core'
                END;

-- idx_tasks_module references the column type — drop before the retype, recreate after.
DROP INDEX IF EXISTS idx_tasks_module;

ALTER TABLE tasks ALTER COLUMN module DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN module TYPE task_module USING module::task_module;
ALTER TABLE tasks ALTER COLUMN module SET DEFAULT 'core';

-- Recreate idx_tasks_module — same predicate as migration 0025 (active tasks only).
CREATE INDEX idx_tasks_module
  ON tasks(module, assigned_to)
  WHERE status NOT IN ('completed', 'cancelled', 'error');


-- ─────────────────────────────────────────────────────────────
-- 5. Repoint every live database object off the 'gia_followup' literal.
--    Detection switches to meta-presence (the single-writer invariant).
-- ─────────────────────────────────────────────────────────────

-- 5a. create_lead_gia_task — THE sole lead-task writer. Now inserts a 'personal'
--     task (structure) + module='gia' (link module) + the task_gia_meta row, all
--     atomic. Signature unchanged (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION create_lead_gia_task(
  p_lead_id      uuid,
  p_assigned_to  uuid,
  p_created_by   uuid,
  p_task_type    text,
  p_title        text,
  p_description  text    DEFAULT NULL,
  p_priority     text    DEFAULT 'normal',
  p_due_at       timestamptz DEFAULT NULL
)
RETURNS SETOF tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  -- 1. Insert the task row. task_category='personal' (structure); module='gia'
  --    (this RPC is the SOLE writer of module='gia' — see the single-writer
  --    invariant). The companion meta row below is what makes it a lead task.
  INSERT INTO tasks (
    assigned_to,
    created_by,
    module,
    task_type,
    title,
    description,
    priority,
    due_at,
    status,
    task_category
  )
  VALUES (
    p_assigned_to,
    p_created_by,
    'gia',
    p_task_type,
    p_title,
    p_description,
    p_priority,
    p_due_at,
    'to_do',
    'personal'
  )
  RETURNING id INTO v_task_id;

  -- 2. Insert the companion task_gia_meta row (same transaction). A tasks row
  --    without this row is, by the invariant, NOT a lead task.
  INSERT INTO task_gia_meta (task_id, lead_id)
  VALUES (v_task_id, p_lead_id);

  -- 3. Return the full tasks row so the action can wire up the Trigger.dev reminder
  RETURN QUERY SELECT * FROM tasks WHERE id = v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_lead_gia_task(uuid, uuid, uuid, text, text, text, text, timestamptz)
  TO authenticated;


-- 5b. update_lead_status — nurturing branch creates a lead follow-up task. Same
--     collapse: 'personal' + module='gia' + meta row. Body otherwise IDENTICAL to
--     migration 0060 (the live version) — only the nurturing task INSERT changes.
CREATE OR REPLACE FUNCTION update_lead_status(
  p_lead_id  uuid,
  p_actor_id uuid,
  p_status   text,
  p_reason   text        DEFAULT NULL,
  p_now      timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status  text;
  v_assigned_to uuid;
  v_domain      text;
  v_first_name  text;
  v_last_name   text;
  v_task_id     uuid;
  v_details     jsonb;
BEGIN
  -- 1. Fetch current lead state
  SELECT status, assigned_to, domain, first_name, last_name
    INTO v_old_status, v_assigned_to, v_domain, v_first_name, v_last_name
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- 2. Early return if status unchanged
  IF v_old_status = p_status THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  -- 3. Update lead: status, status_changed_at, last_activity_at
  UPDATE leads
     SET status            = p_status,
         status_changed_at = p_now,
         last_activity_at  = p_now
   WHERE id = p_lead_id;

  -- 4. Persist resolution_reason to column:
  --    - junk/lost with a reason → write the reason
  --    - in_discussion (revive from junk) → clear it
  --    - p_reason IS NULL and not a revive → no-op (column unchanged)
  IF p_reason IS NOT NULL THEN
    UPDATE leads SET resolution_reason = p_reason WHERE id = p_lead_id;
  ELSIF p_status = 'in_discussion' THEN
    UPDATE leads SET resolution_reason = NULL WHERE id = p_lead_id;
  END IF;

  -- 5. Build activity details (include reason if provided)
  v_details := jsonb_build_object('old_status', v_old_status, 'new_status', p_status);
  IF p_reason IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('reason', p_reason);
  END IF;

  -- 6. Log status_changed activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (p_lead_id, p_actor_id, 'status_changed', v_details);

  -- 7. Nurturing: auto-create a lead follow-up task + task_gia_meta (3 months out).
  --    Post-collapse this is a 'personal' task (structure) + module='gia' (link
  --    module) + the meta row that makes it a lead task — mirrors
  --    create_lead_gia_task. title is NOT NULL (migration 0017).
  IF p_status = 'nurturing' THEN
    INSERT INTO tasks (
      title,
      assigned_to,
      created_by,
      module,
      task_type,
      task_category,
      status,
      due_at
    )
    VALUES (
      'Nurturing follow-up',
      COALESCE(v_assigned_to, p_actor_id),
      p_actor_id,
      'gia',
      'other',
      'personal',
      'to_do',
      p_now + INTERVAL '3 months'
    )
    RETURNING id INTO v_task_id;

    INSERT INTO task_gia_meta (task_id, lead_id, call_outcome)
    VALUES (v_task_id, p_lead_id, NULL);
  END IF;

  -- 8. Return data the action layer needs for notifications and SLA side-effects
  RETURN jsonb_build_object(
    'changed',      true,
    'old_status',   v_old_status,
    'new_status',   p_status,
    'assigned_to',  v_assigned_to,
    'domain',       v_domain,
    'first_name',   v_first_name,
    'last_name',    v_last_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_lead_status(uuid, uuid, text, text, timestamptz) TO authenticated;


-- 5c. get_gia_tasks — the lead-scoped task reader (dossier + Elaya read tool).
--     It already INNER-joins task_gia_meta, so the inner join alone scopes the
--     result to lead tasks (the single-writer invariant: a meta row ⇒ a lead
--     task). The t.task_category = 'gia_followup' predicate is now retired —
--     dropped. Body otherwise IDENTICAL to migration 0056.
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
    t.module::text,
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
  -- INNER JOIN task_gia_meta IS the lead-task filter — a meta row exists iff the
  -- task is a lead follow-up (single-writer invariant). No category predicate.
  INNER JOIN task_gia_meta m ON m.task_id = t.id
  INNER JOIN leads          l ON l.id     = m.lead_id
  WHERE
    CASE
      WHEN p_role = 'agent'
        THEN t.assigned_to = p_user_id
      ELSE
        l.domain = p_domain
    END
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


-- 5d. get_dashboard_summary — the agent-tasks CTE (section 1) and the agent
--     pending_calls_count (section 3) detected lead tasks via
--     t.task_category = 'gia_followup'. Both re-keyed to meta-presence.
--
--     COUNT-EQUIVALENCE (read this for pending_calls_count): the pre-collapse
--     population of 'gia_followup' tasks is EXACTLY the set of tasks with a
--     task_gia_meta row (guaranteed retroactively by the orphan check in §1, and
--     forward forever by the single-writer invariant). So
--       WHERE EXISTS (task_gia_meta row) AND status IN (...)
--     counts the identical row set the old category predicate did — the agent's
--     pending-calls number does not change. The correctness is BORROWED from the
--     write path, not local to this query.
--
--     Body otherwise BYTE-IDENTICAL to migration 0129 — sections 2, 4, 5 and the
--     entire lead-status roster logic are task-category-free and unchanged.
CREATE OR REPLACE FUNCTION get_dashboard_summary(
  p_role           text,
  p_domain         app_domain,
  p_user_id        uuid,
  p_initial_domain app_domain  DEFAULT NULL,
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now              timestamptz := now();
  v_result           jsonb;
  v_agent_tasks      jsonb;
  v_activity         jsonb;
  v_lead_status      jsonb;
  v_campaigns        jsonb;
  v_cold_leads_count int;
  v_pending_calls    int;
  v_new_leads        int;
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Agent Tasks — all categories, active statuses only
  --    ALWAYS computed; date filter does NOT apply.
  --    Lead-task detection (context_label + lead_id) keys on tgm.lead_id IS NOT
  --    NULL — i.e. a task_gia_meta row exists. By the single-writer invariant
  --    (header) that is identical to the retired task_category='gia_followup'
  --    check: only the link-creating RPC writes a meta row, and always with the
  --    task. The LEFT JOIN no longer carries an AND task_category=... clause.
  -- ─────────────────────────────────────────────────────────────────
  WITH task_rows AS (
    SELECT
      t.id,
      t.title,
      t.task_category,
      t.task_type,
      t.priority,
      t.status,
      t.due_at,
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN true ELSE false END AS is_overdue,
      CASE
        WHEN tgm.lead_id IS NOT NULL THEN
          TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, ''))
        WHEN t.task_category = 'group_subtask' THEN
          tg.title
        ELSE
          NULL
      END AS context_label,
      CASE
        WHEN tgm.lead_id IS NOT NULL THEN tgm.lead_id::text
        ELSE NULL
      END AS lead_id
    FROM tasks t
    -- A task_gia_meta row exists iff the task is a lead follow-up (single-writer
    -- invariant) — so this plain join presence replaces the old category gate.
    LEFT JOIN task_gia_meta tgm ON tgm.task_id = t.id
    LEFT JOIN leads l            ON l.id = tgm.lead_id
    LEFT JOIN task_groups tg     ON tg.id = t.group_id AND t.task_category = 'group_subtask'
    WHERE t.assigned_to = p_user_id
      AND t.status IN ('to_do', 'in_progress', 'in_review')
    ORDER BY
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN 0 ELSE 1 END ASC,
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END ASC,
      t.due_at ASC NULLS LAST
    LIMIT 30
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',            r.id,
        'title',         r.title,
        'task_category', r.task_category,
        'task_type',     r.task_type,
        'priority',      r.priority,
        'status',        r.status,
        'due_at',        r.due_at,
        'is_overdue',    r.is_overdue,
        'context_label', r.context_label,
        'lead_id',       r.lead_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_agent_tasks
  FROM task_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Live Lead Activity — role-scoped
  --    ALWAYS computed; date filter does NOT apply.
  -- ─────────────────────────────────────────────────────────────────
  WITH activity_rows AS (
    SELECT
      la.id,
      la.action_type,
      la.details,
      la.created_at,
      la.lead_id,
      la.actor_id,
      l.first_name,
      l.last_name
    FROM lead_activities la
    LEFT JOIN leads l ON l.id = la.lead_id
    WHERE
      CASE
        WHEN p_role IN ('admin', 'founder') THEN true
        WHEN p_role = 'manager'             THEN l.domain = p_domain
        ELSE                                     la.actor_id = p_user_id
      END
    ORDER BY la.created_at DESC
    LIMIT 25
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          r.id,
        'action_type', r.action_type,
        'details',     r.details,
        'created_at',  r.created_at,
        'lead_id',     r.lead_id,
        'actor_id',    r.actor_id,
        'lead_name',   CASE
                         WHEN r.first_name IS NOT NULL
                         THEN TRIM(r.first_name || ' ' || COALESCE(r.last_name, ''))
                         ELSE NULL
                       END
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_activity
  FROM activity_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- Role branch: agents skip pipeline/campaign/cold-leads CTEs but get
  -- the two snapshot counts. NO date filter on either count — they are
  -- live pipeline states, not cohort metrics.
  -- ─────────────────────────────────────────────────────────────────
  IF p_role = 'agent' THEN
    -- pending_calls_count = the agent's open lead follow-up tasks. Re-keyed from
    -- task_category='gia_followup' to EXISTS(task_gia_meta) — the identical row
    -- set by the single-writer invariant + the §1 orphan guarantee (the
    -- count-equivalence note above). The agent's number is unchanged.
    SELECT COUNT(*)::int
    INTO v_pending_calls
    FROM tasks t
    WHERE t.assigned_to = p_user_id
      AND EXISTS (SELECT 1 FROM task_gia_meta m WHERE m.task_id = t.id)
      AND t.status IN ('to_do', 'in_progress', 'in_review');

    SELECT COUNT(*)::int
    INTO v_new_leads
    FROM leads l
    WHERE l.assigned_to = p_user_id
      AND l.status = 'new'
      AND l.archived_at IS NULL;

    RETURN jsonb_build_object(
      'agent_tasks',         v_agent_tasks,
      'agent_activity',      v_activity,
      'lead_status',         jsonb_build_object('totals', '[]'::jsonb, 'byAgent', '[]'::jsonb),
      'campaigns',           '[]'::jsonb,
      'cold_leads_count',    0,
      'pending_calls_count', v_pending_calls,
      'new_leads_count',     v_new_leads
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Lead Status Summary — date filter applied to created_at
  --
  --    totals          → real cohort counts (UNCHANGED).
  --    byAgent (manager) → FULL domain roster LEFT JOINed to the cohort,
  --                        so zero-lead teammates + the manager appear at 0.
  --    byAgent (admin/founder) → cohort-only GROUP BY assigned_to (UNCHANGED).
  -- ─────────────────────────────────────────────────────────────────
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN l.domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN l.domain = p_initial_domain
          ELSE
            TRUE
        END
      )
      AND (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR l.created_at <  p_date_to)
  ),
  status_totals AS (
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM lead_rows
    GROUP BY status
  ),
  -- Per-(agent, status) cohort counts — the shared raw grain for both branches.
  per_agent_status AS (
    SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
    FROM lead_rows
    WHERE assigned_to IS NOT NULL
    GROUP BY assigned_to, agent_name, status
  ),
  -- The manager's domain team. Mirrors LEAD_ASSIGNABLE_ROLES (agent + manager).
  -- Empty for non-manager roles, so the LEFT JOIN below is a no-op there.
  roster AS (
    SELECT pr.id AS agent_id, pr.full_name AS agent_name
    FROM profiles pr
    WHERE p_role = 'manager'
      AND pr.domain = p_domain
      AND pr.role IN ('agent', 'manager')
      AND pr.is_active = true
  ),
  -- MANAGER: roster ⟕ cohort — every member present, zeros coalesced.
  agent_counts_roster AS (
    SELECT
      r.agent_id   AS assigned_to,
      r.agent_name AS agent_name,
      COALESCE(SUM(pas.cnt), 0)::int AS total,
      COALESCE(
        jsonb_object_agg(pas.status, pas.cnt) FILTER (WHERE pas.status IS NOT NULL),
        '{}'::jsonb
      ) AS counts
    FROM roster r
    LEFT JOIN per_agent_status pas ON pas.assigned_to = r.agent_id
    GROUP BY r.agent_id, r.agent_name
  ),
  -- ADMIN/FOUNDER: cohort-only (UNCHANGED from 0115/0070).
  agent_counts_cohort AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM per_agent_status
    GROUP BY assigned_to
  )
  SELECT jsonb_build_object(
    'totals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY
        CASE status
          WHEN 'new'           THEN 1
          WHEN 'touched'       THEN 2
          WHEN 'in_discussion' THEN 3
          WHEN 'nurturing'     THEN 4
          WHEN 'won'           THEN 5
          WHEN 'lost'          THEN 6
          WHEN 'junk'          THEN 7
          ELSE 8
        END
      ) FROM status_totals WHERE cnt > 0),
      '[]'::jsonb
    ),
    'byAgent', CASE
      WHEN p_role = 'manager' THEN COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'agent_id',   assigned_to,
            'agent_name', agent_name,
            'counts',     counts,
            'total',      total
          )
          ORDER BY total DESC
        ) FROM agent_counts_roster),
        '[]'::jsonb
      )
      ELSE COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'agent_id',   assigned_to,
            'agent_name', agent_name,
            'counts',     counts,
            'total',      total
          )
          ORDER BY total DESC
        ) FROM agent_counts_cohort),
        '[]'::jsonb
      )
    END
  )
  INTO v_lead_status;

  -- ─────────────────────────────────────────────────────────────────
  -- 4. Campaigns — date filter applied to created_at
  -- ─────────────────────────────────────────────────────────────────
  WITH campaign_rows AS (
    SELECT
      utm_campaign AS campaign,
      status
    FROM leads
    WHERE archived_at IS NULL
      AND utm_campaign IS NOT NULL
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN domain = p_initial_domain
          ELSE
            TRUE
        END
      )
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <  p_date_to)
  ),
  campaign_agg AS (
    SELECT
      campaign,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS mix
    FROM (
      SELECT campaign, status, COUNT(*)::int AS cnt
      FROM campaign_rows
      GROUP BY campaign, status
    ) sub
    GROUP BY campaign
    ORDER BY total DESC
    LIMIT 12
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'campaign', campaign,
        'total',    total,
        'mix',      mix
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_campaigns
  FROM campaign_agg;

  -- ─────────────────────────────────────────────────────────────────
  -- 5. Cold leads count
  --    Threshold: 5 days — matches COLD_LEAD_THRESHOLD_DAYS constant.
  --    NULL last_activity_at is intentionally excluded (< never matches NULL).
  --    Date filter intentionally NOT applied — live state, not cohort.
  -- ─────────────────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_cold_leads_count
  FROM leads l
  WHERE l.archived_at IS NULL
    AND l.status NOT IN ('won', 'lost', 'junk')
    AND l.last_activity_at < v_now - interval '5 days'
    AND (
      p_role IN ('admin', 'founder')
      OR (p_role = 'manager' AND l.domain = p_domain)
    );

  -- ─────────────────────────────────────────────────────────────────
  -- Assemble result — snapshot counts are agent-only (0 stubs here).
  -- ─────────────────────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'agent_tasks',         v_agent_tasks,
    'agent_activity',      v_activity,
    'lead_status',         v_lead_status,
    'campaigns',           v_campaigns,
    'cold_leads_count',    v_cold_leads_count,
    'pending_calls_count', 0,
    'new_leads_count',     0
  );

  RETURN v_result;
END;
$$;

-- Re-state the 0102 revoke posture (Q-13): scope-param RPC, admin client only.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamptz, timestamptz) TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 6. Index hygiene — collapsing to 'personal' makes lead follow-up tasks match
--    every task_category='personal' predicate. Each personal-scoped index is a
--    conscious widen-or-guard decision (NOT left to default):
--
--    • idx_tasks_tags_gin / idx_tasks_tags_active — tag surfaces mean
--      "standalone personal to-dos". A lead follow-up has no user tags and must
--      NOT pollute the tag vocabulary or the tag-filtered list. → GUARD with
--      module <> 'gia'. NOTE: a partial-index predicate can reference ONLY the
--      row's own columns — a subquery / EXISTS(task_gia_meta) is rejected by
--      Postgres. module is the per-row substitute: by the single-writer invariant
--      module='gia' IFF a meta row exists, so module<>'gia' is exactly
--      "standalone, non-lead task". (module is the right column precisely because
--      this migration just made it an honest per-row link signal.)
--
--    • get_personal_tasks RPC (the My Tasks reader, migration 0025/0026) —
--      WIDENED on purpose: lead follow-ups SHOULD appear in the My Tasks calendar
--      (the calendar-dot requirement). It already filters task_category='personal'
--      with no meta guard, so post-collapse it naturally includes lead tasks.
--      Left UNCHANGED — documented here so the inclusion reads as intentional.
-- ─────────────────────────────────────────────────────────────

-- idx_tasks_tags_gin (migration 0024) — GIN over tags, standalone-personal-only.
-- Guard is module<>'gia' (a per-row column test; EXISTS subqueries are not
-- allowed in a partial-index predicate). module='gia' ⇔ lead task (invariant).
DROP INDEX IF EXISTS idx_tasks_tags_gin;
CREATE INDEX idx_tasks_tags_gin
  ON tasks USING gin(tags)
  WHERE task_category = 'personal'
    AND module <> 'gia';

-- idx_tasks_tags_active (migration 0025) — covering tags for active personal
-- tasks, standalone-personal-only (same per-row module<>'gia' guard).
DROP INDEX IF EXISTS idx_tasks_tags_active;
CREATE INDEX idx_tasks_tags_active
  ON tasks(assigned_to)
  INCLUDE (tags)
  WHERE task_category = 'personal'
    AND status NOT IN ('completed', 'cancelled', 'error')
    AND module <> 'gia';
