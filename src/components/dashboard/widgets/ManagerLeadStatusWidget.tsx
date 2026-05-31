"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCcw } from "lucide-react";
import {
  getLeadStatusSummaryAction,
  getLeadStatusForDomainAction,
} from "@/lib/actions/dashboard";
import { Button } from "@/components/ui/Button";
import { formatCompact } from "@/lib/utils/numbers";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/constants/lead-statuses";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/TabSelector";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import {
  DEFAULT_GIA_DOMAIN,
  DOMAIN_LABELS,
  GIA_DOMAINS,
  type GiaDomain,
} from "@/lib/constants/domains";
import type { AppDomain, LeadStatus } from "@/lib/types/database";
import type {
  DashboardLeadStatusCount,
  DashboardAgentStatusBreakdown,
} from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";

type DomainMode = "all" | GiaDomain;

// Resolved from LEAD_STATUS_COLORS — fixed theme-invariant status colours
const STATUS_COLORS: Record<LeadStatus, string> = {
  new:           "var(--status-new-text)",
  touched:       "var(--status-touched-text)",
  in_discussion: "var(--status-in-discussion-text)",
  nurturing:     "var(--status-nurturing-text)",
  won:           "var(--status-won-text)",
  lost:          "var(--status-lost-text)",
  junk:          "var(--status-junk-text)",
};

const STATUS_BG: Record<LeadStatus, string> = {
  new:           "var(--status-new-light)",
  touched:       "var(--status-touched-light)",
  in_discussion: "var(--status-in-discussion-light)",
  nurturing:     "var(--status-nurturing-light)",
  won:           "var(--status-won-light)",
  lost:          "var(--status-lost-light)",
  junk:          "var(--status-junk-light)",
};

const STATUS_ORDER: LeadStatus[] = [
  "new",
  "touched",
  "in_discussion",
  "nurturing",
  "won",
  "lost",
  "junk",
];

const CHIP_STATUSES: LeadStatus[] = ["new", "touched", "in_discussion", "won", "junk"];

type StatusData = {
  totals: DashboardLeadStatusCount[];
  byAgent: DashboardAgentStatusBreakdown[];
};

function StackedBar({ mix, total }: { mix: Partial<Record<LeadStatus, number>>; total: number }) {
  if (total === 0) {
    return (
      <div
        style={{
          height: "6px",
          borderRadius: "var(--radius-full)",
          background: "var(--theme-paper-border)",
          width: "100%",
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        height: "6px",
        borderRadius: "var(--radius-full)",
        overflow: "hidden",
        gap: "1px",
        background: "var(--theme-paper-border)",
      }}
    >
      {STATUS_ORDER.map((s) => {
        const count = mix[s] ?? 0;
        if (count === 0) return null;
        return (
          <div
            key={s}
            title={`${LEAD_STATUS_LABELS[s]}: ${count}`}
            style={{ width: `${(count / total) * 100}%`, background: STATUS_COLORS[s], flexShrink: 0 }}
          />
        );
      })}
    </div>
  );
}

export function ManagerLeadStatusWidget({ role, domain, initialData, size = 'lg' }: WidgetProps) {
  const isManagerRole = role === "manager";

  // Admin/founder default to onboarding; managers see their own domain (no picker)
  const initialMode: DomainMode = isManagerRole ? "all" : DEFAULT_GIA_DOMAIN;

  const seed = initialData?.lead_status ?? null;
  const [data, setData] = useState<StatusData | null>(seed);
  const [loaded, setLoaded] = useState(seed !== null);
  const [domainMode, setDomainMode] = useState<DomainMode>(initialMode);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    // Manager: use seeded data if available; else fetch all
    if (isManagerRole) {
      if (seed !== null) return;
      startTransition(async () => {
        const result = await getLeadStatusSummaryAction(role, domain);
        if (!cancelled && result.data) { setData(result.data); setLoaded(true); }
      });
    } else {
      // Admin/founder: always fetch onboarding on mount (seed is "all", we want domain slice)
      startTransition(async () => {
        const result = await getLeadStatusForDomainAction(DEFAULT_GIA_DOMAIN);
        if (!cancelled && result.data) { setData(result.data); setLoaded(true); }
      });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals   = data?.totals ?? [];
  const byAgent  = data?.byAgent ?? [];
  const mixMap   = Object.fromEntries(totals.map((t) => [t.status, t.count])) as Partial<Record<LeadStatus, number>>;
  const grandTotal = totals.reduce((s, t) => s + t.count, 0);

  function handleDomainChange(mode: DomainMode) {
    setDomainMode(mode);
    startTransition(async () => {
      if (mode === "all") {
        const result = await getLeadStatusSummaryAction(role, domain);
        if (result.data) setData(result.data);
      } else {
        const result = await getLeadStatusForDomainAction(mode as AppDomain);
        if (result.data) setData(result.data);
      }
    });
  }

  function handleRefresh() {
    startTransition(async () => {
      if (domainMode === "all") {
        const result = await getLeadStatusSummaryAction(role, domain);
        if (result.data) setData(result.data);
      } else {
        const result = await getLeadStatusForDomainAction(domainMode as AppDomain);
        if (result.data) setData(result.data);
      }
    });
  }

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--theme-paper-border)",
        background: "var(--theme-paper)",
        boxShadow: "var(--shadow-1)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        height: WIDGET_HEIGHT_BY_SIZE[size],
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p
          style={{
            fontSize: "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            color: "var(--theme-text-primary)",
            margin: 0,
          }}
        >
          Lead Pipeline<span className="page-title-dot">.</span>
        </p>
        <Button
          variant="ghost"
          onClick={handleRefresh}
          disabled={isPending}
          title="Refresh"
          style={{ width: 28, height: 28, padding: 0, border: "1px solid var(--theme-paper-border)", flexShrink: 0 }}
          iconLeft={RefreshCcw}
          size="xs"
        />
      </div>

      {/* ── Scrollable body ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          scrollbarWidth: "none",
          minHeight: 0,
        }}
      >

      {/* ── Status stat chips ── */}
      {loaded && grandTotal > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "var(--space-2)",
            opacity: isPending ? 0.5 : 1,
            transition: "opacity 200ms",
          }}
        >
          {CHIP_STATUSES.map((s) => {
            const count = mixMap[s] ?? 0;
            return (
              <div
                key={s}
                style={{
                  background: STATUS_BG[s],
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3) var(--space-2)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  border: "1px solid var(--theme-paper-border)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-xl)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: "var(--weight-semibold)",
                    color: STATUS_COLORS[s],
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCompact(count)}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-2xs)",
                    color: "var(--theme-text-secondary)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {LEAD_STATUS_LABELS[s]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Per-agent scorecard ── */}
      {loaded && byAgent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>

          {byAgent.slice(0, 6).map((agent) => {
            const won     = agent.counts.won ?? 0;
            const winRate = agent.total > 0 ? Math.round((won / agent.total) * 100) : 0;
            return (
              <div
                key={agent.agent_id}
                style={{ display: "flex", flexDirection: "column", gap: "3px", paddingBottom: "var(--space-2)" }}
              >
                {/* Row: name + 4 stat numbers */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) repeat(5, 36px)",
                    columnGap: "var(--space-2)",
                    alignItems: "center",
                  }}
                >
                  {/* Name + subtitle */}
                  <div style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        fontWeight: "var(--weight-medium)",
                        color: "var(--theme-text-primary)",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {agent.agent_name.split(" ")[0]}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-2xs)",
                        color: "var(--theme-text-tertiary)",
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCompact(agent.total)}
                      {winRate > 0 && (
                        <span style={{ color: "var(--color-success-text)", marginLeft: "4px" }}>
                          {winRate}%↑
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Stat cells aligned to header columns */}
                  {(["new", "touched", "in_discussion", "won", "junk"] as LeadStatus[]).map((s) => {
                    const count = agent.counts[s] ?? 0;
                    return (
                      <span
                        key={s}
                        title={`${LEAD_STATUS_LABELS[s]}: ${count}`}
                        style={{
                          fontSize: "var(--text-xs)",
                          fontFamily: "var(--font-mono)",
                          fontWeight: count > 0 ? "var(--weight-semibold)" : undefined,
                          color: count > 0 ? STATUS_COLORS[s] : "var(--theme-paper-border)",
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {count > 0 ? formatCompact(count) : "·"}
                      </span>
                    );
                  })}
                </div>

                {/* Mini bar — shows all statuses including nurturing/lost/junk */}
                <StackedBar mix={agent.counts} total={agent.total} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {loaded && grandTotal === 0 && (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: "var(--text-sm)",
            color: "var(--theme-text-tertiary)",
            textAlign: "center",
            padding: "var(--space-6) 0",
            margin: 0,
            flex: 1,
          }}
        >
          No leads in your pipeline yet.
        </p>
      )}

      </div>{/* end scrollable body */}

      {/* ── Domain tabs — pinned to bottom, admin/founder only ── */}
      {!isManagerRole && (
        <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--theme-paper-border)", flexShrink: 0 }}>
          <Tabs
            value={domainMode}
            onValueChange={(v) => handleDomainChange(v as DomainMode)}
            variant="connected"
            indicatorLayoutId="lead-status-domain"
            style={{
              opacity: isPending ? 0.6 : 1,
              pointerEvents: isPending ? "none" : undefined,
            }}
          >
            <TabsList>
              {GIA_DOMAINS.map((d) => (
                <TabsTrigger key={d} value={d}>
                  {DOMAIN_LABELS[d]}
                </TabsTrigger>
              ))}
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  );
}
