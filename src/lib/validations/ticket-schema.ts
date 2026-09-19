import { z } from "zod";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formErrors } from "./form-errors";
import { uuidField } from "./fields";
import { TICKET_CATEGORIES, TICKET_ORIGINS, TICKET_PRIORITIES, TICKET_RESOLUTIONS, TICKET_STATUSES, TICKET_REASSIGN_REASONS, TICKET_LINK_KINDS, TICKET_TAG_RE, TICKET_TAG_MAX } from "@/lib/constants/tickets";

// ─────────────────────────────────────────────
// Tickets — Zod schemas (migration 0195). Every action in actions/tickets.ts parses one
// of these FIRST (Rule 02). Human messages only (Q-04). Text sanitized here (Rule 06).
// ─────────────────────────────────────────────

const shortText = (max: number) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer.`).transform((v) => sanitizeText(v));
const optionalText = (max: number) =>
  shortText(max).transform((v) => (v.length ? v : null)).nullish().transform((v) => v ?? null);
const isoDateTime = z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Please enter a valid date.").nullish().transform((v) => v || null);

/** The typed brief. Every field optional; unknown keys dropped; the UI shows the ones that fit the category. */
export const TicketBriefSchema = z.object({
  pax: z.coerce.number().int().min(1).max(500).nullish(),
  date: isoDateTime,
  time: optionalText(40),
  date_to: isoDateTime,
  from_location: optionalText(160),
  to_location: optionalText(160),
  budget_inr: z.coerce.number().min(0).nullish(),
  budget_note: optionalText(200),
  product_details: optionalText(500),
  quantity: z.coerce.number().int().min(1).max(10000).nullish(),
  delivery_address: optionalText(400),
  delivery_contact: optionalText(160),
  preferred_vendor: optionalText(160),
  event_name: optionalText(160),
  duration: optionalText(80),
  luggage: optionalText(120),
  airport: optionalText(120),
  early_check_in: z.boolean().nullish(),
  assistance_required: optionalText(200),
  gift_specifications: optionalText(400),
  notes: optionalText(2000),
}).strip();
export type TicketBrief = z.infer<typeof TicketBriefSchema>;

export const MessageTripleSchema = z.object({
  chat_jid: z.string().trim().regex(/@g\.us$/, formErrors.generic),
  wa_message_id: z.string().trim().min(1),
  sender_jid: z.string().trim().min(1),
  link_kind: z.enum(TICKET_LINK_KINDS).default("origin"),
});

export const CreateTicketSchema = z.object({
  member_id: uuidField(formErrors.generic),
  category: z.enum(TICKET_CATEGORIES.zodEnum),
  sub_category: optionalText(60),
  title: shortText(160).pipe(z.string().min(1, "Give the request a title.")),
  brief: TicketBriefSchema.optional().transform((v) => v ?? {}),
  priority: z.enum(TICKET_PRIORITIES.zodEnum).default("medium"),
  requested_for: isoDateTime,
  origin: z.enum(TICKET_ORIGINS.zodEnum).default("manual"),
  group_jid: z.string().trim().regex(/@g\.us$/).nullish().transform((v) => v ?? null),
  assignee_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
  message_links: z.array(MessageTripleSchema).max(60).default([]),
  proposed_by_run_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
  /** A note written at creation (the "why" or the member's words). */
  note: optionalText(2000),
  /** Set when the ticket is created from an intake card (0219): the card is closed as accepted. */
  proposal_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

/** Intake cards (0219): dismiss with the reason (the training signal), or accept an update onto its ticket. */
export const DismissIntakeProposalSchema = z.object({
  proposal_id: uuidField(formErrors.generic),
  reason: z.enum(["not_a_request", "already_handled", "duplicate", "wrong_member", "other"]),
});
export const AcceptIntakeUpdateSchema = z.object({ proposal_id: uuidField(formErrors.generic) });

/** The human's answer to the sentinel's suggested status move. */
export const ResolveSentinelProposalSchema = z.object({ ticket_id: uuidField(formErrors.generic), decision: z.enum(["approve", "dismiss"]) });

export const TicketIdSchema = z.object({ ticket_id: uuidField(formErrors.generic) });

export const MoveTicketStatusSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  status: z.enum(TICKET_STATUSES.zodEnum),
  resolution: z.enum(TICKET_RESOLUTIONS.zodEnum).nullish().transform((v) => v ?? null),
  note: optionalText(2000),
  /** Moving into a vendor stage without one on the ticket: the vendor chosen in the same breath. */
  vendor_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
});

export const AssignTicketSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  assignee_id: uuidField(formErrors.generic).nullable(),
  reason: z.enum(TICKET_REASSIGN_REASONS.zodEnum).nullish().transform((v) => v ?? null),
  note: optionalText(500),
});

export const SetTicketPrioritySchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  priority: z.enum(TICKET_PRIORITIES.zodEnum),
  approve: z.boolean().default(true),
});

export const UpdateTicketBriefSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  title: shortText(160).pipe(z.string().min(1)).optional(),
  category: z.enum(TICKET_CATEGORIES.zodEnum).optional(),
  sub_category: optionalText(60).optional(),
  brief: TicketBriefSchema.optional(),
  requested_for: isoDateTime.optional(),
});

export const TickChecklistSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  index: z.coerce.number().int().min(0).max(99),
  done: z.boolean(),
});

export const AddTicketNoteSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  body: shortText(4000).pipe(z.string().min(1, formErrors.required)),
});

export const LinkTicketMessagesSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  messages: z.array(MessageTripleSchema).min(1).max(60),
});

export const UpdateTicketMoneySchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  quote_inr: z.coerce.number().min(0).nullish(),
  cost_inr: z.coerce.number().min(0).nullish(),
  price_inr: z.coerce.number().min(0).nullish(),
  payment_status: z.enum(["not_started", "requested", "paid", "waived"]).nullish(),
  invoice_no: optionalText(60),
});

/** The ticket creator: selected messages → a drafted ticket (the reasoning tier, masked). */
export const DraftTicketSchema = z.object({
  member_id: uuidField(formErrors.generic),
  group_jid: z.string().trim().regex(/@g\.us$/).nullish().transform((v) => v ?? null),
  messages: z.array(z.object({
    chat_jid: z.string().trim().min(1),
    wa_message_id: z.string().trim().min(1),
    sender_jid: z.string().trim().min(1),
    sender_name: z.string().trim().max(120).nullish(),
    from_member: z.boolean().default(true),
    at: z.string().trim(),
    text: z.string().trim().max(4000),
  })).min(1).max(60),
});
export type DraftTicketInput = z.infer<typeof DraftTicketSchema>;

export const ListTicketsSchema = z.object({
  status: z.array(z.enum(TICKET_STATUSES.zodEnum)).default([]),
  queendom_id: uuidField(formErrors.generic).nullish(),
  assignee_id: uuidField(formErrors.generic).nullish(),
  category: z.enum(TICKET_CATEGORIES.zodEnum).nullish(),
  search: optionalText(80),
  page: z.coerce.number().int().min(1).default(1),
});

// ─── Tags, sub-work and settings (0200) ──────────────────────────────────────

const tagField = z.string().trim().toLowerCase().transform((v) => v.replace(/\s+/g, "-")).pipe(z.string().regex(TICKET_TAG_RE, "A tag is letters, digits and dashes, up to 30 characters."));

export const UpdateTicketTagsSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  tags: z.array(tagField).max(TICKET_TAG_MAX, `Up to ${TICKET_TAG_MAX} tags.`).transform((xs) => [...new Set(xs)]),
});

export const CreateTicketTaskSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  title: z.string().trim().min(1, formErrors.required).max(255).transform((v) => sanitizeText(v)),
  assigned_to: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
  priority: z.enum(["urgent", "high", "normal"]).default("normal"),
  due_at: z.string().datetime({ offset: true }).nullish().transform((v) => v ?? null),
});

const minutes = (max: number) => z.coerce.number().int().min(0).max(max);
export const UpsertTicketSlaPolicySchema = z.object({
  id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
  queendom_id: uuidField(formErrors.generic).nullish().transform((v) => v ?? null),
  category: z.string().trim().max(40).nullish().transform((v) => (v ? v : null)),
  sub_category: z.string().trim().max(40).nullish().transform((v) => (v ? v : null)),
  priority: z.enum(TICKET_PRIORITIES.zodEnum).nullish().transform((v) => v ?? null),
  first_response_min: minutes(10_080),
  update_cadence_min: minutes(20_160),
  vendor_silence_min: minutes(20_160),
  member_silence_min: minutes(20_160),
  resolve_target_min: minutes(43_200),
  business_hours: z.boolean().default(true),
  escalation: z.array(z.object({ after_min: minutes(20_160), to: z.enum(["bishop", "queen", "founder"]) })).max(5).default([]),
  is_active: z.boolean().default(true),
});
export type UpsertTicketSlaPolicyInput = z.infer<typeof UpsertTicketSlaPolicySchema>;

export const DeleteTicketSlaPolicySchema = z.object({ id: uuidField(formErrors.generic) });

export const UpdateTicketSettingsSchema = z.object({
  status_labels: z.record(z.enum(TICKET_STATUSES.zodEnum), z.string().trim().max(30)).optional(),
  tags: z.array(tagField).max(60).transform((xs) => [...new Set(xs)]).optional(),
}).refine((v) => v.status_labels !== undefined || v.tags !== undefined, { message: formErrors.generic });
export type UpdateTicketSettingsInput = z.infer<typeof UpdateTicketSettingsSchema>;

/** The vendor on a ticket (ticket-vendor.ts). null takes the vendor off. */
export const SetTicketVendorSchema = z.object({ ticket_id: uuidField(formErrors.generic), vendor_id: uuidField(formErrors.generic).nullable() });
export const SearchTicketVendorsSchema = z.object({ ticket_id: uuidField(formErrors.generic), q: z.string().trim().min(2).max(80) });

/** After a ticket is resolved: how it went and how the vendor did (1 to 5 each, any subset, or just words). */
const rating = z.coerce.number().int().min(1).max(5).nullish().transform((v) => v ?? null);
export const ReviewTicketVendorSchema = z.object({
  ticket_id: uuidField(formErrors.generic),
  speed: rating, quality: rating, pricing: rating, reliability: rating,
  comment: optionalText(2000),
}).refine((v) => v.speed != null || v.quality != null || v.pricing != null || v.reliability != null || v.comment != null, { message: "Give at least one rating or a few words." });
