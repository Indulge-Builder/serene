import { z } from "zod";
import { formErrors } from "@/lib/validations/form-errors";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The client's side's messages behind an Activity chart mark (actions/jokers.ts). */
export const activityMessagesSchema = z.object({
  from: z.string().regex(DAY, formErrors.generic),
  to: z.string().regex(DAY, formErrors.generic),
  /** The groups in scope; null = every linked member group. */
  groupJids: z.array(z.string().min(1).max(100)).max(2000).nullable(),
  /** 0 = Sunday. */
  weekday: z.number().int().min(0).max(6).nullable(),
  hour: z.number().int().min(0).max(23).nullable(),
  search: z.string().trim().max(100).nullable(),
  offset: z.number().int().min(0).max(100_000),
}).refine((v) => v.from <= v.to, { message: formErrors.generic });

export type ActivityMessagesInput = z.infer<typeof activityMessagesSchema>;

/** The List's Fix: how the team reads a reply (actions/jokers.ts → correctReplyCore). */
export const correctReplySchema = z.object({
  replyId: z.string().uuid(formErrors.generic),
  choice: z.enum(["interested", "undecided", "not_interested", "replied", "not_a_reply"], { message: formErrors.generic }),
});
