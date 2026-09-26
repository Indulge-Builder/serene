// constants/media.ts — THE vocabulary of Elaya's eyes (migration 0246,
// docs/architecture/media-understanding-plan.md). Pure data; the prompt lives with the reader
// in services/media-reader.ts. The SQL CHECKs on public.media_readings mirror every list here:
// a new value = one entry + a CHECK migration.

import { defineEnum } from "@/lib/constants/define-enum";

/** Bump on ANY prompt or output-shape change; every row records it, so a re-read is comparable. */
export const MEDIA_READER_PROMPT_VERSION = "eyes-v1";
export const MEDIA_RUN_KIND = "media_reading";

export const MEDIA_SOURCES = ["sia_media", "freshdesk_attachment", "lead_whatsapp", "hands_media", "elaya_turn"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

export const MEDIA_KINDS = ["image", "pdf", "document", "audio", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_READING_STATUSES = ["queued", "reading", "done", "failed", "skipped", "dead"] as const;
export type MediaReadingStatus = (typeof MEDIA_READING_STATUSES)[number];

/** What a file IS. The class drives the fields, the escalation, the privacy rule and the fold. */
export const MEDIA_CLASSES = defineEnum([
  { id: "bill_receipt", label: "Bill or receipt" },
  { id: "booking_confirm", label: "Booking confirmation" },
  { id: "ticket_pass", label: "Ticket or boarding pass" },
  { id: "itinerary", label: "Itinerary" },
  { id: "menu_catalog", label: "Menu or catalogue" },
  { id: "product_photo", label: "Product photo" },
  { id: "place_photo", label: "Place photo" },
  { id: "person_photo", label: "People photo" },
  { id: "screenshot_chat", label: "Chat screenshot" },
  { id: "screenshot_app", label: "App screenshot" },
  { id: "form_document", label: "Form or letter" },
  { id: "id_document", label: "Identity document" },
  { id: "payment_card", label: "Payment card" },
  { id: "bank_statement", label: "Bank statement" },
  { id: "qr_payment", label: "Payment QR" },
  { id: "sticker_meme", label: "Sticker or meme" },
  { id: "voice_note", label: "Voice note" },
  { id: "other", label: "Other" },
] as const);
export type MediaClass = (typeof MEDIA_CLASSES.values)[number];

/** Described, never transcribed: no digits, no names, no text leave a file of these classes. */
export const MEDIA_SENSITIVE_CLASSES: readonly MediaClass[] = ["id_document", "payment_card", "bank_statement"];

/** A reading of one of these teaches the member twin something durable; the redo pass re-profiles the conversation around it. */
export const MEDIA_INFORMATIVE_CLASSES: readonly MediaClass[] = [
  "bill_receipt", "booking_confirm", "ticket_pass", "itinerary", "menu_catalog", "product_photo", "place_photo", "screenshot_chat", "screenshot_app", "form_document", "voice_note",
];

/** Classes where a low first reading is worth a second, dearer one. Data, not code: the settings row `media_reading_escalate` overrides. */
export const MEDIA_ESCALATE_DEFAULT = { classes: ["bill_receipt", "booking_confirm", "itinerary", "form_document", "screenshot_app"] as MediaClass[], below_confidence: 0.6 };

/** The mime types the routing tier can be shown as an image. Everything else image-like is skipped, never converted here. */
export const MEDIA_IMAGE_MIMES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MEDIA_PDF_MIME = "application/pdf";
/** One image or PDF over this is refused by the provider on every retry; skip it, never burn attempts. */
export const MEDIA_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_PDF_MAX_BYTES = 30 * 1024 * 1024;
/** Audio longer than this is transcribed in its first minutes only (a 40-minute recording is not a voice note). */
export const MEDIA_AUDIO_MAX_SECONDS = 15 * 60;

/** Settings keys (elaya_settings). All read per run, never module-cached. */
export const MEDIA_SETTING_KEYS = {
  enabled: "media_reading_enabled",            // the live lane (files from the last MEDIA_LIVE_HOURS); ships OFF
  backlogEnabled: "media_reading_backlog_enabled", // the history; ships OFF
  dailyCapUsd: "media_reading_daily_cap_usd",  // the backlog stops here; the live lane keeps MEDIA_LIVE_RESERVE of it
  escalate: "media_reading_escalate",          // {classes: [], below_confidence: n}
} as const;
export const MEDIA_DAILY_CAP_DEFAULT_USD = 15;
/** Share of the daily cap kept for files arriving today, so the backlog can never starve the live lane. */
export const MEDIA_LIVE_RESERVE = 0.2;
/** A file younger than this is "live" and read first. */
export const MEDIA_LIVE_HOURS = 24;

/** The sweep. */
export const MEDIA_SWEEP_BATCH = 120;              // rows claimed per run
export const MEDIA_PARALLEL_READS = 4;             // side by side, behind the shared rate gate
export const MEDIA_RUN_BUDGET_MS = 240_000;        // the task's schedule is 5 min; stop starting reads here
export const MEDIA_CALL_TIMEOUT_MS = 90_000;
export const MEDIA_MAX_OUTPUT_TOKENS = 1_600;   // a long menu hit 1,200 on the first bench with its TEXT cut short
export const MEDIA_MAX_ATTEMPTS = 3;
/** The redo pass: conversations re-profiled per run, and how many hours around a file make the conversation. */
export const MEDIA_REDO_WINDOWS_PER_RUN = 30;

/** Price per million tokens, for the cost column (the routing tier today). */
export const MEDIA_COST_PER_MTOK = { routing: { input: 1, output: 5 }, reasoning: { input: 3, output: 15 } } as const;

/** What the fold writes in front of a reading line, per WhatsApp message type. Mirrors the CASE in sia.wag_messages_read. */
export const MEDIA_FOLD_LABEL: Record<string, string> = { voice: "voice note", audio: "audio", video: "video", document: "file", sticker: "sticker", image: "image" };
