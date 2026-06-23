import { z } from 'zod';
import { WHATSAPP_PERIODS } from '@/lib/constants/whatsapp-period';
import {
  resolveOutboundMediaType,
  WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES,
} from '@/lib/constants/whatsapp';

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
// Send media message (agent → lead, composer attach flow)
// Validates the uploaded File: a non-empty Blob, ≤16MB, MIME on the outbound
// allowlist. Human-readable errors only. Caption is optional.
// ─────────────────────────────────────────────

export const SendMediaMessageSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
  caption:        z.string().max(1024, 'Caption cannot exceed 1024 characters').optional(),
  file: z
    .instanceof(Blob, { message: 'A file is required' })
    .refine((f) => f.size > 0, 'File is empty')
    .refine((f) => f.size <= WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES, 'File exceeds the 16MB limit')
    .refine((f) => resolveOutboundMediaType(f.type) !== null, 'Unsupported file type'),
});

export type SendMediaMessageInput = z.infer<typeof SendMediaMessageSchema>;

// ─────────────────────────────────────────────
// Conversation list period filter
// ─────────────────────────────────────────────

export const WhatsAppListFilterSchema = z.object({
  period:     z.enum(WHATSAPP_PERIODS).optional(),
  customFrom: z.string().optional().nullable(),
  customTo:   z.string().optional().nullable(),
  limit:      z.number().int().min(1).max(100).optional(),
  cursor:     z.string().optional().nullable(),
});

export type WhatsAppListFilterInput = z.infer<typeof WhatsAppListFilterSchema>;

export const WhatsAppSearchFilterSchema = z.object({
  query:      z.string().min(1).max(200),
  period:     z.enum(WHATSAPP_PERIODS).optional(),
  customFrom: z.string().optional().nullable(),
  customTo:   z.string().optional().nullable(),
});
