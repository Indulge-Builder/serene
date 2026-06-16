/**
 * lead-revival.ts — the daily silence-detection sweep (Phase R1).
 *
 * ONE scheduled Trigger.dev task. This is the silence detector + gate orchestrator;
 * it does NOT duplicate the SLA engine's per-lead delayed jobs and it is NOT a
 * second scheduler — it is the single periodic entry point the spec calls for.
 *
 * Per run:
 *   1. read revival_policies (active rows, per run — never module-cached)
 *   2. per trigger_status: find leads silent past silence_days with NO open candidate
 *      (the anti-join + the partial UNIQUE index are the one-open-candidate guard)
 *   3. per lead: the note-AI suppression gate (Elaya routing/Haiku + maskPii) →
 *        • confident 'revive' AND under the agent's daily cap
 *              → reviveLeadCore (Revived task, E2 path) + candidate 'actioned'
 *        • confident 'revive' but cap reached
 *              → candidate 'open' (overflow falls to the review tab — never dropped)
 *        • 'unsure' (the default — suppression bias)
 *              → candidate 'open' (review tab)
 *
 * Idempotency: the daily cron + the one-open-candidate guard make a re-run safe —
 * a lead with a live open candidate is skipped in step 2; the partial UNIQUE index
 * backstops any concurrent double-insert. Trigger.dev also dedups the scheduled run
 * itself per scheduleId per tick.
 */

import { schedules } from "@trigger.dev/sdk/v3";

export const sweepRevivalCandidatesTask = schedules.task({
  id: "sweep-revival-candidates",
  // 07:30 IST daily (02:00 UTC). The gate runs at shift-open so freshly-created
  // Revived tasks are waiting when agents start their day.
  // NOTE: "Asia/Calcutta" (not "Asia/Kolkata") — Trigger.dev's cloud validator checks the cron
  // timezone against Intl.supportedValuesOf('timeZone'), whose ICU build canonicalises IST to the
  // older "Asia/Calcutta" alias and rejects "Asia/Kolkata". Same UTC+5:30 zone — spelling only.
  cron: { pattern: "0 2 * * *", timezone: "Asia/Calcutta" },
  // The whole sweep must fit the lambda budget; batches are bounded per status.
  maxDuration: 300,
  run: async () => {
    // Dynamic imports — keep server-only modules out of the Trigger.dev module scan.
    const {
      getActiveRevivalPolicies,
      findSilentLeadsForStatus,
      countAutoRevivesToday,
      insertRevivalCandidate,
    } = await import("@/lib/services/revival-service");
    const { judgeLeadForRevival } = await import("@/lib/services/revival-gate");
    const { reviveLeadCore } = await import("@/lib/services/lead-mutations");
    const { nextBusinessDeadline } = await import("@/lib/utils/sla");
    const { REVIVAL_TASK_DUE_BUSINESS_MINUTES, isRevivalTriggerStatus } = await import(
      "@/lib/constants/revival"
    );

    const policies = await getActiveRevivalPolicies();
    if (policies.length === 0) {
      console.log("[revival-sweep] no active policies — nothing to do");
      return;
    }

    // Per-agent auto-revive budget for THIS run — seeded from today's count, then
    // decremented locally so a single run also respects the cap (the DB count only
    // sees rows already written). Map<agentId, remaining>.
    const remainingByAgent = new Map<string, number>();

    let judged = 0;
    let autoRevived = 0;
    let toReview = 0;
    let dismissed = 0;

    for (const policy of policies) {
      if (!isRevivalTriggerStatus(policy.trigger_status)) continue;

      const silent = await findSilentLeadsForStatus(policy.trigger_status, policy.silence_days);

      for (const lead of silent) {
        const agentId = lead.assigned_to;
        if (!agentId) continue; // finder excludes these, but stay defensive

        // The gate — three-way (revive/dismiss/unsure); fails closed to 'unsure' on
        // any error (never auto-revives AND never auto-dismisses → a human sees it).
        const verdict = await judgeLeadForRevival({
          leadId: lead.id,
          triggerStatus: policy.trigger_status,
        });
        judged += 1;

        if (verdict.verdict === "dismiss") {
          // Confident junk — write the candidate status='dismissed' at creation. It
          // is the audit/training log; the review tab filters status='open' so a
          // dismissed candidate NEVER surfaces for a human. No task, no review.
          await insertRevivalCandidate({
            leadId: lead.id,
            assignedTo: agentId,
            verdict: "dismiss",
            reasoning: verdict.reasoning,
            triggerStatus: policy.trigger_status,
            suggestedReviveAt: null,
            status: "dismissed",
          });
          dismissed += 1;
          continue;
        }

        if (verdict.verdict !== "revive") {
          // Ambiguous middle ('unsure') → review tab.
          await insertRevivalCandidate({
            leadId: lead.id,
            assignedTo: agentId,
            verdict: "unsure",
            reasoning: verdict.reasoning,
            triggerStatus: policy.trigger_status,
            suggestedReviveAt: verdict.suggestedReviveAt,
            status: "open",
          });
          toReview += 1;
          continue;
        }

        // Confident revive — check the agent's daily cap.
        if (!remainingByAgent.has(agentId)) {
          const usedToday = await countAutoRevivesToday(agentId);
          remainingByAgent.set(agentId, Math.max(0, policy.daily_cap_per_agent - usedToday));
        }
        const remaining = remainingByAgent.get(agentId) ?? 0;

        if (remaining <= 0) {
          // Cap reached → overflow to the review tab (NEVER dropped, NEVER auto-tasked).
          await insertRevivalCandidate({
            leadId: lead.id,
            assignedTo: agentId,
            verdict: "revive",
            reasoning: `${verdict.reasoning} (daily auto-revive cap reached — routed to review)`,
            triggerStatus: policy.trigger_status,
            suggestedReviveAt: verdict.suggestedReviveAt,
            status: "open",
          });
          toReview += 1;
          continue;
        }

        // Auto-revive: the Revived task (E2 path) + an 'actioned' candidate.
        const dueAt = nextBusinessDeadline(
          new Date(),
          REVIVAL_TASK_DUE_BUSINESS_MINUTES,
        ).toISOString();

        const core = await reviveLeadCore(
          {
            userId: agentId,
            // System actor — the lead's own agent owns the task. Role/domain only
            // gate the reassign path (not used here), so the lead's values are safe.
            role: "agent",
            domain: lead.domain as never,
            fullName: "Revival",
          },
          { leadId: lead.id, dueAt },
          agentId,
        );

        if (!core.ok) {
          // Task creation failed — DON'T burn the cap or mark actioned; leave it for
          // the next sweep (no candidate written → it's re-judged tomorrow).
          console.error(`[revival-sweep] reviveLeadCore failed for lead ${lead.id}`);
          continue;
        }

        // alreadyRevived (audit #10): a prior run created the Revived task but
        // crashed before the candidate row landed. The core returned the existing
        // task (no duplicate). We STILL write the missing 'actioned' candidate to
        // close the anti-join gap so the lead isn't re-qualified forever — but this
        // is a RECOVERY, not a fresh revive, so it must NOT consume today's cap.
        const inserted = await insertRevivalCandidate({
          leadId: lead.id,
          assignedTo: agentId,
          verdict: "revive",
          reasoning: core.alreadyRevived
            ? `${verdict.reasoning} (candidate backfilled — task already existed from a prior run)`
            : verdict.reasoning,
          triggerStatus: policy.trigger_status,
          suggestedReviveAt: verdict.suggestedReviveAt,
          status: "actioned",
          resolvedAt: new Date().toISOString(),
        });

        // Count the cap only for a FRESH revive whose candidate row actually landed
        // (the one-open guard could reject a racing duplicate — then the task exists
        // but we don't double-decrement). A recovery (alreadyRevived) never burns
        // the cap: the task was already counted on the run that first created it.
        if (inserted && !core.alreadyRevived) {
          remainingByAgent.set(agentId, remaining - 1);
          autoRevived += 1;
        }
      }
    }

    console.log(
      `[revival-sweep] done — judged=${judged} auto_revived=${autoRevived} to_review=${toReview} dismissed=${dismissed}`,
    );
    return { judged, autoRevived, toReview, dismissed };
  },
});
