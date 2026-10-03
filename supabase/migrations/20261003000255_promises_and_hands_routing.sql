-- Migration 0255: the promise tracker, and the job routing of the Hands line.
--
-- 1. sia.promises (the founder's update alert, 2026-10-03). A week of real chats showed a holding
--    reply ("Sure, let me check") is a COMMITMENT, not a message: its deadline depends on what was
--    asked ("by EOD", "driver details by 12 PM", "asap, visa tomorrow"), one group can owe two or
--    three things at once, a mid-way "we have reached out to the vendor" keeps the member informed,
--    and half of the bare "Sure / Noted" lines promise nothing at all. So Elaya reads the
--    conversation (services/promise-reader.ts) and keeps one row per thing Indulge owes a member:
--    what, by when, waiting on whom, and whether it was delivered. The alert pass
--    (services/reply-alerts.ts) walks the OPEN rows past their due time. Written by the service
--    role only; admin/founder may read.
--
-- 2. hands.messages.match_status (the Instinct job codes, 2026-10-03). One WhatsApp chat carries many
--    jobs at once. The connector files a reply by the job code it carries (#T42), by the message it
--    quotes, or by the only open thread; a reply it cannot place is 'unmatched' and waits for Elaya's
--    content match or a person (the tray on /hands). Talk adoption never takes an unmatched reply.
--
-- Nothing here changes how a message is saved. Both features are read by code gated by settings
-- (update_alerts_enabled; hands_enabled).

-- ── 1. Promises ─────────────────────────────────────────────────────────────
CREATE TABLE sia.promises (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid           text        NOT NULL,
  member_id           uuid,
  queendom_id         uuid,
  what                text        NOT NULL,                       -- "hotel options for Hong Kong and Guangzhou"
  waiting_on          text        NOT NULL DEFAULT 'us' CHECK (waiting_on IN ('us', 'vendor', 'member')),
  status              text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'delivered', 'dropped')),
  due_at              timestamptz,                                -- null only while waiting on the member
  due_basis           text        CHECK (due_basis IN ('stated', 'inferred')),
  promised_at         timestamptz NOT NULL,
  promised_msg_id     text,
  promised_text       text,
  promiser_profile_id uuid,                                       -- the staff member who said it, when linked
  last_update_at      timestamptz,                                -- the latest mid-way update to the member
  chased_at           timestamptz,                                -- the member asked for an update while it was open
  closed_at           timestamptz,
  closed_msg_id       text,
  steps               text[]      NOT NULL DEFAULT '{}',          -- the alert ladder steps already handled
  run_id              uuid,                                       -- the sia.extraction_runs row that last wrote it
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE sia.promises IS 'What Indulge owes a member, read by Elaya from the group chat (0255): what, by when, waiting on whom, open / delivered / dropped. The update alert walks open rows past due_at. Service role writes; admin/founder read.';
CREATE INDEX idx_promises_open ON sia.promises (status, due_at) WHERE status = 'open';
CREATE INDEX idx_promises_group ON sia.promises (group_jid, status);
ALTER TABLE sia.promises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promises_select" ON sia.promises FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON sia.promises TO authenticated;
GRANT ALL ON sia.promises TO service_role;

-- When Elaya last read a group for promises (the sweep reads a group again only after new messages).
ALTER TABLE sia.reply_clocks ADD COLUMN promises_read_at timestamptz;

-- ── 2. Hands job routing ────────────────────────────────────────────────────
ALTER TABLE hands.messages
  ADD COLUMN match_status text CHECK (match_status IN ('code', 'quote', 'only_thread', 'unmatched', 'content', 'human'));
COMMENT ON COLUMN hands.messages.match_status IS 'How an inbound reply found its thread (0255): code (#T42), quote, only_thread, content (Elaya), human (the tray); unmatched = waiting for one of the last two. Null = filed the old way.';
CREATE INDEX idx_hands_messages_unmatched ON hands.messages (jid, wa_timestamp) WHERE match_status = 'unmatched';

NOTIFY pgrst, 'reload schema';
