"use client";

/**
 * InstallPrompt — the install ACTION for the "Add to Home Screen" card. It does
 * NOT pick the icon: the single icon picker lives in IconSelector ("Appearance"
 * card) and is the source of truth (profiles.app_icon, mirrored in the
 * serene-app-icon cookie). This component reads that saved choice and bakes it
 * into the placed shortcut at install time. After install the icon is OS-owned
 * (the profile picker can't change a placed shortcut — see IconSelector).
 *
 * Two platforms:
 *  - Chromium (Android/desktop): captures `beforeinstallprompt`, shows the card,
 *    swaps the live <link rel="manifest"> + apple-touch-icon to the SAVED icon,
 *    then calls deferredPrompt.prompt().
 *  - iOS: no beforeinstallprompt event exists. We can't trigger install, so we
 *    show the Add-to-Home-Screen nudge. The root layout's generateMetadata
 *    already SSR'd apple-touch-icon at the saved icon (failure-mode #3: iOS reads
 *    apple-touch-icon, not the manifest icon), so the manual install is already
 *    wired to the right icon — nothing to swap.
 *
 * Renders null when there is nothing to offer (no install event AND not iOS, or
 * already running standalone) — the component is mounted unconditionally and
 * hides itself, the usePushSubscription posture.
 */

import { useCallback, useEffect, useState } from "react";
import { Share, PlusSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { iconSrc, type IconKey } from "@/lib/constants/app-icons";

/** Chromium's beforeinstallprompt event — not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "loading" | "chromium" | "ios" | "hidden";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iDevice || iPadOs;
}

/**
 * Point the live manifest link + apple-touch-icon at the saved icon BEFORE
 * install fires, so the browser reads the right icon at install time. Mutates
 * the existing <link> tags (creating them if absent) — never duplicates.
 */
function swapInstallIcon(icon: IconKey) {
  if (typeof document === "undefined") return;
  const href = iconSrc(icon);

  let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement("link");
    manifest.rel = "manifest";
    document.head.appendChild(manifest);
  }
  manifest.href = `/api/manifest?icon=${icon}`;

  let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!apple) {
    apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    document.head.appendChild(apple);
  }
  apple.href = href;
}

export function InstallPrompt({
  profileId: _profileId,
  currentIcon,
}: {
  profileId: string;
  currentIcon: IconKey;
}) {
  const [platform, setPlatform] = useState<Platform>("loading");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isBusy, setIsBusy]     = useState(false);
  const [installed, setInstalled] = useState(false);

  // ── Detect platform + capture the install event ──────────────────────────
  useEffect(() => {
    if (isStandalone()) {
      setPlatform("hidden");
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stash it; we trigger install when the user taps Add
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform("chromium");
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — offer the manual nudge instead.
    // (Chromium that already fired sets 'chromium' above and wins.)
    if (isIos()) {
      setPlatform((p) => (p === "loading" ? "ios" : p));
    } else {
      // Non-iOS without the event yet: stay 'loading' → nothing shown until/if
      // the browser deems the app installable and fires the event.
      setPlatform((p) => (p === "loading" ? "hidden" : p));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    setIsBusy(true);
    try {
      // The saved icon (IconSelector / profiles.app_icon) is the source of
      // truth — make the live links match it before the OS reads them. No
      // persist here: the icon was already saved when it was picked.
      swapInstallIcon(currentIcon);
      await deferred.prompt();
      await deferred.userChoice; // resolved either way; appinstalled handles UI
      setDeferred(null);
    } catch {
      // User aborted the OS dialog, or prompt() was already consumed — silent.
    } finally {
      setIsBusy(false);
    }
  }, [deferred, currentIcon]);

  if (platform === "loading" || platform === "hidden") return null;
  if (installed) {
    return (
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-sm)",
          color:      "var(--theme-text-secondary)",
          margin:     0,
        }}
      >
        Serene is on your home screen. Your chosen icon is in place.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-sm)",
          color:      "var(--theme-text-secondary)",
          margin:     0,
        }}
      >
        Add Serene to your home screen. The icon you picked above is baked into
        the shortcut.
      </p>

      {platform === "chromium" && (
        <div>
          <Button
            variant="primary"
            size="sm"
            iconLeft={Download}
            loading={isBusy}
            onClick={handleInstall}
          >
            Add to home screen
          </Button>
        </div>
      )}

      {platform === "ios" && (
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
            Add Serene to your home screen
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
            <span>“Add to Home Screen.” Your chosen icon will be used.</span>
          </span>
        </div>
      )}
    </div>
  );
}
