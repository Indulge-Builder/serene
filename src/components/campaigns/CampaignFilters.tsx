'use client';

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { GIA_DOMAIN_FILTER_ITEMS } from '@/lib/constants/domains';
import type { UserRole } from '@/lib/types/database';

type CampaignFiltersProps = {
  role:             UserRole;
  showDomainFilter: boolean;
};

// Immediate-commit model: every change pushes the URL via useUrlFilters.
export function CampaignFilters({ role: _role, showDomainFilter }: CampaignFiltersProps) {
  const url = useUrlFilters();
  const { params, push } = url;

  const domainFilter = showDomainFilter ? params.get('domain') : null;
  const dateFrom     = params.get('date_from');
  const dateTo       = params.get('date_to');

  const activeCount =
    (params.get('search') ? 1 : 0) +
    (domainFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <FilterBar
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search campaigns…"
      searchAriaLabel="Search campaigns"
      searchStyle={{ flex: '1 1 220px', minWidth: '180px' }}
      activeCount={activeCount}
      onClearAll={url.clearAll}
      dateRange={{
        panelKey:     'campaign-range-panel',
        from:         dateFrom,
        to:           dateTo,
        onFromChange: (v) => push({ date_from: v }),
        onToChange:   (v) => push({ date_to: v }),
        onClear:      () => push({ date_from: null, date_to: null }),
      }}
    >
      {/* Domain — single select, admin/founder only (GIA_DOMAINS) */}
      {showDomainFilter && (
        <FilterDropdown
          label="Domain"
          items={GIA_DOMAIN_FILTER_ITEMS}
          selected={domainFilter ? [domainFilter] : []}
          onChange={(next) => push({ domain: next[0] ?? null })}
        />
      )}
    </FilterBar>
  );
}
