"use client";

import { useState } from "react";
import { m as motion } from "framer-motion";
import { ElayaGlyph } from "@/components/ui/elaya-glyph";
import { MessageBar } from "@/components/ui/MessageBar";
import { getElayaTimeGreeting, pickElayaDailyLine } from "@/lib/constants/elaya";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { WidgetProps } from "../DashboardWidgetSlot";

/**
 * Elaya presence card — the reserved home for the future Elaya layer.
 * Ships as a shell: breathing glyph (a static glyph = not present — never
 * pass breathing={false} here), IST time-of-day greeting, one curated line
 * per agent per day (deterministic, zero AI calls on login), and a stubbed
 * MessageBar. No three.js / 3D — that arrives lazy-loaded post-Elaya-ship.
 */
export function ElayaPresenceCard({ userId, firstName, size = "md" }: WidgetProps) {
  // Client-only render (MinSkeletonBoundary mounts children post-150ms),
  // so reading the clock here cannot cause a hydration mismatch.
  const now = new Date();
  const greeting = getElayaTimeGreeting(now);
  const dailyLine = pickElayaDailyLine(userId, now);
  const [draft, setDraft] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           "var(--space-4)",
        height:        WIDGET_HEIGHT_BY_SIZE[size],
        padding:       "var(--space-5)",
        background:    "var(--theme-paper)",
        border:        "1px solid var(--theme-paper-border)",
        borderRadius:  "var(--radius-lg)",
        boxShadow:     "var(--shadow-1)",
      }}
    >
      {/* Presence row — glyph always breathing while she occupies this card */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
        <span style={{ color: "var(--theme-accent)", display: "flex" }}>
          <ElayaGlyph size={28} />
        </span>
        <span
          className="label-micro"
          style={{ color: "var(--theme-text-tertiary)" }}
        >
          Elaya
        </span>
      </div>

      {/* Greeting + line of the day */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   "var(--text-xl)",
            fontWeight: "var(--weight-normal)",
            color:      "var(--theme-text-primary)",
            margin:     0,
            lineHeight: "var(--leading-snug)",
          }}
        >
          {greeting}
          {firstName ? (
            <>
              , <span style={{ color: "var(--theme-accent)" }}>{firstName}</span>
            </>
          ) : null}
          <span className="page-title-dot">.</span>
        </p>

        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-secondary)",
            margin:     0,
            lineHeight: "var(--leading-relaxed)",
          }}
        >
          {dailyLine}
        </p>
      </div>

      {/* Conversation seat — rendered, not yet wired. Disabled until the
          Elaya layer ships; the send path will land here, nowhere else. */}
      <div style={{ flexShrink: 0 }}>
        <MessageBar
          value={draft}
          onChange={setDraft}
          onSend={() => {}}
          disabled
          placeholder="Elaya is on her way…"
          variant="nested"
        />
      </div>
    </motion.div>
  );
}
