"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { EXIT_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { WidgetProps } from "@/components/dashboard/DashboardWidgetSlot";

export function ManagerColdLeadsWidget({ initialData }: WidgetProps) {
  const count = initialData?.cold_leads_count ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: EXIT_DURATION, ease: EASE_OUT_EXPO }}
      style={{ height: "100%" }}
    >
      <Link
        href="/leads?going_cold=true"
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
          (e.currentTarget as HTMLElement).style.background = "var(--theme-paper-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--theme-paper)";
        }}
      >
        <p
          style={{
            fontFamily:  "var(--font-mono)",
            fontSize:    "var(--text-4xl)",
            fontWeight:  "var(--weight-semibold)",
            lineHeight:  1,
            color:       count > 0 ? "var(--color-warning)" : "var(--theme-text-secondary)",
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
          Going Cold
        </p>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
          }}
        >
          leads with no activity in 5+ days
        </p>
      </Link>
    </motion.div>
  );
}
