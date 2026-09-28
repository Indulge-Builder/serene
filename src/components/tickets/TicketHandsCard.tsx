"use client";

// TicketHandsCard — the line to the outside agent, on the ticket page (0245; hands plan Layer C).
// Shown only when the ticket's vendor is an agent (vendors.kind = agent). Before a thread exists:
// one button that opens it (openHandsThreadCore, the same core Elaya's resolver uses). After: the
// last line each way and a link to the thread on /hands. Display and calls only.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot } from "lucide-react";
import { CardHeader } from "@/components/leads/CardHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/lib/toast";
import { openHandsThreadAction } from "@/lib/actions/hands";
import { HANDS_PATH } from "@/lib/constants/hands";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { HandsThreadRow } from "@/lib/types/hands";

const SHELL = { background: "var(--theme-paper)", border: "1px solid var(--theme-paper-border)", borderRadius: "var(--neu-radius-card)", boxShadow: "var(--shadow-1)", overflow: "hidden" } as const;
const BODY = { padding: "var(--space-4) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" } as const;

export function TicketHandsCard({ ticketId, vendorName, thread, live, enabled }: { ticketId: string; vendorName: string; thread: HandsThreadRow | null; live: boolean; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const open = () => start(async () => {
    const r = await openHandsThreadAction({ ticketId });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not open the line."); return; }
    toast.success("Line open. Draft the opening message on the Hands page or ask Elaya.");
    router.push(`${HANDS_PATH}?thread=${r.data.id}`);
  });
  return (
    <div style={SHELL}>
      <CardHeader icon={Bot} label="Hands" right={thread ? <Badge tone={thread.status === "open" ? "info" : "neutral"} size="xs">{thread.status === "open" ? "Line open" : "Closed"}</Badge> : null} />
      <div style={BODY}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)" }}>{vendorName} is an outside agent. It books in the name Indulge Concierge; the member's name, phone and address never leave Serene.</span>
        {thread ? (
          <>
            <span style={{ fontSize: "var(--text-sm)" }}>{thread.last_preview ? `${thread.last_direction === "in" ? "Agent" : "Us"}: ${thread.last_preview}` : "No lines yet."}</span>
            {thread.last_message_at && <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{formatRelativeTime(thread.last_message_at)}</span>}
            <div><Link href={`${HANDS_PATH}?thread=${thread.id}`}><Button size="xs" variant="control">Open the conversation</Button></Link></div>
          </>
        ) : live ? (
          <div><Button size="xs" disabled={pending || !enabled} loading={pending} onClick={open}>{enabled ? "Open the line to the agent" : "Hands is switched off"}</Button></div>
        ) : (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>The ticket is closed; no line was opened.</span>
        )}
      </div>
    </div>
  );
}
