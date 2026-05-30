// FounderPerformanceShell — server component.
// Fetches domains that have leads in the period, renders domain tabs,
// then delegates to ManagerPerformanceAsync for the selected domain.
// Domain tab selection is URL-controlled (?domain=X), not profile-controlled.
// ManagerPerformanceAsync is reused verbatim — zero duplication of panel layout.

import { Suspense }                   from 'react';
import {
  getDomainsWithLeads,
  getPeriodDateRange,
  type PerformancePeriod,
} from '@/lib/services/performance-service';
import { APP_DOMAINS }                from '@/lib/constants/domains';

// Default domain when no ?domain= param is present
const DEFAULT_DOMAIN: AppDomain = 'onboarding';
import { ManagerPerformanceAsync }    from './ManagerPerformanceAsync';
import { ManagerPerformanceSkeleton } from './ManagerPerformanceSkeleton';
import { FounderDomainTabs }          from '@/components/performance/FounderDomainTabs';
import type { AppDomain }             from '@/lib/types/database';

type Props = {
  period:    PerformancePeriod;
  rawDomain: string | undefined;
};

export async function FounderPerformanceShell({ period, rawDomain }: Props) {
  const { from, to }    = getPeriodDateRange(period);
  const activeDomains   = await getDomainsWithLeads(from, to);

  // Fall back to full domain list if no leads exist yet
  const domains: AppDomain[] = activeDomains.length > 0 ? activeDomains : [...APP_DOMAINS];

  // Validate domain from URL — default to onboarding (or first available if onboarding absent)
  const fallback: AppDomain = (domains as string[]).includes(DEFAULT_DOMAIN)
    ? DEFAULT_DOMAIN
    : domains[0];
  const selectedDomain: AppDomain =
    rawDomain && (domains as string[]).includes(rawDomain)
      ? (rawDomain as AppDomain)
      : fallback;

  return (
    <div>
      {/* Domain tab bar — sits above the filter bar */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <FounderDomainTabs
          domains={domains}
          activeDomain={selectedDomain}
          period={period}
        />
      </div>

      {/* Manager panel — reused verbatim */}
      <Suspense fallback={<ManagerPerformanceSkeleton />}>
        <ManagerPerformanceAsync domain={selectedDomain} period={period} />
      </Suspense>
    </div>
  );
}
