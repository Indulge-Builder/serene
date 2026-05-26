import type { CallOutcome } from "@/lib/types/database";

export const CALL_OUTCOMES: CallOutcome[] = [
  'rnr',
  'switched_off',
  'wrong_number',
  'conversing',
  'other',
];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  rnr:           'Rang, no response',
  switched_off:  'Phone switched off',
  wrong_number:  'Wrong number',
  conversing:    'Had a conversation',
  other:         'Other',
};
