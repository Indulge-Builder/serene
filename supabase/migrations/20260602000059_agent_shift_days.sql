ALTER TABLE public.agent_routing_config
  ADD COLUMN IF NOT EXISTS shift_days integer[] DEFAULT NULL;

COMMENT ON COLUMN public.agent_routing_config.shift_days IS
  'JS day-of-week array (0=Sun…6=Sat). NULL = use global BUSINESS_HOURS.
   Min 1 element when set. Stored and displayed Mon-first (1-6,0) in UI.';
