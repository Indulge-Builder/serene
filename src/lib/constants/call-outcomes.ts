import type { CallOutcome } from "@/lib/types/database";
import { defineEnum } from "./define-enum";

// Explicit annotations keep the exhaustiveness check against the database union.
const CALL_OUTCOME_DEF = defineEnum([
  { id: "rnr",          label: "Rang, no response"    },
  { id: "switched_off", label: "Phone switched off"   },
  { id: "wrong_number", label: "Wrong number"         },
  { id: "conversing",   label: "Had a conversation"   },
  { id: "other",        label: "Other"                },
]);

export const CALL_OUTCOMES: CallOutcome[] = CALL_OUTCOME_DEF.values;
export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = CALL_OUTCOME_DEF.labels;
