"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { setAgentShiftAction } from "@/lib/actions/agent-routing";
import { toast } from "@/lib/toast";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { AgentRosterRow, UserRole, AppDomain } from "@/lib/types/database";

interface AgentShiftsTabProps {
  initialRoster: AgentRosterRow[];
  callerRole:    UserRole;
  callerDomain:  AppDomain;
}

interface ShiftState {
  start: string;
  end:   string;
  error: string | null;
}

function computeActiveHours(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const totalMin = (eh! * 60 + em!) - (sh! * 60 + sm!);
  if (totalMin <= 0) return "—";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const label = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return `${start} – ${end} (${label})`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function AgentShiftsTab({
  initialRoster,
  callerRole,
  callerDomain,
}: AgentShiftsTabProps) {
  const isPrivileged     = callerRole === "admin" || callerRole === "founder";
  const showDomainFilter = isPrivileged;

  // Local shift state per agent — tracks in-progress edits
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

  const [activeDomain, setActiveDomain] = useState<AppDomain | "all">("all");
  const [savingIds, setSavingIds]       = useState<Set<string>>(new Set());
  const [, startTransition]             = useTransition();

  const presentDomains = Array.from(
    new Set(initialRoster.map((r) => r.domain))
  ).sort() as AppDomain[];

  const filtered = activeDomain === "all"
    ? initialRoster
    : initialRoster.filter((r) => r.domain === activeDomain);

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

    // Both empty → clear
    if (!start && !end) {
      saveShift(agent.id, null, null);
      return;
    }

    // Only one filled → show hint, don't save
    if ((start && !end) || (!start && end)) {
      setShifts((prev) => ({
        ...prev,
        [agent.id]: { ...prev[agent.id]!, error: "Set both times to save" },
      }));
      return;
    }

    // Both filled — validate format
    if (!TIME_REGEX.test(start) || !TIME_REGEX.test(end)) {
      setShifts((prev) => ({
        ...prev,
        [agent.id]: { ...prev[agent.id]!, error: "Use HH:MM format" },
      }));
      return;
    }

    // shiftEnd must be > shiftStart
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
      const result = await setAgentShiftAction({
        agentId,
        shiftStart: start,
        shiftEnd:   end,
      });

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

  const timeInputStyle: React.CSSProperties = {
    width:        90,
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
          {/* Table header */}
          <div
            style={{
              display:          "grid",
              gridTemplateColumns: isPrivileged
                ? "1fr 160px 100px 100px 1fr 40px"
                : "1fr 100px 100px 1fr 40px",
              gap:              "var(--space-4)",
              padding:          "var(--space-3) var(--space-5)",
              borderBottom:     "1px solid var(--theme-paper-border)",
              background:       "var(--theme-paper-subtle)",
            }}
          >
            {["Agent", ...(isPrivileged ? ["Domain"] : []), "Start", "End", "Active Hours", ""].map(
              (col) => (
                <span
                  key={col}
                  className="label-micro"
                  style={{ color: "var(--theme-text-tertiary)" }}
                >
                  {col}
                </span>
              )
            )}
          </div>

          {/* Rows */}
          {filtered.map((agent, i) => {
            const state   = shifts[agent.id] ?? { start: "", end: "", error: null };
            const isSaving = savingIds.has(agent.id);
            const hasBoth  = !!state.start && !!state.end;
            const hasEither = !!state.start || !!state.end;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: ENTER_DURATION,
                  delay:    i * 0.04,
                  ease:     EASE_OUT_EXPO,
                }}
                style={{
                  display:          "grid",
                  gridTemplateColumns: isPrivileged
                    ? "1fr 160px 100px 100px 1fr 40px"
                    : "1fr 100px 100px 1fr 40px",
                  gap:              "var(--space-4)",
                  padding:          "var(--space-4) var(--space-5)",
                  borderBottom:     i < filtered.length - 1
                    ? "1px solid var(--theme-paper-border)"
                    : "none",
                  alignItems:       "center",
                  opacity:          isSaving ? 0.6 : 1,
                  transition:       "opacity var(--duration-base) var(--ease-in-out)",
                }}
              >
                {/* Agent name + avatar */}
                <div
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        "var(--space-3)",
                    minWidth:   0,
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width:        32,
                      height:       32,
                      borderRadius: "var(--radius-sm)",
                      flexShrink:   0,
                      overflow:     "hidden",
                      background:   "var(--theme-accent-surface)",
                      display:      "flex",
                      alignItems:   "center",
                      justifyContent: "center",
                      fontSize:     "var(--text-xs)",
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
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-sm)",
                    color:      hasBoth ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
                  }}
                >
                  {hasBoth
                    ? computeActiveHours(state.start, state.end)
                    : "—"}
                </span>

                {/* Clear */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {hasEither ? (
                    <button
                      type="button"
                      onClick={() => handleClear(agent.id)}
                      disabled={isSaving}
                      title="Clear shift"
                      style={{
                        width:        28,
                        height:       28,
                        display:      "flex",
                        alignItems:   "center",
                        justifyContent: "center",
                        border:       "1px solid var(--theme-paper-border)",
                        borderRadius: "var(--radius-sm)",
                        background:   "transparent",
                        color:        "var(--theme-text-tertiary)",
                        cursor:       "pointer",
                        fontSize:     "var(--text-xs)",
                        fontFamily:   "var(--font-sans)",
                        transition:   "var(--transition-hover)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color      = "var(--color-danger-text)";
                        e.currentTarget.style.borderColor = "var(--color-danger-text)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color       = "var(--theme-text-tertiary)";
                        e.currentTarget.style.borderColor  = "var(--theme-paper-border)";
                      }}
                    >
                      ×
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
