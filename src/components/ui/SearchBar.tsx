"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import { FAST_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

export type SearchBarSize = "sm" | "md" | "lg";

/** default — bordered field. soft — borderless at rest (sidebar / embedded lists). */
export type SearchBarVariant = "default" | "soft";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: SearchBarSize;
  variant?: SearchBarVariant;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  "aria-label"?: string;
  /** When true, focus keeps paper border and no focus ring (filter bars). */
  suppressFocusAccent?: boolean;
}

const SIZE_STYLES: Record<
  SearchBarSize,
  { height: string; fontSize: string; iconSize: number; pl: string }
> = {
  sm: {
    height: "2rem",
    fontSize: "var(--text-xs)",
    iconSize: 14,
    pl: "calc(var(--space-2) + 14px + var(--space-2))",
  },
  md: {
    height: "2.25rem",
    fontSize: "var(--text-sm)",
    iconSize: 16,
    pl: "calc(var(--space-2) + 16px + var(--space-2))",
  },
  lg: {
    height: "2.75rem",
    fontSize: "var(--text-base)",
    iconSize: 18,
    pl: "calc(var(--space-3) + 18px + var(--space-3))",
  },
};

export function SearchBar({
  value,
  onChange,
  placeholder = "Search",
  size = "md",
  variant = "default",
  disabled = false,
  className,
  style,
  autoFocus,
  "aria-label": ariaLabel,
  suppressFocusAccent = false,
}: SearchBarProps) {
  const { height, fontSize, iconSize, pl } = SIZE_STYLES[size];
  const [focused, setFocused] = React.useState(false);
  const [clearHovered, setClearHovered] = React.useState(false);

  const borderColor = suppressFocusAccent
    ? variant === "soft"
      ? "transparent"
      : "var(--theme-paper-border)"
    : variant === "soft"
      ? focused
        ? "var(--theme-accent)"
        : "transparent"
      : focused
        ? "var(--theme-accent)"
        : "var(--theme-paper-border)";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        width: "100%",
        ...style,
      }}
    >
      {/* Leading icon */}
      <Search
        style={{
          position: "absolute",
          left: "var(--space-2)",
          top: "50%",
          transform: "translateY(-50%)",
          width: iconSize,
          height: iconSize,
          strokeWidth: 1.5,
          pointerEvents: "none",
          color: "var(--theme-text-tertiary)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />

      <input
        type="text"
        className={
          suppressFocusAccent ? "eia-input eia-input--no-focus-ring" : "eia-input"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          height,
          paddingLeft: pl,
          paddingRight: value
            ? `calc(var(--space-3) + ${iconSize}px + var(--space-3))`
            : "var(--space-3)",
          background: "var(--theme-paper-subtle)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          fontSize,
          color: "var(--theme-text-primary)",
          fontFamily: "var(--font-sans)",
          outline: "none",
          transition: "var(--transition-hover)",
          boxShadow:
            !suppressFocusAccent && focused ? "var(--shadow-focus)" : "none",
          caretColor: "var(--theme-accent)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
      />

      {/* Clear button — anchor is flex-centered; motion scale stays on the button only (§5.10) */}
      <AnimatePresence>
        {value && !disabled && (
          <div
            style={{
              position: "absolute",
              right: "var(--space-3)",
              top: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <motion.button
              type="button"
              onClick={() => onChange("")}
              onMouseEnter={() => setClearHovered(true)}
              onMouseLeave={() => setClearHovered(false)}
              aria-label="Clear search"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              whileTap={{ scale: 0.8 }}
              transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: iconSize + 8,
                height: iconSize + 8,
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-full)",
                cursor: "pointer",
                color: clearHovered
                  ? "var(--theme-text-primary)"
                  : "var(--theme-text-tertiary)",
                transition: "color var(--transition-hover)",
                padding: 0,
                pointerEvents: "auto",
                willChange: "transform",
              }}
            >
              <X
                style={{
                  width: iconSize,
                  height: iconSize,
                  strokeWidth: 1.5,
                  display: "block",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
