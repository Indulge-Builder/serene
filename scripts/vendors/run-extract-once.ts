/**
 * Run ONE vendor-extraction cycle and print, in full, what it did to the vendor
 * tables. The bench for the extractor: change the prompt, re-queue the fixtures
 * (`copy-notes-for-testing.ts --reset`), run this, read the result.
 *
 * It calls the SAME runVendorExtractCycle the scheduled task calls — not a copy
 * — so what you read here is what production would do.
 *
 * LOCAL ONLY, and there is no override. Every model call costs money and every
 * write lands in the vendor spine; both belong on a database you can throw away
 * until the output has been read by a person.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/vendors/run-extract-once.ts [--limit 20]
 */
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const flagged = argv.indexOf("--limit");
const LIMIT = flagged >= 0 ? Number(argv[flagged + 1]) || 20 : 20;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const host = (() => { try { return new URL(URL_).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING TO RUN — "${host}" is not a local database. This bench writes vendors and spends tokens.`);
  process.exit(1);
}

const db = createClient(URL_, KEY, { auth: { persistSession: false } });

async function snapshot() {
  const one = async (t: string) => (await db.from(t).select("id", { count: "exact", head: true })).count ?? 0;
  return {
    vendors: await one("vendors"),
    capabilities: await one("vendor_capabilities"),
    engagements: await one("vendor_engagements"),
  };
}

async function main() {
  const { runVendorExtractCycle } = await import("@/lib/services/vendor-extract-sync");

  const queued = (await db.schema("freshdesk").from("conversations")
    .select("id", { count: "exact", head: true }).is("vendor_extracted_at", null)).count ?? 0;
  console.log(`\n  queued notes: ${queued}`);
  if (queued === 0) {
    console.log(`  Nothing to read. Copy fixtures first, or re-queue them:\n` +
      `    npx tsx --env-file=.env.local scripts/vendors/copy-notes-for-testing.ts --prod-env .env.local.prod-backup\n` +
      `    npx tsx --env-file=.env.local scripts/vendors/copy-notes-for-testing.ts --reset\n`);
    return;
  }

  const before = await snapshot();
  const t0 = Date.now();
  const stats = await runVendorExtractCycle(LIMIT);
  const after = await snapshot();

  console.log(`\n  ── the cycle ──`);
  console.log(`  notes read     ${stats.notesRead}   failed ${stats.notesFailed}   skipped ${stats.notesSkipped}`);
  console.log(`  files read     ${stats.filesRead}`);
  console.log(`  vendors        ${stats.vendorsCreated} created · ${stats.vendorsMatched} matched to existing`);
  console.log(`  engagements    ${stats.engagementsWritten}`);
  console.log(`  duplicates     ${stats.duplicatesFlagged} flagged for review`);
  console.log(`  elapsed        ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`\n  ── the tables ──`);
  console.log(`  vendors        ${before.vendors} -> ${after.vendors}`);
  console.log(`  capabilities   ${before.capabilities} -> ${after.capabilities}`);
  console.log(`  engagements    ${before.engagements} -> ${after.engagements}`);

  // Everything the machine made, in full, so a person can judge it. This is the
  // point of the bench: a count tells you it ran, the rows tell you if it is right.
  const { data: made } = await db
    .from("vendors")
    .select("id, name, category, subcategory, primary_phone, home_city, contacts, identity_status, import_raw")
    .contains("sources", ["ticket"])
    .order("created_at", { ascending: false })
    .limit(40);

  console.log(`\n  ── vendors this machine created (source 'ticket') ──`);
  if (!(made ?? []).length) console.log(`     none`);
  for (const v of (made ?? []) as Record<string, unknown>[]) {
    const contacts = (v.contacts as { name: string | null; phones: string[]; emails: string[] }[]) ?? [];
    const raw = (v.import_raw as { ticket?: { ticket_id?: number; quote?: string } })?.ticket;
    console.log(`\n     ${v.name}`);
    console.log(`        category : ${v.category ?? "-"} / ${v.subcategory ?? "-"}   ${v.identity_status}`);
    if (v.primary_phone) console.log(`        phone    : ${v.primary_phone}`);
    if (v.home_city) console.log(`        city     : ${v.home_city}`);
    for (const c of contacts) {
      const bits = [c.name, c.phones.join(", "), c.emails.join(", ")].filter(Boolean).join(" · ");
      if (bits) console.log(`        contact  : ${bits}`);
    }
    if (raw?.ticket_id) console.log(`        from     : ticket ${raw.ticket_id}`);
    if (raw?.quote) console.log(`        because  : "${String(raw.quote).replace(/\s+/g, " ").slice(0, 100)}"`);

    const { data: eng } = await db.from("vendor_engagements")
      .select("category, service, city, amount_inr, outcome, source_ref, title")
      .eq("vendor_id", v.id as string);
    for (const e of (eng ?? []) as Record<string, unknown>[]) {
      const money = e.amount_inr != null ? ` · ₹${e.amount_inr}` : "";
      console.log(`        job      : ${e.category}/${e.service ?? "-"} · ticket ${e.source_ref} · ${e.outcome}${money}`);
      if (e.title) console.log(`                   "${String(e.title).slice(0, 80)}"`);
    }
  }
  console.log(`\n  Wrong? Change the prompt in src/lib/services/vendor-extract.ts, then:`);
  console.log(`    npx tsx --env-file=.env.local scripts/vendors/copy-notes-for-testing.ts --reset`);
  console.log(`    npx tsx --env-file=.env.local scripts/vendors/run-extract-once.ts\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
