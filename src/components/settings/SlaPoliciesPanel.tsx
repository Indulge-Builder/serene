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
import { Plus, X } from "lucide-react";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/constants/lead-statuses";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/constants/call-outcomes";
import { isCadenceCode } from "@/lib/constants/sla";
import { createSlaPolicyAction, updateSlaPolicyAction } from "@/lib/actions/sla-policies";
import { formatDuration } from "@/lib/utils/dates";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { toast } from "@/lib/toast";
import type { SlaPolicy, SlaHoursMode, LeadStatus, CallOutcome } from "@/lib/types/database";
import type { SlaTriggerKind, SlaRecipientRole } from "@/lib/types/database";

interface SlaPoliciesPanelProps {
  initialPolicies: SlaPolicy[];
}

// ── New-rule form vocabulary ──────────────────────────────────────────────────

const TRIGGER_KIND_OPTIONS: { value: SlaTriggerKind; label: string }[] = [
  { value: "status",   label: "Lead status" },
  { value: "outcome",  label: "Call outcome" },
  { value: "task_due", label: "Task due" },
];

const RECIPIENT_OPTIONS: { value: SlaRecipientRole; label: string }[] = [
  { value: "agent",   label: "Agent" },
  { value: "manager", label: "Manager" },
  { value: "founder", label: "Founder" },
];

const TASK_DUE_VALUE_OPTIONS: { value: string; label: string }[] = [
  { value: "gia_followup", label: "Gia follow-up task" },
];

/** Trigger-value options for the chosen kind — mirrors the server-side
 *  trigger_value-against-kind validation so the dropdown can never offer a
 *  value the action would reject. */
function triggerValueOptions(kind: SlaTriggerKind): { value: string; label: string }[] {
  if (kind === "status") {
    return LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] }));
  }
  if (kind === "outcome") {
    return CALL_OUTCOMES.map((o) => ({ value: o, label: CALL_OUTCOME_LABELS[o] }));
  }
  return TASK_DUE_VALUE_OPTIONS;
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

  // New-rule form state (admin/founder author a rule over the trigger catalog).
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Groups are EXHAUSTIVE — a user can author a non-cadence `outcome` rule, so
  // that group must exist or the new row would land nowhere. Seeded CAD-01x
  // outcome rules carry the cadence code and stay under "Follow-up cadences".
  const groups: { label: string; rows: SlaPolicy[] }[] = [
    {
      label: "Lead status rules",
      rows: policies.filter((p) => p.trigger_kind === "status" && !isCadenceCode(p.code)),
    },
    {
      label: "Call outcome rules",
      rows: policies.filter((p) => p.trigger_kind === "outcome" && !isCadenceCode(p.code)),
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

  function createRule(input: CreateRuleDraft) {
    setCreating(true);
    startTransition(async () => {
      const { data, error } = await createSlaPolicyAction({
        triggerKind:      input.triggerKind,
        triggerValue:     input.triggerValue,
        recipientRole:    input.recipientRole,
        thresholdMinutes: input.thresholdMinutes,
        hoursMode:        input.hoursMode,
        channels:         input.channels,
        active:           true,
      });
      setCreating(false);
      if (error || !data) {
        toast.danger(error ?? "Couldn't create the rule.");
        return;
      }
      // The server-returned row lands in the matching group immediately.
      setPolicies((rows) => [...rows, data]);
      setShowCreate(false);
      toast.success("Rule created.");
    });
  }

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
      headerRight={
        <Button
          variant={showCreate ? "ghost" : "secondary"}
          size="sm"
          iconLeft={showCreate ? X : Plus}
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "Close" : "New rule"}
        </Button>
      }
    >
      {showCreate && (
        <CreateRuleForm onCreate={createRule} creating={creating} />
      )}

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

// ── New-rule form ─────────────────────────────────────────────────────────────

interface CreateRuleDraft {
  triggerKind:      SlaTriggerKind;
  triggerValue:     string;
  recipientRole:    SlaRecipientRole;
  thresholdMinutes: number;
  hoursMode:        SlaHoursMode;
  channels:         ("in_app" | "whatsapp")[];
}

/**
 * The inline "New rule" authoring form. Five operational fields over the
 * existing trigger catalog; the rule CODE is system-generated server-side and
 * never appears here. trigger_value options re-derive from the chosen kind so a
 * value the action would reject can never be selected; the server re-validates
 * (defense in depth). Threshold is hidden for outcome rules (those tick daily —
 * threshold_minutes is unused by the engine).
 */
function CreateRuleForm({
  onCreate,
  creating,
}: {
  onCreate: (draft: CreateRuleDraft) => void;
  creating: boolean;
}) {
  const [kind, setKind] = useState<SlaTriggerKind>("status");
  const [value, setValue] = useState<string>(LEAD_STATUSES[0]);
  const [recipient, setRecipient] = useState<SlaRecipientRole>("manager");
  const [threshold, setThreshold] = useState<string>("30");
  const [hoursMode, setHoursMode] = useState<SlaHoursMode>("business");
  const [channels, setChannels] = useState<("in_app" | "whatsapp")[]>(["in_app"]);

  const valueOptions = triggerValueOptions(kind);
  const showThreshold = kind !== "outcome";

  function changeKind(next: SlaTriggerKind) {
    setKind(next);
    // Reset trigger value to the first valid option for the new kind so the
    // value-against-kind invariant always holds before submit.
    const first = triggerValueOptions(next)[0]?.value ?? "";
    setValue(first);
  }

  function toggleChannel(channel: "in_app" | "whatsapp") {
    setChannels((cur) =>
      cur.includes(channel) ? cur.filter((c) => c !== channel) : [...cur, channel],
    );
  }

  function submit() {
    const minutes = showThreshold ? Number(threshold) : 0;
    if (showThreshold && (!Number.isInteger(minutes) || minutes < 0 || minutes > 43_200)) {
      toast.danger("Threshold must be between 0 and 43,200 minutes.");
      return;
    }
    if (!value) {
      toast.danger("Choose a trigger value.");
      return;
    }
    onCreate({
      triggerKind:      kind,
      triggerValue:     value,
      recipientRole:    recipient,
      thresholdMinutes: minutes,
      hoursMode,
      channels,
    });
  }

  const fieldLabel: React.CSSProperties = {
    display:       "block",
    marginBottom:  "var(--space-1)",
    fontFamily:    "var(--font-sans)",
    fontSize:      "var(--text-2xs)",
    fontWeight:    "var(--weight-semibold)",
    letterSpacing: "var(--tracking-widest)",
    textTransform: "uppercase",
    color:         "var(--theme-text-tertiary)",
  };

  const control: React.CSSProperties = {
    width:        "100%",
    padding:      "6px 8px",
    borderRadius: "var(--radius-sm)",
    border:       "1px solid var(--theme-paper-border)",
    background:   "var(--theme-paper)",
    fontFamily:   "var(--font-sans)",
    fontSize:     "var(--text-xs)",
    color:        "var(--theme-text-primary)",
  };

  return (
    <div
      style={{
        padding:      "var(--space-5) var(--space-6)",
        borderBottom: "1px solid var(--theme-paper-border)",
        background:   "var(--theme-paper-subtle)",
      }}
    >
      <p
        style={{
          margin:     "0 0 var(--space-4)",
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-xs)",
          color:      "var(--theme-text-secondary)",
        }}
      >
        Create a rule over the trigger catalog. It arms automatically on the next matching lead.
        Switch it off any time with its row toggle.
      </p>

      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap:                 "var(--space-4)",
          alignItems:          "end",
        }}
      >
        {/* Watches (trigger kind) */}
        <div>
          <label style={fieldLabel} htmlFor="new-rule-kind">Watches</label>
          <select
            id="new-rule-kind"
            value={kind}
            disabled={creating}
            onChange={(e) => changeKind(e.target.value as SlaTriggerKind)}
            style={control}
          >
            {TRIGGER_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Trigger value */}
        <div>
          <label style={fieldLabel} htmlFor="new-rule-value">Value</label>
          <select
            id="new-rule-value"
            value={value}
            disabled={creating}
            onChange={(e) => setValue(e.target.value)}
            style={control}
          >
            {valueOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Notifies (recipient) */}
        <div>
          <label style={fieldLabel} htmlFor="new-rule-recipient">Notifies</label>
          <select
            id="new-rule-recipient"
            value={recipient}
            disabled={creating}
            onChange={(e) => setRecipient(e.target.value as SlaRecipientRole)}
            style={control}
          >
            {RECIPIENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Threshold — hidden for outcome rules (they tick daily) */}
        {showThreshold && (
          <div>
            <label style={fieldLabel} htmlFor="new-rule-threshold">Threshold (min)</label>
            <input
              id="new-rule-threshold"
              type="number"
              min={0}
              max={43200}
              value={threshold}
              disabled={creating}
              onChange={(e) => setThreshold(e.target.value)}
              className="serene-input"
              style={{ ...control, fontFamily: "var(--font-mono)" }}
            />
          </div>
        )}

        {/* Hours basis */}
        <div>
          <label style={fieldLabel} htmlFor="new-rule-hours">Hours basis</label>
          <select
            id="new-rule-hours"
            value={hoursMode}
            disabled={creating}
            onChange={(e) => setHoursMode(e.target.value as SlaHoursMode)}
            style={control}
          >
            {HOURS_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Channels */}
        <div>
          <span style={fieldLabel}>Channels</span>
          <div style={{ display: "flex", gap: "var(--space-4)", paddingTop: "4px" }}>
            {(["in_app", "whatsapp"] as const).map((channel) => {
              const checked = channels.includes(channel);
              return (
                <label
                  key={channel}
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        "var(--space-2)",
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      checked ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
                    cursor:     creating ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={creating}
                    onChange={() => toggleChannel(channel)}
                    style={{ accentColor: "var(--theme-accent)" }}
                  />
                  {channel === "in_app" ? "In-app" : "WhatsApp"}
                </label>
              );
            })}
          </div>
        </div>

        {/* Create */}
        <div>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            loading={creating}
            disabled={creating}
            style={{ width: "100%" }}
          >
            Create rule
          </Button>
        </div>
      </div>
    </div>
  );
}
