-- Migration 0134: Suggestion box / bug-report channel (table + RLS)
--
-- Any staff member submits a suggestion or bug report (message + up to 4
-- screenshots); admin/founder triage them in /admin/suggestions (open → resolved).
-- Layer over the org — a clean substrate for a future AI triage pass.
--
-- ── NOT append-only ──────────────────────────────────────────────────────────
-- Unlike log/activity tables (Rule 08 / A-11), a suggestion has a STATUS lifecycle
-- (open → resolved). It therefore gets exactly ONE narrow UPDATE policy
-- (admin/founder), the revival_candidates carve-out. PostgreSQL RLS cannot
-- restrict WHICH columns change — the "only status / resolved_by / resolved_at are
-- writable" restriction is enforced in the action/service layer
-- (resolveSuggestion writes exactly those three), the task_remarks-suppression /
-- revival-resolve precedent. There is NO DELETE policy, ever.
--
-- ── Storage ──────────────────────────────────────────────────────────────────
-- image_paths holds storage PATHS in the private `suggestions` bucket (migration
-- 0135), never URLs — admin viewing mints short-lived signed URLs at read time.
-- The CHECK mirrors MAX_SUGGESTION_IMAGES (4) in lib/constants/suggestions.ts.

CREATE TABLE suggestions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category     text        NOT NULL CHECK (category IN ('bug', 'idea', 'other')),
  message      text        NOT NULL,
  -- Paths under `${sender_id}/...` in the private `suggestions` bucket (≤ 4).
  image_paths  text[]      NOT NULL DEFAULT '{}'
                           CHECK (array_length(image_paths, 1) IS NULL
                                  OR array_length(image_paths, 1) <= 4),
  status       text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'resolved')),
  resolved_by  uuid        REFERENCES profiles(id),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The inbox list read: open-first, newest-first within a status.
CREATE INDEX idx_suggestions_status_created
  ON suggestions (status, created_at DESC);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Sender reads their own reports (the dashboard sender never lists others').
CREATE POLICY "suggestions_select_own"
  ON suggestions FOR SELECT
  USING (sender_id = (SELECT auth.uid()));

-- Admin/founder read every report (the triage inbox). InitPlan-hoisted per 0088;
-- get_user_role() returns the user_role enum, compared to the literals (coerced).
CREATE POLICY "suggestions_select_admin"
  ON suggestions FOR SELECT
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- Sender creates their own report; cannot forge another sender_id.
CREATE POLICY "suggestions_insert_own"
  ON suggestions FOR INSERT
  WITH CHECK (sender_id = (SELECT auth.uid()));

-- Admin/founder flip status (resolve). Column restriction (only status /
-- resolved_by / resolved_at) is enforced in resolveSuggestion — RLS can't.
CREATE POLICY "suggestions_update_admin"
  ON suggestions FOR UPDATE
  USING ((SELECT get_user_role()) IN ('admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

-- No DELETE policy, ever.

-- updated_at maintenance (reuse the earliest-migration function, never recreate).
CREATE TRIGGER suggestions_updated_at
  BEFORE UPDATE ON suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE suggestions IS
  'Staff suggestion / bug-report channel (migration 0134). Any staff member '
  'INSERTs their own report (message + up to 4 screenshot paths in the private '
  'suggestions bucket); admin/founder SELECT all + UPDATE status (open → '
  'resolved). NOT append-only — the one narrow admin/founder UPDATE is the '
  'revival_candidates carve-out; only status/resolved_by/resolved_at are writable '
  '(enforced in resolveSuggestion — RLS cannot restrict columns). No DELETE ever.';
