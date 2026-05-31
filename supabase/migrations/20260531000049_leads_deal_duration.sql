-- Migration: add deal_amount, deal_type, deal_duration to leads
-- All three columns are new — none exist in the live DB yet.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deal_amount   numeric(12, 2),
  ADD COLUMN IF NOT EXISTS deal_type     text,
  ADD COLUMN IF NOT EXISTS deal_duration text;

-- Constrain deal_type to the two allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_deal_type_check'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_deal_type_check
      CHECK (deal_type IN ('membership', 'retail'));
  END IF;
END $$;

-- Constrain deal_duration to the three membership durations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_deal_duration_check'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_deal_duration_check
      CHECK (
        deal_duration IS NULL OR
        deal_duration IN ('3_months', '6_months', '1_year')
      );
  END IF;
END $$;
