// Hand-declared Elaya customer-training row types — TEMPORARY until database.ts is
// regenerated after migration 0150 is applied (the types/elaya.ts / types/revival.ts /
// types/suggestions.ts interim precedent). Shapes mirror the migration exactly. Types
// only — no runtime values. After regen: re-point TrainingAssetRow to
// Database['public']['Tables']['elaya_training_assets']['Row'] and keep the
// TrainingAssetKind union (the constants + schema import it).

import type { GiaDomain } from "@/lib/constants/domains";

export type TrainingAssetKind =
  | "brochure"
  | "work_example"
  | "testimonial"
  | "review"
  | "podcast"
  | "image"
  | "video"
  | "doc"
  | "fact"
  | "url"
  // 0252 — the public bot's knowledge pack and library
  | "audio"
  | "ready_message"
  | "story"
  | "answer"
  | "objection"
  | "news"
  | "forbidden";

export interface TrainingAssetRow {
  id: string;
  kind: TrainingAssetKind;
  title: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  tags: string[];
  domain: GiaDomain | null;
  send_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  // 0252 — draft until approved; only approved items reach the published pack
  status: "draft" | "approved";
  /** One line on when to send it: the bot reads it, the agent sees it. */
  when_to_send: string | null;
  /** The file's real type and size, recorded at upload (the WhatsApp type comes from it). */
  mime_type: string | null;
  byte_size: number | null;
  /** A ready message's attachments, in send order. */
  attachments: string[];
  /** News falls out of the pack after this. */
  expires_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
}
