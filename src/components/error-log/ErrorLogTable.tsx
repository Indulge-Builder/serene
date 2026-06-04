'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LeadRawPayload } from '@/lib/types/database';
import { formatDate } from '@/lib/utils/dates';

// ─────────────────────────────────────────────
// Error category labels — derived from ingestion_error values
// set by lead-ingestion.ts and route.ts
// ─────────────────────────────────────────────
const ERROR_CATEGORY_LABELS: Record<string, string> = {
  unauthorized:             'Unauthorized',
  server_misconfiguration:  'Server misconfiguration',
  validation_failed:        'Validation failed',
};

function categoriseError(raw: string): string {
  // db_insert_failed: <message> → trim to key
  if (raw.startsWith('db_insert_failed')) return 'DB insert failed';
  if (raw.startsWith('backfill_failed'))  return 'Backfill failed';
  return ERROR_CATEGORY_LABELS[raw] ?? raw;
}

function errorVariant(raw: string): 'danger' | 'warning' {
  if (raw === 'unauthorized' || raw === 'server_misconfiguration') return 'warning';
  return 'danger';
}

// ─────────────────────────────────────────────
// Pill badge
// ─────────────────────────────────────────────
type BadgeVariant = 'danger' | 'warning' | 'neutral';

const BADGE: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  danger: {
    bg:     'var(--color-danger-light)',
    text:   'var(--color-danger-text)',
    border: 'var(--color-danger-light)',
  },
  warning: {
    bg:     'var(--color-warning-light)',
    text:   'var(--color-warning-text)',
    border: 'var(--color-warning-light)',
  },
  neutral: {
    bg:     'var(--color-neutral-light)',
    text:   'var(--color-neutral-text)',
    border: 'var(--color-neutral-light)',
  },
};

function Pill({ variant, label }: { variant: BadgeVariant; label: string }) {
  const s = BADGE[variant];
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        padding:      '0.125rem 0.625rem',
        borderRadius: 'var(--radius-full)',
        border:       `1px solid ${s.border}`,
        background:   s.bg,
        color:        s.text,
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

// ─────────────────────────────────────────────
// Expandable payload viewer
// ─────────────────────────────────────────────
function PayloadCell({ payload }: { payload: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(payload, null, 2);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display:     'inline-flex',
          alignItems:  'center',
          gap:         'var(--space-1)',
          background:  'none',
          border:      'none',
          cursor:      'pointer',
          padding:     0,
          fontSize:    'var(--text-xs)',
          color:       'var(--theme-accent)',
          fontWeight:  'var(--weight-medium)',
          transition:  'opacity var(--duration-fast) var(--ease-in-out)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        <ChevronRight
          style={{
            width:     '0.75rem',
            height:    '0.75rem',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform var(--duration-fast) var(--ease-in-out)',
          }}
        />
        {open ? 'Hide payload' : 'View payload'}
      </button>

      {open && (
        <pre
          style={{
            marginTop:    'var(--space-2)',
            padding:      'var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper-subtle)',
            border:       '1px solid var(--theme-paper-border)',
            fontSize:     'var(--text-2xs)',
            fontFamily:   'var(--font-mono)',
            color:        'var(--theme-text-secondary)',
            overflowX:    'auto',
            maxHeight:    '16rem',
            overflowY:    'auto',
            whiteSpace:   'pre-wrap',
            wordBreak:    'break-all',
            lineHeight:   'var(--leading-relaxed)',
            margin:       0,
          }}
        >
          {json}
        </pre>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Source filter options
// ─────────────────────────────────────────────
type SourceFilter = 'all' | string;

// ─────────────────────────────────────────────
// Main table
// ─────────────────────────────────────────────
type ErrorLogTableProps = {
  rows: LeadRawPayload[];
};

export function ErrorLogTable({ rows }: ErrorLogTableProps) {
  const [search, setSearch]           = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // Derive unique sources from data
  const sources = useMemo(
    () => ['all', ...Array.from(new Set(rows.map((r) => r.source))).sort()],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (q) {
        const haystack = [
          r.id,
          r.source,
          r.ingestion_error ?? '',
          r.lead_id ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, sourceFilter]);

  return (
    <div
      style={{
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        overflow:     'hidden',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {/* Filter bar */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
          flexWrap:     'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search
            style={{
              position:      'absolute',
              left:          'var(--space-3)',
              top:           '50%',
              transform:     'translateY(-50%)',
              width:         '1rem',
              height:        '1rem',
              color:         'var(--theme-text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search by ID, source, error…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width:        '100%',
              height:       '2.25rem',
              paddingLeft:  'calc(var(--space-3) + 1rem + var(--space-2))',
              paddingRight: 'var(--space-3)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              background:   'var(--theme-paper)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              outline:      'none',
              transition:   'var(--transition-hover)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-accent)';
              e.currentTarget.style.boxShadow   = 'var(--shadow-focus)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
              e.currentTarget.style.boxShadow   = 'none';
            }}
          />
        </div>

        {/* Source filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              height:       '2.25rem',
              paddingLeft:  'var(--space-3)',
              paddingRight: 'var(--space-6)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              background:   'var(--theme-paper-subtle)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              appearance:       'none',
              WebkitAppearance: 'none',
              cursor:           'pointer',
              outline:          'none',
              transition:       'var(--transition-hover)',
            }}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All sources' : s}
              </option>
            ))}
          </select>
          <ChevronDown
            style={{
              position:      'absolute',
              right:         'var(--space-2)',
              top:           '50%',
              transform:     'translateY(-50%)',
              width:         '0.875rem',
              height:        '0.875rem',
              color:         'var(--theme-text-tertiary)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Count */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          {filtered.length} error{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--theme-paper-subtle)' }}>
              {['Received', 'Source', 'Error', 'Lead linked', 'Payload'].map((col) => (
                <th
                  key={col}
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
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: 'var(--space-16) var(--space-4)', textAlign: 'center' }}
                >
                  {rows.length === 0 ? (
                    <>
                      <CheckCircle2
                        style={{
                          width:   '2rem',
                          height:  '2rem',
                          color:   'var(--color-success)',
                          margin:  '0 auto var(--space-3)',
                          display: 'block',
                        }}
                      />
                      <p
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize:   'var(--text-lg)',
                          fontStyle:  'italic',
                          color:      'var(--theme-text-tertiary)',
                          fontWeight: 'var(--weight-normal)',
                          margin:     0,
                        }}
                      >
                        All clear — no ingestion errors.
                      </p>
                      <p
                        style={{
                          marginTop: 'var(--space-2)',
                          fontSize:  'var(--text-sm)',
                          color:     'var(--theme-text-tertiary)',
                        }}
                      >
                        Every payload received so far has been ingested successfully.
                      </p>
                    </>
                  ) : (
                    <>
                      <AlertTriangle
                        style={{
                          width:   '1.5rem',
                          height:  '1.5rem',
                          color:   'var(--color-warning)',
                          margin:  '0 auto var(--space-3)',
                          display: 'block',
                        }}
                      />
                      <p
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize:   'var(--text-lg)',
                          fontStyle:  'italic',
                          color:      'var(--theme-text-tertiary)',
                          fontWeight: 'var(--weight-normal)',
                          margin:     0,
                        }}
                      >
                        No errors match your filters.
                      </p>
                      <p
                        style={{
                          marginTop: 'var(--space-2)',
                          fontSize:  'var(--text-sm)',
                          color:     'var(--theme-text-tertiary)',
                        }}
                      >
                        Try clearing the search or changing the source filter.
                      </p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((row) => <ErrorRow key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Single error row
// ─────────────────────────────────────────────
function ErrorRow({ row }: { row: LeadRawPayload }) {
  const errorStr  = row.ingestion_error ?? '';
  const variant   = errorVariant(errorStr);
  const category  = categoriseError(errorStr);

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--theme-paper-border)',
        verticalAlign: 'top',
      }}
    >
      {/* Received */}
      <td
        style={{
          padding:    'var(--space-3) var(--space-4)',
          fontSize:   'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color:      'var(--theme-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatDate(row.received_at, 'dd MMM yyyy, HH:mm')}
      </td>

      {/* Source */}
      <td style={{ padding: 'var(--space-3) var(--space-4)', whiteSpace: 'nowrap' }}>
        <Pill variant="neutral" label={row.source} />
      </td>

      {/* Error */}
      <td style={{ padding: 'var(--space-3) var(--space-4)', minWidth: '14rem' }}>
        <Pill variant={variant} label={category} />
        {/* Full raw string if it carries extra detail (db/backfill errors) */}
        {(errorStr.startsWith('db_insert_failed') || errorStr.startsWith('backfill_failed')) && (
          <p
            style={{
              marginTop:  'var(--space-1)',
              fontSize:   'var(--text-2xs)',
              fontFamily: 'var(--font-mono)',
              color:      'var(--color-danger-text)',
              lineHeight: 'var(--leading-relaxed)',
              wordBreak:  'break-word',
            }}
          >
            {errorStr}
          </p>
        )}
      </td>

      {/* Lead linked */}
      <td
        style={{
          padding:    'var(--space-3) var(--space-4)',
          fontSize:   'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color:      row.lead_id ? 'var(--theme-text-secondary)' : 'var(--theme-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        {row.lead_id ? row.lead_id.slice(0, 8) + '…' : '—'}
      </td>

      {/* Payload */}
      <td style={{ padding: 'var(--space-3) var(--space-4)', minWidth: '10rem' }}>
        <PayloadCell payload={row.payload} />
      </td>
    </tr>
  );
}
