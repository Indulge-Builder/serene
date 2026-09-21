/**
 * elaya-briefing.ts — Elaya's daily briefing to the founders (services/elaya-briefing.ts).
 *
 * 09:00 and 19:00 India time: the live pulse, put into a few lines, sent on WhatsApp (when the
 * founder's 24 hour window is open) and as an in-app notification. Gated by the
 * `daily_briefing_enabled` row in elaya_settings: flipping it is the on/off, no deploy.
 */
import { schedules } from "@trigger.dev/sdk/v3";

async function run(slot: "morning" | "evening") {
  // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
  const { getDailyBriefingEnabled } = await import("@/lib/services/llm-providers-service");
  if (!(await getDailyBriefingEnabled())) return { skipped: "disabled" };
  const { runBriefingSweep } = await import("@/lib/services/elaya-briefing");
  const { outcomes } = await runBriefingSweep(slot);
  return { slot, sent: outcomes.filter((o) => o.whatsapp === "sent").length, in_app: outcomes.filter((o) => o.in_app).length, founders: outcomes.length };
}

export const elayaMorningBriefingTask = schedules.task({
  id: "elaya-briefing-morning",
  cron: { pattern: "0 9 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 120,
  run: () => run("morning"),
});

export const elayaEveningBriefingTask = schedules.task({
  id: "elaya-briefing-evening",
  cron: { pattern: "0 19 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 120,
  run: () => run("evening"),
});
