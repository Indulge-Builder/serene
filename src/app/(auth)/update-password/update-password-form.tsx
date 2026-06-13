"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";
import { updatePasswordAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

export function UpdatePasswordForm() {
  const [state, action, isPending] = useActionState(updatePasswordAction, null);
  const [showNew, setShowNew] = useState(false);
  const [newPassword, setNewPassword] = useState("");

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
              alt="Indulge"
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
            Indulge OS<span className="page-title-dot">.</span>
          </h1>
        </div>

        {state?.success ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-4 text-center">
            <p
              style={{
                fontSize: "var(--text-sm)",
                lineHeight: "var(--leading-relaxed)",
                color: "var(--theme-sidebar-text)",
              }}
            >
              Your password has been updated. You can now sign in with your new
              password.
            </p>
            <Link
              href="/login"
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
              Sign In
            </Link>
          </div>
        ) : (
          /* ── Password form ── */
          <form action={action} noValidate>
            <div className="flex flex-col gap-4">
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  lineHeight: "var(--leading-relaxed)",
                  color: "var(--theme-sidebar-text)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Choose a strong new password for your account.
              </p>

              {/* New password + strength bar */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="up-password"
                  className="label-micro"
                  style={{ color: "var(--theme-sidebar-text)" }}
                >
                  New Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="up-password"
                    name="password"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    className="serene-input-auth"
                    style={{ paddingRight: "var(--space-10)" }}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <EyeToggle
                    show={showNew}
                    onToggle={() => setShowNew((v) => !v)}
                  />
                </div>
                <PasswordStrengthBar password={newPassword} />
              </div>

              {/* Confirm password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="up-confirm"
                  className="label-micro"
                  style={{ color: "var(--theme-sidebar-text)" }}
                >
                  Confirm Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="up-confirm"
                    name="confirmPassword"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    className="serene-input-auth"
                    style={{ paddingRight: "var(--space-10)" }}
                  />
                  <EyeToggle
                    show={showNew}
                    onToggle={() => setShowNew((v) => !v)}
                  />
                </div>
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
                {isPending ? "Updating…" : "Update Password"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── EyeToggle ────────────────────────────────────────

function EyeToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
      tabIndex={-1}
      style={{
        position: "absolute",
        right: "var(--space-3)",
        top: "50%",
        transform: "translateY(-50%)",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "var(--theme-sidebar-text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {show ? (
        <EyeOff style={{ width: "15px", height: "15px", strokeWidth: 1.5 }} />
      ) : (
        <Eye style={{ width: "15px", height: "15px", strokeWidth: 1.5 }} />
      )}
    </button>
  );
}
