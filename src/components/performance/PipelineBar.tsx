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

export function PipelineBar({
  breakdown,
  onSegmentClick,
}: {
  breakdown: { status: string; count: number }[];
  /** When provided, each segment + legend chip becomes a tap target opening the
   *  leads in that status. Absent → display-only (unchanged, backward-safe). */
  onSegmentClick?: (status: string) => void;
}) {
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
        {ordered.map(({ status, count }) => {
          const segStyle = {
            width:      `${(count / total) * 100}%`,
            background: STATUS_FILL[status] ?? 'var(--color-neutral)',
            minWidth:   '4px',
            opacity:    0.9,
          } as const;
          const title = `${LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status}: ${count}`;
          return onSegmentClick ? (
            <button
              key={status}
              type="button"
              title={title}
              aria-label={`Show ${count} ${LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status} lead${count === 1 ? '' : 's'}`}
              onClick={() => onSegmentClick(status)}
              className="serene-touch"
              style={{ ...segStyle, border: 'none', padding: 0, cursor: 'pointer' }}
            />
          ) : (
            <div key={status} title={title} style={segStyle} />
          );
        })}
      </div>

      {/* Legend — compact chip row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {ordered.map(({ status, count }) => {
          const pct = Math.round((count / total) * 100);
          const chipStyle = {
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            padding:      '3px 8px 3px 6px',
            borderRadius: 'var(--radius-full)',
            background:   'var(--theme-paper-subtle)',
            border:       '1px solid var(--theme-paper-border)',
          } as const;
          const label = LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status;
          const chipInner = (
            <>
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
                {label}
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
            </>
          );
          return onSegmentClick ? (
            <button
              key={status}
              type="button"
              onClick={() => onSegmentClick(status)}
              aria-label={`Show ${count} ${label} lead${count === 1 ? '' : 's'}`}
              className="serene-pressable serene-touch"
              style={{ ...chipStyle, cursor: 'pointer' }}
            >
              {chipInner}
            </button>
          ) : (
            <div key={status} style={chipStyle}>
              {chipInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
