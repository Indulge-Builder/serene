'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, SlidersHorizontal, Search } from 'lucide-react';
import type { LeadFilterOptions } from '@/lib/services/leads-service';
import type { UserRole, LeadStatus, CallOutcome } from '@/lib/types/database';
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from '@/lib/constants/lead-sources';
import { formatDate } from '@/lib/utils/dates';

type LeadsFiltersProps = {
  role:           UserRole;
  options:        LeadFilterOptions;
  showAgentFilter: boolean;
};

// ─────────────────────────────────────────────
// Helpers — URL param I/O
// ─────────────────────────────────────────────

function parseMulti<T extends string>(params: URLSearchParams, key: string): T[] {
  const val = params.get(key);
  if (!val) return [];
  return val.split(',').filter(Boolean) as T[];
}

function buildParams(
  current: URLSearchParams,
  updates: Record<string, string | null>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === '') {
      next.delete(key);
    } else {
      next.set(key, val);
    }
  }
  // Reset to page 1 on any filter change
  next.delete('page');
  return next;
}

// ─────────────────────────────────────────────
// Multi-select dropdown (status, outcome)
// ─────────────────────────────────────────────

type MultiSelectDropdownProps<T extends string> = {
  label:    string;
  values:   T[];
  labels:   Record<T, string>;
  selected: T[];
  onChange: (next: T[]) => void;
};

function MultiSelectDropdown<T extends string>({
  label,
  values,
  labels,
  selected,
  onChange,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function toggle(val: T) {
    const next = selected.includes(val)
      ? selected.filter((s) => s !== val)
      : [...selected, val];
    onChange(next);
  }

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display:       'inline-flex',
          alignItems:    'center',
          gap:           'var(--space-2)',
          height:        '2.25rem',
          padding:       '0 var(--space-3)',
          border:        `1px solid ${open || hasSelection ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius:  'var(--radius-sm)',
          background:    hasSelection ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          color:         hasSelection ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          fontSize:      'var(--text-sm)',
          cursor:        'pointer',
          transition:    'var(--transition-hover)',
          whiteSpace:    'nowrap',
        }}
      >
        <span>{label}</span>
        {hasSelection && (
          <span
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              justifyContent: 'center',
              width:        '1.125rem',
              height:       '1.125rem',
              borderRadius: 'var(--radius-full)',
              background:   'var(--theme-accent)',
              color:        'var(--theme-accent-fg)',
              fontSize:     '10px',
              fontWeight:   'var(--weight-semibold)',
              lineHeight:   1,
            }}
          >
            {selected.length}
          </span>
        )}
        <ChevronDown
          style={{
            width:      '0.875rem',
            height:     '0.875rem',
            color:      'var(--theme-text-tertiary)',
            transform:  open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--duration-fast) var(--ease-in-out)',
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position:     'absolute',
            top:          'calc(100% + var(--space-1))',
            left:         0,
            zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
            minWidth:     '11rem',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow:    'var(--shadow-2)',
            padding:      'var(--space-1) 0',
            animation:    'ddEnter 150ms var(--ease-out-expo) forwards',
          }}
        >
          {values.map((val) => {
            const checked = selected.includes(val);
            return (
              <button
                key={val}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(val)}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  width:          '100%',
                  padding:        'var(--space-2) var(--space-3)',
                  background:     checked ? 'var(--theme-accent-surface)' : 'transparent',
                  color:          checked ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                  fontSize:       'var(--text-sm)',
                  border:         'none',
                  cursor:         'pointer',
                  textAlign:      'left',
                  transition:     'background var(--duration-fast) var(--ease-in-out)',
                }}
                onMouseEnter={(e) => {
                  if (!checked) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                }}
                onMouseLeave={(e) => {
                  if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span>{labels[val]}</span>
                {checked && (
                  <Check
                    style={{ width: '1rem', height: '1rem', color: 'var(--theme-accent)', strokeWidth: 2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Single select dropdown (source, campaign, agent)
// ─────────────────────────────────────────────

type SingleSelectDropdownProps = {
  label:    string;
  options:  { value: string; label: string }[];
  selected: string | null;
  onChange: (next: string | null) => void;
};

function SingleSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: SingleSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? null;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          height:       '2.25rem',
          padding:      '0 var(--space-3)',
          border:       `1px solid ${open || selected ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius: 'var(--radius-sm)',
          background:   selected ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          color:        selected ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          fontSize:     'var(--text-sm)',
          cursor:       'pointer',
          transition:   'var(--transition-hover)',
          whiteSpace:   'nowrap',
        }}
      >
        <span>{selectedLabel ?? label}</span>
        <ChevronDown
          style={{
            width:      '0.875rem',
            height:     '0.875rem',
            color:      'var(--theme-text-tertiary)',
            transform:  open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--duration-fast) var(--ease-in-out)',
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position:     'absolute',
            top:          'calc(100% + var(--space-1))',
            left:         0,
            zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
            minWidth:     '11rem',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow:    'var(--shadow-2)',
            padding:      'var(--space-1) 0',
            animation:    'ddEnter 150ms var(--ease-out-expo) forwards',
          }}
        >
          {/* Clear option */}
          <button
            type="button"
            role="option"
            aria-selected={selected === null}
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              display:    'flex',
              alignItems: 'center',
              width:      '100%',
              padding:    'var(--space-2) var(--space-3)',
              background: selected === null ? 'var(--theme-accent-surface)' : 'transparent',
              color:      'var(--theme-text-tertiary)',
              fontSize:   'var(--text-sm)',
              border:     'none',
              cursor:     'pointer',
              textAlign:  'left',
            }}
          >
            Any {label.toLowerCase()}
          </button>
          <div style={{ height: '1px', background: 'var(--theme-paper-border)', margin: 'var(--space-1) 0' }} />

          {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  width:          '100%',
                  padding:        'var(--space-2) var(--space-3)',
                  background:     isSelected ? 'var(--theme-accent-surface)' : 'transparent',
                  color:          isSelected ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                  fontSize:       'var(--text-sm)',
                  border:         'none',
                  cursor:         'pointer',
                  textAlign:      'left',
                  transition:     'background var(--duration-fast) var(--ease-in-out)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <Check
                    style={{ width: '1rem', height: '1rem', color: 'var(--theme-accent)', strokeWidth: 2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Date range inputs
// ─────────────────────────────────────────────

type DateRangeProps = {
  dateFrom: string | null;
  dateTo:   string | null;
  onChange: (from: string | null, to: string | null) => void;
};

function DateRangeFilter({ dateFrom, dateTo, onChange }: DateRangeProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
      <input
        type="date"
        aria-label="From date"
        value={dateFrom ?? ''}
        onChange={(e) => onChange(e.target.value || null, dateTo)}
        style={{
          height:       '2.25rem',
          padding:      '0 var(--space-3)',
          border:       `1px solid ${dateFrom ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius: 'var(--radius-sm)',
          background:   dateFrom ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          color:        dateFrom ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          fontSize:     'var(--text-sm)',
          cursor:       'pointer',
          outline:      'none',
          transition:   'var(--transition-hover)',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; if (!dateFrom) e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
      />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>→</span>
      <input
        type="date"
        aria-label="To date"
        value={dateTo ?? ''}
        onChange={(e) => onChange(dateFrom, e.target.value || null)}
        style={{
          height:       '2.25rem',
          padding:      '0 var(--space-3)',
          border:       `1px solid ${dateTo ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius: 'var(--radius-sm)',
          background:   dateTo ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          color:        dateTo ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          fontSize:     'var(--text-sm)',
          cursor:       'pointer',
          outline:      'none',
          transition:   'var(--transition-hover)',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; if (!dateTo) e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// LeadsFilters — top-level export
// ─────────────────────────────────────────────

export function LeadsFilters({ role, options, showAgentFilter }: LeadsFiltersProps) {
  const router     = useRouter();
  const pathname   = usePathname();
  const params     = useSearchParams();
  const [, startTransition] = useTransition();

  // Read current filter state from URL
  const statusFilter  = parseMulti<LeadStatus>(params, 'status');
  const outcomeFilter = parseMulti<CallOutcome>(params, 'outcome');
  const source        = params.get('source');
  const campaign      = params.get('campaign');
  const agentId       = params.get('agent_id');
  const dateFrom      = params.get('date_from');
  const dateTo        = params.get('date_to');
  const searchParam   = params.get('search') ?? '';

  // Local search input state — debounced 500ms before pushing to URL
  const [searchInput, setSearchInput] = useState(searchParam);

  // Sync local search state when URL param changes externally (e.g. clear all)
  useEffect(() => {
    setSearchInput(params.get('search') ?? '');
  }, [params]);

  // Debounce: push search to URL 500ms after last keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      const current = params.get('search') ?? '';
      if (trimmed === current) return;
      const next = buildParams(params, { search: trimmed || null });
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Count of active filters for badge (search counts as 1 when non-empty)
  const activeCount =
    (searchParam ? 1 : 0) +
    (statusFilter.length > 0 ? 1 : 0) +
    (outcomeFilter.length > 0 ? 1 : 0) +
    (source ? 1 : 0) +
    (campaign ? 1 : 0) +
    (agentId ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  function push(updates: Record<string, string | null>) {
    const next = buildParams(params, updates);
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

  const agentOptions    = options.agents.map((a) => ({ value: a.id, label: a.full_name }));
  const campaignOptions = options.campaigns.map((c) => ({ value: c, label: c }));
  const sourceOptions   = LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }));

  return (
    <>
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
                textTransform:  'uppercase',
                letterSpacing:  '0.12em',
                lineHeight:     1,
              }}
            >
              {activeCount}
            </span>
          )}
        </div>

        {/* Search — Section 5.10 spec: pl-9, Search icon, clear X, h-9, caret accent */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search
            style={{
              position:      'absolute',
              left:          'var(--space-3)',
              top:           '50%',
              transform:     'translateY(-50%)',
              width:         '1rem',
              height:        '1rem',
              color:         'var(--theme-text-tertiary)',
              strokeWidth:   1.5,
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search name, phone, email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width:        '100%',
              height:       '2.25rem',
              paddingLeft:  'calc(var(--space-3) + 1rem + var(--space-2))',
              paddingRight: searchInput ? 'calc(var(--space-3) + 1rem + var(--space-2))' : 'var(--space-3)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              background:   'var(--theme-paper-subtle)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              outline:      'none',
              caretColor:   'var(--theme-accent)',
              transition:   'var(--transition-hover)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-accent)';
              e.currentTarget.style.background  = 'var(--theme-paper)';
              e.currentTarget.style.boxShadow   = 'var(--shadow-focus)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
              e.currentTarget.style.background  = 'var(--theme-paper-subtle)';
              e.currentTarget.style.boxShadow   = 'none';
            }}
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchInput('');
                // Immediately clear search in URL and reset to page 1
                const next = buildParams(params, { search: null });
                startTransition(() => {
                  router.push(`${pathname}?${next.toString()}`);
                });
              }}
              style={{
                position:       'absolute',
                right:          'var(--space-3)',
                top:            '50%',
                transform:      'translateY(-50%)',
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                width:          '1rem',
                height:         '1rem',
                border:         'none',
                background:     'transparent',
                color:          'var(--theme-text-tertiary)',
                cursor:         'pointer',
                padding:        0,
                transition:     'color var(--duration-fast) var(--ease-in-out)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)'; }}
            >
              <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
            </button>
          )}
        </div>

        {/* Status — multi-select */}
        <MultiSelectDropdown<LeadStatus>
          label="Status"
          values={LEAD_STATUSES}
          labels={LEAD_STATUS_LABELS}
          selected={statusFilter}
          onChange={(next) => push({ status: next.length > 0 ? next.join(',') : null })}
        />

        {/* Lead outcome — multi-select */}
        <MultiSelectDropdown<CallOutcome>
          label="Outcome"
          values={CALL_OUTCOMES}
          labels={CALL_OUTCOME_LABELS}
          selected={outcomeFilter}
          onChange={(next) => push({ outcome: next.length > 0 ? next.join(',') : null })}
        />

        {/* Source — single select */}
        <SingleSelectDropdown
          label="Source"
          options={sourceOptions}
          selected={source}
          onChange={(val) => push({ source: val })}
        />

        {/* Campaign — single select, options from server */}
        {campaignOptions.length > 0 && (
          <SingleSelectDropdown
            label="Campaign"
            options={campaignOptions}
            selected={campaign}
            onChange={(val) => push({ campaign: val })}
          />
        )}

        {/* Agent — single select, only for non-agent roles; absent from DOM for agents */}
        {showAgentFilter && agentOptions.length > 0 && (
          <SingleSelectDropdown
            label="Agent"
            options={agentOptions}
            selected={agentId}
            onChange={(val) => push({ agent_id: val })}
          />
        )}

        {/* Date range */}
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => push({ date_from: from, date_to: to })}
        />

        {/* Clear all — resets page to 1 implicitly via router.push(pathname) */}
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

      {/* Dropdown entrance keyframe — injected once */}
      <style>{`
        @keyframes ddEnter {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// Export formatDate re-export so LeadsFilters has access without extra import
export { formatDate };
