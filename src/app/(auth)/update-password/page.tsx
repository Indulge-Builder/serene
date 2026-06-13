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
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  if (params.error) {
    return <InvalidLinkCard expired />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <InvalidLinkCard />;
  }

  return <UpdatePasswordForm />;
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
