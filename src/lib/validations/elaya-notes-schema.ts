import { z } from "zod";
import {
  ELAYA_NOTE_TITLE_MAX,
  ELAYA_NOTE_BODY_MAX,
} from "@/lib/constants/elaya-notes";
import { uuidField } from "@/lib/validations/fields";

// Upsert a personal Elaya note. `id` present on edit, absent/null on create — the action
// decides insert vs update. A note must have at least a title OR a body (an entirely
// empty note is meaningless); the refine enforces that without forcing both.
export const upsertNoteSchema = z
  .object({
    id: uuidField("That note could not be found.").nullable().optional(),

    title: z
      .string()
      .trim()
      .max(ELAYA_NOTE_TITLE_MAX, `Keep the title under ${ELAYA_NOTE_TITLE_MAX} characters.`)
      .default(""),

    body: z
      .string()
      .trim()
      .max(ELAYA_NOTE_BODY_MAX, `Keep the note under ${ELAYA_NOTE_BODY_MAX} characters.`)
      .default(""),
  })
  .refine((v) => v.title.length > 0 || v.body.length > 0, {
    message: "Write something before saving.",
    path: ["body"],
  });

export const deleteNoteSchema = z.object({
  id: uuidField("That note could not be found."),
});

export type UpsertNoteInput = z.infer<typeof upsertNoteSchema>;
export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>;
