/**
 * sia-staff-link.ts — every 15 minutes, link WhatsApp contacts to Serene accounts by phone
 * (services/sia-staff-link.ts). A new hire's company phone joins the groups and their account
 * carries the same phone; this is what ties the two without anyone mapping by hand.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const siaStaffLinkTask = schedules.task({
  id: "sia-staff-link",
  cron: { pattern: "*/15 * * * *" },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    const { linkStaffContactsByPhone } = await import("@/lib/services/sia-staff-link");
    const r = await linkStaffContactsByPhone();
    console.log("[sia-staff-link]", JSON.stringify(r));
    return r;
  },
});
