'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SLOW_DURATION,
  EASE_SPRING,
} from '@/lib/constants/motion';

export interface TaskDotMeta {
  count: number;
  hasUrgent?: boolean;
}

export interface CalendarProps {
  value?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  /**
   * Optional per-day task indicators. Keys are local-date ISO strings (YYYY-MM-DD).
   * When provided, day cells expand to 44px height to accommodate a 4px dot below
   * the day number. When undefined (default), the calendar renders unchanged.
   */
  taskDots?: Record<string, TaskDotMeta>;
  className?: string;
  style?: React.CSSProperties;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  taskDots,
  className,
  style,
}: CalendarProps) {
  const hasTaskDots = taskDots !== undefined;
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

            const taskMeta = hasTaskDots ? taskDots![localDateKey(date)] : undefined;
            const hasTaskDot = !!taskMeta && taskMeta.count > 0;

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
                  // taskDots mode: fixed 44px height (drops aspect-ratio so dot has room).
                  // Default mode: aspect-ratio:1 squares — identical to legacy.
                  ...(hasTaskDots
                    ? { height: 44, aspectRatio: 'unset' as const }
                    : { aspectRatio: '1' as const }),
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
                {/* Today dot — hidden when a task dot occupies the same slot. */}
                {isToday && !isAccented && !hasTaskDot && (
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
                {/* Task dot — absolute, never affects layout. */}
                {hasTaskDot && (
                  <motion.span
                    key={`task-dot-${localDateKey(date)}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15, ease: EASE_SPRING }}
                    aria-hidden="true"
                    style={{
                      position:     'absolute',
                      // 3px below the day number — number sits centred in the 44px cell,
                      // so "below number" is roughly cell-center + ~half-line-height + 3.
                      bottom:       6,
                      left:         '50%',
                      transform:    'translateX(-50%)',
                      width:        4,
                      height:       4,
                      borderRadius: 'var(--radius-full)',
                      background:   taskMeta!.hasUrgent
                        ? 'var(--color-danger)'
                        : 'var(--theme-accent)',
                      opacity:      taskMeta!.hasUrgent
                        ? 1
                        : (taskMeta!.count >= 3 ? 1 : 0.7),
                      zIndex:       1,
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
