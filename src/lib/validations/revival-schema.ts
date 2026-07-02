import { z } from "zod";
import { REVIVAL_TRIGGER_STATUSES } from "@/lib/constants/revival";
import { uuidField } from "@/lib/validations/fields";

/**
 * Manual revive (the Revive button — review tab row + dossier). Takes the lead id
 * and the optional candidate id (present when revived from the review tab; absent
 * when revived directly from the dossier with no open candidate). Issue messages
 * are internal — the action maps to formErrors, never shown raw (Q-04).
 */
export const ReviveLeadSchema = z.object({
  leadId: uuidField("bad_lead_id"),
  candidateId: uuidField("bad_candidate_id").optional(),
});
export type ReviveLeadInput = z.infer<typeof ReviveLeadSchema>;

/** Dismiss an open revival candidate from the review tab (no task created). */
export const DismissRevivalCandidateSchema = z.object({
  candidateId: uuidField("bad_candidate_id"),
  leadId: uuidField("bad_lead_id"),
});
export type DismissRevivalCandidateInput = z.infer<typeof DismissRevivalCandidateSchema>;

/**
 * Settings: patch a revival policy. trigger_status identifies the row (PK); only
 * silence_days / daily_cap_per_agent / active are editable. Refine requires ≥1
 * editable field. Human-mapped in the action (Q-04).
 */
export const UpdateRevivalPolicySchema = z
  .object({
    triggerStatus: z.enum(
      REVIVAL_TRIGGER_STATUSES as unknown as [string, ...string[]],
    ),
    silenceDays: z.number().int().min(0).max(365).optional(),
    dailyCapPerAgent: z.number().int().min(0).max(500).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.silenceDays !== undefined ||
      v.dailyCapPerAgent !== undefined ||
      v.active !== undefined,
    { message: "nothing_to_update" },
  );
export type UpdateRevivalPolicyInput = z.infer<typeof UpdateRevivalPolicySchema>;
