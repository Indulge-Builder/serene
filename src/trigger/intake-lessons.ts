/**
 * intake-lessons.ts — the lesson writer's two entry points (services/intake-lessons.ts, 0240).
 *
 * Weekly (Monday 06:00 IST): one draft per kind of work (intake / ticket_creator / sentinel)
 * from the verdicts decided since the last lesson, only when there are LESSON_MIN_REVIEWS or
 * more. Nothing is folded into a prompt by this task: a founder approves the draft on
 * /settings/tickets. ON unless the `intake_lessons_enabled` row says false.
 *
 * On demand: the "Write a lesson now" button fires `intake-lesson-write` for one kind, which
 * writes even below the minimum (never with zero verdicts). Rule 11: a writing is a reasoning
 * call of a minute or two, so it runs here, never inside the action.
 */
import { schedules, task, tasks } from "@trigger.dev/sdk/v3";
import { LESSON_KINDS } from "@/lib/constants/ticket-intake";
import type { LessonKind } from "@/lib/types/intake";

export const intakeLessonsWeeklyTask = schedules.task({
  id: "intake-lessons-weekly",
  cron: { pattern: "0 6 * * 1", timezone: "Asia/Calcutta" },
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getIntakeLessonsEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getIntakeLessonsEnabled())) return { skipped: "disabled" };
    const { writeLessonDraft } = await import("@/lib/services/intake-lessons");
    const out: Record<string, string> = {};
    for (const kind of LESSON_KINDS) {
      const r = await writeLessonDraft(kind);
      out[kind] = r.status === "written" ? `written v${r.lesson.version} from ${r.reviews}` : r.status === "skipped" ? `skipped: ${r.reason} (${r.reviews})` : `failed: ${r.error}`;
    }
    return out;
  },
});

export const intakeLessonWriteTask = task({
  id: "intake-lesson-write",
  maxDuration: 300,
  queue: { concurrencyLimit: 1 },
  run: async (payload: { kind: LessonKind }) => {
    const { writeLessonDraft } = await import("@/lib/services/intake-lessons");
    const r = await writeLessonDraft(payload.kind, { force: true });
    return r.status === "written" ? { status: r.status, version: r.lesson.version, reviews: r.reviews } : r;
  },
});

/** Queue one writing for a kind (the settings page button). One in flight per kind. */
export async function startIntakeLessonWrite(kind: LessonKind): Promise<void> {
  await tasks.trigger("intake-lesson-write", { kind }, { idempotencyKey: `intake-lesson-write-${kind}-${new Date().toISOString().slice(0, 13)}`, tags: [`intake-lesson-${kind}`] });
}
