"use client";

import { m as motion } from "framer-motion";
import { Phone, FileText, MessageSquare, Leaf } from "lucide-react";
import type { EffortMetrics } from "@/lib/services/performance-service";
import { EXIT_DURATION, PAGE_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

type CardProps = {
  eyebrow: string;
  value: number;
  delay: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  accent: string;
  description: string;
  // Optional: max value to draw a fill bar. When null, no bar rendered.
  maxValue?: number | null;
};

function EffortCard({
  eyebrow,
  value,
  delay,
  icon: Icon,
  iconColor,
  iconBg,
  accent,
  description,
  maxValue,
}: CardProps) {
  const fillPct =
    maxValue && maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: EXIT_DURATION,
        delay: delay / 1000,
        ease: EASE_OUT_EXPO,
      }}
      style={{
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-4) var(--space-4)",
        boxShadow: "var(--shadow-1)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Icon + eyebrow row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon
            style={{
              width: "13px",
              height: "13px",
              color: iconColor,
              strokeWidth: 1.75,
            }}
          />
        </div>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-2xs)",
            fontWeight: "var(--weight-medium)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--theme-text-tertiary)",
            margin: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          {eyebrow}
        </p>
      </div>

      {/* Value */}
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-light)",
          color: "var(--theme-text-primary)",
          lineHeight: "var(--leading-tight)",
          margin: 0,
        }}
      >
        {value}
      </p>

      {/* Horizontal fill bar — only when maxValue is available */}
      {fillPct !== null && (
        <div
          style={{
            height: "3px",
            background: "var(--theme-paper-border)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
          }}
        >
          {/* Full-width fill scaled by transform — never animate width (DNA M-06) */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: fillPct / 100 }}
            transition={{ duration: PAGE_DURATION, delay: delay / 1000 + 0.15, ease: EASE_OUT_EXPO }}
            style={{
              width: "100%",
              height: "100%",
              background: accent,
              borderRadius: "var(--radius-full)",
              transformOrigin: "left center",
            }}
          />
        </div>
      )}

      {/* Description */}
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          color: "var(--theme-text-tertiary)",
          margin: 0,
          lineHeight: "var(--leading-snug)",
        }}
      >
        {description}
      </p>
    </motion.div>
  );
}

type Props = {
  metrics: EffortMetrics;
};

export function EffortGrid({ metrics }: Props) {
  // Use calls as the relative max to normalise bars
  const maxCalls = Math.max(
    metrics.callsLogged,
    metrics.notesWritten,
    1,
  );

  const cards: Omit<CardProps, "delay">[] = [
    {
      eyebrow: "Calls Logged",
      value: metrics.callsLogged,
      icon: Phone,
      iconColor: "var(--color-success-text)",
      iconBg: "var(--color-success-light)",
      accent: "var(--color-success)",
      description: "total calls recorded this period",
      maxValue: maxCalls,
    },
    {
      eyebrow: "Notes Written",
      value: metrics.notesWritten,
      icon: FileText,
      iconColor: "var(--theme-accent)",
      iconBg: "var(--theme-accent-surface)",
      accent: "var(--theme-accent)",
      description: "call notes & updates added",
      maxValue: maxCalls,
    },
    {
      eyebrow: "In Discussion",
      value: metrics.inDiscussionCount,
      icon: MessageSquare,
      iconColor: "var(--color-info-text)",
      iconBg: "var(--color-info-light)",
      accent: "var(--color-info)",
      description: "live pipeline — active conversations",
      maxValue: null,
    },
    {
      eyebrow: "Nurturing",
      value: metrics.nurturingCount,
      icon: Leaf,
      iconColor: "var(--color-warning-text)",
      iconBg: "var(--color-warning-light)",
      accent: "var(--color-warning)",
      description: "long-term pipeline in patience",
      maxValue: null,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4"
      style={{
        gap: "var(--space-4)",
        alignItems: "stretch",
      }}
    >
      {cards.map((card, i) => (
        <EffortCard key={card.eyebrow} {...card} delay={i * 60} />
      ))}
    </div>
  );
}
