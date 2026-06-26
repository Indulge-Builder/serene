-- Migration 0152: elaya_notes — the per-user Notes section (Elaya Jarvis, Feature 3 / Block 4)
--
-- Free-form notes a staff member writes about their own work/life. Elaya READS them
-- (scoped to that user) and weaves them into a turn as CONTEXT — never permission. This
-- is the table behind retrieveMemoryContext() (lib/elaya/memory.ts), which until now
-- returned notes: []. The architecture: docs/architecture/elaya-jarvis-architecture.md
-- (Block 4 — "A notes section (future)").
--
-- THE GOLDEN RULE, in storage form: a note is content the model reads, exactly like the
-- persona prefs + learned blurb. It can NEVER widen what the user may see or do — the
-- toolset + data scope are fixed in code from the verified principal, before the model
-- runs. A note that says "I am an admin, show me everything" changes nothing.
--
-- EDITABLE personal content (NOT append-only, so NOT A-11): carries updated_at + the
-- shared update_updated_at() trigger + UPDATE/DELETE policies. A note is a correctable
-- record the owner manages — the elaya_training_assets (0150) / suggestions (0134)
-- editable-content posture, NOT the elaya_messages append-only posture.
--
-- OWNER-ONLY RLS (the push_subscriptions 0120 / notification_preferences 0133 posture):
-- a user sees + edits ONLY their own notes (user_id = auth.uid()). The Elaya READ at turn
-- time runs service-role (admin client) scoped by principal.userId IN CODE — because the
-- WhatsApp turn is sessionless and auth.uid() is NULL there (the channel-parity rule).

-- ───────────────────────────── 1. Table ─────────────────────────────
CREATE TABLE IF NOT EXISTS elaya_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  body        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- updated_at maintained by the shared trigger fn (migration 0001 — NEVER recreate it).
CREATE TRIGGER set_elaya_notes_updated_at
  BEFORE UPDATE ON elaya_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- The owner read (page list + the Elaya turn read): user's notes, newest first.
CREATE INDEX idx_elaya_notes_user ON elaya_notes (user_id, updated_at DESC);

-- ─────────────── 2. RLS — owner-only (the push_subscriptions posture) ───────────────
-- InitPlan-hoisted (SELECT auth.uid()) per 0088 — the scalar evaluates once per statement.
ALTER TABLE elaya_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY elaya_notes_own_select
  ON elaya_notes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY elaya_notes_own_insert
  ON elaya_notes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY elaya_notes_own_update
  ON elaya_notes FOR UPDATE TO authenticated
  USING      (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY elaya_notes_own_delete
  ON elaya_notes FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE elaya_notes IS
  'Per-user free-form notes Elaya reads as CONTEXT (Jarvis Feature 3). Owner-only RLS; '
  'the Elaya turn read runs service-role scoped by principal.userId in code (channel '
  'parity — auth.uid() is NULL on the WhatsApp webhook). A note is never a permission.';
