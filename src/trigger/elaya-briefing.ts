/**
 * elaya-briefing.ts — Elaya's daily briefing to the founders (services/elaya-briefing.ts).
 *
 * 10:00 IST: the record from yesterday 6 pm to 10 am. 18:00 IST: from 10 am to 6 pm. Each brief is
 * written from that window's raw record (services/elaya-briefing.ts, rewritten 2026-09-24) and
 * delivered to every active founder: their Elaya conversation, WhatsApp (free text inside the 24
 * hour window, otherwise a template ping) and the in-app inbox. Gated by the
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
  cron: { pattern: "0 10 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 300,
  run: () => run("morning"),
});

export const elayaEveningBriefingTask = schedules.task({
  id: "elaya-briefing-evening",
  cron: { pattern: "0 18 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 300,
  run: () => run("evening"),
});
