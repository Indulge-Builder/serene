'use client';

import { SelectionButton } from '@/components/ui/SelectionButton';
import { Button } from '@/components/ui/Button';
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { SLOW_DURATION, FAST_DURATION, EASE_SPRING, EASE_OUT_EXPO } from '@/lib/constants/motion';

export interface TaskDotMeta {
  count: number;
  hasUrgent?: boolean;
}

export interface CalendarProps {
  value?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onSelect: (date: Date) => void;
  /** Fired with the visible month (0-indexed) on mount and on every month change
   *  (prev/next arrows or the year/month picker). Lets a parent project data —
   *  e.g. recurring subscriptions — into whichever month the user navigates to. */
  onMonthChange?: (year: number, month: number) => void;
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
        <Button
          variant="ghost"
          iconOnly
          size="sm"
          type="button"
          onClick={onClose}
          aria-label="Close picker"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26 }}
        >
          <ChevronDown style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
        </Button>
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
                <SelectionButton
                  appearance="choice"
                  selected={active}
                  aria-pressed={active}
                  key={y}
                  type="button"
                  onClick={() => onPick(y, month)}
                  style={{
                          padding: 'var(--space-2) 0',
                          fontSize: 'var(--text-xs)',
                          textAlign: 'center',
                          letterSpacing: active ? 'var(--tracking-wide)' : '0',
                      }}
                >
                  {y}
                </SelectionButton>
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
                <SelectionButton
                  appearance="choice"
                  selected={active}
                  aria-pressed={active}
                  key={label}
                  type="button"
                  onClick={() => { onPick(year, idx); onClose(); }}
                  style={{
                          padding: 'var(--space-2) 0',
                          fontSize: 'var(--text-xs)',
                          textAlign: 'center',
                          letterSpacing: 'var(--tracking-wide)',
                      }}
                >
                  {label}
                </SelectionButton>
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
  onMonthChange,
  minDate,
  maxDate,
  taskDots,
  className,
  style,
}: CalendarProps) {
  const calendarRef = React.useRef<HTMLDivElement>(null);
  const pendingFocus = React.useRef<string | null>(null);
  const [focusedDay, setFocusedDay] = React.useState(() => localDateKey(value ?? new Date()));
  function restoreDayFocus() {
    if (!pendingFocus.current) return;
    const target = calendarRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${pendingFocus.current}"]`);
    if (target) { target.focus({ preventScroll: true }); pendingFocus.current = null; }
  }
  function handleDayKey(event: React.KeyboardEvent<HTMLButtonElement>, date: Date) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    const next = new Date(date);
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      const targetMonth = new Date(date.getFullYear(), date.getMonth() + (event.key === 'PageDown' ? 1 : -1), 1);
      next.setFullYear(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(date.getDate(), new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()));
    } else {
      const delta = event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : event.key === 'Home' ? -date.getDay() : event.key === 'End' ? 6 - date.getDay() : ((event.key === 'ArrowRight') !== rtl ? 1 : -1);
      next.setDate(next.getDate() + delta);
    }
    if ((minDate && next < minDate) || (maxDate && next > maxDate)) return;
    pendingFocus.current = localDateKey(next);
    setFocusedDay(pendingFocus.current);
    if (next.getMonth() !== current.getMonth() || next.getFullYear() !== current.getFullYear()) {
      setDirection(next > date ? 1 : -1);
      setCurrent(new Date(next.getFullYear(), next.getMonth(), 1));
      onMonthChange?.(next.getFullYear(), next.getMonth());
    } else restoreDayFocus();
  }
  const hasTaskDots = taskDots !== undefined;
  const today = new Date();

  const [current, setCurrent] = React.useState(() => {
    const base = value ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [direction,  setDirection]  = React.useState<1 | -1>(1);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // Sync the parent to the visible month once on mount (so it can project data
  // into the initial month), then on every navigation below. Guarded to fire the
  // mount sync a single time — the value never changes identity here.
  const didSyncMonth = React.useRef(false);
  React.useEffect(() => {
    if (didSyncMonth.current) return;
    didSyncMonth.current = true;
    onMonthChange?.(current.getFullYear(), current.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(delta: 1 | -1) {
    setDirection(delta);
    const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
    setCurrent(next);
    onMonthChange?.(next.getFullYear(), next.getMonth());
  }

  function handlePickerPick(y: number, m: number) {
    setCurrent(new Date(y, m, 1));
    onMonthChange?.(y, m);
  }

  const year        = current.getFullYear();
  const month       = current.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const tabDay = cells.find(date => date && localDateKey(date) === focusedDay) ?? cells.find(date => date && !(minDate && date < minDate) && !(maxDate && date > maxDate));

  return (
    <div
      ref={calendarRef}
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
        <Button
          variant="ghost"
          iconOnly
          size="sm"
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Previous month"
          className="serene-touch"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}
        >
          <ChevronLeft style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
        </Button>

        {/* Month + Year — clickable */}
        <Button
          variant="control"
          size="sm"
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Pick month and year"
          aria-expanded={pickerOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
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
        </Button>

        <Button
          variant="ghost"
          iconOnly
          size="sm"
          type="button"
          onClick={() => navigate(1)}
          aria-label="Next month"
          className="serene-touch"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}
        >
          <ChevronRight style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
        </Button>
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
          onAnimationComplete={restoreDayFocus}
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
                data-calendar-day={localDateKey(date)}
                tabIndex={tabDay && localDateKey(tabDay) === localDateKey(date) ? 0 : -1}
                onFocus={() => setFocusedDay(localDateKey(date))}
                onKeyDown={(event) => handleDayKey(event, date)}
                aria-current={isToday ? "date" : undefined}
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
                  // Selected day = raised accent knob; today (unselected) floats
                  // on an accent wash — never an inset, never a coloured border.
                  borderRadius:   isAccented || (isToday && !isAccented)
                    ? 'var(--radius-full)'
                    : 'var(--radius-sm)',
                  border:         'none',
                  background:     isAccented
                    ? 'var(--neu-accent-gradient)'
                    : isInRange
                    ? 'var(--theme-accent-surface)'
                    : isToday
                    ? 'color-mix(in srgb, var(--theme-accent) 12%, var(--neu-surface))'
                    : 'transparent',
                  boxShadow:      isAccented
                    ? 'var(--neu-shadow-knob)'
                    : isToday
                    ? 'var(--neu-shadow-chip)'
                    : 'none',
                  color:          isAccented
                    ? 'var(--theme-accent-fg)'
                    : isInRange
                    ? 'var(--neu-accent-deep)'
                    : isToday
                    ? 'var(--neu-accent-deep)'
                    : 'var(--theme-text-primary)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   isToday || isAccented ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  cursor:       isDisabled ? 'not-allowed' : 'pointer',
                  opacity:      isDisabled ? 0.3 : 1,
                  transition:   'background var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)',
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
                    transition={{ duration: FAST_DURATION, ease: EASE_SPRING }}
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
