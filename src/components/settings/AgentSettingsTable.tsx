"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { APP_DOMAINS, DOMAIN_LABELS } from "@/lib/constants/domains";
import { Toggle } from "@/components/ui/Toggle";
import { toggleAgentRouting, setAgentShiftAction } from "@/lib/actions/agent-routing";
import { toast } from "@/lib/toast";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { AgentRosterRow, UserRole, AppDomain } from "@/lib/types/database";

interface AgentSettingsTableProps {
  initialRoster: AgentRosterRow[];
  callerRole:    UserRole;
  callerDomain:  AppDomain;
}

interface ShiftState {
  start: string;
  end:   string;
  error: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function computeActiveHours(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const totalMin = (eh! * 60 + em!) - (sh! * 60 + sm!);
  if (totalMin <= 0) return "—";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function AgentSettingsTable({
  initialRoster,
  callerRole,
  callerDomain,
}: AgentSettingsTableProps) {
  const isPrivileged     = callerRole === "admin" || callerRole === "founder";
  const showDomainFilter = isPrivileged;

  const [roster, setRoster]       = useState<AgentRosterRow[]>(initialRoster);
  const [activeDomain, setActiveDomain] = useState<AppDomain | "all">("all");
  const [pendingIds, setPendingIds]   = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds]     = useState<Set<string>>(new Set());
  const [, startTransition]           = useTransition();

  const [shifts, setShifts] = useState<Record<string, ShiftState>>(() => {
    const map: Record<string, ShiftState> = {};
    for (const agent of initialRoster) {
      map[agent.id] = {
        start: agent.shift_start ?? "",
        end:   agent.shift_end ?? "",
        error: null,
      };
    }
    return map;
  });

  const presentDomains = Array.from(
    new Set(roster.map((r) => r.domain))
  ).sort() as AppDomain[];

  const filtered = activeDomain === "all"
    ? roster
    : roster.filter((r) => r.domain === activeDomain);

  // ── Assignment toggle ─────────────────────────────────────────────────────

  function handleToggle(agent: AgentRosterRow) {
    if (pendingIds.has(agent.id)) return;

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
        setRoster((prev) =>
          prev.map((r) =>
            r.id === agent.id ? { ...r, routing_is_active: agent.routing_is_active } : r
          )
        );
        toast.danger("Couldn't update pool status", { message: result.error });
      }
    });
  }

  // ── Shift editing ─────────────────────────────────────────────────────────

  function updateField(agentId: string, field: "start" | "end", value: string) {
    setShifts((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId]!, [field]: value, error: null },
    }));
  }

  function handleBlur(agent: AgentRosterRow) {
    const state = shifts[agent.id];
    if (!state) return;
    const { start, end } = state;

    if (!start && !end) { saveShift(agent.id, null, null); return; }

    if ((start && !end) || (!start && end)) {
      setShifts((prev) => ({
        ...prev,
        [agent.id]: { ...prev[agent.id]!, error: "Set both times to save" },
      }));
      return;
    }

    if (!TIME_REGEX.test(start) || !TIME_REGEX.test(end)) {
      setShifts((prev) => ({
        ...prev,
        [agent.id]: { ...prev[agent.id]!, error: "Use HH:MM format" },
      }));
      return;
    }

    if (end <= start) {
      setShifts((prev) => ({
        ...prev,
        [agent.id]: { ...prev[agent.id]!, error: "End must be after start" },
      }));
      return;
    }

    saveShift(agent.id, start, end);
  }

  function handleClear(agentId: string) {
    setShifts((prev) => ({
      ...prev,
      [agentId]: { start: "", end: "", error: null },
    }));
    saveShift(agentId, null, null);
  }

  function saveShift(agentId: string, start: string | null, end: string | null) {
    if (savingIds.has(agentId)) return;
    setSavingIds((prev) => new Set(prev).add(agentId));

    startTransition(async () => {
      const result = await setAgentShiftAction({ agentId, shiftStart: start, shiftEnd: end });
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
      if (result.error) {
        toast.danger("Couldn't save shift", { message: result.error });
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const timeInputStyle: React.CSSProperties = {
    width:        88,
    height:       32,
    padding:      "0 var(--space-2)",
    border:       "1px solid var(--theme-paper-border)",
    borderRadius: "var(--radius-sm)",
    background:   "var(--theme-paper-subtle)",
    color:        "var(--theme-text-primary)",
    fontFamily:   "var(--font-sans)",
    fontSize:     "var(--text-sm)",
    fontWeight:   "var(--weight-normal)",
    outline:      "none",
    caretColor:   "var(--theme-accent)",
  };

  return (
    <div>
      {/* Domain filter — admin/founder only, only when multiple domains present */}
      {showDomainFilter && presentDomains.length > 1 && (
        <div
          style={{
            display:      "flex",
            flexWrap:     "wrap",
            gap:          "var(--space-2)",
            marginBottom: "var(--space-6)",
          }}
        >
          {(["all", ...presentDomains] as Array<"all" | AppDomain>).map((d) => (
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
              {d === "all" ? "All" : (DOMAIN_LABELS[d] ?? d)}
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

      {/* Table */}
      {filtered.length > 0 && (
        <div
          style={{
            background:   "var(--theme-paper)",
            border:       "1px solid var(--theme-paper-border)",
            borderRadius: "var(--radius-lg)",
            overflow:     "hidden",
            boxShadow:    "var(--shadow-1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: isPrivileged
                ? "1fr 140px 96px 96px 120px 120px 36px"
                : "1fr 96px 96px 120px 120px 36px",
              gap:          "var(--space-4)",
              padding:      "var(--space-3) var(--space-5)",
              borderBottom: "1px solid var(--theme-paper-border)",
              background:   "var(--theme-paper-subtle)",
              alignItems:   "center",
            }}
          >
            {[
              "Agent",
              ...(isPrivileged ? ["Domain"] : []),
              "Shift Start",
              "Shift End",
              "Active Hours",
              "In Pool",
              "",
            ].map((col) => (
              <span
                key={col}
                className="label-micro"
                style={{ color: "var(--theme-text-tertiary)" }}
              >
                {col}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((agent, i) => {
            const state     = shifts[agent.id] ?? { start: "", end: "", error: null };
            const isSaving  = savingIds.has(agent.id);
            const isPending = pendingIds.has(agent.id);
            const hasBoth   = !!state.start && !!state.end;
            const hasEither = !!state.start || !!state.end;
            const activeHours = hasBoth
              ? computeActiveHours(state.start, state.end)
              : null;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: ENTER_DURATION,
                  delay:    i * 0.035,
                  ease:     EASE_OUT_EXPO,
                }}
                style={{
                  display:             "grid",
                  gridTemplateColumns: isPrivileged
                    ? "1fr 140px 96px 96px 120px 120px 36px"
                    : "1fr 96px 96px 120px 120px 36px",
                  gap:          "var(--space-4)",
                  padding:      "var(--space-4) var(--space-5)",
                  borderBottom: i < filtered.length - 1
                    ? "1px solid var(--theme-paper-border)"
                    : "none",
                  alignItems:   "center",
                  opacity:      (isSaving || isPending) ? 0.6 : 1,
                  transition:   "opacity var(--duration-base) var(--ease-in-out)",
                }}
              >
                {/* Agent name + avatar */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width:          32,
                      height:         32,
                      borderRadius:   "var(--radius-sm)",
                      flexShrink:     0,
                      overflow:       "hidden",
                      background:     "var(--theme-accent-surface)",
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      fontSize:       "var(--text-xs)",
                      fontWeight:     "var(--weight-semibold)",
                      color:          "var(--theme-accent)",
                      fontFamily:     "var(--font-sans)",
                    }}
                  >
                    {agent.avatar_url ? (
                      <img
                        src={agent.avatar_url}
                        alt={agent.full_name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />
                    ) : (
                      getInitials(agent.full_name)
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily:   "var(--font-sans)",
                        fontSize:     "var(--text-sm)",
                        fontWeight:   "var(--weight-medium)",
                        color:        "var(--theme-text-primary)",
                        margin:       0,
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}
                    >
                      {agent.full_name}
                    </p>
                    {agent.job_title && (
                      <p
                        style={{
                          fontFamily:   "var(--font-sans)",
                          fontSize:     "var(--text-xs)",
                          color:        "var(--theme-text-tertiary)",
                          margin:       "1px 0 0",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {agent.job_title}
                      </p>
                    )}
                    {state.error && (
                      <p
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize:   "var(--text-xs)",
                          color:      "var(--color-danger-text)",
                          margin:     "2px 0 0",
                        }}
                      >
                        {state.error}
                      </p>
                    )}
                    {!state.error && !hasBoth && hasEither && (
                      <p
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize:   "var(--text-xs)",
                          color:      "var(--theme-text-tertiary)",
                          margin:     "2px 0 0",
                        }}
                      >
                        Set both times to save
                      </p>
                    )}
                    {agent.is_on_leave && (
                      <span
                        style={{
                          display:       "inline-block",
                          marginTop:     "var(--space-1)",
                          padding:       "2px var(--space-2)",
                          borderRadius:  "var(--radius-full)",
                          background:    "var(--color-warning-light)",
                          color:         "var(--color-warning-text)",
                          fontFamily:    "var(--font-sans)",
                          fontSize:      "var(--text-2xs)",
                          fontWeight:    "var(--weight-semibold)",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        On Leave
                      </span>
                    )}
                  </div>
                </div>

                {/* Domain (privileged only) */}
                {isPrivileged && (
                  <span
                    style={{
                      fontFamily:   "var(--font-sans)",
                      fontSize:     "var(--text-xs)",
                      color:        "var(--theme-text-secondary)",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                    }}
                  >
                    {DOMAIN_LABELS[agent.domain] ?? agent.domain}
                  </span>
                )}

                {/* Shift Start */}
                <input
                  type="time"
                  value={state.start}
                  disabled={isSaving}
                  onChange={(e) => updateField(agent.id, "start", e.target.value)}
                  onBlur={() => handleBlur(agent)}
                  style={timeInputStyle}
                />

                {/* Shift End */}
                <input
                  type="time"
                  value={state.end}
                  disabled={isSaving}
                  onChange={(e) => updateField(agent.id, "end", e.target.value)}
                  onBlur={() => handleBlur(agent)}
                  style={timeInputStyle}
                />

                {/* Active Hours */}
                <span
                  style={{
                    fontFamily:  "var(--font-sans)",
                    fontSize:    "var(--text-sm)",
                    color:       hasBoth ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
                    whiteSpace:  "nowrap",
                  }}
                >
                  {activeHours ?? "—"}
                </span>

                {/* Assignment toggle */}
                <div>
                  <Toggle
                    size="sm"
                    checked={agent.routing_is_active}
                    onChange={() => handleToggle(agent)}
                    disabled={isPending}
                    label={agent.routing_is_active ? "Active" : "Inactive"}
                  />
                </div>

                {/* Clear shift */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {hasEither ? (
                    <button
                      type="button"
                      onClick={() => handleClear(agent.id)}
                      disabled={isSaving}
                      title="Clear shift"
                      style={{
                        width:          28,
                        height:         28,
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        border:         "1px solid var(--theme-paper-border)",
                        borderRadius:   "var(--radius-sm)",
                        background:     "transparent",
                        color:          "var(--theme-text-tertiary)",
                        cursor:         "pointer",
                        transition:     "var(--transition-hover)",
                        padding:        0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color       = "var(--color-danger-text)";
                        e.currentTarget.style.borderColor = "var(--color-danger-text)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color       = "var(--theme-text-tertiary)";
                        e.currentTarget.style.borderColor = "var(--theme-paper-border)";
                      }}
                    >
                      <X size={12} strokeWidth={1.5} />
                    </button>
                  ) : (
                    <span style={{ width: 28 }} />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
