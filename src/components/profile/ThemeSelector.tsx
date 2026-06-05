"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateProfile } from "@/lib/actions/profiles";
import { Toggle } from "@/components/ui/Toggle";
import { useNotificationSound } from "@/hooks/useNotificationSound";

const THEMES = [
  { key: "earth",  label: "Earth"  },
  { key: "air",    label: "Air"    },
  { key: "water",  label: "Water"  },
  { key: "fire",   label: "Fire"   },
  { key: "cosmos", label: "Cosmos" },
] as const;

type ThemeKey = typeof THEMES[number]["key"];

type Props = {
  currentTheme: ThemeKey;
  profileId:    string;
};

export function ThemeSelector({ currentTheme, profileId }: Props) {
  const [active,    setActive]    = useState<ThemeKey>(currentTheme);
  const [isPending, startTransition] = useTransition();
  const sound = useNotificationSound();

  function handleThemeChange(theme: ThemeKey) {
    if (theme === active) return;

    // 1. Instant DOM switch — zero latency visual feedback.
    document.documentElement.setAttribute("data-theme", theme);
    setActive(theme);

    // 2. Persist to DB in the background via the existing updateProfile action.
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id",    profileId);
      fd.append("theme", theme);
      await updateProfile({ data: null, error: null }, fd);
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
        Choose the visual theme for your Eia workspace. Switches instantly across
        the entire interface.
      </p>

      <div
        role="radiogroup"
        aria-label="Theme"
        style={{
          display:    "flex",
          gap:        "var(--space-3)",
          flexWrap:   "wrap",
        }}
      >
        {THEMES.map((theme) => {
          const isActive = active === theme.key;

          return (
            <button
              key={theme.key}
              role="radio"
              aria-checked={isActive}
              aria-label={`${theme.label} theme`}
              onClick={() => handleThemeChange(theme.key)}
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
              {/*
                The outer ring uses the CURRENT page theme's accent for the
                active border — scoped outside the data-theme preview div.
              */}
              <div
                style={{
                  borderRadius: "calc(var(--radius-md) + 2px)",
                  padding:      "2px",
                  outline:      isActive
                    ? "2px solid var(--theme-accent)"
                    : "2px solid transparent",
                  outlineOffset: "2px",
                  transition:   "outline-color var(--duration-fast) var(--ease-in-out)",
                }}
              >
                {/*
                  data-theme on this div makes all var(--theme-*) inside it
                  resolve to THAT theme's tokens — the preview shows the
                  correct colours without any hardcoded hex values.
                */}
                <div
                  data-theme={theme.key}
                  style={{
                    width:          "72px",
                    height:         "48px",
                    borderRadius:   "var(--radius-md)",
                    background:     "var(--theme-canvas)",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    position:       "relative",
                    overflow:       "hidden",
                  }}
                >
                  {/* Paper surface hint */}
                  <div
                    style={{
                      position:     "absolute",
                      bottom:       0,
                      left:         0,
                      right:        0,
                      height:       "40%",
                      background:   "var(--theme-paper)",
                      borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                      opacity:      0.2,
                    }}
                  />

                  {/* Accent dot */}
                  <div
                    style={{
                      width:        "20px",
                      height:       "20px",
                      borderRadius: "var(--radius-full)",
                      background:   "var(--theme-accent)",
                      boxShadow:    "0 0 10px color-mix(in srgb, var(--theme-accent) 50%, transparent)",
                      zIndex:       1,
                    }}
                  />

                  {/* Active checkmark — uses theme's own accent-fg */}
                  {isActive && (
                    <div
                      style={{
                        position:        "absolute",
                        top:             "4px",
                        right:           "4px",
                        width:           "16px",
                        height:          "16px",
                        borderRadius:    "var(--radius-full)",
                        background:      "var(--theme-accent)",
                        display:         "flex",
                        alignItems:      "center",
                        justifyContent:  "center",
                      }}
                    >
                      <Check
                        style={{
                          width:       "9px",
                          height:      "9px",
                          strokeWidth: 2.5,
                          color:       "var(--theme-accent-fg)",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Theme label */}
              <span
                style={{
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-xs)",
                  fontWeight:  isActive ? "var(--weight-medium)" : "var(--weight-normal)",
                  color:       isActive
                    ? "var(--theme-text-primary)"
                    : "var(--theme-text-tertiary)",
                  transition:  "color var(--duration-fast) var(--ease-in-out)",
                }}
              >
                {theme.label}
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

      {/* Sound toggle — relocated from Notifications card. Hidden until hydrated. */}
      {sound.enabled !== null && (
        <div
          style={{
            marginTop:  "var(--space-5)",
            paddingTop: "var(--space-5)",
            borderTop:  "1px solid var(--theme-paper-border)",
          }}
        >
          <Toggle
            checked={sound.enabled}
            onChange={sound.setEnabled}
            label="Notification sound"
            description="A short chime when new notifications arrive."
          />
        </div>
      )}
    </div>
  );
}
