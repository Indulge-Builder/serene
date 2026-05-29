import {
  runs,
  task,
  tasks
} from "../../chunk-G76YA3MP.mjs";
import "../../chunk-D4RJVK7H.mjs";
import "../../chunk-3H4RRHYL.mjs";
import "../../chunk-DO267JEE.mjs";
import "../../chunk-XYF4MWKT.mjs";
import {
  __name,
  init_esm
} from "../../chunk-EEXUIEOC.mjs";

// src/trigger/task-reminders.ts
init_esm();
var sendTaskReminderTask = task({
  id: "send-task-reminder",
  retry: { maxAttempts: 3 },
  run: /* @__PURE__ */ __name(async (payload) => {
    const { createNotification } = await import("../../notifications-service-VCSZAIYZ.mjs");
    await createNotification({
      recipient_id: payload.assignedTo,
      type: "task_due",
      title: "Task due soon",
      body: "A task assigned to you is due in 30 minutes.",
      action_url: `/tasks`
    }).catch((err) => {
      console.error("[send-task-reminder] notification failed:", err);
    });
  }, "run")
});
async function scheduleTaskReminder(taskId, dueAt, assignedTo) {
  const reminderAt = new Date(dueAt.getTime() - 30 * 60 * 1e3);
  if (reminderAt <= /* @__PURE__ */ new Date()) {
    return;
  }
  await tasks.trigger(
    "send-task-reminder",
    { taskId, assignedTo },
    {
      delay: reminderAt,
      idempotencyKey: `task-reminder-${taskId}`,
      tags: [`task-reminder-${taskId}`]
    }
  );
}
__name(scheduleTaskReminder, "scheduleTaskReminder");
async function cancelTaskReminder(taskId) {
  const tag = `task-reminder-${taskId}`;
  const page = await runs.list({ tag, status: ["DELAYED", "QUEUED"] });
  const runIds = page.data.map((r) => r.id);
  if (runIds.length === 0) return;
  await Promise.allSettled(runIds.map((id) => runs.cancel(id)));
}
__name(cancelTaskReminder, "cancelTaskReminder");
export {
  cancelTaskReminder,
  scheduleTaskReminder,
  sendTaskReminderTask
};
//# sourceMappingURL=task-reminders.mjs.map
