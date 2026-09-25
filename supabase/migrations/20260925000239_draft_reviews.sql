-- 0239 — sia.draft_reviews: every human verdict on a machine draft, kept in full
--
-- Why: intake is in its training phase and a human makes every final call (the founder's
-- rule). Until now the verdict was kept thinly: an accepted card stored WHICH fields the
-- human changed ("title", "priority"), never what was written instead; a dismissed card
-- stored a fixed reason and "other" said nothing; a ticket drafted from a Sia selection
-- (no card) and a sentinel suggestion kept no correction at all beyond a timeline line.
-- Nothing can be learned from that. This table is the training ledger: one row per human
-- decision on a machine draft, with the draft as it was, what was made instead, each
-- change as from → to, the reason, and the human's words. The lesson writer (next) reads
-- ONLY this table; the prompts never read it directly.
--
-- Append-only (Rule 08): a verdict is a fact about a moment. Written by the service role
-- from the actions; read on the settings page by admin and founder.
CREATE TABLE sia.draft_reviews (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Where the draft came from: an intake card, the New ticket form's creator (a Sia
  -- selection), or the sentinel's suggested status move.
  source          text        NOT NULL CHECK (source IN ('intake_card', 'ticket_creator', 'sentinel')),
  decision        text        NOT NULL CHECK (decision IN ('accepted', 'edited', 'dismissed')),
  member_id       uuid        REFERENCES member.members(id) ON DELETE SET NULL,
  queendom_id     uuid        REFERENCES sia.queendoms(id),
  proposal_id     uuid        REFERENCES sia.intake_proposals(id) ON DELETE SET NULL,
  ticket_id       uuid        REFERENCES sia.tickets(id) ON DELETE SET NULL,
  -- The model call that produced the draft (sia.extraction_runs), and its prompt version,
  -- copied here so the scoreboard can split by version without a join.
  run_id          uuid,
  prompt_version  text,
  -- The draft as the machine gave it, and what the human made (NULL on a dismissal).
  draft           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  final           jsonb,
  -- [{ field, from, to }] for every field that differs; [] when accepted untouched.
  corrections     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  dismiss_reason  text,
  -- The human's own words about what was wrong (optional, the most valuable column here).
  feedback        text,
  decided_by      uuid        REFERENCES public.profiles(id),
  decided_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_draft_reviews_source_time ON sia.draft_reviews (source, decided_at DESC);
CREATE INDEX idx_draft_reviews_version     ON sia.draft_reviews (prompt_version, decided_at DESC);
CREATE INDEX idx_draft_reviews_proposal    ON sia.draft_reviews (proposal_id) WHERE proposal_id IS NOT NULL;

ALTER TABLE sia.draft_reviews ENABLE ROW LEVEL SECURITY;
-- Admin and founder read the ledger (the settings page). Nobody writes through the API: the
-- actions write through the service role after their own gate, and nothing updates or deletes.
CREATE POLICY sia_draft_reviews_select ON sia.draft_reviews FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON sia.draft_reviews TO authenticated;
GRANT ALL ON sia.draft_reviews TO service_role;

COMMENT ON TABLE sia.draft_reviews IS
  'The training ledger: one row per human verdict on a machine draft (intake card, ticket creator, sentinel), with the draft, the final, every correction as from/to, the reason and the human''s words. Append-only. The lesson writer reads this; prompts never do.';
