"use client";

import { useMemo } from "react";
import { m as motion } from "framer-motion";
import { RefreshCcw, Fuel } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { getBudgetGaugeWidgetAction } from "@/lib/actions/dashboard";
import { resolvePresetToRange } from "@/lib/utils/date-range";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { formatCount, formatCurrency, formatCurrencyCompact } from "@/lib/utils/numbers";
import { EASE_SPRING, SLOW_DURATION } from "@/lib/constants/motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import { useDashboardCohortSync } from "@/hooks/useDashboardCohortSync";
import { useWidgetDensityTier } from "@/hooks/useWidgetDensity";
import type { BudgetGaugeSummary } from "@/lib/services/ad-spend-service";
import type { WidgetProps } from "../DashboardWidgetSlot";

/**
 * Campaign Budget. TWO shapes, switched on the payload's `scope`:
 *
 * - scope 'org' (admin/founder) — the ad-account FUEL GAUGE. The org-wide tank:
 *   total recharged is the full tank, spend is fuel burned, remaining is fuel
 *   left (recharged − spent, INR-only — the same balance rule as the /budget
 *   per-account report). Hero = remaining fuel; the Recharged · Spent ·
 *   Remaining trio carries the breakdown.
 * - scope 'domain' (manager) — the manager's own domain SPEND plane only. The
 *   gauge arc and every recharge-derived figure (recharged / remaining /
 *   consumed) are HIDDEN — recharges carry no domain, so a per-domain
 *   "remaining" would misstate finance. Hero = domain spend total; below it the
 *   campaign count + CPL. A tertiary caption names the domain. The manager's
 *   domain is pinned server-side in getBudgetGaugeWidgetAction (via
 *   profile.domain) — a crafted request can never leak another domain.
 *
 * Data is the /budget pipeline rolled into one summary by buildBudgetGaugeSummary
 * (org) or buildDomainSpendGaugeSummary (domain): RSC-seeded on first paint
 * (initialData.budget_gauge), refetched through getBudgetGaugeWidgetAction on
 * range change / refresh.
 *
 * Density-adaptive (the v4 spatial dashboard): a tiny cell shows the headline +
 * (org only) a thin gauge; a taller cell adds the full breakdown.
 */
export function ManagerBudgetWidget({ initialData, dateRange, domain }: WidgetProps) {
  const rscGauge = initialData?.budget_gauge ?? null;
  const range = dateRange ?? resolvePresetToRange("week");
  const tier = useWidgetDensityTier();

  const { data, loaded, isPending, refetch, apply } = useWidgetData<BudgetGaugeSummary>({
    seed: rscGauge,
    fetcher: async () => {
      const result = await getBudgetGaugeWidgetAction(range.from, range.to);
      return { data: result.data };
    },
    autoFetch: false,
    deps: [range.from, range.to],
  });
  useDashboardCohortSync(rscGauge, dateRange, true, apply);

  return (
    <div
      style={{
        borderRadius:  "var(--neu-radius-card)",
        border:        "1px solid var(--theme-paper-border)",
        background:    "var(--theme-paper)",
        boxShadow:     "var(--shadow-1)",
        padding:       "var(--space-5)",
        display:       "flex",
        flexDirection: "column",
        gap:           "var(--space-4)",
        height:        "100%",
        overflow:      "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: "var(--space-3)" }}>
        <p
          style={{
            fontSize:   "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            color:      "var(--theme-text-primary)",
            margin:     0,
            display:    "flex",
            alignItems: "center",
            gap:        "var(--space-2)",
            minWidth:   0,
          }}
        >
          <Fuel style={{ width: 15, height: 15, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Campaign Fuel<span className="page-title-dot">.</span>
          </span>
        </p>
        <Tooltip label="Refresh" side="bottom">
        <Button
          variant="ghost"
          onClick={() => refetch()}
          loading={isPending}
          aria-label="Refresh"
          className="serene-touch"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            border: "1px solid var(--theme-paper-border)",
            flexShrink: 0,
          }}
          iconLeft={RefreshCcw}
          size="xs"
        />
        </Tooltip>
      </div>

      {!loaded ? null : data === null ? (
        <EmptyGauge spent={0} />
      ) : data.scope === "domain" ? (
        data.spent === 0 ? (
          <EmptyGauge spent={0} domainLabel={DOMAIN_LABELS[domain]} />
        ) : (
          <DomainSpendBody gauge={data} domainLabel={DOMAIN_LABELS[domain]} isPending={isPending} />
        )
      ) : data.recharged === 0 ? (
        <EmptyGauge spent={data.spent} />
      ) : (
        <FuelGaugeBody gauge={data} tier={tier} isPending={isPending} />
      )}
    </div>
  );
}

// ── The gauge body ──────────────────────────────────────────────────────────

function FuelGaugeBody({
  gauge,
  tier,
  isPending,
}: {
  gauge:     BudgetGaugeSummary;
  tier:      "compact" | "standard" | "rich";
  isPending: boolean;
}) {
  // Org scope guarantees these are non-null (recharged > 0 by the caller's
  // branch); coerce for the type-narrow since the shared payload allows null.
  const recharged = gauge.recharged ?? 0;
  const remaining = gauge.remaining ?? 0;
  const consumed = gauge.consumed ?? 0;
  const overspent = remaining < 0;
  const pct = Math.round(consumed * 100);

  // Fuel-tank intent: a depletion semantic (high consumption = low fuel = bad).
  // Inverse of ProgressBar's auto-intent — here a near-full tank is success.
  const { fill, accentText } = useMemo(() => {
    if (overspent) return { fill: "var(--color-danger)", accentText: "var(--color-danger-text)" };
    if (consumed >= 0.85) return { fill: "var(--color-warning)", accentText: "var(--color-warning-text)" };
    return { fill: "var(--color-success)", accentText: "var(--color-success-text)" };
  }, [overspent, consumed]);

  // Remaining is the hero number; overspend renders the deficit in danger.
  const remainingLabel = overspent
    ? `−${formatCurrencyCompact(Math.abs(remaining))}`
    : formatCurrencyCompact(remaining);

  const showTrio  = tier !== "compact";

  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        gap:            "var(--space-4)",
        flex:           1,
        minHeight:      0,
        justifyContent: "center",
        opacity:        isPending ? 0.5 : 1,
        transition:     "opacity 200ms",
      }}
    >
      {/* Hero — remaining fuel + % consumed */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div style={{ minWidth: 0 }}>
          <p className="label-micro" style={{ color: "var(--theme-text-tertiary)", marginBottom: "var(--space-1)" }}>
            {overspent ? "Over budget" : "Fuel remaining"}
          </p>
          <p
            style={{
              fontFamily:         "var(--font-serif)",
              fontSize:           "clamp(var(--text-3xl), 2rem + 1.6vw, 3rem)",
              fontWeight:         "var(--weight-semibold)",
              fontVariantNumeric: "tabular-nums",
              color:              overspent ? "var(--color-danger)" : "var(--theme-text-primary)",
              lineHeight:         "var(--leading-none)",
              margin:             0,
              whiteSpace:         "nowrap",
            }}
          >
            <AnimatedNumber value={remainingLabel} />
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p
            style={{
              fontFamily:         "var(--font-serif)",
              fontSize:           "var(--text-2xl)",
              fontWeight:         "var(--weight-semibold)",
              fontVariantNumeric: "tabular-nums",
              color:              accentText,
              lineHeight:         "var(--leading-none)",
              margin:             "0 0 var(--space-1)",
            }}
          >
            {pct}%
          </p>
          <p className="label-micro" style={{ color: "var(--theme-text-tertiary)", margin: 0 }}>
            burned
          </p>
        </div>
      </div>

      {/* The tank — transform-scaled fill (never animate width; DNA M-06) */}
      <FuelTank consumed={consumed} fill={fill} overspent={overspent} />

      {/* Recharged · Spent · Remaining trio (standard + rich) */}
      {showTrio && (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap:                 "var(--space-2)",
            paddingTop:          "var(--space-1)",
          }}
        >
          <TankStat label="Recharged" value={formatCurrencyCompact(recharged)} color="var(--theme-text-primary)" />
          <TankStat label="Spent"     value={formatCurrencyCompact(gauge.spent)}     color="var(--theme-text-primary)" />
          <TankStat
            label="Remaining"
            value={remainingLabel}
            color={overspent ? "var(--color-danger)" : "var(--color-success-text)"}
          />
        </div>
      )}

      {/* Footnotes — campaign count + non-INR exclusion */}
      <p
        style={{
          fontSize:   "var(--text-2xs)",
          color:      "var(--theme-text-tertiary)",
          margin:     0,
          flexShrink: 0,
        }}
      >
        {formatCount(gauge.campaignCount)} campaign{gauge.campaignCount === 1 ? "" : "s"} with spend
        {gauge.hasNonInr ? " · balance is INR only" : ""}
      </p>
    </div>
  );
}

/**
 * The fuel tank bar. A rounded track with a transform-scaled fill (scaleX from
 * the left — never animates width, per the Never-Do list / DNA M-06). When
 * overspent the fill saturates to danger and a hatched overflow cap renders at
 * the right edge so the bar reads "past full", not silently pinned at 100%.
 */
function FuelTank({
  consumed,
  fill,
  overspent,
}: {
  consumed:  number;
  fill:      string;
  overspent: boolean;
}) {
  // Clamp the bar to the track; the % label above carries the true (possibly
  // >100%) value, so the visual never lies about being "full" yet stays bounded.
  const scaleX = Math.min(1, Math.max(0, consumed));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(consumed * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Ad budget consumed"
      style={{
        position:     "relative",
        width:        "100%",
        height:       14,
        background:   "var(--neu-well)",
        boxShadow:    "var(--neu-shadow-inset)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-full)",
        overflow:     "hidden",
      }}
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX }}
        transition={{ duration: SLOW_DURATION, ease: EASE_SPRING }}
        style={{
          width:           "100%",
          height:          "100%",
          background:      `linear-gradient(180deg, color-mix(in srgb, ${fill} 78%, white), ${fill})`,
          borderRadius:    "var(--radius-full)",
          transformOrigin: "left center",
        }}
      />
      {/* Overflow cap — a danger nub at the far right when past full */}
      {overspent && (
        <div
          style={{
            position:    "absolute",
            top:         0,
            right:       0,
            bottom:      0,
            width:       4,
            background:  "var(--color-danger-text)",
          }}
        />
      )}
    </div>
  );
}

function TankStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
      <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
        {label}
      </span>
      <span
        style={{
          fontFamily:         "var(--font-mono)",
          fontSize:           "var(--text-md)",
          fontWeight:         "var(--weight-semibold)",
          fontVariantNumeric: "tabular-nums",
          color,
          lineHeight:         "var(--leading-none)",
          whiteSpace:         "nowrap",
          overflow:           "hidden",
          textOverflow:       "ellipsis",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The manager's domain-scoped SPEND body (scope 'domain'). No gauge arc, no
 * recharge/remaining/consumed — only spend-derived figures. Hero = domain spend
 * total; below it the campaign count + cost-per-lead. A tertiary caption names
 * the pinned domain so it never reads as an org figure.
 */
function DomainSpendBody({
  gauge,
  domainLabel,
  isPending,
}: {
  gauge:       BudgetGaugeSummary;
  domainLabel: string;
  isPending:   boolean;
}) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        gap:            "var(--space-4)",
        flex:           1,
        minHeight:      0,
        justifyContent: "center",
        opacity:        isPending ? 0.5 : 1,
        transition:     "opacity 200ms",
      }}
    >
      {/* Hero — domain spend total */}
      <div style={{ minWidth: 0 }}>
        <p className="label-micro" style={{ color: "var(--theme-text-tertiary)", marginBottom: "var(--space-1)" }}>
          Spend this period
        </p>
        <p
          style={{
            fontFamily:         "var(--font-serif)",
            fontSize:           "clamp(var(--text-3xl), 2rem + 1.6vw, 3rem)",
            fontWeight:         "var(--weight-semibold)",
            fontVariantNumeric: "tabular-nums",
            color:              "var(--theme-text-primary)",
            lineHeight:         "var(--leading-none)",
            margin:             0,
            whiteSpace:         "nowrap",
          }}
        >
          <AnimatedNumber value={formatCurrencyCompact(gauge.spent)} />
        </p>
      </div>

      {/* Spend-derived trio: campaigns · leads · cost / lead */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap:                 "var(--space-2)",
          paddingTop:          "var(--space-1)",
        }}
      >
        <TankStat label="Campaigns" value={formatCount(gauge.campaignCount)} color="var(--theme-text-primary)" />
        <TankStat label="Leads"     value={formatCount(gauge.leadCount)}     color="var(--theme-text-primary)" />
        <TankStat
          label="Cost / Lead"
          value={gauge.costPerLead != null ? formatCurrency(Math.round(gauge.costPerLead)) : "—"}
          color="var(--theme-text-primary)"
        />
      </div>

      {/* Domain caption — this is domain-scoped spend, never the org tank. */}
      <p
        style={{
          fontSize:   "var(--text-2xs)",
          color:      "var(--theme-text-tertiary)",
          margin:     0,
          flexShrink: 0,
        }}
      >
        {domainLabel} campaign spend
      </p>
    </div>
  );
}

/**
 * No data to show. In org scope: no recharge to gauge against (surface the spend
 * so the card isn't blank when there is spend-with-no-recharge). In domain scope:
 * a manager's domain simply has no spend in the period (domainLabel names it).
 */
function EmptyGauge({ spent, domainLabel }: { spent: number; domainLabel?: string }) {
  const title = domainLabel
    ? `No spend in ${domainLabel} for this period.`
    : spent > 0
      ? "No recharge logged for this period."
      : "No spend or recharge yet.";
  return (
    <div
      style={{
        flex:           1,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "var(--space-2)",
        textAlign:      "center",
      }}
    >
      <Fuel style={{ width: 22, height: 22, strokeWidth: 1.5, color: "var(--theme-text-tertiary)" }} />
      <EmptyState title={title} style={{ padding: 0 }} />
      {spent > 0 && !domainLabel && (
        <p
          style={{
            fontFamily:         "var(--font-mono)",
            fontSize:           "var(--text-sm)",
            fontWeight:         "var(--weight-semibold)",
            fontVariantNumeric: "tabular-nums",
            color:              "var(--theme-text-secondary)",
            margin:             0,
          }}
        >
          {formatCurrencyCompact(spent)} spent
        </p>
      )}
    </div>
  );
}
