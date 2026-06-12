"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { EXIT_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

/**
 * THE dashboard snapshot-count card (R-01) — one big live count, a label, a
 * hint line, the whole card a Link. Composed by ManagerColdLeadsWidget,
 * AgentPendingCallsWidget, and AgentNewLeadsWidget.
 *
 * Snapshot counts are LIVE pipeline states: they are seeded from the summary
 * RPC only — no fetch, no refresh button, and the global date filter never
 * applies. Display-only by design.
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
            fontSize:    "var(--text-3xl)",
            fontWeight:  "var(--weight-semibold)",
            lineHeight:  1,
            color:       count > 0 ? positiveColor : "var(--theme-text-secondary)",
            marginBottom: "var(--space-3)",
            transition:  "color var(--duration-fast) var(--ease-in-out)",
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

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
          }}
        >
          {hint}
        </p>
      </Link>
    </motion.div>
  );
}
