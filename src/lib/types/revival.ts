// Lead-revival row types — hand-declared until `supabase gen types typescript` is
// re-run after migration 0119 is applied (the generated Database type does not know
// the revival_candidates / revival_policies tables yet). Shapes mirror the migration
// exactly. Types only — no runtime values.

import type { RevivalTriggerStatus } from "@/lib/constants/revival";

export type RevivalVerdict = "revive" | "unsure";
export type RevivalCandidateStatus = "open" | "actioned" | "dismissed";

export type RevivalCandidateRow = {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  verdict: RevivalVerdict;
  ai_reasoning: string;
  status: RevivalCandidateStatus;
  trigger_status: RevivalTriggerStatus;
  suggested_revive_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

export type RevivalPolicyRow = {
  trigger_status: RevivalTriggerStatus;
  silence_days: number;
  daily_cap_per_agent: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** The gate's structured verdict (parsed from the single-shot LLM response). */
export type RevivalGateVerdict = {
  verdict: RevivalVerdict;
  reasoning: string;
  /** ISO date-time the gate suggests reviving, or null when it declines to suggest. */
  suggestedReviveAt: string | null;
};
