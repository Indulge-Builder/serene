import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { AppDomain } from "@/lib/types/database";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasManagerPageAccess } from "@/lib/utils/route-access";
import { resolvePerformanceDateParams } from "@/lib/services/performance-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { CondensingPageHeader } from "@/components/layout/CondensingPageHeader";
import { AdSpendUploadButton } from "@/components/budget/AdSpendUploadButton";
import { AddRechargeButton } from "@/components/budget/AddRechargeButton";
import { BudgetAsync } from "./BudgetAsync";
import { BudgetContentSkeleton } from "./BudgetContentSkeleton";
import { BudgetTabProvider } from "./budget-tab-context";
import { BudgetFilterBar } from "./BudgetFilterBar";

// ─────────────────────────────────────────────
// /budget — ad spend vs lead/deal outcomes per campaign.
// Reads only from our DB (ad_spend_daily via get_budget_summary) — never a
// live Meta API call. Always-live reads, no Redis (like /campaigns).
// Access: manager (read) · admin/founder (read + upload + add recharge).
// A manager sees ONLY their own domain's campaign SPEND plane — the spend rows
// are filtered by profile.domain (server-pinned; a manager can never widen it),
// and the recharge ledger / balance / gauge are hidden entirely because
// recharges carry no domain and scoping them would misstate finance. Upload +
// Add-Recharge stay admin/founder only.
// ─────────────────────────────────────────────

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasManagerPageAccess(profile)) redirect("/dashboard");

  const params = await searchParams;
  // Shared date_from/date_to → ISO range (default This Month), the same
  // boundary the /performance page uses. /budget consumes from/to directly.
  const dateFrom = typeof params.date_from === "string" ? params.date_from : null;
  const dateTo   = typeof params.date_to === "string" ? params.date_to : null;
  const { from, to } = resolvePerformanceDateParams(dateFrom, dateTo);

  const canUpload = profile.role === "admin" || profile.role === "founder";

  // Managers see only their own domain's SPEND plane — pinned server-side to
  // profile.domain so a crafted ?domain= can never widen it. Admin/founder get
  // null (all domains, both planes). This is the ONE flag that switches
  // BudgetAsync from the full report to the spend-only campaign plane.
  const scopeDomain: AppDomain | null =
    profile.role === "manager" ? (profile.domain as AppDomain) : null;

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — page header (sticky, condenses past 24px scroll — polish §07) */}
      <CondensingPageHeader title="Budget">
        {canUpload && <AddRechargeButton />}
        {canUpload && <AdSpendUploadButton />}
        {TOP_BAR_ENABLED && (
          <PageControls
            isPrivileged={false}
          />
        )}
      </CondensingPageHeader>

      {/* The Accounts|Campaigns tabs (filter-bar leading slot) and the content
          switch (BudgetWorkspace, inside BudgetAsync) share one client tab
          state across the Suspense boundary via BudgetTabProvider. */}
      <BudgetTabProvider>
        {/* Row 2 — filter bar: tabs (leading) + Range presets + custom Dates */}
        <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <BudgetFilterBar />
        </div>

        {/* Row 3 — content */}
        <Suspense key={`${from}:${to}:${scopeDomain ?? "all"}`} fallback={<BudgetContentSkeleton />}>
          <BudgetAsync from={from} to={to} canUpload={canUpload} scopeDomain={scopeDomain} />
        </Suspense>
      </BudgetTabProvider>
    </main>
  );
}
