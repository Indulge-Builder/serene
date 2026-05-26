"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LiaGlyph } from "@/components/ui/lia-glyph";
import { updatePasswordAction } from "@/lib/actions/auth";

export function UpdatePasswordForm() {
  const [state, action, isPending] = useActionState(updatePasswordAction, null);

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
        {/* Lia + wordmark */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <LiaGlyph size={36} style={{ color: "var(--theme-accent)" }} />
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
            <p className="label-micro mt-1" style={{ color: "var(--theme-text-tertiary)" }}>
              Indulge Internal
            </p>
          </div>
        </div>

        {state?.success ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-4 text-center">
            <p
              style={{
                fontSize:   "var(--text-sm)",
                lineHeight: "var(--leading-relaxed)",
                color:      "var(--theme-text-secondary)",
              }}
            >
              Your password has been updated. You can now sign in with your new
              password.
            </p>
            <Link
              href="/login"
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
              Sign In
            </Link>
          </div>
        ) : (
          /* ── Password form ── */
          <form action={action} noValidate>
            <div className="flex flex-col gap-4">
              <p
                style={{
                  fontSize:     "var(--text-sm)",
                  lineHeight:   "var(--leading-relaxed)",
                  color:        "var(--theme-text-secondary)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Choose a strong new password for your account.
              </p>

              {/* New password */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="up-password" className="label-micro">
                  New Password
                </label>
                <input
                  id="up-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  className="eia-input"
                />
              </div>

              {/* Confirm password */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="up-confirm" className="label-micro">
                  Confirm Password
                </label>
                <input
                  id="up-confirm"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="eia-input"
                />
              </div>

              {/* Error */}
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
                  marginTop:       "var(--space-2)",
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
                {isPending ? "Updating…" : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
