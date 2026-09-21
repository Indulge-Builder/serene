// metadata.ts — THE RFC 9728 Protected Resource Metadata for the connector. SERVER ONLY.
//
// A client that gets a 401 from /api/mcp reads this document to learn which authorization
// server to log in through: the project's Supabase Auth, acting as an OAuth 2.1 server. Public
// by design (the standard needs it) and holding no secret. Served at the bare well-known path
// and at the path-suffix form (/.well-known/oauth-protected-resource/api/mcp), since clients
// differ on which they request.

import { getPublicOrigin, protectedResourceHandler } from 'mcp-handler';
import { MCP_PATH } from '@/lib/constants/mcp';

/** The public origin of this deployment: the configured site URL, else the request's own. */
export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  return configured || getPublicOrigin(request);
}

/** The OAuth issuer: Supabase Auth's `/auth/v1`, whose RFC 8414 metadata lives under the project's well-known path. */
export function oauthIssuer(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  return `${url}/auth/v1`;
}

export function resourceMetadata(request: Request): Response {
  return protectedResourceHandler({
    authServerUrls: [oauthIssuer()],
    resourceUrl: `${siteOrigin(request)}${MCP_PATH}`,
  })(request);
}
