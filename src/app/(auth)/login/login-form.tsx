"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { loginAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const [state, action, isPending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className="relative w-full mx-4"
      style={{ maxWidth: "26rem", zIndex: "var(--z-raised)" }}
    >
      <div
        className="eia-auth-card"
        style={{ padding: "var(--space-10) var(--space-8)" }}
      >
        {/* Unified brand header */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <Image
            src="/logo.webp"
            alt="Indulge"
            width={48}
            height={48}
            priority
            style={{ borderRadius: "var(--radius-sm)" }}
          />
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

        {/* Form */}
        <form action={action} noValidate>
          <div className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-email"
                className="label-micro"
                style={{ color: "var(--theme-sidebar-text)" }}
              >
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@indulge.com"
                className="eia-input-auth"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="label-micro"
                style={{ color: "var(--theme-sidebar-text)" }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="eia-input-auth"
                  style={{ paddingRight: "var(--space-10)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
                  {showPassword ? (
                    <EyeOff
                      style={{
                        width: "15px",
                        height: "15px",
                        strokeWidth: 1.5,
                      }}
                    />
                  ) : (
                    <Eye
                      style={{
                        width: "15px",
                        height: "15px",
                        strokeWidth: 1.5,
                      }}
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
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
              {isPending ? "Signing in…" : "Sign In"}
            </Button>
          </div>
        </form>

        {/* Forgot password */}
        <div className="flex justify-center mt-6">
          <Link href="/forgot-password" className="eia-auth-link">
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  );
}
