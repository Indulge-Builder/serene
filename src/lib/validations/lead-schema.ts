import { z } from 'zod';
import { sanitizeText } from '@/lib/utils/sanitize';
import { normalizeToE164 } from '@/lib/utils/phone';

// ─────────────────────────────────────────────
// Webhook payload — POST /api/webhooks/leads
// ─────────────────────────────────────────────
export const LeadWebhookSchema = z.object({
  first_name: z.string().min(1, 'First name is required').transform(sanitizeText),
  last_name: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v) : null)),
  email: z
    .string()
    .email()
    .optional()
    .transform((v) => v || null),
  phone: z.string().min(1, 'Phone is required').transform((v) => {
    try {
      return normalizeToE164(v, 'IN');
    } catch {
      // Store raw phone rather than rejecting the lead — Pabbly formats vary.
      // Logged at warn level so we can identify and fix the source format.
      console.warn(`[lead-schema] Phone not E.164-normalizable, storing raw: "${v}"`);
      return v;
    }
  }),
  campaign_id: z
    .string()
    .optional()
    .transform((v) => v || null),
  ad_name: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v) : null)),
  platform: z
    .enum(['meta', 'google', 'website', 'whatsapp'])
    .optional()
    .transform((v) => v ?? null),
  utm_source: z
    .string()
    .optional()
    .transform((v) => v || null),
  utm_medium: z
    .string()
    .optional()
    .transform((v) => v || null),
  utm_campaign: z
    .string()
    .optional()
    .transform((v) => v || null),
  utm_content: z
    .string()
    .optional()
    .transform((v) => v || null),
  form_data: z.record(z.string(), z.unknown()).optional().default({}),
});

export type LeadWebhookInput = z.infer<typeof LeadWebhookSchema>;

// ─────────────────────────────────────────────
// Add call note (CalledModal submit)
// ─────────────────────────────────────────────
export const AddCallNoteSchema = z.object({
  leadId: z.string().uuid('Invalid lead ID'),
  content: z.string().min(1, 'Note content is required').transform(sanitizeText),
  callOutcome: z.enum(['rnr', 'switched_off', 'wrong_number', 'conversing', 'other']),
});

export type AddCallNoteInput = z.infer<typeof AddCallNoteSchema>;

// ─────────────────────────────────────────────
// Update lead status
// ─────────────────────────────────────────────
export const UpdateLeadStatusSchema = z.object({
  leadId: z.string().uuid('Invalid lead ID'),
  status: z.enum(['new', 'touched', 'in_discussion', 'won', 'nurturing', 'lost', 'junk']),
  reason: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v) : null)),
});

export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusSchema>;

// ─────────────────────────────────────────────
// Assign lead (manual reassign)
// ─────────────────────────────────────────────
export const AssignLeadSchema = z.object({
  leadId:  z.string().uuid('Invalid lead ID'),
  agentId: z.string().uuid('Invalid agent ID'),
});

export type AssignLeadInput = z.infer<typeof AssignLeadSchema>;

// ─────────────────────────────────────────────
// Update private scratchpad
// ─────────────────────────────────────────────
export const UpdateScratchpadSchema = z.object({
  leadId:  z.string().uuid('Invalid lead ID'),
  content: z.string().transform(sanitizeText),
});

export type UpdateScratchpadInput = z.infer<typeof UpdateScratchpadSchema>;
