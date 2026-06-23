'use client';

import { FilterBar } from '@/components/ui/FilterBar';
import { useUrlFilters } from '@/hooks/useUrlFilters';

type PerformanceFiltersProps = {
  /** Agent roster search — hidden on the agent self-view (no roster to search). */
  showSearch: boolean;
  /**
   * Left-edge slot rendered before the filter icon — the founder/admin
   * Agents/Domains TabSelector lives here so the tabs share the filter-bar
   * paper strip (the /tasks single-strip layout). Omitted = the bar starts
   * with the sliders icon as before (agent + manager).
   */
  leading?: React.ReactNode;
  /**
   * Right-edge slot (FilterBar `trailing`) — the Agents-tab "Deck view"
   * trigger mounts here when active. Null otherwise.
   */
  trailing?: React.ReactNode;
};

// ─── PerformanceFilters ───────────────────────────────────────────────────────
// THE shared /performance + /budget filter bar. Composes <FilterBar> with its
// built-in Range presets + custom Dates panels (the same date_from/date_to
// contract every list page uses — see LeadsFilters). The page derives the
// PerformancePeriod from these params via resolvePerformanceDateParams, so the
// service layer is untouched. Immediate-commit only; below md the bar
// auto-collapses to the horizontal-scroll layout (the mobile fix).

export function PerformanceFilters({ showSearch, leading, trailing }: PerformanceFiltersProps) {
  const url = useUrlFilters();
  const { params, push } = url;

  const dateFrom = params.get('date_from');
  const dateTo   = params.get('date_to');

  const activeCount =
    (params.get('search') ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <FilterBar
      layout="scroll"
      leading={leading}
      trailing={trailing}
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search agents…"
      searchAriaLabel="Search agents"
      searchSize="sm"
      searchStyle={{ flex: '1 1 220px', minWidth: '180px' }}
      hideSearch={!showSearch}
      dividerAfterSearch={showSearch}
      activeCount={activeCount}
      onClearAll={url.clearAll}
      dateRange={{
        trigger:        'badge',
        panelKey:       'performance-range-panel',
        from:           dateFrom,
        to:             dateTo,
        onFromChange:   (v) => push({ date_from: v }),
        onToChange:     (v) => push({ date_to: v }),
        onClear:        () => push({ date_from: null, date_to: null }),
        onPresetSelect: (from, to) => push({ date_from: from, date_to: to }),
      }}
    />
  );
}
