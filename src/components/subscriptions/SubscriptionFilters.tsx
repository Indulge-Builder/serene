"use client";

// List-view filter bar: search + Department / Type / Status dropdowns + the
// Active / Archived tab. URL-driven via useUrlFilters (immediate-commit).
// `leading` = the page's List / Calendar / Overview switcher, which shares this
// strip (the /tasks and /performance single-strip layout, never its own row).

import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { TabSelector } from "@/components/ui/TabSelector";
import { useUrlFilters, useMultiSelectUrlParam } from "@/hooks/useUrlFilters";
import {
  SUBSCRIPTION_DEPARTMENT_OPTIONS,
  SUBSCRIPTION_TYPE_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS,
  type SubscriptionType,
  type SubscriptionStatus,
} from "@/lib/constants/subscription-constants";
import type { AppDomain } from "@/lib/types/database";

const TAB_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
];

export function SubscriptionFilters({ leading }: { leading?: React.ReactNode }) {
  const url = useUrlFilters();
  const { params, push } = url;

  const [departments, setDepartments] = useMultiSelectUrlParam<AppDomain>(url, "department");
  const [types, setTypes] = useMultiSelectUrlParam<SubscriptionType>(url, "type");
  const [statuses, setStatuses] = useMultiSelectUrlParam<SubscriptionStatus>(url, "status");

  const tab = params.get("tab") === "archived" ? "archived" : "active";

  const activeCount =
    (params.get("search") ? 1 : 0) +
    (params.get("department") ? 1 : 0) +
    (params.get("type") ? 1 : 0) +
    (params.get("status") ? 1 : 0);

  return (
    <FilterBar
      layout="scroll"
      leading={leading}
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search subscriptions…"
      activeCount={activeCount}
      showCountBadge={false}
      dividerAfterSearch
      clearLabel="Clear"
      onClearAll={url.clearAll}
      tabSlot={
        <TabSelector
          variant="accent"
          indicatorLayoutId="subscriptions-tab"
          tabs={TAB_OPTIONS}
          activeTab={tab}
          onChange={(id) => push({ tab: id === "archived" ? "archived" : null })}
        />
      }
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
      <FilterDropdown
        menuPortal
        hideCountBadge
        label="Type"
        items={SUBSCRIPTION_TYPE_OPTIONS}
        selected={types}
        multi
        onChange={(next) => setTypes(next as SubscriptionType[])}
      />
      <FilterDropdown
        menuPortal
        hideCountBadge
        label="Status"
        items={SUBSCRIPTION_STATUS_OPTIONS}
        selected={statuses}
        multi
        onChange={(next) => setStatuses(next as SubscriptionStatus[])}
      />
    </FilterBar>
  );
}
