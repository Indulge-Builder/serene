// THE Zod-parse + first-issue error mapper for server actions (dry-audit S2).
// Standardises the `parsed.error.issues[0]?.message ?? formErrors.generic` idiom.
import type { z } from 'zod';
import { formErrors } from '@/lib/validations/form-errors';

export function parseActionInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): { ok: true; data: z.infer<TSchema> } | { ok: false; error: string } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }
  return { ok: true, data: parsed.data };
}
