"use client";

// The corrections queue (0252, plan section 12): what the concierge said, what an agent says she
// should have said. Each ends as a pack edit (Applied) or Dismissed. Renders nothing when empty.

import { useState, useTransition } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { formatDate } from "@/lib/utils/dates";
import { resolveBotCorrectionAction } from "@/lib/actions/public-bot";
import type { BotCorrectionRow } from "@/lib/services/public-bot-handover";

interface BotCorrectionsCardProps {
  initial: BotCorrectionRow[];
  canResolve: boolean;
}

const quote: React.CSSProperties = {
  fontSize: "var(--text-sm)", margin: 0, padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-md)", background: "var(--theme-paper-subtle)", color: "var(--theme-text-primary)",
  whiteSpace: "pre-wrap",
};

export function BotCorrectionsCard({ initial, canResolve }: BotCorrectionsCardProps) {
  const toast = useToast;
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function resolve(id: string, status: "applied" | "dismissed") {
    setBusyId(id);
    startTransition(async () => {
      const r = await resolveBotCorrectionAction({ id, status });
      if (r.error) toast.danger(r.error);
      else setRows((prev) => prev.filter((x) => x.id !== id));
      setBusyId(null);
    });
  }

  return (
    <div className="mb-4">
      <SectionCard
        title={`Corrections from the team · ${rows.length}`}
        description="Fix the pack (a fact, a story, an answer), publish, then mark it applied."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {rows.map((c) => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <p className="label-micro" style={{ margin: 0 }}>She said · {formatDate(c.created_at, "dd MMM, h:mm a")}</p>
              <p style={quote}>{c.what_she_said}</p>
              <p className="label-micro" style={{ margin: 0 }}>She should have said</p>
              <p style={quote}>{c.should_have_said}</p>
              {c.note && <p style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)", margin: 0 }}>{c.note}</p>}
              {canResolve && (
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Button variant="control" size="sm" type="button" onClick={() => resolve(c.id, "applied")} disabled={pending} loading={pending && busyId === c.id}>
                    Applied
                  </Button>
                  <Button variant="ghost" size="sm" type="button" onClick={() => resolve(c.id, "dismissed")} disabled={pending}>
                    She was right
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
