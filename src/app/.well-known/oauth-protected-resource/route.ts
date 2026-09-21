// /.well-known/oauth-protected-resource — RFC 9728 metadata for the MCP connector (public JSON).
// Part of the /api/mcp P-02 carve-out (Decision Log 2026-09-19); logic in lib/mcp/metadata.ts.

import { metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { resourceMetadata } from '@/lib/mcp/metadata';

export function GET(request: Request) {
  return resourceMetadata(request);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
