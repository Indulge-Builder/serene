"use client";

import { useState, useTransition, useMemo } from "react";
import { motion } from "framer-motion";
import { X, SlidersHorizontal } from "lucide-react";
import { DOMAIN_LABELS, compareDomainDisplayOrder } from "@/lib/constants/domains";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TimePicker } from "@/components/ui/TimePicker";
import { Toggle } from "@/components/ui/Toggle";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { toggleAgentRouting, setAgentShiftAction } from "@/lib/actions/agent-routing";
import { toast } from "@/lib/toast";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";
import { normalizeTimeHHMM } from "@/lib/utils/dates";
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

const POOL_FILTER_ITEMS = [
  { id: "in_pool",  label: "In pool" },
  { id: "out_pool", label: "Out of pool" },
] as const;

export function AgentSettingsTable({
  initialRoster,
  callerRole,
  callerDomain,
}: AgentSettingsTableProps) {
  const isPrivileged     = callerRole === "admin" || callerRole === "founder";
  const showDomainFilter = isPrivileged;

  const [roster, setRoster]           = useState<AgentRosterRow[]>(initialRoster);
  const [search, setSearch]           = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [poolFilter, setPoolFilter]   = useState<string>("all");
  const [pendingIds, setPendingIds]  = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds]    = useState<Set<string>>(new Set());
  const [, startTransition]          = useTransition();

  const [shifts, setShifts] = useState<Record<string, ShiftState>>(() => {
    const map: Record<string, ShiftState> = {};
    for (const agent of initialRoster) {
      map[agent.id] = {
        start: normalizeTimeHHMM(agent.shift_start) ?? "",
        end:   normalizeTimeHHMM(agent.shift_end) ?? "",
        error: null,
      };
    }
    return map;
  });

  const presentDomains = useMemo(
    () =>
      Array.from(new Set(roster.map((r) => r.domain))).sort(
        compareDomainDisplayOrder,
      ) as AppDomain[],
    [roster],
  );

  const domainFilterItems = useMemo(
    () =>
      presentDomains.map((d) => ({
        id:    d,
        label: DOMAIN_LABELS[d] ?? d,
      })),
    [presentDomains],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return roster.filter((r) => {
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (poolFilter === "in_pool" && !r.routing_is_active) return false;
      if (poolFilter === "out_pool" && r.routing_is_active) return false;
      if (q) {
        const haystack = `${r.full_name} ${r.job_title ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [roster, search, domainFilter, poolFilter]);

  const activeCount =
    (search.trim() ? 1 : 0) +
    (domainFilter !== "all" ? 1 : 0) +
    (poolFilter !== "all" ? 1 : 0);

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

  function handleTimeChange(agent: AgentRosterRow, field: "start" | "end", value: string | null) {
    const currentState = shifts[agent.id] ?? { start: "", end: "", error: null };
    const normalised = value ? normalizeTimeHHMM(value) : null;
    const next = {
      start: field === "start" ? (normalised ?? "") : currentState.start,
      end:   field === "end"   ? (normalised ?? "") : currentState.end,
    };
    setShifts((prev) => ({
      ...prev,
      [agent.id]: { ...next, error: null },
    }));
    validateAndSave(agent, next.start, next.end);
  }

  function validateAndSave(agent: AgentRosterRow, start: string, end: string) {
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

  return (
    <div>
      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-3)",
          padding:      "var(--space-4) var(--space-5)",
          marginBottom: "var(--space-4)",
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-md)",
          boxShadow:    "var(--shadow-1)",
          flexWrap:     "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <SlidersHorizontal
            style={{ width: "1rem", height: "1rem", color: "var(--theme-text-tertiary)", strokeWidth: 1.5 }}
          />
          {activeCount > 0 && (
            <span
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                minWidth:       "1.25rem",
                height:         "1.25rem",
                padding:        "0 0.25rem",
                borderRadius:   "var(--radius-full)",
                background:     "var(--theme-accent)",
                color:          "var(--theme-accent-fg)",
                fontSize:       "10px",
                fontWeight:     "var(--weight-medium)",
                lineHeight:     1,
              }}
            >
              {activeCount}
            </span>
          )}
        </div>

        <div style={{ flex: "1 1 200px", minWidth: "160px" }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name or title…"
            size="sm"
          />
        </div>

        {showDomainFilter && presentDomains.length > 1 && (
          <FilterDropdown
            label="Domain"
            items={domainFilterItems}
            selected={domainFilter !== "all" ? [domainFilter] : []}
            onChange={(next) => setDomainFilter(next[0] ?? "all")}
          />
        )}

        <FilterDropdown
          label="Pool"
          items={[...POOL_FILTER_ITEMS]}
          selected={poolFilter !== "all" ? [poolFilter] : []}
          onChange={(next) => setPoolFilter(next[0] ?? "all")}
        />

        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            whiteSpace: "nowrap",
            marginLeft: "auto",
          }}
        >
          {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
        </span>
      </div>

      {/* ── Empty state ────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div style={{ padding: "var(--space-20) var(--space-8)", textAlign: "center" }}>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-xl)",
              color:      "var(--theme-text-secondary)",
              margin:     "0 0 var(--space-2)",
            }}
          >
            {roster.length === 0 ? "No agents in the roster yet." : "No agents match your filters."}
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
            }}
          >
            {roster.length === 0
              ? "Agents appear here once they are added to your domain."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      )}

      {/* ── Card list ──────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {filtered.map((agent, i) => {
            const state     = shifts[agent.id] ?? { start: "", end: "", error: null };
            const isSaving  = savingIds.has(agent.id);
            const isPending = pendingIds.has(agent.id);
            const hasBoth   = !!state.start && !!state.end;
            const hasEither = !!state.start || !!state.end;
            const activeHours = hasBoth ? computeActiveHours(state.start, state.end) : null;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: (isSaving || isPending) ? 0.6 : 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay:    Math.min(i * 80, 320) / 1000,
                  ease:     EASE_OUT_EXPO,
                }}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          "var(--space-4)",
                  flexWrap:     "wrap",
                  padding:      "var(--space-4) var(--space-5)",
                  background:   "var(--theme-paper)",
                  border:       "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow:    "var(--shadow-1)",
                  transition:   "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring), opacity var(--duration-base) var(--ease-in-out)",
                }}
                onMouseEnter={(e) => {
                  if (isSaving || isPending) return;
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-2)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-1)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }}
              >
                {/* Agent name + avatar */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "1 1 200px", minWidth: 0 }}>
                  <Avatar
                    src={agent.avatar_url}
                    name={agent.full_name}
                    size="sm"
                    style={{ borderRadius: "var(--radius-sm)", flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontFamily:   "var(--font-sans)",
                      fontSize:     "var(--text-sm)",
                      fontWeight:   "var(--weight-semibold)",
                      color:        "var(--theme-text-primary)",
                      margin:       0,
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                    }}>
                      {agent.full_name}
                    </p>
                    {agent.job_title && (
                      <p style={{
                        fontFamily:   "var(--font-sans)",
                        fontSize:     "var(--text-xs)",
                        color:        "var(--theme-text-tertiary)",
                        margin:       "1px 0 0",
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}>
                        {agent.job_title}
                      </p>
                    )}
                    {state.error && (
                      <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--color-danger-text)", margin: "2px 0 0" }}>
                        {state.error}
                      </p>
                    )}
                    {!state.error && !hasBoth && hasEither && (
                      <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", margin: "2px 0 0" }}>
                        Set both times to save
                      </p>
                    )}
                    {agent.is_on_leave && (
                      <span style={{
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
                      }}>
                        On Leave
                      </span>
                    )}
                  </div>
                </div>

                {/* Domain badge — privileged only */}
                {isPrivileged && (
                  <div style={{ flex: "0 0 auto" }}>
                    <span style={{
                      display:      "inline-flex",
                      alignItems:   "center",
                      padding:      "2px var(--space-3)",
                      borderRadius: "var(--radius-full)",
                      background:   "var(--theme-paper-subtle)",
                      border:       "1px solid var(--theme-paper-border)",
                      fontFamily:   "var(--font-sans)",
                      fontSize:     "var(--text-2xs)",
                      fontWeight:   "var(--weight-medium)",
                      color:        "var(--theme-text-secondary)",
                      letterSpacing:"var(--tracking-wide)",
                      whiteSpace:   "nowrap",
                    }}>
                      {DOMAIN_LABELS[agent.domain] ?? agent.domain}
                    </span>
                  </div>
                )}

                {/* Shift controls group */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "0 0 auto" }}>
                  {/* Shift start label */}
                  <div>
                    <span className="label-micro" style={{ color: "var(--theme-text-tertiary)", display: "block", marginBottom: "var(--space-1)" }}>
                      Shift Start
                    </span>
                    <TimePicker
                      value={state.start || null}
                      disabled={isSaving}
                      onChange={(v) => handleTimeChange(agent, "start", v)}
                      aria-label={`Shift start for ${agent.full_name}`}
                      style={{ width: "104px" }}
                    />
                  </div>

                  <div>
                    <span className="label-micro" style={{ color: "var(--theme-text-tertiary)", display: "block", marginBottom: "var(--space-1)" }}>
                      Shift End
                    </span>
                    <TimePicker
                      value={state.end || null}
                      disabled={isSaving}
                      onChange={(v) => handleTimeChange(agent, "end", v)}
                      aria-label={`Shift end for ${agent.full_name}`}
                      style={{ width: "104px" }}
                    />
                  </div>

                  {/* Active hours */}
                  <div>
                    <span className="label-micro" style={{ color: "var(--theme-text-tertiary)", display: "block", marginBottom: "var(--space-1)" }}>
                      Active
                    </span>
                    <span style={{
                      display:    "block",
                      fontFamily: "var(--font-sans)",
                      fontSize:   "var(--text-sm)",
                      fontWeight: "var(--weight-medium)",
                      color:      hasBoth ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
                      minWidth:   "48px",
                      lineHeight: "32px",
                    }}>
                      {activeHours ?? "—"}
                    </span>
                  </div>
                </div>

                {/* Spacer */}
                <div style={{ flex: "1 1 0" }} />

                {/* In Pool toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-text-secondary)",
                    whiteSpace: "nowrap",
                  }}>
                    In Pool
                  </span>
                  <Toggle
                    size="sm"
                    checked={agent.routing_is_active}
                    onChange={() => handleToggle(agent)}
                    disabled={isPending}
                  />
                </div>

                {/* Clear shift */}
                {hasEither ? (
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => handleClear(agent.id)}
                    disabled={isSaving}
                    title="Clear shift"
                    style={{ width: 28, height: 28, padding: 0, justifyContent: "center", flexShrink: 0 }}
                  >
                    <X size={12} strokeWidth={1.5} />
                  </Button>
                ) : (
                  <span style={{ width: 28, flexShrink: 0 }} />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
