// harvest.ts — THE history harvester (migration 0249,
// docs/architecture/sia-resilience-plan.md section 8b).
//
// The watcher only ever saw what was sent after its own number joined a group. The
// years before that sit on the phones of the people who were there from the start.
// This links to ONE such phone for one sitting, takes the history WhatsApp hands a
// newly linked device, keeps only what belongs to a linked member group, files it in
// the same archive, and unlinks itself.
//
//   npm run harvest -- --label advita                      (dry run: counts, writes nothing)
//   npm run harvest -- --label advita --apply
//        [--deep] [--deep-pages 40] [--group <jid>] [--max-groups N]
//        [--gap 2026-09-29T05:51:28Z,2026-09-29T12:28:00Z] [--minutes 45] [--quiet-seconds 120]
//   npm run harvest -- --label bench --selftest --max-groups 3   (no phone, no socket, no writes:
//        replays messages the archive already holds, plus a private chat and an unlinked group,
//        through the same intake; expects every real one "already held" and the two others dropped)
//
// FIVE LAWS. Each one is a line of code below, not a convention:
//   1. It never touches the watcher. Its login is a folder on this laptop
//      (~/.serene-harvest/<run>), never sia.wag_auth_state, never the status row.
//   2. It never stores a personal chat. A message is dropped IN MEMORY unless its
//      chat is a group already linked to a member in Serene. There is no raw-event
//      write here at all (the watcher's black box is the one thing not reused).
//   3. It never sends a message, never shows online, never marks anything read.
//   4. It never writes what the archive already holds: a message id the archive has
//      for that chat is skipped, whoever captured it first.
//   5. It always unlinks. On finish, on error, on Ctrl-C: logout, then the login
//      folder is deleted.
//
// A DRY RUN STILL LINKS THE PHONE (that is how the history arrives). It only skips
// the database writes.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { db, upsertContactBridges, upsertMessages, type WagMessageRow } from "./db.js";
import { normalizeJid, normalizeMessage } from "./normalize.js";

const logger = pino({ level: "silent" });

// ── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : (argv[i + 1] ?? null);
};
const num = (n: string, d: number) => {
  const v = Number(opt(n));
  return Number.isFinite(v) && v > 0 ? v : d;
};

const SELFTEST = flag("--selftest");
const APPLY = flag("--apply") && !SELFTEST;
const DEEP = flag("--deep");
const LABEL = (opt("--label") ?? "").trim();
const ONE_GROUP = opt("--group");
const MAX_GROUPS = num("--max-groups", Infinity);
const DEEP_PAGES = num("--deep-pages", 40);
const MINUTES = num("--minutes", 45);
const QUIET_MS = num("--quiet-seconds", 120) * 1000;
const GAP = (() => {
  const raw = opt("--gap");
  if (!raw) return null;
  const [a, b] = raw.split(",").map((s) => new Date(s.trim()).getTime());
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) throw new Error("--gap needs two ISO times: from,to");
  return { from: a, to: b };
})();

const DEEP_PAGE_SIZE = 50; // what WhatsApp serves per on-demand request
const DEEP_PAUSE_MS = 2_000; // the pace of a person scrolling up, never faster
const DEEP_WAIT_MS = 30_000;
const MAX_RECONNECTS = 5;
const WRITE_BATCH = 400;

if (!LABEL) {
  console.error('Say whose phone this is: --label "advita". It is recorded on every row this run writes.');
  process.exit(1);
}

// ── State ────────────────────────────────────────────────────────────────────

const RUN_ID = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${randomBytes(3).toString("hex")}`;
const AUTH_DIR = join(homedir(), ".serene-harvest", RUN_ID);
const DEADLINE = Date.now() + MINUTES * 60_000;

type GroupStat = {
  subject: string | null;
  watcherFirstAt: number | null; // the oldest message the archive held BEFORE this run
  seen: number; // messages of this group the phone sent us
  held: number; // already in the archive
  written: number;
  oldestAt: number | null;
  newestAt: number | null;
  oldestKey: WAMessageKey | null;
  newHistoryFrom: number | null; // range of NEW rows older than the watcher's record
  newHistoryTo: number | null;
  newGapFrom: number | null; // range of NEW rows inside --gap
  newGapTo: number | null;
};

const groups = new Map<string, GroupStat>();
const bridges = new Map<string, { pn: string; lid: string }>(); // in memory only; stored for kept senders alone
let dropped = 0; // messages of chats that are not linked member groups: counted, never kept
let lastHistoryAt = 0;
let historyEvents = 0;
let ownId: string | null = null;
let sock: WASocket | null = null;
let finishing = false;
let reconnects = 0;
const pending: { row: WagMessageRow; pushName: string | null }[] = [];
const deepWaiters = new Map<string, (n: number) => void>();

// ── The allow-list (law 2) ───────────────────────────────────────────────────

async function loadLinkedGroups(): Promise<void> {
  let q = db.from("wag_groups").select("group_jid, subject").not("member_id", "is", null).eq("is_active", true).order("group_jid").limit(5000);
  if (ONE_GROUP) q = q.eq("group_jid", ONE_GROUP);
  const { data, error } = await q;
  if (error) throw new Error(`could not read the linked groups: ${error.message}`);
  for (const g of (data ?? []) as { group_jid: string; subject: string | null }[]) {
    if (groups.size >= MAX_GROUPS) break;
    groups.set(g.group_jid, {
      subject: g.subject, watcherFirstAt: null, seen: 0, held: 0, written: 0, oldestAt: null, newestAt: null, oldestKey: null,
      newHistoryFrom: null, newHistoryTo: null, newGapFrom: null, newGapTo: null,
    });
  }
  if (groups.size === 0) throw new Error("no linked member group matches; nothing to harvest");
  // Where the archive's own record of each group begins, read once before anything is written.
  for (const jid of groups.keys()) {
    const { data: first } = await db.from("wag_messages").select("wa_timestamp").eq("chat_jid", jid).order("wa_timestamp", { ascending: true }).limit(1);
    const at = (first?.[0] as { wa_timestamp?: string } | undefined)?.wa_timestamp;
    groups.get(jid)!.watcherFirstAt = at ? new Date(at).getTime() : null;
  }
}

// ── Taking a batch of history ────────────────────────────────────────────────

function widen(lo: number | null, hi: number | null, t: number): [number, number] {
  return [lo === null ? t : Math.min(lo, t), hi === null ? t : Math.max(hi, t)];
}

function takeMessages(messages: WAMessage[]): Map<string, number> {
  const perChat = new Map<string, number>();
  for (const msg of messages) {
    const chat = msg.key?.remoteJid ?? "";
    const stat = groups.get(chat);
    if (!stat) {
      dropped++; // law 2: not a linked member group. Nothing of it is kept, logged or written.
      continue;
    }
    const n = normalizeMessage(msg, "history_sync");
    if (n.kind !== "message") continue;
    const row: WagMessageRow = { ...n.row, source: "harvest" };
    if (msg.key?.fromMe) {
      // The phone's owner wrote this. In the archive they are one more participant of the
      // group, never "me": `from_me` means the WATCHER's own number.
      if (!ownId) continue;
      row.sender_jid = ownId;
      row.from_me = false;
    }
    row.raw = { harvest: { run: RUN_ID, label: LABEL }, message: n.row.raw };

    const t = new Date(row.wa_timestamp).getTime();
    stat.seen++;
    perChat.set(chat, (perChat.get(chat) ?? 0) + 1);
    if (stat.oldestAt === null || t < stat.oldestAt) {
      stat.oldestAt = t;
      stat.oldestKey = msg.key ?? null;
    }
    if (stat.newestAt === null || t > stat.newestAt) stat.newestAt = t;
    pending.push({ row, pushName: msg.pushName ?? null });
  }
  return perChat;
}

/** Law 4: what the archive already holds for these ids, by chat. An 'undecrypted'
 *  placeholder does not count as held: the real text replaces it (upsertMessages). */
async function alreadyHeld(rows: WagMessageRow[]): Promise<Set<string>> {
  const held = new Set<string>();
  const byChat = new Map<string, string[]>();
  for (const r of rows) byChat.set(r.chat_jid, [...(byChat.get(r.chat_jid) ?? []), r.wa_message_id]);
  for (const [chat, ids] of byChat) {
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await db.from("wag_messages").select("wa_message_id, type").eq("chat_jid", chat).in("wa_message_id", ids.slice(i, i + 150));
      if (error) throw new Error(`archive read failed: ${error.message}`);
      for (const r of (data ?? []) as { wa_message_id: string; type: string }[]) {
        if (r.type !== "undecrypted") held.add(`${chat}|${r.wa_message_id}`);
      }
    }
  }
  return held;
}

async function flush(): Promise<void> {
  while (pending.length) {
    const batch = pending.splice(0, WRITE_BATCH);
    // The same message can arrive in two chunks of one sync.
    const unique = new Map<string, (typeof batch)[number]>();
    for (const b of batch) unique.set(`${b.row.chat_jid}|${b.row.wa_message_id}`, b);
    const rows = [...unique.values()];
    const held = await alreadyHeld(rows.map((r) => r.row));
    const fresh = rows.filter((r) => !held.has(`${r.row.chat_jid}|${r.row.wa_message_id}`));

    for (const r of rows) {
      const stat = groups.get(r.row.chat_jid)!;
      if (held.has(`${r.row.chat_jid}|${r.row.wa_message_id}`)) {
        stat.held++;
        continue;
      }
      stat.written++;
      const t = new Date(r.row.wa_timestamp).getTime();
      if (stat.watcherFirstAt === null || t < stat.watcherFirstAt) [stat.newHistoryFrom, stat.newHistoryTo] = widen(stat.newHistoryFrom, stat.newHistoryTo, t);
      else if (GAP && t >= GAP.from && t <= GAP.to) [stat.newGapFrom, stat.newGapTo] = widen(stat.newGapFrom, stat.newGapTo, t);
    }
    if (!APPLY || fresh.length === 0) continue;

    await upsertMessages(fresh.map((f) => f.row));
    // Who said it: the name they go by and, where the phone told us, the number behind a
    // hidden id. Only for people who spoke in a kept group (law 2 again).
    const senders = new Map<string, string | null>();
    for (const f of fresh) if (!senders.has(f.row.sender_jid) || f.pushName) senders.set(f.row.sender_jid, f.pushName);
    const rowsToBridge: { jid: string; lid: string | null; phone: string | null; push_name: string | null }[] = [];
    for (const [jid, pushName] of senders) {
      const b = bridges.get(jid);
      if (b) {
        const digits = b.pn.split("@")[0].replace(/\D/g, "");
        rowsToBridge.push({ jid: b.pn, lid: b.lid, phone: digits ? `+${digits}` : null, push_name: pushName });
      } else if (pushName && jid.endsWith("@s.whatsapp.net")) {
        const digits = jid.split("@")[0].replace(/\D/g, "");
        rowsToBridge.push({ jid, lid: null, phone: digits ? `+${digits}` : null, push_name: pushName });
      }
    }
    if (rowsToBridge.length) await upsertContactBridges(rowsToBridge);
  }
}

// ── Going further back, one page at a time ───────────────────────────────────

async function goDeeper(s: WASocket): Promise<void> {
  const list = [...groups.entries()].filter(([, g]) => g.oldestKey && g.oldestAt);
  console.log(`\n[harvest] asking the phone for older messages, ${list.length} groups, up to ${DEEP_PAGES} pages each`);
  let done = 0;
  for (const [jid, g] of list) {
    if (finishing || Date.now() >= DEADLINE) break;
    for (let page = 0; page < DEEP_PAGES; page++) {
      if (finishing || Date.now() >= DEADLINE) break;
      const before = g.oldestAt;
      const got = await new Promise<number>((resolve) => {
        const timer = setTimeout(() => {
          deepWaiters.delete(jid);
          resolve(-1);
        }, DEEP_WAIT_MS);
        deepWaiters.set(jid, (n) => {
          clearTimeout(timer);
          deepWaiters.delete(jid);
          resolve(n);
        });
        s.fetchMessageHistory(DEEP_PAGE_SIZE, g.oldestKey!, Math.floor(g.oldestAt! / 1000)).catch(() => {
          clearTimeout(timer);
          deepWaiters.delete(jid);
          resolve(-1);
        });
      });
      await flush();
      // The start of the group, or the phone has nothing older to give.
      if (got <= 0 || g.oldestAt === before) break;
      await new Promise((r) => setTimeout(r, DEEP_PAUSE_MS));
    }
    done++;
    if (done % 10 === 0) console.log(`[harvest] ${done} of ${list.length} groups walked back`);
  }
}

// ── The ledger and the report ────────────────────────────────────────────────

const day = (t: number | null) => (t === null ? "never" : new Date(t).toISOString().slice(0, 10));

async function writeLedger(): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  for (const [jid, g] of groups) {
    // One row per range of NEW messages the profiler has never been offered.
    const ranges: [string, number | null, number | null][] = [["history", g.newHistoryFrom, g.newHistoryTo], ["gap", g.newGapFrom, g.newGapTo]];
    for (const [kind, from, to] of ranges) {
      if (from === null || to === null) continue;
      rows.push({
        group_jid: jid,
        file_name: `harvest:${LABEL}:${kind}`,
        file_sha256: createHash("sha256").update(`harvest|${RUN_ID}|${jid}|${kind}`).digest("hex"),
        exported_by: LABEL,
        from_at: new Date(from).toISOString(),
        to_at: new Date(to).toISOString(),
        rows_read: g.seen,
        rows_written: g.written,
        rows_skipped: g.held,
        unresolved: [],
      });
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("wag_chat_imports").insert(rows.slice(i, i + 200));
    if (error) console.error("[harvest] ledger write failed (the messages are in):", error.message);
  }
}

function report(): void {
  const all = [...groups.values()];
  const reached = all.filter((g) => g.seen > 0);
  const seen = all.reduce((n, g) => n + g.seen, 0);
  const held = all.reduce((n, g) => n + g.held, 0);
  const written = all.reduce((n, g) => n + g.written, 0);
  const older = all.filter((g) => g.newHistoryFrom !== null);
  const oldest = reached.reduce<number | null>((m, g) => (g.oldestAt !== null && (m === null || g.oldestAt < m) ? g.oldestAt : m), null);
  const byMonth = new Map<string, number>();
  for (const g of reached) {
    const m = new Date(g.oldestAt!).toISOString().slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  console.log(
    [
      "",
      APPLY ? "HARVEST, APPLIED" : "HARVEST, DRY RUN (nothing was written)",
      `Phone                        ${LABEL}`,
      `Linked member groups         ${all.length}`,
      `Groups the phone had         ${reached.length}`,
      `Messages from those groups   ${seen}`,
      `Already in the archive       ${held}`,
      `${APPLY ? "Written" : "Would be written"}             ${written}`,
      `Groups with OLDER history    ${older.length}`,
      `Oldest message reached       ${day(oldest)}`,
      `Dropped (not a member group) ${dropped}   ← counted only; never kept`,
      "",
      "Where each group's history now begins (groups per month):",
      ...[...byMonth.entries()].sort().map(([m, n]) => `   ${m}   ${n}`),
    ].join("\n"),
  );
}

// ── Leaving (law 5) ──────────────────────────────────────────────────────────

async function finish(why: string, code = 0): Promise<never> {
  if (finishing) return new Promise<never>(() => {});
  finishing = true;
  console.log(`\n[harvest] finishing: ${why}`);
  try {
    await flush();
    if (APPLY) await writeLedger();
    report();
  } catch (e) {
    console.error("[harvest] the last write failed:", e instanceof Error ? e.message : e);
    code = 1;
  }
  try {
    if (sock && ownId) {
      await sock.logout();
      console.log("[harvest] unlinked from the phone");
    }
  } catch {
    console.warn("[harvest] could not unlink cleanly. On the phone: WhatsApp → Linked devices → remove the device named Mac OS.");
  }
  try {
    rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log("[harvest] login folder deleted");
  } catch {
    console.warn(`[harvest] delete this folder by hand: ${AUTH_DIR}`);
  }
  process.exit(code);
}

process.on("SIGINT", () => void finish("stopped by hand"));
process.on("SIGTERM", () => void finish("stopped"));
process.on("uncaughtException", (e) => void finish(`error: ${e.message}`, 1));

// ── The link ─────────────────────────────────────────────────────────────────

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const version = await fetchLatestBaileysVersion().then((v) => v.version).catch(() => undefined);

  const s = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    // A desktop client is what WhatsApp gives the long history to.
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true, // the rc14 default drops FULL chunks (see index.ts)
    markOnlineOnConnect: false, // law 3
  });
  sock = s;
  s.ev.on("creds.update", saveCreds);

  s.ev.on("messaging-history.set", (p) => {
    historyEvents++;
    lastHistoryAt = Date.now();
    for (const m of p.lidPnMappings ?? []) {
      const lid = normalizeJid(m.lid);
      const pn = normalizeJid(m.pn);
      bridges.set(lid, { pn, lid });
      bridges.set(pn, { pn, lid });
    }
    const perChat = takeMessages(p.messages ?? []);
    if (typeof p.progress === "number") console.log(`[harvest] history ${p.progress}% (${pending.length} waiting to be checked)`);
    for (const [chat, n] of perChat) deepWaiters.get(chat)?.(n);
  });

  s.ev.on("connection.update", (u) => {
    if (u.qr) {
      console.log(`\n[harvest] On ${LABEL}'s phone: WhatsApp → Linked devices → Link a device, then scan:\n`);
      qrcode.generate(u.qr, { small: true });
    }
    if (u.connection === "open") {
      const lid = (s.user as { lid?: string } | undefined)?.lid;
      ownId = normalizeJid(lid ?? s.user?.id ?? null);
      lastHistoryAt = Date.now();
      console.log("[harvest] linked. Waiting for the phone to send its history (keep the phone unlocked and on Wi-Fi)…");
    }
    if (u.connection === "close" && !finishing) {
      const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      // 515 is what WhatsApp sends right after a scan; 408 is a QR nobody scanned in time.
      const again = code === DisconnectReason.restartRequired || code === DisconnectReason.timedOut;
      if (again && ++reconnects <= MAX_RECONNECTS) {
        void connect();
        return;
      }
      void finish(code === DisconnectReason.forbidden ? "WhatsApp refused the link (403). Stop here and do not retry today." : `the connection closed (${code ?? "unknown"})`, 1);
    }
  });
}

/** No phone, no socket, no writes: the intake and the dedupe against real archived messages. */
async function selftest(): Promise<never> {
  await loadLinkedGroups();
  ownId = "selftest@lid";
  let replayed = 0;
  for (const jid of groups.keys()) {
    const { data } = await db.from("wag_messages").select("raw").eq("chat_jid", jid).neq("type", "undecrypted").not("raw", "is", null).order("wa_timestamp", { ascending: false }).limit(25);
    const msgs = ((data ?? []) as { raw: unknown }[]).map((r) => r.raw as WAMessage).filter((m) => m?.key?.id);
    replayed += msgs.length;
    takeMessages(msgs);
  }
  takeMessages([
    { key: { remoteJid: "910000000000@s.whatsapp.net", id: "SELFTEST-PRIVATE", fromMe: false }, message: { conversation: "a private chat" }, messageTimestamp: 1750000000 } as WAMessage,
    { key: { remoteJid: "120000000000000000@g.us", id: "SELFTEST-UNLINKED", participant: "1@lid" }, message: { conversation: "a group Serene does not know" }, messageTimestamp: 1750000000 } as WAMessage,
  ]);
  await flush();
  report();
  const all = [...groups.values()];
  const seen = all.reduce((n, g) => n + g.seen, 0);
  const held = all.reduce((n, g) => n + g.held, 0);
  const written = all.reduce((n, g) => n + g.written, 0);
  const ok = dropped === 2 && written === 0 && held === seen && seen > 0 && seen <= replayed;
  console.log(`\nSELFTEST ${ok ? "PASSED" : "FAILED"}: replayed ${replayed}, taken ${seen}, held ${held}, would write ${written}, dropped ${dropped}`);
  process.exit(ok ? 0 : 1);
}

async function main(): Promise<void> {
  if (SELFTEST) return void (await selftest());
  mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  await loadLinkedGroups();
  console.log(`[harvest] run ${RUN_ID}, ${groups.size} linked member groups on the allow-list, ${APPLY ? "APPLY" : "dry run"}${DEEP ? ", deep" : ""}`);
  await connect();

  // The first sync is over when the phone has been silent for a while.
  for (;;) {
    await new Promise((r) => setTimeout(r, 5_000));
    if (finishing) return;
    if (Date.now() >= DEADLINE) return void finish("the time allowance ran out");
    if (!ownId) continue;
    if (pending.length >= WRITE_BATCH) await flush();
    if (Date.now() - lastHistoryAt >= QUIET_MS) break;
  }
  await flush();
  console.log(`[harvest] first sync over: ${historyEvents} batches`);

  if (DEEP && sock) await goDeeper(sock);
  await finish(Date.now() >= DEADLINE ? "the time allowance ran out" : "done");
}

main().catch((e) => void finish(`error: ${e instanceof Error ? e.message : e}`, 1));
