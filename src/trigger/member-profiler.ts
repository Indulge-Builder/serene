/**
 * member-profiler.ts — the member profiler's heartbeat (migration 0215,
 * plan-sia-intelligence.md S2).
 *
 * Every ten minutes: read the finished WhatsApp conversations of member-linked groups and
 * file what they teach into the twin (services/member-profiler.ts). The whole task is gated
 * by the `member_profiler_enabled` row in elaya_settings, which ships OFF: the plan's
 * decision 4 is "read twenty groups, the founder checks the quality, then approve". Flipping
 * the row is the approval; no deploy is involved either way.
 *
 * One run at a time and a time budget, the lesson of 2026-09-18 (a cycle longer than its
 * schedule with one run at a time can only grow a queue): new windows stop being started
 * after four minutes, and a run that starts long after its minute leaves at once.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const memberProfilerTask = schedules.task({
  id: "member-profiler",
  cron: { pattern: "*/10 * * * *" },
  maxDuration: 420,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 9 * 60_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };

    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getMemberProfilerEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getMemberProfilerEnabled())) return { skipped: "disabled" };

    const { runProfilerSweep } = await import("@/lib/services/member-profiler");
    const sweep = await runProfilerSweep({ apply: true, deadlineMs: 240_000 });
    const line = {
      groups: sweep.groups,
      windows: sweep.windows,
      read: sweep.outcomes.filter((o) => o.status === "read").length,
      thin: sweep.outcomes.filter((o) => o.status === "thin").length,
      failed: sweep.outcomes.filter((o) => o.status === "failed").length,
      facts: sweep.outcomes.reduce((n, o) => n + (o.written?.facts ?? 0), 0),
      people: sweep.outcomes.reduce((n, o) => n + (o.written?.people ?? 0), 0),
      comingUp: sweep.outcomes.reduce((n, o) => n + (o.written?.coming_up ?? 0), 0),
    };
    console.log("[member-profiler] sweep", JSON.stringify(line));
    return line;
  },
});
