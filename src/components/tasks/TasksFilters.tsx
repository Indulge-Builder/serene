'use client';

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import {
  TASK_STATUS_FILTER_ITEMS,
  TASK_PRIORITY_FILTER_ITEMS,
  TASK_TYPE_FILTER_ITEMS,
  GROUP_PROGRESS_FILTER_ITEMS,
  EMPTY_PERSONAL_TASK_FILTERS,
  EMPTY_GROUP_TASK_FILTERS,
  EMPTY_GIA_TASK_FILTERS,
  personalFiltersActiveCount,
  groupFiltersActiveCount,
  giaFiltersActiveCount,
  type PersonalTaskFiltersState,
  type GroupTaskFiltersState,
  type GiaTaskFiltersState,
} from '@/lib/utils/task-client-filters';
import type { TaskType } from '@/lib/types/database';

type Tab = 'personal' | 'group' | 'gia';

type TasksFiltersProps = {
  activeTab:              Tab;
  personalFilters:        PersonalTaskFiltersState;
  onPersonalFiltersChange: (next: PersonalTaskFiltersState) => void;
  personalTagItems:       string[];
  groupFilters:           GroupTaskFiltersState;
  onGroupFiltersChange:   (next: GroupTaskFiltersState) => void;
  groupDomainItems:       { id: string; label: string }[];
  showGroupDomainFilter:  boolean;
  giaFilters:             GiaTaskFiltersState;
  onGiaFiltersChange:     (next: GiaTaskFiltersState) => void;
  resultCount:            number;
  resultNoun:             string;
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
  giaFilters,
  onGiaFiltersChange,
  resultCount,
  resultNoun,
}: TasksFiltersProps) {
  const isPersonal = activeTab === 'personal';
  const isGia      = activeTab === 'gia';

  const searchValue = isGia ? giaFilters.search : isPersonal ? personalFilters.search : groupFilters.search;

  const activeCount = isGia
    ? giaFiltersActiveCount(giaFilters)
    : isPersonal
      ? personalFiltersActiveCount(personalFilters)
      : groupFiltersActiveCount(groupFilters);

  function clearAll() {
    if (isGia)       onGiaFiltersChange({ ...EMPTY_GIA_TASK_FILTERS });
    else if (isPersonal) onPersonalFiltersChange({ ...EMPTY_PERSONAL_TASK_FILTERS });
    else             onGroupFiltersChange({ ...EMPTY_GROUP_TASK_FILTERS });
  }

  function patchPersonal(patch: Partial<PersonalTaskFiltersState>) {
    onPersonalFiltersChange({ ...personalFilters, ...patch });
  }

  function patchGroup(patch: Partial<GroupTaskFiltersState>) {
    onGroupFiltersChange({ ...groupFilters, ...patch });
  }

  function patchGia(patch: Partial<GiaTaskFiltersState>) {
    onGiaFiltersChange({ ...giaFilters, ...patch });
  }

  return (
    <FilterBar
      style={{ flex: '1 1 0', minWidth: 0 }}
      searchValue={searchValue}
      onSearchChange={(search) => {
        if (isGia)       patchGia({ search });
        else if (isPersonal) patchPersonal({ search });
        else             patchGroup({ search });
      }}
      searchPlaceholder={isGia ? 'Search leads or tasks…' : isPersonal ? 'Search tasks…' : 'Search group tasks…'}
      searchSize="sm"
      searchStyle={{ flex: '1 1 200px', minWidth: '160px' }}
      activeCount={activeCount}
      onClearAll={clearAll}
      dateRange={
        isGia
          ? {
              panelKey:     'gia-range-panel',
              from:         giaFilters.dateFrom || null,
              to:           giaFilters.dateTo || null,
              onFromChange: (v) => patchGia({ dateFrom: v ?? '' }),
              onToChange:   (v) => patchGia({ dateTo: v ?? '' }),
              onClear:      () => patchGia({ dateFrom: '', dateTo: '' }),
              onPresetSelect: (from, to) => patchGia({ dateFrom: from ?? '', dateTo: to ?? '' }),
            }
          : undefined
      }
      trailing={
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
            whiteSpace: 'nowrap',
            marginLeft: 'auto',
          }}
        >
          {resultCount} {resultNoun}
        </span>
      }
    >
      {isGia ? (
        <FilterDropdown
          label="Task Type"
          items={TASK_TYPE_FILTER_ITEMS}
          selected={giaFilters.taskTypes}
          multi
          onChange={(types) => patchGia({ taskTypes: types as TaskType[] })}
          menuPortal
        />
      ) : isPersonal ? (
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
            items={TASK_STATUS_FILTER_ITEMS}
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
