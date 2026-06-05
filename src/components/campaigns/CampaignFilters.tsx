'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchBar } from '@/components/ui/SearchBar';
import { GIA_DOMAIN_FILTER_ITEMS } from '@/lib/constants/domains';
import {
  buildFilterParams,
  dateFromUrlParam,
  dateToUrlParam,
} from '@/lib/utils/filter-params';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';
import type { UserRole } from '@/lib/types/database';

type CampaignFiltersProps = {
  role:             UserRole;
  showDomainFilter: boolean;
};

export function CampaignFilters({ role: _role, showDomainFilter }: CampaignFiltersProps) {
  const router              = useRouter();
  const pathname            = usePathname();
  const params              = useSearchParams();
  const [, startTransition] = useTransition();

  const domainFilter = showDomainFilter ? params.get('domain') : null;
  const dateFrom     = params.get('date_from');
  const dateTo       = params.get('date_to');
  const searchParam  = params.get('search') ?? '';

  const [searchInput, setSearchInput] = useState(searchParam);

  // ── Date range portal picker ──────────────────────────────────────────────
  const [rangeOpen,     setRangeOpen]     = useState(false);
  const [mounted,       setMounted]       = useState(false);
  const rangeTriggerRef = useRef<HTMLButtonElement>(null);
  const rangePanelRef   = useRef<HTMLDivElement>(null);
  const [rangePanelPos, setRangePanelPos] = useState({ top: 0, left: 0, flipUp: false });

  useEffect(() => { setMounted(true); }, []);

  const updateRangePos = useCallback(() => {
    const rect = rangeTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelW     = 420;
    const panelH     = 100;
    const vvLeft     = window.visualViewport?.offsetLeft ?? 0;
    const vvTop      = window.visualViewport?.offsetTop  ?? 0;
    const flipLeft   = rect.left + panelW > window.innerWidth - 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp     = spaceBelow < panelH && rect.top > spaceBelow;
    const left       = (flipLeft ? rect.right - panelW : rect.left) - vvLeft;
    const top        = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
    setRangePanelPos({ top, left, flipUp });
  }, []);

  useEffect(() => {
    if (!rangeOpen) return;
    updateRangePos();
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rangeTriggerRef.current?.contains(t)) return;
      if (rangePanelRef.current?.contains(t)) return;
      setRangeOpen(false);
    }
    function reposition() { updateRangePos(); }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [rangeOpen, updateRangePos]);

  useLayoutEffect(() => {
    if (!rangeOpen) return;
    const frame = requestAnimationFrame(() => {
      if (!rangePanelRef.current) return;
      const { width, height } = rangePanelRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const rect = rangeTriggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const vvLeft     = window.visualViewport?.offsetLeft ?? 0;
        const vvTop      = window.visualViewport?.offsetTop  ?? 0;
        const flipLeft   = rect.left + width > window.innerWidth - 8;
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp     = spaceBelow < height && rect.top > spaceBelow;
        const left       = (flipLeft ? rect.right - width : rect.left) - vvLeft;
        const top        = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
        setRangePanelPos({ top, left, flipUp });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [rangeOpen]);

  const rangeActive = !!(dateFrom || dateTo);

  useEffect(() => {
    setSearchInput(params.get('search') ?? '');
  }, [params]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      const current = params.get('search') ?? '';
      if (trimmed === current) return;
      const next = buildFilterParams(params, { search: trimmed || null });
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeCount =
    (searchParam ? 1 : 0) +
    (domainFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  function push(updates: Record<string, string | null>) {
    const next = buildFilterParams(params, updates);
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function clearAll() {
    setSearchInput('');
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        flexWrap:   'wrap',
      }}
    >
      {/* Filter icon + active count badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <SlidersHorizontal
          style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5 }}
        />
        {activeCount > 0 && (
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

      {/* Search — debounced 500ms → URL `search` param */}
      <SearchBar
        value={searchInput}
        onChange={setSearchInput}
        placeholder="Search campaigns…"
        size="md"
        aria-label="Search campaigns"
        style={{ flex: '1 1 220px', minWidth: '180px' }}
      />

      {/* Domain — single select, admin/founder only (GIA_DOMAINS) */}
      {showDomainFilter && (
        <FilterDropdown
          label="Domain"
          items={GIA_DOMAIN_FILTER_ITEMS}
          selected={domainFilter ? [domainFilter] : []}
          onChange={(next) => push({ domain: next[0] ?? null })}
        />
      )}

      {/* Date range — trigger + portal panel */}
      <div style={{ flexShrink: 0 }}>
        <button
          ref={rangeTriggerRef}
          type="button"
          onClick={() => setRangeOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={rangeOpen}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            height:       '2.25rem',
            padding:      'var(--space-1) var(--space-3)',
            background:   rangeActive ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
            border:       `1px solid ${(rangeOpen || rangeActive) ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize:     'var(--text-sm)',
            fontFamily:   'var(--font-sans)',
            fontWeight:   'var(--weight-medium)',
            color:        rangeActive ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            outline:      'none',
            transition:   'var(--transition-hover)',
          }}
        >
          Range
          {rangeActive && (
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
              {(dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
            </span>
          )}
        </button>

        {mounted && createPortal(
          <AnimatePresence>
            {rangeOpen && (
              <motion.div
                ref={rangePanelRef}
                key="campaign-range-panel"
                variants={DROPDOWN_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  position:     'fixed',
                  top:          rangePanelPos.top,
                  left:         rangePanelPos.left,
                  transform:    rangePanelPos.flipUp ? 'translateY(-100%)' : undefined,
                  zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
                  background:   'var(--theme-paper)',
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow:    'var(--shadow-3)',
                  padding:      'var(--space-4)',
                  display:      'flex',
                  alignItems:   'flex-end',
                  gap:          'var(--space-3)',
                  whiteSpace:   'nowrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--theme-text-tertiary)' }}>
                    From
                  </span>
                  <DatePicker
                    value={dateFromUrlParam(dateFrom)}
                    onChange={(d) => push({ date_from: dateToUrlParam(d) })}
                    placeholder="Start date…"
                    maxDate={dateTo ? dateFromUrlParam(dateTo) ?? undefined : undefined}
                    aria-label="From date"
                  />
                </div>

                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>→</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--theme-text-tertiary)' }}>
                    To
                  </span>
                  <DatePicker
                    value={dateFromUrlParam(dateTo)}
                    onChange={(d) => push({ date_to: dateToUrlParam(d) })}
                    placeholder="End date…"
                    minDate={dateFrom ? dateFromUrlParam(dateFrom) ?? undefined : undefined}
                    aria-label="To date"
                  />
                </div>

                {rangeActive && (
                  <button
                    type="button"
                    onClick={() => push({ date_from: null, date_to: null })}
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
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
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
          <span>Clear filters</span>
        </button>
      )}
    </div>
  );
}
