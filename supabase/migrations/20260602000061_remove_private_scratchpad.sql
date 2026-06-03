ALTER TABLE leads DROP COLUMN IF EXISTS private_scratchpad;
DROP FUNCTION IF EXISTS get_lead_scratchpad(uuid);
