// The hands connector's write seam onto schema `hands` (migration 0245) plus the one call it makes
// into `sia`: apply_ticket_change, so a line that crossed the wire becomes a ticket event in the
// same order as notes and moves. Service-role, direct writes, idempotent on (jid, wa_message_id).
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const handsDb = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
  db: { schema: "hands" },
});
const siaDb = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
  db: { schema: "sia" },
});

export type AllowedContact = { jid: string; label: string; vendor_id: string | null; is_active: boolean };
export type ThreadRow = { id: string; jid: string; kind: "ticket" | "talk"; ticket_id: string | null; status: "open" | "closed"; last_message_at: string | null };
export type OutboxRow = { id: string; thread_id: string; jid: string; text: string; requested_by: string | null; source: "human" | "elaya"; disclosure: Record<string, unknown>; status: string };
export type Frame = "done" | "need" | "options" | "failed" | "waiting";
export type Payment = { amount_inr: number | null; payee: string | null; expires_at: string | null };

export async function insertRawEvent(event_type: string, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? { _bytes: v.length } : v));
  const trimmed = body.length > 900_000 ? { _trimmed: true, bytes: body.length } : JSON.parse(body);
  const { error } = await handsDb.from("raw_events").insert({ event_type, payload: trimmed });
  if (error) console.error("[hands-db] raw insert failed:", error.message);
}

export async function loadAllowlist(): Promise<Map<string, AllowedContact>> {
  const { data, error } = await handsDb.from("allowed_contacts").select("jid, label, vendor_id, is_active").eq("is_active", true);
  if (error) { console.error("[hands-db] allowlist read failed:", error.message); return new Map(); }
  return new Map((data as AllowedContact[]).map((c) => [c.jid, c]));
}

/** The open thread a message from this contact belongs to: the most recently active one (a ticket thread or the Talk tab). */
export async function findOpenThread(jid: string): Promise<ThreadRow | null> {
  const { data } = await handsDb.from("threads").select("id, jid, kind, ticket_id, status, last_message_at").eq("jid", jid).eq("status", "open")
    .order("last_message_at", { ascending: false, nullsFirst: false }).order("opened_at", { ascending: false }).limit(1);
  return ((data as ThreadRow[] | null)?.[0]) ?? null;
}

export async function getThread(id: string): Promise<ThreadRow | null> {
  const { data } = await handsDb.from("threads").select("id, jid, kind, ticket_id, status, last_message_at").eq("id", id).maybeSingle();
  return (data as ThreadRow | null) ?? null;
}

export type MessageInsert = {
  thread_id: string | null; jid: string; wa_message_id: string; direction: "in" | "out"; kind: string; text: string | null;
  media_path: string | null; media_mime: string | null; wa_timestamp: string; frame: Frame | null; payment: Payment | null; outbox_id: string | null; raw: unknown;
};

/** Idempotent on (jid, wa_message_id): a redelivery lands once. Returns the row id (existing or new). */
export async function upsertMessage(row: MessageInsert): Promise<string | null> {
  const { data, error } = await handsDb.from("messages").upsert(row, { onConflict: "jid,wa_message_id", ignoreDuplicates: false }).select("id").single();
  if (error) { console.error("[hands-db] message upsert failed:", error.message); return null; }
  return (data as { id: string }).id;
}

export async function touchThread(threadId: string, at: string, direction: "in" | "out", preview: string | null): Promise<void> {
  const { error } = await handsDb.from("threads").update({ last_message_at: at, last_direction: direction, last_preview: preview ? preview.slice(0, 160) : null }).eq("id", threadId);
  if (error) console.error("[hands-db] thread touch failed:", error.message);
}

export async function claimQueuedOutbox(limit: number): Promise<OutboxRow[]> {
  const { data, error } = await handsDb.from("outbox").select("id, thread_id, jid, text, requested_by, source, disclosure, status").eq("status", "queued").order("requested_at", { ascending: true }).limit(limit);
  if (error) { console.error("[hands-db] outbox read failed:", error.message); return []; }
  return (data as OutboxRow[]) ?? [];
}

export async function settleOutbox(id: string, patch: { status: "sent" | "failed" | "refused"; wa_message_id?: string | null; error?: string | null }): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await handsDb.from("outbox").update({ ...patch, attempted_at: now, ...(patch.status === "sent" ? { sent_at: now } : {}) }).eq("id", id).eq("status", "queued");
  if (error) console.error("[hands-db] outbox settle failed:", error.message);
}

/** A line that crossed the wire becomes a ticket event, in order with notes and moves (0195 apply_ticket_change, empty patch). */
export async function writeTicketEvent(ticketId: string, event_type: "hands_message" | "hands_sent" | "payment_request", body: string | null, meta: Record<string, unknown>): Promise<void> {
  const { error } = await siaDb.rpc("apply_ticket_change", { p_ticket_id: ticketId, p_patch: {}, p_event: { actor_kind: "system", actor_id: "", event_type, body, meta } });
  if (error) console.error("[hands-db] ticket event failed:", error.message);
}

export async function upsertStatus(row: { state: "pairing" | "connecting" | "connected" | "logged_out"; state_since: string; connected: boolean; account_jid: string | null }): Promise<void> {
  const { error } = await handsDb.from("connector_status").upsert({ id: 1, beat_at: new Date().toISOString(), ...row }, { onConflict: "id" });
  if (error) console.error("[hands-db] status upsert failed:", error.message);
}

export async function publishQr(qr: string | null): Promise<void> {
  const { error } = await handsDb.from("connector_status").upsert({ id: 1, qr, qr_at: qr ? new Date().toISOString() : null }, { onConflict: "id" });
  if (error) console.error("[hands-db] qr publish failed:", error.message);
}

export async function storeMedia(jid: string, waMessageId: string, mime: string | null, buffer: Buffer): Promise<string | null> {
  const ext = mime?.includes("png") ? "png" : mime?.includes("pdf") ? "pdf" : mime?.includes("webp") ? "webp" : mime?.startsWith("image/") ? "jpg" : "bin";
  const path = `${jid.replace(/[^A-Za-z0-9@.-]/g, "_")}/${waMessageId.replace(/[^A-Za-z0-9_-]/g, "_")}.${ext}`;
  const { error } = await handsDb.storage.from(config.mediaBucket).upload(path, buffer, { contentType: mime ?? "application/octet-stream", upsert: true });
  if (error) { console.error("[hands-db] media upload failed:", error.message); return null; }
  return path;
}
