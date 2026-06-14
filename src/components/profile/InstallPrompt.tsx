"use client";

/**
 * InstallPrompt — the FIRST-INSTALL home-screen-icon picker. This is the surface
 * where the chosen icon actually bakes into the placed shortcut: it pre-selects
 * the icon, rewrites the live <link rel="manifest"> + apple-touch-icon to that
 * choice, THEN triggers the install. After install the icon is OS-owned (the
 * profile picker can't change a placed shortcut — see IconSelector).
 *
 * Two platforms:
 *  - Chromium (Android/desktop): captures `beforeinstallprompt`, shows the card,
 *    swaps the manifest link to the pick, calls deferredPrompt.prompt().
 *  - iOS: no beforeinstallprompt event exists. We can't trigger install, so we
 *    show the same Add-to-Home-Screen nudge as PushNotificationSettings, with
 *    the picker above it — the user picks, we persist + swap the manifest link,
 *    then they install manually with the right icon already wired (failure-mode
 *    #3: iOS reads apple-touch-icon, which we set, not the manifest icon).
 *
 * Renders null when there is nothing to offer (no install event AND not iOS, or
 * already running standalone) — the component is mounted unconditionally and
 * hides itself, the usePushSubscription posture.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Share, PlusSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { updateProfile } from "@/lib/actions/profiles";
import {
  ICON_OPTIONS,
  iconSrc,
  persistAppIconCookie,
  type IconKey,
} from "@/lib/constants/app-icons";

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
 * Point the live manifest link + apple-touch-icon at the chosen icon BEFORE
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

export function InstallPrompt({ profileId }: { profileId: string }) {
  const [platform, setPlatform] = useState<Platform>("loading");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [selected, setSelected] = useState<IconKey>(ICON_OPTIONS[0].id);
  const [isBusy, setIsBusy]     = useState(false);
  const [installed, setInstalled] = useState(false);

  // ── Detect platform + capture the install event ──────────────────────────
  useEffect(() => {
    if (isStandalone()) {
      setPlatform("hidden");
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stash it; we trigger install on the user's pick
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

  // Persist the pick (cookie keeps the next SSR manifest link right; the action
  // writes profiles.app_icon). Fire-and-forget — install proceeds regardless.
  const persistChoice = useCallback(
    (icon: IconKey) => {
      persistAppIconCookie(icon);
      const fd = new FormData();
      fd.append("id", profileId);
      fd.append("app_icon", icon);
      void updateProfile({ data: null, error: null }, fd);
    },
    [profileId],
  );

  function handleSelect(icon: IconKey) {
    setSelected(icon);
    swapInstallIcon(icon); // keep the live links in step as the user browses
  }

  async function handleInstall() {
    if (!deferred) return;
    setIsBusy(true);
    try {
      swapInstallIcon(selected); // ensure the chosen manifest is live first
      persistChoice(selected);
      await deferred.prompt();
      await deferred.userChoice; // resolved either way; appinstalled handles UI
      setDeferred(null);
    } catch {
      // User aborted the OS dialog, or prompt() was already consumed — silent.
    } finally {
      setIsBusy(false);
    }
  }

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
        Pick the icon you want on your home screen, then add Serene. The icon you
        choose now is baked into the shortcut.
      </p>

      {/* Icon tiles — same picker chrome as IconSelector */}
      <div
        role="radiogroup"
        aria-label="Home screen icon"
        style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}
      >
        {ICON_OPTIONS.map((option) => {
          const isActive = selected === option.id;
          return (
            <button
              key={option.id}
              role="radio"
              aria-checked={isActive}
              aria-label={`${option.label} home screen icon`}
              onClick={() => handleSelect(option.id)}
              disabled={isBusy}
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           "var(--space-2)",
                background:    "transparent",
                border:        "none",
                padding:       0,
                cursor:        isBusy ? "wait" : "pointer",
              }}
            >
              <div
                style={{
                  position:      "relative",
                  borderRadius:  "calc(var(--radius-md) + 2px)",
                  padding:       "2px",
                  outline:       isActive
                    ? "2px solid var(--theme-accent)"
                    : "2px solid transparent",
                  outlineOffset: "2px",
                  transition:    "outline-color var(--duration-fast) var(--ease-in-out)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={iconSrc(option.id)}
                  alt=""
                  width={56}
                  height={56}
                  style={{
                    display:      "block",
                    width:        "56px",
                    height:       "56px",
                    borderRadius: "var(--radius-md)",
                    objectFit:    "cover",
                    border:       "1px solid var(--theme-paper-border)",
                  }}
                />
                {isActive && (
                  <div
                    style={{
                      position:       "absolute",
                      top:            "-2px",
                      right:          "-2px",
                      width:          "18px",
                      height:         "18px",
                      borderRadius:   "var(--radius-full)",
                      background:     "var(--theme-accent)",
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      boxShadow:      "0 0 0 2px var(--theme-paper)",
                    }}
                  >
                    <Check
                      style={{
                        width:       "10px",
                        height:      "10px",
                        strokeWidth: 2.5,
                        color:       "var(--theme-accent-fg)",
                      }}
                    />
                  </div>
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-xs)",
                  fontWeight: isActive
                    ? "var(--weight-medium)"
                    : "var(--weight-normal)",
                  color:      isActive
                    ? "var(--theme-text-primary)"
                    : "var(--theme-text-tertiary)",
                }}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

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
