import { z } from "zod";
import {
  SUGGESTION_CATEGORY_ENUM,
  MAX_SUGGESTION_IMAGES,
} from "@/lib/constants/suggestions";

/**
 * Submit a suggestion / bug report. `message` is the user's prose (sanitized in
 * the action before write — Rule 06); `imagePaths` are storage paths in the
 * private `suggestions` bucket already uploaded client-side (the avatar pattern —
 * the File never reaches the action). The action additionally asserts every path
 * begins with the caller's own `${id}/` prefix. Issue messages are internal codes
 * mapped to formErrors in the action — never shown raw (Q-04).
 */
export const CreateSuggestionSchema = z.object({
  category: z.enum(SUGGESTION_CATEGORY_ENUM, { message: "bad_category" }),
  message: z
    .string()
    .trim()
    .min(1, { message: "message_required" })
    .max(2000, { message: "message_too_long" }),
  imagePaths: z
    .array(z.string().min(1).max(512))
    .max(MAX_SUGGESTION_IMAGES, { message: "too_many_images" })
    .default([]),
});
export type CreateSuggestionInput = z.infer<typeof CreateSuggestionSchema>;

/** Resolve a suggestion (admin/founder only — status flip + notify sender). */
export const ResolveSuggestionSchema = z.object({
  id: z.string().uuid({ message: "bad_suggestion_id" }),
});
export type ResolveSuggestionInput = z.infer<typeof ResolveSuggestionSchema>;
