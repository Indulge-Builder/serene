-- Migration 0233: who may use the MCP connector, as a switch (docs/architecture/mcp-plan.md, Phase 3).
--
-- Phase 1 hard-coded the audience (founder, admin). Phase 3 opens the connector to the team, and
-- the founder wanted to open or close it per role without a deploy. The row holds a JSON list of
-- roles; the reader (getMcpAudience in llm-providers-service) keeps only known roles and falls back
-- to founder + admin when the row is missing or malformed (fails to the smaller set).
-- Seeded OPEN to everyone but guests, at the founder's request on 2026-09-21.
--   UPDATE elaya_settings SET value = '["founder","admin","manager"]' WHERE key = 'mcp_audience';
-- No schema change, no RLS change (0116's policies stand: admin/founder read, service-role write).

INSERT INTO elaya_settings (key, value)
VALUES ('mcp_audience', '["founder","admin","manager","agent"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
