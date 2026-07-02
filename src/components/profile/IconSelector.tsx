"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateProfile } from "@/lib/actions/profiles";
import {
  ICON_OPTIONS,
  iconSrc,
  persistAppIconCookie,
  type IconKey,
} from "@/lib/constants/app-icons";

type Props = {
  currentIcon: IconKey;
  profileId:   string;
};

/**
 * IconSelector — the /profile PWA homescreen-icon picker. Structurally mirrors
 * ThemeSelector (radiogroup, the SAME updateProfile action with `app_icon` in
 * the FormData, useTransition pending state, cookie persist) — but shows the
 * actual icon image instead of theme-preview tokens, and is HONEST about reach:
 *
 *   A theme switch repaints the live app instantly. A homescreen icon, once the
 *   PWA is installed, is owned by the OS — we cannot change the placed shortcut.
 *   So saving here persists the choice (so the NEXT install uses it) + updates
 *   the manifest cookie, and surfaces a manual-reinstall note. Never claims the
 *   change is automatic (sign-off contract).
 */
export function IconSelector({ currentIcon, profileId }: Props) {
  const [active, setActive]   = useState<IconKey>(currentIcon);
  const [saved, setSaved]     = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleIconChange(icon: IconKey) {
    if (icon === active) return;

    // Cookie keeps the next SSR manifest link in sync (a fresh install on this
    // device bakes the new pick). The live shell's icon is unaffected.
    setActive(icon);
    setSaved(false);
    persistAppIconCookie(icon);

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id",       profileId);
      fd.append("app_icon", icon);
      await updateProfile({ data: null, error: null }, fd);
      setSaved(true);
    });
  }

  return (
    <div>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-sm)",
          color:      "var(--theme-text-secondary)",
          margin:     "0 0 var(--space-5)",
        }}
      >
        Choose the icon Serene uses when you add it to your home screen. Pick before
        installing — once installed, your device owns the placed icon.
      </p>

      <div
        role="radiogroup"
        aria-label="Home screen icon"
        style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}
      >
        {ICON_OPTIONS.map((option) => {
          const isActive = active === option.id;

          return (
            <button
              key={option.id}
              role="radio"
              aria-checked={isActive}
              aria-label={`${option.label} home screen icon`}
              onClick={() => handleIconChange(option.id)}
              disabled={isPending}
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           "var(--space-2)",
                background:    "transparent",
                border:        "none",
                padding:       0,
                cursor:        isPending ? "wait" : "pointer",
                opacity:       isPending && !isActive ? 0.6 : 1,
              }}
            >
              {/* Accent ring on the active tile — scoped outside any preview */}
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
                { }
                <img
                  src={iconSrc(option.id)}
                  alt=""
                  width={64}
                  height={64}
                  style={{
                    display:      "block",
                    width:        "64px",
                    height:       "64px",
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
                  transition: "color var(--duration-fast) var(--ease-in-out)",
                }}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {isPending && (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            margin:     "var(--space-3) 0 0",
          }}
        >
          Saving preference…
        </p>
      )}

      {/* Honest reach note — the change is NOT automatic on an installed app. */}
      {saved && !isPending && (
        <div
          style={{
            marginTop:    "var(--space-4)",
            padding:      "var(--space-4)",
            borderRadius: "var(--radius-md)",
            border:       "1px solid var(--theme-paper-border)",
            background:   "var(--theme-paper-subtle)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              fontWeight: "var(--weight-medium)",
              color:      "var(--theme-text-primary)",
              margin:     0,
            }}
          >
            Saved. To apply it to an already-installed app:
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-xs)",
              lineHeight: "var(--leading-relaxed)",
              color:      "var(--theme-text-secondary)",
              margin:     "var(--space-2) 0 0",
            }}
          >
            Remove Serene from your home screen, then add it again. The placed icon
            belongs to your device, so it can’t update on its own — your new choice
            is used the next time you install.
          </p>
        </div>
      )}
    </div>
  );
}
