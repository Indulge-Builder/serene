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
