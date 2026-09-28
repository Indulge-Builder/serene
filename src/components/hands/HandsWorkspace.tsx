"use client";

// HandsWorkspace — THE /hands page body (0245; hands plan Layer E). The Sia workspace's
// anatomy on the shared SplitWorkspace: a rail of live jobs (ConversationRailRow) beside the
// thread pane. Jobs and Talk are two rail filters. The pane shows the conversation as bubbles
// (ours on the right), the payment card when the agent sent a QR, a disclosure line under each
// line we sent, Elaya's draft with what was held back before Approve, and a composer whose text
// runs through the same leak check as every other line. Display and calls only: every write is a
// server action (actions/hands.ts); nothing here sends a WhatsApp message.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot, ClipboardList, ExternalLink, Eye, EyeOff, IndianRupee, Sparkles, X } from "lucide-react";
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from "@/components/ui/SplitWorkspace";
import { ConversationRailRow } from "@/components/ui/ConversationRailRow";
import { SelectionButton } from "@/components/ui/SelectionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageBar } from "@/components/ui/MessageBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Field";
import { PageControls } from "@/components/layout/PageControls";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { renderWaText } from "@/components/ui/WaText";
import { toast } from "@/lib/toast";
import { formatDate, formatRelativeTime } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/numbers";
import { scrollToBottom } from "@/lib/utils/scroll";
import { HANDS_QR_LIFETIME_MS, HANDS_FRAMES, type HandsFrame } from "@/lib/constants/hands";
import {
  closeHandsThreadAction, draftHandsMessageAction, getHandsThreadAction, listHandsThreadsAction, markHandsPaymentAction, openTalkThreadAction, sendHandsMessageAction,
  type HandsThreadView,
} from "@/lib/actions/hands";
import type { HandsThreadSummary } from "@/lib/services/hands-service";
import type { HandsDraft } from "@/lib/services/hands-draft";
import type { HandsAllowedContactRow, HandsConnectorStatusRow, HandsMessageRow } from "@/lib/types/hands";

const POLL_MS = 8_000;
const HANDS_THREAD_PARAM = "thread";

type RailFilter = "jobs" | "talk";

const FRAME_TONE: Record<HandsFrame, "success" | "warning" | "info" | "danger" | "neutral"> = { done: "success", need: "warning", options: "info", failed: "danger", waiting: "neutral" };

export function HandsWorkspace({ initialThreads, contacts, connector, canConfigure, initialThreadId, perJobCapInr, viewerCanPayAbove }: {
  initialThreads: HandsThreadSummary[];
  contacts: HandsAllowedContactRow[];
  connector: HandsConnectorStatusRow | null;
  canConfigure: boolean;
  initialThreadId: string | null;
  perJobCapInr: number;
  /** admin / founder / manager / a bishop or queen: may mark a payment above the per-job cap. */
  viewerCanPayAbove: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [threads, setThreads] = useState(initialThreads);
  const [filter, setFilter] = useState<RailFilter>("jobs");
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId);
  const [view, setView] = useState<HandsThreadView | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const refreshList = useCallback(async () => {
    const r = await listHandsThreadsAction({ status: "open" });
    if (r.data) setThreads(r.data);
  }, []);

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

  const shown = useMemo(() => threads.filter((t) => (filter === "talk" ? t.kind === "talk" : t.kind === "ticket")), [threads, filter]);
  const selected = threads.find((t) => t.id === selectedId) ?? view?.thread ?? null;

  const connected = connector?.connected && Date.now() - new Date(connector.beat_at).getTime() < 3 * 60_000;

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

      <SplitWorkspace>
        <SplitRail>
          <SplitRailHeader>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <SelectionButton selected={filter === "jobs"} onClick={() => setFilter("jobs")}>Jobs</SelectionButton>
              <SelectionButton selected={filter === "talk"} onClick={() => setFilter("talk")}>Talk</SelectionButton>
            </div>
            {filter === "talk" && <NewTalk contacts={contacts} onOpened={(id) => { void refreshList(); setSelectedId(id); }} />}
          </SplitRailHeader>
          <SplitRailList>
            {shown.length === 0 ? (
              <div style={{ padding: "var(--space-6) var(--space-4)" }}>
                <EmptyState variant="inline" title={filter === "talk" ? "No open talk" : "No jobs on the line"} description={filter === "talk" ? "Open a free thread with the agent to ask what it can do or re-send the rulebook." : "A job starts from a ticket: set the agent as its vendor, then open the line from the ticket page or ask Elaya."} />
              </div>
            ) : shown.map((t, i) => (
              <ConversationRailRow
                key={t.id}
                index={i}
                title={t.kind === "talk" ? `Talk · ${t.contact_label}` : `${t.ticket_no ?? "Ticket"} · ${t.member_name ?? "Member"}`}
                avatarName={t.kind === "talk" ? t.contact_label : t.member_name ?? t.contact_label}
                meta={t.last_message_at ? formatRelativeTime(t.last_message_at) : null}
                preview={<span>{t.last_direction === "in" ? "Agent: " : t.last_direction === "out" ? "Us: " : ""}{t.last_preview ?? t.ticket_title ?? "No lines yet"}{t.queued > 0 ? ` · ${t.queued} queued` : ""}</span>}
                selected={t.id === selectedId}
                unread={t.last_direction === "in"}
                onSelect={() => setSelectedId(t.id)}
              />
            ))}
          </SplitRailList>
        </SplitRail>

        <SplitPane className={selectedId ? "flex flex-col" : "hidden md:flex items-center justify-center"}>
          {!selectedId || !selected ? (
            <EmptyState icon={Bot} title="Pick a job" description="The conversation with the agent opens here, with what we told it and what we kept back." />
          ) : (
            <ThreadPane
              key={selected.id}
              summary={selected}
              view={view}
              loading={loadingThread}
              perJobCapInr={perJobCapInr}
              viewerCanPayAbove={viewerCanPayAbove}
              onChanged={() => { void loadThread(selected.id, true); void refreshList(); }}
              onClosed={() => { setSelectedId(null); void refreshList(); }}
            />
          )}
        </SplitPane>
      </SplitWorkspace>
    </>
  );
}

// ─── The rail's Talk opener ───────────────────────────────────────────────────

function NewTalk({ contacts, onOpened }: { contacts: HandsAllowedContactRow[]; onOpened: (id: string) => void }) {
  const [pending, start] = useTransition();
  const active = contacts.filter((c) => c.is_active);
  if (active.length === 0) return <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>No agent on the allowlist yet.</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {active.map((c) => (
        <Button key={c.jid} size="xs" variant="control" disabled={pending} onClick={() => start(async () => {
          const r = await openTalkThreadAction({ jid: c.jid });
          if (r.error || !r.data) { toast.danger(r.error ?? "Could not open the talk."); return; }
          onOpened(r.data.id);
        })}>Talk to {c.label}</Button>
      ))}
    </div>
  );
}

// ─── The pane ────────────────────────────────────────────────────────────────

function ThreadPane({ summary, view, loading, perJobCapInr, viewerCanPayAbove, onChanged, onClosed }: {
  summary: HandsThreadSummary; view: HandsThreadView | null; loading: boolean; perJobCapInr: number; viewerCanPayAbove: boolean;
  onChanged: () => void; onClosed: () => void;
}) {
  const [text, setText] = useState("");
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

  const close = () => start(async () => {
    const r = await closeHandsThreadAction({ threadId: summary.id });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("Line closed.");
    onClosed();
  });

  const payment = [...(view?.messages ?? [])].reverse().find((m) => m.payment && !m.payment.paid_at);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--theme-paper-border)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Bot className="w-4 h-4" strokeWidth={1.5} />
            <span>{summary.contact_label}</span>
            {summary.ticket_no && <Link href={`/tickets/${summary.ticket_id}`} className="type-caption" style={{ color: "var(--neu-accent-deep)", display: "inline-flex", alignItems: "center", gap: 4 }}><ClipboardList className="w-3 h-3" strokeWidth={1.5} />{summary.ticket_no}<ExternalLink className="w-3 h-3" strokeWidth={1.5} /></Link>}
          </div>
          <div className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>{summary.kind === "talk" ? "Free talk, no member data in reach" : `${summary.ticket_title ?? ""}${summary.member_name ? ` · for ${summary.member_name}` : ""}`}</div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {summary.ticket_id && <Button size="xs" variant="control" disabled={pending} onClick={askElaya}><Sparkles className="w-3 h-3" strokeWidth={1.5} /> Let Elaya draft</Button>}
          <Button size="xs" variant="ghost" disabled={pending} onClick={close}>Close line</Button>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {loading && !view && <div className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>Opening…</div>}
        {view && view.messages.length === 0 && view.outbox.length === 0 && (
          <EmptyState variant="inline" title="Nothing said yet" description={summary.ticket_id ? "Let Elaya draft the opening line from the brief, or write it yourself." : "Write to the agent. The rulebook is a good first line."} />
        )}
        {view?.messages.map((m) => <Bubble key={m.id} m={m} agent={summary.contact_label} />)}
        {view?.outbox.map((o) => (
          <div key={o.id} style={{ alignSelf: "flex-end", maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <div style={{ padding: "var(--space-2) var(--space-3)", borderRadius: "var(--neu-radius-tile, var(--radius-md))", background: "var(--theme-accent-surface)", color: "var(--theme-text-primary)", fontSize: "var(--text-sm)", opacity: 0.8, whiteSpace: "pre-wrap" }}>{o.text}</div>
            <span className="type-caption" style={{ color: o.status === "queued" ? "var(--theme-text-tertiary)" : "var(--color-danger-text)" }}>{o.status === "queued" ? "Queued…" : o.status === "refused" ? `Refused: ${o.error ?? "not allowed"}` : `Failed: ${o.error ?? "unknown"}`}</span>
          </div>
        ))}
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

      <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "1px solid var(--theme-paper-border)" }}>
        <MessageBar value={text} onChange={setText} onSend={() => text.trim() && send(text, false)} placeholder={`Write to ${summary.contact_label}… a name, phone or email is refused`} disabled={pending} loading={pending} maxLength={4000} />
      </div>
    </>
  );
}

// ─── One line ────────────────────────────────────────────────────────────────

function Bubble({ m, agent }: { m: HandsMessageRow & { media_url: string | null }; agent: string }) {
  const ours = m.direction === "out";
  return (
    <div style={{ alignSelf: ours ? "flex-end" : "flex-start", maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: ours ? "flex-end" : "flex-start", gap: 2 }}>
      <div style={{ padding: "var(--space-2) var(--space-3)", borderRadius: "var(--neu-radius-tile, var(--radius-md))", background: ours ? "var(--theme-accent-surface)" : "var(--theme-paper-subtle)", border: ours ? "none" : "1px solid var(--theme-paper-border)", fontSize: "var(--text-sm)", color: "var(--theme-text-primary)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {m.media_url && m.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.media_url} alt={m.payment ? "Payment QR from the agent" : "Image from the agent"} style={{ maxWidth: 260, maxHeight: 260, borderRadius: "var(--radius-sm)", display: "block" }} />
        )}
        {m.media_url && m.kind !== "image" && <a href={m.media_url} target="_blank" rel="noreferrer" className="type-caption" style={{ color: "var(--neu-accent-deep)" }}>Open the {m.kind}</a>}
        {m.text && <div style={{ whiteSpace: "pre-wrap" }}>{renderWaText(m.text)}</div>}
        {!m.text && !m.media_url && <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>[{m.kind}]</span>}
      </div>
      <div className="type-caption" style={{ color: "var(--theme-text-tertiary)", display: "flex", gap: 6, alignItems: "center" }}>
        <span>{ours ? "Us" : agent} · {formatDate(m.wa_timestamp, "HH:mm")}</span>
        {m.frame && HANDS_FRAMES.values.includes(m.frame) && <Badge tone={FRAME_TONE[m.frame]} size="xs">{m.frame.toUpperCase()}</Badge>}
        {m.payment?.paid_at && <Badge tone="success" size="xs">Paid {m.payment.paid_amount_inr != null ? formatCurrency(m.payment.paid_amount_inr) : ""}</Badge>}
      </div>
    </div>
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
    <div style={{ margin: "0 var(--space-4) var(--space-3)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--neu-radius-tile, var(--radius-md))", border: `1px solid ${blocked ? "var(--color-danger-border, var(--theme-paper-border))" : "var(--theme-paper-border)"}`, background: "var(--theme-paper)", display: "flex", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
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
