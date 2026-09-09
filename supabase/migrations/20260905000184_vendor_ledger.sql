-- Migration 0184: the vendor LEDGER layer — vendor_engagements (append-only),
-- vendor_reviews (append-only) + the one
-- score-inputs rollup RPC every vendor score reads.
--
-- These hang OFF the 0182 spine and are the tables that CHANGE as agents work
-- with vendors day to day: every job we do with a vendor is one engagement row,
-- every opinion is one review row. Nothing here is ever summarised back onto
-- vendors —
-- the score is COMPUTED per read from these rows (the subscriptions status
-- pattern), so a new review or a failed job moves the ranking immediately.
--
-- Speed / quality / pricing / reliability are MANUALLY ENTERED per review
-- (none of it exists in Freshdesk). The ledger contributes what it can honestly
-- know: volume, recency, and the completed / failed / cancelled outcome mix.
--
-- Numbered 0184, after the 0182 spine + 0183 bucket (0179–0181 are taken and
-- applied on prod; a file reusing a taken version number is silently skipped).
--
-- NOT APPLIED. Runs through the normal deployment process, never directly
-- against production.

-- ─────────────────────────────────────────────────────────────────────────────
-- vendor_engagements — one row per ticket / job we did with a vendor. APPEND-ONLY.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.vendor_engagements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, not CASCADE: a vendor with history is never hard-deleted (mark it
  -- blacklisted); a merge script re-points rows before removing the duplicate.
  vendor_id       uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  -- The human this job was for — what makes the client-vs-vendor match score
  -- possible later. NULL when the Freshdesk contact did not map to a client.
  client_id       uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  -- Gia-side hook for pre-won work. Usually NULL.
  lead_id         uuid        REFERENCES public.leads(id) ON DELETE SET NULL,
  -- The staff member who ran the job (resolved from the Freshdesk agent name
  -- against profiles.full_name at load time) …
  agent_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- … and the name as the source had it, kept when no profile matched
  -- (ex-staff). Never shown as a person, only as history.
  agent_name_raw  text,

  -- The ticket's own subject line. THE discriminator inside a flat category:
  -- "Gifting" alone cannot separate a teddy bear from a bouquet, but
  -- "Teddy bear for daughter's birthday" can. Searched (see the FTS index
  -- below), never shown as an attribute of the vendor.
  title           text,

  -- Same vocabulary as vendor_capabilities (category slug / service / city).
  category        text        NOT NULL,
  service         text,
  city            text,

  -- `ticket` is reserved for the in-app ticketing Sia will bring.
  source          text        NOT NULL
    CHECK (source IN ('freshdesk', 'sia', 'manual', 'ticket')),
  -- Freshdesk ticket id, WhatsApp message id, or the manual row's own id.
  -- UNIQUE with source AND vendor_id — one engagement per VENDOR per ticket.
  -- A single ticket genuinely involves several suppliers (8,915 of the
  -- Freshdesk archive's tickets do; one has 69): a travel request pulls in the
  -- travel desk, the airline and the hotel, and each of those is a real job
  -- with its own outcome. Keying on (source, source_ref) alone would force us
  -- to throw all but one away. Rerunning the loader is still safe — the same
  -- vendor+ticket pair upserts in place (the lead_product_enquiries
  -- external_lead_id idempotency pattern, one key wider).
  source_ref      text        NOT NULL,

  started_at      timestamptz NOT NULL,   -- ticket opened / job requested
  closed_at       timestamptz,            -- job finished; NULL while open
  outcome         text        NOT NULL DEFAULT 'unknown'
    CHECK (outcome IN ('completed', 'cancelled', 'failed', 'unknown')),
  -- What we paid. INR only, never auto-converted (the subscriptions currency rule).
  amount_inr      numeric(12, 2) CHECK (amount_inr IS NULL OR amount_inr >= 0),
  -- Paths in the vendor-invoices bucket (0183), never urls — signed on read.
  invoice_paths   text[]      NOT NULL DEFAULT '{}',
  note            text,

  -- Who logged it (NULL for imports). Distinct from agent_id: a manager can log
  -- a job an agent ran.
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendor_engagements_source_ref_unique UNIQUE (vendor_id, source, source_ref),
  CONSTRAINT vendor_engagements_closed_after_start
    CHECK (closed_at IS NULL OR closed_at >= started_at)
);

-- The score rollup + the dossier's recent-jobs list.
CREATE INDEX idx_vendor_engagements_vendor_started
  ON public.vendor_engagements (vendor_id, started_at DESC);
-- The client-match score (Phase 2) + a client's vendor history.
CREATE INDEX idx_vendor_engagements_client
  ON public.vendor_engagements (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_vendor_engagements_agent
  ON public.vendor_engagements (agent_id) WHERE agent_id IS NOT NULL;
-- "Who have we used for dining in Delhi" straight off the ledger.
CREATE INDEX idx_vendor_engagements_category_city
  ON public.vendor_engagements (category, city);
-- Title search: which vendors served requests that READ like this one. English
-- FTS rather than trigram — we match WORDS ("toy", "bouquet"), not spellings,
-- and to_tsvector stems them. Partial: a row with no title is never a candidate.
CREATE INDEX idx_vendor_engagements_title_fts
  ON public.vendor_engagements USING gin (to_tsvector('english', title))
  WHERE title IS NOT NULL;

COMMENT ON TABLE public.vendor_engagements IS
  'One row per ticket / job done with a vendor — the ledger every vendor score reads. '
  'One ticket may appear under several vendors — the UNIQUE is (vendor_id, source, source_ref). '
  'APPEND-ONLY (Rule 08 / A-11): no user UPDATE or DELETE policy, ever. One sanctioned '
  'service-role carve-out (the revival_candidates resolve-once posture): closeEngagementCore '
  '(services/vendor-mutations.ts) may write closed_at / outcome / amount_inr / invoice_paths / note '
  'on an OPEN row (closed_at IS NULL) exactly once — column restriction is enforced in that core, '
  'RLS cannot restrict columns. Rows from the Freshdesk archive arrive closed and are never touched. '
  'Reads admin/founder; writes service-role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- vendor_reviews — a team member rating one engagement, or the vendor. APPEND-ONLY.
-- ─────────────────────────────────────────────────────────────────────────────
-- Four MANUAL dimensions as smallint columns, not a jsonb bag, so the score is
-- one avg() per dimension. Each nullable — an agent rates what they can judge.
-- The dimension list is REVIEW_DIMENSIONS in lib/constants/vendors.ts; adding
-- one is a column migration. A changed mind is a NEW review; the rollup takes
-- the latest per (reviewer, engagement).
CREATE TABLE public.vendor_reviews (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  -- NULL for a general review of the vendor. The writer copies vendor_id from
  -- the engagement so the two can never disagree (addReviewCore).
  engagement_id  uuid        REFERENCES public.vendor_engagements(id) ON DELETE SET NULL,
  reviewer_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  speed          smallint    CHECK (speed       BETWEEN 1 AND 5),
  quality        smallint    CHECK (quality     BETWEEN 1 AND 5),
  pricing        smallint    CHECK (pricing     BETWEEN 1 AND 5),
  reliability    smallint    CHECK (reliability BETWEEN 1 AND 5),
  comment        text,       -- sanitizeText() before write (Rule 06)

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- An empty review carries no signal and would only dilute review_count.
  CONSTRAINT vendor_reviews_has_signal CHECK (
    speed IS NOT NULL OR quality IS NOT NULL OR pricing IS NOT NULL
    OR reliability IS NOT NULL OR comment IS NOT NULL
  )
);

CREATE INDEX idx_vendor_reviews_vendor_created
  ON public.vendor_reviews (vendor_id, created_at DESC);
CREATE INDEX idx_vendor_reviews_engagement
  ON public.vendor_reviews (engagement_id) WHERE engagement_id IS NOT NULL;

COMMENT ON TABLE public.vendor_reviews IS
  'Manual 1–5 ratings (speed / quality / pricing / reliability, each optional) + comment, per '
  'engagement or general. APPEND-ONLY (A-11): no UPDATE or DELETE, ever — a changed mind is a new '
  'row; the score uses the latest per (reviewer, engagement). Reads admin/founder; writes service-role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — admin/founder SELECT only on all three (the 0182 posture). The two
-- ledgers get NO write policy ever (A-11) — every write is service-role via
-- actions/vendors.ts behind requireProfile().
-- InitPlan-hoisted `(SELECT get_user_role())` per 0088.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendor_engagements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_reviews           ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_engagements_select_admin ON public.vendor_engagements
  FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY vendor_reviews_select_admin ON public.vendor_reviews
  FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_score_inputs — THE one SQL rollup per vendor that every score reads.
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns exactly one row per requested vendor (zero-filled via LEFT JOIN) with
-- the raw signals; the WEIGHTING happens in the service layer (SCORE_WEIGHTS,
-- lib/constants/vendors.ts) so tuning a weight is never a migration.
--   engagements: windowed on p_since (rolling 12 months by default in the
--     service) — volume / per-category / per-city / outcome mix / recency.
--   reviews: all-time, latest per (reviewer, engagement) via DISTINCT ON so a
--     changed mind replaces rather than double-counts; avg per dimension.
-- Takes caller-supplied ids and returns whatever slice it is asked for →
-- Q-13 REVOKED tier: EXECUTE revoked from PUBLIC/anon/authenticated, granted to
-- service_role only; called via callAdminRpc from vendors-service.ts with the
-- gated action / Elaya tool as the trust boundary (the 0102 / 0144 pattern).
CREATE OR REPLACE FUNCTION public.get_vendor_score_inputs(
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
  avg_reliability   numeric
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
    r.avg_reliability
  FROM v
  LEFT JOIN e ON e.vendor_id = v.id
  LEFT JOIN r ON r.vendor_id = v.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vendor_score_inputs(uuid[], timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_score_inputs(uuid[], timestamptz, text, text)
  TO service_role;

COMMENT ON FUNCTION public.get_vendor_score_inputs(uuid[], timestamptz, text, text) IS
  'One zero-filled row per requested vendor: all-time total_used + windowed engagement volume / category / city / outcome '
  'counts + recency, latest-per-(reviewer, engagement) review averages. '
  'Weighting lives in the service (SCORE_WEIGHTS). Q-13 revoked tier — service_role only.';
