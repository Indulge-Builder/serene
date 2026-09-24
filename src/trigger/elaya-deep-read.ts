/**
 * elaya-deep-read.ts — the deep read's runner (migration 0235, services/elaya-deep-read.ts).
 *
 * A chat turn queues a job through the start_deep_read write tool and fires this task; the task
 * reads every relevant row, judges each, writes the labels back and delivers the answer on the
 * channel the question came from. One attempt: a failed job says so on that channel and stays
 * on record (elaya_jobs.status = failed) rather than re-billing the read.
 */
import { task, tasks } from "@trigger.dev/sdk/v3";
import { DEEP_READ_MAX_MINUTES } from "@/lib/constants/elaya-jobs";

export const elayaDeepReadTask = task({
  id: "elaya-deep-read",
  maxDuration: DEEP_READ_MAX_MINUTES * 60 + 60,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 2 },
  run: async (payload: { jobId: string }) => {
    // Dynamic import — keep the service graph out of the Trigger.dev module scan.
    const { runDeepRead } = await import("@/lib/services/elaya-deep-read");
    return runDeepRead(payload.jobId);
  },
});

/** Fire the runner for a queued job. Idempotent on the job id; tagged so a run can be found. */
export async function startDeepReadJob(jobId: string): Promise<void> {
  await tasks.trigger("elaya-deep-read", { jobId }, { idempotencyKey: `elaya-deep-read-${jobId}`, tags: [`elaya-job-${jobId}`] });
}
