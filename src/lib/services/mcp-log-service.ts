// mcp-log-service.ts — THE mcp_tool_calls writer (migration 0226). SERVER ONLY.
//
// One row per tool call an outside AI app made through the connector. Best effort: a failed
// log never fails the call, but it is loud. Append-only (Rule 08); admin client because the
// call is sessionless (a bearer token, not a cookie), the parity rule.

import { createAdminClient } from '@/lib/supabase/admin';

// 0226's table is not in the generated types until the next regen; one loose handle
// (the elaya-query-service posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };

export type McpToolCallLog = {
  userId: string;
  clientId: string | null;
  tool: string;
  ok: boolean;
  error: string | null;
  durationMs: number;
};

export async function logMcpToolCall(input: McpToolCallLog): Promise<void> {
  const admin = createAdminClient() as unknown as Loose;
  const { error } = await admin.from('mcp_tool_calls').insert({
    user_id: input.userId,
    client_id: input.clientId,
    tool: input.tool,
    ok: input.ok,
    error: input.error ? input.error.slice(0, 400) : null,
    duration_ms: input.durationMs,
  });
  if (error) console.error('[mcp-log-service] tool call log insert failed:', error.message);
}
