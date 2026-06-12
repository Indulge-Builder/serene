'use client';

// Call Intelligence — the /helpdesk search surface. Owns query + category
// state and the ENTIRE filter pipeline. The full library arrives as
// initialData from the RSC page; filtering is synchronous JS on that array —
// zero server round-trips per keystroke, no debounce, no FTS (spec §6/§9).
// At >500 cases, swap the includes() filter for fuse.js — never a server query.

import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FilterBar } from '@/components/ui/FilterBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { CaseCard } from '@/components/intelligence/CaseCard';
import { CategoryPill } from '@/components/intelligence/CategoryPill';
import { HookList } from '@/components/intelligence/HookList';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  getServiceCategoryLabel,
  type ServiceCategory,
} from '@/lib/constants/interests';
import type { ServiceCase, ConversationHook } from '@/lib/services/intelligence-service';

type HelpdeskSearchProps = {
  initialCases:     ServiceCase[];
  initialHooks:     ConversationHook[];
  /** From ?category= (dossier card footer link) — initial filter only. */
  initialCategory?: string | null;
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
}: HelpdeskSearchProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>(
    parseCategory(initialCategory),
  );

  const filtered = useMemo(() => {
    return initialCases.filter((c) => {
      const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
      if (!query.trim()) return matchesCategory;

      const q = query.trim().toLowerCase();
      const matchesQuery =
        c.title.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        (c.city ?? '').toLowerCase().includes(q) ||
        (c.country ?? '').toLowerCase().includes(q) ||
        c.tags.some((t) => t.includes(q));

      return matchesCategory && matchesQuery;
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: 'var(--space-4)' }}>
          <AnimatePresence mode="popLayout">
            {filtered.map((c, i) => (
              <CaseCard key={c.id} serviceCase={c} index={i} showTags />
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
    </div>
  );
}
