// The hands connector's config. Reads ../.env.local like the watcher (its parser is reused, so the
// two never disagree on how a line is read) and adds the hands-only keys.
import { config as watcherConfig } from "../../connector/src/config.js";

const env = process.env as Record<string, string | undefined>;

export const config = {
  supabaseUrl: watcherConfig.supabaseUrl,
  supabaseServiceKey: watcherConfig.supabaseServiceKey,
  /** Pair by phone number (headless host) instead of a QR. Leave unset on a laptop. */
  pairNumber: env.HANDS_PAIR_NUMBER || null,
  /** The private Storage bucket the agent's files (a QR, a screenshot) are copied into (0245). */
  mediaBucket: env.HANDS_MEDIA_BUCKET || "hands-media",
  /** How often the outbox is polled. Serene writes rows; this process is the only sender. */
  outboxPollMs: Number(env.HANDS_OUTBOX_POLL_MS || 3000),
  /** How often the allowlist is re-read. A number removed on /settings/hands stops within this. */
  allowlistRefreshMs: 60_000,
  heartbeatMs: 60_000,
} as const;
