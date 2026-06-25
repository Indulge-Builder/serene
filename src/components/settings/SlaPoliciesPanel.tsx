"use client";

/**
 * SlaPoliciesPanel — the Follow-up Engine editor (admin/founder only).
 *
 * Situation-card layout (2026-06-24 redesign): policies are grouped by their
 * trigger into one card per situation a human recognises ("New lead, no
 * response"). Inside each card the escalation steps read as a sentence —
 * "After 15m → notify Agent" — with the wait time as the only inline-editable
 * control and an on/off toggle per step. Channels + hours-basis (the operator
 * jargon) live behind a per-card "Advanced" disclosure so agents aren't faced
 * with a spreadsheet. Rule codes are never surfaced.
 *
 * Save semantics are unchanged: the wait time saves on blur when changed;
 * toggles/selects/checkboxes save immediately and optimistically, reverting
 * with a toast on error. The engine reads policies per job run, so active/
 * channel edits apply on the very next fire; wait-time edits apply to timers
 * armed after the change.
 */

import { useState, useTransition } from "react";
import { Plus, X, Clock, ArrowRight, SlidersHorizontal } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/constants/lead-statuses";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/constants/call-outcomes";
import { isCadenceCode } from "@/lib/constants/sla";
import { createSlaPolicyAction, updateSlaPolicyAction } from "@/lib/actions/sla-policies";
import { formatDuration } from "@/lib/utils/dates";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { CollapseReveal } from "@/components/ui/CollapseReveal";
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

/** A friendly verb for the recipient — what actually happens at this step. */
const RECIPIENT_VERB: Record<string, string> = {
  agent:   "Notify the agent",
  manager: "Alert the manager",
  founder: "Escalate to a founder",
};

/**
 * One card per situation. The card TITLE + SUBTITLE is the plain-language
 * description a human recognises; the policy rows inside are the escalation
 * steps. We key the grouping on (trigger_kind, trigger_value, cadence) so the
 * A/B/C policies for the same situation sit together as steps.
 */
interface SituationCard {
  key:      string;
  title:    string;
  subtitle: string;
  /** "wait" = ladder of timed steps; "cadence" = recurring task; "task" = at-due. */
  kind:     "wait" | "cadence" | "task";
  rows:     SlaPolicy[];
}

function statusTitle(status: string): string {
  const label = LEAD_STATUS_LABELS[status as LeadStatus] ?? status;
  return `Lead sitting in “${label}”`;
}

function buildSituations(policies: SlaPolicy[]): SituationCard[] {
  const cards: SituationCard[] = [];
  const byKey = new Map<string, SlaPolicy[]>();
  const order: string[] = [];

  // Group by the situation, not the rule. Steps (agent/manager/founder) collapse
  // into one card; cadences and task-due rules each get their own card.
  for (const p of policies) {
    let key: string;
    if (isCadenceCode(p.code)) {
      key = `cadence:${p.code}`;            // each cadence is its own situation
    } else if (p.trigger_kind === "task_due") {
      key = `task:${p.threshold_minutes === 0 ? "due" : "overdue"}`;
    } else {
      key = `${p.trigger_kind}:${p.trigger_value}`;
    }
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(p);
  }

  for (const key of order) {
    const rows = byKey
      .get(key)!
      // Steps ascend by wait time so the ladder reads top-to-bottom.
      .sort((a, b) => a.threshold_minutes - b.threshold_minutes);
    const first = rows[0];

    if (isCadenceCode(first.code)) {
      if (first.trigger_kind === "outcome") {
        const label = CALL_OUTCOME_LABELS[first.trigger_value as CallOutcome] ?? first.trigger_value;
        cards.push({
          key,
          kind:     "cadence",
          title:    `Call ended in “${label}”`,
          subtitle: "Creates a follow-up task each day until the lead moves on.",
          rows,
        });
      } else {
        const label = LEAD_STATUS_LABELS[first.trigger_value as LeadStatus] ?? first.trigger_value;
        cards.push({
          key,
          kind:     "cadence",
          title:    `Lead lingering in “${label}”`,
          subtitle: "Creates a recurring follow-up task while the lead stays here.",
          rows,
        });
      }
      continue;
    }

    if (first.trigger_kind === "task_due") {
      const isDue = first.threshold_minutes === 0;
      cards.push({
        key,
        kind:     "task",
        title:    isDue ? "Follow-up task is due" : "Follow-up task is overdue",
        subtitle: isDue
          ? "Remind whoever owns the task the moment it’s due."
          : "If it’s still untouched after the wait, escalate to the manager.",
        rows,
      });
      continue;
    }

    // Status ladder (the common case: SLA-0xA/B/C for one status).
    cards.push({
      key,
      kind:     "wait",
      title:    statusTitle(first.trigger_value),
      subtitle: "No progress on the lead — nudge people after each wait below.",
      rows,
    });
  }

  return cards;
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function SlaPoliciesPanel({ initialPolicies }: SlaPoliciesPanelProps) {
  const [policies, setPolicies] = useState<SlaPolicy[]>(initialPolicies);
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const situations = buildSituations(policies);

  function toggleAdvanced(key: string) {
    setAdvancedOpen((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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
      toast.danger("The wait must be between 0 and 43,200 minutes.");
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

  return (
    <SectionCard
      title="Follow-up Engine"
      description="Pick how long to wait before each person is nudged about a stalling lead. Changes apply on the next follow-up."
      bodyPadding={false}
      headerRight={
        <Button
          variant={showCreate ? "ghost" : "secondary"}
          size="sm"
          iconLeft={showCreate ? X : Plus}
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "Close" : "Add a rule"}
        </Button>
      }
    >
      <AnimatePresence initial={false}>
        {showCreate && (
          <CollapseReveal key="create">
            <CreateRuleForm onCreate={createRule} creating={creating} />
          </CollapseReveal>
        )}
      </AnimatePresence>

      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "var(--space-4)",
          padding:       "var(--space-5) var(--space-6)",
        }}
      >
        {situations.map((card) => {
          const isAdvancedOpen = advancedOpen.has(card.key);
          const hasAdvanced = card.kind !== "cadence"; // cadences create a task — no channels/threshold knobs

          return (
            <div
              key={card.key}
              style={{
                border:       "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-lg)",
                background:   "var(--theme-paper)",
                overflow:     "hidden",
              }}
            >
              {/* Card header — the plain-language situation */}
              <div
                style={{
                  padding:      "var(--space-4) var(--space-5)",
                  borderBottom: "1px solid var(--theme-paper-border)",
                  background:   "var(--theme-paper-subtle)",
                }}
              >
                <h3
                  style={{
                    margin:     0,
                    fontFamily: "var(--font-serif)",
                    fontSize:   "var(--text-base)",
                    fontWeight: "var(--weight-medium)",
                    color:      "var(--theme-text-primary)",
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    margin:    "2px 0 0",
                    fontSize:  "var(--text-xs)",
                    color:     "var(--theme-text-secondary)",
                  }}
                >
                  {card.subtitle}
                </p>
              </div>

              {/* Escalation steps */}
              <div>
                {card.rows.map((p, i) => (
                  <StepRow
                    key={p.code}
                    policy={p}
                    cardKind={card.kind}
                    isLast={i === card.rows.length - 1}
                    pending={pendingCodes.has(p.code)}
                    thresholdDraft={thresholdDrafts[p.code]}
                    onThresholdChange={(v) =>
                      setThresholdDrafts((d) => ({ ...d, [p.code]: v }))
                    }
                    onThresholdCommit={() => commitThreshold(p)}
                    onActiveChange={(next) => save(p.code, { active: next })}
                  />
                ))}
              </div>

              {/* Advanced disclosure (channels + hours basis per step) */}
              {hasAdvanced && (
                <>
                  <button
                    type="button"
                    onClick={() => toggleAdvanced(card.key)}
                    style={{
                      display:     "flex",
                      alignItems:  "center",
                      gap:         "var(--space-2)",
                      width:       "100%",
                      padding:     "var(--space-3) var(--space-5)",
                      border:      "none",
                      borderTop:   "1px solid var(--theme-paper-border)",
                      background:  "transparent",
                      cursor:      "pointer",
                      fontFamily:  "var(--font-sans)",
                      fontSize:    "var(--text-2xs)",
                      fontWeight:  "var(--weight-semibold)",
                      letterSpacing: "var(--tracking-wide)",
                      textTransform: "uppercase",
                      color:       isAdvancedOpen
                        ? "var(--theme-accent)"
                        : "var(--theme-text-tertiary)",
                      transition:  "color var(--duration-fast) var(--ease-in-out)",
                    }}
                  >
                    <SlidersHorizontal style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                    {isAdvancedOpen ? "Hide advanced" : "Advanced — channels & timing"}
                  </button>

                  <AnimatePresence initial={false}>
                    {isAdvancedOpen && (
                      <CollapseReveal key="adv">
                        <div
                          style={{
                            padding:    "var(--space-2) var(--space-5) var(--space-4)",
                            background: "var(--theme-paper-subtle)",
                          }}
                        >
                          {card.rows.map((p) => (
                            <AdvancedRow
                              key={p.code}
                              policy={p}
                              pending={pendingCodes.has(p.code)}
                              onHoursModeChange={(mode) => save(p.code, { hoursMode: mode })}
                              onToggleChannel={(channel) => toggleChannel(p, channel)}
                            />
                          ))}
                        </div>
                      </CollapseReveal>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({
  policy: p,
  cardKind,
  isLast,
  pending,
  thresholdDraft,
  onThresholdChange,
  onThresholdCommit,
  onActiveChange,
}: {
  policy:            SlaPolicy;
  cardKind:          "wait" | "cadence" | "task";
  isLast:            boolean;
  pending:           boolean;
  thresholdDraft:    string | undefined;
  onThresholdChange: (value: string) => void;
  onThresholdCommit: () => void;
  onActiveChange:    (next: boolean) => void;
}) {
  // Cadence steps tick daily — no editable wait. Otherwise the wait is the chip.
  const isDaily = cardKind === "cadence";

  return (
    <div
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "var(--space-3)",
        padding:      "var(--space-4) var(--space-5)",
        borderBottom: isLast ? "none" : "1px solid var(--theme-paper-border)",
        opacity:      p.active ? 1 : 0.5,
        transition:   "opacity var(--duration-fast) var(--ease-in-out)",
      }}
    >
      {/* Wait */}
      <div
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            "6px",
          flexShrink:     0,
          minWidth:       "120px",
        }}
      >
        <Clock
          style={{
            width: 15, height: 15, strokeWidth: 1.5,
            color: "var(--theme-text-tertiary)",
          }}
        />
        {isDaily ? (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>
            Every day
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>
              After
            </span>
            <input
              type="number"
              min={0}
              max={43200}
              value={thresholdDraft ?? String(p.threshold_minutes)}
              disabled={pending}
              aria-label="Wait time in minutes"
              onChange={(e) => onThresholdChange(e.target.value)}
              onBlur={onThresholdCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="serene-input"
              style={{
                width:        "62px",
                padding:      "3px 6px",
                borderRadius: "var(--radius-sm)",
                border:       "1px solid var(--theme-paper-border)",
                background:   "var(--theme-paper)",
                fontFamily:   "var(--font-mono)",
                fontSize:     "var(--text-sm)",
                color:        "var(--theme-text-primary)",
                textAlign:    "right",
              }}
            />
            <span
              style={{
                fontSize: "var(--text-2xs)",
                color:    "var(--theme-text-tertiary)",
                whiteSpace: "nowrap",
              }}
            >
              min · {formatDuration(p.threshold_minutes)}
            </span>
          </span>
        )}
      </div>

      <ArrowRight
        style={{
          width: 16, height: 16, strokeWidth: 1.5, flexShrink: 0,
          color: "var(--theme-text-tertiary)",
        }}
      />

      {/* What happens */}
      <span
        style={{
          flex:     1,
          minWidth: 0,
          fontSize: "var(--text-sm)",
          color:    "var(--theme-text-primary)",
        }}
      >
        {cardKind === "cadence"
          ? "Create a follow-up task"
          : RECIPIENT_VERB[p.recipient_role] ?? RECIPIENT_LABELS[p.recipient_role]}
      </span>

      {/* On / off */}
      <Toggle
        checked={p.active}
        disabled={pending}
        onChange={onActiveChange}
        size="sm"
        id={`sla-active-${p.code}`}
      />
    </div>
  );
}

// ── Advanced row (channels + hours basis) ─────────────────────────────────────

function AdvancedRow({
  policy: p,
  pending,
  onHoursModeChange,
  onToggleChannel,
}: {
  policy:            SlaPolicy;
  pending:           boolean;
  onHoursModeChange: (mode: SlaHoursMode) => void;
  onToggleChannel:   (channel: "in_app" | "whatsapp") => void;
}) {
  return (
    <div
      style={{
        display:       "flex",
        alignItems:    "center",
        flexWrap:      "wrap",
        gap:           "var(--space-4)",
        padding:       "var(--space-3) 0",
        borderBottom:  "1px solid var(--theme-paper-border)",
      }}
    >
      {/* Which step this advanced row controls */}
      <span
        style={{
          minWidth: "120px",
          fontSize: "var(--text-xs)",
          fontWeight: "var(--weight-medium)",
          color:    "var(--theme-text-secondary)",
        }}
      >
        {RECIPIENT_LABELS[p.recipient_role] ?? "Step"}
      </span>

      {/* Channels */}
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        {(["in_app", "whatsapp"] as const).map((channel) => {
          const checked = (p.channels as string[]).includes(channel);
          return (
            <label
              key={channel}
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        "var(--space-2)",
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
                onChange={() => onToggleChannel(channel)}
                style={{ accentColor: "var(--theme-accent)" }}
              />
              {channel === "in_app" ? "In-app" : "WhatsApp"}
            </label>
          );
        })}
      </div>

      {/* Hours basis */}
      <label
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "var(--space-2)",
          fontSize:   "var(--text-xs)",
          color:      "var(--theme-text-tertiary)",
        }}
      >
        Counts during
        <select
          value={p.hours_mode}
          disabled={pending}
          aria-label="When the wait is counted"
          onChange={(e) => onHoursModeChange(e.target.value as SlaHoursMode)}
          style={{
            padding:      "3px 6px",
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
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
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
 * The inline "Add a rule" authoring form. Five operational fields over the
 * existing trigger catalog; the rule CODE is system-generated server-side and
 * never appears here. trigger_value options re-derive from the chosen kind so a
 * value the action would reject can never be selected; the server re-validates
 * (defense in depth). Wait time is hidden for outcome rules (those tick daily).
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
      toast.danger("The wait must be between 0 and 43,200 minutes.");
      return;
    }
    if (!value) {
      toast.danger("Choose what this rule watches.");
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
        Build a new follow-up rule. It starts working on the next matching lead and you can switch
        it off any time with its toggle.
      </p>

      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap:                 "var(--space-4)",
          alignItems:          "end",
        }}
      >
        <div>
          <label style={fieldLabel} htmlFor="new-rule-kind">Watch for</label>
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

        <div>
          <label style={fieldLabel} htmlFor="new-rule-value">When it’s</label>
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

        <div>
          <label style={fieldLabel} htmlFor="new-rule-recipient">Then notify</label>
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

        {showThreshold && (
          <div>
            <label style={fieldLabel} htmlFor="new-rule-threshold">Wait (minutes)</label>
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

        <div>
          <label style={fieldLabel} htmlFor="new-rule-hours">Counts during</label>
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

        <div>
          <span style={fieldLabel}>Send via</span>
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

        <div>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            loading={creating}
            disabled={creating}
            style={{ width: "100%" }}
          >
            Add rule
          </Button>
        </div>
      </div>
    </div>
  );
}
