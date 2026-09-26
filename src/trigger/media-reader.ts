/**
 * media-reader.ts — Elaya's eyes on a schedule (migration 0246,
 * docs/architecture/media-understanding-plan.md section 9).
 *
 * Every five minutes: find stored files with no reading, read the live lane (files from the
 * last 24 hours) first with the whole daily cap, then the backlog up to its share of the cap.
 * Gated by `media_reading_enabled` (ships OFF); the backlog also by
 * `media_reading_backlog_enabled`. One run at a time, a time budget, a stale run leaves at once
 * (the profiler's 2026-09-18 lesson).
 *
 * media-redo: every thirty minutes, re-profile the member conversations where an informative
 * reading landed after the profiler passed that moment. It shares the profiler's queue so two
 * readings of one member's facts never race.
 */
import { queue, schedules } from "@trigger.dev/sdk/v3";

/** The profiler's queue (one at a time): src/trigger/member-profiler.ts and media-redo share it. */
export const profilerQueue = queue({ name: "member-profiler", concurrencyLimit: 1 });

export const mediaReaderTask = schedules.task({
  id: "media-reader",
  cron: { pattern: "*/5 * * * *" },
  maxDuration: 290,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 4 * 60_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };
    const { getMediaReadingEnabled, getMediaBacklogEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getMediaReadingEnabled())) return { skipped: "disabled" };
    const { runMediaSweep } = await import("@/lib/services/media-readings-service");
    const { MEDIA_RUN_BUDGET_MS } = await import("@/lib/constants/media");
    const report = await runMediaSweep({ apply: true, deadlineMs: MEDIA_RUN_BUDGET_MS, backlog: await getMediaBacklogEnabled() });
    console.log("[media-reader] sweep", JSON.stringify(report));
    return report;
  },
});

export const mediaRedoTask = schedules.task({
  id: "media-redo",
  cron: { pattern: "7,37 * * * *" },
  maxDuration: 590,
  queue: profilerQueue,
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 25 * 60_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };
    const { getMediaReadingEnabled, getMemberProfilerEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getMediaReadingEnabled()) || !(await getMemberProfilerEnabled())) return { skipped: "disabled" };
    const { runMediaRedo } = await import("@/lib/services/media-readings-service");
    const report = await runMediaRedo({ apply: true, deadlineMs: 450_000 });
    console.log("[media-redo] pass", JSON.stringify(report));
    return report;
  },
});
