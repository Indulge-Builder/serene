import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { GIA_DOMAIN_ENUM } from "@/lib/constants/domains";
import { LEAD_SOURCE_ENUM } from "@/lib/constants/lead-sources";

// ─────────────────────────────────────────────
// Shared deal field rules (reused by both schemas)
// ─────────────────────────────────────────────

const dealTypeField = z.enum(["membership", "retail"], {
  message: "Please select a deal type.",
});

const dealDurationField = z
  .enum(["3_months", "6_months", "1_year"], {
    message: "Please select a membership duration.",
  })
  .nullable()
  .optional();

const dealAmountField = z
  .number({ message: "Please enter a valid amount." })
  .positive("Amount must be greater than zero.")
  .max(100_000_000, "Amount seems too large.");

const membershipDurationRefine = (d: { deal_type: string; deal_duration?: string | null }) =>
  d.deal_type !== "membership" || d.deal_duration != null;

// ─────────────────────────────────────────────
// RecordDealSchema — lead → deal path (WonDealModal)
// Moved from lead-schema.ts; RecordDealSchema is re-exported there for back-compat.
// ─────────────────────────────────────────────
export const RecordDealSchema = z
  .object({
    leadId:        z.string().uuid("Invalid lead ID"),
    deal_type:     dealTypeField,
    deal_duration: dealDurationField,
    deal_amount:   dealAmountField,
  })
  .refine(membershipDurationRefine, {
    message: "Please select a membership duration.",
    path:    ["deal_duration"],
  });

export type RecordDealInput = z.infer<typeof RecordDealSchema>;

// ─────────────────────────────────────────────
// CreateWalkInDealSchema — no lead (direct sales / walk-ins)
// contact_phone is validated as a string then normalised to E.164 in the action.
// domain must be a Gia domain (Q-17).
// ─────────────────────────────────────────────
export const CreateWalkInDealSchema = z
  .object({
    contact_name: z
      .string()
      .min(1, "Contact name is required.")
      .max(200)
      .transform((v) => sanitizeText(v.trim())),
    contact_phone: z
      .string()
      .min(7, "Please enter a valid phone number.")
      .max(20),
    contact_email: z
      .string()
      .email("Please enter a valid email address.")
      .nullable()
      .optional()
      .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null)),
    domain:      z.enum(GIA_DOMAIN_ENUM, { message: "Please select a valid domain." }),
    assigned_to: z.string().uuid("Invalid agent ID.").nullable().optional(),
    source:      z.enum(LEAD_SOURCE_ENUM).nullable().optional(),
    won_at:      z.string().datetime({ message: "Please select a valid date." }).optional(),
    deal_type:     dealTypeField,
    deal_duration: dealDurationField,
    deal_amount:   dealAmountField,
  })
  .refine(membershipDurationRefine, {
    message: "Please select a membership duration.",
    path:    ["deal_duration"],
  });

export type CreateWalkInDealInput = z.infer<typeof CreateWalkInDealSchema>;
