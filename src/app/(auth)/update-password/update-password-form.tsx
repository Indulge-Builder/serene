"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";
import { updatePasswordAction, verifyResetOtpAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

// `invited` = the user reached this page already authenticated via the invite
// magic link (session established in /auth/callback). They have no 6-digit code,
// so the OTP step is skipped and they go straight to setting their password; on
// success they are sent into the app. `email` = the password-reset OTP path
// (step 1 verifies the code, step 2 sets the password, success → /login).
export function UpdatePasswordForm({
  email,
  invited = false,
}: {
  email?: string;
  invited?: boolean;
}) {
  // Two steps: (1) enter the 6-digit code from the email → verifyOtp establishes
  // the session; (2) set the new password → updateUser on that session.
  const [verified, setVerified] = useState(false);

  if (invited) {
    return <PasswordStep invited />;
  }

  if (!verified) {
    return <CodeStep email={email!} onVerified={() => setVerified(true)} />;
  }

  return <PasswordStep />;
}

// ─── Step 1: enter the 6-digit code ──────────────────────

function CodeStep({
  email,
  onVerified,
}: {
  email: string;
  onVerified: () => void;
}) {
  const [state, action, isPending] = useActionState(
    async (
      prev: { success: boolean; error: string | null } | null,
      formData: FormData,
    ) => {
      const result = await verifyResetOtpAction(prev, formData);
      if (result.success) onVerified();
      return result;
    },
    null,
  );

  return (
    <AuthCardShell>
      <form action={action} noValidate>
        <input type="hidden" name="email" value={email} />
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
            We sent a 6-digit code to{" "}
            <span style={{ color: "var(--theme-canvas-text)" }}>{email}</span>.
            Enter it below to continue.
          </p>

          {/* Code */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="up-code"
              className="label-micro"
              style={{ color: "var(--theme-sidebar-text)" }}
            >
              Reset Code
            </label>
            <input
              id="up-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              // Supabase Email OTP Length is set to 6 for this project — keep
              // maxLength and verifyResetOtpSchema's regex in lockstep with it.
              maxLength={6}
              placeholder="123456"
              className="serene-input-auth"
              style={{
                letterSpacing: "0.4em",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            />
          </div>

          {state?.error && <ErrorBanner message={state.error} />}

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
            {isPending ? "Verifying…" : "Verify Code"}
          </Button>
        </div>
      </form>

      <div className="flex justify-center mt-6">
        <Link href="/forgot-password" className="serene-auth-link">
          Request a new code
        </Link>
      </div>
    </AuthCardShell>
  );
}

// ─── Step 2: set the new password ────────────────────────

function PasswordStep({ invited = false }: { invited?: boolean }) {
  const [state, action, isPending] = useActionState(updatePasswordAction, null);
  const [showNew, setShowNew] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  return (
    <AuthCardShell>
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
              {invited
                ? "Your password is set and your account is ready. Welcome to Serene."
                : "Your password has been updated. You can now sign in with your new password."}
            </p>
            <Link
              href={invited ? "/dashboard" : "/login"}
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
              {invited ? "Continue to Dashboard" : "Sign In"}
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
                {invited
                  ? "Welcome! Choose a strong password to finish setting up your account."
                  : "Choose a strong new password for your account."}
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

              {state?.error && <ErrorBanner message={state.error} />}

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
    </AuthCardShell>
  );
}

// ─── Shared card shell + chrome ──────────────────────────

function AuthCardShell({ children }: { children: React.ReactNode }) {
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

        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
      {message}
    </p>
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
