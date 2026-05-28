'use client';

import { useEffect, useState, useTransition } from 'react';
import { RefreshCcw } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { getLeadsByCampaignAction } from '@/lib/actions/dashboard';
import { formatCompact } from '@/lib/utils/numbers';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import type { LeadStatus } from '@/lib/types/database';
import type { CampaignStatusMix } from '@/lib/services/dashboard-service';
import type { WidgetProps } from '../DashboardWidgetSlot';

const STATUS_COLORS: Record<LeadStatus, string> = {
  new:           'var(--color-info)',
  touched:       'var(--theme-accent)',
  in_discussion: 'var(--color-warning)',
  nurturing:     'var(--theme-accent-muted)',
  won:           'var(--color-success)',
  lost:          'var(--color-danger)',
  junk:          'var(--theme-text-tertiary)',
};

const STATUS_ORDER: LeadStatus[] = ['new', 'touched', 'in_discussion', 'nurturing', 'won', 'lost', 'junk'];

export function ManagerCampaignWidget({ role, domain }: WidgetProps) {
  const [campaigns, setCampaigns]    = useState<CampaignStatusMix[]>([]);
  const [loaded, setLoaded]          = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await getLeadsByCampaignAction(role, domain);
      if (!cancelled && result.data) {
        setCampaigns(result.data);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRefresh() {
    startTransition(async () => {
      const result = await getLeadsByCampaignAction(role, domain);
      if (result.data) setCampaigns(result.data);
    });
  }

  const chartData = campaigns.map((c) => ({
    campaign: c.campaign.length > 20 ? `${c.campaign.slice(0, 18)}…` : c.campaign,
    ...Object.fromEntries(STATUS_ORDER.map((s) => [s, c.mix[s] ?? 0])),
  }));

  const activeStatuses = STATUS_ORDER.filter((s) => campaigns.some((c) => c.mix[s]));

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
        minHeight:     '420px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
            Gia · Campaign Performance
          </p>
          <p
            style={{
              fontSize:   'var(--text-md)',
              fontFamily: 'var(--font-serif)',
              fontStyle:  'italic',
              color:      'var(--theme-text-primary)',
              margin:     0,
            }}
          >
            {isPending && !loaded
              ? 'Loading…'
              : campaigns.length === 0
                ? 'No UTM data yet.'
                : `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isPending}
          title="Refresh"
          style={{
            background:     'transparent',
            border:         '1px solid var(--theme-paper-border)',
            borderRadius:   'var(--radius-sm)',
            color:          'var(--theme-text-tertiary)',
            cursor:         isPending ? 'wait' : 'pointer',
            width:          '28px',
            height:         '28px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            opacity:        isPending ? 0.5 : 1,
          }}
        >
          <RefreshCcw size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* Chart */}
      {loaded && campaigns.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-tertiary)',
            textAlign:  'center',
            padding:    'var(--space-8) 0',
            margin:     0,
          }}
        >
          Leads with UTM campaign data will appear here.
        </p>
      ) : loaded ? (
        <>
          <div style={{ height: '260px', opacity: isPending ? 0.5 : 1, transition: 'opacity 200ms' }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
                barCategoryGap="30%"
              >
                <CartesianGrid
                  horizontal
                  vertical={false}
                  stroke="var(--theme-paper-border)"
                  strokeDasharray="none"
                />
                <XAxis
                  dataKey="campaign"
                  tick={{ fontSize: 10, fill: 'var(--theme-text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
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
                  cursor={{ fill: 'var(--theme-paper-subtle)' }}
                />
                {STATUS_ORDER.map((s) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    name={LEAD_STATUS_LABELS[s]}
                    stackId="status"
                    fill={STATUS_COLORS[s]}
                    radius={
                      STATUS_ORDER.indexOf(s) === STATUS_ORDER.length - 1
                        ? [4, 4, 0, 0]
                        : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {activeStatuses.map((s) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    width:        '8px',
                    height:       '8px',
                    borderRadius: '2px',
                    background:   STATUS_COLORS[s],
                    flexShrink:   0,
                  }}
                />
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-secondary)' }}>
                  {LEAD_STATUS_LABELS[s]}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
