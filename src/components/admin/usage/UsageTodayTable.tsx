'use client';

// UsageTodayTable — per-agent active time today, with a per-domain breakdown.
// Each row: agent identity + total active minutes today + domain dots showing
// where the time was spent. Sorted by total active minutes DESC so the least-
// active users (the adoption problem) sit at the bottom, the most-active at top.
// Display-only (A-06).

import { m as motion } from 'framer-motion';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { resolveColorMap } from '@/components/ui/charts/useChartTokens';
import { DOMAIN_LINE_COLORS } from '@/lib/constants/domain-colors';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { formatDuration } from '@/lib/utils/dates';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { Activity } from 'lucide-react';
import type { AppDomain } from '@/lib/types/database';
import type { AgentUsageToday } from '@/lib/types/usage';

type AgentRow = {
  userId: string;
  fullName: string;
  total: number;
  byDomain: { domain: AppDomain; minutes: number }[];
};

function aggregateByAgent(today: AgentUsageToday[]): AgentRow[] {
  const map = new Map<string, AgentRow>();
  for (const t of today) {
    let row = map.get(t.user_id);
    if (!row) {
      row = { userId: t.user_id, fullName: t.full_name ?? 'Unknown', total: 0, byDomain: [] };
      map.set(t.user_id, row);
    }
    row.total += t.active_minutes;
    row.byDomain.push({ domain: t.domain, minutes: t.active_minutes });
  }
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      byDomain: r.byDomain.sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName));
}

export function UsageTodayTable({ today }: { today: AgentUsageToday[] }) {
  const rows = aggregateByAgent(today);
  const domainColors = resolveColorMap(DOMAIN_LINE_COLORS);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No one active yet today."
        description="Active time appears here as team members work in Serene. A blank board through the working day is itself the signal worth chasing."
        framed
        ambient
        minHeight="280px"
      />
    );
  }

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {rows.map((row, i) => (
        <motion.div
          key={row.userId}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: ENTER_DURATION,
            ease: EASE_OUT_EXPO,
            delay: Math.min(i * 0.04, 0.32),
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-4) var(--space-5)',
            borderTop: i === 0 ? 'none' : '1px solid var(--theme-paper-border)',
          }}
        >
          <Avatar name={row.fullName} size="sm" />

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-medium)',
                color: 'var(--theme-text-primary)',
                margin: '0 0 var(--space-1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {row.fullName}
            </p>

            {/* Per-domain breakdown — dot + label + minutes. */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
              }}
            >
              {row.byDomain.map((d) => (
                <span
                  key={d.domain}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--theme-text-tertiary)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 'var(--radius-full)',
                      background: domainColors[d.domain],
                      flexShrink: 0,
                    }}
                  />
                  {DOMAIN_LABELS[d.domain]} · {formatDuration(d.minutes)}
                </span>
              ))}
            </div>
          </div>

          {/* Total active time today. */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg)',
              fontWeight: 'var(--weight-normal)',
              fontVariantNumeric: 'tabular-nums',
              color: row.total > 0 ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {formatDuration(row.total)}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
