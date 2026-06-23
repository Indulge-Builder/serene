"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { EXIT_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import { useWidgetDensityTier } from "@/hooks/useWidgetDensity";

/**
 * THE dashboard snapshot-count card (R-01) — one big live count, a label, a
 * hint line, the whole card a Link. Composed by ManagerColdLeadsWidget,
 * AgentPendingCallsWidget, and AgentNewLeadsWidget.
 *
 * Snapshot counts are LIVE pipeline states: they are seeded from the summary
 * RPC only — no fetch, no refresh button, and the global date filter never
 * applies. Display-only by design.
 *
 * Density-adaptive (v4): when the cell is small (`compact`) the hint line is
 * dropped and the number scales down to fit; at `rich` the number scales up and
 * everything breathes. The tier comes from the slot's ResizeObserver — the
 * widget just reads it.
 */
export function SnapshotCountWidget({
  count,
  label,
  hint,
  href,
  positiveColor,
}: {
  count: number;
  label: string;
  hint: string;
  href: string;
  /** Count colour when count > 0; zero always renders --theme-text-secondary. */
  positiveColor: string;
}) {
  const tier = useWidgetDensityTier();
  // The number's scale follows the tier; the hint hides when compact.
  const countSize =
    tier === "rich" ? "var(--text-3xl)" : tier === "compact" ? "var(--text-xl)" : "var(--text-2xl)";
  const showHint = tier !== "compact";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: EXIT_DURATION, ease: EASE_OUT_EXPO }}
      style={{ height: "100%" }}
    >
      <Link
        href={href}
        style={{
          display:        "flex",
          flexDirection:  "column",
          justifyContent: "center",
          height:         "100%",
          padding:        "var(--space-6)",
          background:     "var(--theme-paper)",
          border:         "1px solid var(--theme-paper-border)",
          borderRadius:   "var(--radius-lg)",
          boxShadow:      "var(--shadow-1)",
          textDecoration: "none",
          transition:     "background var(--duration-fast) var(--ease-in-out)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--theme-paper-subtle)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--theme-paper)";
        }}
      >
        <p
          style={{
            fontFamily:  "var(--font-mono)",
            fontSize:    countSize,
            fontWeight:  "var(--weight-semibold)",
            lineHeight:  1,
            color:       count > 0 ? positiveColor : "var(--theme-text-secondary)",
            marginBottom: "var(--space-3)",
            transition:  "color var(--duration-fast) var(--ease-in-out), font-size var(--duration-base) var(--ease-out-expo)",
          }}
        >
          {count}
        </p>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-base)",
            fontWeight: "var(--weight-semibold)",
            color:      "var(--theme-text-primary)",
            marginBottom: "var(--space-1)",
          }}
        >
          {label}
        </p>

        {showHint && (
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-xs)",
              color:      "var(--theme-text-tertiary)",
            }}
          >
            {hint}
          </p>
        )}
      </Link>
    </motion.div>
  );
}
