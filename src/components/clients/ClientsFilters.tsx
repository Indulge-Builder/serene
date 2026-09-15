'use client';

// ClientsFilters — the /clients filter strip. Composes <FilterBar> + useUrlFilters (the
// VendorsFilters shape): search, queendom, tier, status, health band, "not linked".
// Immediate-commit, URL-driven. Admin/founder see every queendom; a Sia member sees only
// their own in the dropdown (the list is RLS-scoped anyway).

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { CLIENT_TIERS, CLIENT_STATUSES } from '@/lib/constants/client-facets';
import type { QueendomSummary } from '@/lib/types/client';

const HEALTH_ITEMS = [
  { id: 'low', label: 'Needs care (under 50)' },
  { id: 'mid', label: 'Steady (50 to 74)' },
  { id: 'high', label: 'Happy (75 and up)' },
];
const UNLINKED_ITEMS = [
  { id: 'whatsapp', label: 'No WhatsApp group' },
  { id: 'freshdesk', label: 'No Freshdesk contact' },
  { id: 'zoho', label: 'No Zoho customer' },
  { id: 'app', label: 'No app account' },
];

export function ClientsFilters({ queendoms }: { queendoms: QueendomSummary[] }) {
  const url = useUrlFilters({ resetKeys: ['page'] });
  const { params, push } = url;
  const queendom = params.get('queendom');
  const tier = params.get('tier');
  const status = params.get('status');
  const health = params.get('health');
  const unlinked = params.get('unlinked');
  const activeCount = [params.get('search'), queendom, tier, status, health, unlinked].filter(Boolean).length;

  return (
    <FilterBar
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search name or phone"
      searchAriaLabel="Search clients"
      searchStyle={{ flex: '1 1 240px', minWidth: '180px' }}
      activeCount={activeCount}
      onClearAll={url.clearAll}
    >
      {queendoms.length > 1 && (
        <FilterDropdown
          label="Queendom"
          items={queendoms.map((q) => ({ id: q.id, label: q.name }))}
          selected={queendom ? [queendom] : []}
          onChange={(next) => push({ queendom: next[0] ?? null })}
          multi={false}
          menuPortal
        />
      )}
      <FilterDropdown label="Tier" items={CLIENT_TIERS.options} selected={tier ? [tier] : []} onChange={(n) => push({ tier: n[0] ?? null })} multi={false} menuPortal />
      <FilterDropdown label="Status" items={CLIENT_STATUSES.options} selected={status ? [status] : []} onChange={(n) => push({ status: n[0] ?? null })} multi={false} menuPortal />
      <FilterDropdown label="Health" items={HEALTH_ITEMS} selected={health ? [health] : []} onChange={(n) => push({ health: n[0] ?? null })} multi={false} menuPortal />
      <FilterDropdown label="Not linked" items={UNLINKED_ITEMS} selected={unlinked ? [unlinked] : []} onChange={(n) => push({ unlinked: n[0] ?? null })} multi={false} menuPortal />
    </FilterBar>
  );
}
