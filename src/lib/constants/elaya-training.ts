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
  "brochure", "work_example", "testimonial", "review", "podcast", "image", "video", "doc",
] as const satisfies readonly TrainingAssetKind[];

export const TRAINING_LINK_KINDS = ["url"] as const satisfies readonly TrainingAssetKind[];
export const TRAINING_TEXT_KINDS = ["fact"] as const satisfies readonly TrainingAssetKind[];

export type TrainingInputMode = "media" | "link" | "text";

export function trainingInputMode(kind: TrainingAssetKind): TrainingInputMode {
  if ((TRAINING_LINK_KINDS as readonly string[]).includes(kind)) return "link";
  if ((TRAINING_TEXT_KINDS as readonly string[]).includes(kind)) return "text";
  return "media";
}

// Per-kind upload affordances for the file-upload UI (media kinds only). `accept`
// feeds the <input accept> + a client-side type guard; maxMb feeds the size cap.
// fact/url are not file-backed → null.
export const TRAINING_UPLOAD_HINTS: Record<
  TrainingAssetKind,
  { accept: string; maxMb: number } | null
> = {
  brochure:     { accept: "application/pdf,image/*", maxMb: 25  },
  work_example: { accept: "image/*,video/*",         maxMb: 100 },
  testimonial:  { accept: "image/*,video/*",         maxMb: 100 },
  review:       { accept: "image/*",                 maxMb: 10  },
  podcast:      { accept: "audio/*,video/*",         maxMb: 200 },
  image:        { accept: "image/*",                 maxMb: 10  },
  video:        { accept: "video/*",                 maxMb: 200 },
  doc:          {
    accept: "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    maxMb: 25,
  },
  fact:         null,
  url:          null,
};

export const TRAINING_BUCKET = "elaya-training" as const;
