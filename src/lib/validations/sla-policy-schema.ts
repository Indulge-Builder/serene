import { z } from 'zod';
import { LEAD_STATUSES } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOMES } from '@/lib/constants/call-outcomes';

/**
 * CreateSlaPolicySchema — the /settings "New rule" form payload.
 *
 * A non-technical admin/founder authors a rule over the existing trigger
 * catalog. The rule CODE is NEVER user-supplied — the action system-generates
 * an inert `USR-<id>` code (see createSlaPolicyAction). This schema therefore
 * accepts NO `code` field at all, so a user can never smuggle a reserved
 * prefix (SLA-/CAD-/TASK-) that the engine treats specially (a CAD- code
 * silently becomes a self-re-arming daily task generator — the one footgun
 * that corrupts the engine).
 *
 * `triggerValue` is validated AGAINST the chosen `triggerKind` in a refine —
 * a status rule must carry a real LeadStatus, an outcome rule a real
 * CallOutcome, a task_due rule the only catalog category (`gia_followup`).
 * A value that can never fire would arm a timer that fires into STALE_FIRE
 * forever; rejecting it here (server-side, not just in the dropdown) is the
 * second footgun closed.
 *
 * Human-readable messages only — never Zod defaults.
 */
const LEAD_STATUS_SET = new Set<string>(LEAD_STATUSES);
const CALL_OUTCOME_SET = new Set<string>(CALL_OUTCOMES);
const TASK_DUE_VALUES = new Set<string>(['gia_followup']);

export const CreateSlaPolicySchema = z
  .object({
    triggerKind:   z.enum(['status', 'outcome', 'task_due'], {
      message: 'Choose what the rule watches.',
    }),
    triggerValue:  z.string().min(1, 'Choose a trigger value.'),
    recipientRole: z.enum(['agent', 'manager', 'founder'], {
      message: 'Choose who the rule notifies.',
    }),
    thresholdMinutes: z
      .number()
      .int('Threshold must be a whole number of minutes.')
      .min(0, 'Threshold cannot be negative.')
      .max(43_200, 'Threshold cannot exceed 30 days.'),
    hoursMode: z.enum(['agent_shift', 'business', 'clock'], {
      message: 'Choose an hours basis.',
    }),
    channels: z.array(z.enum(['in_app', 'whatsapp'])).max(2).default(['in_app']),
    active:   z.boolean().default(true),
  })
  .refine(
    (v) => {
      // trigger_value MUST be a real member of the chosen kind's catalog —
      // otherwise the armed timer can never match the lead and fires forever.
      if (v.triggerKind === 'status')   return LEAD_STATUS_SET.has(v.triggerValue);
      if (v.triggerKind === 'outcome')  return CALL_OUTCOME_SET.has(v.triggerValue);
      return TASK_DUE_VALUES.has(v.triggerValue); // task_due
    },
    { message: 'That trigger value is not valid for the chosen rule type.', path: ['triggerValue'] },
  );

export type CreateSlaPolicyInput = z.infer<typeof CreateSlaPolicySchema>;

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
