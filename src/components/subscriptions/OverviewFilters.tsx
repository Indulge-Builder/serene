"use client";

// Overview-view filter bar: Department dropdown + the shared Range/Dates panels.
// URL-driven via useUrlFilters (immediate-commit) — the RSC re-runs
// getSpendingOverview with the committed params. Shares the `department` param
// with the list view so a department focus survives switching views; dates use
// the house `date_from`/`date_to` params (the leads/deals convention).
// `leading` = the page's view switcher, sharing the strip (see SubscriptionFilters).

import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useUrlFilters, useMultiSelectUrlParam } from "@/hooks/useUrlFilters";
import { SUBSCRIPTION_DEPARTMENT_OPTIONS } from "@/lib/constants/subscription-constants";
import type { AppDomain } from "@/lib/types/database";

export function OverviewFilters({ leading }: { leading?: React.ReactNode }) {
  const url = useUrlFilters();
  const { params, push } = url;

  const [departments, setDepartments] = useMultiSelectUrlParam<AppDomain>(url, "department");

  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");

  const activeCount =
    (params.get("department") ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <FilterBar
      hideSearch
      leading={leading}
      searchValue=""
      onSearchChange={() => {}}
      activeCount={activeCount}
      showCountBadge={false}
      clearLabel="Clear"
      onClearAll={url.clearAll}
      dateRange={{
        panelKey: "subscriptions-overview-range",
        from: dateFrom,
        to: dateTo,
        onFromChange: (v) => push({ date_from: v }),
        onToChange: (v) => push({ date_to: v }),
        onClear: () => push({ date_from: null, date_to: null }),
        onPresetSelect: (from, to) => push({ date_from: from, date_to: to }),
      }}
    >
      <FilterDropdown
        menuPortal
        hideCountBadge
        label="Department"
        items={SUBSCRIPTION_DEPARTMENT_OPTIONS}
        selected={departments}
        multi
        onChange={(next) => setDepartments(next as AppDomain[])}
      />
    </FilterBar>
  );
}
