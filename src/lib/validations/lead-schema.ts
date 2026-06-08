import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { GIA_DOMAIN_ENUM } from "@/lib/constants/domains";
import { LEAD_SOURCE_ENUM } from "@/lib/constants/lead-sources";

// ─────────────────────────────────────────────
// Add call note (CalledModal submit)
// ─────────────────────────────────────────────
export const AddCallNoteSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  content: z
    .string()
    .min(1, "Note content is required")
    .transform(sanitizeText),
  callOutcome: z.enum([
    "rnr",
    "switched_off",
    "wrong_number",
    "conversing",
    "other",
  ]),
});

export type AddCallNoteInput = z.infer<typeof AddCallNoteSchema>;

// ─────────────────────────────────────────────
// Update lead status
// ─────────────────────────────────────────────
export const UpdateLeadStatusSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  status: z.enum([
    "new",
    "touched",
    "in_discussion",
    "won",
    "nurturing",
    "lost",
    "junk",
  ]),
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
  leadId: z.string().uuid("Invalid lead ID"),
  agentId: z.string().uuid("Invalid agent ID"),
});

export type AssignLeadInput = z.infer<typeof AssignLeadSchema>;

// ─────────────────────────────────────────────
// Update personal details (agent-collected enrichment)
// ─────────────────────────────────────────────
export const UpdatePersonalDetailsSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  details: z.record(z.string(), z.string()),
});

export type UpdatePersonalDetailsInput = z.infer<
  typeof UpdatePersonalDetailsSchema
>;

// ─────────────────────────────────────────────
// Create manual lead (AddLeadModal)
// ─────────────────────────────────────────────
export const CreateManualLeadSchema = z.object({
  first_name: z
    .string()
    .min(1, "First name is required")
    .transform(sanitizeText),
  last_name: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? sanitizeText(v) : null)),
  phone: z
    .string()
    .min(1, "Phone is required")
    .transform((v) => {
      try {
        return normalizeToE164(v, "IN");
      } catch {
        throw new z.ZodError([
          {
            code: "custom",
            message: "Please enter a valid phone number.",
            path: ["phone"],
          },
        ]);
      }
    }),
  email: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .pipe(z.string().email("Please enter a valid email address.").nullable()),
  domain: z.enum(GIA_DOMAIN_ENUM),
  assigned_to: z.string().uuid("Invalid agent ID").optional().nullable(),
  source: z.preprocess(
    (v) => {
      if (typeof v !== "string" || !v.trim()) return null;
      return sanitizeText(v.trim().toLowerCase());
    },
    z.enum(LEAD_SOURCE_ENUM).nullable().optional(),
  ),
});

export type CreateManualLeadInput = z.infer<typeof CreateManualLeadSchema>;

// ─────────────────────────────────────────────
// Lead dossier — per-field inline edits (LeadInfoCard)
// ─────────────────────────────────────────────
export const UpdateLeadEmailSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  email: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .pipe(
      z.union([
        z.string().email("Please enter a valid email address."),
        z.null(),
      ]),
    ),
});

export type UpdateLeadEmailInput = z.infer<typeof UpdateLeadEmailSchema>;

export const UpdateLeadDomainSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  domain: z.enum(GIA_DOMAIN_ENUM),
});

export type UpdateLeadDomainInput = z.infer<typeof UpdateLeadDomainSchema>;

export const UpdateLeadSourceSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  source: z.enum(LEAD_SOURCE_ENUM).nullable(),
});

export type UpdateLeadSourceInput = z.infer<typeof UpdateLeadSourceSchema>;

export const UpdateLeadCitySchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  city: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? sanitizeText(v.trim()) : null)),
});

export type UpdateLeadCityInput = z.infer<typeof UpdateLeadCitySchema>;

// ─────────────────────────────────────────────
// Record deal (WonDealModal — fired when marking a lead Won)
// Canonical schema lives in deal-schema.ts; re-exported here for back-compat.
// ─────────────────────────────────────────────
export { RecordDealSchema, type RecordDealInput } from '@/lib/validations/deal-schema';

// ─────────────────────────────────────────────
// Add plain lead note (LeadNotesInput — visible to all team members)
// ─────────────────────────────────────────────

export const AddLeadNoteSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  content: z
    .string()
    .min(1, "Note content is required")
    .max(2000)
    .transform(sanitizeText),
});

export type AddLeadNoteInput = z.infer<typeof AddLeadNoteSchema>;

// ─────────────────────────────────────────────
// Create Gia follow-up task from the lead dossier (CreateLeadTaskModal)
// ─────────────────────────────────────────────
export const CreateLeadTaskSchema = z.object({
  leadId: z.string().uuid("Invalid lead ID"),
  taskType: z.enum(["call", "whatsapp_message", "other"]),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or fewer.")
    .optional()
    .transform((v) => (v && v.trim() ? sanitizeText(v) : null)),
  priority: z.enum(["urgent", "high", "normal"]).default("normal"),
  dueAt: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v : null)),
});

export type CreateLeadTaskInput = z.infer<typeof CreateLeadTaskSchema>;

// ─────────────────────────────────────────────
// Lead search for CreateGiaTaskModal
// ─────────────────────────────────────────────
export const SearchLeadsSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(100)
    .transform((v) => v.trim()),
});

export type SearchLeadsInput = z.infer<typeof SearchLeadsSchema>;

// ─────────────────────────────────────────────
// Export leads (ExportButton / LeadsSelectionToolbar)
// ─────────────────────────────────────────────
export const ExportLeadsSchema = z.object({
  filters: z.object({
    status:            z.array(z.string()).nullable().optional(),
    last_call_outcome: z.array(z.string()).nullable().optional(),
    domain:            z.string().nullable().optional(),
    agent_id:          z.string().uuid().nullable().optional(),
    source:            z.string().nullable().optional(),
    campaign:          z.string().nullable().optional(),
    date_from:         z.string().nullable().optional(),
    date_to:           z.string().nullable().optional(),
    search:            z.string().nullable().optional(),
    health:            z.enum(['healthy', 'needs_attention', 'at_risk']).nullable().optional(),
    sort_order:        z.enum(['asc', 'desc']).optional(),
    page:              z.number().optional(),
    pageSize:          z.number().optional(),
  }),
  selectedIds: z.array(z.string().uuid()).optional(),
});

export type ExportLeadsInput = z.infer<typeof ExportLeadsSchema>;
