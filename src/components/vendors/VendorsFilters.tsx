'use client';

// VendorsFilters — the /vendors filter strip.
//
// Composes <FilterBar> in its default configuration (the DealsFilters/LeadsFilters
// shape) + useUrlFilters for the URL plumbing. Two filters only, by design:
// search (name or alias, trigram-indexed) and category. Immediate-commit —
// there is no Apply button anywhere in this app.

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { getVendorCategoryLabel } from '@/lib/constants/vendors';

export function VendorsFilters({ categories }: { categories: string[] }) {
  const url = useUrlFilters({ resetKeys: ['page'] });
  const { params, push } = url;

  const category = params.get('category');

  const activeCount = (params.get('search') ? 1 : 0) + (category ? 1 : 0);

  const categoryItems = categories.map((c) => ({ id: c, label: getVendorCategoryLabel(c) }));

  return (
    <FilterBar
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search name or alias"
      searchStyle={{ flex: '1 1 220px', minWidth: '180px' }}
      activeCount={activeCount}
      onClearAll={url.clearAll}
    >
      <FilterDropdown
        label="Category"
        items={categoryItems}
        selected={category ? [category] : []}
        onChange={(next) => push({ category: next[0] ?? null })}
        multi={false}
        menuPortal
      />
    </FilterBar>
  );
}
