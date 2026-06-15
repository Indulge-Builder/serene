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
import { FIRST_TOUCH_BUCKETS } from '@/lib/constants/performance';
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
}: {
  data:   ScorecardData;
  delay?: number;
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

  const visible = FIRST_TOUCH_BUCKETS.filter((b) => buckets[b.id] > 0);

  return (
    <CardShell delay={delay}>
      {/* Segmented proportion bar — one slice per non-empty bucket. Proportions
          are of leads-WITH-a-first-call (the measured set), not the full cohort. */}
      {leadsWithFirstCall > 0 && (
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
          {visible.map((b) => (
            <div
              key={b.id}
              title={`${b.label}: ${buckets[b.id]}`}
              style={{
                width:      `${(buckets[b.id] / leadsWithFirstCall) * 100}%`,
                background: b.color,
                minWidth:   '4px',
                opacity:    0.9,
              }}
            />
          ))}
        </div>
      )}

      {/* Legend — every bucket shown (including zeros) so the five-bucket grid is
          always complete and the eye can scan the full speed distribution. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {FIRST_TOUCH_BUCKETS.map((b) => {
          const count = buckets[b.id];
          const pct = leadsWithFirstCall > 0 ? Math.round((count / leadsWithFirstCall) * 100) : 0;
          return (
            <div
              key={b.id}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          'var(--space-1)',
                padding:      '3px 8px 3px 6px',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-paper-subtle)',
                border:       '1px solid var(--theme-paper-border)',
                opacity:      count > 0 ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  display:      'inline-block',
                  width:        '6px',
                  height:       '6px',
                  borderRadius: 'var(--radius-full)',
                  background:   b.color,
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
                {b.label}
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
