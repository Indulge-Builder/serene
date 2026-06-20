"use client";

import { useCallback } from "react";
import { RefreshCcw } from "lucide-react";
import { getLeadStatusSummaryAction } from "@/lib/actions/dashboard";
import { Button } from "@/components/ui/Button";
import { formatCompact } from "@/lib/utils/numbers";
import { LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import type { LeadStatus } from "@/lib/types/database";
import type {
  DashboardLeadStatusCount,
  DashboardAgentStatusBreakdown,
} from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";
import type { DateRange } from "@/lib/utils/date-range";
import { useDashboardCohortSync } from "@/hooks/useDashboardCohortSync";
import { useWidgetData } from "@/hooks/useWidgetData";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";

// Chip surfaces — semantic token system, theme-aware.
const STATUS_TEXT: Record<LeadStatus, string> = {
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

const STATUS_BORDER: Record<LeadStatus, string> = {
  new:           "var(--status-new-border)",
  touched:       "var(--status-touched-border)",
  in_discussion: "var(--status-in-discussion-border)",
  nurturing:     "var(--status-nurturing-border)",
  won:           "var(--status-won-border)",
  lost:          "var(--status-lost-border)",
  junk:          "var(--status-junk-border)",
};

// Saturated fill colours for stacked bar segments and legend dots — the
// --status-*-solid tier exists for exactly this job (compact bars where the
// muted -text tones are indistinguishable). Never substitute -text tokens here.
const BAR_COLORS: Record<LeadStatus, string> = {
  new:           "var(--status-new-solid)",
  touched:       "var(--status-touched-solid)",
  in_discussion: "var(--status-in-discussion-solid)",
  nurturing:     "var(--status-nurturing-solid)",
  won:           "var(--status-won-solid)",
  lost:          "var(--status-lost-solid)",
  junk:          "var(--status-junk-solid)",
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

const CHIP_STATUSES: LeadStatus[] = ["new", "touched", "in_discussion", "won", "lost", "junk"];

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

  // Coerce counts to numbers — jsonb values can arrive as strings in some JS runtimes.
  const segments = STATUS_ORDER
    .map((s) => ({ s, count: Number(mix[s] ?? 0) }))
    .filter((x) => x.count > 0);

  // Widths must use the sum of segment counts, not a separate total field (RPC used to
  // return COUNT of status buckets instead of SUM of leads, which broke proportions).
  const barTotal = segments.reduce((sum, x) => sum + x.count, 0) || Number(total) || 0;
  if (barTotal === 0) {
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

  // Compute precise pixel-percentage widths. Give the last segment the remainder
  // so floating-point rounding never causes total to fall short of 100%.
  const pcts = segments.map((seg, i) => {
    if (i === segments.length - 1) {
      const sumSoFar = segments.slice(0, i).reduce((acc, x) => acc + Math.floor((x.count / barTotal) * 1000) / 10, 0);
      return Math.max(0, 100 - sumSoFar);
    }
    return Math.floor((seg.count / barTotal) * 1000) / 10; // one decimal place
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", width: "100%" }}>
      {/* Count labels above each segment */}
      <div style={{ display: "flex", width: "100%" }}>
        {segments.map(({ s, count }, i) => (
          <div
            key={s}
            style={{ width: `${pcts[i]}%`, display: "flex", justifyContent: "center", overflow: "hidden", minWidth: 0 }}
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
      {/* Bar — no gap so percentages fill edge-to-edge without overflow clip eating a segment */}
      <div
        style={{
          display: "flex",
          height: "10px",
          borderRadius: "var(--radius-full)",
          overflow: "hidden",
          width: "100%",
        }}
      >
        {segments.map(({ s }, i) => (
          <div
            key={s}
            title={`${LEAD_STATUS_LABELS[s]}: ${segments[i].count}`}
            style={{ width: `${pcts[i]}%`, background: BAR_COLORS[s], flexShrink: 0, minWidth: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

export function ManagerLeadStatusWidget({ userId, role, initialData, size = 'lg', dateRange, scopeDomain }: WidgetProps & { dateRange?: DateRange }) {
  const isManagerRole = role === "manager";

  const rscLeadStatus = initialData?.lead_status ?? null;

  // The ONE fetcher — the refresh button re-runs it. The domain comes from the
  // global selector (scopeDomain); managers pass undefined and the server pins
  // them to their own domain via effectiveWidgetDomain (the trust boundary).
  const loadStatus = useCallback(
    () =>
      getLeadStatusSummaryAction(dateRange?.from, dateRange?.to, scopeDomain ?? undefined),
    [dateRange?.from, dateRange?.to, scopeDomain],
  );

  const { data, loaded, isPending, refetch, apply } = useWidgetData<StatusData>({
    seed: rscLeadStatus,
    fetcher: loadStatus,
    // The RSC always seeds the current scope (manager → own domain; admin/founder
    // → scopeDomain or the all-domains aggregate). No mount fetch ever needed.
    autoFetch: false,
    deps: [dateRange?.from, dateRange?.to, scopeDomain],
  });

  // The RSC payload always matches the rendered scope now (a domain pick
  // round-trips the page and reseeds), so cohort-sync always applies it.
  useDashboardCohortSync(rscLeadStatus, dateRange, true, apply);

  const totals    = data?.totals ?? [];
  const rawByAgent = data?.byAgent ?? [];
  // Manager view: pin the caller's own row first (SQL sorts by total DESC; the
  // manager's full domain roster is the row set since migration 0129). The "You"
  // marker + pin is purely client-side — SQL carries no identity arg.
  const byAgent   = isManagerRole
    ? [...rawByAgent].sort((a, b) =>
        a.agent_id === userId ? -1 : b.agent_id === userId ? 1 : 0,
      )
    : rawByAgent;
  const mixMap    = Object.fromEntries(totals.map((t) => [t.status, t.count])) as Partial<Record<LeadStatus, number>>;
  const grandTotal = totals.reduce((s, t) => s + t.count, 0);

  function handleRefresh() {
    refetch();
  }

  // Active statuses present in the data (for legend — skip zeros)
  const activeStatuses = STATUS_ORDER.filter((s) => (mixMap[s] ?? 0) > 0);

  // Chip grid is a behavioural breakpoint, not a width-guess: 6-up on desktop,
  // a clean 3+3 on mobile. auto-fit on a full-width phone widget packed 4 then 2
  // (an uneven split); a fixed count per breakpoint keeps two even rows.
  const isMobile = useMediaQuery(MQ.mobile);
  const chipColumns = isMobile ? 3 : CHIP_STATUSES.length;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
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
          loading={isPending}
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
          opacity: isPending ? 0.5 : 1,
          transition: "opacity 200ms",
        }}
      >
        {/* ── Status stat chips ── */}
        {loaded && grandTotal > 0 && (
          <div
            style={{
              display: "grid",
              // Fixed column count per breakpoint (not width-driven auto-fit):
              // 6-up on the half-width desktop widget, a clean 3+3 on mobile.
              // auto-fit on a full-width phone packed an uneven 4+2 — this keeps
              // two even rows. Each column min-0s so the chip never overflows.
              gridTemplateColumns: `repeat(${chipColumns}, minmax(0, 1fr))`,
              gap: "var(--space-2)",
            }}
          >
            {CHIP_STATUSES.map((s) => {
              const count = mixMap[s] ?? 0;
              return (
                <div
                  key={s}
                  style={{
                    background:   STATUS_BG[s],
                    borderRadius: "var(--radius-md)",
                    padding:      "var(--space-3) var(--space-2)",
                    display:      "flex",
                    flexDirection:"column",
                    alignItems:   "center",
                    gap:          "var(--space-1)",
                    border:       `1px solid ${STATUS_BORDER[s]}`,
                  }}
                >
                  <span
                    style={{
                      fontSize:           "var(--text-xl)",
                      fontFamily:         "var(--font-mono)",
                      fontWeight:         "var(--weight-semibold)",
                      color:              STATUS_TEXT[s],
                      lineHeight:         1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCompact(count)}
                  </span>
                  <span
                    style={{
                      fontSize:  "var(--text-2xs)",
                      color:     STATUS_TEXT[s],
                      textAlign: "center",
                      opacity:   0.8,
                    }}
                  >
                    {LEAD_STATUS_LABELS[s]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Legend (left) + Total leads (right) on one line ── */}
        {loaded && grandTotal > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {/* Legend pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", flex: 1, minWidth: 0 }}>
              {activeStatuses.map((s) => (
                <div
                  key={s}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          "4px",
                    padding:      "2px var(--space-2)",
                    borderRadius: "var(--radius-full)",
                    background:   STATUS_BG[s],
                    border:       `1px solid ${STATUS_BORDER[s]}`,
                  }}
                >
                  <span
                    style={{
                      width:        "6px",
                      height:       "6px",
                      borderRadius: "var(--radius-full)",
                      background:   BAR_COLORS[s],
                      flexShrink:   0,
                    }}
                  />
                  <span style={{ fontSize: "var(--text-2xs)", color: STATUS_TEXT[s], whiteSpace: "nowrap" }}>
                    {LEAD_STATUS_LABELS[s]}
                  </span>
                </div>
              ))}
            </div>

            {/* Total count — right-aligned */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "5px", flexShrink: 0 }}>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--theme-text-tertiary)", whiteSpace: "nowrap" }}>
                Total leads
              </span>
              <span
                style={{
                  fontSize:           "var(--text-sm)",
                  fontFamily:         "var(--font-mono)",
                  fontWeight:         "var(--weight-semibold)",
                  fontVariantNumeric: "tabular-nums",
                  color:              "var(--theme-text-primary)",
                  lineHeight:         1,
                }}
              >
                {grandTotal.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* ── Per-agent scorecard — all agents, sorted by total DESC ── */}
        {loaded && grandTotal > 0 && byAgent.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {byAgent.map((agent) => {
              const isSelf = isManagerRole && agent.agent_id === userId;
              return (
              <div
                key={agent.agent_id}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", paddingBottom: "var(--space-2)" }}
              >
                {/* Agent name (+ "You" marker on the manager's own row) */}
                <div style={{ flexShrink: 0, width: "72px", overflow: "hidden", display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span
                    style={{
                      fontSize:     "var(--text-xs)",
                      fontWeight:   isSelf ? "var(--weight-semibold)" : "var(--weight-medium)",
                      color:        "var(--theme-text-primary)",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                      display:      "block",
                    }}
                  >
                    {agent.agent_name.split(" ")[0]}
                  </span>
                  {isSelf && (
                    <span
                      style={{
                        fontSize:   "var(--text-2xs)",
                        color:      "var(--theme-accent)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      You
                    </span>
                  )}
                </div>

                {/* Stacked bar — fills remaining width */}
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
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              textAlign:  "center",
              padding:    "var(--space-6) 0",
              margin:     0,
              flex:       1,
            }}
          >
            No leads for this period.
          </p>
        )}
      </div>
    </div>
  );
}
