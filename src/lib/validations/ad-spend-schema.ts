import { z } from "zod";

// Rows arrive pre-parsed from the client-side Meta CSV parser
// (lib/utils/ad-spend-parse.ts). The action re-normalises campaign_key and
// re-sanitizes server-side — validation here only shapes and bounds the input.
const adSpendRowSchema = z.object({
  campaign_key: z
    .string()
    .min(1, "campaign_key_required")
    .max(300, "campaign_key_too_long"),
  spend_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "spend_date_invalid"),
  spend: z
    .number()
    .positive("spend_must_be_positive")
    .max(100_000_000, "spend_too_large"),
  results:     z.number().int().nonnegative().nullable(),
  impressions: z.number().int().nonnegative().nullable(),
  reach:       z.number().int().nonnegative().nullable(),
  link_clicks: z.number().int().nonnegative().nullable(),
});

export const uploadAdSpendSchema = z.object({
  rows: z
    .array(adSpendRowSchema)
    .min(1, "no_rows")
    .max(5000, "too_many_rows"),
  /** Zero-spend rows the parser dropped — echoed back in the summary */
  skipped: z.number().int().nonnegative(),
});

export type UploadAdSpendInput = z.infer<typeof uploadAdSpendSchema>;
