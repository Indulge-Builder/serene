"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LiaGlyph } from "@/components/ui/lia-glyph";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, isPending] = useActionState(loginAction, null);

  return (
    <div
      className="relative w-full mx-4"
      style={{ maxWidth: "22rem", zIndex: "var(--z-raised)" }}
    >
      {/* Floating paper card */}
      <div
        style={{
          backgroundColor:  "var(--theme-paper)",
          borderRadius:     "var(--radius-xl)",
          padding:          "var(--space-10) var(--space-8)",
          boxShadow:        "var(--shadow-paper)",
        }}
      >
        {/* Lia + wordmark */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <LiaGlyph
            size={36}
            style={{ color: "var(--theme-accent)" }}
          />
          <div className="text-center">
            <h1
              style={{
                fontFamily:    "var(--font-serif)",
                fontSize:      "var(--text-2xl)",
                fontWeight:    "var(--weight-semibold)",
                letterSpacing: "var(--tracking-tight)",
                lineHeight:    "var(--leading-tight)",
                color:         "var(--theme-text-primary)",
              }}
            >
              Eia
            </h1>
            <p
              className="label-micro mt-1"
              style={{ color: "var(--theme-text-tertiary)" }}
            >
              Indulge Internal
            </p>
          </div>
        </div>

        {/* Form */}
        <form action={action} noValidate>
          <div className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-email"
                className="label-micro"
              >
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@indulge.com"
                className="eia-input"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="label-micro"
              >
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="eia-input"
              />
            </div>

            {/* Error message */}
            {state?.error && (
              <p
                role="alert"
                style={{
                  fontSize:        "var(--text-xs)",
                  lineHeight:      "var(--leading-normal)",
                  color:           "var(--color-danger-text)",
                  backgroundColor: "var(--color-danger-light)",
                  borderRadius:    "var(--radius-xs)",
                  padding:         "var(--space-2) var(--space-3)",
                }}
              >
                {state.error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              style={{
                marginTop:     "var(--space-2)",
                backgroundColor: isPending
                  ? "var(--theme-accent-muted)"
                  : "var(--theme-accent)",
                color:         "var(--theme-accent-fg)",
                borderRadius:  "var(--radius-sm)",
                padding:       "var(--space-3) var(--space-4)",
                fontSize:      "var(--text-sm)",
                fontWeight:    "var(--weight-semibold)",
                letterSpacing: "var(--tracking-wide)",
                width:         "100%",
                border:        "none",
                cursor:        isPending ? "not-allowed" : "pointer",
                transition:    "background-color var(--duration-fast) var(--ease-spring)",
              }}
            >
              {isPending ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </form>

        {/* Forgot password */}
        <div className="flex justify-center mt-6">
          <Link
            href="/forgot-password"
            style={{
              fontSize:       "var(--text-xs)",
              color:          "var(--theme-text-tertiary)",
              textDecoration: "none",
              transition:     "color var(--duration-fast) var(--ease-in-out)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color =
                "var(--theme-text-secondary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color =
                "var(--theme-text-tertiary)";
            }}
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  );
}
