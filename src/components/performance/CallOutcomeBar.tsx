'use client';

import { m as motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { OutcomeBreakdownItem } from '@/lib/services/performance-service';
import type { CallOutcome } from '@/lib/types/database';
import { EXIT_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { useChartTokens, resolveColorMap } from '@/components/ui/charts/useChartTokens';

// ─────────────────────────────────────────────
// Outcome config — colour tokens, display labels
// ─────────────────────────────────────────────

const OUTCOME_CONFIG: Record<
  CallOutcome,
  { label: string; color: string; textColor: string; bgColor: string }
> = {
  conversing:   { label: 'Conversing',    color: 'var(--color-success)',  textColor: 'var(--color-success-text)',  bgColor: 'var(--color-success-light)'  },
  rnr:          { label: 'Ring No Reply', color: 'var(--color-warning)',  textColor: 'var(--color-warning-text)',  bgColor: 'var(--color-warning-light)'  },
  switched_off: { label: 'Switched Off',  color: 'var(--color-neutral)',  textColor: 'var(--color-neutral-text)',  bgColor: 'var(--color-neutral-light)'  },
  wrong_number: { label: 'Wrong Number',  color: 'var(--color-danger)',   textColor: 'var(--color-danger-text)',   bgColor: 'var(--color-danger-light)'   },
  other:        { label: 'Other',         color: 'var(--color-info)',     textColor: 'var(--color-info-text)',     bgColor: 'var(--color-info-light)'     },
};

// Ordered for visual hierarchy: best → worst
const OUTCOME_ORDER: CallOutcome[] = ['conversing', 'rnr', 'switched_off', 'wrong_number', 'other'];

// Recharts ResponsiveContainer with width/height "100%" reads initialDimension (-1, -1)
// before ResizeObserver fires — use explicit pixels (see ManagerCampaignWidget).
const DONUT_SIZE = 180;

// CSS var strings for the donut fills — resolved to computed hex via the
// canonical resolveColorMap() bridge (Recharts SVG fills can't take var()).
const OUTCOME_COLOR_VARS: Record<CallOutcome, string> = {
  conversing:   OUTCOME_CONFIG.conversing.color,
  rnr:          OUTCOME_CONFIG.rnr.color,
  switched_off: OUTCOME_CONFIG.switched_off.color,
  wrong_number: OUTCOME_CONFIG.wrong_number.color,
  other:        OUTCOME_CONFIG.other.color,
};

type Props = {
  breakdown: OutcomeBreakdownItem[];
};

export function CallOutcomeBar({ breakdown }: Props) {
  const tokens = useChartTokens();
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          padding:      'var(--space-8) var(--space-5)',
          boxShadow:    'var(--shadow-1)',
          textAlign:    'center',
        }}
      >
        <p
          style={{
            fontFamily:  'var(--font-serif)',
            fontStyle:   'italic',
            fontSize:    'var(--text-md)',
            fontWeight:  'var(--weight-light)',
            color:       'var(--theme-text-tertiary)',
            margin: 0,
          }}
        >
          No calls logged this period.
        </p>
      </div>
    );
  }

  // Sort breakdown into canonical order
  const countMap: Partial<Record<CallOutcome, number>> = {};
  for (const item of breakdown) {
    countMap[item.outcome] = item.count;
  }

  const orderedItems = OUTCOME_ORDER
    .filter((o) => (countMap[o] ?? 0) > 0)
    .map((o) => ({ outcome: o, count: countMap[o] ?? 0 }));

  // Recharts pie data with resolved fill colours. `tokens` (useChartTokens)
  // re-renders this component on theme change, so the map re-resolves too.
  const resolvedColors = resolveColorMap(OUTCOME_COLOR_VARS);
  const pieData = orderedItems.map(({ outcome, count }) => ({
    name: OUTCOME_CONFIG[outcome].label,
    value: count,
    color: resolvedColors[outcome],
    outcome,
  }));

  // Best outcome percentage for the center label
  const topOutcome = orderedItems[0];
  const topPct = topOutcome ? Math.round((topOutcome.count / total) * 100) : 0;
  const topConfig = topOutcome ? OUTCOME_CONFIG[topOutcome.outcome] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: EXIT_DURATION, delay: 0.18, ease: EASE_OUT_EXPO }}
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        padding:      'var(--space-5)',
        boxShadow:    'var(--shadow-1)',
        display:      'flex',
        gap:          'var(--space-6)',
        alignItems:   'center',
      }}
    >
      {/* Left: heading + legend rows */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Section eyebrow */}
        <p
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-medium)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
            marginBottom:  'var(--space-4)',
          }}
        >
          Call Outcome Breakdown
        </p>

        {/* Legend rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {orderedItems.map(({ outcome, count }) => {
            const config = OUTCOME_CONFIG[outcome];
            const pct = Math.round((count / total) * 100);
            return (
              <div
                key={outcome}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            'var(--space-3)',
                  padding:        '6px var(--space-3)',
                  borderRadius:   'var(--radius-sm)',
                  background:     config.bgColor,
                }}
              >
                {/* Colour dot */}
                <span
                  aria-hidden="true"
                  style={{
                    display:      'inline-block',
                    width:        '8px',
                    height:       '8px',
                    borderRadius: 'var(--radius-full)',
                    background:   config.color,
                    flexShrink:   0,
                  }}
                />

                {/* Label */}
                <span
                  style={{
                    flex:       1,
                    fontFamily: 'var(--font-sans)',
                    fontSize:   'var(--text-sm)',
                    fontWeight: 'var(--weight-medium)',
                    color:      config.textColor,
                    minWidth:   0,
                  }}
                >
                  {config.label}
                </span>

                {/* Count + pct */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <span
                    style={{
                      fontFamily:  'var(--font-sans)',
                      fontSize:    'var(--text-sm)',
                      fontWeight:  'var(--weight-semibold)',
                      color:       config.textColor,
                    }}
                  >
                    {count}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize:   'var(--text-xs)',
                      color:      config.textColor,
                      opacity:    0.7,
                      minWidth:   '36px',
                      textAlign:  'right',
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Right: Donut chart */}
      <div
        style={{
          flexShrink: 0,
          position: 'relative',
          width: DONUT_SIZE,
          height: DONUT_SIZE,
        }}
      >
        <ResponsiveContainer width={DONUT_SIZE} height={DONUT_SIZE} minWidth={0}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={82}
              strokeWidth={2}
              stroke="var(--theme-paper)"
            >
              {pieData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background:   tokens.tooltipBg,
                border:       `1px solid ${tokens.tooltipBorder}`,
                borderRadius: '8px',
                boxShadow:    'var(--shadow-2)',
                fontSize:     12,
                fontFamily:   'var(--font-sans)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — show top outcome % */}
        {topConfig && (
          <div
            style={{
              position:       'absolute',
              top:            '50%',
              left:           '50%',
              transform:      'translate(-50%, -50%)',
              textAlign:      'center',
              pointerEvents:  'none',
            }}
          >
            <p
              style={{
                fontFamily:  'var(--font-serif)',
                fontSize:    'var(--text-xl)',
                fontWeight:  'var(--weight-light)',
                color:       'var(--theme-text-primary)',
                lineHeight:  '1',
                margin:      0,
              }}
            >
              {topPct}%
            </p>
            <p
              style={{
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-2xs)',
                color:       'var(--theme-text-tertiary)',
                letterSpacing: '0.06em',
                margin:      '2px 0 0',
              }}
            >
              {topConfig.label}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
