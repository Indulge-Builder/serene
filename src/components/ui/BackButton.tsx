"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { FAST_DURATION, EASE_OUT_EXPO, EASE_SPRING } from "@/lib/constants/motion";

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
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      whileHover={{ x: -2, scale: 1.05 }}
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
      }}
    >
      <motion.span
        style={{ display: "inline-flex" }}
        whileHover={{ x: -1 }}
        transition={{ duration: FAST_DURATION, ease: EASE_SPRING }}
      >
        <ArrowLeft style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
      </motion.span>
    </MotionLink>
  );
}
