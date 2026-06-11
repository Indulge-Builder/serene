'use client';

import { X } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateFromUrlParam, dateToUrlParam } from '@/lib/utils/filter-params';

type DateRangeFieldsProps = {
  /** URL-param-formatted date strings (see lib/utils/filter-params). */
  from: string | null;
  to: string | null;
  onFromChange: (value: string | null) => void;
  onToChange: (value: string | null) => void;
  /** Clears both dates in one state update / URL push. */
  onClear: () => void;
};

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize:      'var(--text-2xs)',
  fontWeight:    'var(--weight-semibold)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         'var(--theme-text-tertiary)',
};

/**
 * THE canonical From → To date-range panel body used by every filter bar
 * (leads, deals, campaigns, tasks). Render inside a <FloatingPanel> driven
 * by usePortalAnchor. Never re-implement this row inline.
 */
export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
}: DateRangeFieldsProps) {
  const rangeActive = !!(from || to);

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'flex-end',
        gap:        'var(--space-3)',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={FIELD_LABEL_STYLE}>From</span>
        <DatePicker
          value={dateFromUrlParam(from)}
          onChange={(d) => onFromChange(dateToUrlParam(d))}
          placeholder="Start date…"
          maxDate={to ? (dateFromUrlParam(to) ?? undefined) : undefined}
          aria-label="From date"
        />
      </div>

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>
        →
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={FIELD_LABEL_STYLE}>To</span>
        <DatePicker
          value={dateFromUrlParam(to)}
          onChange={(d) => onToChange(dateToUrlParam(d))}
          placeholder="End date…"
          minDate={from ? (dateFromUrlParam(from) ?? undefined) : undefined}
          aria-label="To date"
        />
      </div>

      {rangeActive && (
        <button
          type="button"
          onClick={onClear}
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
    </div>
  );
}
