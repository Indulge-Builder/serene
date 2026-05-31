"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { X, SlidersHorizontal, Search } from "lucide-react";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { DatePicker } from "@/components/ui/DatePicker";
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

type LeadsFiltersProps = {
  role: UserRole;
  options: LeadFilterOptions;
  showAgentFilter: boolean;
  showDomainFilter: boolean;
};

// ─── URL param helpers ────────────────────────────────────────────────────────

function parseMulti<T extends string>(
  params: URLSearchParams,
  key: string,
): T[] {
  const val = params.get(key);
  if (!val) return [];
  return val.split(",").filter(Boolean) as T[];
}

function buildParams(
  current: URLSearchParams,
  updates: Record<string, string | null>,
): URLSearchParams {
  return buildFilterParams(current, updates, { resetKeys: ["page"] });
}

// ─── LeadsFilters ─────────────────────────────────────────────────────────────

export function LeadsFilters({
  role,
  options,
  showAgentFilter,
  showDomainFilter,
}: LeadsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // Read current filter state from URL
  const statusFilter = parseMulti<LeadStatus>(params, "status");
  const outcomeFilter = parseMulti<CallOutcome>(params, "outcome");
  const source = params.get("source");
  const campaign = params.get("campaign");
  const domainFilter = params.get("domain");
  const agentId = params.get("agent_id");
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");
  const searchParam = params.get("search") ?? "";

  // Local search state — debounced 500ms before pushing to URL
  const [searchInput, setSearchInput] = useState(searchParam);

  useEffect(() => {
    setSearchInput(params.get("search") ?? "");
  }, [params]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      const current = params.get("search") ?? "";
      if (trimmed === current) return;
      const next = buildParams(params, { search: trimmed || null });
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeCount =
    (searchParam ? 1 : 0) +
    (statusFilter.length > 0 ? 1 : 0) +
    (outcomeFilter.length > 0 ? 1 : 0) +
    (source ? 1 : 0) +
    (campaign ? 1 : 0) +
    (domainFilter ? 1 : 0) +
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

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        flexWrap: "wrap",
      }}
    >
      {/* Filter icon + active count badge */}
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
        {activeCount > 0 && (
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
            {activeCount}
          </span>
        )}
      </div>

      {/* Search */}
      <div
        style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}
      >
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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            width: "100%",
            height: "2.25rem",
            paddingLeft: "calc(var(--space-3) + 1rem + var(--space-2))",
            paddingRight: searchInput
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
        {searchInput && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setSearchInput("");
              const next = buildParams(params, { search: null });
              startTransition(() =>
                router.push(`${pathname}?${next.toString()}`),
              );
            }}
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
              (e.currentTarget as HTMLElement).style.color =
                "var(--theme-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--theme-text-tertiary)";
            }}
          >
            <X
              style={{
                width: "0.875rem",
                height: "0.875rem",
                strokeWidth: 1.5,
              }}
            />
          </button>
        )}
      </div>

      {/* Status — multi-select */}
      <FilterDropdown
        label="Status"
        items={statusItems}
        selected={statusFilter}
        multi
        onChange={(next) =>
          push({ status: next.length > 0 ? next.join(",") : null })
        }
      />

      {/* Outcome — multi-select */}
      <FilterDropdown
        label="Outcome"
        items={outcomeItems}
        selected={outcomeFilter}
        multi
        onChange={(next) =>
          push({ outcome: next.length > 0 ? next.join(",") : null })
        }
      />

      {/* Domain — single select, admin/founder only (GIA_DOMAINS) */}
      {showDomainFilter && (
        <FilterDropdown
          label="Domain"
          items={GIA_DOMAIN_FILTER_ITEMS}
          selected={domainFilter ? [domainFilter] : []}
          onChange={(next) =>
            push({
              domain: next[0] ?? null,
              agent_id: null,
              campaign: null,
            })
          }
        />
      )}

      {/* Source — single select */}
      <FilterDropdown
        label="Source"
        items={sourceItems}
        selected={source ? [source] : []}
        onChange={(next) => push({ source: next[0] ?? null })}
      />

      {/* Campaign — single select, only when options exist */}
      {campaignItems.length > 0 && (
        <FilterDropdown
          label="Campaign"
          items={campaignItems}
          selected={campaign ? [campaign] : []}
          onChange={(next) => push({ campaign: next[0] ?? null })}
        />
      )}

      {/* Agent — single select, absent for agent role */}
      {showAgentFilter && agentItems.length > 0 && (
        <FilterDropdown
          label="Agent"
          items={agentItems}
          selected={agentId ? [agentId] : []}
          onChange={(next) => push({ agent_id: next[0] ?? null })}
        />
      )}

      {/* Date range — two DatePicker components */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexShrink: 0,
        }}
      >
        <DatePicker
          value={dateFromUrlParam(dateFrom)}
          onChange={(d) => push({ date_from: dateToUrlParam(d) })}
          placeholder="From…"
          maxDate={dateTo ? (dateFromUrlParam(dateTo) ?? undefined) : undefined}
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
          value={dateFromUrlParam(dateTo)}
          onChange={(d) => push({ date_to: dateToUrlParam(d) })}
          placeholder="To…"
          minDate={
            dateFrom ? (dateFromUrlParam(dateFrom) ?? undefined) : undefined
          }
          aria-label="To date"
        />
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
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
            (e.currentTarget as HTMLElement).style.color =
              "var(--theme-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color =
              "var(--theme-text-tertiary)";
          }}
        >
          <X
            style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 1.5 }}
          />
          <span>Clear filters</span>
        </button>
      )}
    </div>
  );
}

// Re-exported for call sites that import it from here
export { type LeadsFiltersProps };
