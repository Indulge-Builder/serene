"use client";

/**
 * RevivalPoliciesPanel — the /settings lead-revival editor (admin/founder only).
 *
 * One row per silenceable lead status (touched / in_discussion / nurturing). Editable
 * knobs: silence threshold (days), daily auto-revive cap per agent, active toggle.
 * Save semantics mirror SlaPoliciesPanel exactly (the reused pattern): the threshold
 * + cap save on blur when changed; the active toggle saves immediately. All optimistic,
 * reverting with a toast on error. The daily sweep reads revival_policies per run, so
 * edits apply on the next nightly sweep without a deploy.
 */

import { useState, useTransition } from "react";
import { LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { updateRevivalPolicyAction } from "@/lib/actions/revival";
import { Toggle } from "@/components/ui/Toggle";
import { SectionCard } from "@/components/ui/SectionCard";
import { toast } from "@/lib/toast";
import type { RevivalPolicyRow } from "@/lib/types/revival";
import type { LeadStatus } from "@/lib/types/database";

interface RevivalPoliciesPanelProps {
  initialPolicies: RevivalPolicyRow[];
}

const GRID = "minmax(180px, 1.4fr) 150px 150px 64px";

export function RevivalPoliciesPanel({ initialPolicies }: RevivalPoliciesPanelProps) {
  const [policies, setPolicies] = useState<RevivalPolicyRow[]>(initialPolicies);
  const [silenceDrafts, setSilenceDrafts] = useState<Record<string, string>>({});
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function save(
    triggerStatus: string,
    patch: Partial<{ silenceDays: number; dailyCapPerAgent: number; active: boolean }>,
  ) {
    const previous = policies;
    setPolicies((rows) =>
      rows.map((p) =>
        p.trigger_status === triggerStatus
          ? {
              ...p,
              ...(patch.silenceDays !== undefined ? { silence_days: patch.silenceDays } : {}),
              ...(patch.dailyCapPerAgent !== undefined
                ? { daily_cap_per_agent: patch.dailyCapPerAgent }
                : {}),
              ...(patch.active !== undefined ? { active: patch.active } : {}),
            }
          : p,
      ),
    );
    setPending((s) => new Set(s).add(triggerStatus));

    startTransition(async () => {
      const { error } = await updateRevivalPolicyAction({ triggerStatus, ...patch });
      setPending((s) => {
        const next = new Set(s);
        next.delete(triggerStatus);
        return next;
      });
      if (error) {
        setPolicies(previous);
        toast.danger(error);
      }
    });
  }

  function commitSilence(p: RevivalPolicyRow) {
    const draft = silenceDrafts[p.trigger_status];
    if (draft === undefined) return;
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      setSilenceDrafts((d) => {
        const next = { ...d };
        delete next[p.trigger_status];
        return next;
      });
      return;
    }
    if (n !== p.silence_days) save(p.trigger_status, { silenceDays: n });
    setSilenceDrafts((d) => {
      const next = { ...d };
      delete next[p.trigger_status];
      return next;
    });
  }

  function commitCap(p: RevivalPolicyRow) {
    const draft = capDrafts[p.trigger_status];
    if (draft === undefined) return;
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0 || n > 500) {
      setCapDrafts((d) => {
        const next = { ...d };
        delete next[p.trigger_status];
        return next;
      });
      return;
    }
    if (n !== p.daily_cap_per_agent) save(p.trigger_status, { dailyCapPerAgent: n });
    setCapDrafts((d) => {
      const next = { ...d };
      delete next[p.trigger_status];
      return next;
    });
  }

  const headerCell: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-2xs)",
    fontWeight: "var(--weight-semibold)",
    letterSpacing: "var(--tracking-widest)",
    textTransform: "uppercase",
    color: "var(--theme-text-tertiary)",
  };

  return (
    <SectionCard
      title="Lead revival"
      description="When a dormant lead has been silent past its threshold, the nightly sweep judges its notes and either revives it or sends it to review. Cold leads are never revived."
      bodyPadding={false}
    >
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: "620px" }}>
          {/* Column header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              gap: "var(--space-4)",
              alignItems: "center",
              padding: "var(--space-3) var(--space-6)",
              borderBottom: "1px solid var(--theme-paper-border)",
            }}
          >
            <span style={headerCell}>Lead status</span>
            <span style={headerCell}>Silence (days)</span>
            <span style={headerCell}>Daily cap / agent</span>
            <span style={{ ...headerCell, textAlign: "right" }}>Active</span>
          </div>

          {policies.map((p) => {
            const isPending = pending.has(p.trigger_status);
            return (
              <div
                key={p.trigger_status}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  gap: "var(--space-4)",
                  alignItems: "center",
                  padding: "var(--space-4) var(--space-6)",
                  borderBottom: "1px solid var(--theme-paper-border)",
                  opacity: p.active ? 1 : 0.55,
                  transition: "opacity var(--duration-fast) var(--ease-in-out)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--theme-text-primary)",
                  }}
                >
                  {LEAD_STATUS_LABELS[p.trigger_status as LeadStatus] ?? p.trigger_status}
                </span>

                <input
                  type="number"
                  min={0}
                  max={365}
                  className="serene-input"
                  disabled={isPending}
                  value={silenceDrafts[p.trigger_status] ?? String(p.silence_days)}
                  onChange={(e) =>
                    setSilenceDrafts((d) => ({ ...d, [p.trigger_status]: e.target.value }))
                  }
                  onBlur={() => commitSilence(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  style={inputStyle}
                />

                <input
                  type="number"
                  min={0}
                  max={500}
                  className="serene-input"
                  disabled={isPending}
                  value={capDrafts[p.trigger_status] ?? String(p.daily_cap_per_agent)}
                  onChange={(e) =>
                    setCapDrafts((d) => ({ ...d, [p.trigger_status]: e.target.value }))
                  }
                  onBlur={() => commitCap(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  style={inputStyle}
                />

                <div style={{ justifySelf: "end" }}>
                  <Toggle
                    checked={p.active}
                    disabled={isPending}
                    onChange={(next) => save(p.trigger_status, { active: next })}
                    size="sm"
                    id={`revival-active-${p.trigger_status}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

const inputStyle: React.CSSProperties = {
  width: "96px",
  padding: "6px 10px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--theme-paper-border)",
  background: "var(--theme-paper)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-sm)",
  color: "var(--theme-text-primary)",
};
