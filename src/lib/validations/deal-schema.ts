import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { GIA_DOMAIN_ENUM } from "@/lib/constants/domains";
import { LEAD_SOURCE_ENUM } from "@/lib/constants/lead-sources";
import { DEAL_DURATION_ENUM, DEAL_CATEGORY_ENUM } from "@/lib/constants/deal-types";
import { uuidField, emailField } from "@/lib/validations/fields";

// ─────────────────────────────────────────────
// Shared deal field rules (reused by both schemas)
//
// NOTE: deal_type is NOT a form field. The type is DERIVED from the deal's
// domain server-side (DOMAIN_DEAL_CONFIG) — never client-supplied. A forged
// deal_type would be ignored. The form sends only the type-dependent extras
// (membership duration, retail category); the action resolves the domain's
// type and cross-validates these against it (assertDealShapeForDomain).
// ─────────────────────────────────────────────

const dealDurationField = z
  .enum(DEAL_DURATION_ENUM, {
    message: "Please select a membership duration.",
  })
  .nullable()
  .optional();

const dealCategoryField = z
  .enum(DEAL_CATEGORY_ENUM, {
    message: "Please select a product category.",
  })
  .nullable()
  .optional();

const dealAmountField = z
  .number({ message: "Please enter a valid amount." })
  .positive("Amount must be greater than zero.")
  .max(100_000_000, "Amount seems too large.");

// ─────────────────────────────────────────────
// RecordDealSchema — lead → deal path (WonDealModal)
// deal_type derives from the LEAD's domain in recordDeal — not in this schema
// (the lead's domain is not in the form input). The action runs the cross-field
// validation (assertDealShapeForDomain) once it has the lead row.
// Moved from lead-schema.ts; RecordDealSchema is re-exported there for back-compat.
// ─────────────────────────────────────────────
export const RecordDealSchema = z.object({
  leadId:        uuidField("Invalid lead ID"),
  deal_duration: dealDurationField,
  deal_category: dealCategoryField,
  deal_amount:   dealAmountField,
});

export type RecordDealInput = z.infer<typeof RecordDealSchema>;

// ─────────────────────────────────────────────
// CreateWalkInDealSchema — no lead (direct sales / walk-ins)
// contact_phone is validated as a string then normalised to E.164 in the action.
// domain must be a Gia domain (Q-17); deal_type derives from it in the action.
// ─────────────────────────────────────────────
export const CreateWalkInDealSchema = z.object({
  contact_name: z
    .string()
    .min(1, "Contact name is required.")
    .max(200)
    .transform((v) => sanitizeText(v.trim())),
  contact_phone: z
    .string()
    .min(7, "Please enter a valid phone number.")
    .max(20),
  contact_email: emailField("Please enter a valid email address.")
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null)),
  domain:      z.enum(GIA_DOMAIN_ENUM, { message: "Please select a valid domain." }),
  assigned_to: uuidField("Invalid agent ID.").nullable().optional(),
  source:      z.enum(LEAD_SOURCE_ENUM).nullable().optional(),
  won_at:      z.string().datetime({ message: "Please select a valid date." }).optional(),
  deal_duration: dealDurationField,
  deal_category: dealCategoryField,
  deal_amount:   dealAmountField,
});

export type CreateWalkInDealInput = z.infer<typeof CreateWalkInDealSchema>;
