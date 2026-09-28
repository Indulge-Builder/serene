// hands-schema.ts — THE Zod schemas of the hands actions (Rule 02; docs/architecture/hands-plan.md).
// Issue messages are internal codes mapped to formErrors.hands* in actions/hands.ts, never shown raw.
import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";
import { TICKET_BRIEF_FIELDS, TICKET_CATEGORIES } from "@/lib/constants/tickets";
import { HANDS_TRUST_LEVELS } from "@/lib/constants/hands";
import { sanitizeText } from "@/lib/utils/sanitize";

const tickField = z.enum(TICKET_BRIEF_FIELDS as unknown as [string, ...string[]]);

export const OpenHandsThreadSchema = z.object({ ticketId: uuidField("handsTicketInvalid") });

export const OpenTalkThreadSchema = z.object({
  jid: z.string().trim().regex(/^\d{8,15}@s\.whatsapp\.net$/, "handsJidInvalid"),
});

export const DraftHandsMessageSchema = z.object({
  ticketId: uuidField("handsTicketInvalid"),
  tick: z.array(tickField).max(TICKET_BRIEF_FIELDS.length).default([]),
});

export const SendHandsMessageSchema = z.object({
  threadId: uuidField("handsThreadInvalid"),
  text: z.string().trim().min(1, "handsTextRequired").max(4000, "handsTextTooLong").transform(sanitizeText),
  /** The brief fields the approver ticked when this text came from a draft (delivery_address). */
  tick: z.array(tickField).max(TICKET_BRIEF_FIELDS.length).default([]),
  /** True when the text is the draft the filter built (the disclosure record then carries the fields). */
  fromDraft: z.boolean().default(false),
});

export const MarkHandsPaymentSchema = z.object({
  messageId: uuidField("handsMessageInvalid"),
  amountInr: z.number().positive("handsAmountInvalid").max(10_000_000, "handsAmountInvalid"),
});

export const HandsThreadIdSchema = z.object({ threadId: uuidField("handsThreadInvalid") });

export const UpsertAllowedContactSchema = z.object({
  jid: z.string().trim().regex(/^\d{8,15}@s\.whatsapp\.net$/, "handsJidInvalid"),
  label: z.string().trim().min(1, "handsLabelRequired").max(80, "handsLabelRequired").transform(sanitizeText),
  vendorId: uuidField("handsVendorInvalid").nullable(),
  isActive: z.boolean().default(true),
});

export const UpdateHandsSettingsSchema = z.object({
  enabled: z.boolean(),
  trustByCategory: z.record(z.enum(TICKET_CATEGORIES.zodEnum), z.enum(HANDS_TRUST_LEVELS.zodEnum)),
  perJobCapInr: z.number().int().min(0).max(10_000_000),
  dailyCapInr: z.number().int().min(0).max(100_000_000),
  monthlyCapInr: z.number().int().min(0).max(1_000_000_000),
});
