// Shared inline field styles for the Subscriptions modals (token-only, mirrors
// AddRechargeModal's field chrome). Pure constants — no 'use client' needed.
import type { CSSProperties } from "react";

export const FIELD_LABEL_STYLE: CSSProperties = {
  display: "block",
  marginBottom: "var(--space-2)",
};

export const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--neu-input-bg)",
  border: "1px solid var(--neu-input-edge)",
  borderRadius: "var(--neu-radius-control)",
  boxShadow: "var(--neu-shadow-input)",
  minHeight: "2.25rem",
  color: "var(--theme-text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};

export const HELP_TEXT_STYLE: CSSProperties = {
  margin: "var(--space-1) 0 0",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-2xs)",
  color: "var(--theme-text-tertiary)",
  lineHeight: "var(--leading-snug)",
};

export const ERROR_TEXT_STYLE: CSSProperties = {
  margin: "var(--space-1) 0 0",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-xs)",
  color: "var(--color-danger)",
};

/** Today as 'YYYY-MM-DD' in local time — the native <input type="date"> shape. */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
