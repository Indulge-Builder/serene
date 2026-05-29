'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SLOW_DURATION,
  EASE_SPRING,
} from '@/lib/constants/motion';

export interface CalendarProps {
  value?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  style?: React.CSSProperties;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isBetween(d: Date, start: Date, end: Date): boolean {
  return d > start && d < end;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function Calendar({
  value,
  rangeStart,
  rangeEnd,
  onSelect,
  minDate,
  maxDate,
  className,
  style,
}: CalendarProps) {
  const today = new Date();
  const [current, setCurrent] = React.useState(() => {
    const base = value ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [direction, setDirection] = React.useState<1 | -1>(1);

  function navigate(delta: 1 | -1) {
    setDirection(delta);
    setCurrent((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = startOfMonth(current).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div
      className={className}
      style={{
        background:   'var(--theme-paper)',
        borderRadius: 'var(--radius-md)',
        padding:      'var(--space-4)',
        width:        260,
        userSelect:   'none',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   'var(--space-3)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Previous month"
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          28,
            height:         28,
            border:         'none',
            background:     'transparent',
            borderRadius:   'var(--radius-sm)',
            cursor:         'pointer',
            color:          'var(--theme-text-secondary)',
            transition:     'var(--transition-hover)',
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14, strokeWidth: 1.5 }} aria-hidden="true" />
        </button>

        <span
          style={{
            fontSize:   'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            color:      'var(--theme-text-primary)',
          }}
        >
          {MONTHS[month]} {year}
        </span>

        <button
          type="button"
          onClick={() => navigate(1)}
          aria-label="Next month"
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          28,
            height:         28,
            border:         'none',
            background:     'transparent',
            borderRadius:   'var(--radius-sm)',
            cursor:         'pointer',
            color:          'var(--theme-text-secondary)',
            transition:     'var(--transition-hover)',
          }}
        >
          <ChevronRight style={{ width: 14, height: 14, strokeWidth: 1.5 }} aria-hidden="true" />
        </button>
      </div>

      {/* Weekday labels */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          marginBottom:        'var(--space-1)',
        }}
      >
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            className="label-micro"
            style={{ textAlign: 'center', padding: '0 0 var(--space-1)' }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* Days grid */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${year}-${month}`}
          initial={{ opacity: 0, x: direction * 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -16 }}
          transition={{ duration: SLOW_DURATION, ease: EASE_SPRING }}
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap:                 '2px',
          }}
        >
          {cells.map((date, idx) => {
            if (!date) return <span key={`empty-${idx}`} />;

            const isToday = isSameDay(date, today);
            const isSelected = value ? isSameDay(date, value) : false;
            const isRangeStart = rangeStart ? isSameDay(date, rangeStart) : false;
            const isRangeEnd = rangeEnd ? isSameDay(date, rangeEnd) : false;
            const isInRange =
              rangeStart && rangeEnd ? isBetween(date, rangeStart, rangeEnd) : false;
            const isDisabled =
              (minDate && date < minDate) || (maxDate && date > maxDate);

            const isAccented = isSelected || isRangeStart || isRangeEnd;

            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => !isDisabled && onSelect(date)}
                disabled={!!isDisabled}
                aria-label={date.toDateString()}
                aria-pressed={isSelected}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  position:       'relative',
                  width:          '100%',
                  aspectRatio:    '1',
                  borderRadius:   'var(--radius-sm)',
                  border:         'none',
                  background:     isAccented
                    ? 'var(--theme-accent)'
                    : isInRange
                    ? 'var(--theme-accent-surface)'
                    : 'transparent',
                  color:          isAccented
                    ? 'var(--theme-accent-fg)'
                    : isInRange
                    ? 'var(--theme-accent)'
                    : 'var(--theme-text-primary)',
                  fontSize:       'var(--text-xs)',
                  fontFamily:     'var(--font-sans)',
                  cursor:         isDisabled ? 'not-allowed' : 'pointer',
                  opacity:        isDisabled ? 0.35 : 1,
                  transition:     'var(--transition-hover)',
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled && !isAccented) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-paper-subtle)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDisabled && !isAccented) {
                    (e.currentTarget as HTMLButtonElement).style.background = isInRange
                      ? 'var(--theme-accent-surface)'
                      : 'transparent';
                  }
                }}
              >
                {date.getDate()}
                {/* Today dot */}
                {isToday && !isAccented && (
                  <span
                    style={{
                      position:     'absolute',
                      bottom:       2,
                      left:         '50%',
                      transform:    'translateX(-50%)',
                      width:        4,
                      height:       4,
                      borderRadius: 'var(--radius-full)',
                      background:   'var(--theme-accent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
