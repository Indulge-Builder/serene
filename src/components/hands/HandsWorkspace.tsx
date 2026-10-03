"use client";

// HandsWorkspace — THE /hands page body (0245; hands plan Layer E), laid out like the WhatsApp
// page (2026-10-01): one conversation list on the shared SplitWorkspace (ConversationRailRow; every
// open job and chat, plus each allowed agent with no chat yet, which a click opens), and the chat
// on the right in the WhatsApp page's own MessageBubble under Sia's day chips. Hands adds the reply
// word and "Paid" under a bubble, the payment card when the agent sent a QR, Ask Elaya (she writes
// the line into the composer), Draft from the brief on a job, Send the rulebook, and Teach. Every
// typed line runs through the same leak check. Display and calls only: every write is a server
// action (actions/hands.ts); nothing here sends a WhatsApp message.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Bot, ClipboardList, ExternalLink, Eye, EyeOff, GraduationCap, IndianRupee, MessageCircle, Sparkles, X } from "lucide-react";
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from "@/components/ui/SplitWorkspace";
import { ConversationRailRow } from "@/components/ui/ConversationRailRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageBar } from "@/components/ui/MessageBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormSelect } from "@/components/ui/FormSelect";
import { PageControls } from "@/components/layout/PageControls";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { HandsChatLines } from "@/components/hands/HandsChatLines";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import { toast } from "@/lib/toast";
import { formatRelativeTime } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/numbers";
import { scrollToBottom } from "@/lib/utils/scroll";
import { HANDS_QR_LIFETIME_MS } from "@/lib/constants/hands";
import {
  closeHandsThreadAction, draftHandsMessageAction, fileHandsMessageAction, getHandsGuidesAction, getHandsThreadAction, improveHandsGuidesAction, listHandsThreadsAction, listHandsUnfiledAction,
  listHandsUnmatchedAction, markHandsPaymentAction, openTalkThreadAction, sendHandsMessageAction, writeHandsLineAction,
  type HandsThreadView,
} from "@/lib/actions/hands";
import type { HandsThreadSummary, HandsUnfiled, HandsUnmatched } from "@/lib/services/hands-service";
import type { HandsDraft } from "@/lib/services/hands-draft";
import type { HandsAllowedContactRow, HandsConnectorStatusRow, HandsMessageRow } from "@/lib/types/hands";

const POLL_MS = 8_000;
const HANDS_THREAD_PARAM = "thread";


type RailItem =
  | { type: "thread"; key: string; at: number; t: HandsThreadSummary }
  | { type: "contact"; key: string; at: number; c: HandsAllowedContactRow; waiting: { count: number; lastAt: string; lastText: string | null } | null };

export function HandsWorkspace({ initialThreads, contacts, connector, canConfigure, canTeach, initialThreadId, perJobCapInr, viewerCanPayAbove, unfiled: initialUnfiled = {} }: {
  initialThreads: HandsThreadSummary[];
  contacts: HandsAllowedContactRow[];
  connector: HandsConnectorStatusRow | null;
  canConfigure: boolean;
  /** admin / founder: may rewrite the rulebook and Elaya's guide from a conversation. */
  canTeach: boolean;
  initialThreadId: string | null;
  perJobCapInr: number;
  /** admin / founder / manager / a bishop or queen: may mark a payment above the per-job cap. */
  viewerCanPayAbove: boolean;
  /** Messages an agent sent while no chat with it was open, per number. Opening the chat files them. */
  unfiled?: HandsUnfiled;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [threads, setThreads] = useState(initialThreads);
  const [unfiled, setUnfiled] = useState<HandsUnfiled>(initialUnfiled);
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId);
  const [view, setView] = useState<HandsThreadView | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [opening, startOpening] = useTransition();
  const isMobile = useMediaQuery(MQ.mobile);

  const [unmatched, setUnmatched] = useState<(HandsUnmatched & { media_url: string | null })[]>([]);
  const refreshList = useCallback(async () => {
    const [r, u, x] = await Promise.all([listHandsThreadsAction({ status: "open" }), listHandsUnfiledAction(), listHandsUnmatchedAction()]);
    if (r.data) setThreads(r.data);
    if (u.data) setUnfiled(u.data);
    if (x.data) setUnmatched(x.data);
  }, []);
  useEffect(() => { void listHandsUnmatchedAction().then((x) => { if (x.data) setUnmatched(x.data); }); }, []);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingThread(true);
    const r = await getHandsThreadAction({ threadId: id });
    if (r.data) setView(r.data);
    else if (!quiet) toast.danger(r.error ?? "Could not open the conversation.");
    setLoadingThread(false);
  }, []);

  // Open on select; keep the url in step so a link to one job survives a reload.
  useEffect(() => {
    if (!selectedId) { setView(null); return; }
    void loadThread(selectedId);
    const next = new URLSearchParams(params.toString());
    next.set(HANDS_THREAD_PARAM, selectedId);
    router.replace(`?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The line is live traffic: poll the open thread and the rail quietly (no Realtime on the hands schema yet).
  useEffect(() => {
    const t = setInterval(() => { void refreshList(); if (selectedId) void loadThread(selectedId, true); }, POLL_MS);
    return () => clearInterval(t);
  }, [refreshList, loadThread, selectedId]);

  // One list, like the WhatsApp page: every open conversation, plus every allowed agent that has no
  // open chat yet (clicking it opens one and files what it already sent). Newest activity first.
  const items = useMemo<RailItem[]>(() => {
    const withTalk = new Set(threads.filter((t) => t.kind === "talk").map((t) => t.jid));
    const rows: RailItem[] = threads.map((t) => ({ type: "thread", key: t.id, at: t.last_message_at ? new Date(t.last_message_at).getTime() : 0, t }));
    for (const c of contacts) {
      if (!c.is_active || withTalk.has(c.jid)) continue;
      const waiting = unfiled[c.jid] ?? null;
      rows.push({ type: "contact", key: `c-${c.jid}`, at: waiting ? new Date(waiting.lastAt).getTime() : -1, c, waiting });
    }
    return rows.sort((a, b) => b.at - a.at);
  }, [threads, contacts, unfiled]);

  const openChat = (c: HandsAllowedContactRow) => startOpening(async () => {
    const r = await openTalkThreadAction({ jid: c.jid });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not open the chat."); return; }
    await refreshList();
    setSelectedId(r.data.id);
  });

  const selected = threads.find((t) => t.id === selectedId) ?? view?.thread ?? null;
  const connected = connector?.connected && Date.now() - new Date(connector.beat_at).getTime() < 3 * 60_000;
  const firstWaiting = items.find((i): i is Extract<RailItem, { type: "contact" }> => i.type === "contact" && Boolean(i.waiting));

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="type-page-title m-0">Hands<span className="page-title-dot">.</span></h1>
          <Badge tone={connected ? "success" : "warning"}>{connected ? "Line connected" : connector?.state === "pairing" ? "Waiting for the phone" : "Line offline"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {canConfigure && <Link href="/settings/hands" className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>Settings</Link>}
          {TOP_BAR_ENABLED && <PageControls isPrivileged={false} />}
        </div>
      </div>

      {unmatched.length > 0 && <UnmatchedTray items={unmatched} onFiled={() => { void refreshList(); if (selectedId) void loadThread(selectedId, true); }} />}

      <SplitWorkspace>
        {(!isMobile || !selectedId) && (
        <SplitRail>
          <SplitRailHeader>
            <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>Conversations</span>
          </SplitRailHeader>
          <SplitRailList>
            {items.length === 0 ? (
              <div style={{ padding: "var(--space-6) var(--space-4)" }}>
                <EmptyState variant="inline" title="No conversations yet" description={canConfigure ? "Add the agent's number in Settings. Its chat appears here." : "When the agent's number is set up, its chat appears here."} />
              </div>
            ) : items.map((item, i) => item.type === "thread" ? (
              <ConversationRailRow
                key={item.key}
                index={i}
                title={item.t.kind === "talk" ? item.t.contact_label : `${item.t.ticket_no ?? "Ticket"} · ${item.t.member_name ?? "Member"}`}
                avatarName={item.t.kind === "talk" ? item.t.contact_label : item.t.member_name ?? item.t.contact_label}
                meta={item.t.last_message_at ? formatRelativeTime(item.t.last_message_at) : null}
                preview={<span>{item.t.kind === "ticket" ? `${item.t.contact_label}: ` : ""}{item.t.last_direction === "out" ? "You: " : ""}{item.t.last_preview ?? item.t.ticket_title ?? "No messages yet"}{item.t.queued > 0 ? ` · ${item.t.queued} sending` : ""}</span>}
                selected={item.t.id === selectedId}
                unread={item.t.last_direction === "in"}
                onSelect={() => setSelectedId(item.t.id)}
              />
            ) : (
              <ConversationRailRow
                key={item.key}
                index={i}
                title={item.c.label}
                avatarName={item.c.label}
                meta={item.waiting ? formatRelativeTime(item.waiting.lastAt) : null}
                preview={<span>{item.waiting ? `${item.waiting.count} new · ${item.waiting.lastText ?? ""}` : "No chat yet. Click to start one."}</span>}
                selected={false}
                unread={Boolean(item.waiting)}
                onSelect={() => { if (!opening) openChat(item.c); }}
              />
            ))}
          </SplitRailList>
        </SplitRail>
        )}

        <SplitPane className={selectedId ? "flex flex-col" : "hidden md:flex items-center justify-center"}>
          {!selectedId || !selected ? (
            <EmptyState
              icon={Bot}
              title={firstWaiting ? `${firstWaiting.c.label} wrote to us` : "Pick a conversation"}
              description={firstWaiting?.waiting
                ? `${firstWaiting.waiting.count} message${firstWaiting.waiting.count === 1 ? "" : "s"}, the last ${formatRelativeTime(firstWaiting.waiting.lastAt)}. Open the chat to read and answer.`
                : "Choose a conversation on the left. Elaya can write the lines for you; nothing is sent until you press send."}
              action={firstWaiting ? <Button size="sm" loading={opening} onClick={() => openChat(firstWaiting.c)}><MessageCircle className="w-4 h-4" strokeWidth={1.5} /> Open the chat</Button> : undefined}
            />
          ) : (
            <ThreadPane
              key={selected.id}
              summary={selected}
              view={view}
              loading={loadingThread}
              perJobCapInr={perJobCapInr}
              viewerCanPayAbove={viewerCanPayAbove}
              canTeach={canTeach}
              onBack={isMobile ? () => setSelectedId(null) : undefined}
              onChanged={() => { void loadThread(selected.id, true); void refreshList(); }}
              onClosed={() => { setSelectedId(null); void refreshList(); }}
            />
          )}
        </SplitPane>
      </SplitWorkspace>
    </>
  );
}

// ─── The pane ────────────────────────────────────────────────────────────────

function ThreadPane({ summary, view, loading, perJobCapInr, viewerCanPayAbove, canTeach, onBack, onChanged, onClosed }: {
  summary: HandsThreadSummary; view: HandsThreadView | null; loading: boolean; perJobCapInr: number; viewerCanPayAbove: boolean; canTeach: boolean;
  onBack?: () => void; onChanged: () => void; onClosed: () => void;
}) {
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<"ask" | "teach" | null>(null);
  const [ask, setAsk] = useState("");
  const [teach, setTeach] = useState("");
  const [rulebook, setRulebook] = useState<{ body: string; version: number } | null>(null);
  const [draft, setDraft] = useState<HandsDraft | null>(null);
  const [tickAddress, setTickAddress] = useState(false);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const count = view?.messages.length ?? 0;
  useEffect(() => { if (listRef.current) scrollToBottom(listRef.current); }, [count, view?.outbox.length]);

  const send = (line: string, fromDraft: boolean) => start(async () => {
    const r = await sendHandsMessageAction({ threadId: summary.id, text: line, tick: tickAddress ? ["delivery_address"] : [], fromDraft });
    if (r.error) { toast.danger(r.error); return; }
    setText(""); setDraft(null);
    toast.success("Queued. It leaves the line within a few seconds.");
    onChanged();
  });

  const askElaya = () => start(async () => {
    if (!summary.ticket_id) { toast.warning("A draft comes from a ticket's brief; this is a free talk."); return; }
    const r = await draftHandsMessageAction({ ticketId: summary.ticket_id, tick: tickAddress ? ["delivery_address"] : [] });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not draft."); return; }
    setDraft(r.data);
  });

  // Elaya writes the line from an instruction, following the live guide; it lands in the composer.
  const askElayaToWrite = () => start(async () => {
    const r = await writeHandsLineAction({ threadId: summary.id, instruction: ask });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not write a line."); return; }
    setText(r.data.text); setAsk(""); setPanel(null);
    toast.success("Elaya wrote it into the box below. Read it, change anything, then send.");
  });

  const teachElaya = () => start(async () => {
    const r = await improveHandsGuidesAction({ feedback: teach, threadId: summary.id });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not rewrite."); return; }
    const { changed, summary: what } = r.data;
    setTeach(""); setPanel(null);
    const which = changed.rulebook && changed.guide ? "The rulebook and Elaya's guide" : changed.rulebook ? "The rulebook" : changed.guide ? "Elaya's guide" : null;
    toast.success(which ? `${which} updated${what ? `: ${what}` : "."}${changed.rulebook ? " Send the rulebook again so the agent has it." : ""}` : "Elaya read it; nothing needed to change.");
  });

  const openRulebook = () => start(async () => {
    const r = await getHandsGuidesAction();
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not read the rulebook."); return; }
    setRulebook({ body: r.data.rulebook.body, version: r.data.rulebook.version });
  });

  const close = () => start(async () => {
    const r = await closeHandsThreadAction({ threadId: summary.id });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("Line closed.");
    onClosed();
  });

  const payment = [...(view?.messages ?? [])].reverse().find((m) => m.payment && !m.payment.paid_at);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--theme-paper-border)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
          {onBack && <Button variant="ghost" iconOnly size="sm" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="w-4 h-4" strokeWidth={1.5} /></Button>}
          <Avatar name={summary.contact_label} size="sm" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "var(--text-base)", color: "var(--theme-text-primary)", margin: "0 0 1px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary.contact_label}</p>
            <p className="type-caption" style={{ margin: 0, color: "var(--theme-text-tertiary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {summary.ticket_no
                ? <><Link href={`/tickets/${summary.ticket_id}`} style={{ color: "var(--neu-accent-deep)", display: "inline-flex", alignItems: "center", gap: 4 }}><ClipboardList className="w-3 h-3" strokeWidth={1.5} />{summary.ticket_no}<ExternalLink className="w-3 h-3" strokeWidth={1.5} /></Link><span>{summary.ticket_title ?? ""}</span></>
                : <span style={{ fontFamily: "var(--font-mono)" }}>+{summary.jid.split("@")[0]} · no member data in this chat</span>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <Button size="xs" variant={panel === "ask" ? "primary" : "control"} disabled={pending} onClick={() => setPanel(panel === "ask" ? null : "ask")}><Sparkles className="w-3 h-3" strokeWidth={1.5} /> Ask Elaya</Button>
          {summary.ticket_id && <Button size="xs" variant="control" disabled={pending} onClick={askElaya}><ClipboardList className="w-3 h-3" strokeWidth={1.5} /> Draft from the brief</Button>}
          {summary.kind === "talk" && <Button size="xs" variant="control" disabled={pending} onClick={openRulebook}><BookOpen className="w-3 h-3" strokeWidth={1.5} /> Send the rulebook</Button>}
          {canTeach && <Button size="xs" variant={panel === "teach" ? "primary" : "ghost"} disabled={pending} onClick={() => setPanel(panel === "teach" ? null : "teach")}><GraduationCap className="w-3 h-3" strokeWidth={1.5} /> Teach</Button>}
          <Button size="xs" variant="ghost" disabled={pending} onClick={close}>Close line</Button>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)", background: "var(--theme-paper-subtle)", overscrollBehavior: "contain" }}>
        {loading && !view && <div className="type-caption" style={{ color: "var(--theme-text-tertiary)", margin: "auto" }}>Opening…</div>}
        {view && view.messages.length === 0 && view.outbox.length === 0 && (
          <div style={{ margin: "auto" }}>
            <EmptyState variant="inline" title="Nothing said yet" description={summary.ticket_id ? "Draft the opening line from the brief, ask Elaya to write one, or write it yourself." : "Send the rulebook first, then ask Elaya to write, or write it yourself."} />
          </div>
        )}
        {view && <HandsChatLines messages={view.messages} outbox={view.outbox} agent={summary.contact_label} />}
      </div>

      {payment && payment.payment && (
        <PaymentCard m={payment} perJobCapInr={perJobCapInr} viewerCanPayAbove={viewerCanPayAbove} onPaid={onChanged} />
      )}

      {draft && (
        <div style={{ margin: "0 var(--space-4) var(--space-3)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--neu-radius-tile, var(--radius-md))", border: "1px solid var(--theme-paper-border)", background: "var(--theme-paper-subtle)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", display: "inline-flex", alignItems: "center", gap: 6 }}><Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} /> Elaya's draft · {draft.trust.split(":")[0]}</span>
            <button type="button" onClick={() => setDraft(null)} aria-label="Dismiss the draft" style={{ background: "none", border: 0, color: "var(--theme-text-tertiary)", cursor: "pointer" }}><X className="w-4 h-4" strokeWidth={1.5} /></button>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--text-sm)", color: "var(--theme-text-primary)" }}>{draft.text}</pre>
          <div className="type-caption" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: "var(--theme-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}><Eye className="w-3 h-3" strokeWidth={1.5} /> Sent: {draft.sent.length ? draft.sent.map((s) => s.field).join(", ") : "only the request"}</span>
            <span style={{ color: "var(--theme-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}><EyeOff className="w-3 h-3" strokeWidth={1.5} /> Held back: {draft.heldBack.length ? draft.heldBack.map((h) => `${h.field}${h.reason === "needs_tick" ? " (needs your tick)" : ""}`).join(", ") : "nothing"}; the member's name, phone and contact never go.</span>
            {draft.leaks.length > 0 && <span style={{ color: "var(--color-danger-text)" }}>Blocked: the text carries {draft.leaks.length} item{draft.leaks.length === 1 ? "" : "s"} that must not leave Serene.</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {draft.heldBack.some((h) => h.field === "delivery_address") && (
              <Checkbox checked={tickAddress} onChange={setTickAddress} label="Include the delivery address on this job" size={16} />
            )}
            <div style={{ display: "flex", gap: "var(--space-2)", marginLeft: "auto" }}>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Dismiss</Button>
              <Button size="sm" disabled={pending || draft.leaks.length > 0} loading={pending} onClick={() => send(draft.text, true)}>Approve and send</Button>
            </div>
          </div>
        </div>
      )}

      {panel && (
        <div style={{ margin: "0 var(--space-4) var(--space-3)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--neu-radius-tile, var(--radius-md))", border: "1px solid var(--theme-paper-border)", background: "var(--theme-paper-subtle)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {panel === "ask" ? <><Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} /> What should Elaya say to {summary.contact_label}?</> : <><GraduationCap className="w-3.5 h-3.5" strokeWidth={1.5} /> What should change about how we work with {summary.contact_label}?</>}
            </span>
            <button type="button" onClick={() => setPanel(null)} aria-label="Close" style={{ background: "none", border: 0, color: "var(--theme-text-tertiary)", cursor: "pointer" }}><X className="w-4 h-4" strokeWidth={1.5} /></button>
          </div>
          {panel === "ask" ? (
            <>
              <Textarea rows={2} maxLength={1000} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="For example: ask what they can book in Dubai this weekend, and how they take payment." aria-label="What Elaya should say" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>She follows the guide in Settings and reads this chat. Nothing is sent until you press send.</span>
                <Button size="sm" disabled={pending || !ask.trim()} loading={pending} onClick={askElayaToWrite}>Write it</Button>
              </div>
            </>
          ) : (
            <>
              <Textarea rows={2} maxLength={2000} value={teach} onChange={(e) => setTeach(e.target.value)} placeholder="For example: it sent five options, two is enough. Or: Elaya was too formal, keep it short." aria-label="Your feedback" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>Elaya reads this chat, rewrites the rulebook and her guide, and keeps every earlier version in Settings.</span>
                <Button size="sm" disabled={pending || !teach.trim()} loading={pending} onClick={teachElaya}>Rewrite the guides</Button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={rulebook !== null}
        title={`Send the rulebook to ${summary.contact_label}?`}
        body={<pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)", maxHeight: 320, overflowY: "auto" }}>{rulebook?.body}</pre>}
        confirmLabel={rulebook ? `Send version ${rulebook.version}` : "Send"}
        pending={pending}
        onConfirm={() => { if (rulebook) { send(rulebook.body, false); setRulebook(null); } }}
        onCancel={() => setRulebook(null)}
      />

      <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "1px solid var(--theme-paper-border)" }}>
        <MessageBar value={text} onChange={setText} onSend={() => text.trim() && send(text, false)} sendOnEnter placeholder={`Message ${summary.contact_label}… (a name, phone or email is refused)`} disabled={pending} loading={pending} maxLength={4000} maxHeight={96} />
      </div>
    </>
  );
}

// ─── The PAY step ────────────────────────────────────────────────────────────

function PaymentCard({ m, perJobCapInr, viewerCanPayAbove, onPaid }: { m: HandsMessageRow & { media_url: string | null }; perJobCapInr: number; viewerCanPayAbove: boolean; onPaid: () => void }) {
  const p = m.payment!;
  const [amount, setAmount] = useState(p.amount_inr != null ? String(p.amount_inr) : "");
  const [pending, start] = useTransition();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const expiresAt = p.expires_at ? new Date(p.expires_at).getTime() : new Date(m.wa_timestamp).getTime() + HANDS_QR_LIFETIME_MS;
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const n = Number(amount);
  const overCap = Number.isFinite(n) && n > perJobCapInr;
  const blocked = overCap && !viewerCanPayAbove;
  return (
    <div style={{ margin: "0 var(--space-4) var(--space-3)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--neu-radius-tile, var(--radius-md))", border: `1px solid ${blocked ? "var(--color-danger)" : "var(--theme-paper-border)"}`, background: "var(--theme-paper)", display: "flex", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
      {m.media_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.media_url} alt="Payment QR" style={{ width: 160, height: 160, objectFit: "contain", borderRadius: "var(--radius-sm)", background: "var(--theme-paper-subtle)" }} />
      )}
      <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", display: "flex", alignItems: "center", gap: 6 }}><IndianRupee className="w-4 h-4" strokeWidth={1.5} /> The agent asks for a payment</div>
        <div className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>
          {p.amount_inr != null ? `Asked: ${formatCurrency(p.amount_inr)}` : "Amount not read from the message"}{p.payee ? ` · payee ${p.payee}` : ""} · per-job cap {formatCurrency(perJobCapInr)} · QR {left > 0 ? `expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "has expired; ask for a fresh one"}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Input type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount paid (₹)" style={{ maxWidth: 180 }} aria-label="Amount paid in rupees" />
          <Button size="sm" disabled={pending || !Number.isFinite(n) || n <= 0 || blocked} loading={pending} onClick={() => start(async () => {
            const r = await markHandsPaymentAction({ messageId: m.id, amountInr: n });
            if (r.error) { toast.danger(r.error); return; }
            toast.success("Recorded on the ticket; the agent is told it is paid.");
            onPaid();
          })}>I scanned and paid</Button>
        </div>
        {blocked && <span className="type-caption" style={{ color: "var(--color-danger-text)" }}>Above your cap. A bishop, admin or founder must mark this one.</span>}
        <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>Scan with the Indulge UPI phone. The agent never sees our account; we only ever scan its QR.</span>
      </div>
    </div>
  );
}

// ─── The tray: replies that need a job (2026-10-03) ──────────────────────────

/**
 * Replies the agent sent without a job code that Elaya could not place with confidence. A person
 * picks the job; the ticket then sees the line as the agent's message. Hidden when empty.
 */
function UnmatchedTray({ items, onFiled }: { items: (HandsUnmatched & { media_url: string | null })[]; onFiled: () => void }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const file = (messageId: string) => start(async () => {
    const threadId = choice[messageId];
    if (!threadId) { toast.warning("Choose the job first."); return; }
    const r = await fileHandsMessageAction({ messageId, threadId });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("Filed on the job.");
    onFiled();
  });
  return (
    <div className="mb-4" style={{ padding: "var(--space-3) var(--space-4)", borderRadius: "var(--neu-radius-card)", border: "1px solid var(--theme-paper-border)", background: "var(--theme-paper)", boxShadow: "var(--shadow-1)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>
        {items.length} {items.length === 1 ? "reply needs" : "replies need"} a job
        <span className="type-caption" style={{ color: "var(--theme-text-tertiary)", marginLeft: "var(--space-2)" }}>The agent wrote without a job code and Elaya was not sure which job it was about.</span>
      </span>
      {items.slice(0, 8).map(({ message: m, jobs, media_url }) => (
        <div key={m.id} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap", paddingTop: "var(--space-2)", borderTop: "1px solid var(--theme-paper-border)" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: 60 }}>
              {m.text ?? (media_url ? <a href={media_url} target="_blank" rel="noreferrer" style={{ color: "var(--neu-accent-deep)" }}>Open the {m.kind}</a> : `[${m.kind}]`)}
            </div>
            <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>{formatRelativeTime(m.wa_timestamp)}</span>
          </div>
          <div style={{ minWidth: 220, flex: "0 1 280px" }}>
            <FormSelect value={choice[m.id] ?? ""} onValueChange={(v) => setChoice((c) => ({ ...c, [m.id]: v }))} aria-label="The job this reply is about">
              <option value="" disabled>Choose the job</option>
              {jobs.map((j) => <option key={j.threadId} value={j.threadId}>{j.label}</option>)}
            </FormSelect>
          </div>
          <Button size="sm" variant="control" disabled={pending || !choice[m.id]} onClick={() => file(m.id)}>File it</Button>
        </div>
      ))}
    </div>
  );
}
