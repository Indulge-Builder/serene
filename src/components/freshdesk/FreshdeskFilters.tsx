'use client';

// FreshdeskFilters — the /freshdesk filter strip. Composes <FilterBar> + useUrlFilters
// (the DealsFilters shape): search, Status (multi), Queendom (group), Agent, Category,
// Priority, and the created-date range with presets. Immediate-commit, URL-driven.
// showGroup=false for a queendom-pinned viewer: the server pins the group, so no Queendom filter.

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useUrlFilters, useMultiSelectUrlParam } from '@/hooks/useUrlFilters';
import { FD_PRIORITY_LABELS } from '@/lib/constants/freshdesk';
import type { FdFilterVocab } from '@/lib/services/freshdesk-service';

export function FreshdeskFilters({ vocab, showGroup = true }: { vocab: FdFilterVocab; showGroup?: boolean }) {
  const url = useUrlFilters({ resetKeys: ['page'] });
  const { params, push } = url;
  const [statuses, setStatuses] = useMultiSelectUrlParam<string>(url, 'status');

  const group = showGroup ? params.get('group') : null;
  const agent = params.get('agent');
  const category = params.get('category');
  const priority = params.get('priority');
  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  const member = params.get('member');

  const activeCount =
    (member ? 1 : 0) +
    (params.get('search') ? 1 : 0) +
    (statuses.length ? 1 : 0) +
    (group ? 1 : 0) +
    (agent ? 1 : 0) +
    (category ? 1 : 0) +
    (priority ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <FilterBar
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search subject, member or #id"
      searchAriaLabel="Search Freshdesk tickets"
      searchStyle={{ flex: '1 1 240px', minWidth: '180px' }}
      activeCount={activeCount}
      onClearAll={url.clearAll}
      dateRange={{
        panelKey: 'freshdesk-range-panel',
        from: dateFrom,
        to: dateTo,
        onFromChange: (v) => push({ date_from: v }),
        onToChange: (v) => push({ date_to: v }),
        onClear: () => push({ date_from: null, date_to: null }),
        onPresetSelect: (from, to) => push({ date_from: from, date_to: to }),
      }}
    >
      <FilterDropdown
        label="Status"
        items={vocab.statuses.map((s) => ({ id: String(s.id), label: s.label }))}
        selected={statuses}
        onChange={setStatuses}
        multi
        menuPortal
      />
      {showGroup && (
        <FilterDropdown
          label="Queendom"
          items={vocab.groups.map((g) => ({ id: String(g.id), label: g.name }))}
          selected={group ? [group] : []}
          onChange={(next) => push({ group: next[0] ?? null })}
          multi={false}
          menuPortal
        />
      )}
      <FilterDropdown
        label="Agent"
        items={vocab.agents.map((a) => ({ id: String(a.id), label: a.name }))}
        selected={agent ? [agent] : []}
        onChange={(next) => push({ agent: next[0] ?? null })}
        multi={false}
        menuPortal
      />
      <FilterDropdown
        label="Category"
        items={vocab.categories.map((c) => ({ id: c, label: c }))}
        selected={category ? [category] : []}
        onChange={(next) => push({ category: next[0] ?? null })}
        multi={false}
        menuPortal
      />
      <FilterDropdown
        label="Priority"
        items={Object.entries(FD_PRIORITY_LABELS).map(([id, label]) => ({ id, label }))}
        selected={priority ? [priority] : []}
        onChange={(next) => push({ priority: next[0] ?? null })}
        multi={false}
        menuPortal
      />
    </FilterBar>
  );
}
