'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HomeAppBar, GreetingBlock } from '../app-bars';
import { SearchPill } from '../fields';
import { MobileDrawer } from '../MobileDrawer';
import { DomainSwiper } from '../DomainSwiper';
import { ProgressCard } from '../content';
import {
  SectionLabel,
  MetricTile,
  ListCard,
  ListRow,
  RowCount,
  PaneLoader,
  PaneError,
  RoomEmpty,
  ComingSoonCard,
} from './room-bits';
import { useDomainRoomData } from '@/hooks/useDomainRoomData';
import { getMobileDashboardAction } from '@/lib/actions/mobile';
import { formatCount, formatCurrencyCompact } from '@/lib/utils/numbers';
import { DEFAULT_GIA_DOMAIN, type GiaDomain } from '@/lib/constants/domains';
import type { MobileDashboardData, MobileGreeting } from '@/lib/services/mobile-service';

/**
 * Dashboard room (/m — mobile-ops §3 room 1): "How is each domain
 * performing right now?" Display-only (A-06) — seeded by the RSC page,
 * refreshed per swiped domain through getMobileDashboardAction. Zero new
 * backend: every number is an existing dashboard/performance/budget read.
 */

function DashboardPane({
  data,
  error,
  onRetry,
}: {
  data: MobileDashboardData | undefined;
  error: string | undefined;
  onRetry: () => void;
}) {
  if (error) return <PaneError message={error} onRetry={onRetry} />;
  if (!data) return <PaneLoader />;

  const targetPercent =
    data.dealsTarget && data.dealsTarget > 0
      ? Math.min(100, Math.round((data.dealsClosed / data.dealsTarget) * 100))
      : null;

  const topAgents = data.byAgent.slice(0, 6);
  const topCampaigns = data.campaigns.slice(0, 5);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="New leads" value={formatCount(data.newLeads)} sub="this month" />
        <MetricTile label="Won" value={formatCount(data.wonLeads)} tone="sage" sub="this month" />
        <MetricTile
          label="Deals closed"
          value={formatCount(data.dealsClosed)}
          sub={data.dealsTarget ? `of ${data.dealsTarget} target` : 'no target set'}
        />
        <MetricTile
          label="Ad spend"
          value={data.budgetSpend === null ? '—' : formatCurrencyCompact(data.budgetSpend)}
          sub="this month"
        />
      </div>

      {targetPercent !== null && (
        <ProgressCard
          title="Deals vs target"
          percent={targetPercent}
          micro={`${data.dealsClosed} of ${data.dealsTarget} closed this month`}
        />
      )}

      <SectionLabel>AGENTS</SectionLabel>
      {topAgents.length === 0 ? (
        <RoomEmpty>Quiet — no leads moved this month.</RoomEmpty>
      ) : (
        <ListCard>
          {topAgents.map((agent, i) => (
            <ListRow
              key={agent.agent_id}
              title={agent.agent_name}
              sub={`${agent.counts.won ?? 0} won · ${agent.counts.new ?? 0} new`}
              right={<RowCount value={formatCount(agent.total)} />}
              divider={i < topAgents.length - 1}
            />
          ))}
        </ListCard>
      )}

      <SectionLabel>CAMPAIGNS</SectionLabel>
      {topCampaigns.length === 0 ? (
        <RoomEmpty>No campaign leads this month.</RoomEmpty>
      ) : (
        <ListCard>
          {topCampaigns.map((c, i) => (
            <ListRow
              key={c.campaign}
              title={c.campaign}
              sub={`${c.mix.won ?? 0} won`}
              right={<RowCount value={formatCount(c.total)} />}
              divider={i < topCampaigns.length - 1}
            />
          ))}
        </ListCard>
      )}
    </>
  );
}

export function DashboardRoom({
  domains,
  seed,
  greeting,
}: {
  domains: GiaDomain[];
  seed: MobileDashboardData | null;
  greeting: MobileGreeting;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  const fetchDomain = useCallback(
    (domain: GiaDomain) => getMobileDashboardAction({ domain }),
    [],
  );

  const { activeDomain, setActiveDomain, data, errors, retry } = useDomainRoomData({
    initialDomain: domains[0] ?? DEFAULT_GIA_DOMAIN,
    seed,
    fetchDomain,
    enabled: domains.length > 0,
  });

  return (
    <>
      <HomeAppBar onOpenDrawer={() => setDrawerOpen(true)} />

      <GreetingBlock
        dateLabel={greeting.dateLabel}
        greeting={greeting.greeting}
        line={greeting.line}
      />

      <SearchPill placeholder="Ask Elaya anything…" onClick={() => router.push('/m/elaya')} />

      {domains.length === 0 ? (
        <ComingSoonCard
          title="Your rooms are being prepared."
          line="The mobile view for your role arrives in a later phase."
        />
      ) : (
        <DomainSwiper
          domains={domains}
          activeDomain={activeDomain}
          onDomainChange={setActiveDomain}
          renderDomain={(d) => (
            <DashboardPane data={data[d]} error={errors[d]} onRetry={() => retry(d)} />
          )}
        />
      )}

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
