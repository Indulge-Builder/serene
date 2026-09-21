import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Inbound webhooks (Meta, Pabbly) — no session cookie; must bypass auth refresh. */
const WEBHOOK_PREFIX = "/api/webhooks";
/** The dynamic per-icon Web App Manifest — PWA surface, fetched outside any
 *  auth context (the browser requests it on install). Same bypass posture as
 *  the static manifest/sw.js/icons. Routing it through session refresh would
 *  silently break installability. */
const MANIFEST_PREFIX = "/api/manifest";
/** The Python brain's write bridge — service-to-service, bearer-authenticated
 *  inside the route (BRAIN_API_SECRET, fail-closed). No session cookie exists
 *  on these calls; the webhook bypass posture applies. */
const BRIDGE_PREFIX = "/api/elaya/bridge";
/** The MCP connector and its OAuth discovery document — an outside AI app
 *  calls with a bearer token, never a cookie; the route verifies it itself
 *  (docs/architecture/mcp-plan.md). Same bypass posture as the bridge. */
const MCP_PREFIX = "/api/mcp";
const WELL_KNOWN_PREFIX = "/.well-known";

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith(WEBHOOK_PREFIX) ||
    request.nextUrl.pathname.startsWith(MANIFEST_PREFIX) ||
    request.nextUrl.pathname.startsWith(BRIDGE_PREFIX) ||
    request.nextUrl.pathname.startsWith(MCP_PREFIX) ||
    request.nextUrl.pathname.startsWith(WELL_KNOWN_PREFIX)
  ) {
    return NextResponse.next({ request });
  }
  const response = await updateSession(request);
  response.headers.set('x-pathname', request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets, favicon, webhook routes, and the
     * PWA surface. Webhooks are excluded here and via early return so external
     * POSTs never hit Supabase session refresh (no cookie → no spurious auth
     * side effects). The PWA files (manifest.webmanifest from app/manifest.ts,
     * sw.js, offline.html, icons/, apple-icon) must be reachable without a
     * session — the browser fetches them outside any auth context, and routing
     * them through session refresh would silently break installability.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/manifest|api/mcp|\\.well-known|manifest.webmanifest|sw.js|offline.html|icons/|apple-icon).*)",
  ],
};
