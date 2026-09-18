/**
 * Copy REAL Freshdesk notes from production's mirror into the LOCAL one, so the
 * vendor extractor can be tested against messy real data without touching
 * Freshdesk and without writing a row anywhere near production.
 *
 * WHY THIS AND NOT A TEST TICKET
 * A ticket you write by hand is clean, and clean notes are not what breaks the
 * extractor. What breaks it is a note with no text and one photograph of a bill,
 * a client's name sitting beside a supplier's, an invoice from Indulge's own
 * company. Those exist already, in the mirror, by the thousand. Creating a test
 * ticket would also put a real ticket in the live account and pull it into
 * production, which is the opposite of local.
 *
 * WHAT IT COPIES
 *   - a chosen set of conversations, and the tickets they hang off
 *   - the tickets' agents, so an engagement can resolve its owner
 *   - each note's attachment BYTES into the local freshdesk-attachments bucket,
 *     so vision has something real to read
 * Copied notes land with `vendor_extracted_at = NULL`, which IS the queue — so
 * the next local cycle picks them up.
 *
 * SAFETY
 *   - production is opened READ-ONLY; every write goes to the local database
 *   - it refuses to run unless the LOCAL target really is localhost
 *   - the default pick is deliberately adversarial: bills, client-name notes,
 *     pure chatter and an own-company invoice, not a flattering sample
 *
 * Run (local Supabase up):
 *   npx tsx --env-file=.env.local scripts/vendors/copy-notes-for-testing.ts \
 *     --prod-env .env.local.prod-backup [--limit 20] [--ticket 54450]
 *
 *   --reset   clear vendor_extracted_at on everything already copied, so the
 *             same fixtures can be re-read after a prompt change
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const argv = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const LIMIT = Number(flag("--limit") ?? 20) || 20;
const ONE_TICKET = Number(flag("--ticket") ?? 0) || 0;
const RESET = argv.includes("--reset");
const PROD_ENV = flag("--prod-env") ?? ".env.local.prod-backup";
const BUCKET = "freshdesk-attachments";

// ─── The two ends ────────────────────────────────────────────────────────────
const LOCAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const LOCAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const localHost = (() => { try { return new URL(LOCAL_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(localHost)) {
  console.error(
    `REFUSING TO RUN.\n` +
      `  This script WRITES to NEXT_PUBLIC_SUPABASE_URL, which points at "${localHost}".\n` +
      `  It is a local test harness and will only ever write to a local database.\n` +
      `  Nothing was copied.`,
  );
  process.exit(1);
}

/** Read the production pair out of its own env file — never from process.env. */
function prodCreds(): { url: string; key: string } {
  const raw = readFileSync(PROD_ENV, "utf8");
  const pick = (k: string): string => {
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${k}=`));
    return (line?.slice(k.length + 1) ?? "").trim().replace(/^["']|["']$/g, "");
  };
  const url = pick("NEXT_PUBLIC_SUPABASE_URL");
  const key = pick("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error(`Could not read a Supabase URL and service key from ${PROD_ENV}.`);
    process.exit(1);
  }
  return { url, key };
}

const local = createClient(LOCAL_URL, LOCAL_KEY, { auth: { persistSession: false } });
const localFd = local.schema("freshdesk");

/**
 * Upsert rows, dropping any column the LOCAL table does not have, and say which.
 *
 * Production's `freshdesk` schema carries columns the migration files do not
 * create -- `member_id` on `tickets`, seen 2026-09-17, added out of band by the
 * member app that shares this schema. A fixture loader has to survive that: it
 * is a test harness, not a schema check, and failing the copy because production
 * has an extra column helps nobody.
 *
 * Introspection is not available here (the local tables are empty, so there is
 * no row to read column names off, and PostgREST exposes no column list to the
 * JS client). So this asks Postgres the only way it can: it tries, reads the
 * "Could not find the 'x' column" error, drops that key and tries again.
 */
async function upsertTolerant(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<{ ok: boolean; dropped: string[] }> {
  const dropped: string[] = [];
  let payload = rows;
  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await localFd.from(table).upsert(payload as never[], { onConflict });
    if (!error) return { ok: true, dropped };
    const miss = /Could not find the '([^']+)' column/.exec(error.message)?.[1];
    if (!miss) {
      console.error(`  ${table}: ${error.message}`);
      return { ok: false, dropped };
    }
    dropped.push(miss);
    payload = payload.map((r) => {
      const { [miss]: _drop, ...rest } = r;
      void _drop;
      return rest;
    });
  }
  console.error(`  ${table}: still failing after dropping ${dropped.join(", ")}`);
  return { ok: false, dropped };
}

async function main() {
  if (RESET) {
    // PostgREST needs a filter on an update; `id > 0` is every copied row.
    const { error } = await localFd.from("conversations").update({ vendor_extracted_at: null, vendor_extract_attempts: 0 }).gt("id", 0);
    if (error) { console.error(`  reset failed: ${error.message}`); process.exit(1); }
    const { count } = await localFd.from("conversations").select("id", { count: "exact", head: true });
    console.log(`  re-queued every copied note (${count ?? 0}). Run the extractor again.`);
    return;
  }

  const { url, key } = prodCreds();
  const prod = createClient(url, key, { auth: { persistSession: false } });
  const prodFd = prod.schema("freshdesk");
  console.log(`  reading (read-only) from ${new URL(url).hostname}`);
  console.log(`  writing to             ${localHost}\n`);

  // ── choose the notes ──
  let notes: Record<string, unknown>[] = [];
  if (ONE_TICKET) {
    const { data } = await prodFd.from("conversations").select("*").eq("ticket_id", ONE_TICKET).order("fd_created_at");
    notes = (data ?? []) as Record<string, unknown>[];
    console.log(`  ticket ${ONE_TICKET}: ${notes.length} note(s)`);
  } else {
    // Deliberately adversarial: the shapes that break extraction, not the easy ones.
    const since = "2026-09-01T00:00:00Z";
    const take = Math.max(1, Math.floor(LIMIT / 3));
    const seen = new Set<number>();
    const add = (rows: unknown[] | null, label: string) => {
      let n = 0;
      for (const r of (rows ?? []) as Record<string, unknown>[]) {
        if (seen.has(r.id as number)) continue;
        seen.add(r.id as number);
        notes.push(r);
        n++;
      }
      console.log(`  ${label}: +${n}`);
    };

    const withFiles = await prodFd.from("conversations").select("*")
      .gte("fd_created_at", since).neq("attachments", "[]").order("id", { ascending: false }).limit(take * 3);
    add(((withFiles.data ?? []) as Record<string, unknown>[])
      .filter((n) => (n.attachments as { storage_path?: string }[] ?? []).some((a) => a.storage_path))
      .slice(0, take), "notes with a real file (the invoice case)");

    const vendorLine = await prodFd.from("conversations").select("*")
      .gte("fd_created_at", since).ilike("body_text", "%vendor%").order("id", { ascending: false }).limit(take);
    add(vendorLine.data, "notes naming a vendor");

    const clientLine = await prodFd.from("conversations").select("*")
      .gte("fd_created_at", since).ilike("body_text", "%client name%").order("id", { ascending: false }).limit(take);
    add(clientLine.data, "client-name notes (must yield NOTHING)");

    notes = notes.slice(0, LIMIT);
  }
  if (notes.length === 0) { console.log("  nothing matched; nothing copied."); return; }

  // ── the tickets they hang off, and those tickets' agents ──
  const ticketIds = [...new Set(notes.map((n) => n.ticket_id as number))];
  const { data: tickets } = await prodFd.from("tickets").select("*").in("id", ticketIds);
  const ticketRows = (tickets ?? []) as Record<string, unknown>[];
  const responderIds = [...new Set(ticketRows.map((t) => t.responder_id as number).filter(Boolean))];
  const { data: agents } = responderIds.length
    ? await prodFd.from("agents").select("*").in("id", responderIds)
    : { data: [] };

  if ((agents ?? []).length) {
    const r = await upsertTolerant("agents", agents as Record<string, unknown>[], "id");
    if (r.dropped.length) console.log(`  agents: dropped ${r.dropped.join(", ")} (not in the local schema)`);
  }
  // member_id points at member.members (0211), which a fresh local database has
  // no rows in.
  // Null it rather than fail the FK: the extractor reads it, it does not need it.
  const ticketsForLocal = ticketRows.map((t) => ({ ...t, member_id: null }));
  const tRes = await upsertTolerant("tickets", ticketsForLocal, "id");
  if (tRes.dropped.length) console.log(`  tickets: dropped ${tRes.dropped.join(", ")} (not in the local schema)`);
  if (!tRes.ok) process.exit(1);
  console.log(`\n  tickets copied: ${ticketRows.length}`);

  // ── the attachment bytes ──
  let copiedFiles = 0;
  for (const n of notes) {
    for (const a of ((n.attachments as { storage_path?: string; content_type?: string }[]) ?? [])) {
      if (!a.storage_path) continue;
      const { data, error } = await prod.storage.from(BUCKET).download(a.storage_path);
      if (error || !data) { console.warn(`  file ${a.storage_path}: ${error?.message ?? "no body"}`); continue; }
      const bytes = Buffer.from(await data.arrayBuffer());
      const up = await local.storage.from(BUCKET).upload(a.storage_path, bytes, {
        contentType: a.content_type ?? "application/octet-stream", upsert: true,
      });
      if (up.error) console.warn(`  file ${a.storage_path}: ${up.error.message}`);
      else copiedFiles++;
    }
  }
  console.log(`  files copied:   ${copiedFiles}`);

  // ── the notes themselves, queued ──
  const notesForLocal = notes.map((n) => ({ ...n, vendor_extracted_at: null, vendor_extract_attempts: 0 }));
  const cRes = await upsertTolerant("conversations", notesForLocal, "id");
  if (cRes.dropped.length) console.log(`  notes: dropped ${cRes.dropped.join(", ")} (not in the local schema)`);
  if (!cRes.ok) process.exit(1);
  console.log(`  notes copied:   ${notes.length}  (all queued for extraction)\n`);
  console.log(`  Next: npx tsx --env-file=.env.local scripts/vendors/run-extract-once.ts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
