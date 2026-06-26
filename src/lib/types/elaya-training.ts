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
  | "url";

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
}
