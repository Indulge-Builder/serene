'use client';

// UsageDashboard — the /admin/usage client shell. Owns the report state (seeded
// from the RSC), the Today | 30 days tab switch, and a manual refresh that
// re-reads via getAgentUsageAction (the dashboard reads usage_daily + a live
// today recompute — never the raw heartbeats). Display + light interaction only.
//
// Today recomputes live from raw ticks in the RPC, so a manual refresh reflects
// activity within ~1 snapshot interval without waiting for the 15-min rollup.

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TabSelector } from '@/components/ui/TabSelector';
import { StatTile } from '@/components/ui/StatTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/hooks/useToast';
import { UsageTodayTable } from './UsageTodayTable';
import { ChartSkeleton } from '@/components/ui/charts/ChartSkeleton';
import { getAgentUsageAction } from '@/lib/actions/usage';
import { formatDuration } from '@/lib/utils/dates';
import { formatCount } from '@/lib/utils/numbers';
import { APP_DOMAINS } from '@/lib/constants/domains';
import type { AppDomain } from '@/lib/types/database';
import type { AgentUsageReport } from '@/lib/types/usage';

// Recharts stays out of the route's initial chunk (G-3) — loaded on first paint
// of the history view via next/dynamic with a chart skeleton fallback.
const UsageHistoryChart = dynamic(
  () => import('./UsageHistoryChart').then((m) => m.UsageHistoryChart),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> },
);

type View = 'today' | 'history';

export function UsageDashboard({ initialReport }: { initialReport: AgentUsageReport | null }) {
  const toast = useToast;
  const [report, setReport] = useState<AgentUsageReport | null>(initialReport);
  const [view, setView] = useState<View>('today');
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const res = await getAgentUsageAction();
      if (res.error || !res.data) {
        toast.danger(res.error ?? 'Unable to refresh usage data.');
        return;
      }
      setReport(res.data);
    });
  };

  if (!report) {
    return (
      <EmptyState
        title="Usage data is unavailable right now."
        description="Try refreshing in a moment."
        framed
        minHeight="280px"
      />
    );
  }

  const { today, history } = report;

  // Org-wide active minutes today + distinct active people (the headline pulse).
  const todayTotalMinutes = today.reduce((sum, t) => sum + t.active_minutes, 0);
  const activePeople = new Set(today.map((t) => t.user_id)).size;

  // Domains present in the history window, in the canonical APP_DOMAINS order —
  // one stacked Area per domain in the chart.
  const historyDomains: AppDomain[] = APP_DOMAINS.filter((d) =>
    history.some((p) => p.domain === d),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Headline stat strip + view toggle + refresh. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid grid-cols-2 gap-3" style={{ minWidth: 280 }}>
          <StatTile label="Active today" value={formatDuration(todayTotalMinutes)} />
          <StatTile label="People active today" value={formatCount(activePeople)} />
        </div>

        <div className="flex items-center gap-3">
          <TabSelector
            tabs={[
              { id: 'today', label: 'Today' },
              { id: 'history', label: 'Last 30 days' },
            ]}
            activeTab={view}
            onChange={(id) => setView(id as View)}
            indicatorLayoutId="usage-view-tabs"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            loading={isPending}
            iconLeft={RefreshCw}
          >
            Refresh
          </Button>
        </div>
      </div>

      {view === 'today' ? (
        <UsageTodayTable today={today} />
      ) : history.length === 0 ? (
        <EmptyState
          title="No history yet."
          description="Daily active-time history accumulates here from the first full day of tracking."
          framed
          minHeight="280px"
        />
      ) : (
        <div
          style={{
            background: 'var(--theme-paper)',
            border: '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-1)',
            padding: 'var(--space-5)',
          }}
        >
          <p className="label-micro" style={{ marginBottom: 'var(--space-4)' }}>
            Active minutes per day, by domain
          </p>
          <UsageHistoryChart history={history} domains={historyDomains} windowDays={30} />
        </div>
      )}
    </div>
  );
}
