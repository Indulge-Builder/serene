import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { formErrors } from "./form-errors";
import { uuidField, emailField } from "./fields";
import {
  VENDOR_STATUS_ENUM,
  VENDOR_CATEGORY_SOURCE_ENUM,
  CAPABILITY_STANCE_ENUM,
  ENGAGEMENT_OUTCOME_ENUM,
  VENDOR_SERVICE_ENUM,
  REVIEW_RATING_MIN,
  REVIEW_RATING_MAX,
  RANK_DEFAULT_LIMIT,
  RANK_MAX_LIMIT,
  VENDOR_SEARCH_DEFAULT_LIMIT,
  VENDOR_SEARCH_MAX_LIMIT,
  VENDOR_MAX_ALIASES,
  VENDOR_MAX_CONTACTS,
  VENDOR_MAX_CONTACT_PHONES,
  VENDOR_MAX_CONTACT_EMAILS,
  CAPABILITY_MAX_CITIES,
  ENGAGEMENT_MAX_INVOICES,
  VENDOR_NOTE_MAX_LENGTH,
  toVocabularyKey,
  PREFERENCE_STANCE_ENUM,
} from "@/lib/constants/vendors";

// ─────────────────────────────────────────────
// Vendors — Zod schemas (migrations 0183–0185). Every server action in
// actions/vendors.ts parses one of these FIRST (Rule 02). Human messages only
// (Q-04). Text is sanitized here (Rule 06); phones normalised to E.164 here
// (the lead-schema pattern — phone fields stay per-schema, fields.ts).
// ─────────────────────────────────────────────

const shortText = (max: number) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer.`).transform((v) => sanitizeText(v));

/** Optional free text → null when blank. */
const optionalText = (max: number) =>
  shortText(max).transform((v) => (v.length ? v : null)).nullish().transform((v) => v ?? null);

/**
 * A category label → its vocabulary key, via the SAME rule the loader uses, so
 * "Travel & Transport", "travel & transport" and "travel-transport" are one key
 * (`toVocabularyKey`). Lower-casing alone was not enough — it left the typed
 * form and the imported form as two different categories.
 */
const categoryField = z
  .string()
  .trim()
  .min(1, formErrors.vendorCategoryRequired)
  .max(80, "Category must be 80 characters or fewer.")
  .transform((v, ctx) => {
    const key = toVocabularyKey(sanitizeText(v));
    if (!key) {
      ctx.addIssue({ code: "custom", message: formErrors.vendorCategoryRequired });
      return z.NEVER;
    }
    return key;
  });

const optionalCategoryField = categoryField.nullish().transform((v) => v ?? null);

/** A city name, lower-cased — capabilities / engagements / the ranker compare on this. */
const cityField = shortText(120).transform((v) => v.toLowerCase());

const phoneField = z
  .string()
  .trim()
  .min(1, formErrors.vendorPhoneInvalid)
  .transform((v, ctx) => {
    try {
      return normalizeToE164(v, "IN");
    } catch {
      ctx.addIssue({ code: "custom", message: formErrors.vendorPhoneInvalid });
      return z.NEVER;
    }
  });

const ISO_DATETIME = z.string().datetime({ offset: true, message: formErrors.vendorDateInvalid });

const inrField = z
  .number({ message: formErrors.vendorAmountInvalid })
  .nonnegative(formErrors.vendorAmountInvalid)
  .max(100_000_000, "Amount seems too large.");

const ratingField = z
  .number({ message: formErrors.vendorRatingInvalid })
  .int(formErrors.vendorRatingInvalid)
  .min(REVIEW_RATING_MIN, formErrors.vendorRatingInvalid)
  .max(REVIEW_RATING_MAX, formErrors.vendorRatingInvalid)
  .nullish()
  .transform((v) => v ?? null);

const serviceField = z.enum(VENDOR_SERVICE_ENUM, { message: "Please choose a valid service." })
  .nullish()
  .transform((v) => v ?? null);

// ── Contacts ────────────────────────────────────────────────────────────────────
export const VendorContactSchema = z.object({
  name: optionalText(120),
  phones: z.array(phoneField).max(VENDOR_MAX_CONTACT_PHONES, `At most ${VENDOR_MAX_CONTACT_PHONES} phone numbers per contact.`).default([]),
  emails: z.array(emailField("Please enter a valid email address.")).max(VENDOR_MAX_CONTACT_EMAILS, `At most ${VENDOR_MAX_CONTACT_EMAILS} emails per contact.`).default([]),
});

// ── Vendor spine ────────────────────────────────────────────────────────────────
const vendorFields = {
  name: shortText(200).pipe(z.string().min(1, formErrors.vendorNameRequired)),
  aliases: z.array(shortText(120)).max(VENDOR_MAX_ALIASES, `At most ${VENDOR_MAX_ALIASES} aliases.`).default([]),
  category: optionalCategoryField,
  subcategory: optionalText(120),
  category_source: z.enum(VENDOR_CATEGORY_SOURCE_ENUM).nullish().transform((v) => v ?? null),
  contacts: z.array(VendorContactSchema).max(VENDOR_MAX_CONTACTS, `At most ${VENDOR_MAX_CONTACTS} contacts.`).default([]),
  primary_phone: phoneField.nullish().transform((v) => v ?? null),
  home_city: cityField.nullish().transform((v) => v ?? null),
  notes: optionalText(4000),
};

export const CreateVendorSchema = z.object(vendorFields);
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = z
  .object({ id: uuidField(formErrors.vendorNotFound) })
  .extend(
    // Every field optional on update; absent = untouched, explicit null = clear.
    Object.fromEntries(
      Object.entries(vendorFields).map(([k, schema]) => [k, schema.optional()]),
    ) as { [K in keyof typeof vendorFields]: z.ZodOptional<(typeof vendorFields)[K]> },
  )
  .refine(
    (v) => Object.keys(v).some((k) => k !== "id" && v[k as keyof typeof v] !== undefined),
    { message: formErrors.vendorNothingToUpdate },
  );
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;

export const SetVendorStatusSchema = z.object({
  id: uuidField(formErrors.vendorNotFound),
  status: z.enum(VENDOR_STATUS_ENUM, { message: formErrors.vendorStatusInvalid }),
});

export const VendorIdSchema = z.object({ id: uuidField(formErrors.vendorNotFound) });

/**
 * Merge one vendor into another. `keep_id` survives and absorbs; `merge_id` is
 * folded into it and its spine row is removed (0223). The refine guards the one
 * mistake that is easy to make in a picker and impossible to undo: choosing the
 * same row on both sides.
 */
export const MergeVendorsSchema = z
  .object({
    keep_id: uuidField(formErrors.vendorNotFound),
    merge_id: uuidField(formErrors.vendorNotFound),
  })
  .refine((v) => v.keep_id !== v.merge_id, {
    message: formErrors.vendorMergeSameRow,
    path: ["merge_id"],
  });
export type MergeVendorsInput = z.infer<typeof MergeVendorsSchema>;

/**
 * Remove a vendor from the product, or put it back (0223). One schema for both
 * directions so the restore path can never drift from the remove path.
 */
export const SetVendorDeletedSchema = z.object({
  id: uuidField(formErrors.vendorNotFound),
  deleted: z.boolean(),
});
export type SetVendorDeletedInput = z.infer<typeof SetVendorDeletedSchema>;

// ── Capabilities ───────────────────────────────────────────────────────────────
export const UpsertCapabilitySchema = z.object({
  vendor_id: uuidField(formErrors.vendorNotFound),
  category: categoryField,
  service: serviceField,
  stance: z.enum(CAPABILITY_STANCE_ENUM, { message: formErrors.vendorStanceInvalid }),
  cities: z.array(cityField).max(CAPABILITY_MAX_CITIES, `At most ${CAPABILITY_MAX_CITIES} cities.`).default([]),
  note: optionalText(500),
});
export type UpsertCapabilityInput = z.infer<typeof UpsertCapabilitySchema>;

export const DeleteCapabilitySchema = z.object({
  id: uuidField(formErrors.vendorCapabilityNotFound),
});

// ── Engagements (the ledger) ───────────────────────────────────────────────────
export const LogEngagementSchema = z
  .object({
    vendor_id: uuidField(formErrors.vendorNotFound),
    member_id: uuidField("Please pick a valid client.").nullish().transform((v) => v ?? null),
    lead_id: uuidField("Please pick a valid lead.").nullish().transform((v) => v ?? null),
    // The staff member who ran the job; defaults to the caller in the core.
    agent_id: uuidField("Please pick a valid teammate.").nullish().transform((v) => v ?? null),
    category: categoryField,
    service: serviceField,
    city: cityField.nullish().transform((v) => v ?? null),
    started_at: ISO_DATETIME,
    closed_at: ISO_DATETIME.nullish().transform((v) => v ?? null),
    outcome: z.enum(ENGAGEMENT_OUTCOME_ENUM, { message: formErrors.vendorOutcomeInvalid }).default("unknown"),
    amount_inr: inrField.nullish().transform((v) => v ?? null),
    note: optionalText(4000),
  })
  .refine((v) => !v.closed_at || new Date(v.closed_at) >= new Date(v.started_at), {
    message: "The job cannot close before it started.",
    path: ["closed_at"],
  });
export type LogEngagementInput = z.infer<typeof LogEngagementSchema>;

/** The one sanctioned write on an open ledger row (resolve-once, see 0185). */
export const CloseEngagementSchema = z.object({
  id: uuidField(formErrors.vendorEngagementNotFound),
  closed_at: ISO_DATETIME,
  outcome: z.enum(ENGAGEMENT_OUTCOME_ENUM, { message: formErrors.vendorOutcomeInvalid }),
  amount_inr: inrField.nullish().transform((v) => v ?? null),
  invoice_paths: z
    .array(z.string().trim().min(1).max(500))
    .max(ENGAGEMENT_MAX_INVOICES, `At most ${ENGAGEMENT_MAX_INVOICES} invoices.`)
    .default([]),
  note: optionalText(4000),
});
export type CloseEngagementInput = z.infer<typeof CloseEngagementSchema>;

// ── Reviews ────────────────────────────────────────────────────────────────────
export const AddReviewSchema = z
  .object({
    vendor_id: uuidField(formErrors.vendorNotFound),
    engagement_id: uuidField(formErrors.vendorEngagementNotFound).nullish().transform((v) => v ?? null),
    speed: ratingField,
    quality: ratingField,
    pricing: ratingField,
    reliability: ratingField,
    comment: optionalText(4000),
  })
  .refine(
    (v) => v.speed != null || v.quality != null || v.pricing != null || v.reliability != null || v.comment != null,
    { message: formErrors.vendorReviewEmpty },
  );
export type AddReviewInput = z.infer<typeof AddReviewSchema>;

// ── Reads ──────────────────────────────────────────────────────────────────────
export const SearchVendorsSchema = z.object({
  query: shortText(120).optional(),
  category: optionalCategoryField,
  status: z.enum(VENDOR_STATUS_ENUM).nullish().transform((v) => v ?? null),
  limit: z.number().int().min(1).max(VENDOR_SEARCH_MAX_LIMIT).default(VENDOR_SEARCH_DEFAULT_LIMIT),
});
export type SearchVendorsInput = z.infer<typeof SearchVendorsSchema>;

export const RankVendorsSchema = z.object({
  /**
   * The request in the requester's own words — searched against past ticket
   * titles (0189). With this present nothing else is required: "order for
   * black forest cake" names no category, service or city and must still work.
   */
  phrase: z.string().trim().max(300, "Keep the request under 300 characters.")
    .nullish().transform((v) => (v && v.length ? sanitizeText(v) : null)),
  category: optionalCategoryField,
  service: serviceField,
  city: cityField.nullish().transform((v) => v ?? null),
  member_id: uuidField("Please pick a valid client.").nullish().transform((v) => v ?? null),
  // Whose preferences shape the answer — defaults to the caller in the action.
  limit: z.number().int().min(1).max(RANK_MAX_LIMIT).default(RANK_DEFAULT_LIMIT),
});
export type RankVendorsInput = z.infer<typeof RankVendorsSchema>;

// ── Notes (migration 0186) ─────────────────────────────────────────────────────
export const AddVendorNoteSchema = z.object({
  vendor_id: uuidField(formErrors.vendorNotFound),
  content: z
    .string()
    .trim()
    .min(1, formErrors.vendorNoteRequired)
    .max(VENDOR_NOTE_MAX_LENGTH, formErrors.vendorNoteTooLong)
    // Rule 06 — sanitize before the DB ever sees it.
    .transform((v) => sanitizeText(v))
    .pipe(z.string().min(1, formErrors.vendorNoteRequired)),
});
export type AddVendorNoteInput = z.infer<typeof AddVendorNoteSchema>;

/** A teammate's sticky note on a vendor (0191): preferred / avoid + why. */
export const SetAgentPreferenceSchema = z.object({
  vendor_id: uuidField(formErrors.vendorNotFound),
  // Whose stance — defaults to the caller in the action.
  agent_id: uuidField("Please pick a valid teammate.").nullish().transform((v) => v ?? null),
  stance: z.enum(PREFERENCE_STANCE_ENUM, { message: formErrors.vendorPreferenceInvalid }),
  note: optionalText(500),
});
export type SetAgentPreferenceInput = z.infer<typeof SetAgentPreferenceSchema>;

export const RemoveAgentPreferenceSchema = z.object({
  vendor_id: uuidField(formErrors.vendorNotFound),
  agent_id: uuidField("Please pick a valid teammate.").nullish().transform((v) => v ?? null),
});
export type RemoveAgentPreferenceInput = z.infer<typeof RemoveAgentPreferenceSchema>;

/** Mirrors subscriptions' SignInvoiceSchema — a bucket path, never a url. */
export const SignVendorInvoiceSchema = z.object({
  path: z.string().min(1).max(500),
});
