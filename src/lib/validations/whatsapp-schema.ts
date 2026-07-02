import { z } from 'zod';
import { WHATSAPP_PERIODS } from '@/lib/constants/whatsapp-period';
import {
  resolveOutboundMediaType,
  WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES,
} from '@/lib/constants/whatsapp';
import { uuidField } from '@/lib/validations/fields';

// ─────────────────────────────────────────────
// Send media message (agent → lead, composer attach flow)
// Validates the uploaded File: a non-empty Blob, ≤16MB, MIME on the outbound
// allowlist. Human-readable errors only. Caption is optional.
// ─────────────────────────────────────────────

export const SendMediaMessageSchema = z.object({
  conversationId: uuidField('Invalid conversation ID'),
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
