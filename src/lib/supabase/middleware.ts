import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  // Session refresh + local JWT check (perf audit A-1 follow-up). getClaims()
  // refreshes an expired session exactly like getUser() did (both go through
  // getSession() internally), but verifies the ES256 signature locally via a
  // process-cached JWKS instead of a ~50–150ms auth-server round trip per
  // request. Falls back to getUser() automatically if keys are ever symmetric.
  // Authorization still happens in the RSC layer (getCurrentProfile → Rule 09).
  await supabase.auth.getClaims();
  return supabaseResponse;
}
