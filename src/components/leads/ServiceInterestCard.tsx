'use client';

// Call Intelligence — dossier interest card (Surface A, spec §8; search added
// 2026-06-12). Always visible — leads with no interests get the search-first
// view instead of nothing. Curated cases (≤6, matched on interests/city) show
// at rest; typing searches the FULL helpdesk library for the lead's domain:
// one getHelpdeskLibraryAction fetch on first keystroke (Redis 1hr envelope
// behind it), then synchronous client-side filtering via caseMatchesQuery —
// never a per-keystroke server search (spec §6/§9).

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SearchBar } from '@/components/ui/SearchBar';
import { CaseCard } from '@/components/intelligence/CaseCard';
import { HookList } from '@/components/intelligence/HookList';
import { getHelpdeskLibraryAction } from '@/lib/actions/intelligence';
import { caseMatchesQuery } from '@/lib/utils/case-search';
import type { ServiceCase, ConversationHook } from '@/lib/services/intelligence-service';
import type { AppDomain } from '@/lib/types/database';

const SEARCH_RESULT_CAP = 8;

type Props = {
  interests: string[];
  cases:     ServiceCase[];
  hooks:     ConversationHook[];
  /** Lead's domain — picks which helpdesk library shelf the search reads. */
  domain:    AppDomain;
};

export function ServiceInterestCard({ interests, cases, hooks, domain }: Props) {
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<ServiceCase[] | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const fetchStartedRef = useRef(false);

  // Lazy library load — fires once, on the first keystroke, never on mount.
  function handleQueryChange(next: string) {
    setQuery(next);
    if (next.trim().length === 0 || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    getHelpdeskLibraryAction(domain).then((result) => {
      if (result.data) {
        setLibrary(result.data.cases);
      } else {
        setLibraryError(true);
        fetchStartedRef.current = false; // allow a retry on the next keystroke
      }
    });
  }

  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  const matches = useMemo(() => {
    if (!searching || library === null) return [];
    return library.filter((c) => caseMatchesQuery(c, trimmed));
  }, [library, searching, trimmed]);

  const visibleMatches = matches.slice(0, SEARCH_RESULT_CAP);

  // Sanctioned deviation (build brief): quiet footer link into the helpdesk,
  // pre-filtered to the first matched interest.
  const linkCategory = interests[0] ?? cases[0]?.category ?? null;
  const helpdeskHref = linkCategory
    ? `/helpdesk?category=${encodeURIComponent(linkCategory)}`
    : '/helpdesk';

  return (
    <section
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-5)',
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-4)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize:   'var(--text-lg)',
          fontWeight: 'var(--weight-normal)',
          color:      'var(--theme-text-primary)',
          margin:     0,
        }}
      >
        Why we&rsquo;re perfect<span className="page-title-dot">.</span>
      </h2>

      <SearchBar
        value={query}
        onChange={handleQueryChange}
        size="sm"
        placeholder="Search the library — keyword, city, service…"
        aria-label="Search delivery history"
      />

      {searching ? (
        /* ── Search view — full library, client-filtered ─────────────── */
        library === null && !libraryError ? (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
            }}
          >
            Searching the library…
          </p>
        ) : libraryError ? (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
            }}
          >
            The library is unreachable right now. Keep typing to retry.
          </p>
        ) : matches.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle:  'italic',
              fontSize:   'var(--text-sm)',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
            }}
          >
            Nothing matches. Try a different keyword.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {visibleMatches.map((c, i) => (
                <CaseCard key={c.id} serviceCase={c} index={i} />
              ))}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                margin:     0,
              }}
            >
              {matches.length} match{matches.length === 1 ? '' : 'es'}
              {matches.length > SEARCH_RESULT_CAP
                ? ` — showing ${SEARCH_RESULT_CAP}; browse the full library for the rest`
                : ''}
            </p>
          </>
        )
      ) : (
        /* ── Rest view — curated interest/city matches ───────────────── */
        <>
          {cases.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-tertiary)',
                margin:     0,
              }}
            >
              {interests.length === 0
                ? 'No interests on file yet — search the library above, or add interests on the contact card.'
                : 'No examples on file for this category yet.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {cases.map((c, i) => (
                <CaseCard key={c.id} serviceCase={c} index={i} />
              ))}
            </div>
          )}

          {hooks.length > 0 && (
            <div
              style={{
                paddingTop: 'var(--space-4)',
                borderTop:  '1px solid var(--theme-paper-border)',
              }}
            >
              <HookList hooks={hooks} label="Talking points" />
            </div>
          )}
        </>
      )}

      <Link
        href={helpdeskHref}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            'var(--space-1)',
          alignSelf:      'flex-end',
          fontFamily:     'var(--font-sans)',
          fontSize:       'var(--text-xs)',
          color:          'var(--theme-text-tertiary)',
          textDecoration: 'none',
          transition:     'color var(--duration-fast) var(--ease-in-out)',
        }}
      >
        Browse the full library
        <ArrowUpRight style={{ width: '12px', height: '12px', strokeWidth: 1.5 }} />
      </Link>
    </section>
  );
}
