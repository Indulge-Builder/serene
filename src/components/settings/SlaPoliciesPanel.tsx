"use client";

/**
 * SlaPoliciesPanel — the /settings follow-up engine editor (admin/founder only).
 *
 * One row per sla_policies rule, grouped by family. Editable knobs:
 * threshold, hours basis, notification channels, active toggle. Identity
 * fields (trigger, recipient, auto-task) are read-only — toggling the
 * manager/founder rows active IS the recipient checklist.
 *
 * Save semantics mirror AgentSettingsTable: threshold saves on blur when
 * changed; toggles/selects save immediately and optimistically, reverting
 * with a toast on error. The engine reads policies per job run, so
 * active/channel edits apply on the very next fire; threshold edits apply
 * to timers armed after the change.
 */

import { useState, useTransition } from "react";
import { LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { CALL_OUTCOME_LABELS } from "@/lib/constants/call-outcomes";
import { isCadenceCode } from "@/lib/constants/sla";
import { updateSlaPolicyAction } from "@/lib/actions/sla-policies";
import { formatDuration } from "@/lib/utils/dates";
import { Toggle } from "@/components/ui/Toggle";
import { SectionCard } from "@/components/ui/SectionCard";
import { toast } from "@/lib/toast";
import type { SlaPolicy, SlaHoursMode, LeadStatus, CallOutcome } from "@/lib/types/database";

interface SlaPoliciesPanelProps {
  initialPolicies: SlaPolicy[];
}

// ── Row vocabulary ───────────────────────────────────────────────────────────

const HOURS_MODE_OPTIONS: { value: SlaHoursMode; label: string }[] = [
  { value: "agent_shift", label: "Agent shift" },
  { value: "business",    label: "Business hours" },
  { value: "clock",       label: "Clock time" },
];

const RECIPIENT_LABELS: Record<string, string> = {
  agent:   "Agent",
  manager: "Manager",
  founder: "Founder",
};

function policyDescription(p: SlaPolicy): string {
  if (p.trigger_kind === "task_due") {
    return p.threshold_minutes === 0
      ? "Gia follow-up task reaches its due time"
      : "Gia follow-up task still untouched past due";
  }
  if (isCadenceCode(p.code)) {
    if (p.trigger_kind === "outcome") {
      const label = CALL_OUTCOME_LABELS[p.trigger_value as CallOutcome] ?? p.trigger_value;
      return `Daily follow-up task while the last outcome is “${label}”`;
    }
    const label = LEAD_STATUS_LABELS[p.trigger_value as LeadStatus] ?? p.trigger_value;
    return `Recurring follow-up task while the lead sits in “${label}”`;
  }
  const label = LEAD_STATUS_LABELS[p.trigger_value as LeadStatus] ?? p.trigger_value;
  return `Lead in “${label}” with no progress past the threshold`;
}

/** Outcome cadences tick daily at shift open — threshold_minutes is unused. */
function thresholdIsDaily(p: SlaPolicy): boolean {
  return p.trigger_kind === "outcome";
}

/** CAD rows carry channels '{}' — the created task is the nudge. */
function channelsAreTaskOnly(p: SlaPolicy): boolean {
  return isCadenceCode(p.code);
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function SlaPoliciesPanel({ initialPolicies }: SlaPoliciesPanelProps) {
  const [policies, setPolicies] = useState<SlaPolicy[]>(initialPolicies);
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const groups: { label: string; rows: SlaPolicy[] }[] = [
    {
      label: "Lead status rules",
      rows: policies.filter((p) => p.trigger_kind === "status" && !isCadenceCode(p.code)),
    },
    {
      label: "Follow-up cadences",
      rows: policies.filter((p) => isCadenceCode(p.code)),
    },
    {
      label: "Task due rules",
      rows: policies.filter((p) => p.trigger_kind === "task_due"),
    },
  ];

  function save(code: string, patch: Partial<{
    active: boolean;
    thresholdMinutes: number;
    channels: ("in_app" | "whatsapp")[];
    hoursMode: SlaHoursMode;
  }>) {
    const previous = policies;

    // Optimistic local apply
    setPolicies((rows) =>
      rows.map((p) =>
        p.code === code
          ? {
              ...p,
              ...(patch.active !== undefined ? { active: patch.active } : {}),
              ...(patch.thresholdMinutes !== undefined ? { threshold_minutes: patch.thresholdMinutes } : {}),
              ...(patch.channels !== undefined ? { channels: patch.channels } : {}),
              ...(patch.hoursMode !== undefined ? { hours_mode: patch.hoursMode } : {}),
            }
          : p,
      ),
    );
    setPendingCodes((s) => new Set(s).add(code));

    startTransition(async () => {
      const { error } = await updateSlaPolicyAction({ code, ...patch });
      setPendingCodes((s) => {
        const next = new Set(s);
        next.delete(code);
        return next;
      });
      if (error) {
        setPolicies(previous);
        toast.danger(error);
      }
    });
  }

  function commitThreshold(p: SlaPolicy) {
    const draft = thresholdDrafts[p.code];
    if (draft === undefined) return;
    const minutes = Number(draft);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 43_200) {
      toast.danger("Threshold must be between 0 and 43,200 minutes.");
      setThresholdDrafts(({ [p.code]: _drop, ...rest }) => rest);
      return;
    }
    setThresholdDrafts(({ [p.code]: _drop, ...rest }) => rest);
    if (minutes === p.threshold_minutes) return;
    save(p.code, { thresholdMinutes: minutes });
  }

  function toggleChannel(p: SlaPolicy, channel: "in_app" | "whatsapp") {
    const current = p.channels as ("in_app" | "whatsapp")[];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    save(p.code, { channels: next });
  }

  const headerCell: React.CSSProperties = {
    fontFamily:    "var(--font-sans)",
    fontSize:      "var(--text-2xs)",
    fontWeight:    "var(--weight-semibold)",
    letterSpacing: "var(--tracking-widest)",
    textTransform: "uppercase",
    color:         "var(--theme-text-tertiary)",
  };

  const grid = "minmax(260px, 1.6fr) 90px 150px 150px 170px 64px";

  return (
    <SectionCard
      title="Follow-up Engine"
      description="SLA thresholds, escalation recipients, and cadence rules. Active and channel edits apply on the next fire; threshold edits apply to newly armed timers."
      bodyPadding={false}
    >
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: "920px" }}>
          {/* Column header */}
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: grid,
              gap:                 "var(--space-4)",
              alignItems:          "center",
              padding:             "var(--space-3) var(--space-6)",
              borderBottom:        "1px solid var(--theme-paper-border)",
            }}
          >
            <span style={headerCell}>Rule</span>
            <span style={headerCell}>Notifies</span>
            <span style={headerCell}>Threshold</span>
            <span style={headerCell}>Hours basis</span>
            <span style={headerCell}>Channels</span>
            <span style={{ ...headerCell, textAlign: "right" }}>Active</span>
          </div>

          {groups.map((group) =>
            group.rows.length === 0 ? null : (
              <div key={group.label}>
                <div
                  style={{
                    padding:    "var(--space-3) var(--space-6) var(--space-1)",
                    background: "var(--theme-paper-subtle)",
                  }}
                >
                  <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
                    {group.label}
                  </span>
                </div>

                {group.rows.map((p) => {
                  const pending = pendingCodes.has(p.code);
                  const dimmed = !p.active;
                  return (
                    <div
                      key={p.code}
                      style={{
                        display:             "grid",
                        gridTemplateColumns: grid,
                        gap:                 "var(--space-4)",
                        alignItems:          "center",
                        padding:             "var(--space-4) var(--space-6)",
                        borderBottom:        "1px solid var(--theme-paper-border)",
                        opacity:             dimmed ? 0.55 : 1,
                        transition:          "opacity var(--duration-fast) var(--ease-in-out)",
                      }}
                    >
                      {/* Rule identity */}
                      <div style={{ minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize:   "var(--text-xs)",
                            fontWeight: "var(--weight-semibold)",
                            color:      "var(--theme-text-primary)",
                          }}
                        >
                          {p.code}
                        </span>
                        <p
                          style={{
                            margin:     "2px 0 0",
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-xs)",
                            color:      "var(--theme-text-secondary)",
                          }}
                        >
                          {policyDescription(p)}
                        </p>
                      </div>

                      {/* Recipient (read-only) */}
                      <span
                        style={{
                          display:       "inline-flex",
                          alignSelf:     "center",
                          justifySelf:   "start",
                          padding:       "2px 8px",
                          borderRadius:  "var(--radius-full)",
                          background:    "var(--theme-paper-subtle)",
                          border:        "1px solid var(--theme-paper-border)",
                          fontFamily:    "var(--font-sans)",
                          fontSize:      "var(--text-2xs)",
                          fontWeight:    "var(--weight-medium)",
                          color:         "var(--theme-text-secondary)",
                        }}
                      >
                        {RECIPIENT_LABELS[p.recipient_role]}
                      </span>

                      {/* Threshold */}
                      {thresholdIsDaily(p) ? (
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-xs)",
                            color:      "var(--theme-text-tertiary)",
                          }}
                        >
                          Daily at shift open
                        </span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <input
                            type="number"
                            min={0}
                            max={43200}
                            value={thresholdDrafts[p.code] ?? String(p.threshold_minutes)}
                            disabled={pending}
                            aria-label={`${p.code} threshold in minutes`}
                            onChange={(e) =>
                              setThresholdDrafts((d) => ({ ...d, [p.code]: e.target.value }))
                            }
                            onBlur={() => commitThreshold(p)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            className="serene-input"
                            style={{
                              width:        "76px",
                              padding:      "4px 8px",
                              borderRadius: "var(--radius-sm)",
                              border:       "1px solid var(--theme-paper-border)",
                              background:   "var(--theme-paper)",
                              fontFamily:   "var(--font-mono)",
                              fontSize:     "var(--text-xs)",
                              color:        "var(--theme-text-primary)",
                            }}
                          />
                          <span
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize:   "var(--text-2xs)",
                              color:      "var(--theme-text-tertiary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            min · {formatDuration(p.threshold_minutes)}
                          </span>
                        </div>
                      )}

                      {/* Hours basis */}
                      <select
                        value={p.hours_mode}
                        disabled={pending}
                        aria-label={`${p.code} hours basis`}
                        onChange={(e) => save(p.code, { hoursMode: e.target.value as SlaHoursMode })}
                        style={{
                          padding:      "4px 8px",
                          borderRadius: "var(--radius-sm)",
                          border:       "1px solid var(--theme-paper-border)",
                          background:   "var(--theme-paper)",
                          fontFamily:   "var(--font-sans)",
                          fontSize:     "var(--text-xs)",
                          color:        "var(--theme-text-primary)",
                          cursor:       pending ? "not-allowed" : "pointer",
                        }}
                      >
                        {HOURS_MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>

                      {/* Channels */}
                      {channelsAreTaskOnly(p) ? (
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-xs)",
                            color:      "var(--theme-text-tertiary)",
                          }}
                        >
                          Creates a task
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: "var(--space-4)" }}>
                          {(["in_app", "whatsapp"] as const).map((channel) => {
                            const checked = (p.channels as string[]).includes(channel);
                            return (
                              <label
                                key={channel}
                                style={{
                                  display:    "flex",
                                  alignItems: "center",
                                  gap:        "var(--space-2)",
                                  fontFamily: "var(--font-sans)",
                                  fontSize:   "var(--text-xs)",
                                  color:      checked
                                    ? "var(--theme-text-primary)"
                                    : "var(--theme-text-tertiary)",
                                  cursor:     pending ? "not-allowed" : "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={pending}
                                  onChange={() => toggleChannel(p, channel)}
                                  style={{ accentColor: "var(--theme-accent)" }}
                                />
                                {channel === "in_app" ? "In-app" : "WhatsApp"}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* Active */}
                      <div style={{ justifySelf: "end" }}>
                        <Toggle
                          checked={p.active}
                          disabled={pending}
                          onChange={(next) => save(p.code, { active: next })}
                          size="sm"
                          id={`sla-active-${p.code}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          )}
        </div>
      </div>
    </SectionCard>
  );
}
