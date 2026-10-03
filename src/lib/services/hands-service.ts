// hands-service.ts — ALL reads of the `hands` schema (migration 0245; docs/architecture/hands-plan.md).
//
// Admin client throughout (the hands tables have no user policies; the connector writes them),
// so THE CALLER GATES: a page or an Elaya tool passes the scope it already established
// (canAccessMember / getSiaViewerScope → the queendom ids the viewer may see; null = every
// queendom for admin, founder and the Joker head). The Talk tab's free threads carry no queendom
// and are visible to whoever may see hands at all. No Redis: a thread is live traffic.
// No `server-only`: Elaya's bridged tools and a laptop bench call these.

import { createAdminClient } from "@/lib/supabase/admin";
import { handsDb, HANDS_SCHEMA } from "@/lib/supabase/schemas";
import { mapRows } from "@/lib/utils/rows";
import { readLinkPreview, type WaPreviewFields } from "@/lib/utils/link-preview";
import type { HandsAllowedContactRow, HandsChatMessage, HandsConnectorStatusRow, HandsMessageRow, HandsOutboxRow, HandsThreadRow } from "@/lib/types/hands";
import type { HandsThreadKind, HandsThreadStatus } from "@/lib/constants/hands";

const LOG = "[hands-service]";
export const HANDS_MEDIA_BUCKET = "hands-media";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type HandsThreadSummary = HandsThreadRow & { contact_label: string; ticket_no: string | null; ticket_title: string | null; member_name: string | null; queued: number };

export type HandsScope = { queendomIds: string[] | null };

/** The rail: open (or all) threads the viewer may see, newest activity first. */
export async function listHandsThreads(scope: HandsScope, opts: { kind?: HandsThreadKind; status?: HandsThreadStatus | "all"; limit?: number } = {}): Promise<HandsThreadSummary[]> {
  const admin = createAdminClient();
  let q = handsDb(admin).from("threads").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(opts.limit ?? 100);
  if (opts.kind) q = q.eq("kind", opts.kind);
  const status = opts.status ?? "open";
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) { console.error(`${LOG} threads read failed`, error.message); return []; }
  const rows = mapRows<HandsThreadRow, HandsThreadRow>(data, (r) => r)
    .filter((t) => scope.queendomIds === null || t.kind === "talk" || (t.queendom_id !== null && scope.queendomIds.includes(t.queendom_id)));
  return decorate(rows);
}

/** One thread the viewer may see, with its messages oldest first and what is still queued. */
export async function getHandsThread(id: string, scope: HandsScope): Promise<{ thread: HandsThreadSummary; messages: HandsChatMessage[]; outbox: HandsOutboxRow[] } | null> {
  const admin = createAdminClient();
  const { data: t } = await handsDb(admin).from("threads").select("*").eq("id", id).maybeSingle();
  if (!t) return null;
  const thread = t as HandsThreadRow;
  if (scope.queendomIds !== null && thread.kind !== "talk" && (thread.queendom_id === null || !scope.queendomIds.includes(thread.queendom_id))) return null;
  const [{ data: m }, { data: o }, [summary]] = await Promise.all([
    handsDb(admin).from("messages").select("*").eq("thread_id", id).order("wa_timestamp", { ascending: true }).limit(500),
    handsDb(admin).from("outbox").select("*").eq("thread_id", id).in("status", ["queued", "failed", "refused"]).order("requested_at", { ascending: true }),
    decorate([thread]),
  ]);
  return { thread: summary, messages: foldHandsChat(mapRows<HandsMessageRow, HandsMessageRow>(m, (r) => r)), outbox: mapRows<HandsOutboxRow, HandsOutboxRow>(o, (r) => r) };
}

type RawWa = {
  key?: { fromMe?: boolean };
  message?: {
    extendedTextMessage?: WaPreviewFields;
    reactionMessage?: { key?: { id?: string }; text?: string };
    protocolMessage?: { type?: number | string; key?: { id?: string }; editedMessage?: { conversation?: string; extendedTextMessage?: { text?: string } } };
  } & Record<string, unknown>;
};

/** Payload types that carry no line of their own (key exchange, history sync, app state). Hidden from the chat. */
const SILENT_PAYLOADS = ["senderKeyDistributionMessage", "messageContextInfo", "protocolMessage", "reactionMessage"];

/**
 * THE fold of a hands chat (2026-10-01): WhatsApp sends a reaction, an edit and a delete as messages
 * of their own, which the connector files as kind `other` and the chat printed as "[other]". Here a
 * reaction lands as a chip on the message it is about (the latest per person wins, an empty one takes
 * it back), an edit replaces the text, a delete empties the line, a link carries the preview the
 * sender's phone made (readLinkPreview), and payloads with no line of their
 * own are hidden. Reads `raw`, so rows filed before the fold are repaired too. Pure.
 */
export function foldHandsChat(rows: HandsMessageRow[]): HandsChatMessage[] {
  const reactions = new Map<string, Map<string, string>>(); // target wa id → reactor → emoji
  const edits = new Map<string, string | null>();          // target wa id → new text (null = deleted)
  const hidden = new Set<string>();
  for (const r of rows) {
    if (r.kind !== "other") continue;
    const raw = r.raw as RawWa;
    const msg = raw?.message ?? {};
    const reactor = raw?.key?.fromMe ? "me" : r.jid;
    if (msg.reactionMessage?.key?.id) {
      const target = msg.reactionMessage.key.id;
      const forTarget = reactions.get(target) ?? new Map<string, string>();
      if (msg.reactionMessage.text) forTarget.set(reactor, msg.reactionMessage.text); else forTarget.delete(reactor);
      reactions.set(target, forTarget);
      hidden.add(r.id);
    } else if (msg.protocolMessage) {
      const p = msg.protocolMessage;
      const target = p.key?.id;
      const edited = p.editedMessage?.conversation ?? p.editedMessage?.extendedTextMessage?.text;
      if (target && edited) edits.set(target, edited);
      else if (target && (p.type === 0 || p.type === "REVOKE")) edits.set(target, null);
      hidden.add(r.id);
    } else if (Object.keys(msg).length > 0 && Object.keys(msg).every((k) => SILENT_PAYLOADS.includes(k))) {
      hidden.add(r.id);
    }
  }
  return rows.filter((r) => !hidden.has(r.id)).map((r) => {
    const counts = new Map<string, number>();
    for (const emoji of reactions.get(r.wa_message_id)?.values() ?? []) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    const link_preview = r.kind === "text" ? readLinkPreview((r.raw as RawWa)?.message?.extendedTextMessage) : null;
    const row: HandsChatMessage = { ...r, reactions: [...counts.entries()].map(([emoji, count]) => ({ emoji, count })), link_preview };
    if (edits.has(r.wa_message_id)) {
      const text = edits.get(r.wa_message_id) ?? null;
      return { ...row, text: text ?? "This message was deleted", kind: text === null ? "text" : row.kind, media_path: text === null ? null : row.media_path };
    }
    return row;
  });
}

/** The open ticket thread for a ticket, if any (the ticket page asks). */
export async function getHandsThreadForTicket(ticketId: string): Promise<HandsThreadRow | null> {
  const { data } = await handsDb(createAdminClient()).from("threads").select("*").eq("ticket_id", ticketId).eq("status", "open").maybeSingle();
  return (data as HandsThreadRow | null) ?? null;
}

export async function listAllowedContacts(): Promise<HandsAllowedContactRow[]> {
  const { data, error } = await handsDb(createAdminClient()).from("allowed_contacts").select("*").order("label");
  if (error) console.error(`${LOG} contacts read failed`, error.message);
  return mapRows<HandsAllowedContactRow, HandsAllowedContactRow>(data, (r) => r);
}

/**
 * Messages an allowed contact sent while no conversation with it was open, per number. The
 * connector files a message into the open thread of its number, so a first message, or one after
 * a thread was closed, waits here until someone opens the chat (openTalkThreadCore adopts them).
 */
export type HandsUnfiled = Record<string, { count: number; lastAt: string; lastText: string | null }>;

export async function listUnfiledByContact(): Promise<HandsUnfiled> {
  const { data, error } = await handsDb(createAdminClient()).from("messages").select("jid, wa_timestamp, text, kind").is("thread_id", null).is("match_status", null).order("wa_timestamp", { ascending: false }).limit(500);
  if (error) { console.error(`${LOG} unfiled read failed`, error.message); return {}; }
  const out: HandsUnfiled = {};
  mapRows<{ jid: string; wa_timestamp: string; text: string | null; kind: string }, void>(data, (r) => {
    const cur = out[r.jid];
    out[r.jid] = cur ? { ...cur, count: cur.count + 1 } : { count: 1, lastAt: r.wa_timestamp, lastText: r.text ?? `[${r.kind}]` };
  });
  return out;
}

/** The allowed contact behind an agent vendor (vendors.kind = agent). */
export async function getAllowedContactForVendor(vendorId: string): Promise<HandsAllowedContactRow | null> {
  const { data } = await handsDb(createAdminClient()).from("allowed_contacts").select("*").eq("vendor_id", vendorId).eq("is_active", true).limit(1).maybeSingle();
  return (data as HandsAllowedContactRow | null) ?? null;
}

export async function getHandsConnectorStatus(): Promise<HandsConnectorStatusRow | null> {
  const { data } = await handsDb(createAdminClient()).from("connector_status").select("*").eq("id", 1).maybeSingle();
  return (data as HandsConnectorStatusRow | null) ?? null;
}

/** A one-hour signed url for a file the agent sent (a QR). The path is never public. */
export async function signHandsMedia(path: string): Promise<string | null> {
  const { data, error } = await createAdminClient().storage.from(HANDS_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) { console.error(`${LOG} sign failed`, error.message); return null; }
  return data?.signedUrl ?? null;
}

// ─── decoration: contact label, ticket number and title, member name, queued count ──

async function decorate(rows: HandsThreadRow[]): Promise<HandsThreadSummary[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const jids = [...new Set(rows.map((r) => r.jid))];
  const ticketIds = rows.map((r) => r.ticket_id).filter((x): x is string => Boolean(x));
  const threadIds = rows.map((r) => r.id);
  const [{ data: contacts }, { data: tickets }, { data: queued }] = await Promise.all([
    handsDb(admin).from("allowed_contacts").select("jid, label").in("jid", jids),
    ticketIds.length ? admin.schema("sia").from("tickets").select("id, ticket_no, title, member_id").in("id", ticketIds) : Promise.resolve({ data: [] as unknown[] }),
    handsDb(admin).from("outbox").select("thread_id").eq("status", "queued").in("thread_id", threadIds),
  ]);
  const label = new Map<string, string>(); mapRows<{ jid: string; label: string }, void>(contacts, (c) => { label.set(c.jid, c.label); });
  const ticket = new Map<string, { ticket_no: string; title: string; member_id: string }>();
  mapRows<{ id: string; ticket_no: string; title: string; member_id: string }, void>(tickets as unknown[], (t) => { ticket.set(t.id, t); });
  const memberIds = [...new Set([...ticket.values()].map((t) => t.member_id))];
  const memberName = new Map<string, string>();
  if (memberIds.length) {
    const { data: members } = await admin.schema("member").from("members").select("id, full_name").in("id", memberIds);
    mapRows<{ id: string; full_name: string }, void>(members, (m) => { memberName.set(m.id, m.full_name); });
  }
  const queuedCount = new Map<string, number>(); mapRows<{ thread_id: string }, void>(queued, (q) => { queuedCount.set(q.thread_id, (queuedCount.get(q.thread_id) ?? 0) + 1); });
  return rows.map((r) => {
    const t = r.ticket_id ? ticket.get(r.ticket_id) : undefined;
    return { ...r, contact_label: label.get(r.jid) ?? r.jid, ticket_no: t?.ticket_no ?? null, ticket_title: t?.title ?? null, member_name: t ? (memberName.get(t.member_id) ?? null) : null, queued: queuedCount.get(r.id) ?? 0 };
  });
}

export { HANDS_SCHEMA };

/**
 * The tray (2026-10-03): agent replies the connector could not place and Elaya could not match,
 * newest first, each with the open jobs of its number to choose from. Unscoped viewers only (the
 * CALLER gates): a reply may belong to any queendom's job.
 */
export type HandsUnmatched = {
  message: Pick<HandsMessageRow, "id" | "jid" | "kind" | "text" | "wa_timestamp" | "media_path">;
  jobs: { threadId: string; label: string }[];
};
export async function listUnmatchedHands(limit = 50): Promise<HandsUnmatched[]> {
  const db = handsDb(createAdminClient());
  const { data, error } = await db.from("messages").select("id, jid, kind, text, wa_timestamp, media_path").eq("match_status", "unmatched").is("thread_id", null)
    .order("wa_timestamp", { ascending: false }).limit(limit);
  if (error) { console.error(`${LOG} unmatched read failed`, error.message); return []; }
  const msgs = mapRows<HandsUnmatched["message"], HandsUnmatched["message"]>(data, (r) => r);
  if (msgs.length === 0) return [];
  const { data: t } = await db.from("threads").select("*").in("jid", [...new Set(msgs.map((m) => m.jid))]).eq("status", "open");
  const threads = await decorate(mapRows<HandsThreadRow, HandsThreadRow>(t, (r) => r));
  return msgs.map((message) => ({
    message,
    jobs: threads.filter((th) => th.jid === message.jid).map((th) => ({
      threadId: th.id,
      label: th.kind === "talk" ? `Free chat with ${th.contact_label}` : `${th.ticket_no ?? "Ticket"} · ${th.ticket_title ?? ""}`.trim(),
    })),
  }));
}
