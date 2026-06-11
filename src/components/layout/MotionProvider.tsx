"use client";

import { LazyMotion, MotionConfig } from "framer-motion";

// App-wide Framer Motion provider (perf audit G-2). Mounted once in the root
// layout. `strict` makes the bundle contract self-enforcing: rendering a
// full `motion.*` component anywhere in the tree throws in development.
//
// THE import convention everywhere else: `import { m as motion } from
// "framer-motion"` — the alias keeps all existing `motion.div` JSX and exit
// animations byte-identical while shipping the slim `m` core. Never import
// the bare `{ motion }` namespace; it bundles the full renderer and crashes
// under strict mode.
//
// Features load async (separate chunk, fetched on provider mount) — until
// they arrive, elements render at their initial styles, exactly like the
// pre-hydration window always has.
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {/* reducedMotion="user": every Framer transform animation respects
          prefers-reduced-motion (opacity/color transitions are kept) —
          the CSS-side gate lives in design-tokens.css §15. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
