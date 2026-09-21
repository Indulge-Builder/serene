-- Migration 0225: the daily briefing's switch, seeded OFF.
--
-- Elaya's morning and evening briefing (services/elaya-briefing.ts) sends the founders a WhatsApp
-- message unasked, so it ships off: nothing goes to anyone's phone until a founder turns it on.
--   UPDATE elaya_settings SET value = 'true' WHERE key = 'daily_briefing_enabled';
-- No schema change, no RLS change (0116's policies stand: admin/founder read, service-role write).

INSERT INTO elaya_settings (key, value) VALUES ('daily_briefing_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
