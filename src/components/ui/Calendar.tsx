'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { SLOW_DURATION, EASE_SPRING, EASE_OUT_EXPO } from '@/lib/constants/motion';

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
  taskDots?: Record<string, TaskDotMeta>;
  className?: string;
  style?: React.CSSProperties;
}

function localDateKey(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTHS = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr',
  'May', 'Jun', 'Jul', 'Aug',
  'Sep', 'Oct', 'Nov', 'Dec',
];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isBetween(d: Date, start: Date, end: Date): boolean {
  return d > start && d < end;
}

// ─── Year / Month Picker ───────────────────────────────────────────────────────

interface PickerProps {
  year:     number;
  month:    number;
  onPick:   (year: number, month: number) => void;
  onClose:  () => void;
}

function YearMonthPicker({ year, month, onPick, onClose }: PickerProps) {
  const thisYear = new Date().getFullYear();
  // 12-year window: 4 before current year, 7 after
  const years = Array.from({ length: 12 }, (_, i) => thisYear - 4 + i);

  return (
    <motion.div
      key="picker"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
      style={{
        position:      'absolute',
        inset:         0,
        background:    'var(--theme-paper)',
        borderRadius:  'inherit',
        zIndex:        'var(--z-raised)' as React.CSSProperties['zIndex'],
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        'var(--space-4) var(--space-4) var(--space-3)',
        borderBottom:   '1px solid var(--theme-paper-border)',
      }}>
        <span style={{
          fontFamily:  'var(--font-serif)',
          fontSize:    'var(--text-base)',
          fontWeight:  'var(--weight-normal)',
          color:       'var(--theme-text-primary)',
          letterSpacing: 'var(--tracking-tight)',
        }}>
          Jump to
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close picker"
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          26,
            height:         26,
            border:         'none',
            background:     'var(--theme-paper-subtle)',
            borderRadius:   'var(--radius-sm)',
            color:          'var(--theme-text-tertiary)',
            cursor:         'pointer',
            transition:     'var(--transition-hover)',
          }}
        >
          <ChevronDown style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        {/* Year section */}
        <div>
          <p style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
            margin:        '0 0 var(--space-2)',
          }}>
            Year
          </p>
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap:                 'var(--space-1)',
          }}>
            {years.map((y) => {
              const active = y === year;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onPick(y, month)}
                  style={{
                    padding:      'var(--space-2) 0',
                    borderRadius: 'var(--radius-sm)',
                    border:       active ? '1px solid var(--theme-accent)' : '1px solid transparent',
                    background:   active ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
                    color:        active ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-xs)',
                    fontWeight:   active ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                    cursor:       'pointer',
                    textAlign:    'center',
                    transition:   'var(--transition-hover)',
                    letterSpacing: active ? 'var(--tracking-wide)' : '0',
                  }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--theme-paper-border)' }} />

        {/* Month section */}
        <div>
          <p style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
            margin:        '0 0 var(--space-2)',
          }}>
            Month
          </p>
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap:                 'var(--space-1)',
          }}>
            {MONTHS_SHORT.map((label, idx) => {
              const active = idx === month;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { onPick(year, idx); onClose(); }}
                  style={{
                    padding:      'var(--space-2) 0',
                    borderRadius: 'var(--radius-sm)',
                    border:       active ? '1px solid var(--theme-accent)' : '1px solid transparent',
                    background:   active ? 'var(--theme-accent)' : 'var(--theme-paper-subtle)',
                    color:        active ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-xs)',
                    fontWeight:   active ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                    cursor:       'pointer',
                    textAlign:    'center',
                    transition:   'var(--transition-hover)',
                    letterSpacing: 'var(--tracking-wide)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

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
  const [direction,  setDirection]  = React.useState<1 | -1>(1);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  function navigate(delta: 1 | -1) {
    setDirection(delta);
    setCurrent((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function handlePickerPick(y: number, m: number) {
    setCurrent(new Date(y, m, 1));
  }

  const year        = current.getFullYear();
  const month       = current.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
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
        position:     'relative',
        ...style,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   'var(--space-3)',
      }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Previous month"
          className="eia-touch"
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
            color:          'var(--theme-text-tertiary)',
            transition:     'var(--transition-hover)',
          }}
        >
          <ChevronLeft style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
        </button>

        {/* Month + Year — clickable */}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Pick month and year"
          aria-expanded={pickerOpen}
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           'var(--space-1)',
            border:        'none',
            background:    'transparent',
            padding:       'var(--space-1) var(--space-2)',
            borderRadius:  'var(--radius-sm)',
            cursor:        'pointer',
            transition:    'var(--transition-hover)',
          }}
        >
          <span style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-sm)',
            fontWeight:    'var(--weight-semibold)',
            color:         'var(--theme-text-primary)',
            letterSpacing: 'var(--tracking-tight)',
          }}>
            {MONTHS[month]}
          </span>
          <span style={{
            fontFamily:  'var(--font-mono)',
            fontSize:    'var(--text-xs)',
            color:       'var(--theme-text-tertiary)',
            fontWeight:  'var(--weight-normal)',
          }}>
            {year}
          </span>
          <motion.span
            animate={{ rotate: pickerOpen ? 180 : 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
            style={{ display: 'flex', alignItems: 'center', color: 'var(--theme-text-tertiary)', marginLeft: 1 }}
          >
            <ChevronDown style={{ width: 11, height: 11, strokeWidth: 2 }} />
          </motion.span>
        </button>

        <button
          type="button"
          onClick={() => navigate(1)}
          aria-label="Next month"
          className="eia-touch"
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
            color:          'var(--theme-text-tertiary)',
            transition:     'var(--transition-hover)',
          }}
        >
          <ChevronRight style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
        </button>
      </div>

      {/* ── Weekday labels ───────────────────────────────────────────── */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        marginBottom:        'var(--space-1)',
      }}>
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            style={{
              textAlign:     'center',
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-widest)',
              textTransform: 'uppercase' as const,
              color:         'var(--theme-text-tertiary)',
              padding:       '0 0 var(--space-1)',
              display:       'block',
            }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* ── Days grid ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${year}-${month}`}
          initial={{ opacity: 0, x: direction * 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -14 }}
          transition={{ duration: SLOW_DURATION, ease: EASE_SPRING }}
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap:                 '2px',
          }}
        >
          {cells.map((date, idx) => {
            if (!date) return <span key={`empty-${idx}`} />;

            const isToday      = isSameDay(date, today);
            const isSelected   = value ? isSameDay(date, value) : false;
            const isRangeStart = rangeStart ? isSameDay(date, rangeStart) : false;
            const isRangeEnd   = rangeEnd   ? isSameDay(date, rangeEnd)   : false;
            const isInRange    = rangeStart && rangeEnd ? isBetween(date, rangeStart, rangeEnd) : false;
            const isDisabled   = (minDate && date < minDate) || (maxDate && date > maxDate);
            const isAccented   = isSelected || isRangeStart || isRangeEnd;
            const taskMeta     = hasTaskDots ? taskDots![localDateKey(date)] : undefined;
            const hasTaskDot   = !!taskMeta && taskMeta.count > 0;

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
                  ...(hasTaskDots
                    ? { height: 40, aspectRatio: 'unset' as const }
                    : { aspectRatio: '1' as const }),
                  borderRadius:   isToday && !isAccented
                    ? 'var(--radius-sm)'
                    : 'var(--radius-sm)',
                  border:         isToday && !isAccented
                    ? '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)'
                    : 'none',
                  background:     isAccented
                    ? 'var(--theme-accent)'
                    : isInRange
                    ? 'var(--theme-accent-surface)'
                    : 'transparent',
                  color:          isAccented
                    ? 'var(--theme-accent-fg)'
                    : isInRange
                    ? 'var(--theme-accent)'
                    : isToday
                    ? 'var(--theme-accent)'
                    : 'var(--theme-text-primary)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   isToday || isAccented ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  cursor:       isDisabled ? 'not-allowed' : 'pointer',
                  opacity:      isDisabled ? 0.3 : 1,
                  transition:   'background var(--duration-fast) var(--ease-in-out)',
                }}
              >
                {date.getDate()}

                {/* Task dot — centring lives on Framer's `x` (a style.transform
                    string would be clobbered by the animated scale); entrance
                    from scale 0.5 + opacity, never scale(0). */}
                {hasTaskDot && (
                  <motion.span
                    key={`dot-${localDateKey(date)}`}
                    initial={{ x: '-50%', scale: 0.5, opacity: 0 }}
                    animate={{
                      x: '-50%',
                      scale: 1,
                      opacity: isAccented ? 0.7 : taskMeta!.count >= 3 ? 1 : 0.65,
                    }}
                    transition={{ duration: 0.15, ease: EASE_SPRING }}
                    aria-hidden="true"
                    style={{
                      position:     'absolute',
                      bottom:       5,
                      left:         '50%',
                      width:        3,
                      height:       3,
                      borderRadius: 'var(--radius-full)',
                      background:   taskMeta!.hasUrgent
                        ? 'var(--color-danger)'
                        : isAccented
                        ? 'var(--theme-accent-fg)'
                        : 'var(--theme-accent)',
                      zIndex:       1,
                    }}
                  />
                )}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* ── Year / Month picker overlay ───────────────────────────── */}
      <AnimatePresence>
        {pickerOpen && (
          <YearMonthPicker
            year={year}
            month={month}
            onPick={handlePickerPick}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
