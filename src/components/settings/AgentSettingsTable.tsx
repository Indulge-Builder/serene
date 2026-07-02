"use client";

import { useState, useTransition, useMemo } from "react";
import { m as motion } from "framer-motion";
import { X } from "lucide-react";
import { DOMAIN_LABELS, compareDomainDisplayOrder } from "@/lib/constants/domains";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TimePicker } from "@/components/ui/TimePicker";
import { Toggle } from "@/components/ui/Toggle";
import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import { toggleAgentRouting, setAgentShiftAction } from "@/lib/actions/agent-routing";
import { toast } from "@/lib/toast";
import { EASE_OUT_EXPO, EXIT_DURATION } from "@/lib/constants/motion";
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
  days:  number[];
  error: string | null;
}

// ── WorkDayPicker ────────────────────────────────────────────────────────────
// Display order: Mon→Sat→Sun. Storage uses raw JS day-of-week values (0=Sun…6=Sat).

const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: "Su", 1: "Mo", 2: "Tu", 3: "We", 4: "Th", 5: "Fr", 6: "Sa",
};

interface WorkDayPickerProps {
  days:     number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}

function WorkDayPicker({ days, onChange, disabled }: WorkDayPickerProps) {
  function toggle(day: number) {
    if (disabled) return;
    if (days.includes(day)) {
      // Guard: cannot deselect the last remaining day
      if (days.length === 1) return;
      onChange(days.filter((d) => d !== day));
    } else {
      onChange([...days, day]);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-1)" }}>
      {DAY_DISPLAY_ORDER.map((day) => {
        const selected = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={`${selected ? "Deselect" : "Select"} ${DAY_LABELS[day]}`}
            className="serene-touch"
            style={{
              width:          "26px",
              height:         "26px",
              borderRadius:   "var(--radius-xs)",
              border:         selected
                ? "1px solid var(--theme-accent)"
                : "1px solid var(--theme-paper-border)",
              background:     selected ? "var(--theme-accent-surface)" : "transparent",
              color:          selected ? "var(--theme-accent)" : "var(--theme-text-tertiary)",
              fontFamily:     "var(--font-sans)",
              fontSize:       "var(--text-2xs)",
              fontWeight:     selected ? "var(--weight-semibold)" : "var(--weight-normal)",
              cursor:         disabled ? "not-allowed" : "pointer",
              opacity:        disabled ? 0.4 : 1,
              padding:        0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              transition:     "background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)",
              flexShrink:     0,
            }}
          >
            {DAY_LABELS[day]}
          </button>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Mon–Sat

const POOL_FILTER_ITEMS = [
  { id: "in_pool",  label: "In pool" },
  { id: "out_pool", label: "Out of pool" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function AgentSettingsTable({
  initialRoster,
  callerRole,
}: AgentSettingsTableProps) {
  const isPrivileged     = callerRole === "admin" || callerRole === "founder";
  const showDomainFilter = isPrivileged;
  const isMobile         = useMediaQuery(MQ.mobile);

  const [roster, setRoster]             = useState<AgentRosterRow[]>(initialRoster);
  const [search, setSearch]             = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [poolFilter, setPoolFilter]     = useState<string>("all");
  const [pendingIds, setPendingIds]     = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds]       = useState<Set<string>>(new Set());
  const [, startTransition]             = useTransition();

  const [shifts, setShifts] = useState<Record<string, ShiftState>>(() => {
    const map: Record<string, ShiftState> = {};
    for (const agent of initialRoster) {
      map[agent.id] = {
        start: normalizeTimeHHMM(agent.shift_start) ?? "",
        end:   normalizeTimeHHMM(agent.shift_end) ?? "",
        days:  agent.shift_days ?? DEFAULT_WORK_DAYS,
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
    const currentState = shifts[agent.id] ?? { start: "", end: "", days: DEFAULT_WORK_DAYS, error: null };
    const normalised = value ? normalizeTimeHHMM(value) : null;
    const next = {
      start: field === "start" ? (normalised ?? "") : currentState.start,
      end:   field === "end"   ? (normalised ?? "") : currentState.end,
    };
    setShifts((prev) => ({
      ...prev,
      [agent.id]: { ...prev[agent.id]!, ...next, error: null },
    }));
    validateAndSave(agent, next.start, next.end, currentState.days);
  }

  function handleDaysChange(agent: AgentRosterRow, newDays: number[]) {
    const currentState = shifts[agent.id] ?? { start: "", end: "", days: DEFAULT_WORK_DAYS, error: null };
    setShifts((prev) => ({
      ...prev,
      [agent.id]: { ...prev[agent.id]!, days: newDays, error: null },
    }));
    validateAndSave(agent, currentState.start, currentState.end, newDays);
  }

  function validateAndSave(agent: AgentRosterRow, start: string, end: string, days: number[]) {
    if (!start && !end) { saveShift(agent.id, null, null, null); return; }

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

    saveShift(agent.id, start, end, days);
  }

  function handleClear(agentId: string) {
    setShifts((prev) => ({
      ...prev,
      [agentId]: { start: "", end: "", days: DEFAULT_WORK_DAYS, error: null },
    }));
    // Pass null for times and days — DB stores null to mean "use global BUSINESS_HOURS"
    saveShift(agentId, null, null, null);
  }

  function saveShift(agentId: string, start: string | null, end: string | null, days: number[] | null) {
    if (savingIds.has(agentId)) return;
    setSavingIds((prev) => new Set(prev).add(agentId));

    startTransition(async () => {
      const result = await setAgentShiftAction({
        agentId,
        shiftStart: start,
        shiftEnd:   end,
        shiftDays:  days,
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Filter bar — shared shell (chrome + mobile scroll row) ── */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or title…"
        searchSize="sm"
        searchAriaLabel="Search agents"
        searchStyle={{ flex: "1 1 200px", minWidth: "160px" }}
        activeCount={activeCount}
        onClearAll={() => {
          setSearch("");
          setDomainFilter("all");
          setPoolFilter("all");
        }}
        style={{
          padding:      "var(--space-4) var(--space-5)",
          marginBottom: "var(--space-4)",
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-md)",
          boxShadow:    "var(--shadow-1)",
        }}
        trailing={
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-xs)",
              color:      "var(--theme-text-tertiary)",
              whiteSpace: "nowrap",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
          </span>
        }
      >
        {showDomainFilter && presentDomains.length > 1 && (
          <FilterDropdown
            label="Domain"
            items={domainFilterItems}
            selected={domainFilter !== "all" ? [domainFilter] : []}
            onChange={(next) => setDomainFilter(next[0] ?? "all")}
            menuPortal
          />
        )}

        <FilterDropdown
          label="Pool"
          items={[...POOL_FILTER_ITEMS]}
          selected={poolFilter !== "all" ? [poolFilter] : []}
          onChange={(next) => setPoolFilter(next[0] ?? "all")}
          menuPortal
        />
      </FilterBar>

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
            const state     = shifts[agent.id] ?? { start: "", end: "", days: DEFAULT_WORK_DAYS, error: null };
            const isSaving  = savingIds.has(agent.id);
            const isPending = pendingIds.has(agent.id);
            const hasBoth   = !!state.start && !!state.end;
            const hasEither = !!state.start || !!state.end;
            const activeHours = hasBoth ? computeActiveHours(state.start, state.end) : null;

            // Card blocks — assembled per layout below
            const identityBlock = (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: isMobile ? "1 1 auto" : "1 1 200px", minWidth: 0 }}>
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
            );

            // Domain badge — privileged only
            const domainBadgeBlock = isPrivileged ? (
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
            ) : null;

            const shiftFieldsBlock = (
              <>
                  {/* Shift start */}
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

                  {/* Shift end */}
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

                  {/* Work days */}
                  <div>
                    <span className="label-micro" style={{ color: "var(--theme-text-tertiary)", display: "block", marginBottom: "var(--space-1)" }}>
                      Work Days
                    </span>
                    <WorkDayPicker
                      days={state.days}
                      onChange={(newDays) => handleDaysChange(agent, newDays)}
                      disabled={isSaving}
                    />
                  </div>
              </>
            );

            // In Pool toggle
            const poolToggleBlock = (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
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
            );

            // Clear shift
            const clearButtonBlock = hasEither ? (
              <Button
                variant="danger"
                size="xs"
                onClick={() => handleClear(agent.id)}
                disabled={isSaving}
                title="Clear shift"
                className="serene-touch"
                style={{ width: 28, height: 28, padding: 0, justifyContent: "center", flexShrink: 0, marginLeft: isMobile ? "auto" : undefined }}
              >
                <X size={12} strokeWidth={1.5} />
              </Button>
            ) : null;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: (isSaving || isPending) ? 0.6 : 1, y: 0 }}
                transition={{
                  duration: EXIT_DURATION,
                  delay:    Math.min(i * 80, 320) / 1000,
                  ease:     EASE_OUT_EXPO,
                }}
                style={{
                  display:       "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems:    isMobile ? "stretch" : "center",
                  gap:           isMobile ? "var(--space-3)" : "var(--space-4)",
                  flexWrap:      isMobile ? "nowrap" : "wrap",
                  padding:       isMobile ? "var(--space-4)" : "var(--space-4) var(--space-5)",
                  background:    "var(--theme-paper)",
                  border:        "1px solid var(--theme-paper-border)",
                  borderRadius:  "var(--radius-lg)",
                  boxShadow:     "var(--shadow-1)",
                  transition:    "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring), opacity var(--duration-base) var(--ease-in-out)",
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
                {isMobile ? (
                  <>
                    {/* Header row — identity left, In Pool toggle right */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                      {identityBlock}
                      {poolToggleBlock}
                    </div>
                    {domainBadgeBlock}
                    <div aria-hidden style={{ height: 1, background: "var(--theme-paper-border)" }} />
                    {/* Shift controls — wrap row; clear button hugs the right edge */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)", flexWrap: "wrap" }}>
                      {shiftFieldsBlock}
                      {clearButtonBlock}
                    </div>
                  </>
                ) : (
                  <>
                    {identityBlock}
                    {domainBadgeBlock}
                    {/* Shift controls group — must be allowed to shrink so its
                        children wrap inside the card at narrow widths */}
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "1 1 auto", minWidth: 0, flexWrap: "wrap" }}>
                      {shiftFieldsBlock}
                    </div>
                    {/* Spacer */}
                    <div style={{ flex: "1 1 0" }} />
                    {poolToggleBlock}
                    {clearButtonBlock ?? <span style={{ width: 28, flexShrink: 0 }} />}
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
