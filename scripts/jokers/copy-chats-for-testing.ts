/**
 * Copy a few days of REAL client-group chat from production's WhatsApp mirror into the LOCAL
 * database, so the jokers' capture can be run with --apply (writes and all) without writing a row
 * anywhere near production. The vendor bench's posture (scripts/vendors/copy-notes-for-testing.ts).
 *
 * WHAT IT COPIES
 *   - the linked member groups the four jokers posted in during the window (up to --groups)
 *   - every message in those groups from 12 hours before the window to its end
 *   - the contact rows of everyone who spoke (both ids of a person), and the jokers' own
 *   - those groups' members (queendoms mapped to the local ones by name)
 *
 * `--all-groups` (the Activity dashboard's bench, 0250): EVERY linked member group instead of the
 * jokers' ones, and the staff links kept. A contact linked to a Serene account in production is
 * linked, locally, to ONE local stand-in account (the first local profile, or --stand-in-profile
 * <uuid>): the Activity count only asks whether the link exists, so no staff account, name or phone
 * is copied.
 *
 * SAFETY
 *   - production is opened READ-ONLY; every write goes to the local database
 *   - it refuses to run unless the LOCAL target really is localhost
 *   - it copies real names and messages: they stay in the local Docker database
 *
 * Run (local Supabase up):
 *   npx tsx --env-file=.env.local scripts/jokers/copy-chats-for-testing.ts \
 *     --prod-env .env.local.prod-backup [--days 3] [--groups 25] [--all-groups] [--since YYYY-MM-DD]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { JOKER_SEATS } from "@/lib/constants/sia-roles";
import { mapWithConcurrency } from "@/lib/utils/concurrency";

const argv = process.argv.slice(2);
const flag = (n: string): string | null => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? null) : null; };
const DAYS = Number(flag("--days") ?? 3) || 3;
/** `--since YYYY-MM-DD` (IST) wins over --days. */
const SINCE = flag("--since");
const ALL_GROUPS = argv.includes("--all-groups");
/** The cap on groups; `--all-groups` copies every linked member group unless --groups is given. */
const GROUPS = Number(flag("--groups") ?? (ALL_GROUPS ? Infinity : 25)) || 25;
const STAND_IN = flag("--stand-in-profile");
/** Only the Jokers: their contact rows and their local stand-in accounts, no chat. */
const JOKERS_ONLY = argv.includes("--jokers-only");
const PROD_ENV = flag("--prod-env") ?? ".env.local.prod-backup";

const LOCAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const localHost = (() => { try { return new URL(LOCAL_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(localHost)) {
  console.error(`REFUSING TO RUN. This script WRITES to NEXT_PUBLIC_SUPABASE_URL, which points at "${localHost}". It only ever writes to a local database. Nothing was copied.`);
  process.exit(1);
}

function prodCreds(): { url: string; key: string } {
  const raw = readFileSync(PROD_ENV, "utf8");
  const pick = (k: string): string => (raw.split(/\r?\n/).find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1) ?? "").trim().replace(/^["']|["']$/g, "");
  const url = pick("NEXT_PUBLIC_SUPABASE_URL"); const key = pick("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) { console.error(`Could not read a Supabase URL and service key from ${PROD_ENV}.`); process.exit(1); }
  return { url, key };
}

const chunks = <T,>(xs: T[], n = 100): T[][] => { const o: T[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o; };

/** Upsert, dropping any column the local table does not have (production drifts ahead of the files). */
async function upsertTolerant(db: SupabaseClient, schema: string, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  let payload = rows; const dropped: string[] = [];
  for (let attempt = 0; attempt < 15 && payload.length; attempt++) {
    const { error } = await db.schema(schema).from(table).upsert(payload as never[], { onConflict, ignoreDuplicates: true });
    if (!error) { if (dropped.length) console.log(`  ${schema}.${table}: dropped ${dropped.join(", ")} (not in the local schema)`); return; }
    const miss = /Could not find the '([^']+)' column/.exec(error.message)?.[1];
    if (!miss) throw new Error(`${schema}.${table}: ${error.message}`);
    dropped.push(miss);
    payload = payload.map((r) => { const { [miss]: _x, ...rest } = r; void _x; return rest; });
  }
}

type JokerSeat = { id: string; full_name: string | null; phone: string | null; role: string; domain: string; sia_role: string; queendom_id: string | null };

/**
 * One LOCAL account per production Joker (their name, phone, seat and queendom) and their WhatsApp
 * ids linked to it, so the local capture finds the Jokers the way production does (by seat). The
 * accounts live in the local database only (joker-<name>@local.test, a random password).
 */
async function linkLocalJokers(local: SupabaseClient, seats: JokerSeat[], rows: Record<string, unknown>[], qmap: Map<string, string | null>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  for (const p of seats) {
    const email = `joker-${(p.full_name ?? p.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}@local.test`;
    const { data: found } = await local.from("profiles").select("id").eq("email", email).maybeSingle();
    let id = (found as { id: string } | null)?.id ?? null;
    if (!id) {
      const res = await fetch(`${LOCAL_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: crypto.randomUUID(), email_confirm: true, user_metadata: { full_name: p.full_name } }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; msg?: string };
      if (!body.id) throw new Error(`local joker account ${email}: ${body.msg ?? res.status}`);
      id = body.id;
    }
    const { error } = await local.from("profiles").update({
      full_name: p.full_name, phone: p.phone, role: p.role, domain: p.domain, sia_role: p.sia_role,
      queendom_id: p.queendom_id ? qmap.get(p.queendom_id) ?? null : null, is_active: true,
    }).eq("id", id);
    if (error) throw new Error(`local joker profile ${email}: ${error.message}`);
    const jids = rows.filter((r) => r.staff_profile_id === p.id).map((r) => r.jid as string);
    if (jids.length) {
      const { error: le } = await local.schema("sia").from("wag_contacts").update({ staff_profile_id: id }).in("jid", jids);
      if (le) throw new Error(`local joker links ${email}: ${le.message}`);
    }
    console.log(`  local joker account: ${p.full_name} (${p.sia_role}) · ${jids.length} WhatsApp ids linked`);
  }
}

async function main() {
  const { url, key } = prodCreds();
  const prod = createClient(url, key, { auth: { persistSession: false } });
  const local = createClient(LOCAL_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  const until = new Date();
  const since = SINCE ? new Date(`${SINCE}T00:00:00+05:30`) : new Date(until.getTime() - DAYS * 86_400_000);
  const ctxFrom = new Date(since.getTime() - 12 * 3_600_000);
  console.log(`  reading (read-only) from ${new URL(url).hostname}; writing to ${localHost}; from ${since.toISOString().slice(0, 10)}`);

  // The Jokers: production's joker / joker_head seats and the WhatsApp ids linked to each account
  // (both rows of a person), the way the capture finds them.
  const contactCols = "*";
  const { data: seats, error: seatErr } = await prod.from("profiles").select("id, full_name, phone, role, domain, sia_role, queendom_id").in("sia_role", [...JOKER_SEATS]).eq("is_active", true);
  if (seatErr) throw new Error(`joker seats: ${seatErr.message}`);
  const jokerSeats = (seats ?? []) as JokerSeat[];
  const { data: jr, error: jrErr } = await prod.schema("sia").from("wag_contacts").select(contactCols).in("staff_profile_id", jokerSeats.map((p) => p.id));
  if (jrErr) throw new Error(`joker contacts: ${jrErr.message}`);
  const jokerRows = (jr ?? []) as Record<string, unknown>[];
  const jokerIds = [...new Set(jokerRows.flatMap((r) => [r.jid as string, r.lid as string | null]).filter((x): x is string => !!x))];
  console.log(`  jokers: ${jokerSeats.length} seats, ${jokerIds.length} WhatsApp ids`);
  const queendomMap = async (): Promise<Map<string, string | null>> => {
    const [{ data: pq }, { data: lq }] = await Promise.all([prod.schema("sia").from("queendoms").select("id, slug"), local.schema("sia").from("queendoms").select("id, slug")]);
    const bySlug = new Map(((lq ?? []) as { id: string; slug: string }[]).map((q) => [q.slug, q.id]));
    return new Map(((pq ?? []) as { id: string; slug: string }[]).map((q) => [q.id, bySlug.get(q.slug) ?? null]));
  };
  if (JOKERS_ONLY) {
    const rows = jokerRows.map((c) => ({ ...c, participant_role: c.participant_role === "member" ? "client" : c.participant_role, staff_profile_id: null, vendor_id: null, member_id: null }));
    await upsertTolerant(local, "sia", "wag_contacts", rows, "jid");
    await linkLocalJokers(local, jokerSeats, jokerRows, await queendomMap());
    return;
  }

  // The linked groups they posted in (or, with --all-groups, every linked member group).
  const groups: Record<string, unknown>[] = [];
  if (ALL_GROUPS) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await prod.schema("sia").from("wag_groups").select("*").eq("group_kind", "member").not("member_id", "is", null).order("group_jid").range(from, from + 999);
      if (error) throw new Error(`groups: ${error.message}`);
      groups.push(...((data ?? []) as Record<string, unknown>[]));
      if ((data ?? []).length < 1000) break;
    }
    console.log(`  every linked member group: ${groups.length}`);
  } else {
    const chatSet = new Set<string>();
    for (const jid of jokerIds) {
      for (let from = 0; ; from += 1000) {
        const { data } = await prod.schema("sia").from("wag_messages").select("chat_jid").eq("sender_jid", jid).gte("wa_timestamp", since.toISOString()).order("wa_timestamp").range(from, from + 999);
        for (const m of (data ?? []) as { chat_jid: string }[]) chatSet.add(m.chat_jid);
        if ((data ?? []).length < 1000) break;
      }
    }
    const chats = [...chatSet];
    for (const part of chunks(chats)) {
      const { data } = await prod.schema("sia").from("wag_groups").select("*").in("group_jid", part).eq("group_kind", "member").not("member_id", "is", null);
      groups.push(...((data ?? []) as Record<string, unknown>[]));
    }
    console.log(`  ${chats.length} chats with joker messages; ${groups.length} linked member groups`);
  }
  const picked = groups.slice(0, GROUPS);
  console.log(`  copying ${picked.length} groups`);

  // Members, queendoms mapped by name.
  const memberIds = [...new Set(picked.map((g) => g.member_id as string))];
  const members: Record<string, unknown>[] = [];
  for (const part of chunks(memberIds)) {
    const { data, error } = await prod.schema("member").from("members").select("*").in("id", part);
    if (error) throw new Error(`members: ${error.message}`);
    members.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const qmap = await queendomMap();
  const memberRows = ((members ?? []) as Record<string, unknown>[]).map((m) => ({ ...m, queendom_id: m.queendom_id ? qmap.get(m.queendom_id as string) ?? null : null }));
  await upsertTolerant(local, "member", "members", memberRows, "id");
  console.log(`  members: ${memberRows.length}`);

  // Messages: the window plus 12 hours before it. Only the parts of `raw` the capture reads (the
  // album link and the mentions) are copied: the rest is thumbnails and keys, and a month of it is
  // hundreds of megabytes.
  const COLS = [
    "id, chat_jid, wa_message_id, sender_jid, from_me, type, text, quoted_wa_message_id, quoted_sender_jid, wa_timestamp, received_at, is_revoked, edit_of_wa_message_id, is_forwarded, source, normalizer_version",
    "assoc:raw->message->messageContextInfo->messageAssociation",
    "m1:raw->message->extendedTextMessage->contextInfo->mentionedJid", "m2:raw->message->imageMessage->contextInfo->mentionedJid",
    "m3:raw->message->videoMessage->contextInfo->mentionedJid", "m4:raw->message->documentWithCaptionMessage->message->documentMessage->contextInfo->mentionedJid",
  ].join(", ");
  const slim = (r: Record<string, unknown>): Record<string, unknown> => {
    const { assoc, m1, m2, m3, m4, ...rest } = r;
    const message: Record<string, unknown> = {};
    if (assoc) message.messageContextInfo = { messageAssociation: assoc };
    if (m1) message.extendedTextMessage = { contextInfo: { mentionedJid: m1 } };
    if (m2) message.imageMessage = { contextInfo: { mentionedJid: m2 } };
    if (m3) message.videoMessage = { contextInfo: { mentionedJid: m3 } };
    if (m4) message.documentWithCaptionMessage = { message: { documentMessage: { contextInfo: { mentionedJid: m4 } } } };
    return { ...rest, raw: Object.keys(message).length ? { message } : null };
  };
  let messages = 0; const senders = new Set<string>(jokerIds);
  await mapWithConcurrency(picked, 6, async (g) => {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await prod.schema("sia").from("wag_messages").select(COLS).eq("chat_jid", g.group_jid as string)
        .gte("wa_timestamp", ctxFrom.toISOString()).lt("wa_timestamp", until.toISOString()).order("wa_timestamp").order("id").range(from, from + 999);
      if (error) throw new Error(`messages: ${error.message}`);
      const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(slim);
      for (const r of rows) { senders.add(r.sender_jid as string); if (r.quoted_sender_jid) senders.add(r.quoted_sender_jid as string); }
      for (const part of chunks(rows, 500)) await upsertTolerant(local, "sia", "wag_messages", part, "id,wa_timestamp");
      messages += rows.length;
      if (rows.length < 1000) break;
    }
  });
  console.log(`  messages: ${messages}`);

  // Reactions as they stand now, in those groups (step 2 reads them).
  let reactions = 0;
  for (const part of chunks(picked.map((g) => g.group_jid as string))) {
    const { data } = await prod.schema("sia").from("wag_reactions").select("*").in("chat_jid", part).gte("reacted_at", ctxFrom.toISOString()).limit(20000);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const c of chunks(rows, 500)) await upsertTolerant(local, "sia", "wag_reactions", c, "chat_jid,wa_message_id,reactor_jid");
    reactions += rows.length;
    // A reactor not seen as a sender still needs a contact row to be told apart from staff.
    for (const r of rows) senders.add(r.reactor_jid as string);
  }
  console.log(`  reactions: ${reactions}`);

  // Contacts of everyone who spoke, both rows of a person (the phone row carries the @lid).
  const contacts: Record<string, unknown>[] = [...jokerRows];
  for (const part of chunks([...senders])) {
    const [{ data: a }, { data: b }] = await Promise.all([
      prod.schema("sia").from("wag_contacts").select(contactCols).in("jid", part),
      prod.schema("sia").from("wag_contacts").select(contactCols).in("lid", part),
    ]);
    contacts.push(...((a ?? []) as Record<string, unknown>[]), ...((b ?? []) as Record<string, unknown>[]));
  }
  // Links to rows the local database does not have are cut, not invented.
  const localMembers = new Set(memberIds);
  // Production says `member` where the migration files' CHECK (0204) says `client`: the known 0202/0204
  // drift. Both read as the client side in the capture's rules.
  const contactRows = [...new Map(contacts.map((c) => [c.jid as string, c])).values()].map((c) => ({
    ...c, participant_role: c.participant_role === "member" ? "client" : c.participant_role,
    staff_profile_id: null, vendor_id: null, member_id: c.member_id && localMembers.has(c.member_id as string) ? c.member_id : null,
  }));
  for (const part of chunks(contactRows, 300)) await upsertTolerant(local, "sia", "wag_contacts", part, "jid");
  console.log(`  contacts: ${contactRows.length}`);

  // --all-groups keeps the staff links: every contact linked to an account in production points at
  // ONE local stand-in account (the count only asks whether the link exists). Updated, not upserted,
  // so a contact copied earlier (link cut) gets it too.
  if (ALL_GROUPS) {
    let standIn = STAND_IN;
    if (!standIn) { const { data } = await local.from("profiles").select("id").order("created_at").limit(1); standIn = (data?.[0] as { id: string } | undefined)?.id ?? null; }
    if (!standIn) throw new Error("No local profile to stand in for the staff links; pass --stand-in-profile <uuid>.");
    const linked = [...new Map(contacts.filter((c) => c.staff_profile_id).map((c) => [c.jid as string, c])).keys()];
    for (const part of chunks(linked)) {
      const { error } = await local.schema("sia").from("wag_contacts").update({ staff_profile_id: standIn }).in("jid", part);
      if (error) throw new Error(`staff links: ${error.message}`);
    }
    console.log(`  staff links kept (to the local stand-in account): ${linked.length}`);
  }
  // The Jokers get their own local accounts (after the stand-in, so their ids point at them).
  await linkLocalJokers(local, jokerSeats, jokerRows, qmap);

  await upsertTolerant(local, "sia", "wag_groups", picked.map((g) => ({ ...g, vendor_id: null })), "group_jid");

  console.log(`  groups: ${picked.length}\n\n  Next: npx tsx --env-file=.env.local scripts/jokers/capture-pilot.ts --since ${since.toISOString().slice(0, 10)} --apply`);
}

main().catch((e) => { console.error(e); process.exit(1); });
