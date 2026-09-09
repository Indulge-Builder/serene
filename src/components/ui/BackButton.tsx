"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { m as motion } from "framer-motion";
import { FAST_DURATION, SLOW_DURATION, EASE_OUT_EXPO, EASE_OUT_SOFT } from "@/lib/constants/motion";

export interface BackButtonProps {
  /** Destination href — must be a relative route. Also the fallback when
   *  `preferHistory` is set and there is no in-app page to return to. */
  href:    string;
  /** Accessible label describing the destination, e.g. "Back to Team". */
  label:   string;
  /**
   * Go back to WHEREVER the user came from, falling back to `href`.
   *
   * Opt-in, because most detail pages have exactly one parent and a fixed href
   * is the honest answer for them. A vendor is reached from two places — the
   * list AND Find a vendor — so a fixed href sent everyone to the list and
   * silently lost a search someone had just run.
   */
  preferHistory?: boolean;
}

const MotionLink = motion.create(Link);

export function BackButton({ href, label, preferHistory }: BackButtonProps) {
  const router = useRouter();

  // Only step back when the previous page was OURS. A direct arrival (a
  // bookmark, a pasted link, a new tab) has no in-app history, and router.back()
  // would throw the user out of the app entirely.
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!preferHistory) return;
    if (typeof window === "undefined") return;
    const cameFromApp =
      window.history.length > 1 &&
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
    if (!cameFromApp) return;          // let the <Link href> handle it
    e.preventDefault();
    router.back();
  }

  return (
    <MotionLink
      href={href}
      onClick={onClick}
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
