import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { formErrors } from "./form-errors";
import { uuidField, emailField } from "./fields";
import { CLIENT_FACETS, CLIENT_TIERS, CLIENT_STATUSES, FACT_POLARITIES } from "@/lib/constants/member-facets";

// ─────────────────────────────────────────────
// Members — Zod schemas (migration 0194). Every action in actions/members.ts
// parses one of these FIRST (Rule 02). Human messages only (Q-04). Text is
// sanitized here (Rule 06); phones normalised to E.164 here.
// ─────────────────────────────────────────────

const shortText = (max: number) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer.`).transform((v) => sanitizeText(v));
const optionalText = (max: number) =>
  shortText(max).transform((v) => (v.length ? v : null)).nullish().transform((v) => v ?? null);

const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    try {
      return normalizeToE164(v);
    } catch {
      ctx.addIssue({ code: "custom", message: formErrors.phoneInvalid });
      return z.NEVER;
    }
  })
  .nullish()
  .transform((v) => v ?? null);

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a date as YYYY-MM-DD.")
  .nullish()
  .transform((v) => v || null);

export const MemberIdSchema = z.object({ member_id: uuidField(formErrors.generic) });

export const CreateMemberSchema = z.object({
  full_name: shortText(120).pipe(z.string().min(1, formErrors.fullNameRequired)),
  primary_phone: phoneField,
  queendom_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
  tier: z.enum(CLIENT_TIERS.zodEnum).nullish().transform((v) => v ?? null),
  membership_status: z.enum(CLIENT_STATUSES.zodEnum).nullish().transform((v) => v ?? "Active"),
  membership_start: isoDate,
  membership_end: isoDate,
  membership_amount_inr: z.coerce.number().int().min(0).nullish().transform((v) => v ?? null),
  email: emailField(formErrors.email).nullish().transform((v) => v ?? null),
  city: optionalText(80),
});

export const UpdateMemberSchema = z.object({
  member_id: uuidField(formErrors.generic),
  full_name: shortText(120).pipe(z.string().min(1, formErrors.fullNameRequired)).optional(),
  primary_phone: phoneField.optional(),
  queendom_id: uuidField(formErrors.generic).nullable().optional(),
  tier: z.enum(CLIENT_TIERS.zodEnum).nullable().optional(),
  membership_status: z.enum(CLIENT_STATUSES.zodEnum).optional(),
  membership_start: isoDate.optional(),
  membership_end: isoDate.optional(),
  membership_amount_inr: z.coerce.number().int().min(0).nullable().optional(),
  freshdesk_contact_id: z.string().trim().regex(/^\d{5,}$/, "A Freshdesk id is a number.").nullable().optional(),
  zoho_customer_id: z.string().trim().regex(/^\d{5,}$/, "A Zoho id is a number.").nullable().optional(),
  app_member_id: z.string().trim().regex(/^[a-f0-9]{24}$/i, "An app member id is 24 characters.").nullable().optional(),
  wa_invite_link: z.string().trim().url("Please paste the full WhatsApp invite link.").nullable().optional(),
});

export const AddMemberFactSchema = z.object({
  member_id: uuidField(formErrors.generic),
  facet: z.enum(CLIENT_FACETS.zodEnum),
  key: shortText(60).transform((v) => v.toLowerCase().replace(/\s+/g, "_")),
  value: shortText(2000).pipe(z.string().min(1, formErrors.required)),
  polarity: z.enum(FACT_POLARITIES).default("neutral"),
  /** When correcting, the fact this one replaces. */
  supersedes_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
});

/** The Observation box: one free-form sentence or paragraph about the member. */
export const AddMemberObservationSchema = z.object({
  member_id: uuidField(formErrors.generic),
  text: shortText(2000).pipe(z.string().min(3, formErrors.required)),
});

export const AddMemberPersonSchema = z.object({
  member_id: uuidField(formErrors.generic),
  name: shortText(100).pipe(z.string().min(1, formErrors.fullNameRequired)),
  relation: z.enum(["primary", "spouse", "partner", "child", "parent", "sibling", "staff", "other"]),
  phone_e164: phoneField,
  email: emailField(formErrors.email).nullish().transform((v) => v ?? null),
  can_request: z.boolean().default(true),
  note: optionalText(300),
});

export const UpdateMemberPersonSchema = AddMemberPersonSchema.partial().extend({
  person_id: uuidField(formErrors.generic),
  member_id: uuidField(formErrors.generic),
});

export const DeleteMemberPersonSchema = z.object({
  person_id: uuidField(formErrors.generic),
  member_id: uuidField(formErrors.generic),
});

export const LinkMemberGroupSchema = z.object({
  member_id: uuidField(formErrors.generic),
  group_jid: z.string().trim().regex(/@g\.us$/, formErrors.generic),
});

export const UnlinkMemberGroupSchema = z.object({
  member_id: uuidField(formErrors.generic),
  group_jid: z.string().trim().regex(/@g\.us$/, formErrors.generic),
});

export const HealthAdjustSchema = z.object({
  member_id: uuidField(formErrors.generic),
  delta: z.coerce.number().int().min(-20).max(20),
  note: shortText(300).pipe(z.string().min(1, formErrors.required)),
});

export const SearchMembersSchema = z.object({
  q: shortText(80),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type AddMemberFactInput = z.infer<typeof AddMemberFactSchema>;
export type AddMemberObservationInput = z.infer<typeof AddMemberObservationSchema>;
export type AddMemberPersonInput = z.infer<typeof AddMemberPersonSchema>;
export type UpdateMemberPersonInput = z.infer<typeof UpdateMemberPersonSchema>;
