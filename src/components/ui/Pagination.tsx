'use client';

// Pagination — THE URL-param pager for server-filtered lists.
//
// Reads the current query string and rewrites ONLY `page`, so every other
// filter on the URL — search, category, status, date range — survives the
// click. `page` is dropped from the URL on page 1 so the unpaged URL stays
// canonical. Navigation runs in a transition, so the old table stays put until
// the new one is ready.
//
// This is LeadsPagination generalised: the vendors list needed the same thing,
// and its first pager was a bare `?page=N` link that dropped the search and
// the category on the way to page two. LeadsPagination is now a thin wrapper
// over this (R-01 / R-04 — one mechanism, never a fork), so its three call
// sites did not change.

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type PaginationProps = {
  page:       number;
  pageSize:   number;
  totalCount: number;
  /** Singular noun for the count line — "lead", "vendor". Pluralised with an s. */
  noun?:      string;
};

export function Pagination({ page, pageSize, totalCount, noun = 'result' }: PaginationProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const [, startTransition] = useTransition();

  const lastPage = Math.ceil(totalCount / pageSize);
  const from     = (page - 1) * pageSize + 1;
  const to       = Math.min(page * pageSize, totalCount);

  function goToPage(next: number) {
    const p = new URLSearchParams(params.toString());
    if (next === 1) {
      p.delete('page');
    } else {
      p.set('page', String(next));
    }
    const qs = p.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  const isPrevDisabled = page <= 1;
  const isNextDisabled = page >= lastPage;

  const disabledStyle: React.CSSProperties = {
    opacity:        0.4,
    cursor:         'not-allowed',
    pointerEvents:  'none',
  };

  const btnBase: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    justifyContent: 'center',
    width:        '2.25rem',
    height:       '2.25rem',
    border:       '1px solid var(--theme-paper-border)',
    borderRadius: 'var(--radius-sm)',
    background:   'transparent',
    color:        'var(--theme-text-secondary)',
    cursor:       'pointer',
    transition:   'var(--transition-hover)',
    flexShrink:   0,
  };

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        paddingTop:     'var(--space-4)',
        marginTop:      'var(--space-2)',
        borderTop:      '1px solid var(--theme-paper-border)',
      }}
    >
      {/* Left — result count */}
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color:    'var(--theme-text-secondary)',
        }}
      >
        Showing{' '}
        <span style={{ fontWeight: 'var(--weight-medium)' }}>{from}–{to}</span>
        {' '}of{' '}
        <span style={{ fontWeight: 'var(--weight-medium)' }}>{totalCount}</span>
        {' '}{noun}{totalCount !== 1 ? 's' : ''}
      </span>

      {/* Right — page controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* Previous */}
        <button
          type="button"
          aria-label="Previous page"
          disabled={isPrevDisabled}
          onClick={() => goToPage(page - 1)}
          style={{ ...btnBase, ...(isPrevDisabled ? disabledStyle : {}) }}
          onMouseEnter={(e) => {
            if (!isPrevDisabled) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--theme-accent) 5%, transparent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <ChevronLeft style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        </button>

        {/* Page indicator */}
        <span
          style={{
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          Page{' '}
          <span style={{ fontWeight: 'var(--weight-medium)' }}>{page}</span>
          {' '}of{' '}
          <span style={{ fontWeight: 'var(--weight-medium)' }}>{lastPage}</span>
        </span>

        {/* Next */}
        <button
          type="button"
          aria-label="Next page"
          disabled={isNextDisabled}
          onClick={() => goToPage(page + 1)}
          style={{ ...btnBase, ...(isNextDisabled ? disabledStyle : {}) }}
          onMouseEnter={(e) => {
            if (!isNextDisabled) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--theme-accent) 5%, transparent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <ChevronRight style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        </button>
      </div>
    </div>
  );
}
