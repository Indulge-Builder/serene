import { formatCount } from "@/lib/utils/numbers";

// OversightStatRow — THE open / overdue / completed count triple used at every
// oversight tier (the shared card grammar). Display-only, server-component-safe.
//
// Why not StatTile variant="cell": that tile renders every value in the accent
// mono tone with no per-cell colour. Oversight needs the OVERDUE count to carry
// a warning tone when > 0 (spotting stuck work is the whole point) — a semantic
// emphasis StatTile deliberately does not express. This is a distinct anatomy
// (a labelled count triple with semantic emphasis), not a StatTile fork (R-01):
// there is no existing component for it. Tokens only; emphasis via colour, never
// a one-edge accent border (V-11).

export function OversightStatRow({
  open,
  overdue,
  completed,
}: {
  open: number;
  overdue: number;
  completed: number;
}) {
  return (
    <div
      className="grid grid-cols-3"
      style={{
        borderTop: "1px solid var(--theme-paper-border)",
        paddingTop: "var(--space-3)",
      }}
    >
      <Cell label="Open" value={open} tone="default" />
      <Cell label="Overdue" value={overdue} tone={overdue > 0 ? "warning" : "muted"} />
      <Cell label="Done" value={completed} tone="muted" />
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "warning" | "muted";
}) {
  const valueColor =
    tone === "warning"
      ? "var(--color-warning)"
      : tone === "muted"
        ? "var(--theme-text-secondary)"
        : "var(--theme-text-primary)";

  return (
    <div className="flex flex-col items-center" style={{ gap: "var(--space-1)" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-medium)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: "var(--leading-none)",
          color: valueColor,
        }}
      >
        {formatCount(value)}
      </span>
      <span
        className="label-micro"
        style={{ color: "var(--theme-text-tertiary)" }}
      >
        {label}
      </span>
    </div>
  );
}
