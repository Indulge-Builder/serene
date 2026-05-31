'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { SearchBar } from '@/components/ui/SearchBar';
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
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        flex:       '1 1 0',
        minWidth:   0,
        flexWrap:   'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <SlidersHorizontal
          style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5 }}
        />
        {activeCount > 0 && (
          <span
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              minWidth:       '1.25rem',
              height:         '1.25rem',
              padding:        '0 0.25rem',
              borderRadius:   'var(--radius-full)',
              background:     'var(--theme-accent)',
              color:          'var(--theme-accent-fg)',
              fontSize:       '10px',
              fontWeight:     'var(--weight-medium)',
              lineHeight:     1,
            }}
          >
            {activeCount}
          </span>
        )}
      </div>

      <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
        <SearchBar
          value={searchValue}
          onChange={(search) => {
            if (isGia)       patchGia({ search });
            else if (isPersonal) patchPersonal({ search });
            else             patchGroup({ search });
          }}
          placeholder={isGia ? 'Search leads or tasks…' : isPersonal ? 'Search tasks…' : 'Search group tasks…'}
          size="sm"
        />
      </div>

      {isGia ? (
        <>
          <FilterDropdown
            label="Task Type"
            items={TASK_TYPE_FILTER_ITEMS}
            selected={giaFilters.taskTypes}
            multi
            onChange={(types) => patchGia({ taskTypes: types as TaskType[] })}
          />
          {/* Date from */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <label
              style={{
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              From
            </label>
            <input
              type="date"
              value={giaFilters.dateFrom}
              onChange={(e) => patchGia({ dateFrom: e.target.value })}
              style={{
                height:       '2.25rem',
                padding:      '0 var(--space-2)',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-md)',
                background:   'var(--theme-paper)',
                color:        giaFilters.dateFrom ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                fontSize:     'var(--text-xs)',
                fontFamily:   'var(--font-sans)',
                outline:      'none',
                cursor:       'pointer',
              }}
            />
          </div>
          {/* Date to */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <label
              style={{
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              To
            </label>
            <input
              type="date"
              value={giaFilters.dateTo}
              onChange={(e) => patchGia({ dateTo: e.target.value })}
              style={{
                height:       '2.25rem',
                padding:      '0 var(--space-2)',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-md)',
                background:   'var(--theme-paper)',
                color:        giaFilters.dateTo ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                fontSize:     'var(--text-xs)',
                fontFamily:   'var(--font-sans)',
                outline:      'none',
                cursor:       'pointer',
              }}
            />
          </div>
        </>
      ) : isPersonal ? (
        <>
          {personalTagItems.length > 0 && (
            <FilterDropdown
              label="Tags"
              items={personalTagItems.map((t) => ({ id: t, label: t }))}
              selected={personalFilters.tags}
              multi
              onChange={(tags) => patchPersonal({ tags })}
            />
          )}
          <FilterDropdown
            label="Status"
            items={TASK_STATUS_FILTER_ITEMS}
            selected={personalFilters.statuses}
            multi
            onChange={(statuses) => patchPersonal({ statuses: statuses as PersonalTaskFiltersState['statuses'] })}
          />
          <FilterDropdown
            label="Priority"
            items={TASK_PRIORITY_FILTER_ITEMS}
            selected={personalFilters.priorities}
            multi
            onChange={(priorities) => patchPersonal({ priorities: priorities as PersonalTaskFiltersState['priorities'] })}
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
          />
          <FilterDropdown
            label="Priority"
            items={TASK_PRIORITY_FILTER_ITEMS}
            selected={groupFilters.priorities}
            multi
            onChange={(priorities) => patchGroup({ priorities: priorities as GroupTaskFiltersState['priorities'] })}
          />
          {showGroupDomainFilter && groupDomainItems.length > 1 && (
            <FilterDropdown
              label="Domain"
              items={groupDomainItems}
              selected={groupFilters.domain !== 'all' ? [groupFilters.domain] : []}
              onChange={(next) => patchGroup({ domain: next[0] ?? 'all' })}
            />
          )}
          <FilterDropdown
            label="Progress"
            items={[...GROUP_PROGRESS_FILTER_ITEMS]}
            selected={groupFilters.progress !== 'all' ? [groupFilters.progress] : []}
            onChange={(next) =>
              patchGroup({ progress: (next[0] ?? 'all') as GroupTaskFiltersState['progress'] })
            }
          />
        </>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        'var(--space-1)',
            height:     '2.25rem',
            padding:    '0 var(--space-2)',
            border:     'none',
            background: 'transparent',
            color:      'var(--theme-text-tertiary)',
            fontSize:   'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            cursor:     'pointer',
            flexShrink: 0,
            transition: 'color var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-primary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)'; }}
        >
          <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
          <span>Clear filters</span>
        </button>
      )}

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
    </div>
  );
}
