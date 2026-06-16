-- Migration 0136: notifications.type — add 'suggestion_resolved'
--
-- When admin/founder marks a suggestion / bug report resolved (migration 0134),
-- the original sender gets an in-app notification (resolveSuggestionAction →
-- createNotification, type 'suggestion_resolved'). Like lead_initiation /
-- elaya_reply this is a transactional "your report was handled" message — it has
-- NO notification_preferences key (migration 0133) and is never silenceable.
--
-- DROP + re-ADD the CHECK: the full existing value list (migration 0113) MUST be
-- re-stated verbatim plus the new value — omitting any would silently narrow the
-- constraint and break every other notification insert.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'lead_assigned',
      'lead_won',
      'task_due',
      'task_assigned',
      'mention',
      'system',
      'sla_breach_agent',
      'sla_breach_manager',
      'sla_breach_founder',
      'task_overdue_manager',
      'suggestion_resolved'
    ));
