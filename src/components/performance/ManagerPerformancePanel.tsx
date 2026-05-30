'use client';

import { useState }               from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar }                  from '@/components/ui/Avatar';
import { BASE_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { AgentDetailPanel }        from './AgentDetailPanel';
import type { AgentRosterRow, AgentDetailMetrics } from '@/lib/types/index';
import type { AppDomain }          from '@/lib/types/database';
import type { PerformancePeriod }  from '@/lib/services/performance-service';

// ─────────────────────────────────────────────
// Conversion rate colour coding (§16.4)
// ─────────────────────────────────────────────

function convRatePillStyle(rate: number | null): React.CSSProperties {
  if (rate === null) {
    return {
      background: "var(--color-neutral-light)",
      color:      "var(--color-neutral-text)",
    };
  }
  if (rate >= 40) {
    return {
      background: "var(--color-success-light)",
      color:      "var(--color-success-text)",
    };
  }
  if (rate >= 20) {
    return {
      background: "var(--color-warning-light)",
      color:      "var(--color-warning-text)",
    };
  }
  return {
    background: "var(--color-danger-light)",
    color:      "var(--color-danger-text)",
  };
}

// ─────────────────────────────────────────────
// Agent roster card
// ─────────────────────────────────────────────

function AgentCard({
  agent,
  isSelected,
  onClick,
}: {
  agent:      AgentRosterRow;
  isSelected: boolean;
  onClick:    () => void;
}) {
  const pillStyle = convRatePillStyle(agent.conversionRate);

  return (
    <button
      onClick={onClick}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "var(--space-3)",
        padding:       "var(--space-3) var(--space-3)",
        borderRadius:  "var(--radius-md)",
        background:    isSelected ? "var(--theme-paper-subtle)" : "transparent",
        border:        "none",
        borderLeft:    isSelected ? "3px solid var(--theme-accent)" : "3px solid transparent",
        cursor:        "pointer",
        width:         "100%",
        textAlign:     "left",
        transition:    "background-color var(--duration-fast) var(--ease-in-out)",
        position:      "relative",
      }}
    >
      <Avatar
        src={agent.avatar_url}
        name={agent.full_name}
        size="md"
        style={{ flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily:   "var(--font-sans)",
            fontSize:     "var(--text-sm)",
            fontWeight:   "var(--weight-semibold)",
            color:        "var(--theme-text-primary)",
            margin:       0,
            whiteSpace:   "nowrap",
            overflow:     "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {agent.full_name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "3px" }}>
          <span
            style={{
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-2xs)",
              color:        "var(--theme-text-tertiary)",
            }}
          >
            {agent.totalLeads} lead{agent.totalLeads !== 1 ? 's' : ''}
          </span>
          <span
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              padding:      "1px 6px",
              borderRadius: "var(--radius-full)",
              fontSize:     "var(--text-2xs)",
              fontWeight:   "var(--weight-medium)",
              fontFamily:   "var(--font-sans)",
              ...pillStyle,
            }}
          >
            {agent.conversionRate !== null
              ? `${Math.round(agent.conversionRate)}%`
              : '—'}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
// ManagerPerformancePanel
// ─────────────────────────────────────────────

type Props = {
  agentRoster:           AgentRosterRow[];
  domain:                AppDomain;
  period:                PerformancePeriod;
  initialAgentId?:       string | null;
  initialDetailMetrics?: AgentDetailMetrics | null;
};

export function ManagerPerformancePanel({
  agentRoster,
  domain,
  period,
  initialAgentId = null,
  initialDetailMetrics = null,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAgentId ?? (agentRoster.length > 0 ? agentRoster[0].id : null),
  );

  const selectedAgent = agentRoster.find((a) => a.id === selectedId) ?? null;

  if (agentRoster.length === 0) {
    return (
      <div
        style={{
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-lg)",
          padding:      "var(--space-12) var(--space-6)",
          textAlign:    "center",
          boxShadow:    "var(--shadow-1)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   "var(--text-lg)",
            fontWeight: "var(--weight-light)",
            color:      "var(--theme-text-tertiary)",
            margin:     0,
          }}
        >
          No agents in this domain yet.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap:     "var(--space-6)",
        alignItems: "flex-start",
      }}
    >
      {/* ── Left column: agent roster ──────────────────────────────────── */}
      <div
        style={{
          width:         "280px",
          flexShrink:    0,
          background:    "var(--theme-paper)",
          border:        "1px solid var(--theme-paper-border)",
          borderRadius:  "var(--radius-lg)",
          padding:       "var(--space-3)",
          boxShadow:     "var(--shadow-1)",
        }}
      >
        <p
          className="label-micro"
          style={{ paddingLeft: "var(--space-3)", paddingBottom: "var(--space-2)" }}
        >
          Agents
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {agentRoster.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedId}
              onClick={() => setSelectedId(agent.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Right column: agent detail panel ──────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <AnimatePresence mode="wait">
          {selectedAgent ? (
            <motion.div
              key={selectedAgent.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            >
              <AgentDetailPanel
                agent={selectedAgent}
                domain={domain}
                period={period}
                initialAgentId={initialAgentId ?? undefined}
                initialData={
                  selectedAgent.id === (initialAgentId ?? null)
                    ? (initialDetailMetrics ?? undefined)
                    : undefined
                }
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
