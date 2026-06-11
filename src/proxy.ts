import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Inbound webhooks (Meta, Pabbly) — no session cookie; must bypass auth refresh. */
const WEBHOOK_PREFIX = "/api/webhooks";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(WEBHOOK_PREFIX)) {
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
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|manifest.webmanifest|sw.js|offline.html|icons/|apple-icon).*)",
  ],
};
