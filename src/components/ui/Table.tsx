'use client';

import React from 'react';

/**
 * Generic column definition for Table<T>.
 *
 * INTENDED USE — read before adopting:
 * Table<T> is designed for secondary/admin tables that need a quick structured
 * layout: audit logs, user management tables, reporting grids, RPC result tables.
 *
 * It is NOT intended to replace bespoke feature tables that require:
 *   - Custom toolbars (status summary pills, column pickers)
 *   - Per-user column visibility + drag-to-reorder (useLeadColumnPreferences pattern)
 *   - Domain-specific cell renderers with per-cell style overrides
 *   - Realtime row updates without full re-render
 *
 * LeadsTable (src/components/leads/LeadsTable.tsx) is the canonical example of a
 * bespoke feature table. It will never adopt Table<T> — and that is correct.
 * If a future feature table needs the same toolbar/column-picker pattern, clone
 * the LeadsTable structure and the useLeadColumnPreferences hook (Q-08), do not
 * force it through Table<T>.
 */
export interface TableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  selectedRowKey?: string;
  emptyState?: React.ReactNode;
  stickyHeader?: boolean;
  /**
   * Pass true when the consumer provides virtualisation above this component.
   * When false and rowCount > 100, a dev-only console.warn is logged (rule P-03).
   */
  virtualized?: boolean;
  rowCount?: number;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedRowKey,
  emptyState,
  stickyHeader = false,
  virtualized = false,
  rowCount,
  loading = false,
  className,
  style,
}: TableProps<T>) {
  const count = rowCount ?? rows.length;

  if (process.env.NODE_ENV !== 'production' && !virtualized && count > 100) {
    console.warn(
      `[Table] Rendering ${count} rows without virtualisation. ` +
      `Set virtualized={true} and handle virtualisation in the consumer, or ` +
      `consider a paginated approach. (rule P-03)`
    );
  }

  return (
    <div
      className={className}
      style={{
        width:    '100%',
        overflow: 'auto',
        ...style,
      }}
    >
      <table
        style={{
          width:           '100%',
          borderCollapse:  'collapse',
          fontSize:        'var(--text-sm)',
          fontFamily:      'var(--font-sans)',
        }}
      >
        <thead
          style={
            stickyHeader
              ? { position: 'sticky', top: 0, zIndex: 'var(--z-sticky)' as React.CSSProperties['zIndex'] }
              : undefined
          }
        >
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                className="label-micro"
                style={{
                  width:       col.width,
                  padding:     'var(--space-2) var(--space-4)',
                  background:  'var(--theme-paper-subtle)',
                  borderBottom:'1px solid var(--theme-paper-border)',
                  textAlign:   col.align ?? 'left',
                  fontWeight:  'var(--weight-semibold)',
                  whiteSpace:  'nowrap',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading || rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding:    'var(--space-12) var(--space-4)',
                  textAlign:  'center',
                  color:      'var(--theme-text-tertiary)',
                }}
              >
                {loading ? null : (emptyState ?? (
                  <span
                    style={{
                      fontFamily:  'var(--font-serif)',
                      fontStyle:   'italic',
                      fontSize:    'var(--text-base)',
                      color:       'var(--theme-text-tertiary)',
                    }}
                  >
                    Nothing to show here.
                  </span>
                ))}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const key = rowKey(row, i);
              const isSelected = selectedRowKey === key;
              // Row-by-row arrival (design-dna M-04) — first 8 rows, 30ms steps
              const entering = i < 8;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={entering ? 'eia-row-enter' : undefined}
                  style={{
                    background:  isSelected ? 'var(--theme-accent-surface)' : 'transparent',
                    cursor:      onRowClick ? 'pointer' : 'default',
                    transition:  'background var(--duration-fast) var(--ease-in-out)',
                    borderBottom:'1px solid var(--theme-paper-border)',
                    animationDelay: entering ? `${i * 30}ms` : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'var(--theme-paper-subtle)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                    }
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      style={{
                        padding:   'var(--space-3) var(--space-4)',
                        textAlign: col.align ?? 'left',
                        color:     'var(--theme-text-primary)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {col.cell(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
