-- Fix tasks.status DEFAULT: migration 0017 migrated CHECK values to to_do|… but left
-- the column default as legacy 'pending', which violates tasks_status_check on INSERT.

ALTER TABLE public.tasks
  ALTER COLUMN status SET DEFAULT 'to_do';
