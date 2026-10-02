// The connector's write seam onto the wag_ family (migration 0169).
// Direct service-role writes (plan-whatsapp §10.2 — no webhook hop). Every write
// is idempotent: messages upsert on WhatsApp's identity triple (+ wa_timestamp,
// the partition column), so dual watchers, redeliveries, and replays all land
// exactly once. All helpers are non-throwing at the call sites that drain the
// queue — a bad row is logged and skipped, never allowed to stall the stream.

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// All wag_ tables live in the `sia` schema (migration 0172 — kept out of public to
// keep the business-table list clean). Scope the whole client to it so every
// .from("wag_…") resolves to sia.wag_… with no per-query .schema() needed. (Type is
// inferred — the sia-scoped client's type differs from the default public one.)
export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
  db: { schema: "sia" },
});

const NORMALIZER_VERSION = 1;

// ─────────────────────────────────────────────
// Raw events (the black-box recorder — append-only, batched)
// ─────────────────────────────────────────────

// A single jsonb insert over ~1MB hits PostgREST's statement timeout, and on a
// batch insert that failure drops all 50 rows. On connect, the real watcher number
// (in every group) gets a firehose: a huge contacts.upsert and a multi-MB
// messaging-history.set. Those bulk blobs are LOW-VALUE for raw-replay (their
// messages are normalized from memory regardless — the black box still records
// that the event happened, its type, and its size). So: trim oversized payloads to
// a compact marker BEFORE insert, and fall back to per-row inserts if a batch still
// fails, so one bad row never drops the good ones. Live traffic (small) always
// stores whole — raw-first is intact for everything that matters.
const RAW_PAYLOAD_MAX_BYTES = 900_000;

export async function insertRawEvents(
  rows: { event_type: string; payload: unknown; account_jid: string | null }[],
): Promise<void> {
  if (rows.length === 0) return;
  const safe = rows.map((r) => {
    const serialized = JSON.stringify(r.payload);
    if (serialized.length > RAW_PAYLOAD_MAX_BYTES) {
      return {
        ...r,
        payload: {
          _truncated: true,
          reason: "oversized bulk payload (normalized from memory)",
          original_bytes: serialized.length,
          event_type: r.event_type,
        },
      };
    }
    return r;
  });

  const { error } = await db.from("wag_raw_events").insert(safe);
  if (!error) return;

  // Batch failed — salvage per-row so a single transient/oversized row can't drop the rest.
  for (const row of safe) {
    const { error: rowErr } = await db.from("wag_raw_events").insert(row);
    if (rowErr) console.error("[db] raw insert failed (row dropped):", rowErr.message);
  }
}

// ─────────────────────────────────────────────
// Heartbeat (migration 0175) — the watcher's own pulse. Liveness must never
// depend on group traffic (groups sleep at night); the alarm and the /sia dot
// read this one row instead. Non-fatal like every write here.
// ─────────────────────────────────────────────

export type WatcherState = "pairing" | "connecting" | "connected" | "logged_out" | "banned";

export type WatcherStatusRow = {
  state: WatcherState;
  state_since: string;
  close_streak: number;
  restart_requested_at: string | null;
};

/** Boot-time read so a restart in the SAME state inherits its state_since.
 *  Without this, a crash loop resets state_since every boot and the alarm's
 *  "stuck for N minutes" conditions can never fire. Also carries the close
 *  streak (the reconnect pause + the ban count, migration 0249) and the
 *  restart stamp (a boot in 'banned' holds unless Serene asked for a retry).
 *  Non-fatal: null on error. */
export async function getWatcherStatusRow(): Promise<WatcherStatusRow | null> {
  const { data, error } = await db
    .from("wag_watcher_status")
    .select("state, state_since, close_streak, restart_requested_at")
    .eq("id", 1)
    .limit(1);
  if (error) {
    console.error("[db] watcher status read failed:", error.message);
    return null;
  }
  const row = data?.[0] as Partial<WatcherStatusRow> | undefined;
  if (!row?.state || !row.state_since) return null;
  return {
    state: row.state,
    state_since: row.state_since,
    close_streak: Number(row.close_streak ?? 0),
    restart_requested_at: row.restart_requested_at ?? null,
  };
}

/** One close: streak + 1, the code and the moment. Returns the new streak so
 *  the caller can decide between a pause and a ban (migration 0249). */
export async function recordConnectionClose(code: number | null): Promise<number> {
  const prior = await getWatcherStatusRow();
  const streak = (prior?.close_streak ?? 0) + 1;
  const { error } = await db
    .from("wag_watcher_status")
    .update({ close_streak: streak, last_close_code: code, last_close_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) console.error("[db] close record failed:", error.message);
  return streak;
}

/** A clean open ends the streak. */
export async function clearConnectionCloses(): Promise<void> {
  const { error } = await db.from("wag_watcher_status").update({ close_streak: 0 }).eq("id", 1);
  if (error) console.error("[db] close streak reset failed:", error.message);
}

/** Beat + read back the app→watcher control column in the SAME round trip.
 *  Returns restart_requested_at so the caller can honour a Serene-side
 *  "Restart" / "Re-pair" request (migration 0177). */
export async function upsertWatcherStatus(row: {
  state: WatcherState;
  state_since: string;
  account_jid: string | null;
}): Promise<string | null> {
  const { data, error } = await db
    .from("wag_watcher_status")
    .upsert(
      {
        id: 1,
        beat_at: new Date().toISOString(),
        state: row.state,
        connected: row.state === "connected",
        state_since: row.state_since,
        account_jid: row.account_jid,
      },
      { onConflict: "id" },
    )
    .select("restart_requested_at");
  if (error) {
    console.error("[db] heartbeat failed:", error.message);
    return null;
  }
  return (data?.[0]?.restart_requested_at as string | null) ?? null;
}

/** Publish the current pairing QR (or clear it with null on connect) so the
 *  /sia console can render it in the browser — remote re-pairing without
 *  codebase or AWS access (migration 0177). */
export async function publishQr(qr: string | null): Promise<void> {
  const { error } = await db
    .from("wag_watcher_status")
    .update({ qr, qr_at: qr ? new Date().toISOString() : null })
    .eq("id", 1);
  if (error) console.error("[db] qr publish failed:", error.message);
}

// ─────────────────────────────────────────────
// Contacts / groups / members
// ─────────────────────────────────────────────

type ContactUpsertRow = {
  jid: string;
  lid?: string | null;
  phone?: string | null;
  push_name?: string | null;
  participant_role?: string;
};

/**
 * THE contact write — every contact upsert routes through here. A null/undefined
 * field is DROPPED from the payload so it can never overwrite a value we already
 * hold (contacts.update events are partial: a row without `notify` used to null
 * out an existing push_name). Rows are grouped by their present-key signature
 * (PostgREST builds one column list per statement), deduped by jid within each
 * group, and chunked so no single statement goes oversized.
 */
async function upsertContactRowsSafe(rows: ContactUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const CHUNK = 500;
  const bySignature = new Map<string, Map<string, Record<string, unknown>>>();
  for (const r of rows) {
    const clean: Record<string, unknown> = { jid: r.jid, last_seen_at: now };
    for (const [k, v] of Object.entries(r)) {
      if (k !== "jid" && v !== null && v !== undefined) clean[k] = v;
    }
    const sig = Object.keys(clean).sort().join(",");
    const group = bySignature.get(sig) ?? new Map<string, Record<string, unknown>>();
    group.set(r.jid, clean); // last write wins within one event batch
    bySignature.set(sig, group);
  }
  for (const group of bySignature.values()) {
    const list = [...group.values()];
    for (let i = 0; i < list.length; i += CHUNK) {
      const { error } = await db
        .from("wag_contacts")
        .upsert(list.slice(i, i + CHUNK), { onConflict: "jid", ignoreDuplicates: false });
      if (error) console.error("[db] contact upsert failed:", error.message);
    }
  }
}

export async function upsertContact(row: ContactUpsertRow): Promise<void> {
  await upsertContactRowsSafe([row]);
}

/** Batch contact upsert — the connect-flood path (contacts.upsert can carry
 *  thousands of rows for the real watcher number). */
export async function upsertContactsBatch(rows: ContactUpsertRow[]): Promise<void> {
  await upsertContactRowsSafe(rows);
}

/**
 * Identity bridge — lid ↔ phone-jid pairs harvested from group participant
 * metadata (lid-addressed groups hide numbers behind @lid ids; the participant
 * object still carries `phoneNumber`). One contact row per phone jid, `lid` +
 * `phone` filled so the app can resolve members → names → staff profiles.
 */
export async function upsertContactBridges(
  rows: { jid: string; lid: string | null; phone: string | null; push_name: string | null }[],
): Promise<void> {
  await upsertContactRowsSafe(rows);
}

export async function upsertGroup(row: {
  group_jid: string;
  subject?: string | null;
  description?: string | null;
  owner_jid?: string | null;
  member_count?: number | null;
}): Promise<void> {
  const { error } = await db
    .from("wag_groups")
    .upsert(row, { onConflict: "group_jid", ignoreDuplicates: false });
  if (error) console.error("[db] group upsert failed:", error.message);
}

/** Stamp "watching since" exactly once — the null guard means a reboot or
 *  re-seed can never reset a group's original watch date (it used to reset on
 *  every boot, so the info panel's "Watching since" was always today). */
export async function stampWatcherJoined(groupJid: string): Promise<void> {
  const { error } = await db
    .from("wag_groups")
    .update({ watcher_joined_at: new Date().toISOString() })
    .eq("group_jid", groupJid)
    .is("watcher_joined_at", null);
  if (error) console.error("[db] watcher_joined stamp failed:", error.message);
}

/** Membership history: a join inserts a new stint; leave closes the open one. */
export async function memberJoined(groupJid: string, memberJid: string, role = "member") {
  const { data: open } = await db
    .from("wag_group_members")
    .select("joined_at")
    .eq("group_jid", groupJid)
    .eq("member_jid", memberJid)
    .is("left_at", null)
    .limit(1);
  if (open && open.length > 0) return; // already an open stint
  const { error } = await db
    .from("wag_group_members")
    .insert({ group_jid: groupJid, member_jid: memberJid, role });
  if (error && !error.message.includes("duplicate")) {
    console.error("[db] member join failed:", error.message);
  }
}

export async function memberLeft(groupJid: string, memberJid: string) {
  const { error } = await db
    .from("wag_group_members")
    .update({ left_at: new Date().toISOString() })
    .eq("group_jid", groupJid)
    .eq("member_jid", memberJid)
    .is("left_at", null);
  if (error) console.error("[db] member leave failed:", error.message);
}

export async function memberRoleChanged(groupJid: string, memberJid: string, role: string) {
  const { error } = await db
    .from("wag_group_members")
    .update({ role })
    .eq("group_jid", groupJid)
    .eq("member_jid", memberJid)
    .is("left_at", null);
  if (error) console.error("[db] member role change failed:", error.message);
}

// ─────────────────────────────────────────────
// Messages (upsert on the WhatsApp identity triple — the dedup wall)
// ─────────────────────────────────────────────

export type WagMessageRow = {
  chat_jid: string;
  wa_message_id: string;
  sender_jid: string;
  from_me: boolean;
  type: string;
  text: string | null;
  quoted_wa_message_id: string | null;
  quoted_sender_jid: string | null;
  wa_timestamp: string;
  is_forwarded: boolean;
  edit_of_wa_message_id: string | null;
  // 'harvest' = taken from a staff phone linked for one sitting (harvest.ts, migration 0249).
  source: "live" | "history_sync" | "backfill" | "harvest";
  raw: unknown;
};

export async function upsertMessages(rows: WagMessageRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Chunked — a history_sync batch can carry thousands of messages; one giant
  // upsert would hit the statement timeout. 500/statement keeps each insert small.
  const CHUNK = 500;
  const stamped = rows.map((r) => ({ ...r, normalizer_version: NORMALIZER_VERSION }));
  for (let i = 0; i < stamped.length; i += CHUNK) {
    const chunk = stamped.slice(i, i + CHUNK);

    // Pierce the dedup wall for decode retries: an 'undecrypted' CIPHERTEXT
    // placeholder occupies the message's identity slot, so the DECODED re-send
    // would silently bounce off the upsert. Delete matching placeholders first
    // — the real content replacing its own placeholder is a correction, not a
    // history rewrite (the raw event of the failure is still in the black box).
    const contentByChat = new Map<string, string[]>();
    for (const r of chunk) {
      if (r.type === "undecrypted") continue;
      const ids = contentByChat.get(r.chat_jid) ?? [];
      ids.push(r.wa_message_id);
      contentByChat.set(r.chat_jid, ids);
    }
    for (const [chatJid, ids] of contentByChat) {
      const { error } = await db
        .from("wag_messages")
        .delete()
        .eq("chat_jid", chatJid)
        .eq("type", "undecrypted")
        .in("wa_message_id", ids);
      if (error) console.error("[db] placeholder sweep failed:", error.message);
    }

    const { error } = await db.from("wag_messages").upsert(chunk, {
      onConflict: "chat_jid,wa_message_id,sender_jid,wa_timestamp",
      ignoreDuplicates: true, // dual watcher / redelivery → silent bounce
    });
    if (error) console.error("[db] message upsert failed:", error.message);
  }
}

/** Raw-message lookup by PAIR, not triple: sender_jid is the unstable leg (lid
 *  vs phone forms across sync eras) and a message id is unique within its chat.
 *  Shared by the media backfill AND the socket's getMessage callback. */
export async function fetchRawMessageByPair(chatJid: string, waMessageId: string): Promise<unknown | null> {
  const { data, error } = await db
    .from("wag_messages")
    .select("raw")
    .eq("chat_jid", chatJid)
    .eq("wa_message_id", waMessageId)
    .limit(1);
  if (error || !data?.[0]?.raw) return null;
  return data[0].raw;
}

/** Delete-for-everyone: flip the tag, keep everything (locked decision 4). */
export async function markRevoked(chatJid: string, targetWaMessageId: string): Promise<void> {
  const { error } = await db
    .from("wag_messages")
    .update({ is_revoked: true })
    .eq("chat_jid", chatJid)
    .eq("wa_message_id", targetWaMessageId);
  if (error) console.error("[db] revoke flag failed:", error.message);
}

// ─────────────────────────────────────────────
// Reactions (current state; history lives in raw — locked decision 3)
// ─────────────────────────────────────────────

export async function upsertReaction(row: {
  chat_jid: string;
  wa_message_id: string;
  target_sender_jid: string;
  reactor_jid: string;
  emoji: string;
}): Promise<void> {
  if (row.emoji === "") {
    const { error } = await db
      .from("wag_reactions")
      .delete()
      .eq("chat_jid", row.chat_jid)
      .eq("wa_message_id", row.wa_message_id)
      .eq("reactor_jid", row.reactor_jid);
    if (error) console.error("[db] reaction delete failed:", error.message);
    return;
  }
  const { error } = await db
    .from("wag_reactions")
    .upsert(
      { ...row, reacted_at: new Date().toISOString() },
      { onConflict: "chat_jid,wa_message_id,reactor_jid" },
    );
  if (error) console.error("[db] reaction upsert failed:", error.message);
}

// ─────────────────────────────────────────────
// Receipts (pilot: all non-watcher receipts; the client-only gate arrives with
// group mapping — plan-whatsapp §11 decision 5)
// ─────────────────────────────────────────────

export async function upsertReceipt(row: {
  chat_jid: string;
  wa_message_id: string;
  participant_jid: string;
  delivered_at?: string | null;
  read_at?: string | null;
  played_at?: string | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    chat_jid: row.chat_jid,
    wa_message_id: row.wa_message_id,
    participant_jid: row.participant_jid,
  };
  if (row.delivered_at) patch.delivered_at = row.delivered_at;
  if (row.read_at) patch.read_at = row.read_at;
  if (row.played_at) patch.played_at = row.played_at;
  const { error } = await db
    .from("wag_receipts")
    .upsert(patch, { onConflict: "chat_jid,wa_message_id,participant_jid" });
  if (error) console.error("[db] receipt upsert failed:", error.message);
}

// ─────────────────────────────────────────────
// Media rows (the fetch queue; the worker lives in media.ts)
// ─────────────────────────────────────────────

export async function insertMediaRow(row: {
  chat_jid: string;
  wa_message_id: string;
  sender_jid: string;
  media_type: string;
  mime: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  /** the MESSAGE's timestamp (0178) — the backfill recovers newest-first */
  wa_timestamp: string;
}): Promise<void> {
  const { error } = await db
    .from("wag_media")
    .upsert(row, { onConflict: "chat_jid,wa_message_id,sender_jid", ignoreDuplicates: true });
  if (error) console.error("[db] media row insert failed:", error.message);
}

export async function markMediaDone(
  chatJid: string,
  waMessageId: string,
  senderJid: string,
  storagePath: string,
  sizeBytes: number,
): Promise<void> {
  const { error } = await db
    .from("wag_media")
    .update({ download_status: "done", storage_path: storagePath, size_bytes: sizeBytes })
    .eq("chat_jid", chatJid)
    .eq("wa_message_id", waMessageId)
    .eq("sender_jid", senderJid);
  if (error) console.error("[db] media done failed:", error.message);
}

export async function markMediaAttempt(
  chatJid: string,
  waMessageId: string,
  senderJid: string,
  attempts: number,
  dead: boolean,
): Promise<void> {
  const { error } = await db
    .from("wag_media")
    .update({
      download_status: dead ? "dead_letter" : "retrying",
      attempts,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("chat_jid", chatJid)
    .eq("wa_message_id", waMessageId)
    .eq("sender_jid", senderJid);
  if (error) console.error("[db] media attempt failed:", error.message);
}
