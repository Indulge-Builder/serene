'use client';

// Radial deals-vs-target meter for the founder Domains tab cards.
// Recharts RadialBarChart through useChartTokens — 2 colours (accent fill +
// grid track), within the ≤3-colour chart rule. Month-pinned: the value is
// always THIS MONTH's closed deals; the target is the monthly target from
// domain_targets. target null/0 → serif-italic "No target set." (EmptyState
// inline variant) — never a division by zero.

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { useChartTokens } from '@/components/ui/charts/useChartTokens';
import { formatCount } from '@/lib/utils/numbers';

type Props = {
  /** Deals closed this month (IST) */
  value:  number;
  /** Monthly target — null/0 renders the no-target state */
  target: number | null;
};

const METER_SIZE = 116;

export function DomainTargetMeter({ value, target }: Props) {
  const tokens = useChartTokens();

  if (!target || target <= 0) {
    return (
      <div
        style={{
          width:          METER_SIZE,
          height:         METER_SIZE,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <EmptyState variant="inline" size="sm" title="No target set." />
      </div>
    );
  }

  const pct = Math.min(100, (value / target) * 100);

  return (
    <div style={{ position: 'relative', width: METER_SIZE, height: METER_SIZE }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ value: pct }]}
          innerRadius="76%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={8}
            fill={tokens.series[0]}
            background={{ fill: tokens.grid }}
            isAnimationActive
          />
        </RadialBarChart>
      </ResponsiveContainer>

      {/* Centre label — value / target */}
      <div
        style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          pointerEvents:  'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize:   'var(--text-xl)',
            fontWeight: 'var(--weight-light)',
            color:      'var(--theme-text-primary)',
            lineHeight: 1,
          }}
        >
          {formatCount(value)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-2xs)',
            color:      'var(--theme-text-tertiary)',
            marginTop:  '2px',
          }}
        >
          of {formatCount(target)}
        </span>
      </div>
    </div>
  );
}
