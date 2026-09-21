// /.well-known/oauth-protected-resource/api/mcp — the RFC 9728 path-suffix form of the same
// document (some clients request it this way). Same public JSON as the bare well-known route.

import { metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { resourceMetadata } from '@/lib/mcp/metadata';

export function GET(request: Request) {
  return resourceMetadata(request);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
