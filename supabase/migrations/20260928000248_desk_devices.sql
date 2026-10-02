-- 0248 — Desks: Elaya on the office speakers and TV boards (2026-09-28)
-- docs/architecture/desks-plan.md, section 4.
--
-- Two tables, two settings rows, nothing else touched.
--   desk_devices: a speaker (Alexa, reached through Voice Monkey) or a TV (a browser signed in as
--                 the device's own profile) on a queendom's table. The allow-list: a message is
--                 sent to a device id on this table or not at all.
--   desk_outbox:  the ledger. Everything a speaker says or a TV shows is FIRST a row here, written
--                 by one core (desk-mutations.ts queueDeskMessageCore), sent by one sender
--                 (desk-sender.ts). Status is the one column that changes (queued → sent / failed /
--                 refused), the hands.outbox posture. Never deleted.
--
-- Switch: desks_enabled, seeded FALSE. Deploying changes nothing until a founder flips it on
-- /settings/desks. Quiet hours: desks_quiet_hours {from, to} in IST hours; alerts wait and expire,
-- a human's announcement still goes.

CREATE TABLE public.desk_devices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text        NOT NULL CHECK (kind IN ('alexa', 'tv')),
  label               text        NOT NULL,                                  -- "Anishqa table"
  queendom_id         uuid        REFERENCES sia.queendoms(id) ON DELETE SET NULL, -- null = company-wide (a founder's TV)
  profile_id          uuid        UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL, -- the device account (a TV signs in as it; the skill asks as it)
  alexa_device_id     text        UNIQUE,                                    -- from the skill request; null for a TV
  voicemonkey_device  text,                                                  -- the name Voice Monkey knows the Echo by
  is_active           boolean     NOT NULL DEFAULT true,
  last_seen_at        timestamptz,
  created_by          uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.desk_devices IS
  'The speakers and TVs on the office tables (0248). The allow-list: the sender speaks only to a device on this table. A device profile is a genie of its queendom, so every queendom gate already applies to what it hears.';
CREATE INDEX idx_desk_devices_queendom ON public.desk_devices (queendom_id) WHERE is_active;
ALTER TABLE public.desk_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "desk_devices_select" ON public.desk_devices FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder') OR profile_id = auth.uid());
GRANT SELECT ON public.desk_devices TO authenticated;
GRANT ALL ON public.desk_devices TO service_role;

CREATE TABLE public.desk_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL CHECK (kind IN ('announcement', 'alert', 'answer', 'reminder')),
  severity        smallint    NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  -- { all: true } | { queendom_id } | { device_id }
  audience        jsonb       NOT NULL,
  title           text        NOT NULL,
  body            text        NOT NULL,                                      -- what a TV shows
  spoken          text        NOT NULL,                                      -- what a speaker says (desk-speech.ts is the only writer)
  source          text        NOT NULL CHECK (source IN ('human', 'elaya', 'sweep')),
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  alert_id        uuid        REFERENCES public.elaya_alerts(id) ON DELETE SET NULL,
  conversation_id uuid,
  status          text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'refused')),
  sent_to         jsonb       NOT NULL DEFAULT '[]'::jsonb,                  -- device ids that got it
  error           text,
  not_before      timestamptz NOT NULL DEFAULT now(),                        -- a reminder waits for its time
  expires_at      timestamptz,                                               -- a stale alert is never spoken late
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
COMMENT ON TABLE public.desk_outbox IS
  'Everything a speaker says or a TV shows, first as a row here (0248). One writer (queueDeskMessageCore), one sender (desk-sender.ts). status is the only column that changes; never deleted.';
CREATE INDEX idx_desk_outbox_queued ON public.desk_outbox (not_before) WHERE status = 'queued';
CREATE INDEX idx_desk_outbox_recent ON public.desk_outbox (created_at DESC);
ALTER TABLE public.desk_outbox ENABLE ROW LEVEL SECURITY;
-- Admin and founder read the ledger. A device profile reads the rows addressed to it (its own id,
-- its queendom, or everyone), which is what the TV board subscribes to.
CREATE POLICY "desk_outbox_select" ON public.desk_outbox FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR EXISTS (
      SELECT 1 FROM public.desk_devices d
      WHERE d.profile_id = auth.uid() AND d.is_active
        AND (
          (audience->>'all') = 'true'
          OR (audience->>'device_id') = d.id::text
          OR (d.queendom_id IS NOT NULL AND (audience->>'queendom_id') = d.queendom_id::text)
        )
    )
  );
GRANT SELECT ON public.desk_outbox TO authenticated;
GRANT ALL ON public.desk_outbox TO service_role;

-- The TV board listens for new rows over Realtime (RLS above scopes what each device sees).
ALTER PUBLICATION supabase_realtime ADD TABLE public.desk_outbox;

INSERT INTO public.elaya_settings (key, value) VALUES ('desks_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('desks_quiet_hours', '{"from": 21, "to": 8}'::jsonb) ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
