'use client';

// RevivalReviewBanner — the review-context surface above the reused LeadsTable
// (rendered by LeadsTableAsync only when ?revival=true). It surfaces the AI
// REASONING beside each candidate (a table cell can't hold a sentence of prose)
// and mounts the shared <ReviveLeadButton> per row — the "lead-table row in review
// context" mount point. The reused LeadsTable below still lists the same leads and
// links each to its dossier; this banner is the reasoning + action layer, NOT a
// second lead list.

import { useState } from 'react';
import { m as motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { EASE_OUT_EXPO, BASE_DURATION } from '@/lib/constants/motion';
import { formatDate } from '@/lib/utils/dates';
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReviveLeadButton } from '@/components/leads/ReviveLeadButton';
import type { LeadStatus } from '@/lib/types/database';
import type { RevivalVerdict } from '@/lib/types/revival';

export type RevivalReviewRow = {
  leadId: string;
  slug: string | null;
  name: string;
  status: LeadStatus;
  candidateId: string;
  reasoning: string;
  // The review banner only ever renders OPEN candidates (unsure, or cap-overflow
  // revive) — a 'dismiss' verdict is written status='dismissed' and never reaches
  // here. The type stays the canonical union to match the candidate source.
  verdict: RevivalVerdict;
  suggestedReviveAt: string | null;
};

type Props = { rows: RevivalReviewRow[] };

export function RevivalReviewBanner({ rows }: Props) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const visible = rows.filter((r) => !resolved.has(r.leadId));

  function onResolved(leadId: string) {
    setResolved((s) => new Set(s).add(leadId));
  }

  if (visible.length === 0) {
    return (
      <div className="mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1) p-6">
        <EmptyState
          variant="inline"
          title="No leads waiting for revival review."
        />
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
      <div className="px-5 py-4 border-b border-(--theme-paper-border) flex items-center gap-2">
        <Sparkles className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--theme-accent)' }} />
        <span className="type-eyebrow m-0">Revival review</span>
        <span className="type-eyebrow m-0" style={{ color: 'var(--theme-text-tertiary)' }}>
          · {visible.length}
        </span>
      </div>

      <ul className="m-0 p-0" style={{ listStyle: 'none' }}>
        {visible.map((r, i) => (
          <motion.li
            key={r.candidateId}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO, delay: Math.min(i * 0.04, 0.24) }}
            className="px-5 py-4 border-b border-(--theme-paper-border) last:border-b-0"
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--theme-text-primary)',
                  }}
                >
                  {r.name}
                </span>
                <span className={`status-pill status-pill--${LEAD_STATUS_BADGE[r.status]}`}>
                  {LEAD_STATUS_LABELS[r.status]}
                </span>
              </div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--theme-text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {r.reasoning}
              </p>
              {r.suggestedReviveAt && (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--theme-text-tertiary)',
                  }}
                >
                  Suggested: {formatDate(r.suggestedReviveAt, 'd MMM yyyy')}
                </p>
              )}
            </div>

            <div style={{ flexShrink: 0 }}>
              <ReviveLeadButton
                leadId={r.leadId}
                candidateId={r.candidateId}
                showDismiss
                size="sm"
                onResolved={onResolved}
              />
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
