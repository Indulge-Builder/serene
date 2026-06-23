'use client';

import { X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { SearchBar } from '@/components/ui/SearchBar';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { DateRangeFields } from '@/components/ui/DateRangeFields';
import { DateRangePresetList } from '@/components/ui/DateRangePresetList';
import {
  DATE_RANGE_PRESET_LABELS,
  matchDateRangePreset,
} from '@/lib/constants/date-range-presets';
import { usePortalAnchor } from '@/hooks/usePortalAnchor';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';

type FilterBarDateRange = {
  /** URL-param-formatted date strings (see lib/utils/filter-params). */
  from: string | null;
  to: string | null;
  onFromChange: (value: string | null) => void;
  onToChange: (value: string | null) => void;
  /** Clears both dates in one state update / URL push. */
  onClear: () => void;
  /**
   * Atomic from+to commit for the "Range" preset trigger (Today … Last 3
   * Months — ui/DateRangePresetList). When provided, the Range trigger
   * renders before the manual "Dates" trigger. Must apply both values in
   * ONE state update / URL push.
   */
  onPresetSelect?: (from: string | null, to: string | null) => void;
  /** Stable AnimatePresence key — unique per page (e.g. 'deals-range-panel'). */
  panelKey: string;
  /**
   * Trigger chrome. 'badge' (default): count badge when dates set, accent
   * border when open OR active. 'chevron' (leads): rotating ChevronDown, no
   * badge, accent border only when dates are set — never just because the
   * panel is open.
   */
  trigger?: 'badge' | 'chevron';
};

type FilterBarProps = {
  /** Controlled search value. Debounce upstream (useUrlFilters) when URL-driven. */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchSize?: 'sm' | 'md';
  searchAriaLabel?: string;
  searchStyle?: React.CSSProperties;
  /** Paper border + no focus shadow on the search input (leads). */
  suppressSearchFocusAccent?: boolean;
  /**
   * Row behaviour. 'wrap' (default): wrapping row, gap --space-3.
   * 'scroll' (leads): single nowrap row, gap --space-2, horizontal scroll,
   * hidden scrollbar.
   * Below md, 'wrap' automatically collapses to the scroll behaviour — a
   * wrapping bar piles into a ragged stack on phones (responsive audit
   * 2026-06-12). Consequence: every FilterDropdown child must pass
   * `menuPortal`, or its menu clips against the scroll container's overflow.
   */
  layout?: 'wrap' | 'scroll';
  /** Omit the SearchBar entirely (e.g. performance agent self-view). */
  hideSearch?: boolean;
  /** Count of committed/active filters — drives badge and Clear visibility. */
  activeCount: number;
  /** Numeric badge next to the sliders icon. Default true; leads hides it. */
  showCountBadge?: boolean;
  /** 1px vertical divider between search and the filter chips (leads). */
  dividerAfterSearch?: boolean;
  /** Renders the Range trigger + FloatingPanel + DateRangeFields when set. */
  dateRange?: FilterBarDateRange;
  onClearAll: () => void;
  clearLabel?: string;
  /** Container style extras (e.g. tasks: flex '1 1 0', minWidth 0). */
  style?: React.CSSProperties;
  /** Page-specific FilterDropdowns. Rendered between search and range. */
  children?: React.ReactNode;
  /**
   * Left-edge slot rendered BEFORE the sliders icon — e.g. a page-level
   * TabSelector that shares the filter-bar strip (the /performance
   * Agents/Domains tabs). Omitted = the bar starts with the sliders icon.
   */
  leading?: React.ReactNode;
  /** Right-edge slot (e.g. tasks result count). */
  trailing?: React.ReactNode;
};

/** Shared chrome for the Range (presets) and Dates (From → To) triggers. */
function dateTriggerStyle(
  active: boolean,
  accented: boolean,
  chevronVariant: boolean,
): React.CSSProperties {
  return {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          'var(--space-2)',
    height:       '2.25rem',
    padding:      'var(--space-1) var(--space-3)',
    background:   active ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
    border:       `1px solid ${accented ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
    borderRadius: 'var(--radius-md)',
    fontSize:     'var(--text-sm)',
    fontFamily:   'var(--font-sans)',
    fontWeight:   'var(--weight-medium)',
    color:        active ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
    outline:      'none',
    transition:   chevronVariant
      ? 'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out)'
      : 'var(--transition-hover)',
  };
}

/**
 * THE shared list-page filter bar shell (leads, deals, campaigns, tasks).
 * Owns the chrome every filter bar repeats: sliders icon (+ optional count
 * badge), SearchBar, optional divider, the date-range triggers + portal
 * panels (usePortalAnchor + FloatingPanel; "Range" presets via
 * DateRangePresetList, "Dates" From → To via DateRangeFields), and the
 * Clear button. Fully controlled and display-only — every filter commits
 * the moment it changes (immediate-commit model; there is no Apply/draft
 * mode): URL-driven pages pair it with useUrlFilters; client-state pages
 * (tasks) pass state straight through.
 *
 * Page filter components supply only their FilterDropdowns as children.
 * Never fork a new filter-bar chrome — extend this one.
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchSize = 'md',
  searchAriaLabel,
  searchStyle,
  suppressSearchFocusAccent,
  layout = 'wrap',
  hideSearch,
  activeCount,
  showCountBadge = true,
  dividerAfterSearch,
  dateRange,
  onClearAll,
  clearLabel = 'Clear filters',
  style,
  leading,
  children,
  trailing,
}: FilterBarProps) {
  const range    = usePortalAnchor();
  const presets  = usePortalAnchor({ estimatedWidth: 200, estimatedHeight: 340 });
  const isMobile = useMediaQuery(MQ.mobile);

  // Below md every bar runs as a single scrolling row (see layout prop doc).
  const isScroll      = layout === 'scroll' || isMobile;
  const rangeVariant  = dateRange?.trigger ?? 'badge';
  const rangeActive   = !!(dateRange?.from || dateRange?.to);
  const rangeAccented = rangeVariant === 'chevron' ? rangeActive : range.open || rangeActive;

  // "Range" preset trigger state — active only when from/to exactly match a preset.
  const matchedPreset = dateRange?.onPresetSelect
    ? matchDateRangePreset(dateRange.from, dateRange.to)
    : null;
  const presetActive   = matchedPreset !== null;
  const presetAccented = rangeVariant === 'chevron' ? presetActive : presets.open || presetActive;

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        isScroll ? 'var(--space-2)' : 'var(--space-3)',
        ...(isScroll
          ? {
              flexWrap:                'nowrap' as const,
              overflowX:               'auto' as const,
              scrollbarWidth:          'none' as const,
              WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
            }
          : { flexWrap: 'wrap' as const }),
        ...style,
      }}
    >
      {leading}

      {/* Filter icon + optional active count badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <SlidersHorizontal
          style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5 }}
          aria-hidden="true"
        />
        {showCountBadge && activeCount > 0 && (
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

      {!hideSearch && (
        <SearchBar
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          size={searchSize}
          aria-label={searchAriaLabel}
          suppressFocusAccent={suppressSearchFocusAccent}
          style={isScroll ? { minWidth: '160px', ...searchStyle } : searchStyle}
        />
      )}

      {dividerAfterSearch && (
        <div
          style={{
            width:      1,
            height:     '1.25rem',
            flexShrink: 0,
            background: 'var(--theme-paper-border)',
          }}
        />
      )}

      {children}

      {/* Range — quick presets (Today … Last 3 Months); panel portaled via FloatingPanel */}
      {dateRange?.onPresetSelect && (
        <div style={{ flexShrink: 0 }}>
          <button
            ref={presets.triggerRef}
            type="button"
            onClick={presets.toggle}
            aria-haspopup="menu"
            aria-expanded={presets.open}
            style={dateTriggerStyle(presetActive, presetAccented, rangeVariant === 'chevron')}
          >
            {matchedPreset ? DATE_RANGE_PRESET_LABELS[matchedPreset] : 'Range'}
            <ChevronDown
              style={{
                width:       14,
                height:      14,
                strokeWidth: 1.5,
                transform:   presets.open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition:  'transform var(--duration-fast) var(--ease-in-out)',
              }}
              aria-hidden="true"
            />
          </button>

          <FloatingPanel
            {...presets.panelProps}
            panelKey={`${dateRange.panelKey}-presets`}
            style={{ padding: 'var(--space-2)' }}
          >
            <DateRangePresetList
              from={dateRange.from}
              to={dateRange.to}
              onSelect={(from, to) => {
                dateRange.onPresetSelect?.(from, to);
                presets.close();
              }}
            />
          </FloatingPanel>
        </div>
      )}

      {/* Dates — manual From → To; panel portaled to document.body via FloatingPanel */}
      {dateRange && (
        <div style={{ flexShrink: 0 }}>
          <button
            ref={range.triggerRef}
            type="button"
            onClick={range.toggle}
            aria-haspopup="dialog"
            aria-expanded={range.open}
            style={dateTriggerStyle(rangeActive, rangeAccented, rangeVariant === 'chevron')}
          >
            Dates
            {rangeVariant === 'chevron' ? (
              <ChevronDown
                style={{
                  width:       14,
                  height:      14,
                  strokeWidth: 1.5,
                  transform:   range.open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition:  'transform var(--duration-fast) var(--ease-in-out)',
                }}
                aria-hidden="true"
              />
            ) : (
              rangeActive && (
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
                  {(dateRange.from ? 1 : 0) + (dateRange.to ? 1 : 0)}
                </span>
              )
            )}
          </button>

          <FloatingPanel {...range.panelProps} panelKey={dateRange.panelKey}>
            <DateRangeFields
              from={dateRange.from}
              to={dateRange.to}
              onFromChange={dateRange.onFromChange}
              onToChange={dateRange.onToChange}
              onClear={dateRange.onClear}
            />
          </FloatingPanel>
        </div>
      )}

      {/* Clear all — visibility driven by activeCount (committed state) */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClearAll}
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
            transition: 'color var(--duration-fast) var(--ease-in-out)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-primary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)'; }}
        >
          <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
          <span>{clearLabel}</span>
        </button>
      )}

      {trailing}
    </div>
  );
}

export type { FilterBarProps, FilterBarDateRange };
