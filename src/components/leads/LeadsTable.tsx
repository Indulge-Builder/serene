'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Columns } from 'lucide-react';
import type { LeadWithAssignee } from '@/lib/services/leads-service';
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { formatDate } from '@/lib/utils/dates';
import { LEAD_COLUMN_MAP, type LeadColumnId } from '@/lib/constants/lead-columns';
import { useLeadColumnPreferences } from '@/hooks/useLeadColumnPreferences';
import { LeadColumnPicker } from '@/components/leads/LeadColumnPicker';

type LeadsTableProps = {
  leads:            LeadWithAssignee[];
  userId:           string;
  hasActiveFilters?: boolean;
};

export function LeadsTable({ leads, userId, hasActiveFilters = false }: LeadsTableProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerAnchorRef             = useRef<HTMLDivElement>(null);

  const { visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults } =
    useLeadColumnPreferences(userId);

  // Ordered visible column ids — the table renders exactly these in this order
  const orderedVisible: LeadColumnId[] = useMemo(
    () => columnOrder.filter((id) => visibleColumns.includes(id)),
    [columnOrder, visibleColumns],
  );

  const statusCounts = useMemo(
    () => ({
      new:    leads.filter((l) => l.status === 'new').length,
      active: leads.filter((l) =>
        (['touched', 'in_discussion', 'nurturing'] as const).includes(
          l.status as 'touched' | 'in_discussion' | 'nurturing',
        ),
      ).length,
      won:  leads.filter((l) => l.status === 'won').length,
      lost: leads.filter((l) =>
        (['lost', 'junk'] as const).includes(l.status as 'lost' | 'junk'),
      ).length,
    }),
    [leads],
  );

  const hasStatusPills =
    statusCounts.new > 0 ||
    statusCounts.active > 0 ||
    statusCounts.won > 0 ||
    statusCounts.lost > 0;

  // Section 11.5: content enters opacity 0→1 + y 4px→0 at 250ms ease-out-expo
  // with 100ms delay (overlap with skeleton exit at 150ms ease-in)
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        overflow:     'hidden',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {/* Table toolbar — status pills | column picker + row count */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
          flexWrap:     'nowrap',
        }}
      >
        {hasStatusPills && (
          <div
            className="hidden md:flex items-center gap-2 shrink-0"
            aria-label="Lead status summary"
          >
            {statusCounts.new > 0 && (
              <StatusSummaryPill label="New" count={statusCounts.new} variant="neutral" />
            )}
            {statusCounts.active > 0 && (
              <StatusSummaryPill label="Active" count={statusCounts.active} variant="accent" />
            )}
            {statusCounts.won > 0 && (
              <StatusSummaryPill label="Won" count={statusCounts.won} variant="success" />
            )}
            {statusCounts.lost > 0 && (
              <StatusSummaryPill label="Lost" count={statusCounts.lost} variant="danger" />
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }} aria-hidden="true" />

        {/* Column picker trigger */}
        <div ref={pickerAnchorRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            aria-pressed={pickerOpen}
            aria-label="Toggle column visibility"
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          'var(--space-1)',
              height:       '2.25rem',
              padding:      '0 var(--space-3)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              background:   pickerOpen ? 'var(--theme-accent-surface)' : 'transparent',
              color:        pickerOpen ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
              fontSize:     'var(--text-sm)',
              cursor:       'pointer',
              transition:   'background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)',
            }}
          >
            <Columns style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
            <span>Columns</span>
          </button>

          <LeadColumnPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            toggleColumn={toggleColumn}
            reorderColumns={reorderColumns}
            resetToDefaults={resetToDefaults}
          />
        </div>

        {/* Row count — reflects server-filtered page */}
        <span
          style={{
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {leads.length} lead{leads.length !== 1 ? 's' : ''} this page
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--theme-paper-subtle)' }}>
              {orderedVisible.map((colId) => (
                <th
                  key={colId}
                  style={{
                    padding:       'var(--space-3) var(--space-4)',
                    textAlign:     'left',
                    fontSize:      'var(--text-2xs)',
                    fontWeight:    'var(--weight-semibold)',
                    letterSpacing: 'var(--tracking-widest)',
                    textTransform: 'uppercase',
                    color:         'var(--theme-text-tertiary)',
                    borderBottom:  '1px solid var(--theme-paper-border)',
                    whiteSpace:    'nowrap',
                  }}
                >
                  {LEAD_COLUMN_MAP[colId].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td
                  colSpan={orderedVisible.length}
                  style={{
                    padding:   'var(--space-16) var(--space-4)',
                    textAlign: 'center',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize:   'var(--text-lg)',
                      fontStyle:  'italic',
                      color:      'var(--theme-text-tertiary)',
                      fontWeight: 'var(--weight-normal)',
                    }}
                  >
                    {hasActiveFilters
                      ? 'Nothing matches these filters.'
                      : 'No leads yet.'}
                  </p>
                  <p
                    style={{
                      marginTop: 'var(--space-2)',
                      fontSize:  'var(--text-sm)',
                      color:     'var(--theme-text-tertiary)',
                    }}
                  >
                    {hasActiveFilters
                      ? 'Try adjusting or clearing your filters.'
                      : 'Leads will appear here once the webhook receives its first submission.'}
                  </p>
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  visibleColumns={orderedVisible}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Single table row — renders only visible cells in the stored order
// ─────────────────────────────────────────────
function LeadRow({
  lead,
  visibleColumns,
}: {
  lead: LeadWithAssignee;
  visibleColumns: LeadColumnId[];
}) {
  const router      = useRouter();
  const badgeVariant = LEAD_STATUS_BADGE[lead.status];
  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  return (
    <tr
      onClick={() => router.push(`/leads/${lead.slug ?? lead.id}`)}
      style={{
        borderBottom: '1px solid var(--theme-paper-border)',
        transition:   'background var(--duration-fast) var(--ease-in-out)',
        cursor:       'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--theme-paper-subtle)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
    >
      {visibleColumns.map((colId) => (
        <LeadCell key={colId} colId={colId} lead={lead} fullName={fullName} badgeVariant={badgeVariant} />
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────
// Individual cell renderer — exhaustive switch keeps column logic co-located
// ─────────────────────────────────────────────
type BadgeVariant = 'neutral' | 'info' | 'warning' | 'success' | 'accent' | 'danger';

function LeadCell({
  colId,
  lead,
  fullName,
  badgeVariant,
}: {
  colId:        LeadColumnId;
  lead:         LeadWithAssignee;
  fullName:     string;
  badgeVariant: BadgeVariant;
}) {
  const baseCell: React.CSSProperties = {
    padding:    'var(--space-3) var(--space-4)',
    whiteSpace: 'nowrap',
  };

  switch (colId) {
    case 'status':
      return (
        <td style={baseCell}>
          <StatusBadge variant={badgeVariant} label={LEAD_STATUS_LABELS[lead.status]} />
        </td>
      );

    case 'name':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>
          {fullName}
        </td>
      );

    case 'phone':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--theme-text-secondary)' }}>
          {lead.phone ?? '—'}
        </td>
      );

    case 'email':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
          {lead.email ?? '—'}
        </td>
      );

    case 'campaign':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.utm_campaign ?? '—'}
        </td>
      );

    case 'source':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
          {lead.utm_source ?? lead.platform ?? '—'}
        </td>
      );

    case 'assigned_to':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
          {lead.assignee?.full_name ?? '—'}
        </td>
      );

    case 'created_at':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--theme-text-tertiary)' }}>
          {formatDate(lead.created_at, 'dd MMM, hh:mm a')}
        </td>
      );

    case 'last_call_outcome':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
          {lead.last_call_outcome ? CALL_OUTCOME_LABELS[lead.last_call_outcome] : '—'}
        </td>
      );

    case 'call_count':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--theme-text-secondary)', textAlign: 'right' }}>
          {lead.call_count}
        </td>
      );

    case 'domain':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', textTransform: 'capitalize' }}>
          {lead.domain}
        </td>
      );

    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// Toolbar status summary pills (current page rows)
// ─────────────────────────────────────────────
type SummaryPillVariant = 'neutral' | 'accent' | 'success' | 'danger';

function StatusSummaryPill({
  label,
  count,
  variant,
}: {
  label:   string;
  count:   number;
  variant: SummaryPillVariant;
}) {
  return (
    <span className={`status-pill status-pill--${variant}`}>
      {label}
      <span aria-hidden="true">·</span>
      {count}
    </span>
  );
}

// ─────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────
const BADGE_STYLES: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  neutral: {
    bg:     'var(--color-neutral-light)',
    text:   'var(--color-neutral-text)',
    border: 'var(--color-neutral-light)',
  },
  info: {
    bg:     'var(--color-info-light)',
    text:   'var(--color-info-text)',
    border: 'var(--color-info-light)',
  },
  warning: {
    bg:     'var(--color-warning-light)',
    text:   'var(--color-warning-text)',
    border: 'var(--color-warning-light)',
  },
  success: {
    bg:     'var(--color-success-light)',
    text:   'var(--color-success-text)',
    border: 'var(--color-success-light)',
  },
  accent: {
    bg:     'var(--theme-accent-surface)',
    text:   'var(--theme-accent)',
    border: 'var(--theme-accent-surface)',
  },
  danger: {
    bg:     'var(--color-danger-light)',
    text:   'var(--color-danger-text)',
    border: 'var(--color-danger-light)',
  },
};

function StatusBadge({ variant, label }: { variant: BadgeVariant; label: string }) {
  const styles = BADGE_STYLES[variant];
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        padding:      '0.125rem 0.625rem',
        borderRadius: 'var(--radius-full)',
        border:       `1px solid ${styles.border}`,
        background:   styles.bg,
        color:        styles.text,
        fontSize:     'var(--text-xs)',
        fontWeight:   'var(--weight-medium)',
        whiteSpace:   'nowrap',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {label}
    </span>
  );
}
