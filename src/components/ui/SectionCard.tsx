import React from "react";

export interface SectionCardProps {
  /** Micro-label shown in the card header. Always uppercase, widest tracking. */
  title:        string;
  /** Optional one-line description shown under the title. */
  description?: string;
  /** Optional element rendered on the right side of the header (e.g. status pills). */
  headerRight?: React.ReactNode;
  /** Set `false` to remove the inner body padding when the child owns its own padding (e.g. a `<form>`). Default: `true`. */
  bodyPadding?: boolean;
  children:     React.ReactNode;
}

/** Canonical detail card: porcelain body, tinted satin header, quiet contact edge. */
export function SectionCard({
  title,
  description,
  headerRight,
  bodyPadding = true,
  children,
}: SectionCardProps) {
  return (
    <div
      // Card-role radius (Marshmallow 32) — cards, not fields (--neu-radius-*).
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--neu-radius-card)",
        boxShadow:    "var(--shadow-1)",
        overflow:     "hidden",
      }}
    >
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-4)",
          padding:      "var(--space-4) var(--space-6)",
          background:   "var(--neu-header-surface)",
          boxShadow:    "var(--neu-header-highlight)",
          borderBottom: "1px solid var(--neu-edge)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="label-micro" style={{ margin: 0, color: "var(--neu-header-ink)" }}>
            {title}
          </h2>
          {description && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-xs)",
                color:      "var(--neu-header-description)",
                margin:     "var(--space-1) 0 0",
              }}
            >
              {description}
            </p>
          )}
        </div>
        {headerRight && (
          <div style={{ flexShrink: 0 }}>{headerRight}</div>
        )}
      </div>

      <div style={bodyPadding ? { padding: "var(--space-6)" } : undefined}>
        {children}
      </div>
    </div>
  );
}
