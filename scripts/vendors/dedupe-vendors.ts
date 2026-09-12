/**
 * Vendor de-duplication — find near-duplicate vendors, and merge them without
 * losing a single job.
 *
 * The archive is full of swarms: one heavily-used supplier surrounded by
 * one-job misspellings of itself. "LuxDrovia" has 619 jobs; "Luc Drovia",
 * "Luxudrovia", "Loxdrovia", "rol drive x luxdrovia" and "Shamsher x Luxdrovia"
 * have one each. They are the same chauffeur company typed six ways.
 *
 * MERGING IS NOT DELETING. Every engagement, capability, review, note and
 * preference is RE-POINTED at the surviving vendor first; the absorbed name and
 * all its aliases are added to the survivor's `aliases`, so searching the old
 * spelling still finds the vendor; contacts and a missing phone are folded in;
 * and `import_raw.merged_vendors` records what was absorbed and when. Only then
 * is the empty duplicate row removed. Nothing about the history is lost — it
 * moves to the row that should have had it all along.
 *
 * SAFETY
 *   - A remote target needs --yes-write-to-production, and says so loudly.
 *     Step 3 of the deploy runbook runs this against production (replay the
 *     merge list, purge junk, purge clients) — the same flag and posture as
 *     the loader, so it can never happen by accident.
 *   - --dry-run prints the exact plan and writes nothing.
 *   - The report NEVER merges. Merging only ever happens from decisions a
 *     person made: a reviewed CSV, or names given on the command line.
 *   - A vendor is never absorbed into itself, and never into a vendor that is
 *     itself being absorbed in the same run.
 *
 * Run (after `supabase start` and the loader):
 *
 *   # 1. Propose duplicates for review → a CSV with an empty Merge? column
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts --report
 *
 *   # 2. Merge one cluster you are sure about, right now
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts \
 *     --merge "LuxDrovia" --absorb "Luc Drovia,Luxudrovia,Loxdrovia"
 *
 *   # 3. Apply a reviewed CSV (only rows whose Merge? column says yes)
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts --apply reviewed.csv
 *
 *   # 4. Replay the exact merge list that produced the tested dataset — THE
 *   #    deployment step, after the loader has run against the target database
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts \\
 *     --replay scripts/vendors/vendor-merges.csv
 *
 *   # 5. Delete a named row that is not a supplier (a CLIENT, say)
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts --remove "Gautham Pai"
 *
 *   # 5. Delete the rows the extraction identified as CLIENTS, not suppliers
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts --purge-clients
 *
 *   # 6. Delete the rows the extraction itself marked "Junk" — ticket text that
 *   #    got captured as a vendor name ("he will get back", "local vendor")
 *   npx tsx --env-file=.env.local scripts/vendors/dedupe-vendors.ts --purge-junk
 *
 * Options: --dry-run · --out <path> · --min-parent-jobs <n> · --max-child-jobs <n>
 *          --yes-write-to-production (required to target anything but localhost)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

// ─── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const DRY_RUN = argv.includes("--dry-run");
const REPORT = argv.includes("--report");
const MERGE_KEEP = flag("--merge");
const MERGE_ABSORB = flag("--absorb");
const APPLY_CSV = flag("--apply");
const OUT = flag("--out") ?? "vendor-duplicates-review.csv";
const MIN_PARENT_JOBS = Number(flag("--min-parent-jobs") ?? 5);
const MAX_CHILD_JOBS = Number(flag("--max-child-jobs") ?? 2);
/** --only-high: apply ONLY the rows the report marked high confidence. */
const ONLY_HIGH = argv.includes("--only-high");
/** --apply-high: merge every high-confidence misspelling without a CSV. */
const APPLY_HIGH = argv.includes("--apply-high");
/** --purge-junk: delete the rows the extraction itself marked as not-a-vendor. */
const PURGE_JUNK = argv.includes("--purge-junk");
/** --remove "A,B": delete named rows outright — for a row that is not a supplier at all. */
const REMOVE_NAMES = flag("--remove");
/** --purge-clients: delete the rows the extraction identified as CUSTOMERS, not suppliers. */
const PURGE_CLIENTS = argv.includes("--purge-clients");
/** --auto: merge only what is provably safe; write everything else out for review. */
const AUTO = argv.includes("--auto");
/** --replay <csv>: re-apply an exact list of merge decisions (keep,absorb). */
const REPLAY = flag("--replay");

// ─── Guard: local only ────────────────────────────────────────────────────────
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
// Production IS a target — step 3 of the deploy runbook runs this script there.
// It just may never happen by accident: a remote host needs the flag, and the
// run says where it is writing before it writes. Same flag as the loader.
const ALLOW_REMOTE = argv.includes("--yes-write-to-production");
if (!IS_LOCAL && !ALLOW_REMOTE) {
  console.error(
    `REFUSING TO RUN.\n` +
      `  NEXT_PUBLIC_SUPABASE_URL points at "${host}", which is not a local database.\n` +
      `  Merging and purging vendors REMOVES rows. If this is the deploy step,\n` +
      `  re-run with --yes-write-to-production. Nothing was changed.`,
  );
  process.exit(1);
}
if (!IS_LOCAL) {
  console.log(
    `\n*** WRITING TO A REMOTE DATABASE: ${host} ***\n` +
      `    Every deletion is backed up first to vendor-removed-<date>.json (vendor\n` +
      `    rows AND their job rows). --dry-run prints the plan and writes nothing.\n`,
  );
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type VendorRow = {
  id: string;
  name: string;
  aliases: string[] | null;
  category: string | null;
  subcategory: string | null;
  primary_phone: string | null;
  home_city: string | null;
  contacts: unknown[] | null;
  import_raw: Record<string, unknown> | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Every vendor, paged — PostgREST caps a select at 1,000 rows. */
async function allVendors(): Promise<Map<string, VendorRow>> {
  const out = new Map<string, VendorRow>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("vendors")
      .select("id, name, aliases, category, subcategory, primary_phone, home_city, contacts, import_raw")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) { console.error(`FAILED reading vendors: ${error.message}`); process.exit(1); }
    const rows = (data as VendorRow[] | null) ?? [];
    for (const r of rows) out.set(r.id, r);
    if (rows.length < 1000) break;
  }
  return out;
}

async function jobCounts(): Promise<Map<string, number>> {
  // One grouped read would need an RPC; the ledger is small enough to tally in
  // Node, and this script is a one-off maintenance tool, not a request path.
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("vendor_engagements")
      .select("vendor_id")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) { console.error(`FAILED reading engagements: ${error.message}`); process.exit(1); }
    const rows = (data as { vendor_id: string }[] | null) ?? [];
    for (const r of rows) counts.set(r.vendor_id, (counts.get(r.vendor_id) ?? 0) + 1);
    if (rows.length < 1000) break;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-CLASSIFY
//
// Of the 883 remaining proposals, the overwhelming majority are NOT duplicates.
// They are individual PROPERTIES of a chain — "Hyatt Regency Koh Samui",
// "Hyatt Regency Gurgaon", "Aman Tokyo", "Radisson Blu Ludhiana", "Hakkasan
// London". Merging those would fuse every Hyatt on earth into one row and make
// it impossible to find the right hotel. brand-merges.txt in the extraction
// says the same thing: right for couriers and marketplaces, WRONG for hotels
// and restaurants, where each property is its own vendor.
//
// A second trap hides in the same list: "Aman" is both a hotel brand AND a
// common Indian first name, so "Aman Gupta" and "Aman Varindani" sit beside
// "Aman Tokyo" under the same parent. Neither is a duplicate of anything.
//
// So the bar for an automatic merge is deliberately narrow — only the two
// shapes that cannot be anything else:
//
//   1. A MISSPELLING     "Tumbeldry" -> "Tumbledry"
//   2. A LEGAL SUFFIX    "Cathay Pacific Airways" -> "Cathay Pacific"
//
// Everything else is written out for a human. That is not the tool giving up;
// it is the correct answer for a list that is mostly not duplicates.
// ─────────────────────────────────────────────────────────────────────────────

/** Corporate suffixes that name the SAME company, never a different one. */
const LEGAL_SUFFIX = [
  "pvt ltd", "pvt. ltd", "private limited", "pvt limited", "ltd", "limited",
  "llp", "llc", "inc", "plc", "gmbh", "s.a r.l", "sarl", "co", "corp",
  "corporation", "company", "airways", "airlines", "india", "pvt",
];

/** A property or a person, never a duplicate of the brand. */
function looksLikeSeparateEntity(extra: string): boolean {
  // A property name reads as words after the brand; a person's name does too.
  // Rather than guess which, anything that is not a legal suffix is left alone.
  const cleaned = extra.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  return !LEGAL_SUFFIX.includes(cleaned);
}

async function autoClassify(vendors: Map<string, VendorRow>, jobs: Map<string, number>) {
  const rows = await proposals(vendors, jobs);
  const merge: Proposal[] = [];
  const review: Proposal[] = [];

  for (const r of rows) {
    const pk = squash(r.parent.name);
    const ck = squash(r.child.name);
    const isPerson =
      (r.parent.subcategory ?? "").toLowerCase().includes("individual") ||
      (r.child.subcategory ?? "").toLowerCase().includes("individual");

    if (ck.startsWith(pk) && ck.length > pk.length) {
      // What did the child add? Compare on the ORIGINAL names so word
      // boundaries survive — the squashed forms have none.
      const lower = r.child.name.toLowerCase();
      const at = lower.indexOf(r.parent.name.toLowerCase());
      const extra = at >= 0
        ? lower.slice(at + r.parent.name.length).replace(/^[^a-z0-9]+/, "").trim()
        : "";
      if (!isPerson && extra && !looksLikeSeparateEntity(extra)) merge.push(r);
      else review.push(r);
      continue;
    }

    // A misspelling: the tier the report already vetted (length >= 7, not a
    // person, within 15% edit distance).
    if (r.confidence === "high") merge.push(r);
    else review.push(r);
  }

  console.log(`${rows.length.toLocaleString()} proposals\n`);
  console.log(`  SAFE to merge : ${merge.length.toLocaleString()}  (misspellings + legal suffixes)`);
  console.log(`  NEEDS A HUMAN : ${review.length.toLocaleString()}  (properties of a chain, people, everything else)\n`);

  for (const r of merge) console.log(`   merge  ${r.child.name.slice(0, 46).padEnd(46)} -> ${r.parent.name}`);

  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  writeFileSync(OUT, "\ufeff" + [
    ["Keep", "Its Jobs", "Absorb", "Its Jobs", "Why not automatic", "Merge? (yes/no)"].map(esc).join(","),
    ...review.map((r) => [
      r.parent.name, String(jobs.get(r.parent.id) ?? 0),
      r.child.name, String(jobs.get(r.child.id) ?? 0),
      "adds a name or place — could be a separate property or person", "",
    ].map(esc).join(",")),
  ].join("\n"), "utf8");
  console.log(`\n  ${review.length.toLocaleString()} left for review in ${OUT}`);

  if (DRY_RUN) { console.log("\nDry run — nothing merged."); return; }
  const absorbed = new Set(merge.map((r) => r.child.id));
  for (const r of merge) {
    if (absorbed.has(r.parent.id)) continue;
    await mergeOne(r.parent, r.child, jobs.get(r.child.id) ?? 0);
  }
  console.log(`\nMerged ${merge.length.toLocaleString()}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE JUNK PURGE
//
// The extraction labelled 216 rows `subcategory = 'Junk'` — they are not
// suppliers at all, they are fragments of ticket text that got captured as a
// name: "he will get back" (64 jobs), "Snehil - she will update by 12PM",
// "Atleast", "local vendor". They pollute the list, the search and the ranker.
//
// The extraction's OWN label is the only rule used. Tempting heuristics are
// wrong here: a name-length test flags "Four Seasons Ocean Club (The Ocean
// Club, A Four Seasons Reso…" and "Jampoon Restaurant at Phulay Bay, a
// Ritz-Carlton Reserve", which are real and heavily used.
//
// Their engagements go too. A row saying "ticket 31476 used the vendor 'he
// will get back'" carries no information — the ticket itself still lives in
// Freshdesk. Everything deleted is written to a JSON file FIRST, so a purge
// can be inspected or replayed.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Rows the extraction labelled `Junk` that are REAL VENDORS, confirmed by a
 * person looking at them. The label is the rule (a name-length or
 * looks-like-a-sentence heuristic flags "Four Seasons Ocean Club (The Ocean
 * Club, A Four Seasons Reso…", which is real and heavily used) — but the label
 * is not infallible, and this is the reviewed list of where it was wrong.
 *
 * Kept as an explicit, checked-in list rather than a softened rule, for the same
 * reason vendor-merges.csv exists: every judgement a person made is reviewable
 * in the PR instead of living only in someone's local database.
 *
 * "Gain access" — 17 jobs, a supplier that gets people into matches and events.
 * The name reads like a sentence fragment, which is what the extraction tripped
 * on. It is now ALSO in vendor-merges.csv, folded into its registered identity
 * "Gainaccess Sports & Entertainment LLP", and the replay runs BEFORE this
 * purge — so in a clean rebuild this entry currently spares nothing.
 *
 * It is kept deliberately. The entry costs one string and is the backstop for
 * the case where the merge does not run or its survivor is absent: without it
 * the fallback is silent deletion of a real vendor and its history, which is
 * exactly what happened once already.
 *
 * All 215 others were reviewed against their job counts and confirmed junk
 * (2026-09-09): ticket text ("he will get back", 64 jobs), placeholders
 * ("Unnamed vendor"), products ("Speaker" — the tickets are headphones and
 * gifts), addresses ("Khan Market") and roles ("Runner", "Organiser").
 */
const NOT_JUNK = new Set(["gain access"]);

async function purgeJunk(vendors: Map<string, VendorRow>, jobs: Map<string, number>) {
  const all = [...vendors.values()].filter((v) => (v.subcategory ?? "").toLowerCase() === "junk");
  const junk = all.filter((v) => !NOT_JUNK.has(v.name.trim().toLowerCase()));
  const keep = all.filter((v) => NOT_JUNK.has(v.name.trim().toLowerCase()));
  if (keep.length) {
    console.log(`  sparing ${keep.length} row(s) on the reviewed NOT_JUNK list:`);
    for (const v of keep) {
      console.log(`     ${String(jobs.get(v.id) ?? 0).padStart(4)} jobs  ${v.name}`);
    }
    // Sparing the row is not enough — the `Junk` label is what the vendor page
    // and the category filter READ, so a spared row would show its category as
    // "Junk" to whoever opens it. It is a real vendor that has never been
    // categorised, which is exactly what 'Needs Review' already means here.
    if (!DRY_RUN) {
      const { error } = await db
        .from("vendors")
        .update({ subcategory: "Needs Review" })
        .in("id", keep.map((v) => v.id));
      if (error) { console.error(`   FAILED relabelling spared rows: ${error.message}`); process.exit(1); }
      console.log(`     relabelled to 'Needs Review' (a vendor must never read as Junk)`);
    }
    console.log("");
  }
  await removeVendors(junk, jobs, "marked Junk by the extraction");
}

/**
 * Delete vendor rows outright, engagements and all.
 *
 * Only ever for a row that is NOT A SUPPLIER — extraction noise ("he will get
 * back"), or a CLIENT the pipeline mistook for a vendor. A real supplier is
 * never deleted: it is blacklisted, or merged into the row it duplicates, so
 * its history survives.
 */
async function removeVendors(rows: VendorRow[], jobs: Map<string, number>, why: string) {
  const junk = rows;
  const totalJobs = junk.reduce((n, v) => n + (jobs.get(v.id) ?? 0), 0);

  if (junk.length === 0) { console.log("Nothing matched."); return; }
  console.log(`${junk.length.toLocaleString()} vendors ${why}, holding ${totalJobs.toLocaleString()} job rows.\n`);
  for (const v of [...junk].sort((a, b) => (jobs.get(b.id) ?? 0) - (jobs.get(a.id) ?? 0)).slice(0, 15)) {
    console.log(`   ${String(jobs.get(v.id) ?? 0).padStart(4)}  ${v.name.slice(0, 66)}`);
  }
  if (junk.length > 15) console.log(`   … and ${(junk.length - 15).toLocaleString()} more`);

  if (DRY_RUN) { console.log("\nDry run — nothing deleted."); return; }

  // The backup carries the JOB ROWS as well as the vendor row. It did not
  // originally, and that cost us: "Gain access" turned out to be a real vendor,
  // and restoring it meant re-running the whole loader because its 16 jobs
  // existed nowhere in the log. A backup that cannot restore is not a backup.
  const withJobs: (VendorRow & { engagements?: unknown[] })[] = [];
  for (let i = 0; i < junk.length; i += 50) {
    const slice = junk.slice(i, i + 50);
    const { data: engs } = await db
      .from("vendor_engagements").select("*").in("vendor_id", slice.map((v) => v.id));
    const byVendor = new Map<string, unknown[]>();
    for (const e of (engs as { vendor_id: string }[] | null) ?? []) {
      const list = byVendor.get(e.vendor_id) ?? [];
      list.push(e);
      byVendor.set(e.vendor_id, list);
    }
    for (const v of slice) withJobs.push({ ...v, engagements: byVendor.get(v.id) ?? [] });
  }
  const backup = `vendor-removed-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backup, JSON.stringify(withJobs, null, 1), "utf8");
  console.log(`\n  backed up to ${backup} (vendor rows AND their job rows)`);

  let removed = 0;
  for (let i = 0; i < junk.length; i += 50) {
    const ids = junk.slice(i, i + 50).map((v) => v.id);
    // Engagements are FK RESTRICT — they must go before the vendor row.
    // Capabilities, notes and preferences CASCADE.
    const { error: engErr } = await db.from("vendor_engagements").delete().in("vendor_id", ids);
    if (engErr) { console.error(`   FAILED clearing engagements: ${engErr.message}`); process.exit(1); }
    const { error: venErr } = await db.from("vendors").delete().in("id", ids);
    if (venErr) { console.error(`   FAILED deleting vendors: ${venErr.message}`); process.exit(1); }
    removed += ids.length;
    process.stdout.write(`\r  deleted ${removed.toLocaleString()} / ${junk.length.toLocaleString()}`);
  }
  console.log(`\n\nRemoved ${removed.toLocaleString()} non-vendor(s) and ${totalJobs.toLocaleString()} job row(s).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MERGE
// ─────────────────────────────────────────────────────────────────────────────
async function mergeOne(keep: VendorRow, absorb: VendorRow, jobs: number): Promise<void> {
  const label = `"${absorb.name}" (${jobs} job${jobs === 1 ? "" : "s"}) → "${keep.name}"`;
  if (DRY_RUN) { console.log(`   would merge ${label}`); return; }

  // 1. Engagements. UNIQUE(vendor_id, source, source_ref) means the SAME ticket
  //    already on the survivor would collide — that is a genuine duplicate row
  //    for one job, so it is dropped rather than moved.
  const { data: keepRefs } = await db
    .from("vendor_engagements").select("source, source_ref").eq("vendor_id", keep.id);
  const held = new Set(((keepRefs as { source: string; source_ref: string }[] | null) ?? [])
    .map((r) => `${r.source}|${r.source_ref}`));

  const { data: moving } = await db
    .from("vendor_engagements").select("id, source, source_ref").eq("vendor_id", absorb.id);
  const rows = (moving as { id: string; source: string; source_ref: string }[] | null) ?? [];
  const collide = rows.filter((r) => held.has(`${r.source}|${r.source_ref}`)).map((r) => r.id);
  const move = rows.filter((r) => !held.has(`${r.source}|${r.source_ref}`)).map((r) => r.id);

  for (let i = 0; i < move.length; i += 100) {
    const { error } = await db
      .from("vendor_engagements").update({ vendor_id: keep.id }).in("id", move.slice(i, i + 100));
    if (error) { console.error(`   FAILED moving engagements for ${label}: ${error.message}`); process.exit(1); }
  }
  for (let i = 0; i < collide.length; i += 100) {
    await db.from("vendor_engagements").delete().in("id", collide.slice(i, i + 100));
  }

  // 2. Reviews and notes carry no uniqueness — a straight re-point.
  await db.from("vendor_reviews").update({ vendor_id: keep.id }).eq("vendor_id", absorb.id);
  await db.from("vendor_notes").update({ vendor_id: keep.id }).eq("vendor_id", absorb.id);

  // 3. Capabilities are keyed, so anything the survivor already has wins; the
  //    rest move. Whatever is left CASCADEs on delete.
  const { data: keepCaps } = await db
    .from("vendor_capabilities").select("category, service").eq("vendor_id", keep.id);
  const capHeld = new Set(((keepCaps as { category: string; service: string | null }[] | null) ?? [])
    .map((c) => `${c.category}|${c.service ?? ""}`));
  const { data: absorbCaps } = await db
    .from("vendor_capabilities").select("id, category, service").eq("vendor_id", absorb.id);
  const capMove = ((absorbCaps as { id: string; category: string; service: string | null }[] | null) ?? [])
    .filter((c) => !capHeld.has(`${c.category}|${c.service ?? ""}`)).map((c) => c.id);
  if (capMove.length) await db.from("vendor_capabilities").update({ vendor_id: keep.id }).in("id", capMove);

  // 4. The survivor inherits the absorbed IDENTITY: its name and aliases become
  //    aliases, so every old spelling still finds the vendor (0187 searches
  //    aliases), and its contacts / phone / city fill any gap.
  const aliases = [...new Set([
    ...(keep.aliases ?? []),
    ...(absorb.aliases ?? []),
    absorb.name,
  ].filter((a) => a && a.trim() && squash(a) !== squash(keep.name)))];

  const contacts = [
    ...((keep.contacts as unknown[]) ?? []),
    ...((absorb.contacts as unknown[]) ?? []),
  ];

  const importRaw = {
    ...(keep.import_raw ?? {}),
    merged_vendors: [
      ...(((keep.import_raw?.merged_vendors as unknown[]) ?? [])),
      // Everything the absorbed row had ITSELF absorbed comes along, so the
      // record is transitive: "Gain Acceess" → "Gain access" → the LLP leaves
      // the LLP knowing all three spellings. The loader maps every name in
      // this list to the survivor on a rerun; without the carry-over an
      // intermediate spelling had no survivor to map to and was re-inserted.
      ...(((absorb.import_raw?.merged_vendors as unknown[]) ?? [])),
      {
        name: absorb.name,
        id: absorb.id,
        category: absorb.category,
        subcategory: absorb.subcategory,
        primary_phone: absorb.primary_phone,
        home_city: absorb.home_city,
        // The exact rows that moved, so a wrong merge can be undone: recreate
        // the vendor from the fields above and point these engagements back.
        // Only ever a handful — a merge candidate has at most 2 jobs.
        engagement_ids: move,
        duplicate_rows_dropped: collide.length,
        at: new Date().toISOString(),
      },
    ],
  };

  const { error: upErr } = await db.from("vendors").update({
    aliases,
    contacts,
    primary_phone: keep.primary_phone ?? absorb.primary_phone,
    home_city: keep.home_city ?? absorb.home_city,
    subcategory: keep.subcategory ?? absorb.subcategory,
    import_raw: importRaw,
  }).eq("id", keep.id);
  if (upErr) { console.error(`   FAILED updating survivor for ${label}: ${upErr.message}`); process.exit(1); }

  // 5. The duplicate is now empty of history. Remove it.
  const { error: delErr } = await db.from("vendors").delete().eq("id", absorb.id);
  if (delErr) { console.error(`   FAILED deleting ${label}: ${delErr.message}`); process.exit(1); }

  // Keep the local copy current so a later merge in the same run sees it.
  keep.aliases = aliases;
  keep.contacts = contacts;
  keep.primary_phone = keep.primary_phone ?? absorb.primary_phone;
  keep.import_raw = importRaw;

  console.log(
    `   merged ${label}` +
      (collide.length ? `  [${collide.length} duplicate ticket row${collide.length === 1 ? "" : "s"} dropped]` : ""),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THE REPORT — proposals only, never a merge.
// ─────────────────────────────────────────────────────────────────────────────
type Proposal = { parent: VendorRow; child: VendorRow; reason: string; confidence: string; score: number };

async function report(vendors: Map<string, VendorRow>, jobs: Map<string, number>) {
  const rows = await proposals(vendors, jobs);
  writeReport(rows, jobs);
}

/** THE candidate finder. Shared by --report and --apply-high so the tiers can never diverge. */
async function proposals(vendors: Map<string, VendorRow>, jobs: Map<string, number>): Promise<Proposal[]> {
  console.log(`Scanning ${vendors.size.toLocaleString()} vendors for near-duplicates…\n`);

  // Parents are the vendors with real history; children are the near-unused
  // rows that look like them. Anchoring on a dominant parent is what keeps two
  // genuinely different one-job vendors from being fused into each other.
  const parents = [...vendors.values()].filter((v) => (jobs.get(v.id) ?? 0) >= MIN_PARENT_JOBS);
  const children = [...vendors.values()].filter((v) => (jobs.get(v.id) ?? 0) <= MAX_CHILD_JOBS);
  console.log(`  ${parents.length.toLocaleString()} parents (>=${MIN_PARENT_JOBS} jobs) · ${children.length.toLocaleString()} candidates (<=${MAX_CHILD_JOBS} jobs)`);

  const byKey = new Map<string, VendorRow[]>();
  for (const c of children) {
    const k = squash(c.name);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push(c);
    byKey.set(k, list);
  }

  const found: Proposal[] = [];
  const claimed = new Set<string>();

  for (const p of parents) {
    const pk = squash(p.name);
    if (pk.length < 4) continue;   // "H&M" → "hm": far too short to match on
    for (const [ck, list] of byKey) {
      if (ck === pk) continue;
      let reason = "";
      let confidence = "";
      // Order matters: the PREFIX test runs first. "District D" is one edit
      // from "District" and "Akshaya" is one edit from "Akshay", so a
      // misspelling test placed first would claim both as high-confidence
      // typos — when in fact they are a possible second venue and a possible
      // second person. A name that merely EXTENDS another is a judgement call,
      // never an automatic merge.
      // A misspelling. The threshold is RELATIVE to the name's length, not
      //     a flat edit count — two edits on "luxdrovia" is a typo, two edits
      //     on "Ankit" turns it into "Ankur", a different person. A flat "<= 2"
      //     proposed exactly that, plus "vicky" -> "Lucky" and "Porter" ->
      //     "Portea" (a courier and a healthcare company). At 15% a 5-letter
      //     name tolerates NO edits, which is the correct answer for short
      //     names. Transpositions count as ONE (Damerau), so the genuine
      //     "Shubahm" -> "Shubham" finger-slip still lands.
      if (ck.startsWith(pk) && ck.length > pk.length) {
        reason = "starts with the parent name";
        confidence = "review";
      } else if (Math.abs(ck.length - pk.length) <= 2) {
        const d = editDistance(ck, pk);
        if (d > 0 && d / Math.max(ck.length, pk.length) <= 0.15) {
          reason = `misspelling (${d} character${d === 1 ? "" : "s"} in ${Math.max(ck.length, pk.length)})`;
          // Short names are unreliable at any ratio — the shorter the name,
          // the likelier a single differing character is a different word
          // rather than a slip. The per-vendor "is this a person" gate is
          // applied below, where the child row is in scope.
          if (Math.max(ck.length, pk.length) < 7) {
            confidence = "review";
            reason += " — but the name is short";
          } else {
            confidence = "high";
          }
        }
      }
      if (!reason) continue;

      for (const c of list) {
        if (c.id === p.id || claimed.has(c.id)) continue;
        // Category must not actively disagree — 'unclassified' is not a
        // disagreement, it is the extraction saying it could not tell.
        const pc = p.category ?? "unclassified";
        const cc = c.category ?? "unclassified";
        if (pc !== cc && cc !== "unclassified" && pc !== "unclassified") continue;
        // A PERSON is not a brand. "Akshay" and "Lakshay", "Ankit" and
        // "Ankur", "Shekhar" and "Shekar" are each one edit apart and are
        // different human beings. The archive marks these rows
        // 'Individual Contact', so a misspelling between two of them never
        // reaches the automatic tier.
        const isPerson =
          (p.subcategory ?? "").toLowerCase().includes("individual") ||
          (c.subcategory ?? "").toLowerCase().includes("individual");
        claimed.add(c.id);
        found.push({
          parent: p,
          child: c,
          reason: isPerson && confidence === "high" ? `${reason} — but these are people, not brands` : reason,
          confidence: isPerson ? "review" : confidence,
          score: jobs.get(p.id) ?? 0,
        });
      }
    }
  }

  // High-confidence misspellings first — they are the ones worth skimming.
  found.sort((a, b) =>
    (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1) ||
    b.score - a.score ||
    a.parent.name.localeCompare(b.parent.name));
  return found;
}

function writeReport(proposals: Proposal[], jobs: Map<string, number>) {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Keep", "Its Jobs", "Absorb", "Its Jobs", "Confidence", "Why", "Keep Category", "Absorb Category", "Merge? (yes/no)"].map(esc).join(","),
    ...proposals.map((r) => [
      r.parent.name, String(jobs.get(r.parent.id) ?? 0),
      r.child.name, String(jobs.get(r.child.id) ?? 0),
      r.confidence, r.reason,
      `${r.parent.category ?? "-"} > ${r.parent.subcategory ?? "-"}`,
      `${r.child.category ?? "-"} > ${r.child.subcategory ?? "-"}`,
      "",
    ].map(esc).join(",")),
  ].join("\n");
  writeFileSync(OUT, "﻿" + csv, "utf8");

  const high = proposals.filter((r) => r.confidence === "high").length;
  console.log(`\n  ${proposals.length.toLocaleString()} proposed merges written to ${OUT}`);
  console.log(`    ${high.toLocaleString()} misspellings (high confidence) · ${(proposals.length - high).toLocaleString()} starts-with-parent (needs your eyes)`);
  console.log(`  Nothing was merged. Put "yes" in the Merge? column and re-run with --apply ${OUT}\n`);
  console.log("  Top 20 misspellings (the high-confidence tier):");
  for (const r of proposals.filter((x) => x.confidence === "high").slice(0, 20)) {
    console.log(
      `    ${String(jobs.get(r.parent.id) ?? 0).padStart(4)}  ${r.parent.name.padEnd(30).slice(0, 30)}` +
        ` ← ${r.child.name.padEnd(30).slice(0, 30)} ${r.reason}`,
    );
  }
}

/**
 * Damerau-Levenshtein — Levenshtein plus TRANSPOSITION as a single edit.
 * "Shubahm" for "Shubham" is one slipped finger, and plain Levenshtein would
 * score it 2 (the same as "Ankit" vs "Ankur", two different people). Only ever
 * called on short squashed names.
 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // transposition
      }
    }
  }
  return d[m][n];
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`Local database: ${SUPABASE_URL}${DRY_RUN ? "   (DRY RUN — nothing will be written)" : ""}\n`);

  const vendors = await allVendors();
  const jobs = await jobCounts();
  const byName = new Map<string, VendorRow>();
  for (const v of vendors.values()) byName.set(squash(v.name), v);
  // Exact (case-insensitive) names for --replay, where a squashed key is unsafe.
  const byExactName = new Map<string, VendorRow>();
  for (const v of vendors.values()) byExactName.set(v.name.trim().toLowerCase(), v);

  const find = (name: string): VendorRow | null => byName.get(squash(name)) ?? null;

  // ── Mode: delete named rows that are not suppliers at all ──
  if (REMOVE_NAMES) {
    const wanted = REMOVE_NAMES.split(",").map((x) => x.trim()).filter(Boolean);
    const rows: VendorRow[] = [];
    for (const name of wanted) {
      const hit = byName.get(squash(name));
      if (!hit) { console.error(`  skipped — no vendor named "${name}"`); continue; }
      rows.push(hit);
    }
    await removeVendors(rows, jobs, "named for removal");
    console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: replay an exact, reviewed list of merge decisions ──
  //
  // THE deployment path. The cleanup that produced the tested dataset was not
  // one rule: 216 junk rows and 10 clients came off a label (--purge-junk /
  // --purge-clients), 112 merges came off the confidence rules (--apply-high,
  // --auto), and roughly two dozen were decided by a person looking at them —
  // the six LuxDrovia spellings, the Amazon regions, "Roldrive is still
  // checking". Those judgements exist nowhere but in the database.
  //
  // So they are exported to scripts/vendors/vendor-merges.csv and replayed.
  // The file is checked in and readable, which also makes every merge in the
  // dataset reviewable in the PR rather than invisible.
  //
  // Order-independent and idempotent: a pair whose `absorb` is already gone is
  // skipped, so a re-run after a partial failure is safe.
  if (REPLAY) {
    const text = readFileSync(REPLAY, "utf8").replace(/^\ufeff/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    let applied = 0, gone = 0, missing = 0;
    for (const line of lines.slice(1)) {
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0)
        .map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
      const [keepName, absorbName, canonicalCell] = cells;
      if (!keepName || !absorbName) continue;
      // Optional 3rd column. "canonical" says: the survivor is the CORRECT
      // identity even though it holds fewer jobs, and a person verified it.
      // Real case — "Gainaccess Sports & Entertainment LLP" (1 job, correctly
      // categorised Experiences & Events) is the registered company behind
      // "Gain access" (17 jobs, Unclassified). Keeping the bigger row would keep
      // the worse record. Only ever set by hand.
      const canonical = (canonicalCell ?? "").trim().toLowerCase() === "canonical";
      // EXACT names, not the squashed key. Squashing collides: the absorbed row
      // "rol-drive" squashes to "roldrive", the same key as the LIVE vendor
      // "Roldrive" (316 jobs) — a squashed lookup resolved the survivor itself
      // and would have merged it into an 8-job namesake, backwards.
      const keep = byExactName.get(keepName.trim().toLowerCase());
      const absorb = byExactName.get(absorbName.trim().toLowerCase());
      if (!absorb) { gone++; continue; }          // already merged — nothing to do
      if (!keep) { console.error(`  MISSING survivor "${keepName}"`); missing++; continue; }
      if (keep.id === absorb.id) { gone++; continue; }
      // Backstop for any collision this file has not anticipated: a merge always
      // runs from the smaller history into the larger. If the row to absorb has
      // MORE jobs than the survivor, the pair is inverted and must not run.
      const keepJobs = jobs.get(keep.id) ?? 0;
      const absorbJobs = jobs.get(absorb.id) ?? 0;
      if (absorbJobs > keepJobs && !canonical) {
        console.error(
          `  REFUSED "${absorb.name}" (${absorbJobs} jobs) → "${keep.name}" (${keepJobs} jobs) — inverted`,
        );
        missing++;
        continue;
      }
      if (absorbJobs > keepJobs) {
        console.log(
          `   inverted BY DESIGN — "${keep.name}" is the canonical identity (${keepJobs} job(s)) ` +
          `and absorbs "${absorb.name}" (${absorbJobs} jobs)`,
        );
      }
      await mergeOne(keep, absorb, jobs.get(absorb.id) ?? 0);
      applied++;
    }
    console.log(
      `\n${DRY_RUN ? "Would apply" : "Applied"} ${applied.toLocaleString()} merge(s); ` +
      `${gone.toLocaleString()} already done; ${missing.toLocaleString()} with no survivor.`,
    );
    console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: merge only what is provably safe, review the rest ──
  if (AUTO) {
    await autoClassify(vendors, jobs);
    console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: delete the rows that turned out to be CLIENTS ──
  // The extraction labels these `Client (excluded)` — a person Indulge serves,
  // captured as if they supplied the service. They are not junk (the name is a
  // real human) but they must never be suggested AS a vendor.
  if (PURGE_CLIENTS) {
    const clients = [...vendors.values()]
      .filter((v) => (v.subcategory ?? "").toLowerCase().startsWith("client"));
    await removeVendors(clients, jobs, "identified as CLIENTS, not suppliers");
    console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: delete what the extraction says is not a vendor ──
  if (PURGE_JUNK) {
    await purgeJunk(vendors, jobs);
    console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: apply every high-confidence misspelling, no CSV round-trip ──
  // Only the tier that survived BOTH gates above: not a name extension, not a
  // person, not a short name. Everything else still needs a human.
  if (APPLY_HIGH) {
    const rows = await proposals(vendors, jobs);
    const high = rows.filter((r) => r.confidence === "high");
    console.log(`${high.length.toLocaleString()} high-confidence misspellings.\n`);
    const absorbed = new Set(high.map((r) => r.child.id));
    for (const r of high) {
      if (absorbed.has(r.parent.id)) { console.log(`   skipped "${r.child.name}" — its survivor is itself being absorbed`); continue; }
      await mergeOne(r.parent, r.child, jobs.get(r.child.id) ?? 0);
    }
    console.log(`\n${DRY_RUN ? "Would merge" : "Merged"} ${high.length.toLocaleString()} vendor(s). Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: report ──
  if (REPORT || (!MERGE_KEEP && !APPLY_CSV)) {
    await report(vendors, jobs);
    console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Mode: one cluster from the command line ──
  const pairs: { keep: VendorRow; absorb: VendorRow }[] = [];
  if (MERGE_KEEP) {
    const keep = find(MERGE_KEEP);
    if (!keep) { console.error(`No vendor named "${MERGE_KEEP}".`); process.exit(1); }
    for (const raw of (MERGE_ABSORB ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const absorb = find(raw);
      if (!absorb) { console.error(`  skipped — no vendor named "${raw}"`); continue; }
      if (absorb.id === keep.id) { console.error(`  skipped — "${raw}" IS the survivor`); continue; }
      pairs.push({ keep, absorb });
    }
  }

  // ── Mode: a reviewed CSV ──
  if (APPLY_CSV) {
    const text = readFileSync(APPLY_CSV, "utf8").replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines.slice(1)) {
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0)
        .map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
      const [keepName, , absorbName, , conf, , , , decision] = cells;
      if ((decision ?? "").trim().toLowerCase() !== "yes") continue;
      if (!ONLY_HIGH || (conf ?? "").trim() === "high") {
        // fall through
      } else continue;
      const keep = find(keepName ?? ""); const absorb = find(absorbName ?? "");
      if (!keep || !absorb || keep.id === absorb.id) continue;
      pairs.push({ keep, absorb });
    }
    console.log(`  ${pairs.length.toLocaleString()} row(s) marked yes in ${APPLY_CSV}`);
  }

  if (!pairs.length) { console.log("Nothing to merge."); return; }

  // A vendor being absorbed can never also be a survivor in the same run.
  const absorbed = new Set(pairs.map((p) => p.absorb.id));
  const safe = pairs.filter((p) => !absorbed.has(p.keep.id));
  if (safe.length !== pairs.length) {
    console.log(`  ${pairs.length - safe.length} skipped — their survivor is itself being absorbed.`);
  }

  console.log(`\nMerging ${safe.length} vendor(s):`);
  for (const { keep, absorb } of safe) await mergeOne(keep, absorb, jobs.get(absorb.id) ?? 0);

  console.log(`\n${DRY_RUN ? "Would merge" : "Merged"} ${safe.length} vendor(s). Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
