import { z } from 'zod';

/**
 * UpdateSlaPolicySchema — the /settings follow-up engine panel edit payload.
 *
 * Only the operational knobs are writable: threshold, channels, hours basis,
 * active. Identity fields (code, trigger_kind/value, recipient_role,
 * auto_task) define WHAT a rule is and never change through the UI.
 *
 * Human-readable messages only — never Zod defaults (Rule: form-errors).
 */
export const UpdateSlaPolicySchema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Z]+-\d{2}[A-Z]$/, 'Unknown rule code.'),
    active: z.boolean().optional(),
    thresholdMinutes: z
      .number()
      .int('Threshold must be a whole number of minutes.')
      .min(0, 'Threshold cannot be negative.')
      .max(43_200, 'Threshold cannot exceed 30 days.')
      .optional(),
    channels: z
      .array(z.enum(['in_app', 'whatsapp']))
      .max(2)
      .optional(),
    hoursMode: z.enum(['agent_shift', 'business', 'clock']).optional(),
  })
  .refine(
    (v) =>
      v.active !== undefined ||
      v.thresholdMinutes !== undefined ||
      v.channels !== undefined ||
      v.hoursMode !== undefined,
    { message: 'Nothing to update.' },
  );

export type UpdateSlaPolicyInput = z.infer<typeof UpdateSlaPolicySchema>;
