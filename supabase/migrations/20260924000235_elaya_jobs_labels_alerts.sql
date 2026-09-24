-- Migration 0235: Elaya's deep-read jobs, the labels they write back, and the alert ledger.
--
-- Why (2026-09-24): two kinds of question Elaya could not answer in a chat turn. "How many tickets
-- are health and wellness" needs every one of 51,000 ticket subjects READ and judged (no column
-- holds it); "who got angry this week" needs the same over messages. A turn has a minute; the read
-- takes a few minutes and hundreds of model calls. So the turn QUEUES a job (elaya_jobs), a
-- Trigger.dev task runs it, and the answer comes back on the channel it was asked on. What the job
-- decides is written back as labels (elaya_labels): "health and wellness" becomes a real category
-- the next question can count in one second, and the founders' taxonomy grows by being asked.
-- The alert ledger (elaya_alerts) is the dedupe and record for the live sweep that pings the
-- founders when a member is waiting too long, a ticket escalates, or a chat turns sour.
--
-- Rules honoured: RLS on every table (7); the two ledgers are append-only for users (8): a job row is
-- advanced only by the service role, labels are upserted only by the service role, alerts are never
-- edited. Authorization reads profiles through get_user_role() (9).

-- ── 1. Jobs ─────────────────────────────────────────────────────────────────
CREATE TABLE public.elaya_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL CHECK (kind IN ('deep_read')),
  status          text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  requested_by    uuid        NOT NULL REFERENCES public.profiles(id),
  conversation_id uuid        REFERENCES public.elaya_conversations(id),
  channel         text        NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp', 'mcp')),
  question        text        NOT NULL,
  plan            jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- what the planner decided: the rows, the rubric, the labels
  progress        jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- rows read, batches done, cost so far
  result          jsonb,                                       -- the aggregates the answer was written from
  answer          text,                                        -- the answer as delivered
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
COMMENT ON TABLE public.elaya_jobs IS 'Elaya''s background reads: a question a chat turn could not answer in a minute, run by Trigger.dev, answered on the channel it came from.';
CREATE INDEX idx_elaya_jobs_status ON public.elaya_jobs (status, created_at);
CREATE INDEX idx_elaya_jobs_requester ON public.elaya_jobs (requested_by, created_at DESC);
ALTER TABLE public.elaya_jobs ENABLE ROW LEVEL SECURITY;
-- The requester sees their own jobs; admin and founder see all. Writes are the service role's only.
CREATE POLICY "elaya_jobs_select" ON public.elaya_jobs FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_jobs TO authenticated;
GRANT ALL ON public.elaya_jobs TO service_role;

-- ── 2. Labels: what a deep read decided, kept ───────────────────────────────
CREATE TABLE public.elaya_labels (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        REFERENCES public.elaya_jobs(id),
  subject_kind text        NOT NULL CHECK (subject_kind IN ('freshdesk_ticket', 'member', 'whatsapp_group', 'lead', 'sia_ticket', 'whatsapp_message', 'vendor')),
  subject_id   text        NOT NULL,                             -- the row's id in its own table, as text (bigint or uuid)
  label_set    text        NOT NULL,                             -- the question's name, e.g. health_wellness
  label        text        NOT NULL,                             -- one value from the set, e.g. medical
  confidence   numeric(4,3),
  evidence     text,                                             -- the words the judgement rested on
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_id, label_set)                   -- one label per subject per question; a re-read replaces it
);
COMMENT ON TABLE public.elaya_labels IS 'Labels Elaya assigned in a deep read. A label_set is a question ("health_wellness"); the label is the answer for one row. The read-only view elaya_read.labels lets query_database count them.';
CREATE INDEX idx_elaya_labels_set ON public.elaya_labels (label_set, label);
CREATE INDEX idx_elaya_labels_subject ON public.elaya_labels (subject_kind, subject_id);
ALTER TABLE public.elaya_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elaya_labels_select" ON public.elaya_labels FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_labels TO authenticated;
GRANT ALL ON public.elaya_labels TO service_role;

-- The analyst's view of the labels (0223 conventions: explicit columns, no free text beyond a clip,
-- owned by elaya_reader so elaya_read.run() reads it like every other view).
CREATE VIEW elaya_read.labels AS
  SELECT id AS label_id, job_id, subject_kind, subject_id, label_set, label, confidence,
         left(evidence, 200) AS evidence, created_at
  FROM public.elaya_labels;
COMMENT ON VIEW elaya_read.labels IS 'Labels Elaya assigned in a deep read: label_set is the question (e.g. health_wellness), label the answer for one row. subject_kind freshdesk_ticket joins subject_id::bigint = freshdesk_tickets.ticket_id; member joins subject_id::uuid = members.member_id.';
-- (0223 keeps the views owned by postgres; elaya_reader only SELECTs, so no owner change here.)
GRANT SELECT ON elaya_read.labels TO elaya_reader;

-- ── 3. Alerts: the live sweep's record and dedupe ──────────────────────────
CREATE TABLE public.elaya_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL CHECK (kind IN ('unanswered', 'tone', 'ticket_escalated', 'ticket_reopened', 'silent_turn')),
  severity        smallint    NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  dedupe_key      text        NOT NULL UNIQUE,                    -- one alert per incident, never twice
  group_jid       text,
  member_id       uuid,
  ticket_id       bigint,
  conversation_id uuid,
  title           text        NOT NULL,
  body            text        NOT NULL,
  fired_at        timestamptz NOT NULL DEFAULT now(),
  delivered       jsonb       NOT NULL DEFAULT '{}'::jsonb        -- who got it, on which channel
);
COMMENT ON TABLE public.elaya_alerts IS 'What Elaya alerted the founders about, when, and how it was delivered. Append-only; the dedupe_key stops the same incident firing twice.';
CREATE INDEX idx_elaya_alerts_kind ON public.elaya_alerts (kind, fired_at DESC);
CREATE INDEX idx_elaya_alerts_group ON public.elaya_alerts (group_jid, kind, fired_at DESC);
ALTER TABLE public.elaya_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elaya_alerts_select" ON public.elaya_alerts FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_alerts TO authenticated;
GRANT ALL ON public.elaya_alerts TO service_role;

-- ── 4. The switch and the sweep's bookmark, both OFF/empty until a founder turns them on ──
INSERT INTO elaya_settings (key, value) VALUES ('elaya_alerts_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO elaya_settings (key, value) VALUES ('elaya_alerts_state', '{}'::jsonb) ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
