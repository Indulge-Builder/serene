import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export interface BackButtonProps {
  /** Destination href — must be a relative route. */
  href:    string;
  /** Accessible label describing the destination, e.g. "Back to Team". */
  label:   string;
}

/**
 * BackButton — circular 36×36 icon-only back link used on detail pages.
 *
 * Lives to the left of the page `<h1>` with `gap: var(--space-4)`.
 * Paper background, paper-border, `--shadow-1`, `--radius-full`.
 *
 * Used on every detail page in Eia (single-record dossiers, edit views).
 * Never reimplement this chrome inline.
 */
export function BackButton({ href, label }: BackButtonProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          36,
        height:         36,
        flexShrink:     0,
        background:     "var(--theme-paper)",
        border:         "1px solid var(--theme-paper-border)",
        borderRadius:   "var(--radius-full)",
        color:          "var(--theme-text-secondary)",
        textDecoration: "none",
        transition:     "var(--transition-interactive)",
        boxShadow:      "var(--shadow-1)",
      }}
    >
      <ArrowLeft style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
    </Link>
  );
}
