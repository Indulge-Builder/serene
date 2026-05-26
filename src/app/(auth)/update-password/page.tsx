import type { Metadata } from "next";
import Link from "next/link";
import { LiaGlyph } from "@/components/ui/lia-glyph";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: "Set New Password — Eia",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  // Callback route set this when the code was missing or already used
  if (params.error) {
    return <InvalidLinkCard expired />;
  }

  // Session must have been established by /api/auth/callback
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <InvalidLinkCard />;
  }

  return <UpdatePasswordForm />;
}

function InvalidLinkCard({ expired = false }: { expired?: boolean }) {
  return (
    <div
      className="relative w-full mx-4"
      style={{ maxWidth: "22rem", zIndex: "var(--z-raised)" }}
    >
      <div
        style={{
          backgroundColor: "var(--theme-paper)",
          borderRadius:    "var(--radius-xl)",
          padding:         "var(--space-10) var(--space-8)",
          boxShadow:       "var(--shadow-paper)",
        }}
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <LiaGlyph size={36} breathing={false} style={{ color: "var(--theme-accent)" }} />
          <h1
            style={{
              fontFamily:    "var(--font-serif)",
              fontSize:      "var(--text-2xl)",
              fontWeight:    "var(--weight-semibold)",
              letterSpacing: "var(--tracking-tight)",
              lineHeight:    "var(--leading-tight)",
              color:         "var(--theme-text-primary)",
              textAlign:     "center",
            }}
          >
            Eia
          </h1>
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          <p
            style={{
              fontSize:   "var(--text-sm)",
              lineHeight: "var(--leading-relaxed)",
              color:      "var(--theme-text-secondary)",
            }}
          >
            {expired
              ? "This reset link has expired or has already been used. Please request a new one."
              : "This reset link is invalid. Please request a new one."}
          </p>
          <Link
            href="/forgot-password"
            style={{
              marginTop:       "var(--space-2)",
              display:         "block",
              backgroundColor: "var(--theme-accent)",
              color:           "var(--theme-accent-fg)",
              borderRadius:    "var(--radius-sm)",
              padding:         "var(--space-3) var(--space-4)",
              fontSize:        "var(--text-sm)",
              fontWeight:      "var(--weight-semibold)",
              letterSpacing:   "var(--tracking-wide)",
              textDecoration:  "none",
              textAlign:       "center",
              width:           "100%",
            }}
          >
            Request New Link
          </Link>
          <Link
            href="/login"
            style={{
              fontSize:       "var(--text-xs)",
              color:          "var(--theme-text-tertiary)",
              textDecoration: "none",
            }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
