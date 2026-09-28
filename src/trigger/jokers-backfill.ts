/**
 * jokers-backfill.ts — the Jokers' one-time back-fill (going live, docs/modules/joker.md).
 *
 * Started by hand from the Trigger.dev dashboard, never on a schedule, so both dashboards show the
 * past weeks on the first day instead of filling up from zero:
 *   { "part": "activity" }  recount the last CLIENT_ACTIVITY_LOAD_DAYS for every linked member group.
 *                           Counting only, no model, no cost.
 *   { "part": "capture" }   record the Jokers' items of the last JOKER_BACKFILL_DAYS and read the
 *                           replies (AI calls). Refused until `joker_capture_enabled` is on. Runs in
 *                           chunks, each saved before the next, so a failure loses one chunk at most;
 *                           stops when nothing is left, at the spend cap (`maxUsd`, default
 *                           JOKER_BACKFILL_MAX_USD) or at the time budget. Starting it again carries
 *                           on where it stopped: what is recorded and read is never bought twice.
 * Optional `days` overrides the window of either part.
 */
import { task } from "@trigger.dev/sdk/v3";
import {
  CLIENT_ACTIVITY_LOAD_DAYS, JOKER_BACKFILL_CHUNK_LABELS, JOKER_BACKFILL_CHUNK_READINGS, JOKER_BACKFILL_DAYS,
  JOKER_BACKFILL_MAX_MINUTES, JOKER_BACKFILL_MAX_USD,
} from "@/lib/constants/joker-engagement";

type BackfillPayload = { part: "activity" | "capture"; days?: number; maxUsd?: number };

const LOG = "[jokers-backfill]";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const jokersBackfillTask = task({
  id: "jokers-backfill",
  maxDuration: (JOKER_BACKFILL_MAX_MINUTES + 5) * 60,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: async (payload: BackfillPayload) => {
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    if (payload.part === "activity") {
      const { getClientActivityEnabled } = await import("@/lib/services/llm-providers-service");
      if (!(await getClientActivityEnabled())) return { skipped: "client_activity_enabled is false" };
      const { refreshClientActivity } = await import("@/lib/services/client-activity-service");
      const { istDay, addDays } = await import("@/lib/utils/client-activity");
      const today = istDay(new Date());
      const from = addDays(today, -((payload.days ?? CLIENT_ACTIVITY_LOAD_DAYS) - 1));
      const r = await refreshClientActivity(from, today);
      console.log(LOG, "activity", JSON.stringify({ from, to: today, ...r }));
      return { part: "activity", from, to: today, ...r };
    }

    if (payload.part !== "capture") return { skipped: `unknown part: ${String(payload.part)}` };
    const { getJokerCaptureEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getJokerCaptureEnabled())) return { skipped: "joker_capture_enabled is off: switch the capture on first" };
    const { runJokerCaptureSweep } = await import("@/lib/services/joker-capture");
    const { runJokerReplySweep } = await import("@/lib/services/joker-replies");

    const t0 = Date.now();
    const stopAt = t0 + JOKER_BACKFILL_MAX_MINUTES * MIN;
    const maxUsd = payload.maxUsd ?? JOKER_BACKFILL_MAX_USD;
    const since = new Date(t0 - (payload.days ?? JOKER_BACKFILL_DAYS) * DAY).toISOString();
    const total = { chunks: 0, openings: 0, labels: 0, readings: 0, reused: 0, failed: 0, cost_usd: 0, errors: 0 };
    let stop = "nothing left";

    for (;;) {
      if (Date.now() >= stopAt) { stop = "time budget"; break; }
      const left = maxUsd - total.cost_usd;
      // Checked between chunks: one chunk costs well under a dollar, so the cap is kept within that.
      if (left <= 0.05) { stop = "spend cap"; break; }
      const chunkMs = Math.max(MIN, stopAt - Date.now());

      const r = await runJokerCaptureSweep({ apply: true, since, maxLabels: JOKER_BACKFILL_CHUNK_LABELS, deadlineMs: chunkMs / 2 });
      const rr = await runJokerReplySweep({ apply: true, since, maxCalls: JOKER_BACKFILL_CHUNK_READINGS, deadlineMs: Math.max(MIN / 2, stopAt - Date.now()) });
      total.chunks += 1;
      total.openings += r.openings;
      total.labels += r.calls.made;
      total.readings += rr.calls.made;
      total.reused += rr.calls.reused;
      total.failed += r.calls.failed + rr.calls.failed;
      total.cost_usd = Number((total.cost_usd + r.calls.cost_usd + rr.calls.cost_usd).toFixed(4));
      total.errors += r.errors.length + rr.errors.length;
      console.log(LOG, "chunk", JSON.stringify({ ...total, readings_wanted: rr.wanted }));
      if (r.errors.length || rr.errors.length) console.warn(LOG, "errors", [...r.errors, ...rr.errors].slice(0, 5));
      // Nothing bought and nothing new recorded: the window is done (a failure-only chunk stops too).
      if (r.calls.made === 0 && rr.calls.made === 0 && r.openings === 0) break;
    }

    const line = { part: "capture", since, stop, minutes: Math.round((Date.now() - t0) / MIN), ...total };
    console.log(LOG, "done", JSON.stringify(line));
    return line;
  },
});
