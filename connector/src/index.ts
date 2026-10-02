// The Sia watcher — Baileys ear, wag_ writer. READ-ONLY BY LAW (plan-whatsapp §6.1):
// this process NEVER sends a WhatsApp message. There is no sendMessage call in this
// codebase and there must never be one.
//
// Architecture (plan-whatsapp §10.1 — the thin socket handler):
//   socket event → push to in-memory queue → return          (milliseconds, always)
//   drain loop   → batch raw inserts → normalize → wag_ rows (async, off the stream)
//   media worker → download + decrypt → local store          (media.ts, concurrency 2)
//
// Run:  npm start   → scan the QR with the WATCHER phone (never a personal number).

import { mkdirSync } from "node:fs";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import {
  getWatcherStatusRow,
  insertMediaRow,
  publishQr,
  insertRawEvents,
  markRevoked,
  memberJoined,
  memberLeft,
  memberRoleChanged,
  stampWatcherJoined,
  upsertContact,
  upsertContactBridges,
  upsertContactsBatch,
  upsertGroup,
  upsertMessages,
  upsertReaction,
  upsertReceipt,
  upsertWatcherStatus,
  recordConnectionClose,
  clearConnectionCloses,
  type WagMessageRow,
  type WatcherState,
} from "./db.js";
import { usePostgresAuthState, wipeAuthState } from "./auth-postgres.js";
import { fetchRawMessageByPair } from "./db.js";
import { startMediaBackfill } from "./media-backfill.js";
import { enqueueMediaDownload, setMediaSocket } from "./media.js";
import { isGroupJid, jsonSafe, normalizeJid, normalizeMessage, reviveBuffers } from "./normalize.js";

const logger = pino({ level: "warn" });

// ── Failure limits (migration 0249; the 2026-09-29 ban) ──
// A close is counted in the status row (close_streak) and survives the crash-only
// restart, so a fresh process knows how many times in a row the last ones died.
//   - any close: pause before exiting, doubling per close, so ECS never spins
//   - a 403 (forbidden) close at BAN_REFUSALS in a row: WhatsApp has banned the
//     number. State 'banned', and the process HOLDS instead of reconnecting —
//     every further attempt with a banned account only hurts the review. A human
//     clears it from Serene (Restart = try once more; Change watcher number).
const BAN_REFUSALS = 3;
const RECONNECT_PAUSE_MS = 5_000;
const RECONNECT_PAUSE_MAX_MS = 5 * 60_000;
const BANNED_HOLD_MS = 30 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Participant objects as Baileys ships them (GroupParticipant = Contact & …):
// `id` is the addressing id (lid in lid-addressed groups), `phoneNumber` the
// @s.whatsapp.net twin, `notify` their own display name.
type ParticipantLike = {
  id: string;
  admin?: string | null;
  phoneNumber?: string;
  lid?: string;
  notify?: string;
};

/** lid ↔ phone bridge rows from participant metadata (skip anything with no
 *  phone-shaped jid — a lid alone bridges nothing). */
function participantBridgeRows(
  parts: ParticipantLike[],
): { jid: string; lid: string | null; phone: string | null; push_name: string | null }[] {
  const rows: { jid: string; lid: string | null; phone: string | null; push_name: string | null }[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const id = normalizeJid(p.id);
    const pn = p.phoneNumber ? normalizeJid(p.phoneNumber) : null;
    const phoneJid = pn ?? (id.endsWith("@s.whatsapp.net") ? id : null);
    if (!phoneJid || seen.has(phoneJid)) continue;
    seen.add(phoneJid);
    const lid = p.lid ? normalizeJid(p.lid) : id.endsWith("@lid") ? id : null;
    const digits = phoneJid.split("@")[0].replace(/\D/g, "");
    rows.push({
      jid: phoneJid,
      lid,
      phone: digits ? `+${digits}` : null,
      push_name: p.notify ?? null,
    });
  }
  return rows;
}

let myJid: string | null = null;

// ─────────────────────────────────────────────
// Heartbeat — the watcher's own pulse (migration 0175). One beat per minute plus
// one on every state change; liveness never depends on group traffic. The alarm
// (src/trigger/sia-silence.ts) and the /sia live dot read this single row.
// Crash-only pairs perfectly with it: process death simply stops the pulse.
// ─────────────────────────────────────────────

let watcherState: WatcherState = "connecting";
let stateSince = new Date().toISOString();
const BOOT_AT = Date.now();

function beat(): void {
  void upsertWatcherStatus({ state: watcherState, state_since: stateSince, account_jid: myJid }).then(
    (restartRequestedAt) => {
      // The Serene console's Restart / Re-pair control channel (migration 0177):
      // a stamp newer than THIS boot means someone asked for a clean restart.
      // Crash-only does the rest — a re-pair wiped the auth first, so the next
      // boot arms a fresh QR straight into the console.
      if (restartRequestedAt && new Date(restartRequestedAt).getTime() > BOOT_AT) {
        console.log("[watcher] restart requested from Serene — exiting for a clean boot");
        process.exit(0);
      }
    },
  );
}

function setWatcherState(next: WatcherState): void {
  if (next !== watcherState) {
    watcherState = next;
    stateSince = new Date().toISOString();
  }
  beat();
}

setInterval(beat, 60_000);

// ─────────────────────────────────────────────
// The queue — the ONLY thing socket handlers touch (thin-handler law)
// ─────────────────────────────────────────────

type QueuedEvent = { event_type: string; payload: unknown };
const eventQueue: QueuedEvent[] = [];

function enqueue(event_type: string, payload: unknown): void {
  eventQueue.push({ event_type, payload });
}

// The drain loop: raw first (the black-box recorder), then understand.
async function drainLoop(sock: WASocket): Promise<void> {
  for (;;) {
    if (eventQueue.length === 0) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    const batch = eventQueue.splice(0, 50);
    try {
      // 1. RAW FIRST — before any parsing (plan-whatsapp §3 lesson 1).
      await insertRawEvents(
        batch.map((e) => ({
          event_type: e.event_type,
          payload: jsonSafe(e.payload),
          account_jid: myJid,
        })),
      );
      // 2. Then normalize. A failure here is logged and skipped — raw has it.
      for (const e of batch) {
        await processEvent(sock, e).catch((err) =>
          console.error(`[process] ${e.event_type} failed (raw kept):`, err?.message ?? err),
        );
      }
    } catch (err) {
      console.error("[drain] batch failed:", err instanceof Error ? err.message : err);
    }
  }
}

// ─────────────────────────────────────────────
// Understanding each event type
// ─────────────────────────────────────────────

async function processMessages(sock: WASocket, messages: WAMessage[], source: "live" | "history_sync") {
  const rows: WagMessageRow[] = [];
  const seenSenders = new Map<string, string | null>();

  for (const msg of messages) {
    const n = normalizeMessage(msg, source);
    if (n.kind === "skip") continue;

    if (n.kind === "reaction") {
      await upsertReaction({
        chat_jid: n.chat_jid,
        wa_message_id: n.wa_message_id,
        target_sender_jid: n.target_sender_jid,
        reactor_jid: n.reactor_jid,
        emoji: n.emoji,
      });
      continue;
    }
    if (n.kind === "revoke") {
      await markRevoked(n.chat_jid, n.target_wa_message_id);
      continue;
    }

    rows.push(n.row);
    if (msg.pushName) seenSenders.set(n.row.sender_jid, msg.pushName);

    if (n.media) {
      await insertMediaRow({
        chat_jid: n.row.chat_jid,
        wa_message_id: n.row.wa_message_id,
        sender_jid: n.row.sender_jid,
        wa_timestamp: n.row.wa_timestamp,
        ...n.media,
      });
      // Live messages only: history-sync payloads usually lack downloadable keys.
      if (source === "live") {
        enqueueMediaDownload({
          msg,
          chat_jid: n.row.chat_jid,
          wa_message_id: n.row.wa_message_id,
          sender_jid: n.row.sender_jid,
          mime: n.media.mime,
        });
      }
    }
  }

  await upsertMessages(rows);
  for (const [jid, pushName] of seenSenders) {
    await upsertContact({ jid, push_name: pushName });
  }
}

async function processEvent(sock: WASocket, e: QueuedEvent): Promise<void> {
  switch (e.event_type) {
    case "messages.upsert": {
      const { messages } = e.payload as { messages: WAMessage[]; type: string };
      await processMessages(sock, messages ?? [], "live");
      break;
    }
    case "messaging-history.set": {
      const { messages, lidPnMappings } = e.payload as {
        messages?: WAMessage[];
        lidPnMappings?: { pn: string; lid: string }[];
      };
      // History chunks carry lid↔phone pairs — the identity bridge feeds on them.
      if (lidPnMappings?.length) {
        await upsertContactBridges(
          lidPnMappings.map((m) => {
            const jid = normalizeJid(m.pn);
            const digits = jid.split("@")[0].replace(/\D/g, "");
            return { jid, lid: normalizeJid(m.lid), phone: digits ? `+${digits}` : null, push_name: null };
          }),
        );
      }
      if (messages?.length) await processMessages(sock, messages, "history_sync");
      break;
    }
    case "lid-mapping.update": {
      // 7.x streams lid↔phone pairs as they are learned (docs audit 2026-08-29) —
      // persist each one; the group-info identity resolution reads this bridge.
      const m = e.payload as { pn?: string; lid?: string };
      if (m.pn && m.lid) {
        const jid = normalizeJid(m.pn);
        const digits = jid.split("@")[0].replace(/\D/g, "");
        await upsertContactBridges([
          { jid, lid: normalizeJid(m.lid), phone: digits ? `+${digits}` : null, push_name: null },
        ]);
      }
      break;
    }
    case "messages.update": {
      // Late revokes arrive here too (update.message === null + REVOKE stub).
      const updates = e.payload as { key: { remoteJid?: string; id?: string }; update: Record<string, unknown> }[];
      for (const u of updates ?? []) {
        const stub = u.update?.messageStubType;
        if ((stub === "REVOKE" || stub === 1) && isGroupJid(u.key?.remoteJid) && u.key?.id) {
          await markRevoked(u.key.remoteJid!, u.key.id);
        }
      }
      break;
    }
    case "message-receipt.update": {
      const updates = e.payload as {
        key: { remoteJid?: string; id?: string };
        receipt: { userJid?: string; receiptTimestamp?: number; readTimestamp?: number; playedTimestamp?: number };
      }[];
      for (const u of updates ?? []) {
        if (!isGroupJid(u.key?.remoteJid) || !u.key?.id || !u.receipt?.userJid) continue;
        const who = normalizeJid(u.receipt.userJid);
        if (who === myJid) continue; // never track the watcher itself
        const toIso = (t?: number) => (t && t > 0 ? new Date(t * 1000).toISOString() : null);
        await upsertReceipt({
          chat_jid: u.key.remoteJid!,
          wa_message_id: u.key.id,
          participant_jid: who,
          delivered_at: toIso(u.receipt.receiptTimestamp),
          read_at: toIso(u.receipt.readTimestamp),
          played_at: toIso(u.receipt.playedTimestamp),
        });
      }
      break;
    }
    case "groups.upsert": {
      for (const g of (e.payload as { id: string; subject?: string; desc?: string; owner?: string; size?: number; participants?: ParticipantLike[] }[]) ?? []) {
        if (!isGroupJid(g.id)) continue;
        await upsertGroup({
          group_jid: g.id,
          subject: g.subject ?? null,
          description: g.desc ?? null,
          owner_jid: g.owner ? normalizeJid(g.owner) : null,
          member_count: g.size ?? g.participants?.length ?? null,
        });
        await stampWatcherJoined(g.id);
        for (const p of g.participants ?? []) {
          await memberJoined(g.id, normalizeJid(p.id), p.admin ?? "member");
        }
        await upsertContactBridges(participantBridgeRows(g.participants ?? []));
      }
      break;
    }
    case "groups.update": {
      for (const g of (e.payload as { id?: string; subject?: string; desc?: string; size?: number }[]) ?? []) {
        if (!isGroupJid(g.id)) continue;
        await upsertGroup({
          group_jid: g.id!,
          ...(g.subject !== undefined ? { subject: g.subject } : {}),
          ...(g.desc !== undefined ? { description: g.desc } : {}),
          ...(g.size !== undefined ? { member_count: g.size } : {}),
        });
      }
      break;
    }
    case "group-participants.update": {
      const { id, participants, action } = e.payload as { id: string; participants: string[]; action: string };
      if (!isGroupJid(id)) break;
      for (const raw of participants ?? []) {
        const jid = normalizeJid(raw);
        if (action === "add") await memberJoined(id, jid);
        else if (action === "remove") await memberLeft(id, jid);
        else if (action === "promote") await memberRoleChanged(id, jid, "admin");
        else if (action === "demote") await memberRoleChanged(id, jid, "member");
      }
      break;
    }
    case "contacts.upsert":
    case "contacts.update": {
      // Batch — the connect flood can carry thousands of contacts (the real
      // watcher number is in every group). Dedup by jid within the event so the
      // upsert never sees the same conflict key twice in one statement.
      const byJid = new Map<string, { jid: string; push_name: string | null; lid: string | null }>();
      for (const c of (e.payload as { id?: string; notify?: string; name?: string; lid?: string }[]) ?? []) {
        if (!c.id || c.id.endsWith("@g.us")) continue;
        const jid = normalizeJid(c.id);
        byJid.set(jid, { jid, push_name: c.notify ?? c.name ?? null, lid: c.lid ?? null });
      }
      await upsertContactsBatch([...byJid.values()]);
      break;
    }
  }
}

// ─────────────────────────────────────────────
// Socket lifecycle
// ─────────────────────────────────────────────

async function seedGroups(sock: WASocket): Promise<void> {
  try {
    const groups = await sock.groupFetchAllParticipating();
    let count = 0;
    for (const [jid, meta] of Object.entries(groups)) {
      if (!isGroupJid(jid)) continue;
      count++;
      await upsertGroup({
        group_jid: jid,
        subject: meta.subject ?? null,
        description: meta.desc ?? null,
        owner_jid: meta.owner ? normalizeJid(meta.owner) : null,
        member_count: meta.participants?.length ?? null,
      });
      await stampWatcherJoined(jid);
      for (const p of meta.participants ?? []) {
        await memberJoined(jid, normalizeJid(p.id), p.admin ?? "member");
      }
      // The lid ↔ phone identity bridge: participants in lid-addressed groups
      // carry phoneNumber alongside the lid id — persist the pair so the app
      // can resolve member lids to names, numbers, and staff profiles.
      await upsertContactBridges(
        participantBridgeRows([
          ...(meta.participants ?? []),
          ...(meta.owner && meta.ownerPn ? [{ id: meta.owner, phoneNumber: meta.ownerPn }] : []),
        ]),
      );
    }
    console.log(`[watcher] seeded ${count} groups`);
  } catch (e) {
    console.error("[watcher] group seed failed (will refresh on events):", e instanceof Error ? e.message : e);
  }
}

// CRASH-ONLY LIFECYCLE (audit P1-2): one process = one socket = one drain loop.
// Any disconnect exits the process and ECS (or the local runner) starts a fresh
// one. There is deliberately NO in-process reconnect — that pattern stacked
// sockets and drain loops on every reconnect and minted duplicate pairing codes
// (2026-08-27 incident). Session identity lives in Postgres, so a fresh process
// resumes instantly; WhatsApp's offline queue redelivers anything missed.

async function start(): Promise<void> {
  mkdirSync(config.mediaDir, { recursive: true });

  const { state, saveCreds } = await usePostgresAuthState();

  // Inherit state_since when a restart lands in the SAME state — otherwise a
  // crash loop resets the clock every boot and the alarm's "stuck connecting /
  // unpaired for N minutes" conditions can never fire (each boot looks fresh).
  const prior = await getWatcherStatusRow();

  // Banned (0249): hold, do not open a socket. The beat keeps reading the
  // restart stamp, so "Restart watcher" in Serene ends the hold within a minute;
  // a stamp newer than the ban means a human asked for one more try.
  if (prior?.state === "banned") {
    const retryAsked =
      !!prior.restart_requested_at && new Date(prior.restart_requested_at).getTime() > new Date(prior.state_since).getTime();
    if (!retryAsked) {
      watcherState = "banned";
      stateSince = prior.state_since;
      beat();
      console.warn(`[watcher] number is banned since ${prior.state_since} — holding, not reconnecting`);
      await sleep(BANNED_HOLD_MS);
      process.exit(0);
    }
    // The streak is left as it stands: a clean open clears it, one more 403
    // re-bans at once. "One more try" means exactly that.
    console.log("[watcher] retry asked from Serene after a ban — one more attempt");
  }

  const initialState: WatcherState = state.creds.me ? "connecting" : "pairing";
  if (prior?.state === initialState && prior.state_since) {
    watcherState = initialState;
    stateSince = prior.state_since;
    beat();
  } else {
    setWatcherState(initialState);
  }

  // The version fetch is a network call; a blip must not prevent boot (audit
  // P1-2). Undefined lets Baileys fall back to its baked protocol version.
  const version = await fetchLatestBaileysVersion()
    .then((v) => v.version)
    .catch(() => undefined);

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: state.creds,
      // Baileys-recommended cache over the key store — signal keys are read on
      // nearly every message; this keeps them in memory between DB round trips.
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    markOnlineOnConnect: false, // stay quiet — the watcher is a silent member
    // FULL history sync (founder decision 2026-08-29): the watcher advertises as
    // a full-sync client so WhatsApp delivers the deepest group history it holds
    // on pairing — the Sia vision feeds on the whole archive, not a recent
    // window. The dedup wall makes any overlap land exactly once; the flood
    // hardening (payload trim, 500-row chunks, per-row salvage) absorbs the
    // larger messaging-history.set batches.
    syncFullHistory: true,
    // rc14 TRAP (Baileys docs audit 2026-08-29): the DEFAULT
    // shouldSyncHistoryMessage silently DROPS chunks of syncType FULL — so
    // syncFullHistory alone requests deep history and then throws it away.
    // A zero-loss watcher accepts every chunk; the dedup wall absorbs overlap.
    shouldSyncHistoryMessage: () => true,
    // Serve retried/poll-referenced messages from our own archive (docs: needed
    // for retry receipts + poll-vote decryption; returning undefined starves
    // both). Pair lookup + byte-field revival — the same path the backfill uses.
    getMessage: async (key) => {
      if (!key.remoteJid || !key.id) return undefined;
      const raw = await fetchRawMessageByPair(key.remoteJid, key.id).catch(() => null);
      if (!raw) return undefined;
      const msg = reviveBuffers(raw) as WAMessage;
      return msg.message ?? undefined;
    },
  });
  setMediaSocket(sock);

  // creds.update MUST persist immediately or the session is lost (Baileys docs).
  sock.ev.on("creds.update", saveCreds);

  // ── Pairing on a HEADLESS host: the 8-character pairing code, never the QR
  // (a QR is ~65 log lines that CloudWatch delivers in batches — it expires
  // before it renders whole). `creds.me` is the "already paired" signal — NOT
  // `creds.registered`, which stays false forever on QR-paired sessions. ──
  if (!state.creds.me && config.pairNumber) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.pairNumber!);
        console.log(
          `\n[watcher] PAIRING CODE: ${code}\n` +
            `[watcher] On the watcher phone: WhatsApp → Linked Devices → Link with phone number instead → enter this code.\n`,
        );
      } catch (e) {
        console.error("[watcher] pairing code request failed:", e instanceof Error ? e.message : e);
      }
    }, 4000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    // The server's "offline queue fully replayed — you are live now" watermark.
    if (update.receivedPendingNotifications) {
      console.log("[watcher] offline queue replayed — live stream from here");
    }
    if (qr) {
      // ALWAYS publish to the status row — the /sia console renders it in the
      // browser (remote re-pairing, migration 0177). A local terminal also
      // draws it directly.
      void publishQr(qr);
      if (!config.pairNumber) {
        console.log("\n[watcher] Scan this QR with the WATCHER phone (WhatsApp → Linked Devices):\n");
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === "open") {
      void publishQr(null); // paired — never leave a stale QR on display
      myJid = normalizeJid(sock.user?.id ?? null);
      console.log(`[watcher] connected as ${myJid}`);
      setWatcherState("connected");
      void clearConnectionCloses();
      void upsertContact({ jid: myJid!, participant_role: "watcher", push_name: "Sia Watcher" });
      void seedGroups(sock);
      startMediaBackfill(sock);
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // WhatsApp rejected this session for good. Report the state (the alarm
        // turns it into a distinct "re-pairing needed" alert within one tick),
        // wipe it (audit P0-3), and exit — the next boot arms a fresh pairing.
        watcherState = "logged_out";
        stateSince = new Date().toISOString();
        void upsertWatcherStatus({ state: "logged_out", state_since: stateSince, account_jid: myJid })
          .then(() => wipeAuthState("loggedOut"))
          .finally(() => process.exit(1));
        return;
      }
      void (async () => {
        const streak = await recordConnectionClose(code ?? null);
        if (code === DisconnectReason.forbidden && streak >= BAN_REFUSALS) {
          // WhatsApp refuses this number. Say so once, then hold: the alarm
          // turns the state into its own alert; a human decides what is next.
          console.error(`[watcher] WhatsApp refused the number ${streak} times in a row (403) — marking BANNED and holding`);
          setWatcherState("banned");
          await sleep(BANNED_HOLD_MS);
          process.exit(0);
        }
        const pause = Math.min(RECONNECT_PAUSE_MS * 2 ** (streak - 1), RECONNECT_PAUSE_MAX_MS);
        console.warn(
          `[watcher] connection closed (${code ?? "unknown"}, ${streak} in a row) — pausing ${Math.round(pause / 1000)}s, then a clean restart`,
        );
        await sleep(pause);
        process.exit(0); // crash-only: the supervisor restarts a pristine process
      })();
    }
  });

  // ── THIN HANDLERS: enqueue and return. Nothing else, ever (§10.1). ──
  sock.ev.on("messages.upsert", (p) => enqueue("messages.upsert", p));
  sock.ev.on("messages.update", (p) => enqueue("messages.update", p));
  sock.ev.on("message-receipt.update", (p) => enqueue("message-receipt.update", p));
  sock.ev.on("messaging-history.set", (p) => enqueue("messaging-history.set", p));
  sock.ev.on("groups.upsert", (p) => enqueue("groups.upsert", p));
  sock.ev.on("groups.update", (p) => enqueue("groups.update", p));
  sock.ev.on("group-participants.update", (p) => enqueue("group-participants.update", p));
  sock.ev.on("contacts.upsert", (p) => enqueue("contacts.upsert", p));
  sock.ev.on("contacts.update", (p) => enqueue("contacts.update", p));
  sock.ev.on("lid-mapping.update", (p) => enqueue("lid-mapping.update", p));

  void drainLoop(sock);
}

// Crash-only: an uncaught throw means unknown state — exit and restart clean.
// Unhandled rejections are logged only (Baileys internals emit occasional noise).
process.on("uncaughtException", (e) => {
  console.error("[watcher] uncaught:", e.message);
  process.exit(1);
});
process.on("unhandledRejection", (e) => console.error("[watcher] unhandled:", e));

console.log("[watcher] Sia connector starting (read-only — this process never sends)");
void start();
