-- 0226: the MCP connector's call log (docs/architecture/mcp-plan.md, Phase 1).
--
-- Serene is an MCP server at /api/mcp: an outside AI app (Claude, ChatGPT, Cursor) logs in as a
-- Serene user through the Supabase OAuth server and calls Elaya's read tools as that person.
-- Every such call lands here: who, which app, which tool, did it work, how long. Append-only
-- (Rule 08): the service role writes, nobody updates or deletes. The owner reads their own rows,
-- admin and founder read everyone's. The SQL an outside app runs through query_database is
-- ALSO in elaya_query_log with channel 'mcp' (0223); this table is the tool-level ledger.

CREATE TABLE public.mcp_tool_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id),
  client_id   text,
  tool        text NOT NULL,
  ok          boolean NOT NULL,
  error       text,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_tool_calls_user_time ON public.mcp_tool_calls (user_id, created_at DESC);

ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

-- Read: your own calls, or all of them for admin and founder. No INSERT / UPDATE / DELETE
-- policy on purpose: the service role writes; the ledger is never edited.
CREATE POLICY mcp_tool_calls_select ON public.mcp_tool_calls
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR get_user_role() IN ('admin', 'founder'));

COMMENT ON TABLE public.mcp_tool_calls IS
  'Append-only: every tool call an outside AI app made through the Serene MCP connector, as the user who logged in.';

NOTIFY pgrst, 'reload schema';
