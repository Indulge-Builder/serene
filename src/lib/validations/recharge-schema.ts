import { z } from "zod";
import { AD_ACCOUNT_KEY_VALUES } from "@/lib/constants/ad-accounts";

// Recharge entry — money sent to one Meta ad account. Admin/founder only.
// Issue messages are INTERNAL codes mapped to user-facing copy in
// actions/recharge.ts — never shown raw (Q-04).
//
// PII: `method` is a free-text LABEL only ('NEFT', 'Razorpay', 'Card'). Any
// value containing a 13–19 digit run (a card PAN, tolerant of space/hyphen
// grouping) is REJECTED here at the schema layer; the action re-sanitizes and
// the DB CHECK is the final backstop — no raw card number can persist.

/** Reject a 13–19 digit run even when grouped by spaces/hyphens (card PAN). */
const containsCardPan = (value: string): boolean =>
  /\d{13,19}/.test(value.replace(/[ -]/g, ""));

const labelField = (max: number, code: string) =>
  z
    .string()
    .trim()
    .max(max, `${code}_too_long`)
    .refine((v) => !containsCardPan(v), `${code}_card_pan`)
    .optional()
    .nullable();

export const createRechargeSchema = z.object({
  adAccount: z.enum(AD_ACCOUNT_KEY_VALUES as [string, ...string[]], {
    message: "ad_account_invalid",
  }),
  amount: z
    .number({ message: "amount_invalid" })
    .positive("amount_must_be_positive")
    .max(100_000_000, "amount_too_large"),
  currency: z
    .enum(["INR", "USD"], { message: "currency_invalid" })
    .default("INR"),
  // YYYY-MM-DD; the date input emits this shape.
  rechargedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "recharged_at_invalid"),
  method: labelField(80, "method"),
  note:   labelField(500, "note"),
});

export type CreateRechargeInput = z.infer<typeof createRechargeSchema>;
