import { z } from 'zod';
import { sanitizeText } from '@/lib/utils/sanitize';
import { normalizeToE164 } from '@/lib/utils/phone';
import { APP_DOMAINS } from '@/lib/constants/domains';

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

// ─────────────────────────────────────────────
// Update personal details (agent-collected enrichment)
// ─────────────────────────────────────────────
export const UpdatePersonalDetailsSchema = z.object({
  leadId:  z.string().uuid('Invalid lead ID'),
  details: z.record(z.string(), z.string()),
});

export type UpdatePersonalDetailsInput = z.infer<typeof UpdatePersonalDetailsSchema>;

// ─────────────────────────────────────────────
// Create manual lead (AddLeadModal)
// ─────────────────────────────────────────────
export const CreateManualLeadSchema = z.object({
  first_name: z.string().min(1, 'First name is required').transform(sanitizeText),
  last_name: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? sanitizeText(v) : null)),
  phone: z.string().min(1, 'Phone is required').transform((v) => {
    try {
      return normalizeToE164(v, 'IN');
    } catch {
      throw new z.ZodError([{
        code: 'custom',
        message: 'Please enter a valid phone number.',
        path: ['phone'],
      }]);
    }
  }),
  email: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .pipe(z.string().email('Please enter a valid email address.').nullable()),
  domain: z.enum(APP_DOMAINS as [string, ...string[]]),
  assigned_to: z.string().uuid('Invalid agent ID').optional().nullable(),
  manual_source: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? sanitizeText(v) : null)),
});

export type CreateManualLeadInput = z.infer<typeof CreateManualLeadSchema>;
