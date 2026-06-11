'use client';

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { GIA_DOMAIN_FILTER_ITEMS } from '@/lib/constants/domains';
import { DEAL_TYPES, DEAL_TYPE_LABELS } from '@/lib/constants/deal-types';
import type { UserRole } from '@/lib/types/database';
import type { Profile } from '@/lib/types/database';

type DealsFiltersProps = {
  role:             UserRole;
  showDomainFilter: boolean;
  showAgentFilter:  boolean;
  agents:           Pick<Profile, 'id' | 'full_name'>[];
};

const DEAL_TYPE_ITEMS = DEAL_TYPES.map((t) => ({ id: t, label: DEAL_TYPE_LABELS[t] }));

// Immediate-commit model: every change pushes the URL via useUrlFilters.
export function DealsFilters({
  role: _role,
  showDomainFilter,
  showAgentFilter,
  agents,
}: DealsFiltersProps) {
  const url = useUrlFilters({ resetKeys: ['page'] });
  const { params, push } = url;

  const domainFilter   = showDomainFilter ? params.get('domain') : null;
  const dealTypeFilter = params.get('deal_type');
  const agentFilter    = showAgentFilter ? params.get('agent_id') : null;
  const dateFrom       = params.get('date_from');
  const dateTo         = params.get('date_to');

  const activeCount =
    (params.get('search') ? 1 : 0) +
    (domainFilter ? 1 : 0) +
    (dealTypeFilter ? 1 : 0) +
    (agentFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const agentItems = agents.map((a) => ({ id: a.id, label: a.full_name }));

  return (
    <FilterBar
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search deals…"
      searchAriaLabel="Search deals"
      searchStyle={{ flex: '1 1 220px', minWidth: '180px' }}
      activeCount={activeCount}
      onClearAll={url.clearAll}
      dateRange={{
        panelKey:     'deals-range-panel',
        from:         dateFrom,
        to:           dateTo,
        onFromChange: (v) => push({ date_from: v }),
        onToChange:   (v) => push({ date_to: v }),
        onClear:      () => push({ date_from: null, date_to: null }),
      }}
    >
      {/* Deal type — single select */}
      <FilterDropdown
        label="Type"
        items={DEAL_TYPE_ITEMS}
        selected={dealTypeFilter ? [dealTypeFilter] : []}
        onChange={(next) => push({ deal_type: next[0] ?? null })}
      />

      {/* Domain — admin/founder only */}
      {showDomainFilter && (
        <FilterDropdown
          label="Domain"
          items={GIA_DOMAIN_FILTER_ITEMS}
          selected={domainFilter ? [domainFilter] : []}
          onChange={(next) => push({ domain: next[0] ?? null, agent_id: null })}
        />
      )}

      {/* Agent — manager/admin/founder only */}
      {showAgentFilter && (
        <FilterDropdown
          label="Agent"
          items={agentItems}
          selected={agentFilter ? [agentFilter] : []}
          onChange={(next) => push({ agent_id: next[0] ?? null })}
        />
      )}
    </FilterBar>
  );
}
