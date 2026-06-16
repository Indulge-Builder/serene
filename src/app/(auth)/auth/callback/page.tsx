import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallbackClient } from "./callback-client";

export const metadata: Metadata = {
  title: "Signing you in — Serene",
};

// THE auth-link landing page (invite magic links, and any flow whose link returns
// to /auth/callback). Lives inside the (auth) route group so it inherits the canvas
// shell, but the group is URL-transparent — this serves /auth/callback.
//
// This is a CLIENT page on purpose: Supabase's implicit grant returns the session in
// the URL HASH fragment (#access_token=…&type=invite), which the browser never sends
// to the server — so a route handler / RSC literally cannot see it. Only client JS can
// read window.location.hash. The browser Supabase client (createBrowserClient,
// detectSessionInUrl: true) consumes the hash on mount and persists the session; for
// the PKCE (?code=) and OTP (?token_hash=) variants we exchange explicitly. Either way
// we forward to `next` once the session is live.
//
// The legacy server route at /api/auth/callback stays for backward compatibility.
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackPending />}>
      <AuthCallbackClient />
    </Suspense>
  );
}

function CallbackPending() {
  return (
    <p
      style={{
        fontSize: "var(--text-sm)",
        color: "var(--theme-sidebar-text)",
        zIndex: "var(--z-raised)",
      }}
    >
      Signing you in…
    </p>
  );
}
