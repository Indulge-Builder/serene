"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { APP_DOMAINS, DOMAIN_LABELS } from "@/lib/constants/domains";
import { Toggle } from "@/components/ui/Toggle";
import { toggleAgentRouting } from "@/lib/actions/agent-routing";
import { toast } from "@/lib/toast";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { AgentRosterRow, UserRole, AppDomain } from "@/lib/types/database";

interface AgentRosterTabProps {
  initialRoster: AgentRosterRow[];
  callerRole:    UserRole;
  callerDomain:  AppDomain;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function AgentRosterTab({
  initialRoster,
  callerRole,
  callerDomain,
}: AgentRosterTabProps) {
  const isPrivileged    = callerRole === "admin" || callerRole === "founder";
  const showDomainFilter = isPrivileged;

  const [roster, setRoster]           = useState<AgentRosterRow[]>(initialRoster);
  const [activeDomain, setActiveDomain] = useState<AppDomain | "all">("all");
  const [pendingIds, setPendingIds]   = useState<Set<string>>(new Set());
  const [, startTransition]           = useTransition();

  const presentDomains = Array.from(
    new Set(roster.map((r) => r.domain))
  ).sort() as AppDomain[];

  const filtered = activeDomain === "all"
    ? roster
    : roster.filter((r) => r.domain === activeDomain);

  function handleToggle(agent: AgentRosterRow) {
    if (pendingIds.has(agent.id)) return;

    // Optimistic update
    setRoster((prev) =>
      prev.map((r) =>
        r.id === agent.id ? { ...r, routing_is_active: !r.routing_is_active } : r
      )
    );
    setPendingIds((prev) => new Set(prev).add(agent.id));

    const fd = new FormData();
    fd.set("agent_id",  agent.id);
    fd.set("is_active", String(!agent.routing_is_active));

    startTransition(async () => {
      const result = await toggleAgentRouting(fd);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });

      if (result.error) {
        // Revert
        setRoster((prev) =>
          prev.map((r) =>
            r.id === agent.id ? { ...r, routing_is_active: agent.routing_is_active } : r
          )
        );
        toast.danger("Couldn't update pool status", { message: result.error });
      }
    });
  }

  return (
    <div>
      {/* Domain filter — admin/founder only */}
      {showDomainFilter && presentDomains.length > 1 && (
        <div
          style={{
            display:    "flex",
            flexWrap:   "wrap",
            gap:        "var(--space-2)",
            marginBottom: "var(--space-6)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveDomain("all")}
            style={{
              padding:      "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-full)",
              border:       "1px solid var(--theme-paper-border)",
              background:   activeDomain === "all" ? "var(--theme-accent)" : "transparent",
              color:        activeDomain === "all" ? "var(--theme-accent-fg)" : "var(--theme-text-secondary)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-xs)",
              fontWeight:   "var(--weight-medium)",
              cursor:       "pointer",
              transition:   "var(--transition-hover)",
            }}
          >
            All
          </button>
          {presentDomains.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setActiveDomain(d)}
              style={{
                padding:      "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-full)",
                border:       "1px solid var(--theme-paper-border)",
                background:   activeDomain === d ? "var(--theme-accent)" : "transparent",
                color:        activeDomain === d ? "var(--theme-accent-fg)" : "var(--theme-text-secondary)",
                fontFamily:   "var(--font-sans)",
                fontSize:     "var(--text-xs)",
                fontWeight:   "var(--weight-medium)",
                cursor:       "pointer",
                transition:   "var(--transition-hover)",
              }}
            >
              {DOMAIN_LABELS[d] ?? d}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   "var(--text-lg)",
            color:      "var(--theme-text-tertiary)",
            marginTop:  "var(--space-12)",
            textAlign:  "center",
          }}
        >
          No agents found in this domain.
        </p>
      )}

      {/* Agent card grid */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap:                 "var(--space-4)",
        }}
      >
        {filtered.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: ENTER_DURATION,
              delay:    i * 0.04,
              ease:     EASE_OUT_EXPO,
            }}
            style={{
              background:   "var(--theme-paper)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              padding:      "var(--space-4) var(--space-5)",
              boxShadow:    "var(--shadow-1)",
              opacity:      agent.routing_is_active ? 1 : 0.55,
              transition:   "opacity var(--duration-base) var(--ease-in-out)",
            }}
          >
            <div
              style={{
                display:    "flex",
                alignItems: "flex-start",
                gap:        "var(--space-3)",
              }}
            >
              {/* Avatar */}
              <div
                aria-hidden="true"
                style={{
                  width:        40,
                  height:       40,
                  borderRadius: "var(--radius-sm)",
                  flexShrink:   0,
                  overflow:     "hidden",
                  background:   "var(--theme-accent-surface)",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  fontSize:     "var(--text-sm)",
                  fontWeight:   "var(--weight-semibold)",
                  color:        "var(--theme-accent)",
                  fontFamily:   "var(--font-sans)",
                }}
              >
                {agent.avatar_url ? (
                  <img
                    src={agent.avatar_url}
                    alt={agent.full_name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  getInitials(agent.full_name)
                )}
              </div>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-sm)",
                    fontWeight:   "var(--weight-semibold)",
                    color:        "var(--theme-text-primary)",
                    margin:       0,
                    lineHeight:   "var(--leading-snug)",
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}
                >
                  {agent.full_name}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-text-tertiary)",
                    margin:     "var(--space-1) 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  {agent.job_title ? `${agent.job_title} · ` : ""}
                  {isPrivileged ? (DOMAIN_LABELS[agent.domain] ?? agent.domain) : ""}
                </p>

                {/* Badges */}
                {agent.is_on_leave && (
                  <span
                    style={{
                      display:      "inline-block",
                      marginTop:    "var(--space-2)",
                      padding:      "2px var(--space-2)",
                      borderRadius: "var(--radius-full)",
                      background:   "var(--color-warning-bg)",
                      color:        "var(--color-warning-text)",
                      fontFamily:   "var(--font-sans)",
                      fontSize:     "var(--text-2xs)",
                      fontWeight:   "var(--weight-semibold)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    On Leave
                  </span>
                )}
              </div>

              {/* Toggle */}
              <div style={{ flexShrink: 0 }}>
                <Toggle
                  size="sm"
                  checked={agent.routing_is_active}
                  onChange={() => handleToggle(agent)}
                  disabled={pendingIds.has(agent.id)}
                  label={agent.routing_is_active ? "In Pool" : "Out of Pool"}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
