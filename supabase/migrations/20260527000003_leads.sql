-- Migration 0003: Gia module — leads, lead_activities, lead_notes, tasks, task_gia_meta
-- Append-only tables: lead_activities, lead_notes, whatsapp_messages (never UPDATE/DELETE)
-- RLS enforced at DB level + code level (two-layer security, rule A-09)

-- ─────────────────────────────────────────────────────────
-- leads table
-- ─────────────────────────────────────────────────────────
CREATE TABLE leads (
  -- Identity
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          text          NOT NULL,
  last_name           text,
  email               text,
  phone               text,                                   -- E.164 always

  -- Domain
  domain              text          NOT NULL,                 -- indulge_concierge | etc.

  -- Assignment
  assigned_to         uuid          REFERENCES profiles(id),
  assigned_at         timestamptz,

  -- Status & Intent
  status              text          NOT NULL DEFAULT 'new',   -- new|touched|in_discussion|won|nurturing|lost|junk
  lead_intent         text,                                   -- hot | cold

  -- Campaign & UTM
  campaign_id         text,
  ad_name             text,
  platform            text,                                   -- meta | google | website | whatsapp
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,

  -- Raw form data — immutable after insert
  form_data           jsonb,

  -- Call tracking
  call_count          integer       NOT NULL DEFAULT 0,
  last_call_outcome   text,                                   -- rnr|switched_off|wrong_number|conversing|other

  -- Agent workspace
  private_scratchpad  text,                                   -- assigned agent + admin + founder only

  -- Timestamps
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  archived_at         timestamptz                             -- soft delete only, never hard delete
);

CREATE INDEX idx_leads_domain_status   ON leads(domain, status)   WHERE archived_at IS NULL;
CREATE INDEX idx_leads_assigned_to     ON leads(assigned_to)      WHERE archived_at IS NULL;
CREATE INDEX idx_leads_created_at      ON leads(created_at DESC)  WHERE archived_at IS NULL;
CREATE INDEX idx_leads_phone           ON leads(phone);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Agents see only their own leads
CREATE POLICY "leads_agent_select"
  ON leads FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND assigned_to = auth.uid()
    AND archived_at IS NULL
  );

-- Managers see all leads in their domain
CREATE POLICY "leads_manager_select"
  ON leads FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND domain = get_user_domain()::text
    AND archived_at IS NULL
  );

-- Admin and founder see everything
CREATE POLICY "leads_admin_founder_select"
  ON leads FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
    AND archived_at IS NULL
  );

-- Webhook service role inserts (bypasses RLS via service key)
-- App-layer inserts come from server actions using service role, no INSERT policy needed for app users.

-- Agents, managers, admin, founder can update leads they have access to
CREATE POLICY "leads_update"
  ON leads FOR UPDATE
  USING (
    (get_user_role() = 'agent' AND assigned_to = auth.uid())
    OR (get_user_role() = 'manager' AND domain = get_user_domain()::text)
    OR get_user_role() IN ('admin', 'founder')
  );

-- ─────────────────────────────────────────────────────────
-- lead_activities table — append-only
-- ─────────────────────────────────────────────────────────
CREATE TABLE lead_activities (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid          NOT NULL REFERENCES leads(id),
  actor_id    uuid          REFERENCES profiles(id),         -- NULL = system/webhook action
  action_type text          NOT NULL,  -- lead_created|status_changed|note_added|agent_assigned|call_logged
  details     jsonb,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead_id
  ON lead_activities(lead_id, created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Mirrors lead access: only those who can see the lead see its activities
CREATE POLICY "lead_activities_select"
  ON lead_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_activities.lead_id
        AND (
          (get_user_role() = 'agent' AND l.assigned_to = auth.uid())
          OR (get_user_role() = 'manager' AND l.domain = get_user_domain()::text)
          OR get_user_role() IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );

-- No UPDATE or DELETE — append-only enforced at policy level
-- INSERT comes from service role only (server actions)

-- ─────────────────────────────────────────────────────────
-- lead_notes table — append-only
-- ─────────────────────────────────────────────────────────
CREATE TABLE lead_notes (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid          NOT NULL REFERENCES leads(id),
  author_id    uuid          NOT NULL REFERENCES profiles(id),
  content      text          NOT NULL,   -- sanitizeText() applied before insert
  call_outcome text,                     -- rnr|switched_off|wrong_number|conversing|other|null
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead_id
  ON lead_notes(lead_id, created_at DESC);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

-- All notes visible to anyone with domain access to this lead
CREATE POLICY "lead_notes_select"
  ON lead_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_notes.lead_id
        AND (
          (get_user_role() = 'agent' AND l.assigned_to = auth.uid())
          OR (get_user_role() = 'manager' AND l.domain = get_user_domain()::text)
          OR get_user_role() IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );

-- No UPDATE or DELETE — append-only

-- ─────────────────────────────────────────────────────────
-- tasks table — universal task table
-- ─────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to   uuid          NOT NULL REFERENCES profiles(id),
  created_by    uuid          NOT NULL REFERENCES profiles(id),
  module        text          NOT NULL,   -- 'gia' | 'concierge' | 'finance' | etc.
  task_type     text          NOT NULL,   -- call|whatsapp_message|email|general_follow_up
  status        text          NOT NULL DEFAULT 'pending',  -- pending|done|cancelled
  due_at        timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assigned_to  ON tasks(assigned_to, due_at) WHERE status = 'pending';
CREATE INDEX idx_tasks_module       ON tasks(module)               WHERE status = 'pending';

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Agents see only tasks assigned to them
CREATE POLICY "tasks_agent_select"
  ON tasks FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND assigned_to = auth.uid()
  );

-- Managers, admin, founder see all tasks in their scope
CREATE POLICY "tasks_manager_admin_founder_select"
  ON tasks FOR SELECT
  USING (
    get_user_role() IN ('manager', 'admin', 'founder')
  );

-- Agents can update their own tasks (mark done/cancel)
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE
  USING (
    (get_user_role() = 'agent' AND assigned_to = auth.uid())
    OR get_user_role() IN ('manager', 'admin', 'founder')
  );

-- ─────────────────────────────────────────────────────────
-- task_gia_meta — Gia-specific task extension
-- ─────────────────────────────────────────────────────────
CREATE TABLE task_gia_meta (
  task_id      uuid    PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  lead_id      uuid    NOT NULL REFERENCES leads(id),
  call_outcome text    -- populated when task_type='call' and task is completed
);

CREATE INDEX idx_task_gia_meta_lead_id ON task_gia_meta(lead_id);

ALTER TABLE task_gia_meta ENABLE ROW LEVEL SECURITY;

-- Mirrors task access
CREATE POLICY "task_gia_meta_select"
  ON task_gia_meta FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_gia_meta.task_id
        AND (
          (get_user_role() = 'agent' AND t.assigned_to = auth.uid())
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );
