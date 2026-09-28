/**
 * joker-capture.ts — the jokers' capture job's heartbeat (migration 0248; Recommendations &
 * Engagement, step 1).
 *
 * Every three minutes (owner, 2026-09-24): read what the four jokers sent into the linked client
 * groups, record every opening once, and label each new text (services/joker-capture.ts); then
 * tie follow-ups and member replies to their openings and set each outcome (services/joker-replies.ts).
 * Gated by the `joker_capture_enabled` row in elaya_settings, seeded false: flipping it is the
 * on/off, no deploy.
 *
 * One run at a time, with a time budget inside the schedule, and a run that starts late leaves at
 * once (the intake lesson of 2026-09-18: a cycle longer than its schedule only grows a queue).
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { JOKER_CAPTURE_CRON, JOKER_RUN_BUDGET_MS } from "@/lib/constants/joker-engagement";

export const jokerCaptureTask = schedules.task({
  id: "joker-capture",
  cron: { pattern: JOKER_CAPTURE_CRON },
  maxDuration: 160,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 120_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };

    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getJokerCaptureEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getJokerCaptureEnabled())) return { skipped: "disabled" };

    // Step 1: the openings. Step 2: the threads and replies, on what step 1 just recorded.
    const started = Date.now();
    const { runJokerCaptureSweep } = await import("@/lib/services/joker-capture");
    const r = await runJokerCaptureSweep({ apply: true, deadlineMs: JOKER_RUN_BUDGET_MS / 2 });
    const { runJokerReplySweep } = await import("@/lib/services/joker-replies");
    const rr = await runJokerReplySweep({ apply: true, deadlineMs: Math.max(10_000, JOKER_RUN_BUDGET_MS - (Date.now() - started)) });
    const line = {
      read: r.fetched, decided: r.decided, openings: r.openings, undecided: r.undecided, unlinked: r.unlinked,
      follow_ups_tied: rr.links.filter((l) => l.opening_id).length, replies_judged: rr.judged.length, outcomes: rr.outcomes.length,
      calls: r.calls.made + rr.calls.made, failed: r.calls.failed + rr.calls.failed, cost_usd: Number((r.calls.cost_usd + rr.calls.cost_usd).toFixed(4)),
    };
    console.log("[joker-capture] run", JSON.stringify(line));
    const errors = [...r.errors, ...rr.errors];
    if (errors.length) console.warn("[joker-capture] errors", errors.slice(0, 5));
    return line;
  },
});
