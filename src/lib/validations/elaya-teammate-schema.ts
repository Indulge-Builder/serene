// elaya-teammate-schema.ts — the two writes on /settings/elaya-teammate (0257). Issue messages are
// internal codes mapped to formErrors in the action, never shown raw (Q-04).
import { z } from 'zod';
import { uuidField } from '@/lib/validations/fields';
import { INTERVENTION_PERSON_STATES, TEAMMATE_MODES } from '@/lib/constants/elaya-teammate';

export const SetInterventionStateSchema = z.object({
  id: uuidField('invalid'),
  state: z.enum(INTERVENTION_PERSON_STATES),
  note: z.string().trim().max(400, 'too_long').optional(),
});

export const SetTeammateModeSchema = z.object({
  mode: z.enum(TEAMMATE_MODES),
  queendomIds: z.array(uuidField('invalid')).max(50).default([]),
});
