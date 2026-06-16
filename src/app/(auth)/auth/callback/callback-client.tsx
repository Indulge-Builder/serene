"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "working" | "error";

// Robust to BOTH auth flows:
//   • Implicit grant → session arrives in the URL HASH (#access_token=…). The
//     browser client (detectSessionInUrl: true) consumes it automatically on
//     mount; we just wait for the session to appear, then forward.
//   • PKCE (?code=) → exchangeCodeForSession.
//   • OTP / recovery (?token_hash=&type=) → verifyOtp.
// The `next` query param is the in-app destination (default /update-password).
// We only ever forward to a same-origin relative path — never an arbitrary URL.
export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("working");
  const ran = useRef(false);

  useEffect(() => {
    // React Strict Mode double-invokes effects in dev; the token is one-time, so
    // guard against a second exchange that would fail on an already-spent code.
    if (ran.current) return;
    ran.current = true;

    const supabase = createClient();

    // Sanitize `next`: must be a relative in-app path, never an external URL.
    const rawNext = searchParams.get("next") ?? "/update-password";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/update-password";

    async function run() {
      // An error can ride back in the query OR the hash fragment.
      const hash = new URLSearchParams(
        typeof window !== "undefined" ? window.location.hash.slice(1) : "",
      );
      const errorCode =
        searchParams.get("error") ??
        searchParams.get("error_code") ??
        hash.get("error") ??
        hash.get("error_code");
      if (errorCode) {
        setPhase("error");
        return;
      }

      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const hasHashToken = hash.has("access_token");

      try {
        if (hasHashToken) {
          // Implicit flow: createBrowserClient parses the hash on init, but that
          // is async — poll briefly for the persisted session before forwarding.
          const ok = await waitForSession(supabase);
          if (!ok) {
            setPhase("error");
            return;
          }
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setPhase("error");
            return;
          }
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as Parameters<typeof supabase.auth.verifyOtp>[0]["type"],
          });
          if (error) {
            setPhase("error");
            return;
          }
        } else {
          // No recognisable credential in either the query or the hash.
          setPhase("error");
          return;
        }

        // Strip the token from the address bar (history) before forwarding, so a
        // back-navigation never re-lands on a spent token, then go to `next`.
        router.replace(next);
      } catch {
        setPhase("error");
      }
    }

    void run();
  }, [router, searchParams]);

  if (phase === "error") {
    return <InvalidLinkCard />;
  }

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

// Poll for the session the browser client establishes from the URL hash. It is
// set synchronously-ish on init but we don't control the exact tick, so retry a
// few times over ~2s before giving up.
async function waitForSession(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// Same brand chrome as /update-password's InvalidLinkCard, kept local (this page
// is outside that file). Invite links that expire / are pre-fetched by an inbox
// link-scanner land here.
function InvalidLinkCard() {
  return (
    <div
      className="relative w-full mx-4"
      style={{ maxWidth: "26rem", zIndex: "var(--z-raised)" }}
    >
      <div
        className="serene-auth-card px-6 sm:px-8"
        style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-10)" }}
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="serene-auth-logo-medallion">
            <Image
              src="/logo.webp"
              alt="Serene"
              width={48}
              height={48}
              style={{ borderRadius: "var(--radius-sm)" }}
            />
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--text-3xl)",
              fontWeight: "var(--weight-light)",
              letterSpacing: "var(--tracking-tighter)",
              lineHeight: "var(--leading-tight)",
              color: "var(--theme-canvas-text)",
              textAlign: "center",
              margin: 0,
            }}
          >
            Serene<span className="page-title-dot">.</span>
          </h1>
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          <p
            style={{
              fontSize: "var(--text-sm)",
              lineHeight: "var(--leading-relaxed)",
              color: "var(--theme-sidebar-text)",
            }}
          >
            This link is invalid or has expired. Please ask your administrator to
            send a fresh invitation.
          </p>
          <Link href="/login" className="serene-auth-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
