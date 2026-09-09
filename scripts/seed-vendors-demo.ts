/**
 * Seed DEMO vendor data — local development only.
 *
 * Fills the five vendor tables (migrations 0182–0184) with made-up but
 * realistic data so the vendor reads, the score and the ranker can be exercised
 * before the real Freshdesk loader exists. This is NOT the loader; it invents
 * every row. Delete the data with --force when the real import lands.
 *
 * SAFETY — this script refuses to run against anything but a local database.
 *   1. NEXT_PUBLIC_SUPABASE_URL must be localhost / 127.0.0.1. Pointing at a
 *      remote project aborts before a single row is written. There is no flag
 *      to override this.
 *   2. Without --force it aborts if any demo rows already exist.
 *   3. --force deletes ONLY rows this script created (import_raw.seed tag /
 *      their vendor ids). It never touches a row it did not write.
 *
 * Every vendor carries `import_raw = { seed: 'demo-v1' }`, which is how --force
 * finds them again. Real vendors never carry that key.
 *
 * The data deliberately covers the edges the score and ranker care about:
 *   - a vendor with NO history at all (score drops the components with no data)
 *   - an engagement older than the 12-month window (must be excluded)
 *   - open engagements, closed_at null (closeEngagementAction is testable)
 *   - a reviewer who changed their mind on one job (latest-per-reviewer wins)
 *   - a paused and a blacklisted vendor (must never be ranked)
 *   - `declines` capabilities (must be hard-excluded for that category/service)
 *   - preferred / avoid preferences (the ranker's agent layer)
 *
 * Run (after `supabase start`):
 *   npx tsx --env-file=.env.local scripts/seed-vendors-demo.ts [--force]
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { VENDOR_INVOICE_BUCKET } from "../src/lib/constants/vendors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SEED_TAG = "demo-v1";
const FORCE = process.argv.includes("--force");

// ─── Guard 1: local only, no override ────────────────────────────────────────
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const host = (() => {
  try { return new URL(SUPABASE_URL).hostname; } catch { return ""; }
})();
if (host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0") {
  console.error(
    `REFUSING TO RUN.\n` +
      `  NEXT_PUBLIC_SUPABASE_URL points at "${host}", which is not a local database.\n` +
      `  This script only ever runs against a local Supabase (supabase start).\n` +
      `  Nothing was written.`,
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── Deterministic RNG, so a reseed produces identical data ──────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260905);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// ─── The demo vendors ────────────────────────────────────────────────────────
// `grade` drives how the generated history looks: how many jobs, how often they
// went well, and how the team rates them. It is not stored anywhere.
type Grade = "excellent" | "good" | "mixed" | "poor";
type Seed = {
  name: string;
  category: string;
  subcategory?: string;
  city: string;
  services: string[];          // capabilities: offers
  declines?: string[];         // capabilities: declines (same category)
  status?: "active" | "paused" | "blacklisted";
  grade: Grade;
  jobs: number;                // how many engagements to generate
  aliases?: string[];
};

const VENDORS: Seed[] = [
  { name: "Wanderlux Travel Desk",   category: "travel", subcategory: "Full service", city: "delhi",     services: ["visa", "flights", "hotel"], grade: "excellent", jobs: 14, aliases: ["Wanderlux", "Wander Lux Travels"] },
  { name: "Skyline Aviation",        category: "travel", subcategory: "Private aviation", city: "mumbai", services: ["private_jet", "flights"], declines: ["visa"], grade: "good", jobs: 6 },
  { name: "Meridian Visa Services",  category: "travel", subcategory: "Visa only",     city: "delhi",     services: ["visa"], declines: ["hotel", "flights"], grade: "good", jobs: 9 },
  { name: "Coastal Charters Goa",    category: "travel", subcategory: "Yacht",         city: "goa",       services: ["yacht"], grade: "mixed", jobs: 5 },
  { name: "Prestige Chauffeurs",     category: "travel", subcategory: "Ground",        city: "mumbai",    services: ["chauffeur"], grade: "excellent", jobs: 11 },
  { name: "Dune & Palm DMC",         category: "travel", subcategory: "Destination",   city: "dubai",     services: ["hotel", "chauffeur"], grade: "good", jobs: 4 },

  { name: "The Copper Table",        category: "dining", subcategory: "Fine dining",   city: "mumbai",    services: ["reservation"], grade: "excellent", jobs: 12 },
  { name: "Saffron & Salt Catering", category: "dining", subcategory: "Catering",      city: "delhi",     services: ["catering", "private_chef"], grade: "good", jobs: 7 },
  { name: "Chef Aran Private Dining",category: "dining", subcategory: "Private chef",  city: "bengaluru", services: ["private_chef"], declines: ["catering"], grade: "mixed", jobs: 3 },

  { name: "Verdant Florists",        category: "gifts",  subcategory: "Flowers",       city: "delhi",     services: ["flowers", "hamper"], grade: "excellent", jobs: 16 },
  { name: "Maison Gift Atelier",     category: "gifts",  subcategory: "Luxury goods",  city: "mumbai",    services: ["luxury_goods", "hamper"], grade: "good", jobs: 8 },
  { name: "Quickpost Couriers",      category: "gifts",  subcategory: "Delivery",      city: "delhi",     services: ["delivery"], grade: "poor", jobs: 6 },

  { name: "Lumiere Events",          category: "events", subcategory: "Full service",  city: "mumbai",    services: ["venue", "decor", "entertainment"], grade: "excellent", jobs: 10 },
  { name: "Frame & Field Photo",     category: "events", subcategory: "Photography",   city: "bengaluru", services: ["photography"], grade: "good", jobs: 5 },
  { name: "Marquee Venue Partners",  category: "events", subcategory: "Venue",         city: "delhi",     services: ["venue"], declines: ["decor"], grade: "mixed", jobs: 4 },

  { name: "Aurum Sourcing",          category: "retail", subcategory: "Sourcing",      city: "mumbai",    services: ["sourcing", "delivery"], grade: "good", jobs: 9 },
  { name: "Halcyon Concierge Supply",category: "retail", subcategory: "General",       city: "delhi",     services: ["sourcing"], status: "paused", grade: "mixed", jobs: 3 },

  { name: "Sentinel Close Protection", category: "special", subcategory: "Security",   city: "delhi",     services: ["security", "staffing"], grade: "good", jobs: 4 },
  { name: "Medicare Response",       category: "special", subcategory: "Medical",      city: "mumbai",    services: ["medical"], grade: "excellent", jobs: 3 },
  { name: "Orion Logistics",         category: "retail", subcategory: "Delivery",      city: "bengaluru", services: ["delivery"], status: "blacklisted", grade: "poor", jobs: 5 },

  // No history at all — proves the score drops components with no data
  // instead of inventing a neutral value.
  { name: "Newleaf Experiences",     category: "events", subcategory: "New vendor",    city: "goa",       services: ["entertainment"], grade: "good", jobs: 0 },
];

const OUTCOME_MIX: Record<Grade, string[]> = {
  excellent: ["completed", "completed", "completed", "completed", "completed", "completed", "cancelled"],
  good:      ["completed", "completed", "completed", "completed", "cancelled", "unknown"],
  mixed:     ["completed", "completed", "cancelled", "failed", "unknown"],
  poor:      ["completed", "failed", "failed", "cancelled"],
};
const RATING_BAND: Record<Grade, [number, number]> = {
  excellent: [4, 5], good: [3, 5], mixed: [2, 4], poor: [1, 3],
};
const rating = (g: Grade) => {
  const [lo, hi] = RATING_BAND[g];
  return lo + Math.floor(rand() * (hi - lo + 1));
};

async function main() {
  console.log(`Local database: ${SUPABASE_URL}\n`);

  // ─── Profiles are required (reviewer_id and agent_id are NOT NULL) ─────────
  const { data: profiles, error: profileErr } = await db
    .from("profiles").select("id, full_name").eq("is_active", true).limit(10);
  if (profileErr) { console.error("Could not read profiles:", profileErr.message); process.exit(1); }
  if (!profiles?.length) {
    console.error(
      "No profiles found. Create a login first (Studio → Authentication → Add user),\n" +
      "then re-run. Reviews and preferences need a real profile to point at.",
    );
    process.exit(1);
  }
  const staff = profiles as { id: string; full_name: string | null }[];
  console.log(`Using ${staff.length} profile(s) as staff: ${staff.map((s) => s.full_name).join(", ")}\n`);

  // Clients are optional — used for the "worked with this client before" reason.
  const { data: clientRows } = await db.from("clients").select("id").limit(5);
  const clients = (clientRows as { id: string }[] | null) ?? [];

  // ─── Guard 2/3: existing demo rows ────────────────────────────────────────
  const { data: existing } = await db
    .from("vendors").select("id").eq("import_raw->>seed", SEED_TAG);
  const existingIds = ((existing as { id: string }[] | null) ?? []).map((v) => v.id);

  if (existingIds.length && !FORCE) {
    console.error(`${existingIds.length} demo vendors already exist. Re-run with --force to replace them.`);
    process.exit(1);
  }
  if (existingIds.length && FORCE) {
    console.log(`--force: removing ${existingIds.length} previously seeded vendors and their rows...`);
    // FK-safe order. Only ever ids this script created.
    await db.from("vendor_notes").delete().in("vendor_id", existingIds);
    await db.from("vendor_reviews").delete().in("vendor_id", existingIds);
    const { data: oldEng } = await db
      .from("vendor_engagements")
      .select("invoice_paths")
      .in("vendor_id", existingIds);
    const oldPaths = ((oldEng as { invoice_paths: string[] }[] | null) ?? []).flatMap(
      (e) => e.invoice_paths,
    );
    if (oldPaths.length) await db.storage.from(VENDOR_INVOICE_BUCKET).remove(oldPaths);
    await db.from("vendor_engagements").delete().in("vendor_id", existingIds);
    await db.from("vendor_capabilities").delete().in("vendor_id", existingIds);
    const { error } = await db.from("vendors").delete().in("id", existingIds);
    if (error) { console.error("Cleanup failed:", error.message); process.exit(1); }
    console.log("  cleared.\n");
  }

  // ─── Build every row in memory, then insert ───────────────────────────────
  const vendorRows: Record<string, unknown>[] = [];
  const capRows: Record<string, unknown>[] = [];
  const engRows: Record<string, unknown>[] = [];
  const reviewRows: Record<string, unknown>[] = [];
  const noteRows: Record<string, unknown>[] = [];

  for (const v of VENDORS) {
    const id = randomUUID();
    const phone = `+9198${String(10000000 + Math.floor(rand() * 89999999))}`;

    vendorRows.push({
      id,
      name: v.name,
      aliases: v.aliases ?? [],
      category: v.category,
      subcategory: v.subcategory ?? null,
      category_source: "hand",
      status: v.status ?? "active",
      contacts: [
        { name: "Desk", phones: [phone], emails: [`desk@${v.name.toLowerCase().replace(/[^a-z]+/g, "")}.example`] },
        { name: null, phones: [`+9111${String(10000000 + Math.floor(rand() * 89999999))}`], emails: [] },
      ],
      primary_phone: phone,
      home_city: v.city,
      identity_status: "verified",
      freshdesk_ref: null,
      sources: ["manual"],
      import_raw: { seed: SEED_TAG },
      notes: `Demo seed data (${v.grade}). Not a real vendor.`,
    });

    for (const svc of v.services) {
      capRows.push({
        vendor_id: id, category: v.category, service: svc, stance: "offers",
        cities: [v.city], note: null, set_by: staff[0].id,
      });
    }
    // A whole-category offer (service = null) ONLY for genuinely full-service
    // vendors. That row means "offers this entire category", so it matches a
    // request for ANY service in it — giving one to a specialist (a chauffeur
    // company, a florist) would make them a candidate for visas and bouquets
    // alike. Three or more services is the line for "full service" here.
    if (v.services.length >= 3) {
      capRows.push({
        vendor_id: id, category: v.category, service: null, stance: "offers",
        cities: [v.city], note: "Full-service across this category.", set_by: staff[0].id,
      });
    }
    for (const svc of v.declines ?? []) {
      capRows.push({
        vendor_id: id, category: v.category, service: svc, stance: "declines",
        cities: [], note: "Vendor asked not to receive these.", set_by: staff[0].id,
      });
    }

    for (let i = 0; i < v.jobs; i++) {
      const engId = randomUUID();
      // Most jobs inside the 12-month window; the first one deliberately outside it.
      const startedDays = i === 0 && v.jobs > 3 ? 400 : 5 + Math.floor(rand() * 330);
      const open = i === 1 && v.jobs > 4;           // a couple of live, unclosed jobs
      const outcome = open ? "unknown" : pick(OUTCOME_MIX[v.grade]);
      const agent = pick(staff);

      engRows.push({
        id: engId,
        vendor_id: id,
        client_id: clients.length ? pick(clients).id : null,
        lead_id: null,
        agent_id: agent.id,
        agent_name_raw: null,
        category: v.category,
        service: pick(v.services),
        city: v.city,
        source: "manual",
        source_ref: engId,
        started_at: daysAgo(startedDays),
        closed_at: open ? null : daysAgo(Math.max(1, startedDays - 2)),
        outcome,
        amount_inr: open ? null : Math.round((5000 + rand() * 240000) / 100) * 100,
        invoice_paths: open || rand() < 0.35 ? [] : [engId + '.pdf'],
        note: open ? "In progress." : null,
        created_by: agent.id,
      });

      // Roughly half the closed jobs get a review.
      if (!open && rand() < 0.5) {
        const reviewer = pick(staff);
        reviewRows.push({
          vendor_id: id, engagement_id: engId, reviewer_id: reviewer.id,
          speed: rating(v.grade), quality: rating(v.grade),
          pricing: rating(v.grade), reliability: rating(v.grade),
          comment: null, created_at: daysAgo(Math.max(1, startedDays - 3)),
        });
      }
    }

    // Notes — a few vendors carry real commentary, authored by different people.
    if (v.jobs >= 8) {
      const lines = [
        "Prefers WhatsApp over email. The desk contact is the one who actually confirms — go to them directly for anything urgent.",
        "Quoted noticeably above market on the last large order. Worth negotiating up front.",
        `Same-day works in ${v.city} but not elsewhere — needs 24h notice outside it.`,
      ];
      const take = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < take; i++) {
        noteRows.push({
          vendor_id: id,
          author_id: pick(staff).id,
          content: lines[i],
          created_at: daysAgo(2 + i * 11),
        });
      }
    }
  }

  // A reviewer who CHANGED THEIR MIND on one job: two reviews, same reviewer,
  // same engagement. The rollup must count only the later one.
  const firstReviewed = reviewRows[0];
  if (firstReviewed) {
    reviewRows.push({
      ...firstReviewed,
      speed: 5, quality: 5, pricing: 4, reliability: 5,
      comment: "Revising my earlier rating — they fixed it and followed up properly.",
      created_at: daysAgo(1),
    });
  }

  // ─── Insert, parents first ────────────────────────────────────────────────
  const steps: [string, string, Record<string, unknown>[]][] = [
    ["vendors", "vendors", vendorRows],
    ["capabilities", "vendor_capabilities", capRows],
    ["engagements", "vendor_engagements", engRows],
    ["reviews", "vendor_reviews", reviewRows],
    ["notes", "vendor_notes", noteRows],
  ];
  for (const [label, table, rows] of steps) {
    if (!rows.length) { console.log(`  ${label}: nothing to insert`); continue; }
    const { error } = await db.from(table).insert(rows);
    if (error) { console.error(`  ${label}: FAILED — ${error.message}`); process.exit(1); }
    console.log(`  ${label}: ${rows.length} rows`);
  }

  // A minimal valid PDF, uploaded once per invoice path. Without a real object
  // the signed url resolves to a 404 and "Open" cannot be tested.
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF\n",
  );
  const invoicePaths = engRows.flatMap((e) => (e.invoice_paths as string[]) ?? []);
  let uploaded = 0;
  for (const path of invoicePaths) {
    const { error } = await db.storage
      .from(VENDOR_INVOICE_BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) {
      console.error("  invoice upload failed (" + path + "): " + error.message);
      break;
    }
    uploaded++;
  }
  console.log("  invoice files: " + uploaded + " uploaded to " + VENDOR_INVOICE_BUCKET);
  console.log(`\nSeeded. ${vendorRows.length} vendors, ${engRows.length} jobs, ${reviewRows.length} reviews.`);
  console.log(`Remove them any time with: npx tsx --env-file=.env.local scripts/seed-vendors-demo.ts --force`);
}

main().catch((err) => { console.error(err); process.exit(1); });
