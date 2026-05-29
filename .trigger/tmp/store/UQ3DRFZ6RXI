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

// src/trigger/lead-sla.ts
init_esm();
var fireLeadSlaTask = task({
  id: "fire-lead-sla",
  retry: { maxAttempts: 3 },
  run: /* @__PURE__ */ __name(async (payload) => {
    const { fireSlaBreachHandler } = await import("../../sla-IEF7CJEX.mjs");
    const result = await fireSlaBreachHandler(payload.leadId, payload.ruleCode);
    if (result.error) {
      if (result.error !== "STALE_FIRE") {
        throw new Error(`[fire-lead-sla] breach handler failed: ${result.error}`);
      }
    }
  }, "run")
});
async function scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds) {
  if (fireAt <= /* @__PURE__ */ new Date()) {
    await tasks.trigger(
      "fire-lead-sla",
      { leadId, ruleCode },
      {
        idempotencyKey: `lead-sla-${leadId}-${ruleCode}`,
        tags: [`lead-sla-${leadId}`, `sla-rule-${ruleCode}`]
      }
    );
  } else {
    await tasks.trigger(
      "fire-lead-sla",
      { leadId, ruleCode },
      {
        delay: fireAt,
        idempotencyKey: `lead-sla-${leadId}-${ruleCode}`,
        tags: [`lead-sla-${leadId}`, `sla-rule-${ruleCode}`]
      }
    );
  }
  try {
    const { updateSlaTimerRunId } = await import("../../sla-service-3EQNMEIS.mjs");
    const { getSlaTimerForLeadAndRule } = await import("../../sla-service-3EQNMEIS.mjs");
    const timer = await getSlaTimerForLeadAndRule(leadId, ruleCode);
    if (timer) {
      const page = await runs.list({
        tag: `lead-sla-${leadId}`,
        status: ["DELAYED", "QUEUED", "EXECUTING"]
      });
      const match = page.data.find((r) => r.taskIdentifier === "fire-lead-sla");
      if (match) {
        await updateSlaTimerRunId(timer.id, match.id);
      }
    }
  } catch {
  }
}
__name(scheduleLeadSlasTask, "scheduleLeadSlasTask");
async function cancelLeadSlasByLeadTask(leadId) {
  const tag = `lead-sla-${leadId}`;
  const page = await runs.list({ tag, status: ["DELAYED", "QUEUED"] });
  const runIds = page.data.map((r) => r.id);
  if (runIds.length > 0) {
    await Promise.allSettled(runIds.map((id) => runs.cancel(id)));
  }
  try {
    const { cancelSlaTimersForLeadInDb } = await import("../../sla-service-3EQNMEIS.mjs");
    await cancelSlaTimersForLeadInDb(leadId);
  } catch {
  }
}
__name(cancelLeadSlasByLeadTask, "cancelLeadSlasByLeadTask");
export {
  cancelLeadSlasByLeadTask,
  fireLeadSlaTask,
  scheduleLeadSlasTask
};
//# sourceMappingURL=lead-sla.mjs.map
