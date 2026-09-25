import "server-only";
import { readFile, stat } from "node:fs/promises";
import { memberDb } from "@/lib/supabase/schemas";
import path from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createAdminClient } from "@/lib/supabase/admin";

// Every wag_ table lives in the `sia` schema (migration 0172). This admin client is
// scoped to it, so `.from("wag_…")` resolves to sia.wag_…; service_role-only grants +
// the page role-gate keep member conversations admin/founder-only (Q-13 boundary).
function siaDb() {
  return createAdminClient().schema("sia");
}
type SiaDb = ReturnType<typeof siaDb>;

// ─────────────────────────────────────────────────────────────────────────
// Sia read service — the wag_ group world (migrations 0169–0173), the Baileys
// watcher's data. Admin/founder only (member conversations are the most sensitive
// data Indulge holds; the page role-gates and RLS is deny-by-default — this
// admin-member read is the sanctioned Q-13 boundary, the elaya-data.ts precedent).
// SERVER ONLY.
// ─────────────────────────────────────────────────────────────────────────

export type SiaGroupKind = "member" | "vendor" | "internal" | "unmapped";

export type SiaGroupRow = {
  group_jid: string;
  subject: string | null;
  group_kind: SiaGroupKind;
  /** The linked member (0194); the chat's "Create ticket" needs it. */
  member_id: string | null;
  is_active: boolean;
  member_count: number | null;
  last_message_at: string | null;
  message_count: number;
  /** WhatsApp-Web rail preview (migration 0173 — same single aggregate pass). */
  last_text: string | null;
  last_type: string | null;
  last_sender_name: string | null;
  last_from_me: boolean | null;
  last_is_revoked: boolean | null;
};

export type SiaMediaInfo = {
  media_type: string;
  mime: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  download_status: "pending" | "retrying" | "done" | "dead_letter" | "expired";
};

export type SiaQuotedPreview = {
  sender_name: string | null;
  text: string | null;
  type: string;
};

export type SiaMessageRow = {
  id: string;
  wa_message_id: string;
  sender_jid: string;
  sender_name: string | null;
  from_me: boolean;
  type: string;
  text: string | null;
  quoted_wa_message_id: string | null;
  wa_timestamp: string;
  is_revoked: boolean;
  is_forwarded: boolean;
  edit_of_wa_message_id: string | null;
  /** Present when a wag_media row exists for this message. */
  media: SiaMediaInfo | null;
  /** Aggregated reaction chips ({emoji, count}), empty when none. */
  reactions: { emoji: string; count: number }[];
  /** Resolved preview of the quoted (replied-to) message, when captured. */
  quoted: SiaQuotedPreview | null;
};

export type SiaSearchHit = Omit<SiaMessageRow, "media" | "reactions" | "quoted"> & {
  group_jid: string;
  group_subject: string | null;
};

export type SiaWatcherState = "pairing" | "connecting" | "connected" | "logged_out";

/** The watcher's self-reported pulse (migration 0175) — one row, beat every 60s.
 *  0177 adds the pairing QR (published while state='pairing', cleared on connect)
 *  and the app→watcher restart control stamp. */
export type SiaWatcherStatus = {
  beat_at: string;
  state: SiaWatcherState;
  connected: boolean;
  state_since: string;
  account_jid: string | null;
  qr: string | null;
  qr_at: string | null;
  restart_requested_at: string | null;
};

export type SiaHealth = {
  lastEventAt: string | null;
  /** Heartbeat-derived: fresh beat AND state 'connected'. Never traffic-derived —
   *  groups sleep at night; the watcher's own pulse is the liveness signal. */
  live: boolean;
  watcherState: SiaWatcherState | "unknown";
  beatAt: string | null;
  eventsLastHour: number;
  messagesLastHour: number;
  totalMessages: number;
  totalGroups: number;
  unmappedGroups: number;
  hiddenGroups: number;
  media: { pending: number; retrying: number; done: number; dead_letter: number; expired: number };
};

const MESSAGE_PAGE = 60;
const LIVE_TAIL_LIMIT = 100;
/** The peek around a moment: this many before it, and this many more than the radius from it (a burst can be long). */
const AROUND_RADIUS = 12;
const AROUND_TAIL = 60;
const SEARCH_LIMIT = 50;
const LIVE_WINDOW_MS = 3 * 60 * 1000; // a heartbeat within 3 min = watcher alive (beats land every 60s)

const MESSAGE_SELECT =
  "id, wa_message_id, sender_jid, from_me, type, text, quoted_wa_message_id, wa_timestamp, is_revoked, is_forwarded, edit_of_wa_message_id";

/** The message types that can carry a wag_media row (keeps the .in lists small). */
const MEDIA_TYPES = new Set(["image", "video", "audio", "voice", "sticker", "document"]);

type BareMessage = Omit<SiaMessageRow, "sender_name" | "media" | "reactions" | "quoted">;

// ─────────────────────────────────────────────
// Groups — ONE table read + ONE aggregate RPC, never N+1 (466+ groups today).
// ─────────────────────────────────────────────

export async function getSiaGroups(): Promise<SiaGroupRow[]> {
  const db = siaDb();

  const [{ data: groups, error: gErr }, { data: agg, error: aErr }] = await Promise.all([
    db.from("wag_groups").select("group_jid, subject, group_kind, is_active, member_count, member_id"),
    // One grouped pass over messages: count + last-activity + last-message preview
    // for ALL groups (migration 0173). If this table grows to millions, denormalise
    // a per-group counter; the seam is this one function.
    db.rpc("wag_group_activity"),
  ]);

  if (gErr || !groups) {
    if (gErr) console.error("[sia-service] getSiaGroups (groups) failed:", gErr.message);
    return [];
  }

  type ActivityRow = {
    chat_jid: string;
    message_count: number;
    last_message_at: string | null;
    last_text: string | null;
    last_type: string | null;
    last_sender_name: string | null;
    last_from_me: boolean | null;
    last_is_revoked: boolean | null;
  };
  const activity = new Map<string, ActivityRow>();
  if (aErr) {
    console.warn("[sia-service] group activity rpc failed, falling back to counts-only:", aErr.message);
  } else {
    for (const r of (agg ?? []) as ActivityRow[]) activity.set(r.chat_jid, r);
  }

  const rows: SiaGroupRow[] = (
    groups as Pick<SiaGroupRow, "group_jid" | "subject" | "group_kind" | "is_active" | "member_count" | "member_id">[]
  ).map((g) => {
    const a = activity.get(g.group_jid);
    return {
      ...g,
      message_count: Number(a?.message_count ?? 0),
      last_message_at: a?.last_message_at ?? null,
      last_text: a?.last_text ?? null,
      last_type: a?.last_type ?? null,
      last_sender_name: a?.last_sender_name ?? null,
      last_from_me: a?.last_from_me ?? null,
      last_is_revoked: a?.last_is_revoked ?? null,
    };
  });

  rows.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  return rows;
}

// ─────────────────────────────────────────────
// Messages — keyset pager (oldest→newest per page) + the live tail.
//   before → older history page (scroll up)
//   after  → only rows newer than the given wa_timestamp (the 4s poll appends
//            these; gte + client-side id dedup so same-second siblings never slip)
// ─────────────────────────────────────────────

export async function getSiaMessages(
  groupJid: string,
  opts: { before?: string; after?: string; around?: string; radius?: number } = {},
): Promise<{ messages: SiaMessageRow[]; hasMore: boolean }> {
  const db = siaDb();

  // `around` (2026-09-26, the mini WhatsApp view on a suggested ticket): `radius` messages before
  // the moment and up to `radius + AROUND_TAIL` from it, so a burst sits inside its conversation.
  // hasMore says whether there is anything older than what came back.
  if (opts.around) {
    const radius = Math.max(1, Math.min(60, opts.radius ?? AROUND_RADIUS));
    const [olderRes, newerRes] = await Promise.all([
      db.from("wag_messages").select(MESSAGE_SELECT).eq("chat_jid", groupJid).lt("wa_timestamp", opts.around).order("wa_timestamp", { ascending: false }).limit(radius + 1),
      db.from("wag_messages").select(MESSAGE_SELECT).eq("chat_jid", groupJid).gte("wa_timestamp", opts.around).order("wa_timestamp", { ascending: true }).limit(radius + AROUND_TAIL),
    ]);
    if (olderRes.error || newerRes.error) {
      console.error("[sia-service] getSiaMessages (around) failed:", olderRes.error?.message ?? newerRes.error?.message);
      return { messages: [], hasMore: false };
    }
    const olderAll = (olderRes.data ?? []) as BareMessage[];
    const hasMore = olderAll.length > radius;
    const older = (hasMore ? olderAll.slice(0, radius) : olderAll).reverse();
    const messages = await enrichMessages(db, groupJid, [...older, ...((newerRes.data ?? []) as BareMessage[])]);
    return { messages, hasMore };
  }

  if (opts.after) {
    const { data, error } = await db
      .from("wag_messages")
      .select(MESSAGE_SELECT)
      .eq("chat_jid", groupJid)
      .gte("wa_timestamp", opts.after)
      .order("wa_timestamp", { ascending: true })
      .limit(LIVE_TAIL_LIMIT);
    if (error || !data) {
      if (error) console.error("[sia-service] getSiaMessages (after) failed:", error.message);
      return { messages: [], hasMore: false };
    }
    const messages = await enrichMessages(db, groupJid, data as BareMessage[]);
    return { messages, hasMore: false };
  }

  let query = db
    .from("wag_messages")
    .select(MESSAGE_SELECT)
    .eq("chat_jid", groupJid)
    .order("wa_timestamp", { ascending: false })
    .limit(MESSAGE_PAGE + 1);
  if (opts.before) query = query.lt("wa_timestamp", opts.before);

  const { data, error } = await query;
  if (error || !data) {
    if (error) console.error("[sia-service] getSiaMessages failed:", error.message);
    return { messages: [], hasMore: false };
  }

  const hasMore = data.length > MESSAGE_PAGE;
  const slice = (hasMore ? data.slice(0, MESSAGE_PAGE) : data) as BareMessage[];
  const messages = await enrichMessages(db, groupJid, slice.reverse());
  return { messages, hasMore };
}

// ─────────────────────────────────────────────
// Search — full-text over message bodies (the FTS index, 'simple' config so
// Hinglish/Marathi roman text is not stemmed). Optionally scoped to one group.
// ─────────────────────────────────────────────

/**
 * `anyOf` (2026-09-18): the words a topic could have been written as. With it the search matches a
 * message holding ANY of them (websearch OR), not all the words of `query` (plain = AND, which is
 * why "anniversary dinner" found nothing unless one message held both). A multi-word entry is
 * matched as a phrase. Entries are reduced to letters, digits and spaces before they reach the query.
 */
export function anyOfQuery(terms: string[]): string {
  const clean = [...new Set(terms.map((t) => t.replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase()).filter((t) => t.length >= 2))].slice(0, 14);
  return clean.map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" OR ");
}

export async function searchSiaMessages(query: string, groupJid?: string, anyOf?: string[]): Promise<SiaSearchHit[]> {
  // With `anyOf` the caller has already chosen the words (elaya-data buildSearchWords); splitting
  // the raw query here again put "and" / "meet" into an OR search with no stop-words, which
  // matched nearly every message (2026-09-21, the Nadal search returned unrelated chatter).
  const wide = anyOf && anyOf.length ? anyOfQuery([query, ...anyOf]) : "";
  const term = wide || query.trim();
  if (term.length < 2) return [];
  const db = siaDb();

  let q = db
    .from("wag_messages")
    .select(`${MESSAGE_SELECT}, chat_jid`)
    .textSearch("text", term, { type: wide ? "websearch" : "plain", config: "simple" })
    .order("wa_timestamp", { ascending: false })
    .limit(SEARCH_LIMIT);
  if (groupJid) q = q.eq("chat_jid", groupJid);

  const { data, error } = await q;
  if (error || !data) {
    if (error) console.error("[sia-service] searchSiaMessages failed:", error.message);
    return [];
  }

  const rows = data as (BareMessage & { chat_jid: string })[];
  const withNames = await attachSenderNames(db, rows);
  // Resolve group subjects for the hits (batched).
  const chatJids = [...new Set(rows.map((d) => d.chat_jid))];
  const subjectByJid = new Map<string, string | null>();
  if (chatJids.length > 0) {
    const { data: gs } = await db
      .from("wag_groups")
      .select("group_jid, subject")
      .in("group_jid", chatJids);
    for (const g of (gs ?? []) as { group_jid: string; subject: string | null }[]) {
      subjectByJid.set(g.group_jid, g.subject);
    }
  }
  return withNames.map((m) => ({
    ...m,
    group_jid: m.chat_jid,
    group_subject: subjectByJid.get(m.chat_jid) ?? null,
  }));
}

// ─────────────────────────────────────────────
// Group info — the WhatsApp-style profile panel: description, owner, member
// roster with identity resolution. Members arrive as privacy lids (@lid); the
// resolution chain is member_jid → wag_contacts (by lid, else by jid) → phone
// jid → public.profiles phone match (the SAME phone-identity rule Elaya's
// WhatsApp gate uses). Staff therefore label themselves automatically — no
// manual mapping. All batched; never per-member queries.
// ─────────────────────────────────────────────

export type SiaMemberRow = {
  member_jid: string;
  name: string | null;
  /** E.164-ish display phone (+91…), when the identity bridge has it. */
  phone: string | null;
  wa_role: string;
  joined_at: string | null;
  left_at: string | null;
  /** Set when the member's phone matches a Serene profile — this IS the agent mapping. */
  staff_name: string | null;
  staff_role: string | null;
};

export type SiaGroupInfo = {
  /** The member this group is mapped to (0194: linked from this panel or the member page). */
  member: { id: string; full_name: string } | null;
  description: string | null;
  watcher_joined_at: string | null;
  created_at: string;
  owner: { name: string | null; phone: string | null } | null;
  members: SiaMemberRow[];
  formerMembers: SiaMemberRow[];
  formerCount: number;
  staffCount: number;
};

const FORMER_MEMBERS_CAP = 20;

export async function getSiaGroupInfo(groupJid: string): Promise<SiaGroupInfo | null> {
  const db = siaDb();

  const [groupRes, membersRes, formerRes, formerCountRes] = await Promise.all([
    db
      .from("wag_groups")
      .select("description, owner_jid, watcher_joined_at, created_at, member_id")
      .eq("group_jid", groupJid)
      .limit(1),
    db
      .from("wag_group_members")
      .select("member_jid, role, joined_at, left_at")
      .eq("group_jid", groupJid)
      .is("left_at", null),
    db
      .from("wag_group_members")
      .select("member_jid, role, joined_at, left_at")
      .eq("group_jid", groupJid)
      .not("left_at", "is", null)
      .order("left_at", { ascending: false })
      .limit(FORMER_MEMBERS_CAP),
    db
      .from("wag_group_members")
      .select("member_jid", { count: "exact", head: true })
      .eq("group_jid", groupJid)
      .not("left_at", "is", null),
  ]);

  const group = groupRes.data?.[0] as
    | { description: string | null; owner_jid: string | null; watcher_joined_at: string | null; created_at: string }
    | undefined;
  if (groupRes.error || !group) {
    if (groupRes.error) console.error("[sia-service] getSiaGroupInfo failed:", groupRes.error.message);
    return null;
  }

  type StintRow = { member_jid: string; role: string; joined_at: string | null; left_at: string | null };
  const current = (membersRes.data ?? []) as StintRow[];
  const former = (formerRes.data ?? []) as StintRow[];

  // ── Identity resolution, batched over every jid we need to name ──
  const allJids = [
    ...new Set([...current, ...former].map((m) => m.member_jid).concat(group.owner_jid ? [group.owner_jid] : [])),
  ];

  type ContactRow = { jid: string; lid: string | null; phone: string | null; push_name: string | null };
  const [byLid, byJid] = await Promise.all([
    allJids.length
      ? db.from("wag_contacts").select("jid, lid, phone, push_name").in("lid", allJids)
      : Promise.resolve({ data: [] as ContactRow[] }),
    allJids.length
      ? db.from("wag_contacts").select("jid, lid, phone, push_name").in("jid", allJids)
      : Promise.resolve({ data: [] as ContactRow[] }),
  ]);

  const contactFor = new Map<string, ContactRow>();
  for (const c of (byJid.data ?? []) as ContactRow[]) contactFor.set(c.jid, c);
  for (const c of (byLid.data ?? []) as ContactRow[]) if (c.lid) contactFor.set(c.lid, c);

  const resolvePhone = (memberJid: string): string | null => {
    const c = contactFor.get(memberJid);
    if (c?.phone) return c.phone;
    const phoneJid = c?.jid?.endsWith("@s.whatsapp.net")
      ? c.jid
      : memberJid.endsWith("@s.whatsapp.net")
        ? memberJid
        : null;
    if (!phoneJid) return null;
    const digits = phoneJid.split("@")[0].replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  };

  // ── Staff match: phones → public.profiles (the page role-gate is the trust
  //    boundary, same as every sia read) ──
  const phoneByJid = new Map<string, string>();
  for (const j of allJids) {
    const p = resolvePhone(j);
    if (p) phoneByJid.set(j, p);
  }
  const staffByPhone = new Map<string, { full_name: string; role: string }>();
  const phones = [...new Set(phoneByJid.values())];
  if (phones.length > 0) {
    const { data: staff } = await createAdminClient()
      .from("profiles")
      .select("full_name, role, phone")
      .in("phone", phones);
    for (const s of (staff ?? []) as { full_name: string; role: string; phone: string | null }[]) {
      if (s.phone) staffByPhone.set(s.phone, { full_name: s.full_name, role: s.role });
    }
  }

  const toRow = (m: StintRow): SiaMemberRow => {
    const phone = phoneByJid.get(m.member_jid) ?? null;
    const staff = phone ? (staffByPhone.get(phone) ?? null) : null;
    return {
      member_jid: m.member_jid,
      name: contactFor.get(m.member_jid)?.push_name ?? null,
      phone,
      wa_role: m.role,
      joined_at: m.joined_at,
      left_at: m.left_at,
      staff_name: staff?.full_name ?? null,
      staff_role: staff?.role ?? null,
    };
  };

  const members = current.map(toRow);
  // Staff → WhatsApp admins → named → unknown; alphabetical inside each band.
  const band = (m: SiaMemberRow) => (m.staff_name ? 0 : m.wa_role !== "member" ? 1 : m.name ? 2 : 3);
  members.sort((a, b) => {
    const d = band(a) - band(b);
    if (d !== 0) return d;
    return (a.staff_name ?? a.name ?? "~").localeCompare(b.staff_name ?? b.name ?? "~");
  });

  const ownerContact = group.owner_jid ? contactFor.get(group.owner_jid) : undefined;
  const groupMemberId = (groupRes.data?.[0] as { member_id?: string | null } | undefined)?.member_id ?? null;
  let member: SiaGroupInfo["member"] = null;
  if (groupMemberId) {
    const { data: c } = await memberDb(createAdminClient()).from("members").select("id, full_name").eq("id", groupMemberId).maybeSingle();
    if (c) member = { id: (c as { id: string }).id, full_name: (c as { full_name: string }).full_name };
  }
  return {
    description: group.description,
    watcher_joined_at: group.watcher_joined_at,
    created_at: group.created_at,
    owner: group.owner_jid
      ? { name: ownerContact?.push_name ?? null, phone: phoneByJid.get(group.owner_jid) ?? null }
      : null,
    members,
    member,
    formerMembers: former.map(toRow),
    formerCount: Number(formerCountRes.count ?? 0),
    staffCount: members.filter((m) => m.staff_name).length,
  };
}

// ─────────────────────────────────────────────
// Media payload — resolves ONE downloaded media file for inline rendering
// (<img>/<audio>/<video> src + fetch→blob). Dual-mode (Sia W1):
//
//   s3://bucket/key   → a short-lived presigned GET URL (the Fargate watcher
//                       uploads to S3; works from Vercel and local alike —
//                       credentials come from the default AWS chain).
//   absolute path     → base64 data: URL off the local connector store (the
//                       pre-W1 rows; path validated against the media root,
//                       25MB inline cap).
// ─────────────────────────────────────────────

const MEDIA_ROOT = process.env.WAG_MEDIA_DIR
  ? path.resolve(process.env.WAG_MEDIA_DIR)
  : path.join(process.cwd(), "connector", "media");
const MEDIA_INLINE_MAX_BYTES = 25 * 1024 * 1024;
const MEDIA_SIGNED_URL_TTL_SECONDS = 900; // 15 min — outlives any open viewer page

// Credentials are read from SIA_S3_* — deliberately NOT the standard AWS_* names:
// direnv exports .env.local into the shell, and AWS_ACCESS_KEY_ID there would
// hijack the operator's own AWS CLI with this read-only media identity. Falls
// back to the default provider chain (task role / instance profile) when unset.
let s3Member: S3Client | null = null;
function s3(): S3Client {
  const keyId = process.env.SIA_S3_ACCESS_KEY_ID;
  const secret = process.env.SIA_S3_SECRET_ACCESS_KEY;
  s3Member ??= new S3Client({
    region: process.env.SIA_S3_REGION ?? "ap-south-1",
    ...(keyId && secret ? { credentials: { accessKeyId: keyId, secretAccessKey: secret } } : {}),
  });
  return s3Member;
}

export type SiaMediaPayload = {
  dataUrl: string;
  /** For "save this file": S3 mode presigns with an attachment disposition so a
   *  plain anchor click downloads it (a browser fetch() of the presigned URL
   *  dies on CORS); local mode reuses the data: URL. */
  downloadUrl: string;
  mime: string | null;
  mediaType: string;
  sizeBytes: number;
};

export async function getSiaMediaPayload(
  chatJid: string,
  waMessageId: string,
  senderJid: string,
): Promise<{ payload: SiaMediaPayload | null; reason?: "not_found" | "not_ready" | "too_large" }> {
  const db = siaDb();
  const { data, error } = await db
    .from("wag_media")
    .select("media_type, mime, download_status, storage_path")
    .eq("chat_jid", chatJid)
    .eq("wa_message_id", waMessageId)
    .eq("sender_jid", senderJid)
    .limit(1);

  if (error || !data || data.length === 0) {
    if (error) console.error("[sia-service] getSiaMediaPayload lookup failed:", error.message);
    return { payload: null, reason: "not_found" };
  }
  const row = data[0] as {
    media_type: string;
    mime: string | null;
    download_status: string;
    storage_path: string | null;
  };
  if (row.download_status !== "done" || !row.storage_path) {
    return { payload: null, reason: "not_ready" };
  }

  // ── S3 mode (the Fargate watcher, Sia W1): presign a short-lived GET ──
  if (row.storage_path.startsWith("s3://")) {
    const rest = row.storage_path.slice("s3://".length);
    const slash = rest.indexOf("/");
    const bucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);
    if (!bucket || !key) return { payload: null, reason: "not_found" };
    try {
      const filename = key.split("/").pop() ?? "file";
      const [url, downloadUrl] = await Promise.all([
        getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
          expiresIn: MEDIA_SIGNED_URL_TTL_SECONDS,
        }),
        getSignedUrl(
          s3(),
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${filename}"`,
          }),
          { expiresIn: MEDIA_SIGNED_URL_TTL_SECONDS },
        ),
      ]);
      return {
        payload: { dataUrl: url, downloadUrl, mime: row.mime, mediaType: row.media_type, sizeBytes: 0 },
      };
    } catch (err) {
      console.error("[sia-service] media presign failed:", err);
      return { payload: null, reason: "not_found" };
    }
  }

  // ── Local mode (pre-W1 rows on this machine) ──
  const resolved = path.resolve(row.storage_path);
  if (!resolved.startsWith(MEDIA_ROOT + path.sep)) {
    console.error("[sia-service] media path outside store, refused:", resolved);
    return { payload: null, reason: "not_found" };
  }

  try {
    const info = await stat(resolved);
    if (info.size > MEDIA_INLINE_MAX_BYTES) return { payload: null, reason: "too_large" };
    const bytes = await readFile(resolved);
    const mime = row.mime?.split(";")[0] ?? "application/octet-stream";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    return {
      payload: {
        dataUrl,
        downloadUrl: dataUrl,
        mime: row.mime,
        mediaType: row.media_type,
        sizeBytes: info.size,
      },
    };
  } catch (err) {
    console.error("[sia-service] media file read failed:", err);
    return { payload: null, reason: "not_found" };
  }
}

// ─────────────────────────────────────────────
// Silence probe — the one-value read behind the watcher silence alarm
// (src/trigger/sia-silence.ts). Kept separate from getSiaHealth so the 5-min
// cron costs one indexed select, not eight.
// ─────────────────────────────────────────────

export async function getSiaLastEventAt(): Promise<string | null> {
  const db = siaDb();
  const { data, error } = await db
    .from("wag_raw_events")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[sia-service] getSiaLastEventAt failed:", error.message);
    return null;
  }
  return (data?.[0]?.received_at as string | undefined) ?? null;
}

export async function getSiaWatcherStatus(): Promise<SiaWatcherStatus | null> {
  const db = siaDb();
  const { data, error } = await db
    .from("wag_watcher_status")
    .select("beat_at, state, connected, state_since, account_jid, qr, qr_at, restart_requested_at")
    .eq("id", 1)
    .limit(1);
  if (error) {
    console.error("[sia-service] getSiaWatcherStatus failed:", error.message);
    return null;
  }
  // Interim cast: database.ts predates the 0177 columns (qr/qr_at/restart_requested_at) —
  // retire at the next `gen types` regen.
  return (data?.[0] as unknown as SiaWatcherStatus | undefined) ?? null;
}

// ─────────────────────────────────────────────
// Watcher control (migration 0177) — the app→watcher channel behind the
// console's Restart / Re-pair buttons. The watcher reads restart_requested_at
// on every 60s beat and exits cleanly when the stamp is newer than its boot.
// ─────────────────────────────────────────────

export async function requestSiaWatcherRestart(): Promise<boolean> {
  const db = siaDb();
  const { error } = await db
    .from("wag_watcher_status")
    // Interim cast: database.ts predates the 0177 column — retire at next regen.
    .update({ restart_requested_at: new Date().toISOString() } as never)
    .eq("id", 1);
  if (error) {
    console.error("[sia-service] restart request failed:", error.message);
    return false;
  }
  return true;
}

/** Re-pair: wipe the WhatsApp session, then ask the watcher to restart. The
 *  next boot finds empty auth, arms pairing, and publishes the QR into the
 *  status row — the console renders it for scanning. DESTRUCTIVE for the
 *  session (never the data); the action layer gates + confirms. */
export async function requestSiaSessionRepair(): Promise<boolean> {
  const db = siaDb();
  const { error: wipeErr } = await db.from("wag_auth_state").delete().neq("key", "");
  if (wipeErr) {
    console.error("[sia-service] session wipe failed:", wipeErr.message);
    return false;
  }
  return requestSiaWatcherRestart();
}

// ─────────────────────────────────────────────
// Health — the "is the ear alive" panel.
// ─────────────────────────────────────────────

export async function getSiaHealth(): Promise<SiaHealth> {
  const db = siaDb();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Media states as head-counts — never select the whole table (it was 15k rows
  // fetched to Node just to count them; five indexed counts instead).
  const MEDIA_STATES = ["pending", "retrying", "done", "dead_letter", "expired"] as const;
  const [status, lastEvent, eventsHr, msgsHr, totalMsgs, totalGroups, unmapped, hidden, ...mediaStateCounts] =
    await Promise.all([
      getSiaWatcherStatus(),
      db.from("wag_raw_events").select("received_at").order("received_at", { ascending: false }).limit(1),
      db.from("wag_raw_events").select("id", { count: "exact", head: true }).gte("received_at", hourAgo),
      db.from("wag_messages").select("id", { count: "exact", head: true }).gte("received_at", hourAgo),
      db.from("wag_messages").select("id", { count: "exact", head: true }),
      db.from("wag_groups").select("group_jid", { count: "exact", head: true }),
      db.from("wag_groups").select("group_jid", { count: "exact", head: true }).eq("group_kind", "unmapped"),
      db.from("wag_groups").select("group_jid", { count: "exact", head: true }).eq("is_active", false),
      ...MEDIA_STATES.map((s) =>
        db.from("wag_media").select("id", { count: "exact", head: true }).eq("download_status", s),
      ),
    ]);

  const mediaCounts = { pending: 0, retrying: 0, done: 0, dead_letter: 0, expired: 0 };
  MEDIA_STATES.forEach((s, i) => {
    mediaCounts[s] = Number((mediaStateCounts[i] as { count: number | null }).count ?? 0);
  });

  const lastEventAt = (lastEvent.data?.[0]?.received_at as string | undefined) ?? null;
  const beatFresh = !!status && Date.now() - new Date(status.beat_at).getTime() < LIVE_WINDOW_MS;
  const live = beatFresh && status.state === "connected";

  return {
    lastEventAt,
    live,
    watcherState: beatFresh ? status.state : "unknown",
    beatAt: status?.beat_at ?? null,
    eventsLastHour: Number(eventsHr.count ?? 0),
    messagesLastHour: Number(msgsHr.count ?? 0),
    totalMessages: Number(totalMsgs.count ?? 0),
    totalGroups: Number(totalGroups.count ?? 0),
    unmappedGroups: Number(unmapped.count ?? 0),
    hiddenGroups: Number(hidden.count ?? 0),
    media: mediaCounts,
  };
}

// ─────────────────────────────────────────────
// Mapping write — set a group's classification + hide flag. (The action gates
// admin/founder; this is the DB write.)
// ─────────────────────────────────────────────

export async function updateSiaGroupMapping(
  groupJid: string,
  // member_id (0194): link a group to a member (the Sia panel picker and the member page
  // both call this); null unlinks. A link also sets group_kind = 'member', an unlink flips
  // it to 'unmapped' so the profiler's "blocked stays blocked" rule holds.
  patch: { group_kind?: SiaGroupKind; is_active?: boolean; member_id?: string | null },
): Promise<boolean> {
  const db = siaDb();
  const { error } = await db.from("wag_groups").update(patch).eq("group_jid", groupJid);
  if (error) {
    console.error("[sia-service] updateSiaGroupMapping failed:", error.message);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// Enrichment — batch-attach sender names, media rows, reaction aggregates, and
// quoted-message previews to one page of messages. Four bounded queries total,
// never per-row (the N+1 rule).
// ─────────────────────────────────────────────

async function enrichMessages(
  db: SiaDb,
  groupJid: string,
  rows: BareMessage[],
): Promise<SiaMessageRow[]> {
  if (rows.length === 0) return [];

  const quotedIds = [...new Set(rows.map((r) => r.quoted_wa_message_id).filter((v): v is string => !!v))];
  const mediaIds = rows.filter((r) => MEDIA_TYPES.has(r.type)).map((r) => r.wa_message_id);
  const allIds = rows.map((r) => r.wa_message_id);

  // Quoted originals first — their sender jids join the name batch below.
  const quotedByWaId = new Map<string, { text: string | null; type: string; sender_jid: string }>();
  if (quotedIds.length > 0) {
    const { data: qs } = await db
      .from("wag_messages")
      .select("wa_message_id, text, type, sender_jid")
      .eq("chat_jid", groupJid)
      .in("wa_message_id", quotedIds);
    for (const q of (qs ?? []) as { wa_message_id: string; text: string | null; type: string; sender_jid: string }[]) {
      quotedByWaId.set(q.wa_message_id, q);
    }
  }

  const jids = new Set(rows.map((r) => r.sender_jid));
  for (const q of quotedByWaId.values()) jids.add(q.sender_jid);

  const [nameByJid, mediaByWaId, reactionsByWaId] = await Promise.all([
    fetchContactNames(db, [...jids]),
    fetchMediaRows(db, groupJid, mediaIds),
    fetchReactionAggregates(db, groupJid, allIds),
  ]);

  return rows.map((r) => {
    const q = r.quoted_wa_message_id ? quotedByWaId.get(r.quoted_wa_message_id) : undefined;
    return {
      ...r,
      sender_name: nameByJid.get(r.sender_jid) ?? null,
      media: mediaByWaId.get(r.wa_message_id) ?? null,
      reactions: reactionsByWaId.get(r.wa_message_id) ?? [],
      quoted: q
        ? { sender_name: nameByJid.get(q.sender_jid) ?? null, text: q.text, type: q.type }
        : null,
    };
  });
}

async function fetchContactNames(db: SiaDb, jids: string[]): Promise<Map<string, string>> {
  const nameByJid = new Map<string, string>();
  if (jids.length === 0) return nameByJid;
  const { data } = await db.from("wag_contacts").select("jid, push_name").in("jid", jids);
  for (const c of (data ?? []) as { jid: string; push_name: string | null }[]) {
    if (c.push_name) nameByJid.set(c.jid, c.push_name);
  }
  return nameByJid;
}

async function fetchMediaRows(
  db: SiaDb,
  groupJid: string,
  waMessageIds: string[],
): Promise<Map<string, SiaMediaInfo>> {
  const byId = new Map<string, SiaMediaInfo>();
  if (waMessageIds.length === 0) return byId;
  const { data } = await db
    .from("wag_media")
    .select("wa_message_id, media_type, mime, size_bytes, duration_seconds, download_status")
    .eq("chat_jid", groupJid)
    .in("wa_message_id", waMessageIds);
  for (const m of (data ?? []) as ({ wa_message_id: string } & SiaMediaInfo)[]) {
    byId.set(m.wa_message_id, {
      media_type: m.media_type,
      mime: m.mime,
      size_bytes: m.size_bytes,
      duration_seconds: m.duration_seconds,
      download_status: m.download_status,
    });
  }
  return byId;
}

async function fetchReactionAggregates(
  db: SiaDb,
  groupJid: string,
  waMessageIds: string[],
): Promise<Map<string, { emoji: string; count: number }[]>> {
  const byId = new Map<string, { emoji: string; count: number }[]>();
  if (waMessageIds.length === 0) return byId;
  const { data } = await db
    .from("wag_reactions")
    .select("wa_message_id, emoji")
    .eq("chat_jid", groupJid)
    .in("wa_message_id", waMessageIds);
  const counters = new Map<string, Map<string, number>>();
  for (const r of (data ?? []) as { wa_message_id: string; emoji: string }[]) {
    const inner = counters.get(r.wa_message_id) ?? new Map<string, number>();
    inner.set(r.emoji, (inner.get(r.emoji) ?? 0) + 1);
    counters.set(r.wa_message_id, inner);
  }
  for (const [waId, inner] of counters) {
    byId.set(
      waId,
      [...inner.entries()].map(([emoji, count]) => ({ emoji, count })),
    );
  }
  return byId;
}

// ─────────────────────────────────────────────
// Shared: batch-resolve sender display names (search path — no media/reactions).
// ─────────────────────────────────────────────

async function attachSenderNames<T extends { sender_jid: string }>(
  db: SiaDb,
  rows: T[],
): Promise<(T & { sender_name: string | null })[]> {
  const nameByJid = await fetchContactNames(db, [...new Set(rows.map((m) => m.sender_jid))]);
  return rows.map((m) => ({ ...m, sender_name: nameByJid.get(m.sender_jid) ?? null }));
}

/** Who a sender IS for Indulge, by jid — the mapping tool's answer (participant_role + the
 *  staff link). Elaya's member-history tools label each message member / staff / other with it. */
export async function getSiaSenderRoles(
  jids: string[],
): Promise<Map<string, { role: string; is_staff: boolean }>> {
  const out = new Map<string, { role: string; is_staff: boolean }>();
  const unique = [...new Set(jids)];
  if (unique.length === 0) return out;
  const { data } = await siaDb()
    .from("wag_contacts")
    .select("jid, participant_role, staff_profile_id")
    .in("jid", unique);
  for (const c of (data ?? []) as { jid: string; participant_role: string; staff_profile_id: string | null }[]) {
    out.set(c.jid, { role: c.participant_role, is_staff: Boolean(c.staff_profile_id) });
  }
  return out;
}

/** The member's WhatsApp group (0194): at most one mapped group per member today. */
export async function getSiaGroupForMember(clientId: string): Promise<{
  group_jid: string; subject: string | null; member_count: number | null; last_message_at: string | null; message_count: number;
} | null> {
  const db = siaDb();
  const { data, error } = await db
    .from("wag_groups")
    .select("group_jid, subject, member_count, is_active")
    .eq("member_id", clientId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const { count, data: last } = await db
    .from("wag_messages")
    .select("wa_timestamp", { count: "exact" })
    .eq("chat_jid", data.group_jid)
    .order("wa_timestamp", { ascending: false })
    .limit(1);
  return {
    group_jid: data.group_jid,
    subject: data.subject,
    member_count: data.member_count,
    last_message_at: (last?.[0] as { wa_timestamp?: string } | undefined)?.wa_timestamp ?? null,
    message_count: Number(count ?? 0),
  };
}
