/**
 * THE vendor loader — E:\Vendor\data\vendors.json → the 0183/0185 tables.
 *
 * Reads the finished Freshdesk extraction (22,021 vendors, 47,480 ticket links,
 * 4,987 invoices) and writes the spine, the capabilities and the engagement
 * ledger. Nothing here re-derives anything: the extraction pipeline in E:\Vendor
 * already did the AI passes, the dedup and the category labelling. This script
 * only maps its output onto our schema.
 *
 * SAFETY — a remote target needs --yes-write-to-production, and says so loudly.
 *   Production IS a supported target: it is how the data gets there, and it must
 *   be THIS script rather than a table copy, because agent_name_raw resolves
 *   against the profiles in the TARGET database. This laptop has one profile, so
 *   a copy would carry 46,000 null agent links to a production holding the real
 *   roster. The flag exists so it can never happen by accident.
 *
 * SAFE TO RERUN — because it is INSERT-ONLY after the first load. Vendors are
 * keyed on `name_key` (the generated lower(btrim(name))) and engagements on
 * `(vendor_id, source, source_ref)` — one row per vendor per ticket, because a
 * ticket routinely involves several suppliers. A row that already exists is
 * left exactly as it is: the first version UPSERTED the whole vendor row, which
 * made a rerun destructive — it reset status and identity_status, overwrote
 * contacts a person had corrected, and re-created every vendor the dedupe had
 * merged away. Now a merged-away spelling is mapped to its survivor (from the
 * survivor's import_raw.merged_vendors), so a new ticket for the old spelling
 * lands on the right vendor, and only genuinely new names and new tickets are
 * written. Rows the cleanup removed by LABEL (the 215 junk, the 10 clients) are
 * re-inserted by a rerun and removed again by the cleanup that always follows;
 * a merged-away vendor is never re-created. A true rebuild is --wipe.
 *
 * client_id stays NULL, honestly: the archive never carried the requester's
 * identity. The only client signal in the extraction is a model-guessed
 * `client_name` on some tickets, and a name is not a join key — two Rahuls.
 * clients.primary_phone (0181) is the identity, and no ticket export has it.
 * The column exists so in-app tickets can fill it from day one.
 *
 * Run (after `supabase start`):
 *   npx tsx --env-file=.env.local scripts/vendors/load-vendors.ts [options]
 *
 *   --dir <path>   the extraction folder      (default E:/Vendor/data)
 *   --limit <n>    load only the first n vendors — for a fast smoke test
 *   --dry-run      map everything, write nothing, print the summary
 *   --wipe         delete previously imported rows first (source='freshdesk')
 *   --yes-write-to-production   required to target anything but localhost
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeToE164 } from "../../src/lib/utils/phone";
import { VENDOR_INVOICE_BUCKET, toVocabularyKey } from "../../src/lib/constants/vendors";

// ─── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const DATA_DIR = flag("--dir") ?? "E:/Vendor/data";
const LIMIT = Number(flag("--limit") ?? 0) || 0;
const DRY_RUN = argv.includes("--dry-run");
const WIPE = argv.includes("--wipe");
const BATCH = 500;

// ─── Guard: a remote target must be named out loud ───────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const host = (() => {
  try { return new URL(SUPABASE_URL).hostname; } catch { return ""; }
})();
const IS_LOCAL = ["localhost", "127.0.0.1", "0.0.0.0"].includes(host);
// Production IS a supported target — it is how the data gets there. The loader
// resolves `agent_name_raw` against the profiles that exist in the TARGET
// database, and a local copy cannot do that: this machine has one profile, so a
// table copy would carry 46,000 null agent links to a production that has the
// real roster. (client_id is NOT resolved — see the header: the archive has no
// requester identity to resolve from.)
//
// It just may never happen by accident. The flag names the target out loud, and
// the run then prints what it is about to do against a database that is not
// yours to experiment with.
const ALLOW_REMOTE = argv.includes("--yes-write-to-production");
if (!IS_LOCAL && !ALLOW_REMOTE) {
  console.error(
    `REFUSING TO RUN.\n` +
      `  NEXT_PUBLIC_SUPABASE_URL points at "${host}", which is not a local database.\n` +
      `  Loading ~95,000 rows into a remote project is a deployment step, not a stray run.\n` +
      `  If that IS what you mean, re-run with --yes-write-to-production.\n` +
      `  Nothing was written.`,
  );
  process.exit(1);
}
if (!IS_LOCAL) {
  console.log(
    `\n*** WRITING TO A REMOTE DATABASE: ${host} ***\n` +
      `    INSERT-ONLY after the first load: vendors and jobs that exist are left\n` +
      `    exactly as they are, merged-away spellings map to their survivor, only\n` +
      `    new rows are written. Rows the cleanup removed by LABEL (junk, clients)\n` +
      `    DO come back on a rerun until the cleanup runs again — which is why it\n` +
      `    always follows. This script does NOT reproduce the cleanup. Run\n` +
      `    dedupe-vendors.ts, IN THIS ORDER (the order is not cosmetic):\n` +
      `\n` +
      `      1. dedupe-vendors.ts --replay scripts/vendors/vendor-merges.csv\n` +
      `      2. dedupe-vendors.ts --purge-junk\n` +
      `      3. dedupe-vendors.ts --purge-clients\n` +
      `\n` +
      `    Merges FIRST. A purge deletes the row outright, and two rows the\n` +
      `    merge list names as SURVIVORS are themselves junk-labelled. Purge\n` +
      `    first and those merges find no survivor, so the duplicates they\n` +
      `    were meant to absorb stay in the table instead. Rehearsed against\n` +
      `    a database reset from scratch.\n`,
  );
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── The extraction's shapes (E:\Vendor\data) ────────────────────────────────
type Counted<K extends string> = { [P in K]: string } & { count?: number };
type SourceVendor = {
  canonical_name: string;
  name_variants?: Counted<"name">[];
  merged_from?: string[];
  contact_persons?: string[];
  contacts?: { person: string | null; phones?: string[]; seen_count?: number }[];
  // NOT string[] — the extraction emits every raw SPELLING it saw with a count
  // ("7671899975" ×126, "+91-7671899975" ×22, "+91 76718 99975" ×6 are all one
  // number). Typing these as strings silently fed objects to normalizeToE164
  // and lost every phone the archive had.
  phones?: Counted<"phone">[];
  emails?: Counted<"email">[];
  service_cities?: Counted<"city">[];
  billing_cities?: Counted<"city">[];
  countries?: string[];
  registered_states?: string[];
  gstins?: string[];
  what_supplied?: { text: string; count?: number }[];
  vendor_category?: string | null;
  vendor_subcategory?: string | null;
  ticket_categories?: Counted<"category">[];
  agents?: Counted<"agent">[];
  times_used?: number;
  first_used?: string | null;
  last_used?: string | null;
  ticket_ids?: number[];
  invoices?: { attachment_id: number; ticket_id: number; document_type?: string }[];
  sources?: string[];
  category_source?: string | null;
  vendor_type?: string | null;
};
type IndexedTicket = {
  subject?: string | null;
  agent?: string | null;
  created_at?: string | null;
  category?: string | null;
  subcategory?: string | null;
  location?: string | null;
};

const CATEGORY_SOURCES = new Set(["hand", "rule", "ticket-category", "unresolved", "client-excluded"]);

const lower = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim().toLowerCase();
  return v.length ? v : null;
};

/** The category / service key rule — shared with vendor-schema.ts, never forked (R-01). */
const slug = toVocabularyKey;

/** Union two {value,count}[] lists, summing the count of a repeated value. */
function mergeCounted<K extends "phone" | "email">(
  a: Counted<K>[] | undefined,
  b: Counted<K>[] | undefined,
  key: K,
): Counted<K>[] {
  const totals = new Map<string, number>();
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const value = item[key] as string;
    totals.set(value, (totals.get(value) ?? 0) + (item.count ?? 1));
  }
  return [...totals.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([value, count]) => ({ [key]: value, count }) as Counted<K>);
}

/**
 * An unparseable number is dropped — one bad spelling must never cost us a
 * vendor. But ONLY that.
 *
 * `normalizeToE164` throws its own "Invalid phone number" for genuine rubbish
 * ("call me", "12345"). Anything else means the phone library itself failed,
 * and catching that indiscriminately is exactly how the first load emptied
 * every phone column on 21,960 vendors while reporting success. A library
 * failure now stops the run instead of quietly becoming missing data.
 */
const toE164 = (raw: string): string | null => {
  try {
    return normalizeToE164(raw, "IN");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("Invalid phone number")) return null;
    console.error(
      `\nSTOPPING — phone normalisation is broken, not the data.\n` +
        `  ${message}\n` +
        `  Importing now would write 21,960 vendors with no phone numbers.`,
    );
    process.exit(1);
  }
};

/**
 * The extraction's `ticket_categories` read "Travel > Flights"; the ticket index
 * carries them split. Both collapse to our (category, service) pair, lower-cased
 * so every downstream comparison is one key.
 */
function splitTicketCategory(raw: string): { category: string; service: string | null } {
  const [cat, ...rest] = raw.split(">").map((p) => p.trim());
  return { category: slug(cat) ?? "unknown", service: rest.length ? slug(rest.join(" ")) : null };
}

/**
 * Collapse vendors that share our DB identity — `lower(btrim(name))`, the
 * `name_key` generated column.
 *
 * The extraction left a handful of exact duplicates behind (19 keys, 61 rows:
 * "H&M" appears 19 separate times, each holding one ticket). They are the same
 * supplier by any definition, and Postgres would reject them anyway — an upsert
 * cannot touch the same target row twice in one statement.
 *
 * Merging rather than dropping: every ticket, invoice, contact and city from
 * each copy is kept, so the collapse is lossless. Only the row count falls.
 */
function mergeByNameKey(all: SourceVendor[]): SourceVendor[] {
  const byKey = new Map<string, SourceVendor>();
  let merged = 0;

  const concat = <T,>(a: T[] | undefined, b: T[] | undefined): T[] => [...(a ?? []), ...(b ?? [])];
  const earliest = (a?: string | null, b?: string | null) => (!a ? b : !b ? a : a < b ? a : b);
  const latest = (a?: string | null, b?: string | null) => (!a ? b : !b ? a : a > b ? a : b);

  for (const v of all) {
    const key = v.canonical_name.trim().toLowerCase();
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, v); continue; }
    merged++;
    byKey.set(key, {
      ...prev,
      // Every list is unioned; ticket ids and gstins de-duplicated because a
      // repeat there would be a real double-count, not extra evidence.
      ticket_ids: [...new Set(concat(prev.ticket_ids, v.ticket_ids))],
      invoices: concat(prev.invoices, v.invoices),
      name_variants: concat(prev.name_variants, v.name_variants),
      merged_from: concat(prev.merged_from, v.merged_from),
      contacts: concat(prev.contacts, v.contacts),
      contact_persons: concat(prev.contact_persons, v.contact_persons),
      // {value,count} lists — a Set would compare object identity and dedup
      // nothing, so the counts are summed per value instead.
      phones: mergeCounted(prev.phones, v.phones, "phone"),
      emails: mergeCounted(prev.emails, v.emails, "email"),
      service_cities: concat(prev.service_cities, v.service_cities),
      billing_cities: concat(prev.billing_cities, v.billing_cities),
      countries: [...new Set(concat(prev.countries, v.countries))],
      registered_states: [...new Set(concat(prev.registered_states, v.registered_states))],
      gstins: [...new Set(concat(prev.gstins, v.gstins))],
      what_supplied: concat(prev.what_supplied, v.what_supplied),
      ticket_categories: concat(prev.ticket_categories, v.ticket_categories),
      agents: concat(prev.agents, v.agents),
      sources: [...new Set(concat(prev.sources, v.sources))],
      times_used: (prev.times_used ?? 0) + (v.times_used ?? 0),
      first_used: earliest(prev.first_used, v.first_used),
      last_used: latest(prev.last_used, v.last_used),
      // Keep whichever copy actually resolved a category.
      vendor_category: prev.vendor_category ?? v.vendor_category,
      vendor_subcategory: prev.vendor_subcategory ?? v.vendor_subcategory,
      category_source: prev.category_source ?? v.category_source,
    });
  }

  if (merged) {
    console.log(
      `  merged ${merged} duplicate row(s) sharing a name — ${all.length.toLocaleString()} → ${byKey.size.toLocaleString()} vendors (no tickets lost)`,
    );
  }
  return [...byKey.values()];
}

async function main() {
  const t0 = Date.now();
  console.log(`Local database: ${SUPABASE_URL}`);
  console.log(`Extraction:     ${DATA_DIR}${DRY_RUN ? "   (DRY RUN — nothing will be written)" : ""}\n`);

  const raw = JSON.parse(readFileSync(join(DATA_DIR, "vendors.json"), "utf8")) as {
    vendors: SourceVendor[];
  };
  const ticketIndex = JSON.parse(readFileSync(join(DATA_DIR, "ticket-index.json"), "utf8")) as Record<
    string,
    IndexedTicket
  >;
  let vendors = mergeByNameKey(raw.vendors);
  if (LIMIT) vendors = vendors.slice(0, LIMIT);
  console.log(`  ${vendors.length.toLocaleString()} vendors, ${Object.keys(ticketIndex).length.toLocaleString()} tickets indexed`);

  if (WIPE && !DRY_RUN) {
    console.log("\n--wipe: removing previously imported rows…");
    // FK-safe order. Only ever the imported rows — a hand-entered vendor
    // (source 'manual') and anything a human wrote is untouched.
    // Two statements, no id list. The previous version selected every imported
    // id and passed them to .in() — which capped the select at 1,000 rows AND
    // built a request URI Kong rejects ("URI too long"). Neither failure was
    // checked, so --wipe reported success while deleting nothing.
    //
    // vendor_capabilities and vendor_notes are ON DELETE CASCADE,
    // so removing the vendor row takes them with it. vendor_engagements and
    // vendor_reviews are RESTRICT: the ledger is deleted explicitly by source
    // first, and a REVIEW a human wrote will correctly BLOCK the wipe rather
    // than be destroyed — surfaced as an error, never swallowed.
    const { error: engErr } = await db.from("vendor_engagements").delete().eq("source", "freshdesk");
    if (engErr) { console.error(`   FAILED clearing engagements: ${engErr.message}`); process.exit(1); }

    const { count: before } = await db
      .from("vendors").select("id", { count: "exact", head: true }).contains("sources", ["freshdesk"]);
    const { error: venErr } = await db.from("vendors").delete().contains("sources", ["freshdesk"]);
    if (venErr) { console.error(`   FAILED clearing vendors: ${venErr.message}`); process.exit(1); }

    const { count: after } = await db
      .from("vendors").select("id", { count: "exact", head: true }).contains("sources", ["freshdesk"]);
    if (after) { console.error(`   FAILED: ${after.toLocaleString()} imported vendors still present.`); process.exit(1); }
    console.log(`  cleared ${(before ?? 0).toLocaleString()} imported vendors (capabilities cascaded)\n`);
  }

  // ─── 1. The spine ──────────────────────────────────────────────────────────
  const vendorRows = vendors.map((v) => {
    const cities = (v.service_cities ?? []).map((c) => c.city).filter(Boolean);
    // Normalising collapses the raw spellings onto one E.164 number, so the
    // counts are summed per normalised value: the vendor's primary line is the
    // one the archive genuinely saw most, not whichever variant sorted first.
    const phoneCounts = new Map<string, number>();
    for (const p of v.phones ?? []) {
      const e164 = toE164(p.phone);
      if (e164) phoneCounts.set(e164, (phoneCounts.get(e164) ?? 0) + (p.count ?? 1));
    }
    const rankedPhones = [...phoneCounts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);

    // Same for addresses — "travelagency@x.com" and "TRAVELAGENCY@X.COM" are
    // one mailbox. Lower-casing is the only safe normalisation for an email.
    const emailCounts = new Map<string, number>();
    for (const e of v.emails ?? []) {
      const addr = lower(e.email);
      if (addr) emailCounts.set(addr, (emailCounts.get(addr) ?? 0) + (e.count ?? 1));
    }
    const rankedEmails = [...emailCounts.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);

    const contacts = (v.contacts ?? []).map((c) => ({
      name: c.person?.trim() || null,
      phones: [...new Set((c.phones ?? []).map(toE164).filter((p): p is string => !!p))],
      emails: [] as string[],
    }));
    // Numbers and addresses tied to no person are the vendor's general lines —
    // the 0183 contract's null-name entry, not a lost contact.
    const claimed = new Set(contacts.flatMap((c) => c.phones));
    const general = rankedPhones.filter((p) => !claimed.has(p));
    if (general.length || rankedEmails.length) {
      contacts.push({ name: null, phones: general, emails: rankedEmails });
    }

    const src = v.category_source ?? null;
    return {
      name: v.canonical_name,
      aliases: [...new Set((v.name_variants ?? []).map((n) => n.name).filter((n) => n && n !== v.canonical_name))],
      category: slug(v.vendor_category),
      subcategory: v.vendor_subcategory?.trim() || null,
      category_source: src && CATEGORY_SOURCES.has(src) ? src : null,
      // Everything arrives 'active'. paused / blacklisted are human judgements
      // the import has no basis to make.
      status: "active",
      contacts,
      // Sia's WhatsApp join key: the most-seen general line, else a named
      // contact's number.
      primary_phone: rankedPhones[0] ?? contacts.flatMap((c) => c.phones)[0] ?? null,
      home_city: lower(cities[0] ?? null),
      // The extraction is machine-derived; a human confirms identity later.
      identity_status: "unverified",
      sources: ["freshdesk"],
      // Everything we do NOT model as a column survives here verbatim, so no
      // fact from the pipeline is lost by importing it (the 0181 contract).
      import_raw: {
        freshdesk: {
          times_used: v.times_used ?? 0,
          first_used: v.first_used ?? null,
          last_used: v.last_used ?? null,
          vendor_type: v.vendor_type ?? null,
          ticket_categories: v.ticket_categories ?? [],
          agents: v.agents ?? [],
          service_cities: v.service_cities ?? [],
          billing_cities: v.billing_cities ?? [],
          what_supplied: v.what_supplied ?? [],
          gstins: v.gstins ?? [],
          countries: v.countries ?? [],
          registered_states: v.registered_states ?? [],
          merged_from: v.merged_from ?? [],
          invoice_count: (v.invoices ?? []).length,
          extraction_sources: v.sources ?? [],
        },
      },
    };
  });

  console.log(`\n1. vendors — ${vendorRows.length.toLocaleString()} rows in the extraction`);
  const idByName = new Map<string, string>();
  if (!DRY_RUN) {
    // INSERT-ONLY after the first load (see the header). The existing set is
    // read in pages of 1,000 — PostgREST caps a select there and says nothing,
    // and there are 21,000 vendors. KEYSET paging on the primary key, never
    // OFFSET: an OFFSET page with no ORDER BY is whatever order Postgres felt
    // like scanning in THAT statement, and a parallel scan changes its mind
    // between pages — the first version read 13,995 of 21,580 rows that way,
    // decided 7,965 vendors were missing, and hit the unique key on insert.
    // `id > last ORDER BY id` is the same rows in the same order every time.
    // Each survivor's import_raw.merged_vendors names the spellings the dedupe
    // folded into it; those map to the survivor so a rerun neither re-creates
    // them nor loses their new tickets.
    const absorbedByKey = new Map<string, string>();     // absorbed name_key → survivor id
    for (let lastId = ""; ; ) {
      let page = db
        .from("vendors")
        .select("id, name_key, import_raw")
        .order("id", { ascending: true })
        .limit(1000);
      if (lastId) page = page.gt("id", lastId);
      const { data, error } = await page;
      if (error) { console.error(`   FAILED reading existing vendors: ${error.message}`); process.exit(1); }
      const rows = (data as { id: string; name_key: string; import_raw: Record<string, unknown> | null }[]) ?? [];
      for (const r of rows) {
        idByName.set(r.name_key, r.id);
        const merged = (r.import_raw?.merged_vendors as { name?: string }[] | undefined) ?? [];
        for (const m of merged) {
          const key = m.name?.trim().toLowerCase();
          if (key) absorbedByKey.set(key, r.id);
        }
      }
      if (rows.length < 1000) break;
      lastId = rows[rows.length - 1].id;
    }
    let mapped = 0;
    for (const [key, survivor] of absorbedByKey) {
      if (!idByName.has(key)) { idByName.set(key, survivor); mapped++; }
    }

    // Only names the database has never seen, each once.
    const seen = new Set<string>();
    const fresh = vendorRows.filter((v) => {
      const key = v.name.trim().toLowerCase();
      if (idByName.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(
      `   already present: ${(vendorRows.length - fresh.length).toLocaleString()}` +
      (mapped ? ` (${mapped.toLocaleString()} merged-away spellings mapped to their survivor)` : "") +
      ` · to insert: ${fresh.length.toLocaleString()}`,
    );
    for (let i = 0; i < fresh.length; i += BATCH) {
      const slice = fresh.slice(i, i + BATCH);
      const { data, error } = await db
        .from("vendors")
        .insert(slice)
        .select("id, name");
      if (error) { console.error(`   FAILED at ${i}: ${error.message}`); process.exit(1); }
      for (const r of (data as { id: string; name: string }[]) ?? []) {
        idByName.set(r.name.trim().toLowerCase(), r.id);
      }
      process.stdout.write(`\r   ${Math.min(i + BATCH, fresh.length).toLocaleString()} / ${fresh.length.toLocaleString()}`);
    }
    if (fresh.length) console.log("");
  }

  // ─── 2. Capabilities — derived from what the vendor has actually served ────
  // Not a human decision and not a guess: a vendor that handled Travel > Flights
  // 497 times demonstrably offers it. `declines` rows only ever come from a person.
  const capRows: Record<string, unknown>[] = [];
  for (const v of vendors) {
    const id = idByName.get(v.canonical_name.trim().toLowerCase());
    if (!id && !DRY_RUN) continue;
    const seen = new Set<string>();
    for (const tc of v.ticket_categories ?? []) {
      const { category, service } = splitTicketCategory(tc.category);
      const key = `${category}|${service ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      capRows.push({
        vendor_id: id,
        category,
        service,
        stance: "offers",
        cities: [...new Set((v.service_cities ?? []).map((c) => lower(c.city)).filter(Boolean))].slice(0, 30),
        note: null,
        set_by: null,
      });
    }
  }
  console.log(`2. vendor_capabilities — ${capRows.length.toLocaleString()} rows`);
  let capSkipped = 0;
  if (!DRY_RUN) {
    for (let i = 0; i < capRows.length; i += BATCH) {
      const { error } = await db.from("vendor_capabilities").upsert(capRows.slice(i, i + BATCH), {
        onConflict: "vendor_id,category,service",
        ignoreDuplicates: true,
      });
      if (error) {
        // The unique index is an EXPRESSION index (COALESCE(service,'')) which
        // PostgREST cannot name on conflict, so the upsert above ALWAYS fails
        // and this is the real write path.
        //
        // A batch insert is ONE statement: a single duplicate rolls all 500
        // rows back. Swallowing that 23505 silently discarded every good row
        // beside it — re-running over existing data lost 10,573 capability
        // rows with no error and no clue. A conflicting batch is now retried
        // row by row, so only the genuine repeats are skipped, and they are
        // counted rather than hidden.
        const slice = capRows.slice(i, i + BATCH);
        const { error: insertErr } = await db.from("vendor_capabilities").insert(slice);
        if (insertErr && insertErr.code !== "23505") {
          console.error(`   FAILED at ${i}: ${insertErr.message}`); process.exit(1);
        }
        if (insertErr) {
          for (const row of slice) {
            const { error: rowErr } = await db.from("vendor_capabilities").insert(row);
            if (!rowErr) continue;
            if (rowErr.code === "23505") { capSkipped++; continue; }
            console.error(`   FAILED at ${i}: ${rowErr.message}`); process.exit(1);
          }
        }
      }
      process.stdout.write(`\r   ${Math.min(i + BATCH, capRows.length).toLocaleString()} / ${capRows.length.toLocaleString()}`);
    }
    console.log("");
    if (capSkipped) console.log(`   already present, skipped: ${capSkipped.toLocaleString()}`);
  }

  // ─── 3. The engagement ledger ──────────────────────────────────────────────
  const engRows: Record<string, unknown>[] = [];
  let missingTicket = 0;
  for (const v of vendors) {
    const id = idByName.get(v.canonical_name.trim().toLowerCase());
    if (!id && !DRY_RUN) continue;

    const invoicesByTicket = new Map<number, string[]>();
    for (const inv of v.invoices ?? []) {
      const list = invoicesByTicket.get(inv.ticket_id) ?? [];
      // The bucket path is keyed on the globally-unique attachment id (0184).
      list.push(`${inv.attachment_id}.pdf`);
      invoicesByTicket.set(inv.ticket_id, list);
    }

    for (const ticketId of v.ticket_ids ?? []) {
      const t = ticketIndex[String(ticketId)];
      if (!t) missingTicket++;
      const started = t?.created_at ?? v.first_used ?? null;
      if (!started) continue;                       // started_at is NOT NULL
      engRows.push({
        vendor_id: id,
        // NULL, honestly — the archive carries no requester identity (header).
        client_id: null,
        lead_id: null,
        agent_id: null,                             // resolved below against profiles
        agent_name_raw: t?.agent?.trim() || null,
        title: t?.subject?.trim() || null,
        category: slug(t?.category) ?? "unknown",
        service: slug(t?.subcategory),
        city: lower(t?.location),
        source: "freshdesk",
        source_ref: String(ticketId),
        started_at: started,
        // Freshdesk recorded no outcome and no amount we can trust — saying
        // 'unknown' is honest; inventing 'completed' would corrupt every
        // reliability score built on top of it.
        closed_at: null,
        outcome: "unknown",
        amount_inr: null,
        invoice_paths: invoicesByTicket.get(ticketId) ?? [],
        note: null,
        created_by: null,
      });
    }
  }

  // Attribute jobs to real staff where the Freshdesk agent name matches a profile.
  const { data: profiles } = await db.from("profiles").select("id, full_name");
  const profileByName = new Map<string, string>();
  for (const p of ((profiles as { id: string; full_name: string | null }[] | null) ?? [])) {
    if (p.full_name) profileByName.set(p.full_name.trim().toLowerCase(), p.id);
  }
  let matchedAgents = 0;
  for (const row of engRows) {
    const nameRaw = row.agent_name_raw as string | null;
    const hit = nameRaw ? profileByName.get(nameRaw.toLowerCase()) : undefined;
    if (hit) { row.agent_id = hit; matchedAgents++; }
  }

  console.log(`3. vendor_engagements — ${engRows.length.toLocaleString()} rows`);
  console.log(`   agent matched to a profile: ${matchedAgents.toLocaleString()}  (rest keep agent_name_raw)`);
  if (missingTicket) console.log(`   ticket ids not in the index: ${missingTicket.toLocaleString()}`);
  if (!DRY_RUN) {
    for (let i = 0; i < engRows.length; i += BATCH) {
      // ignoreDuplicates = ON CONFLICT DO NOTHING: a ticket already on the
      // ledger is never rewritten. The plain upsert this replaced would have
      // reset closed_at / outcome / amount / note on every rerun — the exact
      // columns closeEngagementCore writes once and the score reads.
      const { error } = await db
        .from("vendor_engagements")
        .upsert(engRows.slice(i, i + BATCH), {
          onConflict: "vendor_id,source,source_ref",
          ignoreDuplicates: true,
        });
      if (error) { console.error(`   FAILED at ${i}: ${error.message}`); process.exit(1); }
      process.stdout.write(`\r   ${Math.min(i + BATCH, engRows.length).toLocaleString()} / ${engRows.length.toLocaleString()}`);
    }
    console.log("");
  }

  const invoiceCount = engRows.reduce((n, r) => n + (r.invoice_paths as string[]).length, 0);
  console.log(
    `\n${DRY_RUN ? "Would load" : "Loaded"}: ${vendorRows.length.toLocaleString()} vendors · ` +
      `${capRows.length.toLocaleString()} capabilities · ${engRows.length.toLocaleString()} engagements · ` +
      `${invoiceCount.toLocaleString()} invoice paths`,
  );
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(
    `\nThe ${invoiceCount.toLocaleString()} invoice PDFs are NOT uploaded — the rows store paths into the\n` +
      `${VENDOR_INVOICE_BUCKET} bucket. Upload them separately if you want "Open" to resolve locally.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
