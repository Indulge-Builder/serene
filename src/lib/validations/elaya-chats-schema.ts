// elaya-chats-schema.ts — the chats page's read input (2026-09-29): one person's history with Elaya,
// a page at a time, optionally one channel. Rule 02: the action parses this first.
import { z } from 'zod';
import { uuidField } from '@/lib/validations/fields';
import { ELAYA_CHAT_CHANNEL_FILTERS } from '@/lib/constants/elaya';
import { ELAYA_REQUEST_KIND_ENUM } from '@/lib/constants/elaya-memory';

export const GetElayaChatSchema = z.object({
  user_id: uuidField('That person could not be found.'),
  /** Keyset cursor: the created_at of the oldest message already on screen. */
  before: z.string().datetime({ offset: true, message: 'That page could not be loaded.' }).optional(),
  channel: z.enum(ELAYA_CHAT_CHANNEL_FILTERS, { message: 'Pick a channel.' }).optional(),
});
export type GetElayaChatInput = z.infer<typeof GetElayaChatSchema>;

/** An admin marks one of Elaya's replies as wrong. The server reads the reply and the question before
 *  it itself; the browser sends only the id, what kind of wrong, and the right answer. */
export const FlagElayaReplySchema = z.object({
  message_id: uuidField('That reply could not be found.'),
  kind: z.enum(ELAYA_REQUEST_KIND_ENUM, { message: 'Pick what went wrong.' }),
  correction: z.string().trim().min(3, 'Say what the right answer is, in a few words at least.').max(2000, 'Keep it under 2,000 characters.'),
});
export type FlagElayaReplyInput = z.infer<typeof FlagElayaReplySchema>;
