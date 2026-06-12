// Call Intelligence — dossier interest card (Surface A, spec §8).
// Display-only; auto-populated, read-only, NO search bar — the helpdesk is
// the full library, this is the curated preview. Server-component-safe
// itself; the case cards carry their own client-side stagger entrance.

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { CaseCard } from '@/components/intelligence/CaseCard';
import { HookList } from '@/components/intelligence/HookList';
import type { ServiceCase, ConversationHook } from '@/lib/services/intelligence-service';

type Props = {
  interests: string[];
  cases:     ServiceCase[];
  hooks:     ConversationHook[];
};

export function ServiceInterestCard({ interests, cases, hooks }: Props) {
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

      {cases.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-tertiary)',
            margin:     0,
          }}
        >
          No examples on file for this category yet.
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
