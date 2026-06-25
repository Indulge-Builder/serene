'use client';

import { FilterBar } from '@/components/ui/FilterBar';
import { useUrlFilters } from '@/hooks/useUrlFilters';

type PerformanceFiltersProps = {
  /** Agent roster search — hidden on the agent self-view (no roster to search). */
  showSearch: boolean;
  /**
   * Search box copy. Defaults to the agent-roster wording; /budget overrides it
   * to "Search campaigns…" since the same bar filters a different list there.
   */
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  /**
   * Far-RIGHT slot (FilterBar `tabSlot`) — the founder/admin Agents/Domains
   * TabSelector (and /budget Accounts/Campaigns) lives here so the tabs share
   * the filter-bar paper strip but read as its rightmost control: the bar runs
   * filter icon → search → dropdowns → range/dates → … → tabs. Omitted = the
   * bar has no trailing tab cluster (agent + manager).
   */
  tabSlot?: React.ReactNode;
  /**
   * Right-edge slot (FilterBar `trailing`) — the Agents-tab "Deck view"
   * trigger mounts here when active. Sits just before the tab cluster. Null
   * otherwise.
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

export function PerformanceFilters({
  showSearch,
  searchPlaceholder = 'Search agents…',
  searchAriaLabel = 'Search agents',
  tabSlot,
  trailing,
}: PerformanceFiltersProps) {
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
      tabSlot={tabSlot}
      trailing={trailing}
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder={searchPlaceholder}
      searchAriaLabel={searchAriaLabel}
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
