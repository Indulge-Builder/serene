import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { resolvePerformanceDateParams } from "@/lib/services/performance-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
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
  // Shared date_from/date_to → ISO range (default This Month), the same
  // boundary the /performance page uses. /budget consumes from/to directly.
  const dateFrom = typeof params.date_from === "string" ? params.date_from : null;
  const dateTo   = typeof params.date_to === "string" ? params.date_to : null;
  const { from, to } = resolvePerformanceDateParams(dateFrom, dateTo);

  const canUpload = profile.role === "admin" || profile.role === "founder";

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Budget<span className="page-title-dot">.</span>
        </h1>
        <div className="flex items-center gap-3">
          {canUpload && <AdSpendUploadButton />}
          {TOP_BAR_ENABLED && (
            <PageControls
              userId={profile.id}
              isPrivileged={false}
              notificationsPromise={getNotifications(profile.id)}
            />
          )}
        </div>
      </div>

      {/* Row 2 — filter bar (shared FilterBar Range presets + custom Dates) */}
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <PerformanceFilters showSearch={false} />
      </div>

      {/* Row 3 — content */}
      <Suspense key={`${from}:${to}`} fallback={<BudgetContentSkeleton />}>
        <BudgetAsync from={from} to={to} canUpload={canUpload} />
      </Suspense>
    </main>
  );
}
