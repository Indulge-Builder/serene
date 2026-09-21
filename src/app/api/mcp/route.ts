// /api/mcp — THE Serene MCP connector (docs/architecture/mcp-plan.md).
//
// Sanctioned P-02 exception (Decision Log 2026-09-19): MCP is an HTTP protocol (JSON-RPC over
// Streamable HTTP) that outside AI apps speak; a Server Action cannot serve it. Bearer-
// authenticated per request through the Supabase OAuth server's tokens, never a cookie; the
// proxy bypasses session refresh for this path like the webhooks and the bridge.
//
// Gates, in order, before any tool runs:
//   1. bearer token → verified active Serene user (auth.getUser)        → 401 + RFC 9728 challenge
//   2. per-user burst limit (MCP_RATE_LIMIT)                             → 429
//   3. principal = resolveStaffPrincipal(profile): the role-gated toolset (TOOLSET_BY_ROLE)
//   4. every call → executeTool: toolset re-check, Zod, per-record gates, maskPii
// A real user outside the Phase 1 audience gets a server with zero tools and a sentence.

import { withMcpAuth } from 'mcp-handler';
import { verifyMcpBearer, type McpIdentity } from '@/lib/mcp/auth';
import { buildMcpHandler } from '@/lib/mcp/server';
import { siteOrigin } from '@/lib/mcp/metadata';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import { createRateLimiter } from '@/lib/utils/webhook';
import { MCP_RATE_LIMIT, MCP_RESOURCE_METADATA_PATH } from '@/lib/constants/mcp';

// A tool round-trip can be a live pulse or an 8-second analyst query; the same headroom the
// Elaya chat route gets.
export const maxDuration = 60;

const isRateLimited = createRateLimiter(MCP_RATE_LIMIT);

type AuthExtra = { identity: McpIdentity };

const serve = async (request: Request): Promise<Response> => {
  const identity = (request.auth?.extra as AuthExtra | undefined)?.identity;
  if (!identity) return new Response('unauthorized', { status: 401 });

  if (isRateLimited(identity.principal.userId)) {
    return Response.json({ error: 'Too many calls. Wait a minute and try again.' }, { status: 429 });
  }

  const maskingDepth = await getPiiMaskingDepth();
  return buildMcpHandler(identity, maskingDepth, siteOrigin(request))(request);
};

const handler = (request: Request) =>
  withMcpAuth(
    serve,
    async (_request, bearerToken) => {
      if (!bearerToken) return undefined;
      const identity = await verifyMcpBearer(bearerToken);
      if (!identity) return undefined;
      return {
        token: bearerToken,
        clientId: identity.clientId ?? 'unknown',
        scopes: [],
        extra: { identity } satisfies AuthExtra,
      };
    },
    {
      required: true,
      resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
      // The handler treats this as the ORIGIN it prefixes the metadata path with.
      resourceUrl: siteOrigin(request),
    },
  )(request);

export { handler as GET, handler as POST, handler as DELETE };
