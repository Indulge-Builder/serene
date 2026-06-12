"use client";

import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useUrlFilters, useMultiSelectUrlParam } from "@/hooks/useUrlFilters";
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

// Static item arrays — module scope, never rebuilt per render.
const STATUS_ITEMS = LEAD_STATUSES.map((s) => ({
  id: s,
  label: LEAD_STATUS_LABELS[s],
}));
const OUTCOME_ITEMS = CALL_OUTCOMES.map((o) => ({
  id: o,
  label: CALL_OUTCOME_LABELS[o],
}));
const SOURCE_ITEMS = LEAD_SOURCES.map((s) => ({
  id: s,
  label: LEAD_SOURCE_LABELS[s],
}));

// ─── LeadsFilters ─────────────────────────────────────────────────────────────
// Immediate-commit model (same as DealsFilters): every change pushes the URL
// via useUrlFilters, so each new selection compounds with what is already
// committed. Multi-selects (Status/Outcome) go through useMultiSelectUrlParam —
// instant checkbox echo, toggle bursts batched into ONE router.push. See
// src/components/leads/CLAUDE.md for the contract.

export function LeadsFilters({
  options,
  showAgentFilter,
  showDomainFilter,
}: LeadsFiltersProps) {
  const url = useUrlFilters({ resetKeys: ["page"] });
  const { params, push } = url;

  const [status, setStatus]   = useMultiSelectUrlParam<LeadStatus>(url, "status");
  const [outcome, setOutcome] = useMultiSelectUrlParam<CallOutcome>(url, "outcome");

  // Single-value filters read straight from the committed URL.
  const source   = params.get("source");
  const campaign = params.get("campaign");
  const agentId  = params.get("agent_id");
  const domain   = params.get("domain");
  const dateFrom = params.get("date_from");
  const dateTo   = params.get("date_to");

  // ── activeCount: committed URL params (what the table is showing) ──
  const activeCount =
    (params.get("search") ? 1 : 0) +
    (params.get("status") ? 1 : 0) +
    (params.get("outcome") ? 1 : 0) +
    (source ? 1 : 0) +
    (campaign ? 1 : 0) +
    (domain ? 1 : 0) +
    (agentId ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (params.get("going_cold") === "true" ? 1 : 0);

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
      activeCount={activeCount}
      showCountBadge={false}
      clearLabel="Clear"
      onClearAll={url.clearAll}
      dateRange={{
        trigger:      "chevron",
        panelKey:     "leads-range-panel",
        from:         dateFrom,
        to:           dateTo,
        onFromChange: (v) => push({ date_from: v }),
        onToChange:   (v) => push({ date_to: v }),
        onClear:      () => push({ date_from: null, date_to: null }),
        onPresetSelect: (from, to) => push({ date_from: from, date_to: to }),
      }}
    >
      {/* Status — multi-select */}
      <FilterDropdown
        menuPortal
        hideCountBadge
        accentBorderOnOpen={false}
        style={{ flexShrink: 0 }}
        label="Status"
        items={STATUS_ITEMS}
        selected={status}
        multi
        onChange={(next) => setStatus(next as LeadStatus[])}
      />

      {/* Outcome — multi-select */}
      <FilterDropdown
        menuPortal
        hideCountBadge
        accentBorderOnOpen={false}
        style={{ flexShrink: 0 }}
        label="Outcome"
        items={OUTCOME_ITEMS}
        selected={outcome}
        multi
        onChange={(next) => setOutcome(next as CallOutcome[])}
      />

      {/* Source — single select */}
      <FilterDropdown
        menuPortal
        hideCountBadge
        accentBorderOnOpen={false}
        style={{ flexShrink: 0 }}
        label="Source"
        items={SOURCE_ITEMS}
        selected={source ? [source] : []}
        onChange={(next) => push({ source: next[0] ?? null })}
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
          selected={campaign ? [campaign] : []}
          onChange={(next) => push({ campaign: next[0] ?? null })}
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
          selected={agentId ? [agentId] : []}
          onChange={(next) => push({ agent_id: next[0] ?? null })}
        />
      )}

      {/* Domain — single select, admin/founder only.
          Domain change atomically clears agent_id + campaign (same push). */}
      {showDomainFilter && (
        <FilterDropdown
          menuPortal
          hideCountBadge
          accentBorderOnOpen={false}
          style={{ flexShrink: 0 }}
          label="Domain"
          items={GIA_DOMAIN_FILTER_ITEMS}
          selected={domain ? [domain] : []}
          onChange={(next) =>
            push({
              domain:   next[0] ?? null,
              agent_id: null,
              campaign: null,
            })
          }
        />
      )}
    </FilterBar>
  );
}

export { type LeadsFiltersProps };
