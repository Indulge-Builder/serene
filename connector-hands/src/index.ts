// Elaya's hands — the second WhatsApp number (docs/architecture/hands-plan.md, Layer A; migration 0245).
//
// Laws:
//   ONE SENDER    a message leaves this number only as a hands.outbox row Serene wrote; this loop
//                 re-checks the allowlist and the thread, sends, and settles the row. Nothing else here
//                 ever calls sendMessage.
//   ALLOWLIST     an inbound from a number not on hands.allowed_contacts is recorded raw and dropped;
//                 an outbox row to such a number is marked `refused`, never sent.
//   RAW FIRST     every Baileys event lands in hands.raw_events before parsing (the watcher's contract).
//   OWN SESSION   hands.auth_state, never the watcher's rows; a different phone, a different process.
//   THIN HANDLER  socket event → queue → return; the drain does the work (connector/src/index.ts).
//
// Run:  npm start   → scan the QR with the HANDS phone (never the watcher, never a personal number).

import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  makeCacheableSignalKeyStore,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import { usePostgresAuthState, wipeAuthState } from "../../connector/src/auth-postgres.js";
import { normalizeJid } from "../../connector/src/normalize.js";
import {
  claimQueuedOutbox, existingFiling, findOpenThread, getThread, handsDb, insertRawEvent, listOpenThreads, loadAllowlist, publishQr, settleOutbox,
  storeMedia, threadOfMessage, ticketIdForNo, touchThread, upsertMessage, upsertStatus, writeTicketEvent, type Frame, type Payment, type ThreadRow,
} from "./db.js";

const logger = pino({ level: "warn" });
const LOG = "[hands]";

// ─── Reading the agent's reply (mirrors src/lib/constants/hands.ts; keep the two lists identical) ──
const FRAMES: readonly Frame[] = ["done", "need", "options", "failed", "waiting"];
const QR_LIFETIME_MS = 9 * 60_000;

// Job codes (mirrors readHandsJobCode / HANDS_JOB_CODE_LEAD in src/lib/constants/hands.ts).
const JOB_CODE_LEAD = /^\s*\*?#\s?T-?0*\d{1,6}\*?[\s:.,-]*/i;
function readJobCode(text: string | null): string | null {
  const m = (text ?? "").match(/(?:#\s?T-?|\bT-)0*(\d{1,6})\b/i);
  return m ? `T-${m[1].padStart(6, "0")}` : null;
}

function readFrame(text: string | null): Frame | null {
  const word = (text ?? "").trim().replace(JOB_CODE_LEAD, "").match(/^([A-Za-z]+)\b/)?.[1]?.toLowerCase();
  return word && (FRAMES as readonly string[]).includes(word) ? (word as Frame) : null;
}

/** A payment ask: an image (the QR) or a line that says scan/pay with a rupee amount. Amount read off the agent's own words. */
function readPayment(kind: string, text: string | null, recentText: string | null, at: string): Payment | null {
  const words = `${text ?? ""}\n${recentText ?? ""}`;
  const asks = /\b(scan|qr|upi|pay(?:ment)?|gpay|phonepe|paytm)\b/i.test(words);
  const amount = words.match(/₹\s?([\d,]+(?:\.\d{1,2})?)/) ?? words.match(/\b(?:inr|rs\.?)\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (!(kind === "image" && (asks || amount)) && !(kind === "text" && asks && amount)) return null;
  const payee = words.match(/\bpayee (?:says|is|reads)?\s*([A-Za-z0-9 .&/-]{2,40})/i)?.[1]?.trim() ?? null;
  return { amount_inr: amount ? Number(amount[1].replace(/,/g, "")) : null, payee, expires_at: new Date(new Date(at).getTime() + QR_LIFETIME_MS).toISOString() };
}

// `quiet`: a reaction, an edit, a delete or a key exchange. Filed (the app folds it onto the line it is
// about, hands-service foldHandsChat) but it is not a line of its own: no ticket event, and only a
// reaction moves the thread preview ("Reacted 👀").
type Parsed = { kind: string; text: string | null; mime: string | null; media: boolean; quiet?: "reaction" | "silent"; emoji?: string };

function parseContent(msg: WAMessage): Parsed {
  const m = msg.message ?? undefined;
  if (!m) return { kind: "other", text: null, mime: null, media: false };
  const type = getContentType(m);
  if (type === "conversation") return { kind: "text", text: m.conversation ?? null, mime: null, media: false };
  if (type === "extendedTextMessage") return { kind: "text", text: m.extendedTextMessage?.text ?? null, mime: null, media: false };
  if (type === "imageMessage") return { kind: "image", text: m.imageMessage?.caption ?? null, mime: m.imageMessage?.mimetype ?? "image/jpeg", media: true };
  if (type === "documentMessage") return { kind: "document", text: m.documentMessage?.caption ?? m.documentMessage?.fileName ?? null, mime: m.documentMessage?.mimetype ?? null, media: true };
  if (type === "audioMessage") return { kind: "audio", text: null, mime: m.audioMessage?.mimetype ?? null, media: true };
  if (type === "videoMessage") return { kind: "video", text: m.videoMessage?.caption ?? null, mime: m.videoMessage?.mimetype ?? null, media: true };
  if (type === "reactionMessage") return { kind: "other", text: null, mime: null, media: false, quiet: "reaction", emoji: m.reactionMessage?.text ?? "" };
  if (type === "protocolMessage" || type === "senderKeyDistributionMessage" || type === "messageContextInfo") return { kind: "other", text: null, mime: null, media: false, quiet: "silent" };
  return { kind: "other", text: null, mime: null, media: false };
}

// ─── State ────────────────────────────────────────────────────────────────────
let sock: WASocket | null = null;
let myJid: string | null = null;
let allowlist = new Map<string, { jid: string; label: string }>();
const lastInboundText = new Map<string, { text: string; at: number }>();
type Queued = { type: string; payload: unknown };
const queue: Queued[] = [];
let draining = false;

async function refreshAllowlist(): Promise<void> {
  allowlist = await loadAllowlist();
}

/**
 * The phone jid behind a chat. WhatsApp increasingly addresses a 1:1 chat by a hidden id
 * (`…@lid`) instead of the number, and the allowlist holds numbers: matched raw, an agent's
 * reply under its hidden id would be recorded and silently dropped (found 2026-10-01, before
 * the first real thread). The message key usually carries the number (`remoteJidAlt`);
 * otherwise Baileys' own id↔number store answers. Anything unresolved stays as it is, so it
 * fails closed against the allowlist.
 */
async function phoneJidFor(msg: WAMessage, remote: string): Promise<string> {
  if (!remote.endsWith("@lid")) return normalizeJid(remote);
  const alt = (msg.key as { remoteJidAlt?: string } | undefined)?.remoteJidAlt;
  if (alt && alt.endsWith("@s.whatsapp.net")) return normalizeJid(alt);
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(remote);
    if (pn) return normalizeJid(pn);
  } catch (e) {
    console.warn(`${LOG} hidden id lookup failed:`, e instanceof Error ? e.message : e);
  }
  return normalizeJid(remote);
}

// ─── Which thread a message belongs to (2026-10-03) ─────────────────────────
// One WhatsApp chat carries many jobs. In order: a message already filed keeps its thread (a
// redelivery never undoes a filing); the job code it carries (#T42); the message it quotes; the only
// open thread. With several open threads and none of those, an inbound reply is 'unmatched' and waits
// for Elaya's content match or a person (the tray on /hands). A line typed on the hands phone itself
// falls back to the most recently active thread, as before.
type Routed = { thread: ThreadRow | null; match: string | null };
async function routeMessage(msg: WAMessage, jid: string, direction: "in" | "out", text: string | null, waMessageId: string): Promise<Routed> {
  const filed = await existingFiling(jid, waMessageId);
  if (filed?.thread_id) return { thread: await getThread(filed.thread_id), match: filed.match_status };
  const open = await listOpenThreads(jid);
  if (open.length === 0) return { thread: null, match: null };
  const code = readJobCode(text);
  if (code) {
    const ticketId = await ticketIdForNo(code);
    const t = ticketId ? open.find((x) => x.ticket_id === ticketId) : undefined;
    if (t) return { thread: t, match: "code" };
  }
  const m = msg.message as Record<string, { contextInfo?: { stanzaId?: string } } | undefined> | undefined;
  const quoted = m ? Object.values(m).map((v) => v?.contextInfo?.stanzaId).find(Boolean) : undefined;
  if (quoted) {
    const threadId = await threadOfMessage(jid, quoted);
    const t = threadId ? open.find((x) => x.id === threadId) : undefined;
    if (t) return { thread: t, match: "quote" };
  }
  if (open.length === 1) return { thread: open[0], match: "only_thread" };
  if (direction === "out") return { thread: await findOpenThread(jid), match: null };
  return { thread: null, match: "unmatched" };
}

// ─── Inbound: raw → parse → allowlist → message row → thread → ticket event ──
async function handleMessage(msg: WAMessage): Promise<void> {
  const remote = msg.key?.remoteJid ?? null;
  const waMessageId = msg.key?.id ?? null;
  if (!remote || !waMessageId || remote.endsWith("@g.us") || remote === "status@broadcast") return;
  const jid = await phoneJidFor(msg, remote);
  if (!allowlist.has(jid)) return; // recorded raw, never filed
  const direction: "in" | "out" = msg.key?.fromMe ? "out" : "in";
  const at = new Date(Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString();
  const parsed = parseContent(msg);

  let mediaPath: string | null = null;
  if (parsed.media && sock) {
    try {
      const buffer = (await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage })) as Buffer;
      mediaPath = await storeMedia(jid, waMessageId, parsed.mime, buffer);
    } catch (e) {
      console.warn(`${LOG} media download failed:`, e instanceof Error ? e.message : e);
    }
  }

  const routed = await routeMessage(msg, jid, direction, parsed.text, waMessageId);
  const thread = routed.thread;
  const recent = lastInboundText.get(jid);
  const frame = direction === "in" ? readFrame(parsed.text) : null;
  const payment = direction === "in" ? readPayment(parsed.kind, parsed.text, recent && Date.now() - recent.at < 120_000 ? recent.text : null, at) : null;
  if (direction === "in" && parsed.text) lastInboundText.set(jid, { text: parsed.text, at: Date.now() });

  const id = await upsertMessage({
    thread_id: thread?.id ?? null, jid, wa_message_id: waMessageId, direction, kind: parsed.kind, text: parsed.text,
    media_path: mediaPath, media_mime: parsed.mime, wa_timestamp: at, frame, payment, outbox_id: null, match_status: routed.match,
    raw: JSON.parse(JSON.stringify(msg, (_k, v) => (v instanceof Uint8Array ? { _bytes: v.length } : v))),
  });
  if (!id || !thread) return;
  if (parsed.quiet) {
    if (parsed.quiet === "reaction" && parsed.emoji) await touchThread(thread.id, at, direction, `Reacted ${parsed.emoji}`);
    return;
  }
  await touchThread(thread.id, at, direction, parsed.text ?? `[${parsed.kind}]`);
  // A line typed on the hands phone itself (fromMe, no outbox row) is a human's line too; the ticket sees it.
  if (thread.ticket_id) {
    const body = parsed.text ?? `[${parsed.kind}]`;
    if (direction === "in") {
      await writeTicketEvent(thread.ticket_id, payment ? "payment_request" : "hands_message", body, { message_id: id, kind: parsed.kind, frame, payment, media_path: mediaPath, contact: allowlist.get(jid)?.label ?? jid });
    } else {
      await writeTicketEvent(thread.ticket_id, "hands_sent", body, { message_id: id, typed_on_phone: true });
    }
  }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      await insertRawEvent(item.type, item.payload);
      if (item.type === "messages.upsert") {
        const p = item.payload as { messages?: WAMessage[] };
        for (const m of p.messages ?? []) {
          try { await handleMessage(m); } catch (e) { console.error(`${LOG} message failed:`, e instanceof Error ? e.message : e); }
        }
      }
    }
  } finally {
    draining = false;
  }
}

function enqueue(type: string, payload: unknown): void {
  queue.push({ type, payload });
  void drain();
}

// ─── Outbound: the outbox is the only door ────────────────────────────────────
let sending = false;
async function pumpOutbox(): Promise<void> {
  if (sending || !sock) return;
  sending = true;
  try {
    const rows = await claimQueuedOutbox(5);
    for (const row of rows) {
      const contact = allowlist.get(row.jid);
      const thread = await getThread(row.thread_id);
      if (!contact) { await settleOutbox(row.id, { status: "refused", error: "number not on the allowlist" }); continue; }
      if (!thread || thread.status !== "open") { await settleOutbox(row.id, { status: "refused", error: "thread closed" }); continue; }
      try {
        const sent = await sock.sendMessage(row.jid, { text: row.text });
        const waId = sent?.key?.id ?? null;
        const at = new Date().toISOString();
        await settleOutbox(row.id, { status: "sent", wa_message_id: waId });
        const id = waId ? await upsertMessage({
          thread_id: thread.id, jid: row.jid, wa_message_id: waId, direction: "out", kind: "text", text: row.text, media_path: null, media_mime: null,
          wa_timestamp: at, frame: null, payment: null, outbox_id: row.id, raw: {},
        }) : null;
        await touchThread(thread.id, at, "out", row.text);
        if (thread.ticket_id) await writeTicketEvent(thread.ticket_id, "hands_sent", row.text, { message_id: id, outbox_id: row.id, source: row.source, requested_by: row.requested_by, disclosure: row.disclosure, contact: contact.label });
      } catch (e) {
        await settleOutbox(row.id, { status: "failed", error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      }
    }
  } finally {
    sending = false;
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
let state: "pairing" | "connecting" | "connected" | "logged_out" = "connecting";
let stateSince = new Date().toISOString();
function setState(s: typeof state): void { if (s !== state) { state = s; stateSince = new Date().toISOString(); } void upsertStatus({ state, state_since: stateSince, connected: state === "connected", account_jid: myJid }); }

async function boot(): Promise<void> {
  const { state: auth, saveCreds } = await usePostgresAuthState({ table: "auth_state", client: handsDb });
  await refreshAllowlist();
  const version = await fetchLatestBaileysVersion().then((v) => v.version).catch(() => undefined);

  sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,           // a fresh number; only the small recent sync, never the deep one
    // Accept the recent history sync (2026-10-01): it carries WhatsApp's hidden-id ↔ number map,
    // which phoneJidFor needs (Baileys warns that refusing it causes session errors). Nothing
    // here listens to messaging-history.set, so no old chat is stored or filed.
    shouldSyncHistoryMessage: () => true,
  });
  sock.ev.on("creds.update", saveCreds);

  if (!auth.creds.me && config.pairNumber) {
    setTimeout(async () => {
      try {
        const code = await sock!.requestPairingCode(config.pairNumber!);
        console.log(`\n${LOG} PAIRING CODE: ${code}\n${LOG} On the HANDS phone: WhatsApp → Linked Devices → Link with phone number instead → enter this code.\n`);
      } catch (e) { console.error(`${LOG} pairing code request failed:`, e instanceof Error ? e.message : e); }
    }, 4000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      setState("pairing");
      void publishQr(qr);
      if (!config.pairNumber) { console.log(`\n${LOG} Scan this QR with the HANDS phone (WhatsApp → Linked Devices):\n`); qrcode.generate(qr, { small: true }); }
    }
    if (connection === "open") {
      void publishQr(null);
      myJid = normalizeJid(sock?.user?.id ?? null);
      console.log(`${LOG} connected as ${myJid}`);
      setState("connected");
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        setState("logged_out");
        void wipeAuthState("loggedOut").finally(() => process.exit(1));
        return;
      }
      console.warn(`${LOG} connection closed (${code ?? "unknown"}) — exiting for a clean restart`);
      process.exit(0);
    }
  });

  sock.ev.on("messages.upsert", (p) => enqueue("messages.upsert", p));
  sock.ev.on("messages.update", (p) => enqueue("messages.update", p));

  setInterval(() => void refreshAllowlist(), config.allowlistRefreshMs);
  setInterval(() => void pumpOutbox(), config.outboxPollMs);
  setInterval(() => void upsertStatus({ state, state_since: stateSince, connected: state === "connected", account_jid: myJid }), config.heartbeatMs);
  setState(state);
}

boot().catch((e) => { console.error(`${LOG} boot failed:`, e instanceof Error ? e.message : e); process.exit(1); });
