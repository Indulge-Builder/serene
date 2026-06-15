'use client';

// Call Intelligence — the /helpdesk search surface. Owns query + category
// state and the ENTIRE filter pipeline. The full library arrives as
// initialData from the RSC page; filtering is synchronous JS on that array —
// zero server round-trips per keystroke, no debounce, no FTS (spec §6/§9).
// At >500 cases, swap the includes() filter for fuse.js — never a server query.
//
// Results render as a LIST of compact rows (2026-06-12 — replaced the
// 3-column card grid for consistency with the other list pages); clicking a
// row opens CaseDetailModal with everything saved on the case.

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { FilterBar } from '@/components/ui/FilterBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { CaseListRow } from '@/components/intelligence/CaseListRow';
import { CategoryPill } from '@/components/intelligence/CategoryPill';
import { HookList } from '@/components/intelligence/HookList';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  getServiceCategoryLabel,
  type ServiceCategory,
} from '@/lib/constants/interests';
import { caseMatchesQuery } from '@/lib/utils/case-search';
import type { ServiceCase, ConversationHook } from '@/lib/services/intelligence-service';

// Detail modal loads on intent (perf G-1) — kept mounted after first open via
// useMountOnFirstOpen so modal.tsx's internal exit animation still plays.
const CaseDetailModal = dynamic(
  () => import('@/components/intelligence/CaseDetailModal').then((m) => m.CaseDetailModal),
  { ssr: false },
);

type HelpdeskSearchProps = {
  initialCases:     ServiceCase[];
  initialHooks:     ConversationHook[];
  /** From ?category= (dossier card footer link) — initial filter only. */
  initialCategory?: string | null;
  /** admin/founder — surfaces the Edit affordance in CaseDetailModal. Server-gated. */
  canEdit?:         boolean;
};

type ActiveCategory = 'all' | ServiceCategory;

function parseCategory(raw: string | null | undefined): ActiveCategory {
  return raw && (SERVICE_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as ServiceCategory)
    : 'all';
}

export function HelpdeskSearch({
  initialCases,
  initialHooks,
  initialCategory,
  canEdit = false,
}: HelpdeskSearchProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>(
    parseCategory(initialCategory),
  );
  // Detail modal — activeCase survives close so the exit animation has content.
  const [activeCase, setActiveCase] = useState<ServiceCase | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailMounted = useMountOnFirstOpen(detailOpen);

  function openCase(c: ServiceCase) {
    setActiveCase(c);
    setDetailOpen(true);
  }

  const filtered = useMemo(() => {
    return initialCases.filter((c) => {
      const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
      return matchesCategory && caseMatchesQuery(c, query);
    });
  }, [initialCases, query, activeCategory]);

  const activeHooks = useMemo(
    () =>
      activeCategory === 'all'
        ? []
        : initialHooks.filter((h) => h.category === activeCategory),
    [initialHooks, activeCategory],
  );

  const trimmed = query.trim();
  const countLine = trimmed
    ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} for '${trimmed}'`
    : `${filtered.length} example${filtered.length === 1 ? '' : 's'}`;

  const activeCount = (trimmed ? 1 : 0) + (activeCategory !== 'all' ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Row 2 — standard paper filter strip composing <FilterBar> (client-
          state bar: query + single-select category pills as children). */}
      <div className="px-5 py-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <FilterBar
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search by keyword, city, or service…"
          searchAriaLabel="Search delivery history"
          searchStyle={{ flex: '1 1 220px', minWidth: '180px', maxWidth: '320px' }}
          activeCount={activeCount}
          onClearAll={() => {
            setQuery('');
            setActiveCategory('all');
          }}
          trailing={
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                whiteSpace: 'nowrap',
                marginLeft: 'auto',
                flexShrink: 0,
              }}
            >
              {countLine}
            </span>
          }
        >
          <CategoryPill
            label="All"
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          />
          {SERVICE_CATEGORIES.map((category) => (
            <CategoryPill
              key={category}
              label={SERVICE_CATEGORY_LABELS[category]}
              active={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </FilterBar>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          variant="inline"
          title="Nothing matches. Try a different keyword."
          style={{ padding: 'var(--space-10) var(--space-4)' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <AnimatePresence mode="popLayout">
            {filtered.map((c, i) => (
              <CaseListRow key={c.id} serviceCase={c} index={i} onClick={() => openCase(c)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {activeCategory !== 'all' && activeHooks.length > 0 && (
        <div
          style={{
            marginTop:  'var(--space-4)',
            paddingTop: 'var(--space-6)',
            borderTop:  '1px solid var(--theme-paper-border)',
          }}
        >
          <HookList
            hooks={activeHooks}
            label={`Talking points for ${getServiceCategoryLabel(activeCategory)}`}
          />
        </div>
      )}

      {detailMounted && activeCase && (
        <CaseDetailModal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          serviceCase={activeCase}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
