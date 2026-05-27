'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type LeadsPaginationProps = {
  page:       number;
  pageSize:   number;
  totalCount: number;
};

export function LeadsPagination({ page, pageSize, totalCount }: LeadsPaginationProps) {
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
        {' '}lead{totalCount !== 1 ? 's' : ''}
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
            if (!isPrevDisabled) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
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
            if (!isNextDisabled) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
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
