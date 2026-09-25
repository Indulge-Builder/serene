// Subscription form layout/help styles. Field appearance belongs to ui/Field.
import type { CSSProperties } from "react";

export const FIELD_LABEL_STYLE: CSSProperties = {
  display: "block",
  marginBottom: "var(--space-2)",
};

export const HELP_TEXT_STYLE: CSSProperties = {
  margin: "var(--space-1) 0 0",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-xs)",
  color: "var(--theme-text-tertiary)",
  lineHeight: "var(--leading-snug)",
};

/** Today as 'YYYY-MM-DD' in local time — the native <input type="date"> shape. */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
