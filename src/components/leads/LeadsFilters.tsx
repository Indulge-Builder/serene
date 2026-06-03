"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { X, SlidersHorizontal, Search } from "lucide-react";
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
import { EASE_OUT_EXPO } from "@/lib/constants/motion";

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
  search: string;
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
    search: params.get("search") ?? "",
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

  // Sync draft when URL changes (browser back/forward).
  useEffect(() => {
    setDraft(draftFromParams(params));
    // deps: params only — intentional. Do not add draft to deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // ── isDirty: compare draft against live URL (computed, no useState) ──
  const isDirty =
    draft.status.join(",") !== (params.get("status") ?? "") ||
    draft.outcome.join(",") !== (params.get("outcome") ?? "") ||
    (draft.domain ?? "") !== (params.get("domain") ?? "") ||
    (draft.agent_id ?? "") !== (params.get("agent_id") ?? "") ||
    (draft.source ?? "") !== (params.get("source") ?? "") ||
    (draft.campaign ?? "") !== (params.get("campaign") ?? "") ||
    (draft.date_from ?? "") !== (params.get("date_from") ?? "") ||
    (draft.date_to ?? "") !== (params.get("date_to") ?? "") ||
    draft.search !== (params.get("search") ?? "");

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
      search: draft.search.trim() || null,
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
      search: "",
    });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

      {/* Row 1 — Search */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {/* Filter icon + committed count badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
          }}
        >
          <SlidersHorizontal
            style={{
              width: "1rem",
              height: "1rem",
              color: "var(--theme-text-tertiary)",
              strokeWidth: 1.5,
            }}
          />
          {committedCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "1.25rem",
                height: "1.25rem",
                padding: "0 0.25rem",
                borderRadius: "var(--radius-full)",
                background: "var(--theme-accent)",
                color: "var(--theme-accent-fg)",
                fontSize: "10px",
                fontWeight: "var(--weight-medium)",
                lineHeight: 1,
              }}
            >
              {committedCount}
            </span>
          )}
        </div>

        {/* Search input — writes draft only, no URL push */}
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            style={{
              position: "absolute",
              left: "var(--space-3)",
              top: "50%",
              transform: "translateY(-50%)",
              width: "1rem",
              height: "1rem",
              color: "var(--theme-text-tertiary)",
              strokeWidth: 1.5,
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            className="eia-input"
            placeholder="Search name, phone, email…"
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            style={{
              width: "100%",
              height: "2.25rem",
              paddingLeft: "calc(var(--space-3) + 1rem + var(--space-2))",
              paddingRight: draft.search
                ? "calc(var(--space-3) + 1rem + var(--space-2))"
                : "var(--space-3)",
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-md)",
              background: "var(--theme-paper-subtle)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-sans)",
              color: "var(--theme-text-primary)",
              outline: "none",
              caretColor: "var(--theme-accent)",
              transition: "var(--transition-hover)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--theme-accent)";
              e.currentTarget.style.background = "var(--theme-paper)";
              e.currentTarget.style.boxShadow = "var(--shadow-focus)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--theme-paper-border)";
              e.currentTarget.style.background = "var(--theme-paper-subtle)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {draft.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setDraft((d) => ({ ...d, search: "" }))}
              style={{
                position: "absolute",
                right: "var(--space-3)",
                top: "50%",
                transform: "translateY(-50%)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1rem",
                height: "1rem",
                border: "none",
                background: "transparent",
                color: "var(--theme-text-tertiary)",
                cursor: "pointer",
                padding: 0,
                transition: "color var(--duration-fast) var(--ease-in-out)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--theme-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--theme-text-tertiary)";
              }}
            >
              <X style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 1.5 }} />
            </button>
          )}
        </div>
      </div>

      {/* Row 2 — Filter dropdowns + action buttons */}
      {/* flexWrap: nowrap — dropdown panels are absolutely positioned and must float above layout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexWrap: "nowrap",
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
                domain: next[0] ?? null,
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

        {/* Date range */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
          }}
        >
          <DatePicker
            value={dateFromUrlParam(draft.date_from)}
            onChange={(d) =>
              setDraft((prev) => ({ ...prev, date_from: dateToUrlParam(d) }))
            }
            placeholder="From…"
            maxDate={draft.date_to ? (dateFromUrlParam(draft.date_to) ?? undefined) : undefined}
            aria-label="From date"
          />
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--theme-text-tertiary)",
              flexShrink: 0,
            }}
          >
            →
          </span>
          <DatePicker
            value={dateFromUrlParam(draft.date_to)}
            onChange={(d) =>
              setDraft((prev) => ({ ...prev, date_to: dateToUrlParam(d) }))
            }
            placeholder="To…"
            minDate={draft.date_from ? (dateFromUrlParam(draft.date_from) ?? undefined) : undefined}
            aria-label="To date"
          />
        </div>

        {/* Spacer — pushes action buttons to the right */}
        <div style={{ flex: 1 }} />

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

        {/* Clear — reflects committed state, not draft */}
        {committedCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              height: "2.25rem",
              padding: "0 var(--space-2)",
              border: "none",
              background: "transparent",
              color: "var(--theme-text-tertiary)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-sans)",
              cursor: "pointer",
              transition: "color var(--duration-fast) var(--ease-in-out)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--theme-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--theme-text-tertiary)";
            }}
          >
            <X style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 1.5 }} />
            <span>Clear filters</span>
          </button>
        )}
      </div>
    </div>
  );
}

export { type LeadsFiltersProps };
