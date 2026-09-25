-- 0240 — sia.intake_lessons: what the team has taught the ticket AI, as versioned instructions
--        + sia.draft_review_scoreboard(p_since): the verdicts by prompt version
--
-- Why: the founder's rule for the training phase is that every approval, rejection and
-- correction should end up as an instruction the ticket AI follows, and that a human approves
-- the instruction, never the machine. 0239 keeps the verdicts (sia.draft_reviews). This table
-- keeps the LESSONS written from them: one plain-English instruction document per kind of
-- work (intake = "is this a request", ticket_creator = "how to fill the ticket", sentinel =
-- "when to suggest a status move"), versioned. The lesson writer (services/intake-lessons.ts)
-- writes a DRAFT; the founder reads, edits and approves it on /settings/tickets; only the
-- APPROVED version is folded into the prompts, and the prompt version carries the lesson
-- version so the scoreboard can say whether each lesson helped. The approved body is also what
-- "Download instructions.md" exports for the specialised ticket agent later.
--
-- One approved lesson per kind at a time (partial unique index). A lesson is never deleted:
-- approving a new one retires the old (status), so the history of what was taught stays.
CREATE TABLE sia.intake_lessons (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text        NOT NULL CHECK (kind IN ('intake', 'ticket_creator', 'sentinel')),
  version       integer     NOT NULL CHECK (version >= 1),
  status        text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  -- The instruction document, plain English, the way it is folded into the prompt.
  body          text        NOT NULL CHECK (char_length(body) BETWEEN 20 AND 12000),
  -- One paragraph: what this version changes against the previous one.
  summary       text        NOT NULL DEFAULT '',
  -- What it was written from: the window, the counts, the review ids used (the audit).
  evidence      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- The model call that wrote it (sia.extraction_runs), NULL when a human wrote it by hand.
  run_id        uuid,
  created_by    uuid        REFERENCES public.profiles(id),
  approved_by   uuid        REFERENCES public.profiles(id),
  approved_at   timestamptz,
  retired_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX idx_intake_lessons_one_approved ON sia.intake_lessons (kind) WHERE status = 'approved';
CREATE UNIQUE INDEX idx_intake_lessons_one_draft    ON sia.intake_lessons (kind) WHERE status = 'draft';
CREATE INDEX idx_intake_lessons_kind_time ON sia.intake_lessons (kind, created_at DESC);

ALTER TABLE sia.intake_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY sia_intake_lessons_select ON sia.intake_lessons FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON sia.intake_lessons TO authenticated;
GRANT ALL ON sia.intake_lessons TO service_role;

COMMENT ON TABLE sia.intake_lessons IS
  'The lessons the ticket AI follows, one versioned plain-English document per kind (intake / ticket_creator / sentinel). Written as a draft by the lesson writer from sia.draft_reviews, approved by a founder on /settings/tickets; only the approved version reaches a prompt. Never deleted: a new approval retires the old.';

-- The scoreboard: how the drafts did, per prompt version, so a lesson can be judged by its numbers.
CREATE OR REPLACE FUNCTION sia.draft_review_scoreboard(p_since timestamptz)
RETURNS TABLE (source text, prompt_version text, decided bigint, accepted bigint, edited bigint, dismissed bigint, with_feedback bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.source, coalesce(r.prompt_version, 'unknown') AS prompt_version,
    count(*)                                            AS decided,
    count(*) FILTER (WHERE r.decision = 'accepted')     AS accepted,
    count(*) FILTER (WHERE r.decision = 'edited')       AS edited,
    count(*) FILTER (WHERE r.decision = 'dismissed')    AS dismissed,
    count(*) FILTER (WHERE r.feedback IS NOT NULL AND r.feedback <> '') AS with_feedback
  FROM sia.draft_reviews r
  WHERE r.decided_at >= p_since
  GROUP BY r.source, coalesce(r.prompt_version, 'unknown')
  ORDER BY r.source, prompt_version;
$$;
REVOKE ALL ON FUNCTION sia.draft_review_scoreboard(timestamptz) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION sia.draft_review_scoreboard(timestamptz) TO service_role;
COMMENT ON FUNCTION sia.draft_review_scoreboard(timestamptz) IS
  'Verdicts on machine drafts since p_since, by source and prompt version (accepted / edited / dismissed / with feedback). Admin client only; the page gates.';
