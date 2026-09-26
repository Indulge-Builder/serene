'use client';

// THE one agent identity on /performance (mobile audit 2026-09-26). The
// manager/founder panel and the founder deck used to draw the same agent two
// ways (two avatar sizes, two tile styles, a "View" pretending to be a value).
// Both compose these two pieces now; the agent's own scorecard keeps the
// shared ui/StatTile strip because it shows today's pulse, not the period.

import { m as motion } from 'framer-motion';
import { Avatar } from '@/components/ui/Avatar';
import { StatAtom } from '@/components/performance/StatAtom';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { formatCompact, formatCurrencyCompact } from '@/lib/utils/numbers';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { AgentRosterRow } from '@/lib/types/index';
import type { AppDomain } from '@/lib/types/database';

export function AgentIdentityHeader({
  agent,
  domain,
  /** The deck's title bar already names the agent; it passes false to show only the avatar row. */
  showName = true,
}: {
  agent: AgentRosterRow;
  domain?: AppDomain | null;
  showName?: boolean;
}) {
  const label = DOMAIN_LABELS[(domain ?? agent.domain) as keyof typeof DOMAIN_LABELS];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        padding:      'var(--space-4) var(--space-5)',
        boxShadow:    'var(--shadow-1)',
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-4)',
        minWidth:     0,
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar src={agent.avatar_url} name={agent.full_name} size="lg" selected />
        <span
          aria-hidden="true"
          style={{
            position:     'absolute',
            bottom:       '2px',
            right:        '2px',
            width:        '10px',
            height:       '10px',
            borderRadius: 'var(--radius-full)',
            background:   'var(--color-success)',
            border:       '2px solid var(--theme-paper)',
            display:      'block',
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {showName && (
          <h2
            className="truncate"
            style={{
              fontFamily:    'var(--font-serif)',
              fontSize:      'var(--text-2xl)',
              fontWeight:    'var(--weight-light)',
              color:         'var(--theme-text-primary)',
              margin:        '0 0 var(--space-2) 0',
              lineHeight:    '1.1',
              letterSpacing: '-0.01em',
            }}
          >
            {agent.full_name}
          </h2>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              padding:       '2px 10px',
              borderRadius:  'var(--radius-full)',
              background:    'var(--theme-accent-surface)',
              border:        '1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent)',
              color:         'var(--neu-accent-deep)',
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-xs)',
              fontWeight:    'var(--weight-medium)',
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
            {agent.totalLeads} lead{agent.totalLeads !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export type AgentStatKind = 'calls' | 'leads' | 'deals';

/** The four period stats as tap targets: Calls · Leads · Won · Revenue. A
 * value not loaded yet reads as an em dash, never a word pretending to be a number. */
export function AgentStatRow({
  calls,
  leads,
  won,
  revenue,
  onDrill,
}: {
  calls: number | null;
  leads: number;
  won: number;
  revenue: number;
  onDrill: (kind: AgentStatKind) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 'var(--space-3)' }}>
      <StatAtom label="Calls"   value={calls === null ? '—' : formatCompact(calls)} paletteIndex={0} delay={0}   onClick={() => onDrill('calls')} />
      <StatAtom label="Leads"   value={formatCompact(leads)}                         paletteIndex={1} delay={40}  onClick={() => onDrill('leads')} />
      <StatAtom label="Won"     value={formatCompact(won)}                           paletteIndex={2} delay={80}  onClick={() => onDrill('deals')} />
      <StatAtom label="Revenue" value={formatCurrencyCompact(revenue)}               paletteIndex={3} delay={120} onClick={() => onDrill('deals')} />
    </div>
  );
}
