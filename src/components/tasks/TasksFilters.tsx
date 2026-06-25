'use client';

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import {
  TASK_STATUS_FILTER_ITEMS,
  MY_TASKS_STATUS_FILTER_ITEMS,
  TASK_PRIORITY_FILTER_ITEMS,
  GROUP_PROGRESS_FILTER_ITEMS,
  EMPTY_PERSONAL_TASK_FILTERS,
  EMPTY_GROUP_TASK_FILTERS,
  personalFiltersActiveCount,
  groupFiltersActiveCount,
  type PersonalTaskFiltersState,
  type GroupTaskFiltersState,
} from '@/lib/utils/task-client-filters';

type Tab = 'personal' | 'group';

type TasksFiltersProps = {
  activeTab:              Tab;
  personalFilters:        PersonalTaskFiltersState;
  onPersonalFiltersChange: (next: PersonalTaskFiltersState) => void;
  personalTagItems:       string[];
  groupFilters:           GroupTaskFiltersState;
  onGroupFiltersChange:   (next: GroupTaskFiltersState) => void;
  groupDomainItems:       { id: string; label: string }[];
  showGroupDomainFilter:  boolean;
};

// Client-state driven (props in, callbacks out — no URL params, no debounce:
// search filters in-memory lists per keystroke). The shared chrome comes from
// <FilterBar>; this file owns only the per-tab field configs.
export function TasksFilters({
  activeTab,
  personalFilters,
  onPersonalFiltersChange,
  personalTagItems,
  groupFilters,
  onGroupFiltersChange,
  groupDomainItems,
  showGroupDomainFilter,
}: TasksFiltersProps) {
  const isPersonal = activeTab === 'personal';

  const searchValue = isPersonal ? personalFilters.search : groupFilters.search;

  const activeCount = isPersonal
    ? personalFiltersActiveCount(personalFilters)
    : groupFiltersActiveCount(groupFilters);

  function clearAll() {
    if (isPersonal) onPersonalFiltersChange({ ...EMPTY_PERSONAL_TASK_FILTERS });
    else            onGroupFiltersChange({ ...EMPTY_GROUP_TASK_FILTERS });
  }

  function patchPersonal(patch: Partial<PersonalTaskFiltersState>) {
    onPersonalFiltersChange({ ...personalFilters, ...patch });
  }

  function patchGroup(patch: Partial<GroupTaskFiltersState>) {
    onGroupFiltersChange({ ...groupFilters, ...patch });
  }

  return (
    <FilterBar
      style={{ flex: '1 1 0', minWidth: 0 }}
      searchValue={searchValue}
      onSearchChange={(search) => {
        if (isPersonal) patchPersonal({ search });
        else            patchGroup({ search });
      }}
      searchPlaceholder={isPersonal ? 'Search tasks…' : 'Search group tasks…'}
      searchSize="sm"
      searchStyle={{ flex: '1 1 200px', minWidth: '160px' }}
      activeCount={activeCount}
      onClearAll={clearAll}
    >
      {isPersonal ? (
        <>
          {personalTagItems.length > 0 && (
            <FilterDropdown
              label="Tags"
              items={personalTagItems.map((t) => ({ id: t, label: t }))}
              selected={personalFilters.tags}
              multi
              onChange={(tags) => patchPersonal({ tags })}
              menuPortal
            />
          )}
          <FilterDropdown
            label="Status"
            items={MY_TASKS_STATUS_FILTER_ITEMS}
            selected={personalFilters.statuses}
            multi
            onChange={(statuses) => patchPersonal({ statuses: statuses as PersonalTaskFiltersState['statuses'] })}
            menuPortal
          />
          <FilterDropdown
            label="Priority"
            items={TASK_PRIORITY_FILTER_ITEMS}
            selected={personalFilters.priorities}
            multi
            onChange={(priorities) => patchPersonal({ priorities: priorities as PersonalTaskFiltersState['priorities'] })}
            menuPortal
          />
        </>
      ) : (
        <>
          <FilterDropdown
            label="Status"
            items={TASK_STATUS_FILTER_ITEMS}
            selected={groupFilters.statuses}
            multi
            onChange={(statuses) => patchGroup({ statuses: statuses as GroupTaskFiltersState['statuses'] })}
            menuPortal
          />
          <FilterDropdown
            label="Priority"
            items={TASK_PRIORITY_FILTER_ITEMS}
            selected={groupFilters.priorities}
            multi
            onChange={(priorities) => patchGroup({ priorities: priorities as GroupTaskFiltersState['priorities'] })}
            menuPortal
          />
          {showGroupDomainFilter && groupDomainItems.length > 1 && (
            <FilterDropdown
              label="Domain"
              items={groupDomainItems}
              selected={groupFilters.domain !== 'all' ? [groupFilters.domain] : []}
              onChange={(next) => patchGroup({ domain: next[0] ?? 'all' })}
              menuPortal
            />
          )}
          <FilterDropdown
            label="Progress"
            items={[...GROUP_PROGRESS_FILTER_ITEMS]}
            selected={groupFilters.progress !== 'all' ? [groupFilters.progress] : []}
            onChange={(next) =>
              patchGroup({ progress: (next[0] ?? 'all') as GroupTaskFiltersState['progress'] })
            }
            menuPortal
          />
        </>
      )}
    </FilterBar>
  );
}
