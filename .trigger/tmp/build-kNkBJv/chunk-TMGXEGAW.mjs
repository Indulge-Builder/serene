import {
  createAdminClient,
  createClient
} from "./chunk-KWPVUZIW.mjs";
import {
  __name,
  init_esm
} from "./chunk-EEXUIEOC.mjs";

// src/lib/services/sla-service.ts
init_esm();
async function getSlaTimersForLead(leadId) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lead_sla_timers").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
  if (error) {
    console.error("[sla-service] getSlaTimersForLead error:", error);
    return [];
  }
  return data ?? [];
}
__name(getSlaTimersForLead, "getSlaTimersForLead");
async function getSlaTimerForLeadAndRule(leadId, ruleCode) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("lead_sla_timers").select("*").eq("lead_id", leadId).eq("rule_code", ruleCode).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[sla-service] getSlaTimerForLeadAndRule error:", error);
    return null;
  }
  return data;
}
__name(getSlaTimerForLeadAndRule, "getSlaTimerForLeadAndRule");
async function getManagersByDomain(domain) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id, full_name").eq("domain", domain).in("role", ["manager", "admin", "founder"]).eq("is_active", true);
  if (error) {
    console.error("[sla-service] getManagersByDomain error:", error);
    return [];
  }
  return data ?? [];
}
__name(getManagersByDomain, "getManagersByDomain");
async function getOpenGiaFollowupTask(leadId, assignedTo) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("tasks").select("*").eq("task_category", "gia_followup").eq("assigned_to", assignedTo).not("status", "in", '("completed","cancelled","error")').order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const task = data;
  const { data: meta } = await admin.from("task_gia_meta").select("task_id").eq("task_id", task.id).eq("lead_id", leadId).maybeSingle();
  return meta ? task : null;
}
__name(getOpenGiaFollowupTask, "getOpenGiaFollowupTask");
async function createSlaTimer(leadId, ruleCode, scheduledFireAt) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("lead_sla_timers").insert({
    lead_id: leadId,
    rule_code: ruleCode,
    scheduled_fire_at: scheduledFireAt.toISOString()
  }).select().single();
  if (error) {
    console.error("[sla-service] createSlaTimer error:", error);
    return null;
  }
  return data;
}
__name(createSlaTimer, "createSlaTimer");
async function updateSlaTimerRunId(timerId, runId) {
  const admin = createAdminClient();
  await admin.from("lead_sla_timers").update({ trigger_run_id: runId }).eq("id", timerId);
}
__name(updateSlaTimerRunId, "updateSlaTimerRunId");
async function cancelSlaTimersForLeadInDb(leadId) {
  const admin = createAdminClient();
  await admin.from("lead_sla_timers").update({
    status: "cancelled",
    cancelled_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("lead_id", leadId).eq("status", "pending");
}
__name(cancelSlaTimersForLeadInDb, "cancelSlaTimersForLeadInDb");
async function markSlaTimerFired(leadId, ruleCode) {
  const admin = createAdminClient();
  await admin.from("lead_sla_timers").update({
    status: "fired",
    fired_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("lead_id", leadId).eq("rule_code", ruleCode).eq("status", "pending");
}
__name(markSlaTimerFired, "markSlaTimerFired");

export {
  getSlaTimersForLead,
  getSlaTimerForLeadAndRule,
  getManagersByDomain,
  getOpenGiaFollowupTask,
  createSlaTimer,
  updateSlaTimerRunId,
  cancelSlaTimersForLeadInDb,
  markSlaTimerFired
};
//# sourceMappingURL=chunk-TMGXEGAW.mjs.map
