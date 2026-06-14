/**
 * revival.ts — Lead Revival constants (Phase R1)
 *
 * Pure data — no DB deps, no imports from services or actions. The live config
 * (silence thresholds, daily cap) lives in the `revival_policies` table and is read
 * per sweep run (sla_policies pattern); the values below are the seed parity
 * reference + the static vocabulary the sweep and UI share.
 */

import type { LeadStatus } from "@/lib/types/database";

// ─── Trigger statuses ─────────────────────────────────────────────────────────
// The lead statuses silence detection may act on. COLD is deliberately NOT a
// trigger. Terminal/won statuses are never revived. These are the only three
// rows that exist in revival_policies.

export const REVIVAL_TRIGGER_STATUSES = [
  "touched",
  "in_discussion",
  "nurturing",
] as const;
export type RevivalTriggerStatus = (typeof REVIVAL_TRIGGER_STATUSES)[number];

export function isRevivalTriggerStatus(status: string): status is RevivalTriggerStatus {
  return (REVIVAL_TRIGGER_STATUSES as readonly string[]).includes(status);
}

// Compile-time proof that every trigger status is a real LeadStatus.
const _triggerStatusCheck: readonly LeadStatus[] = REVIVAL_TRIGGER_STATUSES;
void _triggerStatusCheck;

// ─── Seed parity (revival_policies migration 0119) ───────────────────────────
// Editable from /settings; the sweep reads the DB, never these constants.

export const REVIVAL_DEFAULT_SILENCE_DAYS: Record<RevivalTriggerStatus, number> = {
  touched: 60,
  in_discussion: 60,
  nurturing: 90,
};

/** Default per-agent-per-day auto-revive task cap (every policy row seeds this). */
export const REVIVAL_DEFAULT_DAILY_CAP = 25;

// ─── Candidate vocabulary ────────────────────────────────────────────────────

export const REVIVAL_VERDICTS = ["revive", "unsure"] as const;
export const REVIVAL_CANDIDATE_STATUSES = ["open", "actioned", "dismissed"] as const;

// ─── Revived task tagging ────────────────────────────────────────────────────
// The revive task is a normal gia_followup created through createLeadTaskCore (the
// E2 path). Its ONLY difference from any other follow-up is the source marker
// (persisted on task_gia_meta.call_outcome) + the "Revived" badge keyed off it.

/** Marker written to task_gia_meta.call_outcome so the UI can badge the task. */
export const REVIVAL_TASK_MARKER = "revived";
/** Title for the auto-created / manually-created revive follow-up task. */
export const REVIVED_TASK_TITLE = "Revive dormant lead — re-engage";
/** Description body on the revive follow-up task. */
export const REVIVED_TASK_DESCRIPTION =
  "This lead went quiet while still warm. Re-engage and reassess interest.";
/** Default task type + priority for a revive task (a call-back follow-up). */
export const REVIVAL_TASK_TYPE = "call" as const;
export const REVIVAL_TASK_PRIORITY = "normal" as const;
/** Business minutes after the revive fires that the follow-up task is due. */
export const REVIVAL_TASK_DUE_BUSINESS_MINUTES = 120;

// ─── Sweep tuning ────────────────────────────────────────────────────────────

/** Max leads judged per status per sweep run (lambda budget guard, maxDuration 300s). */
export const REVIVAL_SWEEP_BATCH_PER_STATUS = 200;
/** Max notes characters handed to the gate (cost guard; recent notes only). */
export const REVIVAL_GATE_MAX_NOTES_CHARS = 6000;
/** Max recent notes the gate reads. */
export const REVIVAL_GATE_MAX_NOTES = 12;
