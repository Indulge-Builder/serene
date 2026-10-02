// constants/desks.ts — THE Desks vocabulary (migration 0248; docs/architecture/desks-plan.md).
//
// Desks = Elaya on the office tables: an Alexa speaker per queendom table (reached through Voice
// Monkey), a TV board on the wall, and one ledger (desk_outbox) that every spoken or shown line
// passes through. The SQL CHECKs mirror the lists below; a new value = one entry + a CHECK migration.

export const DESKS_SETTINGS_PATH = "/settings/desks";
export const TV_PATH = "/tv";

export const DESK_DEVICE_KINDS = ["alexa", "tv"] as const;
export type DeskDeviceKind = (typeof DESK_DEVICE_KINDS)[number];
export const DESK_DEVICE_KIND_LABELS: Record<DeskDeviceKind, string> = { alexa: "Alexa speaker", tv: "TV board" };

export const DESK_MESSAGE_KINDS = ["announcement", "alert", "answer", "reminder"] as const;
export type DeskMessageKind = (typeof DESK_MESSAGE_KINDS)[number];

export const DESK_SOURCES = ["human", "elaya", "sweep"] as const;
export type DeskSource = (typeof DESK_SOURCES)[number];

export const DESK_OUTBOX_STATUSES = ["queued", "sent", "failed", "refused"] as const;
export type DeskOutboxStatus = (typeof DESK_OUTBOX_STATUSES)[number];

/** Who a row is for: everyone, one queendom's devices, or one device. */
export type DeskAudience = { all: true } | { queendom_id: string } | { device_id: string };

/** Settings rows (elaya_settings) the desks read per send; missing = the default here. */
export const DESK_SETTING_KEYS = {
  enabled:    "desks_enabled",      // boolean; OFF unless exactly true
  quietHours: "desks_quiet_hours",  // { from, to } in IST hours; alerts wait, announcements still go
} as const;
export const DESK_QUIET_HOURS_DEFAULT = { from: 21, to: 8 } as const;

/** A spoken line is one sentence, two at most; a speaker that talks too much is unplugged. */
export const DESK_SPOKEN_MAX_CHARS = 240;
export const DESK_BODY_MAX_CHARS = 400;
export const DESK_ANNOUNCEMENT_MAX_CHARS = 300;

/** A queued alert older than this is never spoken: the moment has passed. Announcements get longer. */
export const DESK_ALERT_EXPIRES_MS = 20 * 60_000;
export const DESK_ANNOUNCEMENT_EXPIRES_MS = 2 * 60 * 60_000;

/** The sender's budget per run (Trigger.dev, every minute) and how many rows it takes at once. */
export const DESK_SENDER_BATCH = 20;
export const DESK_SENDER_RUN_BUDGET_MS = 50_000;

/** How the room knows who is talking. */
export const DESK_VOICE_PREFIX: Record<1 | 2 | 3, string> = { 1: "Elaya.", 2: "Elaya.", 3: "Elaya here." };
export const DESK_ANNOUNCEMENT_PREFIX = "Announcement from";

/** The Amazon Polly voice Voice Monkey speaks with; Indian English so member and city names land. */
export const DESK_TTS_VOICE = "Aditi";
export const DESK_TTS_LANGUAGE = "en-IN";
