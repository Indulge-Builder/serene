'use client';

// FirstTouchScorecard — the first-touch SPEED card that sits below the
// call-outcome breakdown in AgentDetailPanel. Buckets each cohort lead by how
// fast its first call note arrived, in BUSINESS minutes per the agent's shift:
// < 15m / 15–30m / ≤ 1h / 1–3h / 3h+. Untouched cohort leads (no call note yet)
// are shown as a separate footnote — never folded into a speed bucket.
//
// Display-only (A-06). All math + bucketing happens server-side
// (getAgentFirstTouchScorecard, business-minute aware); this renders the result.
// Mirrors PipelineSection's segmented-bar + chip-legend language in the same panel.

import { m as motion } from 'framer-motion';
import { FIRST_TOUCH_BUCKETS, type FirstTouchBucketId } from '@/lib/constants/performance';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { FirstTouchScorecard as ScorecardData } from '@/lib/services/performance-service';

const LABEL_STYLE: React.CSSProperties = {
  fontFamily:    'var(--font-sans)',
  fontSize:      'var(--text-2xs)',
  fontWeight:    'var(--weight-medium)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color:         'var(--theme-text-tertiary)',
  margin:        '0 0 var(--space-4) 0',
};

function CardShell({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        padding:      'var(--space-5)',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      <p style={LABEL_STYLE}>First-Touch Speed</p>
      {children}
    </motion.div>
  );
}

export function FirstTouchScorecard({
  data,
  delay = 0,
  onBucketClick,
}: {
  data:   ScorecardData;
  delay?: number;
  /** When provided, each non-empty bucket row becomes a tap target opening the
   *  leads behind its count. Absent → the rows stay display-only (unchanged). */
  onBucketClick?: (bucketId: FirstTouchBucketId) => void;
}) {
  const { buckets, untouched, leadsWithFirstCall, totalCohort } = data;

  // No cohort at all in the period → serif-italic empty line (panel convention).
  if (totalCohort === 0) {
    return (
      <CardShell delay={delay}>
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
      </CardShell>
    );
  }

  // Readable bar-graph: one row per speed bucket (all five always shown, zeros
  // dimmed) — a fixed label column, a proportional fill bar, then the count · pct.
  // The bar is scaled to the LARGEST bucket (peak = full track) so the tallest bar
  // fills its row and the shape of the distribution reads at a glance — far clearer
  // than the old single thin segmented line.
  const maxBucket = Math.max(1, ...FIRST_TOUCH_BUCKETS.map((b) => buckets[b.id]));

  return (
    <CardShell delay={delay}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {FIRST_TOUCH_BUCKETS.map((b) => {
          const count = buckets[b.id];
          const pct = leadsWithFirstCall > 0 ? Math.round((count / leadsWithFirstCall) * 100) : 0;
          const barPct = (count / maxBucket) * 100;
          const empty = count === 0;
          // Interactive only when a handler is wired AND the bucket has leads to show.
          const interactive = !!onBucketClick && !empty;
          const rowStyle: React.CSSProperties = {
            display:             'grid',
            gridTemplateColumns: '54px 1fr auto',
            alignItems:          'center',
            gap:                 'var(--space-3)',
            opacity:             empty ? 0.5 : 1,
            // Button reset so the grid row looks identical whether div or button.
            width:               '100%',
            textAlign:           'left',
            background:          'transparent',
            border:              'none',
            padding:             0,
            font:                'inherit',
            color:               'inherit',
            cursor:              interactive ? 'pointer' : 'default',
          };
          const rowContent = (
            <>
              {/* Label */}
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-2xs)',
                  fontWeight: 'var(--weight-medium)',
                  color:      'var(--theme-text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {b.label}
              </span>

              {/* Track + proportional fill */}
              <div
                style={{
                  position:     'relative',
                  height:       '8px',
                  borderRadius: 'var(--radius-full)',
                  background:   'var(--theme-paper-subtle)',
                  border:       '1px solid var(--theme-paper-border)',
                  overflow:     'hidden',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
                  style={{
                    position:     'absolute',
                    inset:        0,
                    right:        'auto',
                    borderRadius: 'var(--radius-full)',
                    background:   b.color,
                    opacity:      0.92,
                  }}
                />
              </div>

              {/* Count · pct */}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize:   'var(--text-2xs)',
                  color:      'var(--theme-text-tertiary)',
                  whiteSpace: 'nowrap',
                  textAlign:  'right',
                  minWidth:   '52px',
                }}
              >
                {count} · {pct}%
              </span>
            </>
          );

          return interactive ? (
            <button
              key={b.id}
              type="button"
              className="serene-pressable serene-touch"
              onClick={() => onBucketClick!(b.id)}
              aria-label={`Show ${count} lead${count === 1 ? '' : 's'} with a ${b.label} first touch`}
              style={rowStyle}
            >
              {rowContent}
            </button>
          ) : (
            <div key={b.id} style={rowStyle}>
              {rowContent}
            </div>
          );
        })}
      </div>

      {/* Untouched footnote — cohort leads with no call note yet. Never a speed
          bucket; surfaced so the count never silently vanishes. */}
      {untouched > 0 && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-2xs)',
            color:      'var(--theme-text-tertiary)',
            margin:     'var(--space-3) 0 0 0',
          }}
        >
          {untouched} {untouched === 1 ? 'lead' : 'leads'} not yet called
        </p>
      )}
    </CardShell>
  );
}
