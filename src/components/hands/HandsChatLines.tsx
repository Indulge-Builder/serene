"use client";

// HandsChatLines — THE chat lines of a Hands conversation (2026-10-01): the WhatsApp page's own
// MessageBubble (the lead page composes it the same way) under Sia's day chips, with what Hands
// adds under a bubble (the agent's reply word, "Paid") and the lines still on their way out.
// Composed by the /hands chat (HandsWorkspace) and the ticket card (HandsTicketCard); never
// re-render hands messages another way.

import { MessageBubble } from "@/components/whatsapp/MessageBubble";
import { SiaDaySeparator, ReactionChips } from "@/components/sia/SiaMessageBubble";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/numbers";
import { HANDS_FRAMES, type HandsFrame } from "@/lib/constants/hands";
import type { HandsChatLine, HandsOutboxRow } from "@/lib/types/hands";
import type { WhatsAppMessage } from "@/lib/types/whatsapp";

const FRAME_TONE: Record<HandsFrame, "success" | "warning" | "info" | "danger" | "neutral"> = { done: "success", need: "warning", options: "info", failed: "danger", waiting: "neutral" };

export function HandsChatLines({ messages, outbox, agent }: { messages: HandsMessageView[]; outbox: HandsOutboxRow[]; agent: string }) {
  return (
    <>
      {byDay(messages, outbox).map(({ day, rows }) => (
        <div key={day} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <SiaDaySeparator ts={rows[0].at} />
          {rows.map((r) => r.kind === "message"
            ? <HandsLine key={r.m.id} m={r.m} agent={agent} />
            : <HandsQueued key={r.o.id} o={r.o} />)}
        </div>
      ))}
    </>
  );
}

// ─── One line: the WhatsApp page's bubble, with what Hands adds under it ───────

export type HandsMessageView = HandsChatLine;
type DayRow = { kind: "message"; at: string; m: HandsMessageView } | { kind: "queued"; at: string; o: HandsOutboxRow };

/** Messages and still-unsent lines in time order, grouped by calendar day (the day chip above each group). */
function byDay(messages: HandsMessageView[], outbox: HandsOutboxRow[]): { day: string; rows: DayRow[] }[] {
  const rows: DayRow[] = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.wa_timestamp, m })),
    ...outbox.map((o) => ({ kind: "queued" as const, at: o.requested_at, o })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const days = new Map<string, DayRow[]>();
  for (const r of rows) {
    const day = formatDate(r.at, "yyyy-MM-dd");
    days.set(day, [...(days.get(day) ?? []), r]);
  }
  return [...days.entries()].map(([day, list]) => ({ day, rows: list }));
}

const BUBBLE_TYPES = new Set(["text", "image", "video", "document", "audio"]);

/** A hands message in the shape the WhatsApp bubble reads. */
function asWhatsApp(m: HandsMessageView, agent: string): WhatsAppMessage {
  const out = m.direction === "out";
  return {
    id: m.id, conversation_id: m.thread_id ?? "", lead_id: "", direction: out ? "outbound" : "inbound", sender_type: out ? "agent" : "lead",
    sender_id: null, wa_message_id: m.wa_message_id, message_type: (BUBBLE_TYPES.has(m.kind) ? m.kind : "text") as WhatsAppMessage["message_type"],
    content: m.text, media_url: m.media_url, media_mime_type: m.media_mime,
    status: out ? "sent" : null, status_at: null, is_bot: false, created_at: m.wa_timestamp, sender_name: out ? "You" : agent,
    link_preview: m.link_preview,
  };
}

function HandsLine({ m, agent }: { m: HandsMessageView; agent: string }) {
  const ours = m.direction === "out";
  const extra = (m.frame && HANDS_FRAMES.values.includes(m.frame)) || m.payment?.paid_at;
  const reacted = m.reactions.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ours ? "flex-end" : "flex-start", gap: 2 }}>
      <div className="relative" style={{ width: "100%", marginBottom: reacted ? 12 : 0 }}>
        <MessageBubble message={asWhatsApp(m, agent)} />
        <ReactionChips reactions={m.reactions} fromMe={ours} />
      </div>
      {extra && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 var(--space-2)" }}>
          {m.frame && HANDS_FRAMES.values.includes(m.frame) && <Badge tone={FRAME_TONE[m.frame]} size="xs">{m.frame.toUpperCase()}</Badge>}
          {m.payment?.paid_at && <Badge tone="success" size="xs">Paid {m.payment.paid_amount_inr != null ? formatCurrency(m.payment.paid_amount_inr) : ""}</Badge>}
        </div>
      )}
    </div>
  );
}

/** A line we asked to send that the connector has not sent yet (or refused). */
function HandsQueued({ o }: { o: HandsOutboxRow }) {
  const failed = o.status !== "queued";
  const message: WhatsAppMessage = {
    id: o.id, conversation_id: o.thread_id, lead_id: "", direction: "outbound", sender_type: o.source === "elaya" ? "bot" : "agent", sender_id: null,
    wa_message_id: null, message_type: "text", content: o.text, media_url: null, media_mime_type: null, status: failed ? "failed" : null,
    status_at: null, is_bot: o.source === "elaya", created_at: o.requested_at, sender_name: "You",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <div style={{ width: "100%" }}><MessageBubble message={message} isOptimistic={!failed} /></div>
      <span className="type-caption" style={{ padding: "0 var(--space-2)", color: failed ? "var(--color-danger-text)" : "var(--theme-text-tertiary)" }}>
        {!failed ? "Sending…" : o.status === "refused" ? `Not sent: ${o.error ?? "not allowed"}` : `Failed: ${o.error ?? "unknown"}`}
      </span>
    </div>
  );
}
