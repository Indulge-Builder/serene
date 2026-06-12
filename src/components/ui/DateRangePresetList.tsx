'use client';

import { Check } from 'lucide-react';
import {
  DATE_RANGE_PRESET_OPTIONS,
  matchDateRangePreset,
  resolveDateRangePreset,
} from '@/lib/constants/date-range-presets';

type DateRangePresetListProps = {
  /** URL-param-formatted date strings (see lib/utils/filter-params). */
  from: string | null;
  to: string | null;
  /** Atomic from+to update — one state change / URL push. */
  onSelect: (from: string | null, to: string | null) => void;
};

/**
 * THE quick-range preset panel body (Today … Last 3 Months) rendered inside
 * the FilterBar "Range" FloatingPanel. Selecting a preset commits both dates
 * atomically via onSelect; clicking the active preset (or Clear) clears both.
 * The manual From → To panel body is DateRangeFields ("Dates").
 */
export function DateRangePresetList({ from, to, onSelect }: DateRangePresetListProps) {
  const active      = matchDateRangePreset(from, to);
  const rangeActive = !!(from || to);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '11.5rem' }}>
      {DATE_RANGE_PRESET_OPTIONS.map((option) => {
        const selected = option.id === active;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              if (selected) {
                onSelect(null, null);
                return;
              }
              const range = resolveDateRangePreset(option.id);
              onSelect(range.from, range.to);
            }}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            'var(--space-3)',
              width:          '100%',
              padding:        'var(--space-2) var(--space-3)',
              border:         'none',
              borderRadius:   'var(--radius-sm)',
              background:     selected ? 'var(--theme-accent-surface)' : 'transparent',
              color:          selected ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
              fontSize:       'var(--text-sm)',
              fontFamily:     'var(--font-sans)',
              fontWeight:     selected ? 'var(--weight-medium)' : 'var(--weight-normal)',
              textAlign:      'left',
              whiteSpace:     'nowrap',
              cursor:         'pointer',
              transition:     'var(--transition-hover)',
            }}
            onMouseEnter={(e) => {
              if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
            }}
            onMouseLeave={(e) => {
              if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <span>{option.label}</span>
            {selected && (
              <Check
                style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, flexShrink: 0 }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}

      {rangeActive && (
        <>
          <div
            style={{
              height:     1,
              background: 'var(--theme-paper-border)',
              margin:     'var(--space-1) 0',
            }}
          />
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            style={{
              alignSelf:  'flex-end',
              padding:    'var(--space-1) var(--space-3)',
              border:     'none',
              background: 'transparent',
              color:      'var(--theme-text-tertiary)',
              fontSize:   'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              cursor:     'pointer',
              transition: 'color var(--duration-fast) var(--ease-in-out)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)'; }}
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}

export type { DateRangePresetListProps };
