// elaya-memory-schema.ts — the memory and improvement-request action inputs (Rule 02: first line of
// every action). Human messages only; the SQL CHECKs in 0237 mirror the bounds.
import { z } from 'zod';
import { uuidField } from '@/lib/validations/fields';
import { ELAYA_MEMORY_KIND_ENUM, ELAYA_MEMORY_STATEMENT_MAX, ELAYA_REQUEST_STATUS_ENUM } from '@/lib/constants/elaya-memory';

export const AddMemoryEntrySchema = z.object({
  /** Absent = the caller's own memory; present = an admin writing for someone. */
  user_id: uuidField('That person could not be found.').optional(),
  kind: z.enum(ELAYA_MEMORY_KIND_ENUM, { message: 'Pick what kind of thing this is.' }),
  statement: z.string().trim().min(3, 'Say it in a few words at least.').max(ELAYA_MEMORY_STATEMENT_MAX, `Keep it under ${ELAYA_MEMORY_STATEMENT_MAX} characters.`),
});
export type AddMemoryEntryInput = z.infer<typeof AddMemoryEntrySchema>;

export const RetireMemoryEntrySchema = z.object({ id: uuidField('That entry could not be found.') });

export const ResolveImprovementRequestSchema = z.object({
  id: uuidField('That request could not be found.'),
  status: z.enum(ELAYA_REQUEST_STATUS_ENUM, { message: 'Pick what happened to it.' }),
  admin_note: z.string().trim().max(1000, 'Keep the note under 1,000 characters.').optional(),
});
export type ResolveImprovementRequestInput = z.infer<typeof ResolveImprovementRequestSchema>;
