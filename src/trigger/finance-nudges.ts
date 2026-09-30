/**
 * finance-nudges.ts — the hand-back ladder for invoiced tickets (migration 0250,
 * services/finance-nudges.ts).
 *
 * Every hour: a ticket that Serene invoiced and that is still in Invoice Due reminds its agent
 * after 24 hours, and tells the bishops and the queen of its queendom after 48. Each rung is
 * sent once. Gated by `finance_invoicing_enabled`.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const financeNudgesTask = schedules.task({
  id: "finance-nudges",
  cron: { pattern: "17 * * * *" },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getFinanceSettings } = await import("@/lib/services/llm-providers-service");
    if (!(await getFinanceSettings()).enabled) return { skipped: "disabled" };
    const { runInvoiceNudges } = await import("@/lib/services/finance-nudges");
    return runInvoiceNudges({ apply: true });
  },
});
