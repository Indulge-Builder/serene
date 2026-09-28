import React from "react";
import { X } from "lucide-react";

/**
 * JokerWidget — the card every Jokers dashboard widget sits in (Recommendations & Engagement,
 * Activity): the dashboard-widget paper card with a Playfair italic title and its dot, an optional
 * right-hand action ("See all"), then the body. Display only.
 */
export function JokerWidget({
  title,
  right,
  className,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={className}
      style={{
        borderRadius:  "var(--neu-radius-card)",
        border:        "1px solid var(--theme-paper-border)",
        background:    "var(--theme-paper)",
        boxShadow:     "var(--shadow-1)",
        padding:       "var(--space-5)",
        display:       "flex",
        flexDirection: "column",
        gap:           "var(--space-3)",
        minWidth:      0,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <h2
          style={{
            margin:     0,
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontWeight: "var(--weight-normal)",
            fontSize:   "var(--text-md)",
            lineHeight: 1.25,
            color:      "var(--theme-text-primary)",
            minWidth:   0,
          }}
        >
          {title}
          <span className="page-title-dot">.</span>
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

/**
 * The chart area of a widget: it fills whatever height the card has, so a card beside a taller one
 * grows to match instead of keeping an empty bottom. `minHeight` is the least it gets; the chart
 * inside takes height="100%".
 */
export function WidgetChart({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", flex: 1, minHeight }}>
      <div style={{ position: "absolute", inset: 0 }}>{children}</div>
    </div>
  );
}

type TipEntry = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown; payload?: { fill?: string } };

/** The tooltip box: what was pointed at, then one line per part, dot · name · number, in dark ink.
 *  Empty parts are left out; stacked parts (keys s0, s1 …) keep the legend's order. */
function JokerTooltipBox({ active, payload, label }: { active?: boolean; payload?: TipEntry[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  const order = (e: TipEntry) => Number(/^s(\d+)$/.exec(String(e.dataKey ?? ""))?.[1] ?? 0);
  const rows = payload.filter((e) => e.value !== null && e.value !== undefined && e.value !== 0).sort((a, b) => order(a) - order(b));
  if (!rows.length) return null;
  return (
    <div
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-md)",
        boxShadow:    "var(--shadow-2)",
        padding:      "var(--space-2) var(--space-3)",
        fontSize:     "var(--text-xs)",
        color:        "var(--theme-text-primary)",
        maxWidth:     "18rem",
      }}
    >
      {label !== undefined && label !== "" && (
        <div style={{ color: "var(--theme-text-secondary)", marginBottom: "var(--space-1)", fontWeight: "var(--weight-medium)" }}>{String(label)}</div>
      )}
      {rows.map((e, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", lineHeight: 1.7 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "var(--radius-full)", background: e.color ?? e.payload?.fill }} />
          <span style={{ flex: 1, minWidth: 0 }}>{String(e.name ?? "")}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", paddingLeft: "var(--space-3)" }}>{String(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The Jokers charts' tooltip (owner, 2026-09-28): Recharts paints each line in its series colour,
 * and a pale shade vanished on the tooltip's paper; a custom name is dropped by the default box, so
 * the box is ours. Spread onto a chart's tooltip props.
 */
export const READABLE_TOOLTIP = { content: <JokerTooltipBox /> };

/** What a click on the dashboard opened in the List ("Silent · 31–60 days"), with its clear. */
export function DrillChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          "var(--space-2)",
        height:       "1.875rem",
        padding:      "0 var(--space-1) 0 var(--space-3)",
        borderRadius: "var(--radius-full)",
        background:   "color-mix(in srgb, var(--theme-accent) 12%, var(--theme-paper))",
        color:        "var(--neu-accent-deep)",
        fontSize:     "var(--text-xs)",
        fontWeight:   "var(--weight-medium)",
        maxWidth:     "100%",
      }}
    >
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear: ${label}`}
        style={{
          width: "1.375rem", height: "1.375rem", flexShrink: 0, display: "grid", placeItems: "center", border: 0, cursor: "pointer",
          borderRadius: "var(--radius-full)", background: "color-mix(in srgb, var(--theme-accent) 20%, var(--theme-paper))", color: "inherit",
        }}
      >
        <X style={{ width: 12, height: 12, strokeWidth: 2 }} aria-hidden="true" />
      </button>
    </span>
  );
}

/** The quiet text action in a widget's header ("See all 72"). */
export function WidgetLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        background: "none",
        border:     0,
        padding:    "var(--space-1) 0",
        font:       "inherit",
        fontSize:   "var(--text-xs)",
        fontWeight: "var(--weight-medium)",
        color:      "var(--neu-accent-deep)",
        cursor:     "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
