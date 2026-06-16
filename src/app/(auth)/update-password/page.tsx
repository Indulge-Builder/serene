import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: "Set New Password — Serene",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;

  // Invite flow: the invitee arrives here ALREADY authenticated — /auth/callback
  // exchanged the invite token and set the session before forwarding here. When a
  // live session exists, skip the 6-digit-code step entirely (they have no code to
  // type) and go straight to "choose your password". On success the form logs them
  // into /dashboard — one click from the email button to inside the app.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return <UpdatePasswordForm invited />;
  }

  // OTP-code recovery: the user arrives here WITHOUT a session — they establish
  // it by entering the 6-digit code from their email (step 1 of the form). The
  // email is carried from /forgot-password as a query param so the verifyOtp
  // call has it; if it's missing, the form falls back to asking for the email.
  // The old session-gate (getUser → InvalidLinkCard) is gone: there is no link
  // to expire, so there is no expired-link state on this page anymore.
  if (!params.email) {
    return <MissingEmailCard />;
  }

  return <UpdatePasswordForm email={params.email} />;
}

function MissingEmailCard() {
  return <InvalidLinkCard />;
}

function InvalidLinkCard({ expired = false }: { expired?: boolean }) {
  return (
    <div
      className="relative w-full mx-4"
      style={{ maxWidth: "26rem", zIndex: "var(--z-raised)" }}
    >
      <div
        className="serene-auth-card px-6 sm:px-8"
        style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-10)" }}
      >
        {/* Unified brand header */}
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
            {expired
              ? "This reset link has expired or has already been used. Please request a new one."
              : "This reset link is invalid. Please request a new one."}
          </p>
          <Link
            href="/forgot-password"
            style={{
              marginTop: "var(--space-2)",
              display: "block",
              backgroundColor: "var(--theme-accent)",
              color: "var(--theme-accent-fg)",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-3) var(--space-4)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--tracking-wide)",
              textDecoration: "none",
              textAlign: "center",
              width: "100%",
            }}
          >
            Request New Link
          </Link>
          <Link href="/login" className="serene-auth-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
