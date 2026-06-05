'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { SearchBar } from '@/components/ui/SearchBar';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateFromUrlParam, dateToUrlParam } from '@/lib/utils/filter-params';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';
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

  // ── Gia date range portal picker ─────────────────────────────────────────
  const [rangeOpen,    setRangeOpen]    = useState(false);
  const [mounted,      setMounted]      = useState(false);
  const rangeTriggerRef = useRef<HTMLButtonElement>(null);
  const rangePanelRef   = useRef<HTMLDivElement>(null);
  const [rangePanelPos, setRangePanelPos] = useState({ top: 0, left: 0, flipUp: false });

  useEffect(() => { setMounted(true); }, []);

  const updateRangePos = useCallback(() => {
    const rect = rangeTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelW  = 420;
    const panelH  = 100;
    const vvLeft  = window.visualViewport?.offsetLeft ?? 0;
    const vvTop   = window.visualViewport?.offsetTop  ?? 0;
    const flipLeft = rect.left + panelW > window.innerWidth - 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp  = spaceBelow < panelH && rect.top > spaceBelow;
    const left    = (flipLeft ? rect.right - panelW : rect.left) - vvLeft;
    const top     = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
    setRangePanelPos({ top, left, flipUp });
  }, []);

  useEffect(() => {
    if (!rangeOpen) return;
    updateRangePos();
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rangeTriggerRef.current?.contains(t)) return;
      if (rangePanelRef.current?.contains(t)) return;
      setRangeOpen(false);
    }
    function reposition() { updateRangePos(); }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [rangeOpen, updateRangePos]);

  useLayoutEffect(() => {
    if (!rangeOpen) return;
    const frame = requestAnimationFrame(() => {
      if (!rangePanelRef.current) return;
      const { width, height } = rangePanelRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const rect = rangeTriggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const vvLeft = window.visualViewport?.offsetLeft ?? 0;
        const vvTop  = window.visualViewport?.offsetTop  ?? 0;
        const flipLeft = rect.left + width > window.innerWidth - 8;
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < height && rect.top > spaceBelow;
        const left = (flipLeft ? rect.right - width : rect.left) - vvLeft;
        const top  = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
        setRangePanelPos({ top, left, flipUp });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [rangeOpen]);

  const rangeActive = !!(giaFilters.dateFrom || giaFilters.dateTo);

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
          {/* Date range — trigger + portal panel (matches LeadsFilters pattern) */}
          <div style={{ flexShrink: 0 }}>
            <button
              ref={rangeTriggerRef}
              type="button"
              onClick={() => setRangeOpen((o) => !o)}
              aria-haspopup="dialog"
              aria-expanded={rangeOpen}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          'var(--space-2)',
                height:       '2.25rem',
                padding:      'var(--space-1) var(--space-3)',
                background:   rangeActive ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
                border:       `1px solid ${(rangeOpen || rangeActive) ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
                borderRadius: 'var(--radius-md)',
                fontSize:     'var(--text-sm)',
                fontFamily:   'var(--font-sans)',
                fontWeight:   'var(--weight-medium)',
                color:        rangeActive ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                cursor:       'pointer',
                whiteSpace:   'nowrap',
                outline:      'none',
                transition:   'var(--transition-hover)',
              }}
            >
              Range
              {rangeActive && (
                <span
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    minWidth:       18,
                    height:         18,
                    padding:        '0 var(--space-1)',
                    borderRadius:   'var(--radius-full)',
                    background:     'var(--theme-accent)',
                    color:          'var(--theme-accent-fg)',
                    fontSize:       'var(--text-2xs)',
                    fontWeight:     'var(--weight-semibold)',
                  }}
                >
                  {(giaFilters.dateFrom ? 1 : 0) + (giaFilters.dateTo ? 1 : 0)}
                </span>
              )}
            </button>

            {mounted && createPortal(
              <AnimatePresence>
                {rangeOpen && (
                  <motion.div
                    ref={rangePanelRef}
                    key="gia-range-panel"
                    variants={DROPDOWN_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    style={{
                      position:     'fixed',
                      top:          rangePanelPos.top,
                      left:         rangePanelPos.left,
                      transform:    rangePanelPos.flipUp ? 'translateY(-100%)' : undefined,
                      zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
                      background:   'var(--theme-paper)',
                      border:       '1px solid var(--theme-paper-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow:    'var(--shadow-3)',
                      padding:      'var(--space-4)',
                      display:      'flex',
                      alignItems:   'flex-end',
                      gap:          'var(--space-3)',
                      whiteSpace:   'nowrap',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--theme-text-tertiary)' }}>
                        From
                      </span>
                      <DatePicker
                        value={dateFromUrlParam(giaFilters.dateFrom || null)}
                        onChange={(d) => patchGia({ dateFrom: dateToUrlParam(d) ?? '' })}
                        placeholder="Start date…"
                        maxDate={giaFilters.dateTo ? (dateFromUrlParam(giaFilters.dateTo) ?? undefined) : undefined}
                      />
                    </div>

                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>→</span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--theme-text-tertiary)' }}>
                        To
                      </span>
                      <DatePicker
                        value={dateFromUrlParam(giaFilters.dateTo || null)}
                        onChange={(d) => patchGia({ dateTo: dateToUrlParam(d) ?? '' })}
                        placeholder="End date…"
                        minDate={giaFilters.dateFrom ? (dateFromUrlParam(giaFilters.dateFrom) ?? undefined) : undefined}
                      />
                    </div>

                    {rangeActive && (
                      <button
                        type="button"
                        onClick={() => patchGia({ dateFrom: '', dateTo: '' })}
                        style={{
                          display:        'inline-flex',
                          alignItems:     'center',
                          justifyContent: 'center',
                          width:          '2.25rem',
                          height:         '2.25rem',
                          border:         'none',
                          background:     'transparent',
                          color:          'var(--theme-text-tertiary)',
                          cursor:         'pointer',
                          padding:        0,
                          borderRadius:   'var(--radius-sm)',
                          flexShrink:     0,
                        }}
                        title="Clear dates"
                      >
                        <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, display: 'block' }} />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body,
            )}
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
