"use client";

/**
 * PushNotificationSettings — the per-device Web Push control on /profile
 * (migration 0120). Composes usePushSubscription; display + a gesture-triggered
 * subscribe/unsubscribe button. Four states:
 *
 *   loading           → render nothing (avoids the SSR→client flicker, same as
 *                        the sound toggle which hides until hydrated)
 *   subscribable      → Enable / Disable button (+ a hint if permission denied)
 *   ios-needs-install → the "Add to Home Screen to get alerts" nudge (NOT a fake
 *                        Subscribe button — iOS push only works in the installed PWA)
 *   unsupported       → a quiet one-liner; no control
 *
 * Display-only chrome (tokens, no hardcoded colours). The button click is the
 * required user gesture for the permission prompt.
 */

import { BellRing, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePushSubscription } from "@/hooks/usePushSubscription";

export function PushNotificationSettings() {
  const { support, isSubscribed, permission, isBusy, error, subscribe, unsubscribe } =
    usePushSubscription();

  if (support === "loading") return null;

  // ── iOS, not installed — the install nudge (the real "bell on phone" fix) ──
  if (support === "ios-needs-install") {
    return (
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "var(--space-2)",
          padding:       "var(--space-4)",
          borderRadius:  "var(--radius-md)",
          border:        "1px solid var(--theme-paper-border)",
          background:    "var(--theme-paper-subtle)",
        }}
      >
        <span
          style={{
            fontSize:   "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color:      "var(--theme-text-primary)",
          }}
        >
          Add Serene to your Home Screen to get alerts
        </span>
        <span
          style={{
            display:    "inline-flex",
            alignItems: "center",
            gap:        "var(--space-2)",
            flexWrap:   "wrap",
            fontSize:   "var(--text-xs)",
            lineHeight: "var(--leading-relaxed)",
            color:      "var(--theme-text-secondary)",
          }}
        >
          Tap
          <Share style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} aria-label="Share" />
          then
          <PlusSquare style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} aria-label="Add to Home Screen" />
          <span>“Add to Home Screen.” Open Serene from there and push will be available here.</span>
        </span>
      </div>
    );
  }

  // ── No SW / PushManager / VAPID key ───────────────────────────────────────
  if (support === "unsupported") {
    return (
      <p
        style={{
          fontSize: "var(--text-xs)",
          color:    "var(--theme-text-tertiary)",
          margin:   0,
        }}
      >
        Push notifications aren’t available in this browser.
      </p>
    );
  }

  // ── Subscribable ──────────────────────────────────────────────────────────
  const denied = permission === "denied";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          gap:            "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <span
            style={{
              fontSize:   "var(--text-sm)",
              fontWeight: "var(--weight-medium)",
              color:      "var(--theme-text-primary)",
            }}
          >
            Push on this device
          </span>
          <span
            style={{
              fontSize: "var(--text-xs)",
              color:    "var(--theme-text-secondary)",
            }}
          >
            {isSubscribed
              ? "Alerts reach this device even when Serene is closed."
              : "Get alerts on this device even when Serene is closed."}
          </span>
        </div>

        {isSubscribed ? (
          <Button
            variant="secondary"
            size="sm"
            loading={isBusy}
            onClick={unsubscribe}
          >
            Turn off
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            loading={isBusy}
            disabled={denied}
            iconLeft={BellRing}
            onClick={subscribe}
          >
            Enable
          </Button>
        )}
      </div>

      {denied && !isSubscribed && (
        <p
          style={{
            fontSize: "var(--text-xs)",
            color:    "var(--theme-text-tertiary)",
            margin:   0,
          }}
        >
          Notifications are blocked for Serene. Re-enable them in your browser’s site
          settings, then try again.
        </p>
      )}

      {error && (
        <p
          style={{
            fontSize: "var(--text-xs)",
            color:    "var(--color-danger)",
            margin:   0,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
