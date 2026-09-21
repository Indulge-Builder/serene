-- Migration 0233: Elaya playbooks — the founder writes, in plain words, HOW a kind of question is
-- answered, and Elaya reads it on the next message. No deploy.
--
-- Why: the tools return true numbers, but nothing said which ones matter for "what is happening
-- in Ananyshree's queendom" (she read out an all-time total of 15,084 tickets). A playbook holds
-- example questions people really ask and the instructions for that kind of ask: check for a time
-- frame, default to today with the last 3 and 7 days in brief, only that queendom, the member
-- groups and Freshdesk of that queendom, lead with what needs attention. The router picks the
-- matching playbook with the specialist; the text is placed into her instructions for the turn;
-- the turn's row records which one fired (elaya_messages.meta.playbook). Each playbook's example
-- questions double as exam cases.

CREATE TABLE public.elaya_playbooks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  example_questions text[] NOT NULL CHECK (cardinality(example_questions) BETWEEN 1 AND 12),
  instructions      text NOT NULL CHECK (char_length(instructions) BETWEEN 10 AND 6000),
  active            boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES public.profiles(id),
  updated_by        uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_elaya_playbooks_active ON public.elaya_playbooks (active, updated_at DESC);

ALTER TABLE public.elaya_playbooks ENABLE ROW LEVEL SECURITY;

-- Admin and founder read on the session client (the settings page); writes go through the
-- admin client behind requireProfile(['admin','founder']) in actions/elaya-playbooks.ts, and the
-- brains read with the service role. No user write policy on purpose (the sla_policies posture).
CREATE POLICY elaya_playbooks_read_admin ON public.elaya_playbooks
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));

COMMENT ON TABLE public.elaya_playbooks IS 'How Elaya answers a KIND of question, written by the founder: example questions + plain instructions. Read by the router per turn.';
