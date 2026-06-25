// Zod schema for the per-user Elaya persona write (Jarvis Phase 2).
// Issue messages are internal codes mapped to formErrors in the action — never shown
// raw (Q-04). All fields optional: an omitted field clears to Elaya's default.

import { z } from 'zod';
import {
  ELAYA_LANGUAGE_ENUM,
  ELAYA_TONE_ENUM,
  ELAYA_DEPTH_ENUM,
  ELAYA_LENGTH_ENUM,
  ELAYA_PERSONA_NOTE_MAX,
} from '@/lib/constants/elaya-persona';

export const UpdateElayaPersonaSchema = z.object({
  language: z.enum(ELAYA_LANGUAGE_ENUM).optional(),
  tone:     z.enum(ELAYA_TONE_ENUM).optional(),
  depth:    z.enum(ELAYA_DEPTH_ENUM).optional(),
  length:   z.enum(ELAYA_LENGTH_ENUM).optional(),
  // Empty string is allowed (clears the note); trimmed + capped. sanitizeText runs
  // server-side in the action before persisting.
  note:     z.string().trim().max(ELAYA_PERSONA_NOTE_MAX, 'note_too_long').optional(),
});

export type UpdateElayaPersonaInput = z.infer<typeof UpdateElayaPersonaSchema>;
