'use client';

// TicketsFilters — the /tickets filter strip: search, status (multi), queendom, assignee,
// category, and "mine". Composes <FilterBar> + useUrlFilters; immediate-commit.

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useUrlFilters, useMultiSelectUrlParam } from '@/hooks/useUrlFilters';
import { TICKET_STATUSES, TICKET_CATEGORIES } from '@/lib/constants/tickets';
import type { QueendomSummary } from '@/lib/types/member';
import type { StaffOption } from '@/lib/types/ticket';

export function TicketsFilters({ queendoms, staff, tags = [], labels }: { queendoms: QueendomSummary[]; staff: StaffOption[]; tags?: string[]; labels?: Record<string, string> }) {
  const url = useUrlFilters({ resetKeys: ['page'] });
  const { params, push } = url;
  const [statuses, setStatuses] = useMultiSelectUrlParam<string>(url, 'status');
  const queendom = params.get('queendom');
  const assignee = params.get('assignee');
  const category = params.get('category');
  const tag = params.get('tag');
  const mine = params.get('mine') === '1';
  const activeCount = [params.get('search'), statuses.length ? 'x' : null, queendom, assignee, category, tag, mine ? 'x' : null].filter(Boolean).length;

  return (
    <FilterBar
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search title or number"
      searchAriaLabel="Search tickets"
      searchStyle={{ flex: '1 1 220px', minWidth: '180px' }}
      activeCount={activeCount}
      onClearAll={url.clearAll}
      trailing={
        <button type="button" onClick={() => push({ mine: mine ? null : '1' })} className="serene-pressable"
          style={{ border: `1px solid ${mine ? 'var(--theme-accent-muted)' : 'var(--theme-paper-border)'}`, background: mine ? 'var(--theme-accent-surface)' : 'transparent', color: mine ? 'var(--neu-accent-deep)' : 'var(--theme-text-secondary)', borderRadius: 'var(--radius-full)', padding: '4px var(--space-3)', fontSize: 'var(--text-xs)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Mine
        </button>
      }
    >
      <FilterDropdown label="Status" items={TICKET_STATUSES.options.map((o) => ({ ...o, label: labels?.[o.id] ?? o.label }))} selected={statuses} onChange={setStatuses} multi menuPortal />
      {queendoms.length > 1 && (
        <FilterDropdown label="Queendom" items={queendoms.map((q) => ({ id: q.id, label: q.name }))} selected={queendom ? [queendom] : []} onChange={(n) => push({ queendom: n[0] ?? null })} multi={false} menuPortal />
      )}
      <FilterDropdown label="Genie" items={staff.map((s) => ({ id: s.id, label: s.full_name }))} selected={assignee ? [assignee] : []} onChange={(n) => push({ assignee: n[0] ?? null })} multi={false} menuPortal />
      <FilterDropdown label="Category" items={TICKET_CATEGORIES.options} selected={category ? [category] : []} onChange={(n) => push({ category: n[0] ?? null })} multi={false} menuPortal />
      {tags.length > 0 && (
        <FilterDropdown label="Tag" items={tags.map((t) => ({ id: t, label: t }))} selected={tag ? [tag] : []} onChange={(n) => push({ tag: n[0] ?? null })} multi={false} menuPortal />
      )}
    </FilterBar>
  );
}
