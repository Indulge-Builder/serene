"use client";

// The strip under a conversation's header on the PUBLIC Indulge number (0252): which number it is
// on, who is answering (the concierge, the team, or nobody because they opted out), and the one
// action that flips it. Display + one action call.

import { useState, useTransition } from "react";
import { Bot, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { setChatHandlerAction } from "@/lib/actions/public-bot";
import { HANDOVER_REASONS, type HandoverReason } from "@/lib/constants/public-bot";
import { WHATSAPP_LINE_LABELS } from "@/lib/constants/whatsapp-lines";

export type PublicChatHandler = "bot" | "team" | "opted_out";

interface PublicLineBarProps {
  conversationId: string;
  handler: PublicChatHandler;
  handoverReason: string | null;
  onHandlerChange: (next: PublicChatHandler) => void;
}

export function PublicLineBar({ conversationId, handler, handoverReason, onHandlerChange }: PublicLineBarProps) {
  const [pending, startTransition] = useTransition();
  const [reason] = useState(handoverReason);

  function flip(next: "bot" | "team") {
    startTransition(async () => {
      const r = await setChatHandlerAction({ conversationId, handler: next });
      if (r.error) {
        toast.danger(r.error);
        return;
      }
      onHandlerChange(next);
      toast.success(next === "bot" ? "The concierge is answering again." : "You have this chat. The concierge stays quiet.");
    });
  }

  const reasonLabel = reason && reason in HANDOVER_REASONS ? HANDOVER_REASONS[reason as HandoverReason] : null;
  const text =
    handler === "opted_out" ? "They asked not to be messaged by the concierge."
    : handler === "bot" ? `The Indulge concierge is answering.${reasonLabel ? ` Last hand-over: ${reasonLabel.toLowerCase()}.` : ""}`
    : "The team has this chat. The concierge stays quiet.";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap",
        padding: "var(--space-2) var(--space-4)", flexShrink: 0,
        background: "var(--theme-paper)", borderBottom: "1px solid var(--theme-paper-border)",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)",
          padding: "1px var(--space-2)", borderRadius: "var(--radius-full)",
          background: "var(--theme-accent-surface)", color: "var(--neu-accent-deep)", fontWeight: "var(--weight-medium)",
        }}
      >
        {WHATSAPP_LINE_LABELS.public}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)", flex: 1, minWidth: 0 }}>
        {handler === "bot" ? <Bot style={{ width: 14, height: 14, strokeWidth: 1.5 }} /> : <UserRound style={{ width: 14, height: 14, strokeWidth: 1.5 }} />}
        {text}
      </span>
      {handler === "bot" && (
        <Button variant="control" size="sm" type="button" onClick={() => flip("team")} disabled={pending}>
          Take over
        </Button>
      )}
      {handler === "team" && (
        <Button variant="control" size="sm" type="button" onClick={() => flip("bot")} disabled={pending}>
          Hand back to the concierge
        </Button>
      )}
    </div>
  );
}
