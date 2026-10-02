// hands-schema.ts — THE Zod schemas of the hands actions (Rule 02; docs/architecture/hands-plan.md).
// Issue messages are internal codes mapped to formErrors.hands* in actions/hands.ts, never shown raw.
import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";
import { TICKET_BRIEF_FIELDS, TICKET_CATEGORIES } from "@/lib/constants/tickets";
import { HANDS_TRUST_LEVELS, HANDS_GUIDE_MAX_CHARS, HANDS_FEEDBACK_MAX_CHARS } from "@/lib/constants/hands";
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

const guideKind = z.enum(["rulebook", "elaya_guide"]);

export const SaveHandsGuideSchema = z.object({
  kind: guideKind,
  body: z.string().trim().min(1, "handsGuideRequired").max(HANDS_GUIDE_MAX_CHARS, "handsGuideTooLong"),
  note: z.string().trim().max(500).nullable().default(null),
});

export const RestoreHandsGuideSchema = z.object({
  kind: guideKind,
  version: z.number().int().min(0, "handsGuideVersionInvalid"),
});

export const ImproveHandsGuidesSchema = z.object({
  feedback: z.string().trim().min(1, "handsFeedbackRequired").max(HANDS_FEEDBACK_MAX_CHARS, "handsFeedbackTooLong").transform(sanitizeText),
  threadId: uuidField("handsThreadInvalid").nullable().default(null),
});

export const WriteHandsLineSchema = z.object({
  threadId: uuidField("handsThreadInvalid"),
  instruction: z.string().trim().min(1, "handsInstructionRequired").max(1000, "handsFeedbackTooLong").transform(sanitizeText),
});

export const StartHandsForTicketSchema = z.object({
  ticketId: uuidField("handsTicketInvalid"),
  /** Send to the agent even when Elaya judged it cannot help (the team knows better). */
  insist: z.boolean().default(false),
});

export const SendHandsTicketLineSchema = z.object({
  ticketId: uuidField("handsTicketInvalid"),
  text: z.string().trim().min(1, "handsTextRequired").max(4000, "handsTextTooLong").transform(sanitizeText),
  /** True when the text is Elaya's draft (edited or not), for the disclosure record. */
  fromDraft: z.boolean().default(false),
});
