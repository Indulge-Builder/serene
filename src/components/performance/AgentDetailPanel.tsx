'use client';

import { useState, useEffect, useTransition } from 'react';
import { Avatar }                              from '@/components/ui/Avatar';
import { CallOutcomeBar }                      from './CallOutcomeBar';
import { getAgentDetailMetricsAction }         from '@/lib/actions/performance';
import { formatCurrency }                      from '@/lib/utils/numbers';
import { DOMAIN_LABELS }                       from '@/lib/constants/domains';
import { LEAD_STATUS_LABELS }                  from '@/lib/constants/lead-statuses';
import type { AgentRosterRow, AgentDetailMetrics } from '@/lib/types/index';
import type { AppDomain }                      from '@/lib/types/database';
import type { PerformancePeriod }              from '@/lib/services/performance-service';

// ─────────────────────────────────────────────
// Pipeline status colours (§16.4)
// ─────────────────────────────────────────────

const STATUS_FILL: Record<string, string> = {
  new:           'var(--color-neutral)',
  touched:       'var(--color-info)',
  in_discussion: 'var(--color-warning)',
  won:           'var(--color-success)',
  nurturing:     'var(--theme-accent)',
  lost:          'var(--color-danger)',
  junk:          'var(--color-neutral)',
};

const STATUS_ORDER = ['new', 'touched', 'in_discussion', 'nurturing', 'won', 'lost', 'junk'];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            "4px",
        padding:        "0 var(--space-2)",
      }}
    >
      <span
        style={{
          fontFamily:  "var(--font-serif)",
          fontSize:    "var(--text-xl)",
          fontWeight:  "var(--weight-light)",
          color:       "var(--theme-text-primary)",
          lineHeight:  "1",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily:    "var(--font-sans)",
          fontSize:      "var(--text-2xs)",
          fontWeight:    "var(--weight-medium)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color:         "var(--theme-text-tertiary)",
          textAlign:     "center",
          whiteSpace:    "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StatDivider() {
  return (
    <div
      style={{
        width:      "1px",
        alignSelf:  "stretch",
        background: "var(--theme-paper-border)",
        margin:     "4px 0",
        flexShrink: 0,
      }}
    />
  );
}

function PipelineBar({ breakdown }: { breakdown: { status: string; count: number }[] }) {
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle:  "italic",
          fontSize:   "var(--text-sm)",
          color:      "var(--theme-text-tertiary)",
          margin:     0,
        }}
      >
        No leads in this period.
      </p>
    );
  }

  const ordered = STATUS_ORDER
    .map((s) => ({ status: s, count: breakdown.find((b) => b.status === s)?.count ?? 0 }))
    .filter((b) => b.count > 0);

  return (
    <div>
      <div
        style={{
          display:      "flex",
          height:       "24px",
          borderRadius: "var(--radius-md)",
          overflow:     "hidden",
          gap:          "2px",
          marginBottom: "var(--space-3)",
        }}
      >
        {ordered.map(({ status, count }) => (
          <div
            key={status}
            title={`${LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status}: ${count}`}
            style={{
              width:      `${(count / total) * 100}%`,
              background: STATUS_FILL[status] ?? 'var(--color-neutral)',
              minWidth:   "4px",
              opacity:    0.85,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        {ordered.map(({ status, count }) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <span
              style={{
                display:      "inline-block",
                width:        "7px",
                height:       "7px",
                borderRadius: "var(--radius-xs)",
                background:   STATUS_FILL[status] ?? 'var(--color-neutral)',
                opacity:      0.85,
                flexShrink:   0,
              }}
            />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
              {LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status}
            </span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--theme-text-secondary)" }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AgentDetailPanel
// ─────────────────────────────────────────────

type Props = {
  agent:  AgentRosterRow;
  domain: AppDomain;
  period: PerformancePeriod;
};

export function AgentDetailPanel({ agent, domain, period }: Props) {
  const [metrics, setMetrics]   = useState<AgentDetailMetrics | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setMetrics(null);
    setError(null);
    startTransition(async () => {
      const result = await getAgentDetailMetricsAction(agent.id, domain, period);
      if (cancelled) return;
      if (result.error || !result.data) {
        setError(result.error ?? 'Failed to load.');
      } else {
        setMetrics(result.data);
      }
    });
    return () => { cancelled = true; };
  }, [agent.id, domain, period]);

  return (
    <div
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-6)",
        boxShadow:    "var(--shadow-1)",
        opacity:      isPending ? 0.6 : 1,
        transition:   "opacity var(--duration-base) var(--ease-in-out)",
      }}
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-4)",
          marginBottom: "var(--space-6)",
        }}
      >
        <Avatar src={agent.avatar_url} name={agent.full_name} size="xl" style={{ flexShrink: 0 }} />
        <div>
          <h2
            style={{
              fontFamily:  "var(--font-serif)",
              fontSize:    "var(--text-2xl)",
              fontWeight:  "var(--weight-light)",
              color:       "var(--theme-text-primary)",
              margin:      0,
              lineHeight:  "1.1",
            }}
          >
            {agent.full_name}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
            <span
              style={{
                display:       "inline-flex",
                alignItems:    "center",
                padding:       "2px 8px",
                borderRadius:  "var(--radius-full)",
                background:    "var(--theme-accent-surface)",
                color:         "var(--theme-accent)",
                fontFamily:    "var(--font-sans)",
                fontSize:      "var(--text-xs)",
                fontWeight:    "var(--weight-medium)",
              }}
            >
              {DOMAIN_LABELS[domain]}
            </span>
          </div>
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "stretch",
          borderBottom:   "1px solid var(--theme-paper-border)",
          paddingBottom:  "var(--space-5)",
          marginBottom:   "var(--space-5)",
          gap:            0,
        }}
      >
        <StatItem label="Calls Today"      value={metrics ? String(metrics.callsToday)         : '—'} />
        <StatDivider />
        <StatItem label="New Leads"        value={metrics ? String(metrics.newLeadsAttended)    : '—'} />
        <StatDivider />
        <StatItem label="Follow-ups"       value={metrics ? String(metrics.followUpsCompleted)  : '—'} />
        <StatDivider />
        <StatItem label="Won"              value={metrics ? String(metrics.leadsWon)             : '—'} />
        <StatDivider />
        <StatItem label="Revenue"          value={metrics ? formatCurrency(metrics.totalDealAmount) : '—'} />
      </div>

      {/* ── Revenue deal type pills ─────────────────────────────────────── */}
      {metrics && metrics.dealTypeBreakdown.length > 0 && (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <p className="label-micro" style={{ marginBottom: "var(--space-3)" }}>Deal Breakdown</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {metrics.dealTypeBreakdown.map(({ dealType, count, totalAmount }) => (
              <span
                key={dealType}
                style={{
                  display:      "inline-flex",
                  alignItems:   "center",
                  gap:          "4px",
                  padding:      "3px 10px",
                  borderRadius: "var(--radius-full)",
                  background:   "var(--theme-paper-subtle)",
                  border:       "1px solid var(--theme-paper-border)",
                  fontFamily:   "var(--font-sans)",
                  fontSize:     "var(--text-xs)",
                  color:        "var(--theme-text-secondary)",
                }}
              >
                <span style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
                  {dealType}
                </span>
                <span style={{ color: "var(--theme-text-tertiary)" }}>·</span>
                <span>{count}</span>
                <span style={{ color: "var(--theme-text-tertiary)" }}>·</span>
                <span>{formatCurrency(totalAmount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Pipeline status bar ─────────────────────────────────────────── */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <p className="label-micro" style={{ marginBottom: "var(--space-3)" }}>Lead Pipeline</p>
        {metrics ? (
          <PipelineBar breakdown={metrics.pipelineBreakdown} />
        ) : (
          <div className="skeleton" style={{ width: "100%", height: "24px", borderRadius: "var(--radius-md)" }} />
        )}
      </div>

      {/* ── Call outcome bar ────────────────────────────────────────────── */}
      {metrics ? (
        <CallOutcomeBar breakdown={metrics.callOutcomeBreakdown} />
      ) : (
        <div className="skeleton" style={{ width: "100%", height: "80px", borderRadius: "var(--radius-md)" }} />
      )}

      {error && (
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--color-danger-text)", marginTop: "var(--space-4)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
