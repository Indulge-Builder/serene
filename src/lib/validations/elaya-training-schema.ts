import { z } from "zod";
import {
  TRAINING_ASSET_KIND_ENUM,
  TRAINING_LINK_KINDS,
  TRAINING_TEXT_KINDS,
  TRAINING_MEDIA_KINDS,
  TRAINING_MESSAGE_KINDS,
} from "@/lib/constants/elaya-training";
import { resolveOutboundMediaType, whatsappMaxBytesFor } from "@/lib/constants/whatsapp";
import { GIA_DOMAIN_ENUM } from "@/lib/constants/domains";
import { uuidField } from "@/lib/validations/fields";

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
    id: uuidField("That training asset could not be found.").nullable().optional(),

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

    // A form posts "true" / "false" as text; z.coerce.boolean() read the string "false" as
    // true, so an asset could never be switched off (0252 fix).
    active: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),

    // 0252 — the public bot's library and pack
    whenToSend: z.string().trim().max(300, "Keep the 'when to send' line under 300 characters.").nullable().optional(),
    mimeType: z.string().trim().max(120).nullable().optional(),
    byteSize: z.coerce.number().int().min(0).nullable().optional(),
    attachments: z.array(uuidField("That attachment could not be found.")).max(8, "A ready message takes at most 8 attachments.").default([]),
    approve: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
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
    { message: "Write the text before saving.", path: ["description"] },
  )
  // Refine 2b — a ready message must carry its text.
  .refine(
    (v) =>
      !(TRAINING_MESSAGE_KINDS as readonly string[]).includes(v.kind) ||
      (typeof v.description === "string" && v.description.length > 0),
    { message: "Write the message before saving.", path: ["description"] },
  )
  // Refine 4 — an uploaded file must be one WhatsApp can send, within its size limit (0252).
  .refine(
    (v) => !v.storagePath || !v.mimeType || resolveOutboundMediaType(v.mimeType) !== null,
    { message: "WhatsApp cannot send this kind of file. Use a JPEG or PNG image, an MP4 video, an MP3 or M4A audio, or a PDF.", path: ["storagePath"] },
  )
  .refine(
    (v) => !v.storagePath || !v.mimeType || v.byteSize == null || v.byteSize <= whatsappMaxBytesFor(v.mimeType),
    { message: "This file is over WhatsApp's limit (5 MB for an image, 16 MB for video, audio or a PDF). Upload a smaller version, or add it as a link instead.", path: ["storagePath"] },
  )
  // Refine 3 — a media kind needs a stored file OR an external link.
  .refine(
    (v) =>
      !(TRAINING_MEDIA_KINDS as readonly string[]).includes(v.kind) ||
      (typeof v.storagePath === "string" && v.storagePath.length > 0) ||
      (typeof v.url === "string" && v.url.length > 0),
    { message: "Upload a file or paste a link for this asset.", path: ["storagePath"] },
  );

export const approveTrainingAssetSchema = z.object({
  id: uuidField("That training asset could not be found."),
});

export const deleteTrainingAssetSchema = z.object({
  id: uuidField("That training asset could not be found."),
});

export type UpsertTrainingAssetInput = z.infer<typeof upsertTrainingAssetSchema>;
export type DeleteTrainingAssetInput = z.infer<typeof deleteTrainingAssetSchema>;
