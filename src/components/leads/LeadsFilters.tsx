"use client";

import { useState, useEffect } from "react";
import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useUrlFilters } from "@/hooks/useUrlFilters";
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
  // sort_order is NOT in draft — commits immediately in LeadsTable toolbar
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
    status:     parseMulti<LeadStatus>(params, "status"),
    outcome:    parseMulti<CallOutcome>(params, "outcome"),
    domain:     params.get("domain"),
    agent_id:   params.get("agent_id"),
    source:     params.get("source"),
    campaign:   params.get("campaign"),
    date_from:  params.get("date_from"),
    date_to:    params.get("date_to"),
  };
}

// ─── LeadsFilters ─────────────────────────────────────────────────────────────
// Draft → Apply commit model: dropdown/date changes accumulate in `draft`;
// one router.push fires on Apply. Search commits independently (debounced
// via useUrlFilters). See src/components/leads/CLAUDE.md for the contract.

export function LeadsFilters({
  options,
  showAgentFilter,
  showDomainFilter,
}: LeadsFiltersProps) {
  const url = useUrlFilters({ resetKeys: ["page"] });
  const { params } = url;

  const [draft, setDraft] = useState<FilterDraft>(() => draftFromParams(params));

  // Sync draft when URL changes (browser back/forward).
  useEffect(() => {
    setDraft(draftFromParams(params));
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
    (params.get("date_to") ? 1 : 0) +
    (params.get("going_cold") === "true" ? 1 : 0);

  function applyFilters() {
    url.push({
      status:     draft.status.length > 0 ? draft.status.join(",") : null,
      outcome:    draft.outcome.length > 0 ? draft.outcome.join(",") : null,
      domain:     draft.domain,
      agent_id:   draft.agent_id,
      source:     draft.source,
      campaign:   draft.campaign,
      date_from:  draft.date_from,
      date_to:    draft.date_to,
    });
  }

  function clearAll() {
    setDraft({
      status:     [],
      outcome:    [],
      domain:     null,
      agent_id:   null,
      source:     null,
      campaign:   null,
      date_from:  null,
      date_to:    null,
    });
    url.clearAll();
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
    <FilterBar
      layout="scroll"
      searchValue={url.searchInput}
      onSearchChange={url.setSearchInput}
      searchPlaceholder="Search name, phone, email…"
      searchSize="sm"
      suppressSearchFocusAccent
      searchStyle={{ flex: "1 1 180px", maxWidth: "280px" }}
      dividerAfterSearch
      activeCount={committedCount}
      showCountBadge={false}
      clearLabel="Clear"
      onClearAll={clearAll}
      apply={{ disabled: !isDirty, onClick: applyFilters }}
      dateRange={{
        trigger:      "chevron",
        panelKey:     "leads-range-panel",
        from:         draft.date_from,
        to:           draft.date_to,
        onFromChange: (v) => setDraft((prev) => ({ ...prev, date_from: v })),
        onToChange:   (v) => setDraft((prev) => ({ ...prev, date_to: v })),
        onClear:      () => setDraft((d) => ({ ...d, date_from: null, date_to: null })),
        onPresetSelect: (from, to) => setDraft((d) => ({ ...d, date_from: from, date_to: to })),
      }}
    >
      {/* Status — multi-select */}
      <FilterDropdown
        menuPortal
        hideCountBadge
        accentBorderOnOpen={false}
        style={{ flexShrink: 0 }}
        label="Status"
        items={statusItems}
        selected={draft.status}
        multi
        onChange={(next) => setDraft((d) => ({ ...d, status: next as LeadStatus[] }))}
      />

      {/* Outcome — multi-select */}
      <FilterDropdown
        menuPortal
        hideCountBadge
        accentBorderOnOpen={false}
        style={{ flexShrink: 0 }}
        label="Outcome"
        items={outcomeItems}
        selected={draft.outcome}
        multi
        onChange={(next) => setDraft((d) => ({ ...d, outcome: next as CallOutcome[] }))}
      />

      {/* Source — single select */}
      <FilterDropdown
        menuPortal
        hideCountBadge
        accentBorderOnOpen={false}
        style={{ flexShrink: 0 }}
        label="Source"
        items={sourceItems}
        selected={draft.source ? [draft.source] : []}
        onChange={(next) => setDraft((d) => ({ ...d, source: next[0] ?? null }))}
      />

      {/* Campaign — single select, only when options exist */}
      {campaignItems.length > 0 && (
        <FilterDropdown
          menuPortal
          hideCountBadge
          accentBorderOnOpen={false}
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
          menuPortal
          hideCountBadge
          accentBorderOnOpen={false}
          style={{ flexShrink: 0 }}
          label="Agent"
          items={agentItems}
          selected={draft.agent_id ? [draft.agent_id] : []}
          onChange={(next) => setDraft((d) => ({ ...d, agent_id: next[0] ?? null }))}
        />
      )}

      {/* Domain — single select, admin/founder only.
          Domain change atomically clears agent_id + campaign (same setDraft). */}
      {showDomainFilter && (
        <FilterDropdown
          menuPortal
          hideCountBadge
          accentBorderOnOpen={false}
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
    </FilterBar>
  );
}

export { type LeadsFiltersProps };
