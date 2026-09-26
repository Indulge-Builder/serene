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
import type { HandsAllowedContactRow, HandsConnectorStatusRow, HandsMessageRow, HandsOutboxRow, HandsThreadRow } from "@/lib/types/hands";
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
export async function getHandsThread(id: string, scope: HandsScope): Promise<{ thread: HandsThreadSummary; messages: HandsMessageRow[]; outbox: HandsOutboxRow[] } | null> {
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
  return { thread: summary, messages: mapRows<HandsMessageRow, HandsMessageRow>(m, (r) => r), outbox: mapRows<HandsOutboxRow, HandsOutboxRow>(o, (r) => r) };
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
