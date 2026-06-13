"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { m as motion } from "framer-motion";
import { FAST_DURATION, SLOW_DURATION, EASE_OUT_EXPO, EASE_OUT_SOFT } from "@/lib/constants/motion";

export interface BackButtonProps {
  /** Destination href — must be a relative route. */
  href:    string;
  /** Accessible label describing the destination, e.g. "Back to Team". */
  label:   string;
}

const MotionLink = motion.create(Link);

export function BackButton({ href, label }: BackButtonProps) {
  return (
    <MotionLink
      href={href}
      aria-label={label}
      title={label}
      className="serene-icon-travel-back-hover"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      whileHover={{
        scale: 1.05,
        // Soft pace matches the arrow travel; without this the scale pops at
        // the 150ms entrance timing and the whole hover reads rushed.
        transition: { duration: SLOW_DURATION, ease: EASE_OUT_SOFT },
      }}
      whileTap={{ scale: 0.93 }}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          36,
        height:         36,
        flexShrink:     0,
        background:     "var(--theme-paper)",
        border:         "1px solid var(--theme-paper-border)",
        borderRadius:   "var(--radius-full)",
        color:          "var(--theme-text-secondary)",
        textDecoration: "none",
        boxShadow:      "var(--shadow-1)",
        willChange:     "transform",
        overflow:       "hidden",
      }}
    >
      {/* Arrow travel (design-tokens §15): primary exits left, twin arrives
          from the right — transforms live in the stylesheet, never inline. */}
      <span className="serene-icon-travel-stage">
        <ArrowLeft style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
        <ArrowLeft
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: 16, height: 16, strokeWidth: 1.5 }}
        />
      </span>
    </MotionLink>
  );
}
