'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { X } from 'lucide-react';
import type { UserRole, AppDomain, CampaignFilters } from '@/lib/types/database';
import { APP_DOMAINS, DOMAIN_LABELS } from '@/lib/constants/domains';

type CampaignFiltersProps = {
  role:    UserRole;
  filters: CampaignFilters;
};

// ─────────────────────────────────────────────
// Helpers — URL param I/O
// ─────────────────────────────────────────────

function buildParams(
  current: URLSearchParams,
  updates: Record<string, string | null>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === '') {
      next.delete(key);
    } else {
      next.set(key, val);
    }
  }
  return next;
}

// ─────────────────────────────────────────────
// CampaignFilters
// ─────────────────────────────────────────────

export function CampaignFilters({ role, filters }: CampaignFiltersProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const [, startTransition] = useTransition();

  const showDomainFilter = role === 'admin' || role === 'founder';

  function push(updates: Record<string, string | null>) {
    const next = buildParams(params, updates);
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function clearAll() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  const hasActive = !!(filters.date_from || filters.date_to || filters.domain);

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        flexWrap:   'wrap',
      }}
    >
      {/* Domain filter — admin/founder only */}
      {showDomainFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <label
            style={{
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-xs)',
              fontWeight:    'var(--weight-medium)',
              color:         'var(--theme-text-secondary)',
              whiteSpace:    'nowrap',
            }}
          >
            Domain
          </label>
          <select
            value={filters.domain ?? ''}
            onChange={(e) => push({ domain: e.target.value || null })}
            style={{
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              padding:      '6px var(--space-3)',
              cursor:       'pointer',
              outline:      'none',
            }}
          >
            <option value="">All domains</option>
            {APP_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date from */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            fontWeight: 'var(--weight-medium)',
            color:      'var(--theme-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          From
        </label>
        <input
          type="date"
          value={filters.date_from ?? ''}
          onChange={(e) => push({ date_from: e.target.value || null })}
          style={{
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-sm)',
            color:        'var(--theme-text-primary)',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-sm)',
            padding:      '6px var(--space-3)',
            caretColor:   'var(--theme-accent)',
            outline:      'none',
          }}
        />
      </div>

      {/* Date to */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            fontWeight: 'var(--weight-medium)',
            color:      'var(--theme-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          To
        </label>
        <input
          type="date"
          value={filters.date_to ?? ''}
          onChange={(e) => push({ date_to: e.target.value || null })}
          style={{
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-sm)',
            color:        'var(--theme-text-primary)',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-sm)',
            padding:      '6px var(--space-3)',
            caretColor:   'var(--theme-accent)',
            outline:      'none',
          }}
        />
      </div>

      {/* Clear all */}
      {hasActive && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            fontWeight:   'var(--weight-medium)',
            color:        'var(--theme-text-secondary)',
            background:   'transparent',
            border:       'none',
            borderRadius: 'var(--radius-sm)',
            padding:      '4px var(--space-2)',
            cursor:       'pointer',
            transition:   'color var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme-text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-secondary)'; }}
        >
          <X style={{ width: '12px', height: '12px', strokeWidth: 1.5 }} />
          Clear
        </button>
      )}
    </div>
  );
}
