// BudgetSectionHeader — THE in-page section header for the /budget tabs.
//
// A Playfair serif title for "By Ad Account" / "Recharge History" + an optional
// `meta` slot for the calm right-aligned datum (grand totals).
// Server-component-safe (display-only, no hooks/motion).
//
// Both the Accounts and Recharges tabs compose this — never re-inline a serif
// section heading on /budget again (R-01).

export function BudgetSectionHeader({
  title,
  meta,
}: {
  /** The section name, rendered in the serif title voice. */
  title:   string;
  /** Optional right-aligned supporting datum (e.g. the grand-total line). */
  meta?:   React.ReactNode;
}) {
  return (
    <div
      style={{
        // 3-column track keeps the title truly centred regardless of the meta
        // datum's width (empty left · centred title · meta right).
        display:             "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:          "end",
        gap:                 "var(--space-4)",
      }}
    >
      <span aria-hidden />

      {/* Serif title — centred focal point */}
      <h2
        style={{
          fontFamily:    "var(--font-serif)",
          fontSize:      "var(--text-xl)",
          fontWeight:    "var(--weight-light)",
          letterSpacing: "var(--tracking-tight)",
          color:         "var(--theme-text-primary)",
          margin:        0,
          lineHeight:    "var(--leading-tight)",
          textAlign:     "center",
        }}
      >
        {title}
      </h2>

      <div style={{ justifySelf: "end", minWidth: 0 }}>{meta}</div>
    </div>
  );
}

/**
 * A small stacked datum (micro label over a mono value) for the section
 * header's right `meta` slot — the calm, aligned way to surface one total
 * (e.g. total recharged on the Recharge History header).
 */
export function SectionHeaderDatum({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)" }}>
      <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
        {label}
      </span>
      <span
        style={{
          fontFamily:         "var(--font-mono)",
          fontSize:           "var(--text-base)",
          fontWeight:         "var(--weight-semibold)",
          fontVariantNumeric: "tabular-nums",
          color:              "var(--theme-text-primary)",
          whiteSpace:         "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}
