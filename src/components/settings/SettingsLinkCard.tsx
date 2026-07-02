"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { ChevronRight, Timer, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EASE_OUT_EXPO, EXIT_DURATION } from "@/lib/constants/motion";

/**
 * Icon registry — keyed by a plain string so the server page passes a string,
 * not a component reference (Next 16 forbids passing functions/classes from a
 * Server Component to a Client Component).
 */
const ICONS = { timer: Timer, sparkles: Sparkles } satisfies Record<string, LucideIcon>;

export type SettingsLinkIcon = keyof typeof ICONS;

export interface SettingsLinkCardProps {
  /** Destination route (relative). */
  href:        string;
  /** Lucide glyph key for the leading tile. */
  icon:        SettingsLinkIcon;
  /** Card title. */
  title:       string;
  /** One-line description of what the page configures. */
  description: string;
  /** Stagger index for the entrance animation. */
  index?:      number;
}

const MotionLink = motion.create(Link);

/**
 * SettingsLinkCard — the /settings hub navigation card.
 *
 * A paper card that links to a dedicated settings sub-page. Matches the
 * card-list treatment from the Standard Page Layout Contract exactly
 * (mirrors CampaignCard): --shadow-1 at rest → --shadow-2 + translateY(-1px)
 * on hover via CSS transition (box-shadow/transform), --shadow-focus on
 * keyboard focus, staggered opacity/y entrance. Icon tile uses
 * --theme-accent-surface; the trailing chevron is the only affordance.
 * Display-only chrome — no business logic.
 */
export function SettingsLinkCard({
  href,
  icon,
  title,
  description,
  index = 0,
}: SettingsLinkCardProps) {
  const Icon = ICONS[icon];
  return (
    <MotionLink
      href={href}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: EXIT_DURATION,
        delay:    Math.min(index * 0.08, 0.32),
        ease:     EASE_OUT_EXPO,
      }}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "var(--space-4)",
        padding:        "var(--space-5)",
        background:     "var(--theme-paper)",
        border:         "1px solid var(--theme-paper-border)",
        borderRadius:   "var(--radius-lg)",
        boxShadow:      "var(--shadow-1)",
        textDecoration: "none",
        color:          "inherit",
        transition:     "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
        outline:        "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "var(--shadow-2)";
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "var(--shadow-1)";
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "var(--shadow-focus)";
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "var(--shadow-1)";
      }}
    >
      {/* Icon tile */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          width:          44,
          height:         44,
          flexShrink:     0,
          borderRadius:   "var(--radius-md)",
          background:     "var(--theme-accent-surface)",
          color:          "var(--theme-accent)",
        }}
      >
        <Icon style={{ width: 20, height: 20, strokeWidth: 1.5 }} />
      </div>

      {/* Title + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          style={{
            margin:     0,
            fontSize:   "var(--text-base)",
            fontWeight: "var(--weight-semibold)",
            color:      "var(--theme-text-primary)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin:     "var(--space-1) 0 0",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-secondary)",
            lineHeight: 1.45,
          }}
        >
          {description}
        </p>
      </div>

      {/* Trailing chevron */}
      <ChevronRight
        style={{
          width:       18,
          height:      18,
          flexShrink:  0,
          strokeWidth: 1.5,
          color:       "var(--theme-text-tertiary)",
        }}
      />
    </MotionLink>
  );
}
