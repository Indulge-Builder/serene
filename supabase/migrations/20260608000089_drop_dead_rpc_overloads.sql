-- Drop old 4-param get_dashboard_summary (no date params):
DROP FUNCTION IF EXISTS public.get_dashboard_summary(
  text, public.app_domain, uuid, public.app_domain
);

-- Drop old 2-param get_campaign_pipeline_refresh (no date params):
DROP FUNCTION IF EXISTS public.get_campaign_pipeline_refresh(
  text, public.app_domain
);
