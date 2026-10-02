/**
 * import-chat-export.ts — a WhatsApp "Export chat" .txt file into the Sia archive
 * (migration 0249, docs/architecture/sia-resilience-plan.md section 8).
 *
 * The watcher only ever saw what was sent after its number joined a group. The years before
 * that live on the phones of the people who were there from the start. A founder or queen
 * exports the group (WhatsApp → the group → Export chat → Without media), the file goes in
 * cleint-data/wa-exports/, and this script files it in sia.wag_messages as source 'export'.
 *
 *   npx tsx --env-file=.env.local scripts/sia/import-chat-export.ts --file <path> --group <jid>
 *        [--apply] [--exported-by "Name"] [--map-file names.json]
 *        [--from <ISO>] [--to <ISO>] [--date-order dmy|mdy] [--tz-offset 330]
 *   npx tsx --env-file=.env.local scripts/sia/import-chat-export.ts --find "kapoor"     (find a group's jid)
 *
 * What it does, in order:
 *   window   By default only lines OLDER than the first message the watcher itself holds for
 *            the group are imported: where the watcher was listening, its rows are the record.
 *            `--from` / `--to` open a different window (a gap, such as the day of a ban);
 *            inside it, a line the archive already holds (same text within two minutes) is skipped.
 *   sender   An export names people by display name. Each name is matched to ONE contact of
 *            the group: a phone number by its digits, a name by the WhatsApp name or the Serene
 *            account name. A name that matches nobody, or more than one person, is UNRESOLVED:
 *            it is still imported, under `export:<name>@unresolved`, and listed. `--map-file`
 *            ({"Display name": "+9198…"}) settles it; a second run corrects the rows in place.
 *   id       An export has no message ids. Each line gets a stable one (a hash of the group,
 *            the minute, the display name, the text and its position among identical lines),
 *            so the same file always lands on the same rows.
 *   ledger   One sia.wag_chat_imports row per file (its hash), refreshed on a re-run.
 *
 * Dry run by default; `--apply` writes. Media is not imported: a placeholder line keeps the
 * fact that something was sent. Deleted messages are skipped.
 *
 * The report holds real names, so it is written OUTSIDE the repo (~/Desktop/serene-backups).
 */
import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  exportNameAsPhoneDigits,
  normalizeExportName,
  parseWhatsAppExport,
  type WhatsAppExportLine,
} from "../../src/lib/utils/whatsapp-export";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => { const i = argv.indexOf(name); return i === -1 ? null : (argv[i + 1] ?? null); };

const APPLY = flag("--apply");
const FILE = opt("--file");
const GROUP = opt("--group");
const FIND = opt("--find");
const EXPORTED_BY = opt("--exported-by");
const MAP_FILE = opt("--map-file");
const FROM = opt("--from");
const TO = opt("--to");
const DATE_ORDER = opt("--date-order") as "dmy" | "mdy" | null;
const TZ_OFFSET = Number(opt("--tz-offset") ?? 330);

const NORMALIZER_VERSION = 1;
const CHUNK = 500;
const GAP_MATCH_MS = 2 * 60_000;
const MEDIA_TYPE: Record<string, string> = { image: "image", video: "video", voice: "voice", document: "document", sticker: "sticker", contact: "contact" };

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL_ || !KEY) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (--env-file=.env.local)."); process.exit(1); }
const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
const sia = admin.schema("sia");

const die = (msg: string): never => { console.error(msg); process.exit(1); };
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

type Contact = { jid: string; lid: string | null; phone: string | null; push_name: string | null; staff_profile_id: string | null };

async function findGroups(q: string): Promise<void> {
  const { data, error } = await sia.from("wag_groups").select("group_jid, subject, group_kind, member_id").ilike("subject", `%${q}%`).limit(25);
  if (error) die(`Group search failed: ${error.message}`);
  for (const g of data ?? []) console.log(`${g.group_jid}   ${g.subject ?? "(no name)"}   [${g.group_kind}${g.member_id ? ", linked" : ""}]`);
  if (!data?.length) console.log("No group matches.");
}

/** Everyone who is or was in the group, with both their ids and every name we know them by. */
async function loadPeople(groupJid: string): Promise<{ byName: Map<string, Set<string>>; byDigits: Map<string, string> }> {
  const memberJids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sia.from("wag_group_members").select("member_jid").eq("group_jid", groupJid).order("member_jid").range(from, from + 999);
    if (error) die(`Group members read failed: ${error.message}`);
    for (const r of data ?? []) memberJids.add(r.member_jid as string);
    if ((data ?? []).length < 1000) break;
  }
  // Someone who left is still here: a leave writes left_at, it never deletes the row.

  const ids = [...memberJids];
  const contacts: Contact[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const slice = ids.slice(i, i + 150);
    const cols = "jid, lid, phone, push_name, staff_profile_id";
    const [{ data: a }, { data: b }] = await Promise.all([
      sia.from("wag_contacts").select(cols).in("jid", slice),
      sia.from("wag_contacts").select(cols).in("lid", slice),
    ]);
    contacts.push(...((a ?? []) as Contact[]), ...((b ?? []) as Contact[]));
  }

  // The archive names a sender by the hidden id (@lid) when it has one; an imported row does too.
  const archiveId = (c: Contact) => (c.jid.endsWith("@lid") ? c.jid : (c.lid ?? c.jid));

  const staffIds = [...new Set(contacts.map((c) => c.staff_profile_id).filter((v): v is string => !!v))];
  const staffName = new Map<string, string>();
  for (let i = 0; i < staffIds.length; i += 150) {
    const { data } = await admin.from("profiles").select("id, full_name").in("id", staffIds.slice(i, i + 150));
    for (const p of data ?? []) if (p.full_name) staffName.set(p.id as string, p.full_name as string);
  }

  const byName = new Map<string, Set<string>>();
  const byDigits = new Map<string, string>();
  const put = (name: string | null | undefined, id: string) => {
    const n = name ? normalizeExportName(name) : "";
    if (n.length < 2) return;
    byName.set(n, (byName.get(n) ?? new Set()).add(id));
  };
  for (const c of contacts) {
    const id = archiveId(c);
    put(c.push_name, id);
    if (c.staff_profile_id) put(staffName.get(c.staff_profile_id), id);
    const digits = (c.phone ?? (c.jid.endsWith("@s.whatsapp.net") ? c.jid.split("@")[0] : "")).replace(/\D/g, "");
    if (digits) byDigits.set(digits, id);
  }
  return { byName, byDigits };
}

function loadNameMap(): Map<string, string> {
  const out = new Map<string, string>();
  if (!MAP_FILE) return out;
  const raw = JSON.parse(readFileSync(MAP_FILE, "utf8")) as Record<string, string>;
  for (const [name, target] of Object.entries(raw)) out.set(normalizeExportName(name), target.trim());
  return out;
}

async function main(): Promise<void> {
  if (FIND) return findGroups(FIND);
  if (!FILE || !GROUP) die("Usage: --file <path> --group <jid> [--apply]   (or --find <words> to look up a group)");
  const file = FILE as string;
  const groupJid = GROUP as string;
  if (!groupJid.endsWith("@g.us")) die("--group must be a WhatsApp group id ending in @g.us (use --find).");

  const { data: groupRows, error: gErr } = await sia.from("wag_groups").select("group_jid, subject, member_id").eq("group_jid", groupJid).limit(1);
  if (gErr) die(`Group read failed: ${gErr.message}`);
  const group = groupRows?.[0];
  if (!group) die(`No such group in Sia: ${groupJid}`);

  const bytes = readFileSync(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const parsed = parseWhatsAppExport(bytes.toString("utf8"), { dateOrder: DATE_ORDER ?? undefined, tzOffsetMinutes: TZ_OFFSET, groupSubject: group!.subject as string | null });
  if (parsed.lines.length === 0) die("No messages found in the file. Is it a WhatsApp chat export (.txt)?");
  if (!parsed.dateOrderCertain) console.warn("! The file does not say whether dates are day/month or month/day. Assumed day/month; pass --date-order mdy if that is wrong.");

  // ── The window ──
  const { data: firstOwn } = await sia.from("wag_messages").select("wa_timestamp").eq("chat_jid", groupJid).neq("source", "export").order("wa_timestamp", { ascending: true }).limit(1);
  const watcherFrom = (firstOwn?.[0]?.wa_timestamp as string | undefined) ?? null;
  const gapMode = !!(FROM || TO);
  const winFrom = FROM ? new Date(FROM).getTime() : -Infinity;
  const winTo = TO ? new Date(TO).getTime() : gapMode ? Infinity : watcherFrom ? new Date(watcherFrom).getTime() : Infinity;
  if (Number.isNaN(winFrom) || Number.isNaN(winTo)) die("--from / --to must be ISO timestamps, e.g. 2026-09-29T05:50:00Z");

  const inWindow = parsed.lines.filter((l) => { const t = new Date(l.at).getTime(); return t >= winFrom && t < winTo && l.kind !== "deleted"; });

  // ── In a gap window: what the archive already holds there ──
  const held = new Map<string, number[]>();
  if (gapMode && inWindow.length) {
    const lo = new Date(new Date(inWindow[0].at).getTime() - GAP_MATCH_MS).toISOString();
    const hi = new Date(new Date(inWindow[inWindow.length - 1].at).getTime() + GAP_MATCH_MS).toISOString();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sia.from("wag_messages").select("text, wa_timestamp").eq("chat_jid", groupJid).neq("source", "export").gte("wa_timestamp", lo).lte("wa_timestamp", hi).order("wa_timestamp").range(from, from + 999);
      if (error) die(`Archive read failed: ${error.message}`);
      for (const r of data ?? []) { if (!r.text) continue; const k = squash(r.text as string); held.set(k, [...(held.get(k) ?? []), new Date(r.wa_timestamp as string).getTime()]); }
      if ((data ?? []).length < 1000) break;
    }
  }
  const alreadyHeld = (l: WhatsAppExportLine) => {
    const t = new Date(l.at).getTime();
    return (held.get(squash(l.text)) ?? []).some((x) => Math.abs(x - t) <= GAP_MATCH_MS);
  };

  // ── Senders ──
  const people = await loadPeople(groupJid);
  const nameMap = loadNameMap();
  const resolved = new Map<string, string>();
  const unresolved = new Map<string, { lines: number; why: string }>();
  const resolve = (display: string): string => {
    const known = resolved.get(display);
    if (known) return known;
    const norm = normalizeExportName(display);
    let id: string | null = null;
    let why = "no contact of this group carries that name";
    const mapped = nameMap.get(norm);
    if (mapped) {
      if (mapped.includes("@")) id = mapped;
      else { const d = mapped.replace(/\D/g, ""); id = people.byDigits.get(d) ?? `${d}@s.whatsapp.net`; }
    } else {
      const digits = exportNameAsPhoneDigits(display);
      if (digits) id = people.byDigits.get(digits) ?? `${digits}@s.whatsapp.net`;
      else {
        const hits = people.byName.get(norm);
        if (hits?.size === 1) id = [...hits][0];
        else if (hits && hits.size > 1) why = `${hits.size} people in this group carry that name`;
      }
    }
    if (!id) {
      id = `export:${norm.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"}@unresolved`;
      unresolved.set(display, { lines: 0, why });
    }
    resolved.set(display, id);
    return id;
  };

  // ── Rows ──
  const seen = new Map<string, number>();
  let skippedHeld = 0;
  const rows = [] as { chat_jid: string; wa_message_id: string; sender_jid: string; from_me: boolean; type: string; text: string | null; wa_timestamp: string; source: "export"; normalizer_version: number; raw: Record<string, unknown> }[];
  for (const l of inWindow) {
    if (gapMode && l.kind !== "system" && alreadyHeld(l)) { skippedHeld += 1; continue; }
    const sender = l.sender ? resolve(l.sender) : groupJid;
    if (l.sender && unresolved.has(l.sender)) unresolved.get(l.sender)!.lines += 1;
    // The id rests on the DISPLAY name, never on who it resolved to, so a better name map
    // on a later run finds the same row and corrects its sender.
    const base = `${groupJid}|${l.at.slice(0, 16)}|${l.sender ?? ""}|${l.text}`;
    const nth = seen.get(base) ?? 0;
    seen.set(base, nth + 1);
    const id = `exp-${createHash("sha1").update(`${base}|${nth}`).digest("hex").slice(0, 28)}`;
    rows.push({
      chat_jid: groupJid,
      wa_message_id: id,
      sender_jid: sender,
      from_me: false,
      type: l.kind === "system" ? "system" : l.kind === "media" ? (l.media ? MEDIA_TYPE[l.media] : "unknown") : "text",
      text: l.kind === "media" ? null : l.text,
      wa_timestamp: l.at,
      source: "export",
      normalizer_version: NORMALIZER_VERSION,
      raw: { export: true, file_sha256: sha, line: l.line, display_name: l.sender, placeholder: l.kind === "media" ? l.text : undefined },
    });
  }

  // ── What is already there from an earlier run of this or another export ──
  const existing = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sia.from("wag_messages").select("wa_message_id, sender_jid").eq("chat_jid", groupJid).eq("source", "export").order("wa_message_id").range(from, from + 999);
    if (error) die(`Archive read failed: ${error.message}`);
    for (const r of data ?? []) existing.set(r.wa_message_id as string, r.sender_jid as string);
    if ((data ?? []).length < 1000) break;
  }
  const fresh = rows.filter((r) => !existing.has(r.wa_message_id));
  const corrections = rows.filter((r) => { const was = existing.get(r.wa_message_id); return !!was && was !== r.sender_jid && was.endsWith("@unresolved") && !r.sender_jid.endsWith("@unresolved"); });
  const bounced = rows.length - fresh.length - corrections.length;

  // ── Report ──
  const span = inWindow.length ? `${inWindow[0].at.slice(0, 10)} to ${inWindow[inWindow.length - 1].at.slice(0, 10)}` : "nothing";
  const out = [
    `Group            ${group!.subject ?? "(no name)"}  ${groupJid}`,
    `File             ${basename(file)}  (${parsed.lines.length} messages, dates read as ${parsed.dateOrder})`,
    `Watcher's record starts  ${watcherFrom ?? "never (the watcher holds nothing for this group)"}`,
    `Window           ${gapMode ? `${FROM ?? "the start"} to ${TO ?? "the end"} (gap mode)` : "everything before the watcher's record"}`,
    `In the window    ${inWindow.length} messages, ${span}`,
    `To write         ${fresh.length} new, ${corrections.length} sender corrections`,
    `Skipped          ${bounced} already imported, ${skippedHeld} the watcher already holds`,
    `Senders          ${resolved.size - unresolved.size} resolved, ${unresolved.size} unresolved`,
    ...[...unresolved].map(([name, u]) => `   ? ${name}   (${u.lines} messages; ${u.why})`),
    unresolved.size ? `Settle them with --map-file names.json: { "Display name": "+9198…" }` : "",
    APPLY ? "" : "DRY RUN. Nothing was written. Add --apply to write.",
  ].filter(Boolean).join("\n");
  console.log(out);

  const dir = join(homedir(), "Desktop", "serene-backups");
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, `wa-export-${groupJid.split("@")[0]}-${sha.slice(0, 8)}.txt`);
  writeFileSync(reportPath, `${out}\n`);
  console.log(`Report: ${reportPath}`);
  if (!APPLY) return;

  // ── Write ──
  let written = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK);
    const { error, count } = await sia.from("wag_messages").upsert(chunk, { onConflict: "chat_jid,wa_message_id,sender_jid,wa_timestamp", ignoreDuplicates: true, count: "exact" });
    if (error) die(`Write failed at row ${i}: ${error.message}. Rows before it are in; run again to continue.`);
    written += count ?? chunk.length;
  }
  let corrected = 0;
  for (const r of corrections) {
    // A correction of who said it, never of what was said: only an unresolved sender is replaced.
    const { error } = await sia.from("wag_messages").update({ sender_jid: r.sender_jid }).eq("chat_jid", groupJid).eq("wa_message_id", r.wa_message_id).eq("source", "export").like("sender_jid", "%@unresolved");
    if (error) console.error(`Correction failed for ${r.wa_message_id}: ${error.message}`);
    else corrected += 1;
  }

  const { error: lErr } = await sia.from("wag_chat_imports").upsert(
    {
      group_jid: groupJid,
      file_name: basename(file),
      file_sha256: sha,
      exported_by: EXPORTED_BY,
      from_at: inWindow[0]?.at ?? null,
      to_at: inWindow[inWindow.length - 1]?.at ?? null,
      rows_read: parsed.lines.length,
      rows_written: written + bounced,
      rows_skipped: skippedHeld + (parsed.lines.length - inWindow.length),
      unresolved: [...unresolved].map(([name, u]) => ({ name, lines: u.lines })),
    },
    { onConflict: "file_sha256" },
  );
  if (lErr) console.error(`Ledger write failed (the messages are in): ${lErr.message}`);
  console.log(`Written ${written}, corrected ${corrected}. The file can be deleted once the numbers above look right.`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
