"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import { useWidgetDensityTier } from "@/hooks/useWidgetDensity";

const MotionLink = motion.create(Link);

/**
 * THE dashboard snapshot-count card (R-01) — one big live count, a label, and a
 * faint identity watermark; the whole card is a Link. Composed by
 * ManagerColdLeadsWidget, AgentPendingCallsWidget, and AgentNewLeadsWidget.
 *
 * Snapshot counts are LIVE pipeline states: seeded from the summary RPC only —
 * no fetch, no refresh button, and the global date filter never applies.
 * Display-only by design.
 *
 * Anatomy follows the canonical Serene stat tile (StatTile / ManagerBudgetWidget
 * hero): standard paper card chrome (`.serene-stat-tile`), a `label-micro` label,
 * and a mono tabular hero number. The only embellishment is the identity glyph
 * rendered as an oversized, faint corner watermark. Density-adaptive: `compact`
 * (the 2×2 cell) drops the hint and scales the number down; standard/rich show
 * the hint. Number carries the semantic colour only when count > 0 — a zero reads
 * calm (`--theme-text-secondary`), never alarming.
 */
export function SnapshotCountWidget({
  count,
  label,
  hint,
  href,
  icon: Icon,
  positiveColor,
}: {
  count: number;
  label: string;
  hint: string;
  href: string;
  /** Identity glyph — rendered as the faint corner watermark. */
  icon: LucideIcon;
  /** Count colour when count > 0; zero always renders --theme-text-secondary. */
  positiveColor: string;
}) {
  const tier = useWidgetDensityTier();
  const isCompact = tier === "compact";
  const isZero = count <= 0;
  const numberColor = isZero ? "var(--theme-text-secondary)" : positiveColor;

  return (
    <MotionLink
      href={href}
      aria-label={`${count} — ${label}`}
      title={hint}
      className="serene-stat-tile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{ padding: isCompact ? "var(--space-4)" : "var(--space-5)" }}
    >
      {/* Identity watermark — the glyph, faint + bleeding off the corner. Sized
          in cqmin off the live cell box (the tile is a query container), so it
          scales smoothly as the widget grows/shrinks instead of fixed px. */}
      <Icon
        aria-hidden
        strokeWidth={1}
        style={{
          position: "absolute",
          right: "-3%",
          bottom: "-6%",
          width: "clamp(22px, 30cqmin, 76px)",
          height: "clamp(22px, 30cqmin, 76px)",
          color: isZero ? "var(--theme-text-tertiary)" : positiveColor,
          opacity: isZero ? 0.06 : 0.08,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
          {label}
        </span>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: isCompact ? "var(--text-2xl)" : "var(--text-3xl)",
            fontWeight: "var(--weight-semibold)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: "var(--leading-none)",
            color: numberColor,
            transition: "color var(--duration-fast) var(--ease-in-out)",
          }}
        >
          {count}
        </span>

        {!isCompact && hint && (
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", lineHeight: 1.4 }}>
            {hint}
          </span>
        )}
      </div>
    </MotionLink>
  );
}
