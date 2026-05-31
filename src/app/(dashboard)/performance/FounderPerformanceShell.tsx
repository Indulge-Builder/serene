// FounderPerformanceShell — server component.
// Delegates to ManagerPerformanceAsync with allDomains (full roster).
// Domain filtering is client-side in ManagerPerformancePanel (agent list header).
// The domain prop is unused when allDomains is true; DEFAULT_GIA_DOMAIN is passed as a placeholder.

import { Suspense } from "react";
import type { PerformancePeriod } from "@/lib/services/performance-service";
import { ManagerPerformanceAsync } from "./ManagerPerformanceAsync";
import { ManagerPerformanceSkeleton } from "./ManagerPerformanceSkeleton";
import type { AppDomain } from "@/lib/types/database";

type Props = {
  domain: AppDomain;
  period: PerformancePeriod;
  customFrom?: string;
  customTo?: string;
};

export async function FounderPerformanceShell({
  domain,
  period,
  customFrom,
  customTo,
}: Props) {
  return (
    <Suspense fallback={<ManagerPerformanceSkeleton />}>
      <ManagerPerformanceAsync
        domain={domain}
        period={period}
        customFrom={customFrom}
        customTo={customTo}
        allDomains={true}
      />
    </Suspense>
  );
}
