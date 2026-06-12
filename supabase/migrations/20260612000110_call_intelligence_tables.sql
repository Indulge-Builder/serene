-- Call Intelligence Phase 1 — service_cases + conversation_hooks
-- (docs/modules/call-intelligence.md §4/§11; spec filename 20260610000086 was
-- already taken by 20260608000086_fix_tasks_status_default — renumbered to 0110.)
--
-- service_cases: the brag library — curated real past deliveries, searched live
-- during calls (helpdesk page loads the full set once; dossier card pulls ≤6).
-- conversation_hooks: category-scoped talking points agents say on calls.
--
-- category is text, NOT an enum — accommodates Shop/House/Legacy vocabularies
-- (same reasoning as leads.service_interests). Tags are freeform text[]; every
-- case carries its city as a lowercase slug tag (powers the dossier city match).
--
-- embedding vector(1536) exists from day 1 (NULL until Phase 2) — adding a
-- vector column to a large table later forces a rewrite. NO HNSW index here;
-- that is the Phase 2 migration, run only once the column is populated.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- array_to_string() is only STABLE (anyarray element casting), so Postgres
-- rejects it inside a GENERATED column. This text[]-only wrapper involves no
-- casting and is safely IMMUTABLE — exists solely for search_vector below.
CREATE OR REPLACE FUNCTION public.immutable_array_to_string(text[], text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN array_to_string($1, $2);

-- ── Table 1: service_cases ──────────────────────────────────────────────────

CREATE TABLE public.service_cases (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Domain scoping (which Gia domain this case belongs to)
  domain         public.app_domain  NOT NULL,

  -- Taxonomy (text, not enum — accommodates Shop/House/Legacy vocabulary)
  category       text        NOT NULL,
  tags           text[]      NOT NULL DEFAULT '{}',

  -- Content (what agents read and say)
  title          text        NOT NULL,
  summary        text        NOT NULL,
  outcome_note   text,

  -- Location display ("Delhi" — the tag carries the searchable slug 'delhi')
  city           text,
  country        text,

  -- Ordering
  is_featured    boolean     NOT NULL DEFAULT false,
  sort_order     int         NOT NULL DEFAULT 0,

  -- Audit
  created_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Full-text search (weighted, generated, stored). Unused in Phase 1
  -- (filtering is client-side) — the GIN index makes the server-side FTS
  -- switch at ~800 cases an action-layer change, not a schema change.
  search_vector  tsvector    GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(city, '') || ' ' || coalesce(country, '')), 'B') ||
    setweight(to_tsvector('english', public.immutable_array_to_string(tags, ' ')), 'C')
  ) STORED,

  -- Phase 2 only — populated by the embeddings pipeline, never in Phase 1
  embedding      extensions.vector(1536)
);

CREATE INDEX idx_service_cases_fts      ON public.service_cases USING GIN(search_vector);
CREATE INDEX idx_service_cases_tags     ON public.service_cases USING GIN(tags);
CREATE INDEX idx_service_cases_category ON public.service_cases(category);
CREATE INDEX idx_service_cases_domain   ON public.service_cases(domain);
CREATE INDEX idx_service_cases_city     ON public.service_cases(lower(city));
CREATE INDEX idx_service_cases_featured ON public.service_cases(is_featured, sort_order);

-- Reuse the shared updated_at maintainer (defined in 20260526000001_profiles.sql)
CREATE TRIGGER trg_service_cases_updated_at
  BEFORE UPDATE ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.service_cases ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the library
CREATE POLICY "service_cases_select" ON public.service_cases
  FOR SELECT TO authenticated USING (true);

-- Only admin and founder write (InitPlan hoist per 0088/0095 convention)
CREATE POLICY "service_cases_insert" ON public.service_cases
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY "service_cases_update" ON public.service_cases
  FOR UPDATE TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY "service_cases_delete" ON public.service_cases
  FOR DELETE TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- ── Table 2: conversation_hooks ─────────────────────────────────────────────

CREATE TABLE public.conversation_hooks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping
  domain          public.app_domain  NOT NULL,
  category        text        NOT NULL,   -- matches service_cases.category values

  -- The hook itself
  hook            text        NOT NULL,   -- the full line the agent can say or paraphrase
  context         text,                   -- when to use this hook (optional guidance)

  -- Ordering
  sort_order      int         NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_hooks_category ON public.conversation_hooks(category);
CREATE INDEX idx_conversation_hooks_domain   ON public.conversation_hooks(domain);

ALTER TABLE public.conversation_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_hooks_select" ON public.conversation_hooks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "conversation_hooks_write" ON public.conversation_hooks
  FOR ALL TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));
