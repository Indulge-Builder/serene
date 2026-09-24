'use client';

import { SelectionButton } from '@/components/ui/SelectionButton';
import { Button } from '@/components/ui/Button';
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
          <SelectionButton
            appearance="option"
            selected={selected}
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--text-sm)',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                }}
          >
            <span>{option.label}</span>
            {selected && (
              <Check
                style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, flexShrink: 0 }}
                aria-hidden="true"
              />
            )}
          </SelectionButton>
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
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => onSelect(null, null)}
            style={{ alignSelf: 'flex-end' }}
          >
            Clear
          </Button>
        </>
      )}
    </div>
  );
}

export type { DateRangePresetListProps };
