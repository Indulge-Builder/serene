'use client';

import { useRef as useModalPanelRef } from 'react';
import { ModalScopeContext, useModalFocus } from '@/hooks/useModalFocus';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Command, defaultFilter } from 'cmdk';
import {
  Search,
  Sparkles,
  Plus,
  CheckSquare,
  NotebookPen,
  UserRound,
  Trophy,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import {
  PALETTE_DURATION,
  EASE_SPRING,
  EASE_IN_OUT,
  FAST_DURATION,
} from '@/lib/constants/motion';
import { useDebounce } from '@/hooks/useDebounce';
import { lockBodyScroll } from '@/lib/utils/scroll';
import { canAccessRoute, isNavVisible, isWorkbenchProfile } from '@/lib/utils/route-access';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { TASK_STATUS } from '@/lib/constants/task-constants';
import { formatCurrency } from '@/lib/utils/numbers';
import { paletteSearchAction, type PaletteSearchResult } from '@/lib/actions/search';
import type { UserRole, AppDomain, LeadStatus, TaskStatus } from '@/lib/types/database';

/**
 * CommandPalette — ⌘K (polish handoff §01; cmdk engine 2026-08-25).
 *
 * 640px neumorphic panel over a charcoal scrim with blur(3px) — the palette
 * is one of the SANCTIONED backdrop-blur surfaces. Rises 320ms spring-out.
 * Groups: Actions · live entity results (leads/deals/tasks via
 * paletteSearchAction, debounced) · Go to (pages the caller can access).
 *
 * The interior runs on cmdk (bare `<Command>` parts — NEVER Command.Dialog,
 * which pulls Radix Dialog; our portal/scrim/motion own the overlay):
 * combobox a11y, ↑↓/↵ navigation, hover selection, and ranked fuzzy
 * filtering with keyword aliases all come from cmdk. Static items (actions,
 * pages) are cmdk-filtered; server results bypass the filter (value prefixed
 * `result:` scores 1 — the action already ranked them). Selection styling
 * rides cmdk's data attributes via the `.serene-palette` block in
 * globals.css (accent color-mix wash — selection floats, never inset).
 *
 * Mounted once by CommandPaletteProvider (dashboard layout) — never mount a
 * second instance.
 */

export type PaletteProfile = { id: string; role: UserRole; domain: AppDomain };

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  profile: PaletteProfile;
}

type PaletteItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  href: string;
  /** extra fuzzy-match aliases (cmdk keywords) */
  keywords?: string[];
};

const ACTION_ITEMS: (PaletteItem & { requiresRoute: string })[] = [
  { key: 'act-elaya', icon: Sparkles,    label: 'Ask Elaya', hint: 'Action', href: '/elaya', requiresRoute: '/elaya', keywords: ['ai', 'chat'] },
  { key: 'act-lead',  icon: Plus,        label: 'New lead',  hint: 'Action', href: '/leads', requiresRoute: '/leads', keywords: ['add lead', 'create lead'] },
  { key: 'act-task',  icon: CheckSquare, label: 'New task',  hint: 'Action', href: '/tasks', requiresRoute: '/tasks', keywords: ['add task', 'create task'] },
  { key: 'act-note',  icon: NotebookPen, label: 'New note',  hint: 'Action', href: '/notes', requiresRoute: '/notes', keywords: ['add note', 'create note'] },
];

const GOTO_PAGES: { href: string; label: string; roles?: UserRole[]; keywords?: string[] }[] = [
  { href: '/dashboard',   label: 'Dashboard',   keywords: ['home'] },
  { href: '/leads',       label: 'Leads',       keywords: ['gia'] },
  { href: '/deals',       label: 'Deals' },
  { href: '/campaigns',   label: 'Campaigns',   keywords: ['ads'] },
  { href: '/tasks',       label: 'Tasks' },
  { href: '/performance', label: 'Performance', keywords: ['metrics', 'stats'] },
  { href: '/whatsapp',    label: 'WhatsApp',    keywords: ['messages', 'chat'] },
  { href: '/helpdesk',    label: 'Helpdesk',    keywords: ['cases', 'call intelligence'] },
  { href: '/escalations', label: 'Escalations', roles: ['manager', 'admin', 'founder'], keywords: ['sla', 'overdue'] },
  { href: '/budget',      label: 'Budget',      roles: ['admin', 'founder'], keywords: ['spend', 'ad accounts'] },
  { href: '/elaya',       label: 'Elaya',       keywords: ['ai', 'assistant'] },
  { href: '/notes',       label: 'Notes' },
  { href: '/settings',    label: 'Settings',    roles: ['admin', 'founder'], keywords: ['preferences', 'config'] },
  { href: '/profile',     label: 'Profile',     keywords: ['account', 'theme'] },
];

const EMPTY_RESULTS: PaletteSearchResult = { leads: [], deals: [], tasks: [] };

/** Server results were already ranked by paletteSearchAction — a `result:`
    value bypasses cmdk scoring; everything else gets cmdk's defaultFilter. */
function paletteFilter(value: string, search: string, keywords?: string[]): number {
  return value.startsWith('result:') ? 1 : defaultFilter(value, search, keywords);
}

// kbd chip recipe (handoff §01) — reused for esc + footer hints.
const kbdChipStyle: React.CSSProperties = {
  fontSize:     '10px',
  fontWeight:   'var(--weight-semibold)' as React.CSSProperties['fontWeight'],
  padding:      '3px 8px',
  borderRadius: '7px',
  background:   'var(--neu-well)',
  boxShadow:
    'inset 1px 1px 3px rgb(var(--neu-dark) / 0.3), inset -1px -1px 3px rgb(var(--neu-light) / 0.7)',
  color:        'var(--theme-text-secondary)',
  lineHeight:   1,
  whiteSpace:   'nowrap',
};

const hairline: React.CSSProperties = {
  height:     '1px',
  background: 'rgb(var(--neu-dark) / 0.18)',
  flexShrink: 0,
};

function PaletteRow({ item, onRun }: { item: PaletteItem; onRun: (item: PaletteItem) => void }) {
  const Icon = item.icon;
  const isResult = item.key.startsWith('lead-') || item.key.startsWith('deal-') || item.key.startsWith('task-');
  return (
    <Command.Item
      value={isResult ? `result:${item.key}` : item.label}
      keywords={item.keywords}
      onSelect={() => onRun(item)}
    >
      <span
        aria-hidden="true"
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '9px',
          background: 'var(--neu-canvas)',
          boxShadow:
            'inset 1px 1px 3px rgb(var(--neu-dark) / 0.25), inset -1px -1px 3px rgb(var(--neu-light) / 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--neu-accent-deep)',
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
      </span>
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--theme-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </span>
      <span
        style={{
          fontSize: '11px',
          color: 'var(--theme-text-tertiary)',
          flexShrink: 0,
        }}
      >
        {item.hint}
      </span>
    </Command.Item>
  );
}

export function CommandPalette({ open, onClose, profile }: CommandPaletteProps) {
  const modalPanelRef = useModalPanelRef<HTMLDivElement>(null);
  const modalScopeId = useModalFocus(open, modalPanelRef, onClose);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PaletteSearchResult>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounce(query, 250);

  useEffect(() => setMounted(true), []);

  // Reset + focus + scroll lock per open
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults(EMPTY_RESULTS);
    const unlock = lockBodyScroll();
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      unlock();
      clearTimeout(t);
    };
  }, [open]);

  // Debounced entity search — stale responses discarded by query echo.
  useEffect(() => {
    if (!open) return;
    const q = debounced.trim();
    if (q.length < 2) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    paletteSearchAction({ query: q })
      .then((res) => {
        if (cancelled) return;
        setResults(res.data ?? EMPTY_RESULTS);
        setSearching(false);
      })
      .catch(() => {
        if (cancelled) return;
        setResults(EMPTY_RESULTS);
        setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  // Role-gated static items — cmdk owns the query filtering now.
  const groups = useMemo(() => {
    const actions = ACTION_ITEMS.filter((a) => canAccessRoute(profile, a.requiresRoute));

    const leads: PaletteItem[] = results.leads.map((l) => ({
      key: `lead-${l.id}`,
      icon: UserRound,
      label: l.name,
      hint: LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status,
      href: `/leads/${l.slug ?? l.id}`,
    }));

    const deals: PaletteItem[] = results.deals.map((d) => ({
      key: `deal-${d.id}`,
      icon: Trophy,
      label: d.name,
      hint: formatCurrency(d.amount),
      href: d.leadSlug || d.leadId ? `/leads/${d.leadSlug ?? d.leadId}` : '/deals',
    }));

    const tasks: PaletteItem[] = results.tasks.map((t) => ({
      key: `task-${t.id}`,
      icon: CheckSquare,
      label: t.title,
      hint: TASK_STATUS[t.status as TaskStatus]?.label ?? t.status,
      href: '/tasks?tab=personal',
    }));

    // Same listing rule as the Sidebar: reachable AND on the founder's curated list;
    // a workbench-domain member (tech) passes the per-entry role hint like admin does.
    const goto: PaletteItem[] = GOTO_PAGES.filter(
      (p) =>
        (!p.roles || p.roles.includes(profile.role) || isWorkbenchProfile(profile)) &&
        isNavVisible(profile, p.href),
    ).map((p) => ({
      key: `goto-${p.href}`,
      icon: ArrowRight,
      label: p.label,
      hint: 'Page',
      href: p.href,
      keywords: p.keywords,
    }));

    return [
      { name: 'Actions', items: actions as PaletteItem[] },
      { name: 'Leads', items: leads },
      { name: 'Deals', items: deals },
      { name: 'Tasks', items: tasks },
      { name: 'Go to', items: goto },
    ].filter((g) => g.items.length > 0);
  }, [results, profile]);

  const runItem = useCallback(
    (item: PaletteItem) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router],
  );

  if (!mounted || typeof document === 'undefined') return null;

  return <ModalScopeContext.Provider value={modalScopeId}>{createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="serene-command-palette"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          {/* Scrim — charcoal wash + blur(3px); the palette is a SANCTIONED
              backdrop-blur surface (CLAUDE.md Never-Do list carve-out). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FAST_DURATION, ease: EASE_IN_OUT }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--neu-palette-scrim)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
          />

          {/* Panel — 640px, radius 28, floating shadow, 320ms spring rise */}
          <motion.div ref={modalPanelRef} tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99, transition: { duration: FAST_DURATION, ease: EASE_IN_OUT } }}
            transition={{ duration: PALETTE_DURATION, ease: EASE_SPRING }}
            style={{
              position: 'relative',
              marginTop: 'clamp(48px, 12dvh, 96px)',
              width: '640px',
              maxWidth: 'calc(100% - var(--space-6) * 2)',
              borderRadius: 'var(--neu-radius-panel)',
              // Mode-aware: surface + floating shadow in light; surface-high +
              // modal-class shadow in dark (design_handoff_dark_mode §palette).
              background: 'var(--neu-palette-bg)',
              border: '1px solid var(--neu-edge)',
              boxShadow: 'var(--neu-palette-shadow)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Command
              label="Command palette"
              filter={paletteFilter}
              loop
              className="serene-palette"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              {/* Input row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: '18px 22px',
                }}
              >
                <Search
                  style={{ width: 16, height: 16, strokeWidth: 1.5, color: 'var(--theme-text-tertiary)', flexShrink: 0 }}
                />
                <Command.Input
                  ref={inputRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search leads, actions, pages…"
                  aria-label="Search leads, actions, pages"
                  className="serene-input-bare"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '15px',
                    color: 'var(--theme-text-primary)',
                    caretColor: 'var(--theme-accent)',
                  }}
                />
                <span style={kbdChipStyle}>esc</span>
              </div>

              <div style={hairline} />

              {/* Results */}
              <Command.List>
                {groups.map((g) => (
                  <Command.Group key={g.name} heading={g.name}>
                    {g.items.map((item) => (
                      <PaletteRow key={item.key} item={item} onRun={runItem} />
                    ))}
                  </Command.Group>
                ))}

                <Command.Empty>
                  <div
                    style={{
                      padding: '22px 12px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--theme-text-tertiary)',
                    }}
                  >
                    {searching ? 'Looking…' : 'Nothing matches — Elaya can look wider.'}
                  </div>
                </Command.Empty>
              </Command.List>

              <div style={hairline} />

              {/* Footer hints */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  padding: '11px 20px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  color: 'var(--theme-text-tertiary)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={kbdChipStyle}>↑↓</span> navigate
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={kbdChipStyle}>↵</span> open
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ color: 'var(--neu-accent-deep)', fontWeight: 'var(--weight-medium)' as React.CSSProperties['fontWeight'] }}>
                  {searching ? 'Searching…' : ''}
                </span>
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )}</ModalScopeContext.Provider>;
}
