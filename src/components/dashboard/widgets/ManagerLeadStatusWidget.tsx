'use client';

import { useEffect, useState, useTransition } from 'react';
import { RefreshCcw } from 'lucide-react';
import { getLeadStatusSummaryAction } from '@/lib/actions/dashboard';
import { Button } from '@/components/ui/Button';
import { formatCompact } from '@/lib/utils/numbers';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import type { LeadStatus } from '@/lib/types/database';
import type { DashboardLeadStatusCount, DashboardAgentStatusBreakdown } from '@/lib/types';
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

type StackedBarProps = {
  mix:   Partial<Record<LeadStatus, number>>;
  total: number;
};

function StackedBar({ mix, total }: StackedBarProps) {
  if (total === 0) {
    return (
      <div
        style={{
          height:       '8px',
          borderRadius: 'var(--radius-full)',
          background:   'var(--theme-paper-border)',
          width:        '100%',
        }}
      />
    );
  }

  return (
    <div
      style={{
        display:      'flex',
        height:       '8px',
        borderRadius: 'var(--radius-full)',
        overflow:     'hidden',
        gap:          '1px',
        background:   'var(--theme-paper-border)',
      }}
    >
      {STATUS_ORDER.map((s) => {
        const count = mix[s] ?? 0;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={s}
            title={`${LEAD_STATUS_LABELS[s]}: ${count}`}
            style={{
              width:      `${pct}%`,
              background: STATUS_COLORS[s],
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

type StatusData = {
  totals:  DashboardLeadStatusCount[];
  byAgent: DashboardAgentStatusBreakdown[];
};

export function ManagerLeadStatusWidget({ role, domain, initialData }: WidgetProps) {
  const seed = initialData?.lead_status ?? null;
  const [data, setData]              = useState<StatusData | null>(seed);
  const [loaded, setLoaded]          = useState(seed !== null);
  const [isPending, startTransition] = useTransition();

  // Only fetch on mount when no server-provided initialData
  useEffect(() => {
    if (seed !== null) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await getLeadStatusSummaryAction(role, domain);
      if (!cancelled && result.data) {
        setData(result.data);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals     = data?.totals ?? [];
  const byAgent    = data?.byAgent ?? [];
  const grandTotal = totals.reduce((s, t) => s + t.count, 0);

  function handleRefresh() {
    startTransition(async () => {
      const result = await getLeadStatusSummaryAction(role, domain);
      if (result.data) setData(result.data);
    });
  }

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
        minHeight:     '340px',
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
            Gia · Lead Pipeline
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
            {isPending && !loaded ? 'Loading…' : `${formatCompact(grandTotal)} total lead${grandTotal === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={handleRefresh}
          disabled={isPending}
          title="Refresh"
          style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--theme-paper-border)', flexShrink: 0 }}
          iconLeft={RefreshCcw}
          size="xs"
        />
      </div>

      {/* Overall stacked bar */}
      {loaded && grandTotal > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <StackedBar
            mix={Object.fromEntries(totals.map((t) => [t.status, t.count]))}
            total={grandTotal}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {totals.map((t) => (
              <div key={t.status} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    width:        '8px',
                    height:       '8px',
                    borderRadius: '2px',
                    background:   STATUS_COLORS[t.status],
                    flexShrink:   0,
                  }}
                />
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-secondary)' }}>
                  {LEAD_STATUS_LABELS[t.status]} ({formatCompact(t.count)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-agent breakdown */}
      {loaded && byAgent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p
            style={{
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-medium)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color:         'var(--theme-text-tertiary)',
              margin:        0,
            }}
          >
            By Agent
          </p>
          {byAgent.slice(0, 8).map((agent) => (
            <div key={agent.agent_id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-primary)', fontWeight: 'var(--weight-medium)' }}>
                  {agent.agent_name}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>
                  {formatCompact(agent.total)}
                </span>
              </div>
              <StackedBar mix={agent.counts} total={agent.total} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {loaded && grandTotal === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-tertiary)',
            textAlign:  'center',
            padding:    'var(--space-6) 0',
            margin:     0,
          }}
        >
          No leads in your pipeline yet.
        </p>
      )}
    </div>
  );
}
