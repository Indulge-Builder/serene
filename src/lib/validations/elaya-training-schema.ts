import { z } from "zod";
import {
  TRAINING_ASSET_KIND_ENUM,
  TRAINING_LINK_KINDS,
  TRAINING_TEXT_KINDS,
  TRAINING_MEDIA_KINDS,
} from "@/lib/constants/elaya-training";
import { GIA_DOMAIN_ENUM } from "@/lib/constants/domains";

// http(s)-only link, validated ONLY when present (the field is nullable+optional).
const httpUrl = z
  .string()
  .trim()
  .url("Please enter a valid link.")
  .max(2000, "That link is too long.")
  .refine((u) => /^https?:\/\//i.test(u), {
    message: "Links must start with http:// or https://.",
  });

export const upsertTrainingAssetSchema = z
  .object({
    // Present on edit, absent/null on create — the action decides insert vs update.
    id: z.string().uuid("That training asset could not be found.").nullable().optional(),

    kind: z.enum(TRAINING_ASSET_KIND_ENUM, { message: "Please choose a valid asset type." }),

    title: z
      .string()
      .trim()
      .min(1, "Give this asset a title.")
      .max(160, "Keep the title under 160 characters."),

    description: z
      .string()
      .trim()
      .max(8000, "Keep the text under 8000 characters.")
      .nullable()
      .optional(),

    url: httpUrl.nullable().optional(),

    storagePath: z
      .string()
      .trim()
      .min(1, "The uploaded file path is missing.")
      .max(500, "That file path is too long.")
      .nullable()
      .optional(),

    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Tags cannot be empty.")
          .max(40, "Each tag must be under 40 characters."),
      )
      .max(10, "Add at most 10 tags.")
      .default([]),

    domain: z
      .enum(GIA_DOMAIN_ENUM, { message: "Please choose a valid domain." })
      .nullable()
      .optional(), // null = all domains

    sendOrder: z.coerce
      .number({ message: "Send order must be a number." })
      .int("Send order must be a whole number.")
      .min(0, "Send order cannot be negative.")
      .max(9999, "Send order is too large."),

    active: z.coerce.boolean().default(true),
  })
  // Refine 1 — a 'url' (link) kind must carry a url.
  .refine(
    (v) =>
      !(TRAINING_LINK_KINDS as readonly string[]).includes(v.kind) ||
      (typeof v.url === "string" && v.url.length > 0),
    { message: "A link asset needs a link.", path: ["url"] },
  )
  // Refine 2 — a 'fact' (text) kind must carry a body in description.
  .refine(
    (v) =>
      !(TRAINING_TEXT_KINDS as readonly string[]).includes(v.kind) ||
      (typeof v.description === "string" && v.description.length > 0),
    { message: "Write the company facts before saving.", path: ["description"] },
  )
  // Refine 3 — a media kind needs a stored file OR an external link.
  .refine(
    (v) =>
      !(TRAINING_MEDIA_KINDS as readonly string[]).includes(v.kind) ||
      (typeof v.storagePath === "string" && v.storagePath.length > 0) ||
      (typeof v.url === "string" && v.url.length > 0),
    { message: "Upload a file or paste a link for this asset.", path: ["storagePath"] },
  );

export const deleteTrainingAssetSchema = z.object({
  id: z.string().uuid("That training asset could not be found."),
});

export type UpsertTrainingAssetInput = z.infer<typeof upsertTrainingAssetSchema>;
export type DeleteTrainingAssetInput = z.infer<typeof deleteTrainingAssetSchema>;
