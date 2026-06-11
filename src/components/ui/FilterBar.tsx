'use client';

import { X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { SearchBar } from '@/components/ui/SearchBar';
import { Button } from '@/components/ui/Button';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { DateRangeFields } from '@/components/ui/DateRangeFields';
import { usePortalAnchor } from '@/hooks/usePortalAnchor';

type FilterBarDateRange = {
  /** URL-param-formatted date strings (see lib/utils/filter-params). */
  from: string | null;
  to: string | null;
  onFromChange: (value: string | null) => void;
  onToChange: (value: string | null) => void;
  /** Clears both dates in one state update / URL push. */
  onClear: () => void;
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
   */
  layout?: 'wrap' | 'scroll';
  /** Count of committed/active filters — drives badge and Clear visibility. */
  activeCount: number;
  /** Numeric badge next to the sliders icon. Default true; leads hides it. */
  showCountBadge?: boolean;
  /** 1px vertical divider between search and the filter chips (leads). */
  dividerAfterSearch?: boolean;
  /** Renders the Range trigger + FloatingPanel + DateRangeFields when set. */
  dateRange?: FilterBarDateRange;
  /** Draft-commit model (leads): renders a primary Apply button after children + range. */
  apply?: { disabled: boolean; onClick: () => void; label?: string };
  onClearAll: () => void;
  clearLabel?: string;
  /** Container style extras (e.g. tasks: flex '1 1 0', minWidth 0). */
  style?: React.CSSProperties;
  /** Page-specific FilterDropdowns. Rendered between search and range. */
  children?: React.ReactNode;
  /** Right-edge slot (e.g. tasks result count). */
  trailing?: React.ReactNode;
};

/**
 * THE shared list-page filter bar shell (leads, deals, campaigns, tasks).
 * Owns the chrome every filter bar repeats: sliders icon (+ optional count
 * badge), SearchBar, optional divider, the date-range trigger + portal panel
 * (usePortalAnchor + FloatingPanel + DateRangeFields), optional Apply button,
 * and the Clear button. Fully controlled and display-only — commit semantics
 * (draft→Apply vs immediate, URL vs client state) belong to the consumer:
 * URL-driven pages pair it with useUrlFilters; client-state pages (tasks)
 * pass state straight through.
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
  activeCount,
  showCountBadge = true,
  dividerAfterSearch,
  dateRange,
  apply,
  onClearAll,
  clearLabel = 'Clear filters',
  style,
  children,
  trailing,
}: FilterBarProps) {
  const range = usePortalAnchor();

  const isScroll      = layout === 'scroll';
  const rangeVariant  = dateRange?.trigger ?? 'badge';
  const rangeActive   = !!(dateRange?.from || dateRange?.to);
  const rangeAccented = rangeVariant === 'chevron' ? rangeActive : range.open || rangeActive;

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

      <SearchBar
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        size={searchSize}
        aria-label={searchAriaLabel}
        suppressFocusAccent={suppressSearchFocusAccent}
        style={searchStyle}
      />

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

      {/* Date range — trigger only; panel portaled to document.body via FloatingPanel */}
      {dateRange && (
        <div style={{ flexShrink: 0 }}>
          <button
            ref={range.triggerRef}
            type="button"
            onClick={range.toggle}
            aria-haspopup="dialog"
            aria-expanded={range.open}
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          'var(--space-2)',
              height:       '2.25rem',
              padding:      'var(--space-1) var(--space-3)',
              background:   rangeActive ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
              border:       `1px solid ${rangeAccented ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize:     'var(--text-sm)',
              fontFamily:   'var(--font-sans)',
              fontWeight:   'var(--weight-medium)',
              color:        rangeActive ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
              cursor:       'pointer',
              whiteSpace:   'nowrap',
              outline:      'none',
              transition:
                rangeVariant === 'chevron'
                  ? 'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out)'
                  : 'var(--transition-hover)',
            }}
          >
            Range
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

      {apply && (
        <Button
          variant="primary"
          size="sm"
          suppressFocusRing
          disabled={apply.disabled}
          onClick={apply.onClick}
          style={{ flexShrink: 0 }}
        >
          {apply.label ?? 'Apply'}
        </Button>
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
