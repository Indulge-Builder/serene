"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { useDebounce } from "@/hooks/useDebounce";
import { motion, AnimatePresence } from "framer-motion";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Button } from "@/components/ui/Button";
import type { LeadFilterOptions } from "@/lib/services/leads-service";
import type { UserRole, LeadStatus, CallOutcome } from "@/lib/types/database";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
} from "@/lib/constants/lead-statuses";
import {
  CALL_OUTCOMES,
  CALL_OUTCOME_LABELS,
} from "@/lib/constants/call-outcomes";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from "@/lib/constants/lead-sources";
import { GIA_DOMAIN_FILTER_ITEMS } from "@/lib/constants/domains";
import {
  buildFilterParams,
  dateFromUrlParam,
  dateToUrlParam,
} from "@/lib/utils/filter-params";
import { EASE_OUT_EXPO, DROPDOWN_VARIANTS } from "@/lib/constants/motion";

type LeadsFiltersProps = {
  role: UserRole;
  options: LeadFilterOptions;
  showAgentFilter: boolean;
  showDomainFilter: boolean;
};

// ─── FilterDraft ──────────────────────────────────────────────────────────────

type FilterDraft = {
  status: LeadStatus[];
  outcome: CallOutcome[];
  domain: string | null;
  agent_id: string | null;
  source: string | null;
  campaign: string | null;
  date_from: string | null;
  date_to: string | null;
};

function parseMulti<T extends string>(
  params: URLSearchParams,
  key: string,
): T[] {
  const val = params.get(key);
  if (!val) return [];
  return val.split(",").filter(Boolean) as T[];
}

function draftFromParams(params: URLSearchParams): FilterDraft {
  return {
    status: parseMulti<LeadStatus>(params, "status"),
    outcome: parseMulti<CallOutcome>(params, "outcome"),
    domain: params.get("domain"),
    agent_id: params.get("agent_id"),
    source: params.get("source"),
    campaign: params.get("campaign"),
    date_from: params.get("date_from"),
    date_to: params.get("date_to"),
  };
}

function buildParams(
  current: URLSearchParams,
  updates: Record<string, string | null>,
): URLSearchParams {
  return buildFilterParams(current, updates, { resetKeys: ["page"] });
}

// ─── LeadsFilters ─────────────────────────────────────────────────────────────

export function LeadsFilters({
  options,
  showAgentFilter,
  showDomainFilter,
}: LeadsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [draft, setDraft] = useState<FilterDraft>(() => draftFromParams(params));
  const [searchInput, setSearchInput] = useState(() => params.get("search") ?? "");
  const debouncedSearch = useDebounce(searchInput, 350);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rangeRef = useRef<HTMLDivElement>(null);
  const rangeTriggerRef = useRef<HTMLButtonElement>(null);
  const rangePanelRef = useRef<HTMLDivElement>(null);
  const [rangePanelPos, setRangePanelPos] = useState({ top: 0, left: 0, flipUp: false });

  // Sync draft and search input when URL changes (browser back/forward).
  useEffect(() => {
    setDraft(draftFromParams(params));
    setSearchInput(params.get("search") ?? "");
    // deps: params only — intentional. Do not add draft to deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => { setMounted(true); }, []);

  // ── Range panel portal positioning (mirrors DatePicker pattern) ──
  const updateRangePos = useCallback(() => {
    const rect = rangeTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelW = 420;
    const panelH = 100;
    const vvLeft = window.visualViewport?.offsetLeft ?? 0;
    const vvTop  = window.visualViewport?.offsetTop  ?? 0;
    const flipLeft = rect.left + panelW > window.innerWidth - 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < panelH && rect.top > spaceBelow;
    const left = (flipLeft ? rect.right - panelW : rect.left) - vvLeft;
    const top  = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
    setRangePanelPos({ top, left, flipUp });
  }, []);

  useEffect(() => {
    if (!rangeOpen) return;
    updateRangePos();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (rangeTriggerRef.current?.contains(target)) return;
      if (rangePanelRef.current?.contains(target)) return;
      setRangeOpen(false);
    }
    function reposition() { updateRangePos(); }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
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
        const vvLeft = window.visualViewport?.offsetLeft ?? 0;
        const vvTop  = window.visualViewport?.offsetTop  ?? 0;
        const flipLeft = rect.left + width > window.innerWidth - 8;
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < height && rect.top > spaceBelow;
        const left = (flipLeft ? rect.right - width : rect.left) - vvLeft;
        const top  = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
        setRangePanelPos({ top, left, flipUp });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [rangeOpen]);

  // Push debounced search to URL (skips on mount and no-op after clearAll).
  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    if (trimmed === (params.get("search") ?? "")) return;
    const next = buildParams(params, { search: trimmed || null });
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
    // deps: debouncedSearch only — params/router/pathname are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ── isDirty: compare draft against live URL (computed, no useState) ──
  const isDirty =
    draft.status.join(",") !== (params.get("status") ?? "") ||
    draft.outcome.join(",") !== (params.get("outcome") ?? "") ||
    (draft.domain ?? "") !== (params.get("domain") ?? "") ||
    (draft.agent_id ?? "") !== (params.get("agent_id") ?? "") ||
    (draft.source ?? "") !== (params.get("source") ?? "") ||
    (draft.campaign ?? "") !== (params.get("campaign") ?? "") ||
    (draft.date_from ?? "") !== (params.get("date_from") ?? "") ||
    (draft.date_to ?? "") !== (params.get("date_to") ?? "");

  // ── committedCount: reflects what the table is currently showing ──
  const committedCount =
    (params.get("search") ? 1 : 0) +
    (params.get("status") ? 1 : 0) +
    (params.get("outcome") ? 1 : 0) +
    (params.get("source") ? 1 : 0) +
    (params.get("campaign") ? 1 : 0) +
    (params.get("domain") ? 1 : 0) +
    (params.get("agent_id") ? 1 : 0) +
    (params.get("date_from") ? 1 : 0) +
    (params.get("date_to") ? 1 : 0);

  function applyFilters() {
    const next = buildParams(params, {
      status: draft.status.length > 0 ? draft.status.join(",") : null,
      outcome: draft.outcome.length > 0 ? draft.outcome.join(",") : null,
      domain: draft.domain,
      agent_id: draft.agent_id,
      source: draft.source,
      campaign: draft.campaign,
      date_from: draft.date_from,
      date_to: draft.date_to,
    });
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function clearAll() {
    setDraft({
      status: [],
      outcome: [],
      domain: null,
      agent_id: null,
      source: null,
      campaign: null,
      date_from: null,
      date_to: null,
    });
    setSearchInput("");
    startTransition(() => router.push(pathname));
  }

  // FilterDropdown item arrays
  const statusItems = LEAD_STATUSES.map((s) => ({
    id: s,
    label: LEAD_STATUS_LABELS[s],
  }));
  const outcomeItems = CALL_OUTCOMES.map((o) => ({
    id: o,
    label: CALL_OUTCOME_LABELS[o],
  }));
  const sourceItems = LEAD_SOURCES.map((s) => ({
    id: s,
    label: LEAD_SOURCE_LABELS[s],
  }));
  const campaignItems = options.campaigns.map((c) => ({ id: c, label: c }));
  const agentItems = options.agents.map((a) => ({
    id: a.id,
    label: a.full_name,
  }));

  const rangeActive = !!(draft.date_from || draft.date_to);


  const rangePanel = (
    <AnimatePresence>
      {rangeOpen && (
        <motion.div
          ref={rangePanelRef}
          key="range-panel"
          variants={DROPDOWN_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            position:     "fixed",
            top:          rangePanelPos.top,
            left:         rangePanelPos.left,
            transform:    rangePanelPos.flipUp ? "translateY(-100%)" : undefined,
            zIndex:       "var(--z-dropdown)" as React.CSSProperties["zIndex"],
            background:   "var(--theme-paper)",
            border:       "1px solid var(--theme-paper-border)",
            borderRadius: "var(--radius-md)",
            boxShadow:    "var(--shadow-3)",
            padding:      "var(--space-4)",
            display:      "flex",
            alignItems:   "flex-end",
            gap:          "var(--space-3)",
            whiteSpace:   "nowrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--theme-text-tertiary)" }}>
              From
            </span>
            <DatePicker
              value={dateFromUrlParam(draft.date_from)}
              onChange={(d) => setDraft((prev) => ({ ...prev, date_from: dateToUrlParam(d) }))}
              placeholder="Start date…"
              maxDate={draft.date_to ? (dateFromUrlParam(draft.date_to) ?? undefined) : undefined}
              aria-label="From date"
            />
          </div>

          <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", flexShrink: 0 }}>
            →
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--theme-text-tertiary)" }}>
              To
            </span>
            <DatePicker
              value={dateFromUrlParam(draft.date_to)}
              onChange={(d) => setDraft((prev) => ({ ...prev, date_to: dateToUrlParam(d) }))}
              placeholder="End date…"
              minDate={draft.date_from ? (dateFromUrlParam(draft.date_from) ?? undefined) : undefined}
              aria-label="To date"
            />
          </div>

          {rangeActive && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, date_from: null, date_to: null }))}
              style={{
                display:         "inline-flex",
                alignItems:      "center",
                justifyContent:  "center",
                width:           "2.25rem",
                height:          "2.25rem",
                border:          "none",
                background:      "transparent",
                color:           "var(--theme-text-tertiary)",
                cursor:          "pointer",
                padding:         0,
                borderRadius:    "var(--radius-sm)",
                flexShrink:      0,
              }}
              title="Clear dates"
            >
              <X style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 1.5, display: "block" }} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {/* Row 1 — search + action buttons */}
      <div
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         "var(--space-3)",
          flexWrap:    "nowrap",
        }}
      >
        {/* Filter icon + committed count badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <SlidersHorizontal
            style={{ width: "1rem", height: "1rem", color: "var(--theme-text-tertiary)", strokeWidth: 1.5 }}
          />
          {committedCount > 0 && (
            <span
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                minWidth:       "1.25rem",
                height:         "1.25rem",
                padding:        "0 0.25rem",
                borderRadius:   "var(--radius-full)",
                background:     "var(--theme-accent)",
                color:          "var(--theme-accent-fg)",
                fontSize:       "10px",
                fontWeight:     "var(--weight-medium)",
                lineHeight:     1,
              }}
            >
              {committedCount}
            </span>
          )}
        </div>

        {/* Search — grows to fill */}
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search name, phone, email…"
          size="sm"
          style={{ flex: 1, minWidth: 0 }}
        />

        {/* Apply button — animated in/out when isDirty toggles */}
        <AnimatePresence>
          {isDirty && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
              style={{ flexShrink: 0 }}
            >
              <Button variant="primary" size="sm" onClick={applyFilters}>
                Apply
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clear all — reflects committed state, not draft */}
        {committedCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              display:    "inline-flex",
              alignItems: "center",
              gap:        "var(--space-1)",
              height:     "2.25rem",
              padding:    "0 var(--space-2)",
              border:     "none",
              background: "transparent",
              color:      "var(--theme-text-tertiary)",
              fontSize:   "var(--text-sm)",
              fontFamily: "var(--font-sans)",
              cursor:     "pointer",
              transition: "color var(--duration-fast) var(--ease-in-out)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--theme-text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--theme-text-tertiary)"; }}
          >
            <X style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 1.5 }} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Row 2 — filter dropdowns (flexWrap: nowrap so panels float above layout) */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "var(--space-2)",
          flexWrap:   "nowrap",
        }}
      >
        {/* Status — multi-select */}
        <FilterDropdown
          style={{ flexShrink: 0 }}
          label="Status"
          items={statusItems}
          selected={draft.status}
          multi
          onChange={(next) => setDraft((d) => ({ ...d, status: next as LeadStatus[] }))}
        />

        {/* Outcome — multi-select */}
        <FilterDropdown
          style={{ flexShrink: 0 }}
          label="Outcome"
          items={outcomeItems}
          selected={draft.outcome}
          multi
          onChange={(next) => setDraft((d) => ({ ...d, outcome: next as CallOutcome[] }))}
        />

        {/* Domain — single select, admin/founder only */}
        {showDomainFilter && (
          <FilterDropdown
            style={{ flexShrink: 0 }}
            label="Domain"
            items={GIA_DOMAIN_FILTER_ITEMS}
            selected={draft.domain ? [draft.domain] : []}
            onChange={(next) =>
              setDraft((d) => ({
                ...d,
                domain:   next[0] ?? null,
                agent_id: null,
                campaign: null,
              }))
            }
          />
        )}

        {/* Source — single select */}
        <FilterDropdown
          style={{ flexShrink: 0 }}
          label="Source"
          items={sourceItems}
          selected={draft.source ? [draft.source] : []}
          onChange={(next) => setDraft((d) => ({ ...d, source: next[0] ?? null }))}
        />

        {/* Campaign — single select, only when options exist */}
        {campaignItems.length > 0 && (
          <FilterDropdown
            style={{ flexShrink: 0 }}
            label="Campaign"
            items={campaignItems}
            selected={draft.campaign ? [draft.campaign] : []}
            onChange={(next) => setDraft((d) => ({ ...d, campaign: next[0] ?? null }))}
          />
        )}

        {/* Agent — single select, absent for agent role */}
        {showAgentFilter && agentItems.length > 0 && (
          <FilterDropdown
            style={{ flexShrink: 0 }}
            label="Agent"
            items={agentItems}
            selected={draft.agent_id ? [draft.agent_id] : []}
            onChange={(next) => setDraft((d) => ({ ...d, agent_id: next[0] ?? null }))}
          />
        )}

        {/* Range — trigger only; panel portaled to document.body */}
        <div ref={rangeRef} style={{ flexShrink: 0 }}>
          <button
            ref={rangeTriggerRef}
            type="button"
            onClick={() => setRangeOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={rangeOpen}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          "var(--space-2)",
              height:       "2.25rem",
              padding:      "var(--space-1) var(--space-3)",
              background:   rangeActive ? "var(--theme-accent-surface)" : "var(--theme-paper-subtle)",
              border:       `1px solid ${(rangeOpen || rangeActive) ? "var(--theme-accent)" : "var(--theme-paper-border)"}`,
              borderRadius: "var(--radius-md)",
              fontSize:     "var(--text-sm)",
              fontFamily:   "var(--font-sans)",
              fontWeight:   "var(--weight-medium)",
              color:        rangeActive ? "var(--theme-accent)" : "var(--theme-text-secondary)",
              cursor:       "pointer",
              transition:   "var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out)",
              whiteSpace:   "nowrap",
              outline:      "none",
            }}
          >
            Range
            {rangeActive && (
              <span
                style={{
                  display:        "inline-flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  minWidth:       18,
                  height:         18,
                  padding:        "0 var(--space-1)",
                  borderRadius:   "var(--radius-full)",
                  background:     "var(--theme-accent)",
                  color:          "var(--theme-accent-fg)",
                  fontSize:       "var(--text-2xs)",
                  fontWeight:     "var(--weight-semibold)",
                  lineHeight:     1,
                }}
              >
                {(draft.date_from ? 1 : 0) + (draft.date_to ? 1 : 0)}
              </span>
            )}
            <ChevronDown
              style={{
                width:      14,
                height:     14,
                strokeWidth:1.5,
                transform:  rangeOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform var(--duration-fast) var(--ease-in-out)",
              }}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Range panel portal */}
      {mounted && typeof document !== "undefined"
        ? createPortal(rangePanel, document.body)
        : null}
    </div>
  );
}

export { type LeadsFiltersProps };
