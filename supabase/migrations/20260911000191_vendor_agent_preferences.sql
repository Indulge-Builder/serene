-- Migration 0191: vendor_agent_preferences — "Anisha is comfortable with this
-- vendor", kept as a sticky note that the score, the ranker and Elaya all read.
--
-- WHY IT EXISTS
-- The spec's fifth scoring signal is TEAM SENTIMENT — count `preferred` minus
-- count `avoid`, over the teammates who spoke (docs/modules/vendors.md,
-- §Scoring). It was in the reviewer's first brief and in the first draft of
-- 0185, and was removed on 2026-09-07 on a misreading: the founder had not
-- asked for it, but the brief had. Restored here as its own migration rather
-- than an edit to the ledger migration, so the layer the reviewer already read
-- stays what they read.
--
-- WHAT A PREFERENCE DOES
--   1. Score — the rollup at the bottom of this file returns preferred_count /
--      avoid_count per vendor; computeVendorScore turns them into the
--      `sentiment` component (1.0 of the 10 in SCORE_WEIGHTS) plus a reason
--      line. A vendor nobody has marked contributes nothing: the component is
--      dropped and the rest renormalise, never a fake neutral.
--   2. Ranker (the agent layer) — the ASKING agent's own `avoid` removes the
--      vendor from their answer outright; their `preferred` adds PREFERRED_BOOST
--      and a reason. Teammates' marks reach the answer only through the rollup
--      (sentiment in the score, "N teammates avoid" in the flags): one person's
--      discomfort is a caution to the rest of the floor, not a verdict for them.
--   3. Elaya — find_vendors passes the staff principal as the agent, so a
--      genie's own sticky notes shape the suggestion exactly as the page does.
--
-- SHAPE
--   One stance per (vendor, agent) — the upsert key. `note` is the sticky note.
--   Unlike the ledger this is EDITABLE config: a changed mind is an update, not
--   a new row, because it is an opinion about now rather than a record of what
--   happened. CASCADE on both parents — an opinion about a vendor or by a person
--   that no longer exists carries nothing.
--
-- RLS: admin/founder SELECT (the 0183 / 0185 / 0186 audience), NO user write policy —
-- writes go through setAgentPreferenceCore on the admin client behind
-- requireProfile, like every other vendor write (the deals posture).

CREATE TABLE public.vendor_agent_preferences (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid        NOT NULL REFERENCES public.vendors(id)  ON DELETE CASCADE,
  agent_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- "Anisha is comfortable with this vendor" = preferred. The ranker removes an
  -- `avoid` vendor for that agent (and says so), boosts a `preferred` one.
  -- Mirrors PREFERENCE_STANCES in lib/constants/vendors.ts.
  stance      text        NOT NULL CHECK (stance IN ('preferred', 'avoid')),
  -- The sticky note: why. Optional, short, sanitized at the Zod boundary.
  note        text        CHECK (note IS NULL OR length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One stance per (vendor, agent) — the upsert key. Its index also serves the
  -- vendor page's "team takes" read.
  CONSTRAINT vendor_agent_preferences_unique UNIQUE (vendor_id, agent_id)
);

-- The ranker reads ONE agent's marks and filters to the candidates in memory
-- (never `.in(vendor_id, candidates)` — the candidate list can be thousands
-- and would blow the request URI, the same fault that broke the Node ranker).
CREATE INDEX idx_vendor_agent_preferences_agent ON public.vendor_agent_preferences (agent_id);

CREATE TRIGGER vendor_agent_preferences_updated_at
  BEFORE UPDATE ON public.vendor_agent_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.vendor_agent_preferences IS
  'One teammate''s stance on one vendor — preferred / avoid — with an optional note (the sticky note). '
  'EDITABLE, one row per (vendor, agent). Feeds the sentiment score component (rollup below), the ranker''s '
  'agent layer (own avoid = excluded, own preferred = PREFERRED_BOOST) and Elaya''s find_vendors. '
  'Reads admin/founder; writes service-role only via setAgentPreferenceCore.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — admin/founder SELECT only (the 0183 / 0185 / 0186 posture). No user write policy.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendor_agent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_agent_preferences_select_admin ON public.vendor_agent_preferences
  FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_score_inputs — the ONE rollup, now carrying team sentiment.
-- ─────────────────────────────────────────────────────────────────────────────
-- Two columns added to the 0185 rollup: preferred_count / avoid_count. A SQL
-- function's body is validated at CREATE, so the version that reads this table
-- has to be created after it — which is why the rollup is re-declared here and
-- not extended in place in 0185. RETURNS TABLE changed → DROP, not REPLACE.
-- Everything else is the 0185 body verbatim.
DROP FUNCTION IF EXISTS public.get_vendor_score_inputs(uuid[], timestamptz, text, text);

CREATE FUNCTION public.get_vendor_score_inputs(
  p_vendor_ids uuid[],
  p_since      timestamptz,
  p_category   text DEFAULT NULL,
  p_city       text DEFAULT NULL
)
RETURNS TABLE (
  vendor_id         uuid,
  total_used        integer,
  engagement_count  integer,
  category_count    integer,
  city_count        integer,
  completed_count   integer,
  failed_count      integer,
  cancelled_count   integer,
  last_started_at   timestamptz,
  review_count      integer,
  avg_speed         numeric,
  avg_quality       numeric,
  avg_pricing       numeric,
  avg_reliability   numeric,
  preferred_count   integer,
  avoid_count       integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH v AS (
    SELECT DISTINCT unnest(p_vendor_ids) AS id
  ),
  e AS (
    SELECT
      ve.vendor_id,
      -- All-time, ignoring p_since: "times used" as a person counts it. The
      -- windowed engagement_count below is what the SCORE reads; both come from
      -- this one pass so the header number and the score can never disagree.
      count(*)::int                                                             AS total_used,
      count(*) FILTER (WHERE ve.started_at >= p_since)::int                     AS engagement_count,
      count(*) FILTER (WHERE ve.started_at >= p_since AND p_category IS NOT NULL
                         AND ve.category = p_category)::int                     AS category_count,
      count(*) FILTER (WHERE ve.started_at >= p_since AND p_city IS NOT NULL
                         AND lower(ve.city) = lower(p_city))::int               AS city_count,
      count(*) FILTER (WHERE ve.started_at >= p_since AND ve.outcome = 'completed')::int  AS completed_count,
      count(*) FILTER (WHERE ve.started_at >= p_since AND ve.outcome = 'failed')::int     AS failed_count,
      count(*) FILTER (WHERE ve.started_at >= p_since AND ve.outcome = 'cancelled')::int  AS cancelled_count,
      max(ve.started_at)                                                        AS last_started_at
    FROM vendor_engagements ve
    WHERE ve.vendor_id = ANY(p_vendor_ids)
    GROUP BY ve.vendor_id
  ),
  latest_reviews AS (
    -- Latest per (reviewer, engagement); a general review (NULL engagement) is
    -- its own key per reviewer.
    SELECT DISTINCT ON (vr.vendor_id, vr.reviewer_id, COALESCE(vr.engagement_id, '00000000-0000-0000-0000-000000000000'::uuid))
      vr.vendor_id, vr.speed, vr.quality, vr.pricing, vr.reliability
    FROM vendor_reviews vr
    WHERE vr.vendor_id = ANY(p_vendor_ids)
    ORDER BY vr.vendor_id, vr.reviewer_id,
             COALESCE(vr.engagement_id, '00000000-0000-0000-0000-000000000000'::uuid),
             vr.created_at DESC
  ),
  r AS (
    SELECT
      lr.vendor_id,
      count(*)::int                    AS review_count,
      round(avg(lr.speed), 2)          AS avg_speed,
      round(avg(lr.quality), 2)        AS avg_quality,
      round(avg(lr.pricing), 2)        AS avg_pricing,
      round(avg(lr.reliability), 2)    AS avg_reliability
    FROM latest_reviews lr
    GROUP BY lr.vendor_id
  ),
  p AS (
    -- Team sentiment: how many teammates prefer / avoid. One row per (vendor,
    -- agent) by constraint, so a plain count IS the number of people.
    SELECT
      vp.vendor_id,
      count(*) FILTER (WHERE vp.stance = 'preferred')::int AS preferred_count,
      count(*) FILTER (WHERE vp.stance = 'avoid')::int     AS avoid_count
    FROM vendor_agent_preferences vp
    WHERE vp.vendor_id = ANY(p_vendor_ids)
    GROUP BY vp.vendor_id
  )
  SELECT
    v.id,
    COALESCE(e.total_used, 0),
    COALESCE(e.engagement_count, 0),
    COALESCE(e.category_count, 0),
    COALESCE(e.city_count, 0),
    COALESCE(e.completed_count, 0),
    COALESCE(e.failed_count, 0),
    COALESCE(e.cancelled_count, 0),
    e.last_started_at,
    COALESCE(r.review_count, 0),
    r.avg_speed,
    r.avg_quality,
    r.avg_pricing,
    r.avg_reliability,
    COALESCE(p.preferred_count, 0),
    COALESCE(p.avoid_count, 0)
  FROM v
  LEFT JOIN e ON e.vendor_id = v.id
  LEFT JOIN r ON r.vendor_id = v.id
  LEFT JOIN p ON p.vendor_id = v.id;
$$;

-- Q-13 revoked tier, exactly as in 0185.
REVOKE EXECUTE ON FUNCTION public.get_vendor_score_inputs(uuid[], timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_score_inputs(uuid[], timestamptz, text, text)
  TO service_role;

COMMENT ON FUNCTION public.get_vendor_score_inputs(uuid[], timestamptz, text, text) IS
  'One zero-filled row per requested vendor: all-time total_used + windowed engagement volume / category / city / outcome '
  'counts + recency, latest-per-(reviewer, engagement) review averages, and preferred / avoid teammate counts (0191). '
  'Weighting lives in the service (SCORE_WEIGHTS). Q-13 revoked tier — service_role only.';
