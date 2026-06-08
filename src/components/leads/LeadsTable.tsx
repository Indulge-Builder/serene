'use client';

import { useState, useMemo, useRef, useEffect, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownUp, Clock, Columns } from 'lucide-react';
import { buildFilterParams } from '@/lib/utils/filter-params';
import type { LeadListItemWithAssignee } from '@/lib/services/leads-service';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import type { LeadStatus } from '@/lib/types/database';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { getLeadSourceLabel, getMetaMediumLabel } from '@/lib/constants/lead-sources';
import { formatDate } from '@/lib/utils/dates';
import { LEAD_COLUMN_MAP, type LeadColumnId } from '@/lib/constants/lead-columns';
import { useLeadColumnPreferences } from '@/hooks/useLeadColumnPreferences';
import { LeadColumnPicker } from '@/components/leads/LeadColumnPicker';
import { LeadsSelectionToolbar } from '@/components/leads/LeadsSelectionToolbar';
import { ExportButton } from '@/components/leads/ExportButton';
import type { LeadFilters } from '@/lib/types/database';

type LeadsTableProps = {
  leads:            LeadListItemWithAssignee[];
  userId:           string;
  filters:          LeadFilters;
  hasActiveFilters?: boolean;
  goingCold?:       boolean;
  statusCounts?:    Partial<Record<LeadStatus, number>>;
};

export function LeadsTable({ leads, userId, filters, hasActiveFilters = false, goingCold = false, statusCounts = {} }: LeadsTableProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const params       = useSearchParams();
  const [, startTransition] = useTransition();

  const sortOrder = params.get('sort_order') === 'asc' ? 'asc' : 'desc';

  function toggleGoingCold() {
    if (goingCold) {
      const next = buildFilterParams(params, { going_cold: null }, { resetKeys: ['page'] });
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    } else {
      const next = buildFilterParams(
        params,
        { going_cold: 'true', status: null, outcome: null },
        { resetKeys: ['page'] },
      );
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    }
  }

  function toggleSortOrder() {
    const nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    const next = buildFilterParams(
      params,
      { sort_order: nextOrder === 'asc' ? 'asc' : null },
      { resetKeys: ['page'] },
    );
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  const [pickerOpen, setPickerOpen]           = useState(false);
  const pickerAnchorRef                       = useRef<HTMLDivElement>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Clear selection when the leads array changes (page nav / filter change)
  useEffect(() => {
    setSelectedLeadIds(new Set());
  }, [leads]);

  const { visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults } =
    useLeadColumnPreferences(userId);

  // Ordered visible column ids — the table renders exactly these in this order
  const orderedVisible: LeadColumnId[] = useMemo(
    () => columnOrder.filter((id) => visibleColumns.includes(id)),
    [columnOrder, visibleColumns],
  );

  const allPageIds     = leads.map((l) => l.id);
  const allSelected    = allPageIds.length > 0 && allPageIds.every((id) => selectedLeadIds.has(id));
  const someSelected   = !allSelected && allPageIds.some((id) => selectedLeadIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(allPageIds));
    }
  }

  function toggleOne(id: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // statusCounts is the only source of truth for pill counts.
  // It reflects the full filtered dataset, not just the current page slice.
  const hasStatusPills = LEAD_STATUSES.some((s) => (statusCounts[s] ?? 0) > 0);

  // Section 11.5: content enters opacity 0→1 + y 4px→0 at 250ms ease-out-expo
  // with 100ms delay (overlap with skeleton exit at 150ms ease-in)
  return (
    <>
    <AnimatePresence>
      {selectedLeadIds.size > 0 && (
        <LeadsSelectionToolbar
          selectedIds={Array.from(selectedLeadIds)}
          onClear={() => setSelectedLeadIds(new Set())}
        />
      )}
    </AnimatePresence>
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
      {/* Table toolbar — going cold + status pills | sort + columns + export */}
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
        <button
          type="button"
          onClick={toggleGoingCold}
          aria-pressed={goingCold}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            height:       '2.25rem',
            padding:      '0 var(--space-3)',
            background:   goingCold ? 'var(--color-warning-subtle)' : 'transparent',
            border:       `1px solid ${goingCold ? 'var(--color-warning)' : 'var(--theme-paper-border)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize:     'var(--text-sm)',
            fontFamily:   'var(--font-sans)',
            fontWeight:   'var(--weight-medium)',
            color:        goingCold ? 'var(--color-warning-text)' : 'var(--theme-text-secondary)',
            cursor:       'pointer',
            transition:   'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)',
            whiteSpace:   'nowrap',
            flexShrink:   0,
            outline:      'none',
          }}
        >
          <Clock
            style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }}
            aria-hidden="true"
          />
          <span>Going Cold</span>
        </button>

        {hasStatusPills && (
          <div
            className="hidden md:flex items-center gap-2 shrink-0"
            aria-label="Lead status summary"
          >
            {LEAD_STATUSES.map((status) => {
              const count = statusCounts[status] ?? 0;
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

        {/* Sort order — commits immediately to URL (not part of filter draft) */}
        <button
          type="button"
          onClick={toggleSortOrder}
          title={sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}
          aria-pressed={sortOrder === 'asc'}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            height:       '2.25rem',
            padding:      '0 var(--space-3)',
            background:   sortOrder === 'asc' ? 'var(--theme-paper-subtle)' : 'transparent',
            border:       `1px solid ${sortOrder === 'asc' ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize:     'var(--text-sm)',
            fontFamily:   'var(--font-sans)',
            fontWeight:   'var(--weight-medium)',
            color:        sortOrder === 'asc' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
            cursor:       'pointer',
            transition:   'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)',
            whiteSpace:   'nowrap',
            flexShrink:   0,
            outline:      'none',
          }}
        >
          <ArrowDownUp
            style={{
              width:       '0.875rem',
              height:      '0.875rem',
              strokeWidth: 1.5,
              transform:   sortOrder === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
              transition:  'transform 200ms ease-out',
            }}
            aria-hidden="true"
          />
          <span>{sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}</span>
        </button>

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
            anchorRef={pickerAnchorRef}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            toggleColumn={toggleColumn}
            reorderColumns={reorderColumns}
            resetToDefaults={resetToDefaults}
          />
        </div>

        <ExportButton filters={filters} />

      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--theme-paper-subtle)' }}>
              {/* Fixed checkbox column — not in lead-columns.ts registry */}
              <th
                style={{
                  width:        '2.5rem',
                  padding:      'var(--space-3) var(--space-3) var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--theme-paper-border)',
                }}
              >
                <CheckboxCell
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  label="Select all"
                />
              </th>
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
                  colSpan={orderedVisible.length + 1}
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
                    {goingCold
                      ? 'No cold leads.'
                      : hasActiveFilters
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
                    {goingCold
                      ? 'All leads have had recent activity.'
                      : hasActiveFilters
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
                  selected={selectedLeadIds.has(lead.id)}
                  onToggleSelect={toggleOne}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
    </>
  );
}

// ─────────────────────────────────────────────
// Checkbox cell — indeterminate support via ref
// ─────────────────────────────────────────────
function CheckboxCell({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked:       boolean;
  indeterminate?: boolean;
  onChange:      () => void;
  label:         string;
}) {
  const active = checked || (indeterminate ?? false);
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(); } }}
      style={{
        width:        '1rem',
        height:       '1rem',
        borderRadius: 'var(--radius-xs)',
        border:       `1.5px solid ${active ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
        background:   active ? 'var(--theme-accent)' : 'transparent',
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexShrink:   0,
        transition:   'background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {indeterminate && !checked && (
        <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
          <rect x="0" y="0" width="8" height="2" rx="1" fill="var(--theme-accent-fg)" />
        </svg>
      )}
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="var(--theme-accent-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Single table row — renders only visible cells in the stored order
// ─────────────────────────────────────────────
function LeadRow({
  lead,
  visibleColumns,
  selected,
  onToggleSelect,
}: {
  lead:           LeadListItemWithAssignee;
  visibleColumns: LeadColumnId[];
  selected:       boolean;
  onToggleSelect: (id: string) => void;
}) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [hovered, setHovered] = useState(false);
  const badgeVariant = LEAD_STATUS_BADGE[lead.status];
  const fullName     = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  const fromUrl = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const href = `/leads/${lead.slug ?? lead.id}?from=${encodeURIComponent(fromUrl)}`;

  return (
    <tr
      onClick={() => router.push(href)}
      onMouseEnter={() => {
        setHovered(true);
        router.prefetch(href);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--theme-paper-border)',
        cursor:       'pointer',
        background:   selected ? 'var(--theme-accent-surface)' : undefined,
      }}
    >
      {/* Checkbox cell — stopPropagation prevents row nav on click */}
      <td
        style={{ padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-4)', width: '2.5rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <CheckboxCell
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          label={`Select ${fullName}`}
        />
      </td>
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
          {getLeadSourceLabel(lead.source)}
        </td>
      );

    case 'medium':
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
          {getMetaMediumLabel(lead.medium) ?? '—'}
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
          {formatDate(lead.created_at, 'dd MMM, h:mm a')}
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

    case 'latest_note': {
      const note = lead.latest_note;
      if (!note) {
        return (
          <td style={{ ...baseCell, fontSize: 'var(--text-sm)', color: 'var(--theme-text-tertiary)' }}>
            {'—'}
          </td>
        );
      }
      return (
        <td style={{ ...baseCell, whiteSpace: 'normal', maxWidth: '20rem', verticalAlign: 'top' }}>
          <div
            style={{
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              maxWidth:     '280px',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-secondary)',
            }}
          >
            {note.content}
          </div>
          <div
            style={{
              marginTop:     '2px',
              fontSize:      '10px',
              fontWeight:    'var(--weight-medium)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color:         'var(--theme-text-tertiary)',
              whiteSpace:    'nowrap',
            }}
          >
            {[note.author_name, formatDate(note.created_at, 'dd MMM, h:mm a')]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </td>
      );
    }

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
