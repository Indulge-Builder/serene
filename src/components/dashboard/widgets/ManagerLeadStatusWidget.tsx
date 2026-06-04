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

// Text colours for chip labels and agent stat numbers
const STATUS_COLORS: Record<LeadStatus, string> = {
  new:           "var(--status-new-text)",
  touched:       "var(--status-touched-text)",
  in_discussion: "var(--status-in-discussion-text)",
  nurturing:     "var(--status-nurturing-text)",
  won:           "var(--status-won-text)",
  lost:          "var(--status-lost-text)",
  junk:          "var(--status-junk-text)",
};

// Chip background colours — soft pastels for the 5 stat chips only
const STATUS_BG: Record<LeadStatus, string> = {
  new:           "var(--status-new-light)",
  touched:       "var(--status-touched-light)",
  in_discussion: "var(--status-in-discussion-light)",
  nurturing:     "var(--status-nurturing-light)",
  won:           "var(--status-won-light)",
  lost:          "var(--status-lost-light)",
  junk:          "var(--status-junk-light)",
};

// Distinct saturated colours for the agent stacked bar segments
const BAR_COLORS: Record<LeadStatus, string> = {
  new:           "#F5A623",
  touched:       "#4A90D9",
  in_discussion: "#27AE8F",
  nurturing:     "#8B6FD4",
  won:           "#27AE60",
  lost:          "#E05C4B",
  junk:          "#B0B0B0",
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
          height: "10px",
          borderRadius: "var(--radius-full)",
          background: "var(--theme-paper-border)",
          width: "100%",
        }}
      />
    );
  }

  const segments = STATUS_ORDER.map((s) => ({ s, count: mix[s] ?? 0 })).filter((x) => x.count > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", width: "100%" }}>
      {/* Numbers above each segment */}
      <div style={{ display: "flex", width: "100%" }}>
        {segments.map(({ s, count }) => (
          <div
            key={s}
            style={{ width: `${(count / total) * 100}%`, display: "flex", justifyContent: "center", overflow: "hidden" }}
          >
            <span
              style={{
                fontSize: "var(--text-2xs)",
                fontFamily: "var(--font-mono)",
                fontWeight: "var(--weight-semibold)",
                color: BAR_COLORS[s],
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: "10px",
          borderRadius: "var(--radius-full)",
          overflow: "hidden",
          gap: "1px",
          background: "var(--theme-paper-border)",
        }}
      >
        {segments.map(({ s, count }) => (
          <div
            key={s}
            title={`${LEAD_STATUS_LABELS[s]}: ${count}`}
            style={{ width: `${(count / total) * 100}%`, background: BAR_COLORS[s], flexShrink: 0 }}
          />
        ))}
      </div>
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
    if (isManagerRole) {
      // Manager: use seeded data if available; else fetch
      if (seed !== null) return;
      startTransition(async () => {
        const result = await getLeadStatusSummaryAction(role, domain);
        if (!cancelled && result.data) { setData(result.data); setLoaded(true); }
      });
    } else {
      // Admin/founder: page seeds initialData with onboarding-scoped pipeline data
      // (p_initial_domain='onboarding' passed from dashboard/page.tsx).
      // Use the seed directly when activeDomain matches the seeded domain — zero POST on initial paint.
      if (seed !== null && domainMode === DEFAULT_GIA_DOMAIN) {
        setLoaded(true);
        return;
      }
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

  // Silent 30s auto-poll — mirrors handleRefresh, no loading state
  useEffect(() => {
    const id = setInterval(() => {
      let cancelled = false;
      startTransition(async () => {
        if (domainMode === "all") {
          const result = await getLeadStatusSummaryAction(role, domain);
          if (!cancelled && result.data) setData(result.data);
        } else {
          const result = await getLeadStatusForDomainAction(domainMode as AppDomain);
          if (!cancelled && result.data) setData(result.data);
        }
      });
      return () => { cancelled = true; };
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainMode, role, domain]);

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

      {/* ── Legend ── */}
      {loaded && grandTotal > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
          }}
        >
          {STATUS_ORDER.filter((s) => s !== "nurturing").map((s) => (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px var(--space-2)",
                borderRadius: "var(--radius-full)",
                background: "var(--theme-paper-subtle)",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "var(--radius-full)",
                  background: BAR_COLORS[s],
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "var(--text-2xs)",
                  color: "var(--theme-text-tertiary)",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.02em",
                }}
              >
                {LEAD_STATUS_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Per-agent scorecard ── */}
      {loaded && byAgent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>

          {byAgent.slice(0, 6).map((agent) => {
            return (
              <div
                key={agent.agent_id}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", paddingBottom: "var(--space-2)" }}
              >
                {/* Name + total + win rate — all inline, fixed width */}
                <div style={{ flexShrink: 0, width: "80px", display: "flex", alignItems: "baseline", gap: "4px", overflow: "hidden" }}>
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--weight-medium)",
                      color: "var(--theme-text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flexShrink: 1,
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
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCompact(agent.total)}
                  </span>
                </div>

                {/* Bar — fills remaining width */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StackedBar mix={agent.counts} total={agent.total} />
                </div>
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
        <div
          style={{
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--theme-paper-border)",
            flexShrink: 0,
            minWidth: 0,
            width: "100%",
          }}
        >
          <Tabs
            value={domainMode}
            onValueChange={(v) => handleDomainChange(v as DomainMode)}
            variant="connected"
            indicatorLayoutId="lead-status-domain"
            style={{
              width: "100%",
              opacity: isPending ? 0.6 : 1,
              pointerEvents: isPending ? "none" : undefined,
            }}
          >
            <TabsList style={{ width: "100%" }}>
              {([...GIA_DOMAINS, "all"] as DomainMode[]).map((mode) => {
                const isActive = domainMode === mode;
                const label = mode === "all" ? "All" : DOMAIN_LABELS[mode];
                return (
                  <TabsTrigger
                    key={mode}
                    value={mode}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "6px 4px",
                      fontSize: "var(--text-2xs)",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                        color: isActive
                          ? "var(--theme-text-primary)"
                          : "var(--theme-text-secondary)",
                      }}
                    >
                      {label}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  );
}
