import { defineEnum } from "./define-enum";
import type { TrainingAssetKind as RowKind } from "@/lib/types/elaya-training";

// ─────────────────────────────────────────────────────────────────────────
// Elaya customer-training asset kinds — the founder-curated knowledge Elaya may
// draw on / send during the customer welcome blast. ONE source array via
// defineEnum — values / labels / options / zodEnum derive from it and can never
// drift (R-01). The SQL CHECK in migration 0150 mirrors these 10 ids byte-for-byte.
//
// Three INPUT MODES drive the modal's conditional fields + the schema's refine:
//   • 'media' (brochure · work_example · testimonial · review · podcast · image ·
//             video · doc) → needs storage_path OR url (a stored file or a link)
//   • 'link'  (url)        → needs url
//   • 'text'  (fact)       → needs description (the body); no file, no url —
//                            this is also the company-facts brief vehicle
// Never re-hardcode this membership in a component — read the helpers below.
// ─────────────────────────────────────────────────────────────────────────
const TRAINING_ASSET_KIND_DEF = defineEnum([
  { id: "brochure",     label: "Brochure"     },
  { id: "work_example", label: "Work Example" },
  { id: "testimonial",  label: "Testimonial"  },
  { id: "review",       label: "Review"       },
  { id: "podcast",      label: "Podcast"      },
  { id: "image",        label: "Image"        },
  { id: "video",        label: "Video"        },
  { id: "doc",          label: "Document"     },
  { id: "fact",         label: "Fact"         },
  { id: "url",          label: "Link"         },
  // 0252 — the public bot's knowledge pack and library
  { id: "audio",         label: "Audio"         },
  { id: "ready_message", label: "Ready message" },
  { id: "story",         label: "Story"         },
  { id: "answer",        label: "Answer"        },
  { id: "objection",     label: "Objection"     },
  { id: "news",          label: "News"          },
  { id: "forbidden",     label: "Never say"     },
]);

// Annotated with the database.ts-aligned union (types/elaya-training.ts) so
// exhaustiveness holds.
export const TRAINING_ASSET_KINDS: RowKind[] = TRAINING_ASSET_KIND_DEF.values;
export type TrainingAssetKind = RowKind;
export const TRAINING_ASSET_KIND_LABELS = TRAINING_ASSET_KIND_DEF.labels;
export const TRAINING_ASSET_KIND_OPTIONS = TRAINING_ASSET_KIND_DEF.options;
export const TRAINING_ASSET_KIND_ENUM = TRAINING_ASSET_KIND_DEF.zodEnum;

// Input-mode partition — the single source the schema refine + the modal both read.
export const TRAINING_MEDIA_KINDS = [
  "brochure", "work_example", "testimonial", "review", "podcast", "image", "video", "doc", "audio",
] as const satisfies readonly TrainingAssetKind[];

export const TRAINING_LINK_KINDS = ["url"] as const satisfies readonly TrainingAssetKind[];
/** Knowledge the bot reads (0252): compiled into the published pack, never sent as a file. */
export const TRAINING_TEXT_KINDS = [
  "fact", "story", "answer", "objection", "news", "forbidden",
] as const satisfies readonly TrainingAssetKind[];
/** A text written once (`{first_name}` its only blank) followed by its attachments in order. */
export const TRAINING_MESSAGE_KINDS = ["ready_message"] as const satisfies readonly TrainingAssetKind[];

/** What the bot and the agents may SEND (the library): files, links and ready messages. */
export const TRAINING_LIBRARY_KINDS = [
  ...TRAINING_MEDIA_KINDS, ...TRAINING_LINK_KINDS, ...TRAINING_MESSAGE_KINDS,
] as const satisfies readonly TrainingAssetKind[];

export function isLibraryKind(kind: TrainingAssetKind): boolean {
  return (TRAINING_LIBRARY_KINDS as readonly string[]).includes(kind);
}

export type TrainingInputMode = "media" | "link" | "text" | "message";

export function trainingInputMode(kind: TrainingAssetKind): TrainingInputMode {
  if ((TRAINING_LINK_KINDS as readonly string[]).includes(kind)) return "link";
  if ((TRAINING_TEXT_KINDS as readonly string[]).includes(kind)) return "text";
  if ((TRAINING_MESSAGE_KINDS as readonly string[]).includes(kind)) return "message";
  return "media";
}

/** The one blank a ready message may carry. */
export const READY_MESSAGE_NAME_TOKEN = "{first_name}";

// Per-kind upload affordances for the file-upload UI (media kinds only). `accept`
// feeds the <input accept> + a client-side type guard; maxMb feeds the size cap.
// fact/url are not file-backed → null.
export const TRAINING_UPLOAD_HINTS: Record<
  TrainingAssetKind,
  { accept: string; maxMb: number } | null
> = {
  // WhatsApp's own limits (0252): an image over 5 MB, a video or audio over 16 MB, or a
  // document over our 16 MB cap is refused at upload, never discovered at send. Only formats
  // WhatsApp plays: JPEG/PNG images, MP4 video, PDF documents. A longer video is a link.
  brochure:      { accept: "application/pdf,image/jpeg,image/png", maxMb: 16 },
  work_example:  { accept: "image/jpeg,image/png,video/mp4",       maxMb: 16 },
  testimonial:   { accept: "image/jpeg,image/png,video/mp4",       maxMb: 16 },
  review:        { accept: "image/jpeg,image/png",                 maxMb: 5  },
  podcast:       { accept: "audio/mpeg,audio/mp4,audio/ogg,audio/aac,video/mp4", maxMb: 16 },
  image:         { accept: "image/jpeg,image/png",                 maxMb: 5  },
  video:         { accept: "video/mp4",                            maxMb: 16 },
  doc:           { accept: "application/pdf",                      maxMb: 16 },
  audio:         { accept: "audio/mpeg,audio/mp4,audio/ogg,audio/aac", maxMb: 16 },
  fact:          null,
  url:           null,
  ready_message: null,
  story:         null,
  answer:        null,
  objection:     null,
  news:          null,
  forbidden:     null,
};

export const TRAINING_BUCKET = "elaya-training" as const;
