'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useState, useMemo, useRef, useEffect, useTransition, useCallback, memo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { m as motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, EXIT_DURATION } from '@/lib/constants/motion';
import { ArrowDownUp, Clock, Columns, UserRound } from 'lucide-react';
import { buildFilterParams } from '@/lib/utils/filter-params';
import type { LeadListItemWithAssignee } from '@/lib/services/leads-service';
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { getLeadSourceLabel, getMetaMediumLabel } from '@/lib/constants/lead-sources';
import { formatDate } from '@/lib/utils/dates';
import { formatCount } from '@/lib/utils/numbers';
import { LEAD_COLUMN_MAP, type LeadColumnId } from '@/lib/constants/lead-columns';
import { useLeadColumnPreferences } from '@/hooks/useLeadColumnPreferences';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import { LeadsSelectionToolbar } from '@/components/leads/LeadsSelectionToolbar';
import { ExportButton } from '@/components/leads/ExportButton';
import { TabSelector } from '@/components/ui/TabSelector';
import { Tooltip } from '@/components/ui/Tooltip';
import type { AppDomain, LeadFilters, UserRole } from '@/lib/types/database';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox } from '@/components/ui/Checkbox';

/** The name cell's link inherits the row's colour; the row click stays for the mouse. */
const LINK_STYLE = { color: 'inherit', textDecoration: 'none' } as const;

// Load-on-intent (perf audit G-1): the picker (@dnd-kit chain) stays out of the
// /leads route chunk until the Columns button is first clicked.
const LeadColumnPicker = dynamic(
  () => import('@/components/leads/LeadColumnPicker').then((m) => m.LeadColumnPicker),
  { ssr: false },
);

type LeadsTableProps = {
  leads:            LeadListItemWithAssignee[];
  totalCount:       number;
  userId:           string;
  role:             UserRole;
  domain:           AppDomain;
  filters:          LeadFilters;
  hasActiveFilters?: boolean;
  goingCold?:       boolean;
  // The My/All Leads view toggle is meaningful only on the main /leads list.
  // Campaign-scoped lead tables leave this false (they're analytics drill-downs
  // showing every campaign lead, not the manager's personal worklist).
  enableViewToggle?: boolean;
};

export function LeadsTable({ leads, totalCount, userId, role, domain, filters, hasActiveFilters = false, goingCold = false, enableViewToggle = false }: LeadsTableProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const params       = useSearchParams();
  const [, startTransition] = useTransition();

  const sortOrder = params.get('sort_order') === 'asc' ? 'asc' : 'desc';

  // Manager "My Leads" / "All Leads" toggle — manager-only. The default (no
  // ?view= param) is My Leads; ?view=all shows the whole domain. Agents and
  // admin/founder never see the toggle (resolved server-side in leads/page.tsx).
  const showViewToggle = enableViewToggle && role === 'manager';
  const viewIsAll = params.get('view') === 'all';

  // The segmented control passes the TARGET view ('mine' | 'all'), not a flip.
  // Selecting the already-active segment is a no-op (no needless navigation).
  function setView(next: 'mine' | 'all') {
    const wantAll = next === 'all';
    if (wantAll === viewIsAll) return;
    const params2 = buildFilterParams(
      params,
      wantAll
        // To Team Leads → write ?view=all.
        ? { view: 'all' }
        // Back to My Leads (default) → drop the param AND any agent_id (a no-op
        // in My Leads, and the Agent filter is hidden there so it can't be cleared).
        : { view: null, agent_id: null },
      { resetKeys: ['page'] },
    );
    startTransition(() => {
      router.push(`${pathname}?${params2.toString()}`);
    });
  }

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
  const mountPicker                           = useMountOnFirstOpen(pickerOpen);
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

  // Stable identity so memo(LeadRow) skips the 29 untouched rows on a toggle (G-4)
  const toggleOne = useCallback((id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Section 11.5: content enters opacity 0→1 + y 4px→0 at 250ms ease-out-expo
  // with 100ms delay (overlap with skeleton exit at 150ms ease-in)
  return (
    <>
    <AnimatePresence>
      {selectedLeadIds.size > 0 && (
        <LeadsSelectionToolbar
          selectedIds={Array.from(selectedLeadIds)}
          onClear={() => setSelectedLeadIds(new Set())}
          callerRole={role}
          callerDomain={domain}
        />
      )}
    </AnimatePresence>
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: EXIT_DURATION, delay: 0.1, ease: EASE_OUT_EXPO }}
      style={{
        // Elevated surface + full raised pair — at plain --theme-paper the card
        // was the same tone as the shell paper beneath it and read dull/flat
        // (--neu-surface-high is THE lifted-surface token: dialogs, panels).
        background:   'var(--neu-surface-high)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        overflow:     'hidden',
        boxShadow:    'var(--neu-shadow-raised)',
      }}
    >
      {/* Table toolbar — view switcher (manager) · going cold | sort + columns + export. ONE line at
          every viewport (never wraps): below md the sort/export labels compress to icons
          (same language as the dashboard header settings button), Columns hides entirely
          (it configures table columns and the table only renders md+ — the card stack
          ignores column prefs), and the row scrolls horizontally if the controls still
          overflow a narrow phone (flex-nowrap + overflowX:auto, hidden scrollbar — the
          same single-row pattern LeadsFilters uses). The flex spacer keeps the right
          cluster pushed right on wide viewports and collapses to 0 when scrolling. */}
      <div
        style={{
          display:                 'flex',
          alignItems:              'center',
          gap:                     'var(--space-2) var(--space-3)',
          padding:                 'var(--space-4) var(--space-5)',
          borderBottom:            '1px solid var(--theme-paper-border)',
          background:              'transparent',
          flexWrap:                'nowrap',
          overflowX:               'auto',
          scrollbarWidth:          'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Lead-scope switcher — managers only, FIRST control (left cluster). A
            sliding-pill segmented toggle (TabSelector accent variant): "My Leads"
            (default, the manager's own assigned leads) and "Team Leads"
            (?view=all, the whole domain). The accent pill springs between
            segments on click via layoutId — the active segment names the CURRENT
            view, not the action. Distinct indicatorLayoutId so the pill never
            shares Framer shared-layout with any other tab group on the page
            (TabSelector collision rule). */}
        {showViewToggle && (
          <div className="serene-leads-view-switch" style={{ flexShrink: 0 }}>
            <TabSelector
              variant="accent"
              indicatorLayoutId="leads-view-switch"
              activeTab={viewIsAll ? 'all' : 'mine'}
              onChange={(id) => setView(id === 'all' ? 'all' : 'mine')}
              tabs={[
                { id: 'mine', label: 'My Leads' },
                { id: 'all', label: 'Team Leads' },
              ]}
            />
          </div>
        )}

        <Button
          variant="control"
          active={goingCold}
          type="button"
          onClick={toggleGoingCold}
          aria-pressed={goingCold}
        >
          <Clock
            style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }}
            aria-hidden="true"
          />
          <span>Going Cold</span>
        </Button>

        {/* Filtered total — always visible (the pagination summary only appears
            when totalCount > pageSize, so small result sets showed no count). */}
        <span
          style={{
            color:      'var(--theme-text-tertiary)',
            fontSize:   'var(--text-xs)',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {formatCount(totalCount)} {totalCount === 1 ? 'lead' : 'leads'}
        </span>

        <div style={{ flex: 1, minWidth: 0 }} aria-hidden="true" />

        {/* Sort order — commits immediately to URL (not part of filter draft) */}
        <Tooltip side="bottom" label={sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}>
          <Button
            variant="control"
            active={sortOrder === 'asc'}
            type="button"
            onClick={toggleSortOrder}
            aria-label={sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}
            aria-pressed={sortOrder === 'asc'}
          >
            <ArrowDownUp
              style={{
                width:       '0.875rem',
                height:      '0.875rem',
                strokeWidth: 1.5,
                transform:   sortOrder === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition:  'transform var(--duration-base) var(--ease-spring)',
              }}
              aria-hidden="true"
            />
            <span className="max-md:hidden">{sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}</span>
          </Button>
        </Tooltip>

        {/* Column picker trigger — md+ only (table-only control, see toolbar note) */}
        <div ref={pickerAnchorRef} className="max-md:hidden" style={{ position: 'relative', flexShrink: 0 }}>
          <Button
            variant="control"
            active={pickerOpen}
            aria-expanded={pickerOpen}
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-pressed={pickerOpen}
            aria-label="Toggle column visibility"
          >
            <Columns style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
            <span>Columns</span>
          </Button>

          {mountPicker && (
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
          )}
        </div>

        <ExportButton filters={filters} />

      </div>

      {/* Table — md+ only. Container scroll (not body scroll) covers tablet
          widths; below md the card stack renders instead (DNA R-05 / audit D-2). */}
      <div className="hidden md:block" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'transparent' }}>
              {/* Fixed checkbox column — not in lead-columns.ts registry */}
              <th
                style={{
                  width:        '2.5rem',
                  padding:      'var(--space-3) var(--space-3) var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--theme-paper-border)',
                }}
              >
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
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
                  style={{ padding: 'var(--space-16) var(--space-4)' }}
                >
                  <LeadsEmptyCopy goingCold={goingCold} hasActiveFilters={hasActiveFilters} />
                </td>
              </tr>
            ) : (
              leads.map((lead, index) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  index={index}
                  visibleColumns={orderedVisible}
                  selected={selectedLeadIds.has(lead.id)}
                  onToggleSelect={toggleOne}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Card stack — below md (DNA R-05 / audit D-2). Fixed mobile field set;
          deliberately ignores stored column preferences (desktop shapes must
          never drive the narrow rendering). Selection/columns/export stay
          tablet+ — mobile is a monitoring surface (DNA §9 philosophy). */}
      <div className="md:hidden">
        {leads.length === 0 ? (
          <div style={{ padding: 'var(--space-12) var(--space-4)' }}>
            <LeadsEmptyCopy goingCold={goingCold} hasActiveFilters={hasActiveFilters} />
          </div>
        ) : (
          leads.map((lead, index) => (
            <LeadMobileCard key={lead.id} lead={lead} index={index} />
          ))
        )}
      </div>
    </motion.div>
    </>
  );
}

// ─────────────────────────────────────────────
// Empty-state copy — shared by the table cell (md+) and the card stack (<md)
// so the two renderings can never drift.
// ─────────────────────────────────────────────
function LeadsEmptyCopy({
  goingCold,
  hasActiveFilters,
}: {
  goingCold:        boolean;
  hasActiveFilters: boolean;
}) {
  // The /tickets empty, inside the table's own card (so never framed here).
  return (
    <EmptyState
      icon={UserRound}
      title={goingCold ? 'No cold leads.' : hasActiveFilters ? 'Nothing matches these filters.' : 'No leads yet.'}
      description={
        goingCold
          ? 'All leads have had recent activity.'
          : hasActiveFilters
            ? 'Try adjusting or clearing your filters.'
            : 'Leads will appear here once the webhook receives its first submission.'
      }
      style={{ padding: 0 }}
    />
  );
}

// ─────────────────────────────────────────────
// Mobile lead card — one row of the <md card stack (DNA R-05: first column
// becomes the card header, key fields as labelled lines). Same href shape as
// LeadRow (slug fallback + ?from= return URL). ≥44px tap target.
// ─────────────────────────────────────────────
const LeadMobileCard = memo(function LeadMobileCard({
  lead,
  index,
}: {
  lead:  LeadListItemWithAssignee;
  index: number;
}) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
  const fromUrl  = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const href = `/leads/${lead.slug ?? lead.id}?from=${encodeURIComponent(fromUrl)}`;

  // Same row-arrival treatment as LeadRow (first 8, 30ms steps)
  const entering = index < 8;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open lead ${fullName}`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
      className={entering ? 'serene-row-enter' : undefined}
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            'var(--space-2)',
        minHeight:      '44px',
        padding:        'var(--space-4) var(--space-5)',
        borderBottom:   '1px solid var(--theme-paper-border)',
        cursor:         'pointer',
        animationDelay: entering ? `${index * 30}ms` : undefined,
      }}
    >
      {/* Header — name + status pill */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-3)',
        }}
      >
        <span
          style={{
            fontSize:     'var(--text-sm)',
            fontWeight:   'var(--weight-medium)',
            color:        'var(--theme-text-primary)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            minWidth:     0,
          }}
        >
          {fullName}
        </span>
        <StatusBadge
          variant={LEAD_STATUS_BADGE[lead.status]}
          label={LEAD_STATUS_LABELS[lead.status]}
        />
      </div>

      {/* Phone */}
      <span
        style={{
          fontSize:   'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color:      'var(--theme-text-secondary)',
        }}
      >
        {lead.phone ?? '—'}
      </span>

      {/* Assignee · received */}
      <span
        style={{
          fontSize: 'var(--text-2xs)',
          color:    'var(--theme-text-tertiary)',
        }}
      >
        {[lead.assignee?.full_name, formatDate(lead.created_at, 'dd MMM, h:mm a')]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  );
});

// ─────────────────────────────────────────────
// Checkbox cell — indeterminate support via ref
// ─────────────────────────────────────────────
// Single table row — renders only visible cells in the stored order.
// memo (G-4): props are a stable lead object, the memoised visibleColumns
// array, a primitive selected flag, and the useCallback'd toggle — so a
// selection toggle re-renders only the affected row, not all 30.
// ─────────────────────────────────────────────
const LeadRow = memo(function LeadRow({
  lead,
  index,
  visibleColumns,
  selected,
  onToggleSelect,
}: {
  lead:           LeadListItemWithAssignee;
  index:          number;
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

  // Row-by-row arrival (design-dna M-04) — first 8 rows only, 30ms steps;
  // animation runs once on DOM insertion, so persisting rows never replay.
  const entering = index < 8;

  return (
    <tr
      onClick={() => router.push(href)}
      onMouseEnter={() => {
        setHovered(true);
        router.prefetch(href);
      }}
      onMouseLeave={() => setHovered(false)}
      className={entering ? 'serene-row-enter' : undefined}
      style={{
        borderBottom:   '1px solid var(--theme-paper-border)',
        cursor:         'pointer',
        background:     selected ? 'var(--theme-accent-surface)' : undefined,
        animationDelay: entering ? `${index * 30}ms` : undefined,
      }}
    >
      {/* Checkbox cell — stopPropagation prevents row nav on click */}
      <td
        style={{ padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-4)', width: '2.5rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          aria-label={`Select ${fullName}`}
        />
      </td>
      {visibleColumns.map((colId) => (
        <LeadCell
          key={colId}
          colId={colId}
          lead={lead}
          fullName={fullName}
          href={href}
          badgeVariant={badgeVariant}
          statusHighlighted={hovered}
        />
      ))}
    </tr>
  );
});

// ─────────────────────────────────────────────
// Individual cell renderer — exhaustive switch keeps column logic co-located
// ─────────────────────────────────────────────
function LeadCell({
  colId,
  lead,
  fullName,
  href,
  badgeVariant,
  statusHighlighted,
}: {
  colId:              LeadColumnId;
  lead:               LeadListItemWithAssignee;
  fullName:           string;
  /** The dossier link; the name cell carries it so a keyboard can open the row. */
  href:               string;
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
          {/* A real link (2026-09-25): Tab reaches it, Enter opens the lead; the
              row click stays for the mouse. stopPropagation keeps one navigation. */}
          <Link href={href} onClick={(e) => e.stopPropagation()} style={LINK_STYLE}>
            {fullName}
          </Link>
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
      // Truncated cell (maxWidth 12rem + ellipsis) — the full campaign name
      // lives in the top tooltip; the '—' placeholder gets none.
      return (
        <td style={{ ...baseCell, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.utm_campaign ? (
            <Tooltip side="top" label={lead.utm_campaign}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {lead.utm_campaign}
              </span>
            </Tooltip>
          ) : (
            '—'
          )}
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
/* Ring layered over the pill's own paired chip shadow (never replaces it —
   a lone flat ring would break the shadow-pair rule). */
const STATUS_PILL_ACCENT_RING =
  '0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent), var(--neu-shadow-chip)';

function StatusBadge({
  variant,
  label,
  highlighted = false,
}: {
  variant: string;
  label:   string;
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
    </span>
  );
}
