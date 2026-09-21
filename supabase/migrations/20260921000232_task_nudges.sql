-- Migration 0232: a task can nudge its assignee again and again ("remind him every 3 hours").
--
-- Why: on 2026-09-21 the founder asked Elaya "remind Karan ... every 3 hrs" and she could not: a
-- task has one due moment and one reminder. Three columns give a task a repeat: how often, until
-- when, and how many nudges went out. The nudge itself is a Trigger.dev run
-- (src/trigger/task-reminders.ts sendTaskNudgeTask) that re-arms itself under the task's own
-- reminder tag, so completing or deleting the task sweeps the repeats like every other reminder.
-- Bounds: never more often than every 30 minutes, never longer than 3 days from the moment set.

ALTER TABLE public.tasks
  ADD COLUMN nudge_every_minutes integer,
  ADD COLUMN nudge_until timestamptz,
  ADD COLUMN nudge_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_nudge_every_minutes_check
    CHECK (nudge_every_minutes IS NULL OR nudge_every_minutes BETWEEN 30 AND 1440);

COMMENT ON COLUMN public.tasks.nudge_every_minutes IS 'Repeat the reminder to the assignee this often (30..1440 minutes); NULL = no repeat.';
COMMENT ON COLUMN public.tasks.nudge_until IS 'Stop repeating after this moment (at most 3 days from when it was set).';
COMMENT ON COLUMN public.tasks.nudge_count IS 'How many repeat nudges have gone out.';
