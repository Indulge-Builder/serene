'use client';

// PipelineBar — segmented lead-status breakdown bar + compact legend chips.
//
// Extracted verbatim from AgentDetailPanel's private PipelineSection (Phase 5
// mobile deck) so BOTH the detail panel and the deck card render an identical
// status breakdown (R-01 — never copy-paste a second copy). Display-only (A-06).
//
// Status mode of the deck card's breakdown toggle consumes this; outcome mode
// consumes CallOutcomeBar. Both are fed from getAgentDetailMetrics
// (pipelineBreakdown + callOutcomeBreakdown) — no new query.

import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';

// ─────────────────────────────────────────────
// Pipeline status colour tokens (§16.4)
// ─────────────────────────────────────────────

const STATUS_FILL: Record<string, string> = {
  new:           'var(--color-neutral)',
  touched:       'var(--color-info)',
  in_discussion: 'var(--color-warning)',
  won:           'var(--color-success)',
  nurturing:     'var(--theme-accent)',
  lost:          'var(--color-danger)',
  junk:          'var(--color-neutral)',
};

const STATUS_ORDER = ['new', 'touched', 'in_discussion', 'nurturing', 'won', 'lost', 'junk'];

export function PipelineBar({ breakdown }: { breakdown: { status: string; count: number }[] }) {
  const total = breakdown.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
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
    );
  }

  const ordered = STATUS_ORDER
    .map((s) => ({ status: s, count: breakdown.find((b) => b.status === s)?.count ?? 0 }))
    .filter((b) => b.count > 0);

  return (
    <div>
      {/* Segmented bar — each segment independently rounded when it terminates a boundary */}
      <div
        style={{
          display:      'flex',
          height:       '10px',
          borderRadius: 'var(--radius-full)',
          overflow:     'hidden',
          gap:          '2px',
          marginBottom: 'var(--space-4)',
          background:   'var(--theme-paper-border)',
        }}
      >
        {ordered.map(({ status, count }) => (
          <div
            key={status}
            title={`${LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status}: ${count}`}
            style={{
              width:      `${(count / total) * 100}%`,
              background: STATUS_FILL[status] ?? 'var(--color-neutral)',
              minWidth:   '4px',
              opacity:    0.9,
            }}
          />
        ))}
      </div>

      {/* Legend — compact chip row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {ordered.map(({ status, count }) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div
              key={status}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          'var(--space-1)',
                padding:      '3px 8px 3px 6px',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-paper-subtle)',
                border:       '1px solid var(--theme-paper-border)',
              }}
            >
              <span
                style={{
                  display:      'inline-block',
                  width:        '6px',
                  height:       '6px',
                  borderRadius: 'var(--radius-full)',
                  background:   STATUS_FILL[status] ?? 'var(--color-neutral)',
                  opacity:      0.9,
                  flexShrink:   0,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-2xs)',
                  color:      'var(--theme-text-secondary)',
                  fontWeight: 'var(--weight-medium)',
                }}
              >
                {LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize:   'var(--text-2xs)',
                  color:      'var(--theme-text-tertiary)',
                }}
              >
                {count} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
