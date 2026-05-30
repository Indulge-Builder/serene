import { z } from 'zod';

// ─────────────────────────────────────────────
// Meta webhook envelope
// Permissive at the envelope level — Meta adds fields without warning.
// passthrough() preserves unknown keys instead of stripping them.
// ─────────────────────────────────────────────

export const MetaWebhookPayloadSchema = z.object({
  object: z.string(),
  entry:  z.array(
    z.object({
      id:      z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.string(),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id:      z.string(),
            }).passthrough(),
            contacts: z.array(z.object({
              profile: z.object({ name: z.string() }).passthrough(),
              wa_id:   z.string(),
            }).passthrough()).optional(),
            messages: z.array(z.object({
              id:        z.string(),
              from:      z.string(),
              timestamp: z.string(),
              type:      z.string(),
            }).passthrough()).optional(),
            statuses: z.array(z.object({
              id:           z.string(),
              status:       z.string(),
              timestamp:    z.string(),
              recipient_id: z.string(),
            }).passthrough()).optional(),
          }).passthrough(),
        }).passthrough()
      ),
    }).passthrough()
  ),
}).passthrough();

export type MetaWebhookPayloadInput = z.infer<typeof MetaWebhookPayloadSchema>;

// ─────────────────────────────────────────────
// Meta delivery receipt (single status object)
// ─────────────────────────────────────────────

export const MetaStatusUpdateSchema = z.object({
  id:           z.string(),
  status:       z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp:    z.string(),
  recipient_id: z.string(),
}).passthrough();

export type MetaStatusUpdateInput = z.infer<typeof MetaStatusUpdateSchema>;

// ─────────────────────────────────────────────
// Send message (agent → lead)
// Human-readable errors — never expose Zod defaults to the UI (Rule 06).
// ─────────────────────────────────────────────

export const SendMessageSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
  content:        z
    .string()
    .min(1,    'Message cannot be empty')
    .max(4096, 'Message cannot exceed 4096 characters'),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ─────────────────────────────────────────────
// Resolve conversation
// ─────────────────────────────────────────────

export const ResolveConversationSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
});

export type ResolveConversationInput = z.infer<typeof ResolveConversationSchema>;
