"use server";
// actions/freshdesk.ts — the Freshdesk mirror's server actions.
//
// One write-shaped action: "Sync now" runs a small budgeted cycle of the same core the
// minute task runs (freshdesk-sync.ts), so an operator can pull fresh data on demand and
// see the run summary. requireProfile(admin/founder) is the trust boundary (Rule 09 /
// A-18); the tables carry no user policies. Returns { data, error } (Rule 10).

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/actions/_auth";
import { formErrors } from "@/lib/validations/form-errors";
import { FRESHDESK_PATH } from "@/lib/constants/freshdesk";
import { createFdBudget, isFreshdeskConfigured } from "@/lib/services/freshdesk-api";
import { runSyncCycle } from "@/lib/services/freshdesk-sync";

const FRESHDESK_ROLES = ["admin", "founder"] as const;

export type SyncNowResult = {
  apiCalls: number;
  rateRemaining: number | null;
  ticketsWritten: number;
  conversationsWritten: number;
  changesWritten: number;
  backfillDone: boolean | null;
  error: string | null;
};

export async function runFreshdeskSyncNow(): Promise<{ data: SyncNowResult | null; error: string | null }> {
  const auth = await requireProfile(FRESHDESK_ROLES);
  if (!auth.ok) return auth.result;
  if (!isFreshdeskConfigured()) return { data: null, error: "Freshdesk is not configured on this server." };

  try {
    // A manual pull spends less than the cron (20 calls) so the two never starve each other.
    const summary = await runSyncCycle(createFdBudget(20));
    const steps = [summary.poll, summary.threads, summary.backfill, summary.contacts, summary.reference, summary.fieldChoices];
    const sum = (pick: (s: NonNullable<(typeof steps)[number]>) => number) =>
      steps.reduce((n, s) => n + (s ? pick(s) : 0), 0);
    const firstError = steps.find((s) => s && s.error && !/budget|rate limited/i.test(s.error))?.error ?? null;
    revalidatePath(FRESHDESK_PATH);
    return {
      data: {
        apiCalls: summary.apiCalls,
        rateRemaining: summary.rateRemaining,
        ticketsWritten: sum((s) => s.ticketsWritten),
        conversationsWritten: sum((s) => s.conversationsWritten),
        changesWritten: sum((s) => s.changesWritten),
        backfillDone: summary.backfill ? Boolean(summary.backfill.detail.done) : null,
        error: firstError,
      },
      error: null,
    };
  } catch (e) {
    console.error("[freshdesk-action] sync now failed", e);
    return { data: null, error: formErrors.generic };
  }
}
