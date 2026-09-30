// finance-schema.ts — THE Zod schemas of the finance actions (Rule 02; 0250). Every message is
// the copy a person reads (formErrors.finance*), never a Zod default.
import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";
import { formErrors } from "@/lib/validations/form-errors";
import { FINANCE_AMOUNT_MAX, FINANCE_DESCRIPTION_MAX, FINANCE_MAX_ITEMS } from "@/lib/constants/finance";
import { sanitizeText } from "@/lib/utils/sanitize";

const ticketId = z.coerce.number({ message: formErrors.financeTicketInvalid }).int(formErrors.financeTicketInvalid).positive(formErrors.financeTicketInvalid);
const optionalText = (max: number) => z.string().trim().max(max).transform(sanitizeText).nullable().optional().transform((v) => (v ? v : null));

export const DraftInvoiceSchema = z.object({
  ticketId,
  memberId: uuidField(formErrors.financeNoMember).nullable().optional(),
});

export const InvoiceItemSchema = z.object({
  description: z.string().trim().min(1, formErrors.financeDescriptionRequired).max(FINANCE_DESCRIPTION_MAX, formErrors.financeDescriptionRequired).transform(sanitizeText),
  amount: z.coerce.number({ message: formErrors.financeAmountInvalid }).positive(formErrors.financeAmountInvalid).max(FINANCE_AMOUNT_MAX, formErrors.financeAmountInvalid)
    .transform((n) => Math.round(n * 100) / 100),
  vendor: optionalText(200),
  mode: optionalText(120),
  noteId: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
});

export const CreateInvoiceSchema = z.object({
  ticketId,
  memberId: uuidField(formErrors.financeNoMember).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, formErrors.financeDateInvalid),
  items: z.array(InvoiceItemSchema).min(1, formErrors.financeItemsRequired).max(FINANCE_MAX_ITEMS, formErrors.financeItemsRequired),
  applyCredit: z.boolean().default(true),
});

export const InvoiceIdSchema = z.object({ invoiceId: uuidField(formErrors.financeTicketInvalid) });

export const ReleaseInvoiceSchema = z.object({
  invoiceId: uuidField(formErrors.financeTicketInvalid),
  reason: z.string().trim().min(3, formErrors.financeReasonRequired).max(300, formErrors.financeReasonRequired).transform(sanitizeText),
});

/** A Freshdesk API key is 20 letters and digits; a wider net keeps a future format working. */
export const SaveFreshdeskKeySchema = z.object({
  apiKey: z.string().trim().regex(/^[A-Za-z0-9_-]{12,80}$/, formErrors.financeKeyInvalid),
});

export const SearchInvoiceMemberSchema = z.object({ q: z.string().trim().max(80, formErrors.generic).transform(sanitizeText) });
