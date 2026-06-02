'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Columns } from 'lucide-react';
import type { LeadListItemWithAssignee } from '@/lib/services/leads-service';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import type { LeadStatus } from '@/lib/types/database';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { getLeadSourceLabel, getMetaMediumLabel, PLATFORM_LABELS } from '@/lib/constants/lead-sources';
import { formatDate } from '@/lib/utils/dates';
import { LEAD_COLUMN_MAP, type LeadColumnId } from '@/lib/constants/lead-columns';
import { useLeadColumnPreferences } from '@/hooks/useLeadColumnPreferences';
import { LeadColumnPicker } from '@/components/leads/LeadColumnPicker';

type LeadsTableProps = {
  leads:            LeadListItemWithAssignee[];
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

  const statusCounts = useMemo(() => {
    const counts = {} as Record<LeadStatus, number>;
    for (const status of LEAD_STATUSES) counts[status] = 0;
    for (const lead of leads) counts[lead.status] += 1;
    return counts;
  }, [leads]);

  const hasStatusPills = LEAD_STATUSES.some((s) => statusCounts[s] > 0);

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
            {LEAD_STATUSES.map((status) => {
              const count = statusCounts[status];
              if (count === 0) return null;
              return (
                <StatusBadge
                  key={status}
                  variant={LEAD_STATUS_BADGE[status]}
                  label={LEAD_STATUS_LABELS[status]}
                  count={count}
                />
              );
            })}
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
  lead: LeadListItemWithAssignee;
  visibleColumns: LeadColumnId[];
}) {
  const router       = useRouter();
  const [hovered, setHovered] = useState(false);
  const badgeVariant = LEAD_STATUS_BADGE[lead.status];
  const fullName     = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  return (
    <tr
      onClick={() => router.push(`/leads/${lead.slug ?? lead.id}`)}
      onMouseEnter={() => {
        setHovered(true);
        router.prefetch(`/leads/${lead.slug ?? lead.id}`);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--theme-paper-border)',
        cursor:       'pointer',
      }}
    >
      {visibleColumns.map((colId) => (
        <LeadCell
          key={colId}
          colId={colId}
          lead={lead}
          fullName={fullName}
          badgeVariant={badgeVariant}
          statusHighlighted={hovered}
        />
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────
// Individual cell renderer — exhaustive switch keeps column logic co-located
// ─────────────────────────────────────────────
function LeadCell({
  colId,
  lead,
  fullName,
  badgeVariant,
  statusHighlighted,
}: {
  colId:              LeadColumnId;
  lead:               LeadListItemWithAssignee;
  fullName:           string;
  badgeVariant:       string;
  statusHighlighted?: boolean;
}) {
  const baseCell: React.CSSProperties = {
    padding:    'var(--space-3) var(--space-4)',
    whiteSpace: 'nowrap',
  };

  switch (colId) {
    case 'status':
      return (
        <td style={baseCell}>
          <StatusBadge
            variant={badgeVariant}
            label={LEAD_STATUS_LABELS[lead.status]}
            highlighted={statusHighlighted}
          />
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
          {getLeadSourceLabel(lead.utm_source ?? lead.platform)}
        </td>
      );

    case 'platform': {
      const platformLabel = lead.platform ? (PLATFORM_LABELS[lead.platform] ?? lead.platform) : null;
      return (
        <td style={{ ...baseCell }}>
          {platformLabel ? (
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      '0.125rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-accent-subtle)',
                color:        'var(--theme-text-secondary)',
                fontSize:     'var(--text-xs)',
                fontWeight:   'var(--weight-medium)',
                whiteSpace:   'nowrap',
              }}
            >
              {platformLabel}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>—</span>
          )}
        </td>
      );
    }

    case 'medium':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
          {getMetaMediumLabel(lead.utm_medium) ?? '—'}
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
// Status badge — .status-pill--lead-* from design-tokens.css (theme-invariant)
// ─────────────────────────────────────────────
const STATUS_PILL_ACCENT_RING =
  '0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)';

function StatusBadge({
  variant,
  label,
  count,
  highlighted = false,
}: {
  variant: string;
  label:   string;
  count?:  number;
  /** Row hover — accent ring on the pill, no row background fill. */
  highlighted?: boolean;
}) {
  return (
    <span
      className={`status-pill status-pill--${variant}`}
      style={{
        boxShadow: highlighted ? STATUS_PILL_ACCENT_RING : undefined,
        transition: 'box-shadow var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {label}
      {count !== undefined && (
        <>
          <span aria-hidden="true">·</span>
          {count}
        </>
      )}
    </span>
  );
}
