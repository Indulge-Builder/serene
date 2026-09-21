// THE MCP connector vocabulary (docs/architecture/mcp-plan.md).
//
// Serene is a remote MCP server: an outside AI app (Claude, ChatGPT, Cursor, Gemini CLI) logs
// in as a Serene user through the Supabase OAuth server and calls Elaya's read tools as that
// person. Nothing here is a permission: the role comes from public.profiles on every call.

import type { UserRole } from '@/lib/types';

/** The MCP endpoint. Clients are given `${site}${MCP_PATH}`. */
export const MCP_PATH = '/api/mcp';

/** RFC 9728 Protected Resource Metadata, the document that tells a client where to log in. */
export const MCP_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

/** The consent page the Supabase OAuth server sends the browser to (Authentication → OAuth Server → Authorization path). */
export const OAUTH_CONSENT_PATH = '/oauth/consent';

/** Name and version reported to clients at initialize. */
export const MCP_SERVER_INFO = { name: 'serene', version: '1.0.0' } as const;

/** The channel stamped on query and tool logs for calls that came through the connector. */
export const MCP_CHANNEL = 'mcp' as const;

/** Phase 1 audience (plan §8): founder and admin. Phase 3 opens it to the team. */
export const MCP_ROLES: readonly UserRole[] = ['founder', 'admin'];

/** Per-user burst limit on tool calls (plan §7). */
export const MCP_RATE_LIMIT = { windowMs: 60_000, max: 60 } as const;

/** Result allowance per tool call for connector clients (Phase 2). Elaya's own cap is 12,000 for the
 *  WhatsApp brain; Claude and ChatGPT hold far more, so a member 360 or a query no longer gets cut. */
export const MCP_RESULT_MAX_CHARS = 60_000;

/** The resources the connector publishes (Phase 2 §6.2). */
export const MCP_RESOURCE_URIS = {
  catalog: 'serene://catalog',
  pulse: 'serene://pulse',
  vocab: 'serene://vocab',
  member: 'serene://member/{member}',
  ticket: 'serene://ticket/{ticket}',
} as const;
