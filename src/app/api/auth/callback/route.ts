import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code       = searchParams.get("code");
  const tokenHash  = searchParams.get("token_hash");
  const type       = searchParams.get("type");
  const next       = searchParams.get("next") ?? "/update-password";

  console.log("[auth/callback]", { code: !!code, tokenHash: !!tokenHash, type, url: request.url });

  const supabase = await createClient();

  // token_hash flow — used by password recovery emails (no PKCE cookie required)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as Parameters<typeof supabase.auth.verifyOtp>[0]["type"],
    });
    console.log("[auth/callback] verifyOtp error:", error?.message ?? "none");
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // PKCE code flow — used by magic links opened in the same browser session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    console.log("[auth/callback] exchangeCode error:", error?.message ?? "none");
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Both paths failed — link is expired or already used
  console.log("[auth/callback] both paths failed — redirecting to expired");
  return NextResponse.redirect(`${origin}/update-password?error=link_expired`);
}
