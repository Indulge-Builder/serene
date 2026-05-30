'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition }              from 'react';
import { TabSelector, type TabItem }  from '@/components/ui/TabSelector';
import { DOMAIN_LABELS }              from '@/lib/constants/domains';
import type { AppDomain }             from '@/lib/types/database';
import type { PerformancePeriod }     from '@/lib/services/performance-service';

// Priority order for domain tabs — first four always lead
const DOMAIN_TAB_ORDER: AppDomain[] = [
  'onboarding',
  'shop',
  'house',
  'legacy',
  'concierge',
  'finance',
  'marketing',
  'tech',
  'b2b',
];

type Props = {
  domains:      AppDomain[];
  activeDomain: AppDomain;
  period:       PerformancePeriod;
};

export function FounderDomainTabs({ domains, activeDomain, period }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Sort domains according to the prescribed tab order
  const sortedDomains = [...domains].sort((a, b) => {
    const ai = DOMAIN_TAB_ORDER.indexOf(a);
    const bi = DOMAIN_TAB_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const tabs: TabItem[] = sortedDomains.map((d) => ({
    id:    d,
    label: DOMAIN_LABELS[d],
  }));

  function handleSelect(domain: AppDomain) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('domain', domain);
    params.set('period', period);
    startTransition(() => {
      router.push(`/performance?${params.toString()}`);
    });
  }

  return (
    <TabSelector
      tabs={tabs}
      activeTab={activeDomain}
      onChange={(id) => handleSelect(id as AppDomain)}
      variant="pill"
      indicatorLayoutId="founder-domain-tabs"
      style={{
        opacity:    isPending ? 0.6 : 1,
        transition: 'opacity var(--duration-fast) var(--ease-in-out)',
      }}
    />
  );
}
