"use client";

// HandsTicketCard — the outside agent on the ticket page (2026-10-01; replaces TicketHandsCard).
// Elaya reads a new ticket and, if the agent can help, writes the first message
// (services/hands-ticket.ts). This card shows where that stands: Elaya reading; her draft with
// Send to Instinct / Not now (the category's trust is L0); why she thinks the agent cannot help,
// with Ask anyway; or, once the chat is open, the conversation itself in the WhatsApp page's
// bubbles (HandsChatLines) with a reply box and a link to the full chat on /hands. Polls while
// something is moving. Display and calls only: every write is a server action (actions/hands.ts).

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bot, ExternalLink, EyeOff, Send } from "lucide-react";
import { CardHeader } from "@/components/leads/CardHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Field";
import { MessageBar } from "@/components/ui/MessageBar";
import { ElayaGlyph } from "@/components/ui/elaya-glyph";
import { HandsChatLines } from "@/components/hands/HandsChatLines";
import { toast } from "@/lib/toast";
import { scrollToBottom } from "@/lib/utils/scroll";
import { dismissHandsTicketDraftAction, getHandsTicketViewAction, sendHandsTicketLineAction, startHandsForTicketAction } from "@/lib/actions/hands";
import { HANDS_PATH } from "@/lib/constants/hands";
import { TICKET_BRIEF_FIELD_LABELS } from "@/lib/constants/tickets";
import type { HandsTicketView } from "@/lib/services/hands-ticket";

const POLL_MS = 6_000;
const SHELL = { background: "var(--theme-paper)", border: "1px solid var(--theme-paper-border)", borderRadius: "var(--neu-radius-card)", boxShadow: "var(--shadow-1)", overflow: "hidden" } as const;
const BODY = { padding: "var(--space-4) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" } as const;
const NOTE = { fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)", margin: 0 } as const;

export function HandsTicketCard({ ticketId, initial, live, canWrite }: { ticketId: string; initial: HandsTicketView; live: boolean; canWrite: boolean }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState(initial.plan?.text ?? "");
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const agent = view.thread?.contact_label ?? view.agent?.label ?? "the agent";

  const refresh = useCallback(async () => {
    const r = await getHandsTicketViewAction({ ticketId });
    if (!r.data) return;
    setView((prev) => {
      // A new draft replaces the box's text; an edit in progress on the same draft is kept.
      if (r.data!.plan?.runId !== prev.plan?.runId) setDraft(r.data!.plan?.text ?? "");
      return r.data!;
    });
  }, [ticketId]);

  // Poll while something can move: Elaya reading, a fresh ticket she has not read yet, or an open chat.
  const waitingForElaya = view.working || (view.autoEligible && view.enabled && Boolean(view.agent) && !view.attempted && !view.thread && !view.dismissed);
  const moving = live && (waitingForElaya || Boolean(view.thread));
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [moving, refresh]);

  const lines = view.messages.length + view.outbox.length;
  useEffect(() => { if (listRef.current) scrollToBottom(listRef.current); }, [lines]);

  const ask = (insist: boolean) => start(async () => {
    const r = await startHandsForTicketAction({ ticketId, insist });
    if (r.error || !r.data) { toast.danger(r.error ?? "Elaya could not read this ticket."); return; }
    if (r.data.status === "sent") toast.success(`Elaya sent it to ${agent}. The reply shows here.`);
    else if (r.data.status === "drafted") toast.success("Elaya wrote the message. Check it, then send.");
    else if (r.data.status === "not_suitable") toast.info(`Elaya thinks ${agent} cannot help: ${r.data.reason ?? ""}`);
    await refresh();
  });

  const send = (text: string, fromDraft: boolean) => start(async () => {
    const r = await sendHandsTicketLineAction({ ticketId, text, fromDraft });
    if (r.error) { toast.danger(r.error); return; }
    setReply("");
    toast.success(`Sent to ${agent}. The reply shows here.`);
    await refresh();
  });

  const notNow = () => start(async () => {
    const r = await dismissHandsTicketDraftAction({ ticketId });
    if (r.error) { toast.danger(r.error); return; }
    await refresh();
  });

  const badge = view.thread
    ? <Badge tone={view.thread.status === "open" ? "info" : "neutral"} size="xs">{view.thread.status === "open" ? "Chat open" : "Closed"}</Badge>
    : view.plan?.helps && !view.dismissed ? <Badge tone="warning" size="xs">Draft waiting</Badge> : null;

  return (
    <div style={SHELL}>
      <CardHeader icon={Bot} label={agent} right={badge} />
      <div style={BODY}>
        {view.thread ? (
          <>
            <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", margin: "0 calc(-1 * var(--space-2))", borderRadius: "var(--radius-md)", background: "var(--theme-paper-subtle)", overscrollBehavior: "contain" }}>
              {lines === 0
                ? <p style={{ ...NOTE, textAlign: "center", padding: "var(--space-4) 0" }}>The chat is open; nothing has been said yet.</p>
                : <HandsChatLines messages={view.messages} outbox={view.outbox} agent={agent} />}
            </div>
            {view.thread.last_direction === "out" && <p style={{ ...NOTE, color: "var(--theme-text-tertiary)" }}>Waiting for {agent}'s reply. It shows here as soon as it lands.</p>}
            {live && canWrite && view.thread.status === "open" && (
              <MessageBar value={reply} onChange={setReply} onSend={() => reply.trim() && send(reply, false)} sendOnEnter placeholder={`Reply to ${agent}… (a name, phone or email is refused)`} disabled={pending} loading={pending} maxLength={4000} maxHeight={96} />
            )}
            <div><Link href={`${HANDS_PATH}?thread=${view.thread.id}`}><Button size="xs" variant="control"><ExternalLink className="w-3 h-3" strokeWidth={1.5} /> Open the full chat</Button></Link></div>
          </>
        ) : !view.enabled ? (
          <p style={NOTE}>Hands is switched off in Settings, so nothing goes to {agent}.</p>
        ) : !live ? (
          <p style={NOTE}>The ticket is closed; {agent} was not asked.</p>
        ) : waitingForElaya ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <ElayaGlyph size={24} breathing />
            <p style={NOTE}>Elaya is reading this ticket and writing to {agent}…</p>
          </div>
        ) : view.plan && !view.dismissed && view.plan.helps ? (
          <>
            <p style={NOTE}>Elaya wrote this for {agent}. Change anything, then send.</p>
            <Textarea rows={6} maxLength={4000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`The message to ${agent}`} disabled={!canWrite} />
            <p style={{ ...NOTE, display: "flex", gap: 6, alignItems: "flex-start", color: "var(--theme-text-tertiary)" }}>
              <EyeOff className="w-3 h-3" strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>Shares only {view.plan.sent.length ? view.plan.sent.map((f) => TICKET_BRIEF_FIELD_LABELS[f as keyof typeof TICKET_BRIEF_FIELD_LABELS] ?? f).join(", ") : "the request itself"}. The member's name, phone and address never go.</span>
            </p>
            {canWrite && (
              <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                <Button size="sm" variant="ghost" disabled={pending} onClick={notNow}>Not now</Button>
                <Button size="sm" disabled={pending || !draft.trim()} loading={pending} onClick={() => send(draft, true)}><Send className="w-3.5 h-3.5" strokeWidth={1.5} /> Send to {agent}</Button>
              </div>
            )}
            {!view.sendsOnHerOwn && <p style={{ ...NOTE, color: "var(--theme-text-tertiary)" }}>Elaya sends on her own for this category once its level in Hands settings is Open.</p>}
          </>
        ) : view.plan && !view.dismissed && !view.plan.helps ? (
          <>
            <p style={NOTE}>Elaya thinks {agent} cannot help with this one{view.plan.why ? `: ${view.plan.why}` : "."}</p>
            {canWrite && <div><Button size="xs" variant="control" disabled={pending} loading={pending} onClick={() => ask(true)}>Ask {agent} anyway</Button></div>}
          </>
        ) : (
          <>
            <p style={NOTE}>{view.dismissed ? "Elaya's message was set aside." : `${agent} can research, quote and book for this ticket.`} Elaya reads the ticket and writes the message; nothing goes until it is sent.</p>
            {canWrite && <div><Button size="xs" disabled={pending} loading={pending} onClick={() => ask(false)}><ElayaGlyph size={14} breathing /> Ask {agent}</Button></div>}
          </>
        )}
      </div>
    </div>
  );
}
