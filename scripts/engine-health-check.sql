-- ============================================================================
-- SERENE — Engine Health Check
-- ============================================================================
-- Daily green/red signal for the SLA / cadence / reminder / revival engine.
-- Run each morning during go-live week (and anytime the team reports "I didn't
-- get an alert"). It needs NO Trigger.dev dashboard access — it reads the same
-- DB tables the engine writes to.
--
-- HOW TO RUN:
--   Supabase SQL editor (project Serene), or:
--   psql "$DATABASE_URL" -f scripts/engine-health-check.sql
--
-- HOW TO READ (top row is the one that matters most):
--   "SLA timers fired (last 24h)"  → MUST be > 0 once leads are flowing.
--       🔴 0 with new timers being scheduled = the Trigger.dev worker is DOWN
--       (redeploy:  npm run trigger:deploy).
--   "Overdue pending timers"       → timers past due that haven't fired.
--       ✅ 0 = worker keeping up.  🔴 >0 for >1h = worker not processing.
--   The "info" rows are context, not pass/fail — they show volume so you can
--   sanity-check that alerts/reminders/revival are actually reaching people.
--
-- THRESHOLDS are deliberately conservative (10-min grace so a timer that just
-- came due isn't flagged as "stuck"). Tune the intervals if your volume grows.
-- ============================================================================

WITH checks AS (

  -- 1. CORE HEARTBEAT: did any SLA timer fire in the last 24h?
  SELECT 1 AS ord, 'SLA timers fired (last 24h)' AS metric,
    (SELECT count(*)::text FROM lead_sla_timers
       WHERE fired_at >= now() - interval '24 hours') AS value,
    CASE WHEN (SELECT count(*) FROM lead_sla_timers
                 WHERE fired_at >= now() - interval '24 hours') > 0
         THEN '✅ firing'
         ELSE '🔴 NOTHING FIRED — Trigger.dev worker may be down' END AS status

  -- 2. Pending timers already past due (worker should have fired them)
  UNION ALL
  SELECT 2, 'Overdue pending timers (should fire, have not)',
    (SELECT count(*)::text FROM lead_sla_timers
       WHERE status='pending' AND scheduled_fire_at < now() - interval '10 minutes'),
    CASE
      WHEN (SELECT count(*) FROM lead_sla_timers
              WHERE status='pending' AND scheduled_fire_at < now() - interval '10 minutes') = 0
        THEN '✅ none stuck'
      WHEN (SELECT count(*) FROM lead_sla_timers
              WHERE status='pending' AND scheduled_fire_at < now() - interval '1 hour') = 0
        THEN '⚠️ minor lag (<1h)'
      ELSE '🔴 timers stuck >1h — worker not processing' END

  -- 3. How far behind is the oldest stuck timer?
  UNION ALL
  SELECT 3, 'Oldest stuck timer lag',
    COALESCE((SELECT round(extract(epoch FROM (now() - min(scheduled_fire_at)))/60)::text || ' min'
              FROM lead_sla_timers
              WHERE status='pending' AND scheduled_fire_at < now() - interval '10 minutes'),
             'none'),
    CASE WHEN (SELECT count(*) FROM lead_sla_timers
                 WHERE status='pending' AND scheduled_fire_at < now() - interval '10 minutes') = 0
         THEN '✅' ELSE '⚠️ check' END

  -- 4. SLA breach notifications delivered in last 24h (in-app)
  UNION ALL
  SELECT 4, 'SLA breach notifications sent (last 24h)',
    (SELECT count(*)::text FROM notifications
       WHERE type IN ('sla_breach_agent','sla_breach_manager','sla_breach_founder')
         AND created_at >= now() - interval '24 hours'),
    'ℹ️ info'

  -- 5. Task due reminders sent in last 24h (TASK-01A WhatsApp)
  UNION ALL
  SELECT 5, 'Task due reminders sent (last 24h)',
    (SELECT count(*)::text FROM whatsapp_notification_logs
       WHERE type='task_due_reminder' AND created_at >= now() - interval '24 hours'),
    'ℹ️ info'

  -- 6. Daily revival sweep heartbeat (cron runs 07:30 IST)
  UNION ALL
  SELECT 6, 'Revival candidates created (last 24h)',
    (SELECT count(*)::text FROM revival_candidates
       WHERE created_at >= now() - interval '24 hours'),
    'ℹ️ info'

  -- 7. New timers scheduled in last 24h (proves the APP side is arming timers)
  UNION ALL
  SELECT 7, 'New SLA timers scheduled (last 24h)',
    (SELECT count(*)::text FROM lead_sla_timers
       WHERE created_at >= now() - interval '24 hours'),
    'ℹ️ info'
)
SELECT metric, value, status FROM checks ORDER BY ord;
