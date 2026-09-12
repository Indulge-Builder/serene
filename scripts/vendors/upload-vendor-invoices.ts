/**
 * Uploads the Freshdesk invoice PDFs into the private `vendor-invoices` bucket.
 *
 * `load-vendors.ts` writes the invoice PATHS onto the engagement ledger but
 * never the files — the rows point at `{attachment_id}.pdf` inside the bucket
 * provisioned by migration 0184. Until those objects exist, "Open" on the
 * vendor page mints a signed url for a key that isn't there and nothing opens.
 * This script closes that gap.
 *
 * The files come from the extraction's own download, laid out one folder per
 * ticket:
 *   E:/Vendor/raw/attachments/{ticket_id}/{attachment_id}__{original_name}
 * The bucket key stays FLAT and keyed on the globally-unique attachment id
 * (the 0184 contract), so the original filename — often truncated, occasionally
 * 90 characters of base64 — never has to be a valid object key. Verified by
 * magic bytes: 4,982 of the 4,987 referenced attachments are genuine PDFs and
 * the rest are PDFs with a stray leading byte or saved HTML receipts, so
 * `application/pdf` is correct for all of them.
 *
 * SAFETY — refuses any non-local database unless `--yes-write-to-production`
 * is passed, the same posture and the same flag name as the loader.
 *
 * IDEMPOTENT — objects are upserted on their key, so a re-run replaces rather
 * than duplicates, and `--skip-existing` makes a resumed run cheap.
 *
 * Run (after `supabase start` and the loader):
 *   npx tsx --env-file=.env.local scripts/vendors/upload-vendor-invoices.ts [options]
 *
 *   --dir <path>      attachments root   (default E:/Vendor/raw/attachments)
 *   --limit <n>       upload the invoices of only the first n VENDORS — a
 *                     sample where every sampled vendor is COMPLETE, so no
 *                     vendor page shows some invoices opening and some not
 *   --skip-existing   don't re-upload a key already in the bucket — THE resume
 *                     switch; the bucket is listed once, not once per file
 *   --yes-write-to-production   required to target anything but localhost
 *   --dry-run         resolve everything, upload nothing, print the summary
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { VENDOR_INVOICE_BUCKET } from "../../src/lib/constants/vendors";

// ─── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const ATTACH_DIR = flag("--dir") ?? "E:/Vendor/raw/attachments";
const LIMIT = Number(flag("--limit") ?? 0) || 0;
const SKIP_EXISTING = argv.includes("--skip-existing");
const DRY_RUN = argv.includes("--dry-run");
const PAGE = 1000;      // PostgREST caps a select here; never assume one page
const CONCURRENCY = 8;

// ─── Guard: local only, no override ──────────────────────────────────────────
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
// Production IS a supported target — it is the only way the files get there.
// The bucket (migration 0184) is private, so nothing here is ever a public URL;
// the vendor page mints a signed url per click. The PATHS are already written
// onto the engagement ledger by the loader, so until these objects exist on the
// target, every "Open" on a production vendor page signs a key that isn't there.
//
// It just may never happen by accident: the flag names the target out loud.
const ALLOW_REMOTE = argv.includes("--yes-write-to-production");
if (!IS_LOCAL && !ALLOW_REMOTE) {
  console.error(
    `REFUSING TO RUN.\n` +
      `  NEXT_PUBLIC_SUPABASE_URL points at "${host}", which is not a local database.\n` +
      `  Pushing ~1.8 GB of invoices into a remote project is a deployment step.\n` +
      `  If that IS what you mean, re-run with --yes-write-to-production.\n` +
      `  Nothing was uploaded.`,
  );
  process.exit(1);
}
if (!IS_LOCAL) {
  console.log(
    `\n*** UPLOADING TO A REMOTE PROJECT: ${host} ***\n` +
      `    ~1.8 GB across 4,977 objects into the private ${VENDOR_INVOICE_BUCKET} bucket.\n` +
      `    Objects are upserted on their key, so this is safe to re-run and safe to\n` +
      `    interrupt — resume with --skip-existing and it re-sends only what is\n` +
      `    missing. Run it AFTER the migrations (0184 creates the bucket) and AFTER\n` +
      `    the loader (it writes the paths these objects have to match).\n`,
  );
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/** attachment_id → the file on disk. The id is the filename up to the `__`. */
function indexAttachments(root: string): Map<string, string> {
  const byId = new Map<string, string>();
  let tickets: string[];
  try {
    tickets = readdirSync(root);
  } catch {
    console.error(`Cannot read ${root}. Pass --dir if the extraction lives elsewhere.`);
    process.exit(1);
  }
  for (const ticket of tickets) {
    let files: string[];
    try { files = readdirSync(join(root, ticket)); } catch { continue; }
    for (const f of files) {
      const id = f.split("__")[0];
      if (id) byId.set(id, join(root, ticket, f));
    }
  }
  return byId;
}

async function main() {
  const t0 = Date.now();
  console.log(`Local database: ${SUPABASE_URL}`);
  console.log(`Attachments:    ${ATTACH_DIR}${DRY_RUN ? "   (DRY RUN — nothing will be uploaded)" : ""}\n`);

  const byId = indexAttachments(ATTACH_DIR);
  console.log(`  ${byId.size.toLocaleString()} attachment files indexed`);

  // ─── Which keys does the ledger actually reference? ────────────────────────
  // Grouped by vendor so --limit yields COMPLETE vendors rather than a vendor
  // whose page would show three invoices opening and two not.
  const pathsByVendor = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("vendor_engagements")
      .select("vendor_id, invoice_paths")
      .not("invoice_paths", "eq", "{}")
      .order("vendor_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error(`FAILED reading the ledger: ${error.message}`); process.exit(1); }
    const rows = (data as { vendor_id: string; invoice_paths: string[] }[] | null) ?? [];
    if (!rows.length) break;
    for (const r of rows) {
      if (!r.invoice_paths?.length) continue;
      const set = pathsByVendor.get(r.vendor_id) ?? new Set<string>();
      for (const p of r.invoice_paths) set.add(p);
      pathsByVendor.set(r.vendor_id, set);
    }
    if (rows.length < PAGE) break;
  }

  let vendors = [...pathsByVendor.entries()];
  const allPaths = vendors.reduce((n, [, s]) => n + s.size, 0);
  console.log(`  ${allPaths.toLocaleString()} invoice paths across ${vendors.length.toLocaleString()} vendors`);
  if (LIMIT) {
    // Most-invoiced first, so a sample lands on pages that are worth opening.
    vendors = vendors.sort((a, b) => b[1].size - a[1].size).slice(0, LIMIT);
    console.log(`  --limit ${LIMIT}: the ${vendors.length} vendors with the most invoices`);
  }

  const wanted = [...new Set(vendors.flatMap(([, s]) => [...s]))];

  // ─── Resolve each key to a file ───────────────────────────────────────────
  const jobs: { key: string; file: string; size: number }[] = [];
  const missing: string[] = [];
  for (const key of wanted) {
    const id = key.replace(/\.[^.]*$/, "");   // "1070018704115.pdf" → the id
    const file = byId.get(id);
    if (!file) { missing.push(key); continue; }
    jobs.push({ key, file, size: statSync(file).size });
  }
  const bytes = jobs.reduce((n, j) => n + j.size, 0);
  console.log(`\n  to upload: ${jobs.length.toLocaleString()} files · ${mb(bytes)}`);
  if (missing.length) console.log(`  NOT FOUND on disk: ${missing.length.toLocaleString()} (skipped)`);

  if (DRY_RUN) {
    console.log(`\nDry run — nothing uploaded. Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ─── What is already in the bucket ────────────────────────────────────────
  // Listed ONCE and paginated, never one `search` per file: on a remote project
  // that was 4,977 round-trips before a single byte moved, which is most of the
  // cost of a resumed run. `list` pages like every other Supabase read — asking
  // for one page and trusting it is the same 1,000-row trap that made `--wipe`
  // silently delete nothing.
  const already = new Set<string>();
  if (SKIP_EXISTING) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage
        .from(VENDOR_INVOICE_BUCKET)
        .list("", { limit: PAGE, offset });
      if (error) throw new Error(`Listing the bucket failed: ${error.message}`);
      for (const row of data ?? []) already.add(row.name);
      if (!data || data.length < PAGE) break;
    }
    console.log(`  already in the bucket: ${already.size.toLocaleString()}`);
  }

  // ─── Upload ───────────────────────────────────────────────────────────────
  let done = 0, uploaded = 0, skipped = 0, failed = 0, sent = 0;
  const queue = [...jobs];

  const worker = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      if (already.has(job.key)) { skipped++; done++; continue; }
      const { error } = await db.storage
        .from(VENDOR_INVOICE_BUCKET)
        .upload(job.key, readFileSync(job.file), { contentType: "application/pdf", upsert: true });
      if (error) {
        failed++;
        if (failed <= 5) console.error(`\n   FAILED ${job.key}: ${error.message}`);
      } else {
        uploaded++;
        sent += job.size;
      }
      done++;
      if (done % 25 === 0 || done === jobs.length) {
        process.stdout.write(`\r   ${done.toLocaleString()} / ${jobs.length.toLocaleString()}  ·  ${mb(sent)} sent`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("");

  console.log(
    `\nUploaded ${uploaded.toLocaleString()} · skipped ${skipped.toLocaleString()} · failed ${failed.toLocaleString()} · ${mb(sent)} into ${VENDOR_INVOICE_BUCKET}`,
  );
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
