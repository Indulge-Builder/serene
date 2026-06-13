"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

export function ForgotPasswordForm() {
  const [state, action, isPending] = useActionState(
    requestPasswordResetAction,
    null,
  );

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
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="serene-auth-logo-medallion">
            <Image
              src="/logo.webp"
              alt="Serene"
              width={48}
              height={48}
              priority
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

        {/* ── Request form ── */}
        <form action={action} noValidate>
          <div className="flex flex-col gap-4">
            <p
              style={{
                fontSize: "var(--text-sm)",
                lineHeight: "var(--leading-relaxed)",
                color: "var(--theme-sidebar-text)",
                marginBottom: "var(--space-2)",
                textAlign: "center",
              }}
            >
              Enter your registered email and we&apos;ll send you a 6-digit reset
              code.
            </p>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fp-email"
                className="label-micro"
                style={{ color: "var(--theme-sidebar-text)" }}
              >
                Email
              </label>
              <input
                id="fp-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@indulge.com"
                className="serene-input-auth"
              />
            </div>

            {/* Error */}
            {state?.error && (
              <p
                role="alert"
                style={{
                  fontSize: "var(--text-xs)",
                  lineHeight: "var(--leading-normal)",
                  color: "var(--color-danger-dark-text)",
                  backgroundColor: "var(--color-danger-dark-fill)",
                  border: "1px solid var(--color-danger-dark-border)",
                  borderRadius: "var(--radius-xs)",
                  padding: "var(--space-2) var(--space-3)",
                }}
              >
                {state.error}
              </p>
            )}

            {/* Submit */}
            <Button
              variant="primary"
              type="submit"
              disabled={isPending}
              loading={isPending}
              style={{
                marginTop: "var(--space-2)",
                width: "100%",
                boxShadow: "var(--shadow-accent-glow)",
              }}
            >
              {isPending ? "Sending…" : "Send Reset Code"}
            </Button>
          </div>
        </form>

        {/* Back to sign in */}
        <div className="flex justify-center mt-6">
          <Link href="/login" className="serene-auth-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
