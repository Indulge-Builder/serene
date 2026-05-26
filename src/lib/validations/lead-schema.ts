import { z } from 'zod';
import { sanitizeText } from '@/lib/utils/sanitize';

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
