/**
 * member-assessment.ts — the member pulse and the member judgement on the clock (migration 0241,
 * services/member-assessment.ts).
 *
 * Every hour: recompute the pulse (activity numbers + activity_score) for every member in one
 * SQL statement, so the Members list sorts by who is active on numbers that are at most an hour
 * old. Costs nothing but a few seconds of database time.
 *
 * Every Sunday 04:00 IST: judge the Active members not judged in the last week (about ₹2 each,
 * a reasoning-tier read over the masked record). ON unless `member_assessment_enabled` says
 * false. On demand: `member-assess-one` for a single member from the "Assess now" button.
 */
import { schedules, task, tasks } from "@trigger.dev/sdk/v3";
import { ASSESSMENT_RUN_BUDGET_MS } from "@/lib/constants/member-assessment";

export const memberPulseTask = schedules.task({
  id: "member-pulse",
  cron: { pattern: "7 * * * *" },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    const { refreshMemberPulse } = await import("@/lib/services/member-assessment");
    const rows = await refreshMemberPulse();
    return { rows };
  },
});

export const memberAssessmentWeeklyTask = schedules.task({
  id: "member-assessment-weekly",
  cron: { pattern: "0 4 * * 0", timezone: "Asia/Calcutta" },
  maxDuration: 30 * 60,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    const { getMemberAssessmentEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getMemberAssessmentEnabled())) return { skipped: "disabled" };
    const { runAssessmentSweep } = await import("@/lib/services/member-assessment");
    return runAssessmentSweep({ deadlineMs: ASSESSMENT_RUN_BUDGET_MS });
  },
});

export const memberAssessOneTask = task({
  id: "member-assess-one",
  maxDuration: 300,
  queue: { concurrencyLimit: 2 },
  run: async (payload: { memberId: string }) => {
    const { refreshMemberPulse, assessMember } = await import("@/lib/services/member-assessment");
    await refreshMemberPulse();
    const r = await assessMember(payload.memberId, { force: true });
    return r.status === "assessed" ? { status: r.status, score: r.assessment.score, risk: r.assessment.risk } : r;
  },
});

/** Queue one judgement (the member page's button). One in flight per member per hour. */
export async function startMemberAssessment(memberId: string): Promise<void> {
  await tasks.trigger("member-assess-one", { memberId }, { idempotencyKey: `member-assess-${memberId}-${new Date().toISOString().slice(0, 13)}`, tags: [`member-${memberId}`] });
}
