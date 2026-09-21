"use client";

// The consent card: who is asking, as whom, Allow or Deny. Same auth-card chrome as the login
// form (serene-auth-card, the medallion, the serif title); two form posts to one action.

import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { answerOAuthConsentAction } from "@/lib/actions/oauth-consent";
import { Button } from "@/components/ui/Button";
import type { OAuthConsentRequest } from "@/lib/services/oauth-server-service";

export type ConsentFormState =
  | { kind: "consent"; request: OAuthConsentRequest; fullName: string }
  | { kind: "error"; message: string };

export function ConsentForm({ state }: { state: ConsentFormState }) {
  const [result, action, isPending] = useActionState(answerOAuthConsentAction, null);

  return (
    <div className="relative w-full mx-4" style={{ maxWidth: "26rem", zIndex: "var(--z-raised)" }}>
      <div
        className="serene-auth-card px-6 sm:px-8"
        style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-10)" }}
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="serene-auth-logo-medallion">
            <Image src="/logo.webp" alt="Serene" width={48} height={48} priority style={{ borderRadius: "var(--radius-sm)" }} />
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-light)",
              letterSpacing: "var(--tracking-tighter)",
              lineHeight: "var(--leading-tight)",
              color: "var(--neu-text-primary)",
              textAlign: "center",
              margin: 0,
            }}
          >
            {state.kind === "consent" ? "Connect an app" : "Cannot connect"}
            <span className="page-title-dot">.</span>
          </h1>
        </div>

        {state.kind === "error" ? (
          <>
            <p
              style={{
                fontSize: "var(--text-sm)",
                lineHeight: "var(--leading-relaxed)",
                color: "var(--theme-sidebar-text)",
                textAlign: "center",
                margin: 0,
              }}
            >
              {state.message}
            </p>
            <div className="flex justify-center mt-6">
              <Link href="/dashboard" className="serene-auth-link">Back to Serene</Link>
            </div>
          </>
        ) : (
          <>
            <p
              style={{
                fontSize: "var(--text-sm)",
                lineHeight: "var(--leading-relaxed)",
                color: "var(--theme-sidebar-text)",
                textAlign: "center",
                margin: 0,
              }}
            >
              <strong style={{ color: "var(--neu-text-primary)", fontWeight: "var(--weight-semibold)" }}>
                {state.request.client.name}
              </strong>{" "}
              wants to use Serene as{" "}
              <strong style={{ color: "var(--neu-text-primary)", fontWeight: "var(--weight-semibold)" }}>
                {state.fullName}
              </strong>{" "}
              ({state.request.userEmail}).
            </p>

            <ul
              style={{
                margin: "var(--space-6) 0 0",
                padding: "var(--space-4) var(--space-5)",
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                fontSize: "var(--text-xs)",
                lineHeight: "var(--leading-normal)",
                color: "var(--theme-sidebar-text)",
                border: "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <li>It will read only what your role can already see in Serene.</li>
              <li>Phone numbers and emails stay masked. Nothing is changed or sent.</li>
              <li>Every call is logged under your name. You can disconnect it any time from your profile.</li>
            </ul>

            {state.request.client.uri && (
              <p
                style={{
                  marginTop: "var(--space-3)",
                  fontSize: "var(--text-xs)",
                  color: "var(--theme-text-tertiary)",
                  textAlign: "center",
                  wordBreak: "break-all",
                }}
              >
                {state.request.client.uri}
              </p>
            )}

            {result?.error && (
              <p
                role="alert"
                style={{
                  marginTop: "var(--space-4)",
                  fontSize: "var(--text-xs)",
                  lineHeight: "var(--leading-normal)",
                  color: "var(--color-danger-dark-text)",
                  backgroundColor: "var(--color-danger-dark-fill)",
                  border: "1px solid var(--color-danger-dark-border)",
                  borderRadius: "var(--radius-xs)",
                  padding: "var(--space-2) var(--space-3)",
                }}
              >
                {result.error}
              </p>
            )}

            <form action={action} className="flex flex-col gap-3" style={{ marginTop: "var(--space-6)" }}>
              <input type="hidden" name="authorizationId" value={state.request.authorizationId} />
              <Button
                variant="primary"
                type="submit"
                name="decision"
                value="approve"
                disabled={isPending}
                loading={isPending}
                style={{ width: "100%", boxShadow: "var(--shadow-accent-glow)" }}
              >
                Allow
              </Button>
              <Button variant="secondary" type="submit" name="decision" value="deny" disabled={isPending} style={{ width: "100%" }}>
                Deny
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
