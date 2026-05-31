import { z } from "zod";

// campaign_key is normalised (lowercase + trim) before the DB write — the DB
// CHECK constraint enforces the same invariant. Validation accepts any non-empty
// string; the action normalises it.
export const upsertAdCreativeSchema = z.object({
  // Present on edit, absent on create.
  id: z
    .string()
    .uuid("ad_creative_id_invalid")
    .nullable()
    .optional(),
  campaign_key: z
    .string()
    .min(1, "campaign_key_required")
    .max(300, "campaign_key_too_long")
    .trim(),
  video_url: z
    .string()
    .min(1, "video_url_required")
    .url("video_url_invalid")
    .max(2000, "video_url_too_long"),
  thumbnail_url: z
    .string()
    .url("thumbnail_url_invalid")
    .max(2000, "thumbnail_url_too_long")
    .nullable()
    .optional(),
  ad_name: z
    .string()
    .max(200, "ad_name_too_long")
    .nullable()
    .optional(),
  notes: z
    .string()
    .max(2000, "notes_too_long")
    .nullable()
    .optional(),
});

export const deleteAdCreativeSchema = z.object({
  id: z.string().uuid("ad_creative_id_invalid"),
});

export type UpsertAdCreativeInput = z.infer<typeof upsertAdCreativeSchema>;
export type DeleteAdCreativeInput = z.infer<typeof deleteAdCreativeSchema>;
