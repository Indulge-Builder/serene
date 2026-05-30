import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Inbound webhooks (Meta, Pabbly) — no session cookie; must bypass auth refresh. */
const WEBHOOK_PREFIX = "/api/webhooks";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(WEBHOOK_PREFIX)) {
    return NextResponse.next({ request });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets, favicon, and webhook routes.
     * Webhooks are excluded here and via early return so external POSTs never
     * hit Supabase session refresh (no cookie → no spurious auth side effects).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)",
  ],
};
