'use client';

import { X } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateFromUrlParam, dateToUrlParam } from '@/lib/utils/filter-params';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';

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
 * (leads, deals, campaigns, tasks) — the FilterBar "Dates" panel. Render
 * inside a <FloatingPanel> driven by usePortalAnchor. Never re-implement
 * this row inline.
 *
 * Below md the side-by-side row would overflow the viewport, so the fields
 * stack vertically at a fixed narrow width and the pickers stretch full-width
 * (responsive: useMediaQuery(MQ.mobile), D-1).
 */
export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
}: DateRangeFieldsProps) {
  const isMobile    = useMediaQuery(MQ.mobile);
  const rangeActive = !!(from || to);

  const fieldStyle: React.CSSProperties = {
    display:       'flex',
    flexDirection: 'column',
    gap:           'var(--space-1)',
  };
  const pickerStyle: React.CSSProperties | undefined = isMobile
    ? { width: '100%' }
    : undefined;

  return (
    <div
      style={{
        display:       'flex',
        gap:           'var(--space-3)',
        ...(isMobile
          ? {
              flexDirection: 'column' as const,
              alignItems:    'stretch' as const,
              // Narrow fixed width — combined with the usePortalAnchor left
              // clamp the panel always fits the smallest phone viewport.
              width:         'min(15rem, calc(100dvw - 4rem))',
            }
          : {
              alignItems: 'flex-end' as const,
              whiteSpace: 'nowrap' as const,
            }),
      }}
    >
      <div style={fieldStyle}>
        <span style={FIELD_LABEL_STYLE}>From</span>
        <DatePicker
          value={dateFromUrlParam(from)}
          onChange={(d) => onFromChange(dateToUrlParam(d))}
          placeholder="Start date…"
          maxDate={to ? (dateFromUrlParam(to) ?? undefined) : undefined}
          aria-label="From date"
          style={pickerStyle}
        />
      </div>

      {!isMobile && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>
          →
        </span>
      )}

      <div style={fieldStyle}>
        <span style={FIELD_LABEL_STYLE}>To</span>
        <DatePicker
          value={dateFromUrlParam(to)}
          onChange={(d) => onToChange(dateToUrlParam(d))}
          placeholder="End date…"
          minDate={from ? (dateFromUrlParam(from) ?? undefined) : undefined}
          aria-label="To date"
          style={pickerStyle}
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
            gap:            'var(--space-1)',
            height:         '2.25rem',
            border:         'none',
            background:     'transparent',
            color:          'var(--theme-text-tertiary)',
            cursor:         'pointer',
            padding:        isMobile ? '0 var(--space-2)' : 0,
            borderRadius:   'var(--radius-sm)',
            flexShrink:     0,
            ...(isMobile
              ? {
                  alignSelf:  'flex-end' as const,
                  fontSize:   'var(--text-xs)',
                  fontFamily: 'var(--font-sans)',
                }
              : { width: '2.25rem' }),
          }}
          title="Clear dates"
        >
          <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, display: 'block' }} />
          {isMobile && <span>Clear</span>}
        </button>
      )}
    </div>
  );
}
