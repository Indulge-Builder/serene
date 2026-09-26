/**
 * Feature flags — single-boolean revert hinges.
 *
 * Each flag gates a whole feature at every mount point so flipping the boolean
 * cleanly removes the feature (and restores whatever it replaced). Keep these
 * as plain compile-time constants — no env reads, no DB, no runtime config —
 * so the dead branches tree-shake and both states are verifiable at build time.
 */

/**
 * Persistent desktop/tablet (md+) shell top bar — hosts the notification bell
 * (relocated from the Sidebar footer) and the admin/founder domain selector.
 *
 * ON  → the bar renders md+; the Sidebar footer bell is hidden; the mobile
 *       strip folds the bell in.
 * OFF → no bar anywhere; the bell lives in the Sidebar footer exactly as before.
 *
 * Both bell mount points read this flag, so exactly one bell ever mounts.
 */
export const TOP_BAR_ENABLED = true;

/**
 * The three /m demo screens (Profile, Requests, Request detail) — specimen
 * copy from the design handoff (DEMO_PERSONA, DEMO_REQUESTS, the Gulfstream
 * request) that real staff were reaching from the tab bar (mobile audit
 * 2026-09-26, P1).
 *
 * ON  → the three pages render their demo screens as before.
 * OFF → the three pages call notFound(); the components stay on disk as the
 *       handoff's reference.
 */
export const MOBILE_DEMO_SCREENS_ENABLED = false;
