import { z } from 'zod';
import { uuidField } from '@/lib/validations/fields';

/**
 * Chat request body for POST /api/elaya/chat.
 * Issue messages are internal — the route maps failures to formErrors copy,
 * never raw Zod text (Q-04).
 */
export const ElayaChatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'empty_message')
    .max(4000, 'message_too_long'),
  conversationId: uuidField('invalid_conversation').optional(),
});

export type ElayaChatRequest = z.infer<typeof ElayaChatRequestSchema>;
