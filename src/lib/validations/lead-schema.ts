import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { GIA_DOMAIN_ENUM } from "@/lib/constants/domains";
import { LEAD_SOURCE_ENUM } from "@/lib/constants/lead-sources";
import { CALL_OUTCOME_ENUM } from "@/lib/constants/call-outcomes";
import { LEAD_STATUS_ENUM } from "@/lib/constants/lead-statuses";
import { uuidField, emailField } from "@/lib/validations/fields";

// ─────────────────────────────────────────────
// Add call note (CalledModal submit)
// ─────────────────────────────────────────────
export const AddCallNoteSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  content: z
    .string()
    .min(1, "Note content is required")
    .transform(sanitizeText),
  callOutcome: z.enum(CALL_OUTCOME_ENUM),
});

export type AddCallNoteInput = z.infer<typeof AddCallNoteSchema>;

// ─────────────────────────────────────────────
// Update lead status
// ─────────────────────────────────────────────
export const UpdateLeadStatusSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  status: z.enum(LEAD_STATUS_ENUM),
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
  leadId: uuidField("Invalid lead ID"),
  agentId: uuidField("Invalid agent ID"),
});

export type AssignLeadInput = z.infer<typeof AssignLeadSchema>;

// ─────────────────────────────────────────────
// Update personal details (agent-collected enrichment)
// ─────────────────────────────────────────────
export const UpdatePersonalDetailsSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
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
    .pipe(emailField("Please enter a valid email address.").nullable()),
  domain: z.enum(GIA_DOMAIN_ENUM),
  assigned_to: uuidField("Invalid agent ID").optional().nullable(),
  source: z.preprocess(
    (v) => {
      if (typeof v !== "string" || !v.trim()) return null;
      return sanitizeText(v.trim().toLowerCase());
    },
    z.enum(LEAD_SOURCE_ENUM).nullable().optional(),
  ),
  // Optional multi-select (call-intelligence Phase 1.1). Bounded + normalised
  // here; out-of-vocabulary values are DROPPED (never rejected) in the action
  // against the RESOLVED domain via extractServiceInterests — the schema
  // cannot know the final domain (agents are pinned to their own server-side).
  service_interests: z
    .array(z.string().trim().toLowerCase().max(40))
    .max(12, "Too many interests selected.")
    .optional()
    .default([]),
});

export type CreateManualLeadInput = z.infer<typeof CreateManualLeadSchema>;

// ─────────────────────────────────────────────
// Bulk update leads (LeadsTable selection → BulkEditLeadsModal)
//
// One action edits one OR MORE fields across the selected leads. The four
// editable fields each reuse the SAME write path as the single-edit equivalent
// (assignLeadCore / updateLeadStatusCore / updateLeadSource / updateLeadDomain).
//
// Status is bounded to the non-terminal set here: won/lost/junk are excluded
// from bulk because each needs per-lead context single-edit owns (won → the deal
// flow, lost/junk → a resolution reason). Those stay single-edit only.
// ─────────────────────────────────────────────
export const BULK_STATUS_ENUM = [
  "new",
  "touched",
  "in_discussion",
  "nurturing",
] as const;

export const BulkUpdateLeadsSchema = z
  .object({
    leadIds: z
      .array(uuidField("Invalid lead ID"))
      .min(1, "Select at least one lead.")
      .max(500, "Too many leads selected. Narrow the selection to 500 or fewer."),
    changes: z
      .object({
        assignedTo: uuidField("Invalid agent ID").optional(),
        status: z.enum(BULK_STATUS_ENUM).optional(),
        source: z.enum(LEAD_SOURCE_ENUM).optional(),
        domain: z.enum(GIA_DOMAIN_ENUM).optional(),
      })
      .refine(
        (c) =>
          c.assignedTo !== undefined ||
          c.status !== undefined ||
          c.source !== undefined ||
          c.domain !== undefined,
        { message: "Choose at least one field to update." },
      ),
  });

export type BulkUpdateLeadsInput = z.infer<typeof BulkUpdateLeadsSchema>;

// ─────────────────────────────────────────────
// Lead dossier — per-field inline edits (LeadInfoCard)
// ─────────────────────────────────────────────
export const UpdateLeadEmailSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  email: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .pipe(
      z.union([
        emailField("Please enter a valid email address."),
        z.null(),
      ]),
    ),
});

export type UpdateLeadEmailInput = z.infer<typeof UpdateLeadEmailSchema>;

export const UpdateLeadDomainSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  domain: z.enum(GIA_DOMAIN_ENUM),
});

export type UpdateLeadDomainInput = z.infer<typeof UpdateLeadDomainSchema>;

export const UpdateLeadSourceSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  source: z.enum(LEAD_SOURCE_ENUM).nullable(),
});

export type UpdateLeadSourceInput = z.infer<typeof UpdateLeadSourceSchema>;

export const UpdateLeadCitySchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  city: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? sanitizeText(v.trim()) : null)),
});

export type UpdateLeadCityInput = z.infer<typeof UpdateLeadCitySchema>;

export const UpdateLeadInterestsSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
  // Bounded/normalised here; out-of-vocabulary values are DROPPED in the
  // action against the lead's domain via extractServiceInterests — same
  // contract as CreateManualLeadSchema.service_interests.
  interests: z
    .array(z.string().trim().toLowerCase().max(40))
    .max(12, "Too many interests selected.")
    .default([]),
});

export type UpdateLeadInterestsInput = z.infer<typeof UpdateLeadInterestsSchema>;

// ─────────────────────────────────────────────
// Record deal (WonDealModal — fired when marking a lead Won)
// Canonical schema lives in deal-schema.ts; re-exported here for back-compat.
// ─────────────────────────────────────────────
export { RecordDealSchema, type RecordDealInput } from '@/lib/validations/deal-schema';

// ─────────────────────────────────────────────
// Add plain lead note (LeadNotesInput — visible to all team members)
// ─────────────────────────────────────────────

export const AddLeadNoteSchema = z.object({
  leadId: uuidField("Invalid lead ID"),
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
  leadId: uuidField("Invalid lead ID"),
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
    view:              z.enum(['mine', 'all']).nullable().optional(),
    sort_order:        z.enum(['asc', 'desc']).optional(),
    page:              z.number().optional(),
    pageSize:          z.number().optional(),
  }),
  selectedIds: z.array(z.string().uuid()).optional(),
});

export type ExportLeadsInput = z.infer<typeof ExportLeadsSchema>;
