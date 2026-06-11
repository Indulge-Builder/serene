-- Migration 0102 (security audit F-1): revoke client EXECUTE on scope-param RPCs.
--
-- A class of SECURITY DEFINER read RPCs either trusts caller-supplied scope
-- params (p_role / p_domain / p_user_id — audit Class C) or has no internal
-- role/domain gate at all (audit Class B). All were GRANTed to `authenticated`,
-- so any logged-in user could call them DIRECTLY from the browser via
-- supabase.rpc(...) with forged scope and read cross-domain aggregates —
-- bypassing the action layer entirely (Q-13 violation; full classification in
-- docs/audits/security-audit-2026-06.md §2).
--
-- Fix (audit Option A — mirrors get_next_round_robin_agent, migration 0007,
-- and get_active_lead_by_phone, migration 0008): EXECUTE is revoked from the
-- client roles; the service layer now invokes every one of these through the
-- service-role admin client, after the calling page/action has resolved the
-- scope args from the SESSION (getCurrentProfile() / requireProfile() — the
-- trust boundary). Grep-confirmed before this migration: no 'use client'
-- component calls any of these RPCs; all 10 call sites live in lib/services/.
--
--   get_dashboard_summary            → dashboard-service.ts getDashboardSummary
--   get_agent_recent_activity        → dashboard-service.ts getAgentRecentActivity
--   get_lead_pipeline_refresh        → dashboard-service.ts getLeadStatusSummary
--   get_campaign_pipeline_refresh    → dashboard-service.ts getLeadsByCampaign
--   get_deals_summary                → deals-service.ts getDealsSummary
--   get_gia_tasks                    → tasks-service.ts getGiaTasksForUser
--   get_campaign_metrics             → leads-service.ts fetchCampaignMetricsFromRpc
--   get_campaign_detail_metrics      → leads-service.ts getCampaignDetailMetrics
--   get_campaign_agent_distribution  → leads-service.ts getCampaignAgentDistribution
--   get_domain_health_metrics        → performance-service.ts getDomainHealthMetrics
--
-- NOT touched (self-enforcing — they derive scope from auth.uid() /
-- get_user_role() / get_user_domain() internally and stay client-callable):
-- get_leads_status_counts, can_access_wa_conversation, get_group_task_summaries,
-- get_wa_unread_count, get_personal_tasks, get_agent_performance,
-- get_agent_roster_performance.
--
-- The 2-param get_lead_pipeline_refresh is a dead overload (superseded by the
-- 4-param version in 0069; 0089 missed it) — revoked here as well.

-- ── Class C — trust caller-supplied p_role / p_domain / p_user_id ────────────

REVOKE EXECUTE ON FUNCTION public.get_agent_recent_activity(text, public.app_domain, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_lead_pipeline_refresh(text, public.app_domain)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_lead_pipeline_refresh(text, public.app_domain, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_campaign_pipeline_refresh(text, public.app_domain, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_deals_summary(text, text, text, uuid, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_gia_tasks(uuid, text, public.app_domain)
  FROM PUBLIC, anon, authenticated;

-- ── Class B — no scope param, but no internal role/domain gate either ────────

REVOKE EXECUTE ON FUNCTION public.get_campaign_metrics(public.app_domain, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_campaign_detail_metrics(text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_campaign_agent_distribution(text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_domain_health_metrics(public.app_domain[], timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ── Service-role access, explicit ─────────────────────────────────────────────
-- Supabase default privileges already grant EXECUTE to service_role; the
-- explicit GRANTs keep this migration self-sufficient if defaults ever change.

GRANT EXECUTE ON FUNCTION public.get_agent_recent_activity(text, public.app_domain, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_lead_pipeline_refresh(text, public.app_domain) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_lead_pipeline_refresh(text, public.app_domain, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_pipeline_refresh(text, public.app_domain, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_deals_summary(text, text, text, uuid, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_gia_tasks(uuid, text, public.app_domain) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_metrics(public.app_domain, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_detail_metrics(text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_agent_distribution(text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_domain_health_metrics(public.app_domain[], timestamptz, timestamptz) TO service_role;
