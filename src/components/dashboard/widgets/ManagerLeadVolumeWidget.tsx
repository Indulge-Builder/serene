'use client';

import { useState, useTransition } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { getLeadVolumeByPeriodAction } from '@/lib/actions/dashboard';
import { formatCompact } from '@/lib/utils/numbers';
import { TabSelector, type TabItem } from '@/components/ui/TabSelector';
import { useChartTokens } from '@/components/ui/charts/useChartTokens';
import type { LeadVolumeSummary, VolumePeriod } from '@/lib/services/dashboard-service';
import type { WidgetProps } from '../DashboardWidgetSlot';

const PERIODS: { value: VolumePeriod; label: string }[] = [
  { value: 'today',   label: 'Today' },
  { value: 'week',    label: 'Week' },
  { value: 'month',   label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
];

export function ManagerLeadVolumeWidget({ role, domain, initialData }: WidgetProps) {
  // Seed from RSC-fetched week default. Only fires action on period change.
  const seed = initialData?.lead_volume ?? null;
  const [period, setPeriod]           = useState<VolumePeriod>('week');
  const [data, setData]               = useState<LeadVolumeSummary | null>(seed);
  const [loaded, setLoaded]           = useState(seed !== null);
  const [isPending, startTransition]  = useTransition();
  const { series: chartColors }       = useChartTokens();

  function handlePeriodChange(p: VolumePeriod) {
    setPeriod(p);
    startTransition(async () => {
      const result = await getLeadVolumeByPeriodAction(role, domain, p);
      if (result.data) setData(result.data);
    });
  }

  const series = data?.series ?? [];
  const total  = data?.total  ?? 0;

  return (
    <div
      style={{
        borderRadius:  'var(--radius-lg)',
        border:        '1px solid var(--theme-paper-border)',
        background:    'var(--theme-paper)',
        boxShadow:     'var(--shadow-1)',
        padding:       'var(--space-5)',
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-4)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div>
          <p
            style={{
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-medium)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color:         'var(--theme-text-tertiary)',
              margin:        0,
              marginBottom:  'var(--space-1)',
            }}
          >
            Gia · Lead Volume
          </p>
          <p
            style={{
              fontSize:   'var(--text-2xl)',
              fontWeight: 'var(--weight-semibold)',
              color:      'var(--theme-text-primary)',
              margin:     0,
              lineHeight: 1,
            }}
          >
            {isPending || !loaded ? '–' : formatCompact(total)}
          </p>
          <p
            style={{
              fontSize:  'var(--text-xs)',
              color:     'var(--theme-text-tertiary)',
              margin:    0,
              marginTop: '2px',
            }}
          >
            leads {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}
          </p>
        </div>

        {/* Period toggle */}
        <TabSelector
          tabs={PERIODS.map((p): TabItem => ({ id: p.value, label: p.label }))}
          activeTab={period}
          onChange={(id) => handlePeriodChange(id as VolumePeriod)}
          variant="pill"
          style={{ flexShrink: 0, opacity: isPending ? 0.6 : 1, pointerEvents: isPending ? 'none' : undefined }}
        />
      </div>

      {/* Chart */}
      <div style={{ height: '160px', opacity: isPending ? 0.5 : 1, transition: 'opacity 200ms' }}>
        {!loaded ? null : series.length === 0 ? (
          <div
            style={{
              height:         '160px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle:  'italic',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-tertiary)',
                margin:     0,
              }}
            >
              No leads in this period.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="var(--theme-paper-border)"
                strokeDasharray="none"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--theme-text-tertiary)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--theme-text-tertiary)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={(v) => formatCompact(v)}
              />
              <Tooltip
                contentStyle={{
                  background:   'var(--theme-paper)',
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow:    'var(--shadow-2)',
                  fontSize:     'var(--text-xs)',
                  color:        'var(--theme-text-primary)',
                }}
                cursor={{ stroke: 'var(--theme-paper-border)', strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={chartColors[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: chartColors[0], stroke: 'var(--theme-paper)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
