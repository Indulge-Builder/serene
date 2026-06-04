'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DatePicker } from '@/components/ui/DatePicker';
import { buildFilterParams, dateToUrlParam, dateFromUrlParam } from '@/lib/utils/filter-params';
import { DATE_PRESET_LABELS, type DatePreset } from '@/lib/utils/date-range';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';

const PRESETS: { value: Exclude<DatePreset, 'custom'>; label: string }[] = [
  { value: 'today',      label: DATE_PRESET_LABELS.today      },
  { value: 'week',       label: DATE_PRESET_LABELS.week       },
  { value: 'month',      label: DATE_PRESET_LABELS.month      },
  { value: 'last_month', label: DATE_PRESET_LABELS.last_month },
];

interface DashboardDateFilterProps {
  /** Current active preset from URL. */
  activePreset: DatePreset;
  /** YYYY-MM-DD from URL (only set when preset=custom). */
  fromParam: string | null;
  /** YYYY-MM-DD to URL (only set when preset=custom). */
  toParam: string | null;
}

export function DashboardDateFilter({ activePreset, fromParam, toParam }: DashboardDateFilterProps) {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);

  // Custom range draft state — only used when the panel is open
  const [customFrom, setCustomFrom] = useState<Date | null>(() => dateFromUrlParam(fromParam));
  const [customTo,   setCustomTo]   = useState<Date | null>(() => dateFromUrlParam(toParam));

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        // DatePicker portals its calendar panel to document.body — ignore clicks inside it.
        if ((target as Element).closest?.('[data-datepicker-panel]')) return;
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function selectPreset(preset: Exclude<DatePreset, 'custom'>) {
    const next = buildFilterParams(searchParams, {
      dash_preset: preset,
      dash_from:   null,
      dash_to:     null,
    });
    router.push(`?${next.toString()}`);
    setOpen(false);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const from = dateToUrlParam(customFrom);
    const to   = dateToUrlParam(customTo);
    if (!from || !to) return;
    const next = buildFilterParams(searchParams, {
      dash_preset: 'custom',
      dash_from:   from,
      dash_to:     to,
    });
    router.push(`?${next.toString()}`);
    setOpen(false);
  }

  // Active label shown on the trigger button
  const activeLabel = activePreset === 'custom' && fromParam && toParam
    ? `${fromParam} → ${toParam}`
    : DATE_PRESET_LABELS[activePreset];

  const isActive = true; // filter is always "active" on dashboard — always a range selected

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          height:       '36px',
          padding:      '0 var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border:       `1px solid ${open || isActive ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          background:   open || isActive ? 'var(--theme-accent-surface)' : 'var(--theme-paper)',
          color:        open || isActive ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          fontSize:     'var(--text-xs)',
          fontWeight:   'var(--weight-medium)',
          cursor:       'pointer',
          whiteSpace:   'nowrap',
          transition:   'border-color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out)',
        }}
      >
        <Calendar size={14} strokeWidth={1.5} />
        {activeLabel}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <ChevronDown size={14} strokeWidth={1.5} />
        </motion.span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="dash-date-panel"
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{
              position:     'absolute',
              top:          'calc(100% + 6px)',
              right:        0,
              zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
              minWidth:     '220px',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow:    'var(--shadow-3)',
              overflow:     'hidden',
            }}
          >
            {/* Preset list */}
            <div style={{ padding: 'var(--space-1)' }}>
              {PRESETS.map((p) => {
                const isSelected = activePreset === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => selectPreset(p.value)}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      width:        '100%',
                      padding:      'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-sm)',
                      background:   isSelected ? 'var(--theme-accent-surface)' : 'transparent',
                      color:        isSelected ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                      fontSize:     'var(--text-xs)',
                      fontWeight:   isSelected ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                      cursor:       'pointer',
                      border:       'none',
                      textAlign:    'left',
                      transition:   'background var(--duration-fast) var(--ease-in-out)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-paper-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom range section */}
            <div
              style={{
                borderTop: '1px solid var(--theme-paper-border)',
                padding:   'var(--space-3)',
                display:   'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <p
                style={{
                  fontSize:   'var(--text-2xs)',
                  fontWeight: 'var(--weight-semibold)',
                  color:      'var(--theme-text-tertiary)',
                  margin:     0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Custom range
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <DatePicker
                  value={customFrom}
                  onChange={setCustomFrom}
                  placeholder="From"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>→</span>
                <DatePicker
                  value={customTo}
                  onChange={setCustomTo}
                  placeholder="To"
                  style={{ flex: 1, minWidth: 0 }}
                />
              </div>
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo || customFrom >= customTo}
                style={{
                  width:        '100%',
                  height:       '30px',
                  borderRadius: 'var(--radius-sm)',
                  background:   'var(--theme-accent)',
                  color:        'var(--theme-accent-fg)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   'var(--weight-semibold)',
                  cursor:       'pointer',
                  border:       'none',
                  opacity:      (!customFrom || !customTo || customFrom >= customTo) ? 0.4 : 1,
                  transition:   'opacity 150ms',
                }}
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
