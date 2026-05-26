'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight } from 'lucide-react';
import type { Lead } from '@/lib/types/database';
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { formatDate } from '@/lib/utils/dates';

type LeadsTableProps = {
  leads: Lead[];
};

type StatusFilter = 'all' | Lead['status'];

export function LeadsTable({ leads }: LeadsTableProps) {
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          l.first_name,
          l.last_name ?? '',
          l.phone ?? '',
          l.email ?? '',
          l.utm_campaign ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, statusFilter]);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all',           label: 'All statuses' },
    { value: 'new',           label: 'New' },
    { value: 'touched',       label: 'Touched' },
    { value: 'in_discussion', label: 'In Discussion' },
    { value: 'won',           label: 'Won' },
    { value: 'nurturing',     label: 'Nurturing' },
    { value: 'lost',          label: 'Lost' },
    { value: 'junk',          label: 'Junk' },
  ];

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
              position:  'absolute',
              left:      'var(--space-3)',
              top:       '50%',
              transform: 'translateY(-50%)',
              width:     '1rem',
              height:    '1rem',
              color:     'var(--theme-text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search name, phone, email…"
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

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{
              height:          '2.25rem',
              paddingLeft:     'var(--space-3)',
              paddingRight:    'var(--space-6)',
              border:          '1px solid var(--theme-paper-border)',
              borderRadius:    'var(--radius-sm)',
              background:      'var(--theme-paper-subtle)',
              fontSize:        'var(--text-sm)',
              color:           'var(--theme-text-primary)',
              appearance:      'none',
              cursor:          'pointer',
              outline:         'none',
              transition:      'var(--transition-hover)',
            }}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronRight
            style={{
              position:      'absolute',
              right:         'var(--space-2)',
              top:           '50%',
              transform:     'translateY(-50%) rotate(90deg)',
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
          {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--theme-paper-subtle)' }}>
              {['Status', 'Name', 'Phone', 'Campaign', 'Created', 'Last outcome'].map((col) => (
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
              <th
                style={{
                  padding:      'var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--theme-paper-border)',
                  width:        '2.5rem',
                }}
              />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding:   'var(--space-16) var(--space-4)',
                    textAlign: 'center',
                  }}
                >
                  <p
                    style={{
                      fontFamily:  'var(--font-serif)',
                      fontSize:    'var(--text-lg)',
                      fontStyle:   'italic',
                      color:       'var(--theme-text-tertiary)',
                      fontWeight:  'var(--weight-normal)',
                    }}
                  >
                    {search || statusFilter !== 'all'
                      ? 'No leads match your filters.'
                      : 'No leads yet.'}
                  </p>
                  <p
                    style={{
                      marginTop: 'var(--space-2)',
                      fontSize:  'var(--text-sm)',
                      color:     'var(--theme-text-tertiary)',
                    }}
                  >
                    {search || statusFilter !== 'all'
                      ? 'Try adjusting your search or filter.'
                      : 'Leads will appear here once the webhook receives its first submission.'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <LeadRow key={lead.id} lead={lead} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Single table row
// ─────────────────────────────────────────────
function LeadRow({ lead }: { lead: Lead }) {
  const badgeVariant = LEAD_STATUS_BADGE[lead.status];
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  return (
    <tr
      style={{ borderBottom: '1px solid var(--theme-paper-border)', transition: 'background var(--duration-fast) var(--ease-in-out)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--theme-paper-subtle)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
    >
      {/* Status */}
      <td style={{ padding: 'var(--space-3) var(--space-4)', whiteSpace: 'nowrap' }}>
        <StatusBadge variant={badgeVariant} label={LEAD_STATUS_LABELS[lead.status]} />
      </td>

      {/* Name */}
      <td
        style={{
          padding:    'var(--space-3) var(--space-4)',
          fontSize:   'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color:      'var(--theme-text-primary)',
          whiteSpace: 'nowrap',
        }}
      >
        {fullName}
      </td>

      {/* Phone */}
      <td
        style={{
          padding:    'var(--space-3) var(--space-4)',
          fontSize:   'var(--text-sm)',
          fontFamily: 'var(--font-mono)',
          color:      'var(--theme-text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {lead.phone ?? '—'}
      </td>

      {/* Campaign */}
      <td
        style={{
          padding:  'var(--space-3) var(--space-4)',
          fontSize: 'var(--text-xs)',
          color:    'var(--theme-text-tertiary)',
          maxWidth: '12rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}
      >
        {lead.utm_campaign ?? '—'}
      </td>

      {/* Created */}
      <td
        style={{
          padding:    'var(--space-3) var(--space-4)',
          fontSize:   'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color:      'var(--theme-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatDate(lead.created_at)}
      </td>

      {/* Last outcome */}
      <td
        style={{
          padding:  'var(--space-3) var(--space-4)',
          fontSize: 'var(--text-xs)',
          color:    'var(--theme-text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {lead.last_call_outcome
          ? CALL_OUTCOME_LABELS[lead.last_call_outcome]
          : '—'}
      </td>

      {/* Arrow */}
      <td style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'right' }}>
        <Link
          href={`/leads/${lead.id}`}
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          '1.75rem',
            height:         '1.75rem',
            borderRadius:   'var(--radius-xs)',
            color:          'var(--theme-text-tertiary)',
            transition:     'var(--transition-hover)',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--theme-accent)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--theme-text-tertiary)'; }}
          aria-label={`View lead ${fullName}`}
        >
          <ChevronRight style={{ width: '1rem', height: '1rem' }} />
        </Link>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────
type BadgeVariant = 'neutral' | 'info' | 'warning' | 'success' | 'accent' | 'danger';

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
        display:        'inline-flex',
        alignItems:     'center',
        padding:        '0.125rem 0.625rem',
        borderRadius:   'var(--radius-full)',
        border:         `1px solid ${styles.border}`,
        background:     styles.bg,
        color:          styles.text,
        fontSize:       'var(--text-xs)',
        fontWeight:     'var(--weight-medium)',
        whiteSpace:     'nowrap',
        boxShadow:      'var(--shadow-1)',
      }}
    >
      {label}
    </span>
  );
}
