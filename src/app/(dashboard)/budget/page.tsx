import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getPeriodDateRange, type PerformancePeriod } from "@/lib/services/performance-service";
import { PerformanceFilters } from "@/components/performance/PerformanceFilters";
import { AdSpendUploadButton } from "@/components/budget/AdSpendUploadButton";
import { BudgetAsync } from "./BudgetAsync";
import { BudgetContentSkeleton } from "./BudgetContentSkeleton";

// ─────────────────────────────────────────────
// /budget — ad spend vs lead/deal outcomes per campaign.
// Reads only from our DB (ad_spend_daily via get_budget_summary) — never a
// live Meta API call. Always-live reads, no Redis (like /campaigns).
// Access: manager (read), admin/founder (read + upload).
// ─────────────────────────────────────────────

const VALID_PERIODS: PerformancePeriod[] = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "all_time",
  "custom",
];

function parsePeriod(raw: string | undefined): PerformancePeriod {
  if (raw && (VALID_PERIODS as string[]).includes(raw)) {
    return raw as PerformancePeriod;
  }
  return "this_month";
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const period = parsePeriod(
    typeof params.period === "string" ? params.period : undefined,
  );
  const rawFrom = typeof params.from === "string" ? params.from : undefined;
  const rawTo   = typeof params.to   === "string" ? params.to   : undefined;

  const range = getPeriodDateRange(period);
  const from  = period === "custom" && rawFrom ? rawFrom : range.from;
  const to    = period === "custom" && rawTo   ? rawTo   : range.to;

  const canUpload = profile.role === "admin" || profile.role === "founder";

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Budget<span className="page-title-dot">.</span>
        </h1>
        {canUpload && <AdSpendUploadButton />}
      </div>

      {/* Row 2 — filter bar (shared period system, IST presets) */}
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <PerformanceFilters
          period={period}
          customFrom={rawFrom ?? null}
          customTo={rawTo ?? null}
          showSearch={false}
        />
      </div>

      {/* Row 3 — content */}
      <Suspense key={`${from}:${to}`} fallback={<BudgetContentSkeleton />}>
        <BudgetAsync from={from} to={to} canUpload={canUpload} />
      </Suspense>
    </main>
  );
}
