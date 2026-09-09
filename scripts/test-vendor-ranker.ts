/**
 * Exercise the real vendor read path against the local database.
 *
 * Imports the ACTUAL service functions (not a copy), so this proves the code
 * that the UI and Elaya will call — the capability filter, the score rollup,
 * the score math and the agent preference layer — works end to end on real rows.
 *
 * Local only: it uses the admin client, so it inherits whatever
 * NEXT_PUBLIC_SUPABASE_URL points at. Run it after `supabase start` with a
 * seeded database.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-vendor-ranker.ts
 */

import {
  rankVendorsForRequest,
  getVendorDetail,
  searchVendors,
} from "@/lib/services/vendors-service";

/** A score is null until someone has judged the vendor — never print it as 0. */
const fmt = (v: number | null): string => (v == null ? "   —" : v.toFixed(1).padStart(4));

const host = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING TO RUN — not a local database (host "${host}").`);
  process.exit(1);
}

const line = (s: string) => console.log(`\n${"─".repeat(78)}\n${s}\n${"─".repeat(78)}`);

async function main() {
  line("1. Search — trigram name match");
  const found = await searchVendors({ query: "travel", limit: 5 });
  for (const v of found) console.log(`  ${v.name.padEnd(32)} ${v.category ?? "-"}  ${v.status}`);
  const alias = await searchVendors({ query: "Wander Lux Travels", limit: 3 });
  console.log(`  alias lookup "Wander Lux Travels" → ${alias.map((v) => v.name).join(", ") || "(none)"}`);

  line("2. Rank — travel in Delhi");
  const ranked = await rankVendorsForRequest({ category: "travel", city: "delhi", limit: 5 });
  if (!ranked.length) console.log("  (no candidates)");
  for (const r of ranked) {
    console.log(`\n  ${fmt(r.score)}  ${r.vendor.name}`);
    for (const reason of r.reasons) console.log(`         · ${reason}`);
    for (const flag of r.flags) console.log(`         ! ${flag}`);
  }

  line("3. Rank — travel + visa (the declines filter must bite)");
  const visa = await rankVendorsForRequest({ category: "travel", service: "visa", limit: 5 });
  for (const r of visa) console.log(`  ${fmt(r.score)}  ${r.vendor.name}`);
  console.log(`\n  Skyline Aviation declines visa → ${visa.some((r) => r.vendor.name === "Skyline Aviation") ? "STILL PRESENT (bug)" : "correctly excluded"}`);

  line("4. Paused / blacklisted vendors must never rank");
  const retail = await rankVendorsForRequest({ category: "retail", limit: 10 });
  const names = retail.map((r) => r.vendor.name);
  console.log(`  retail candidates: ${names.join(", ") || "(none)"}`);
  console.log(`  Halcyon (paused)      → ${names.includes("Halcyon Concierge Supply") ? "PRESENT (bug)" : "correctly excluded"}`);
  console.log(`  Orion (blacklisted)   → ${names.includes("Orion Logistics") ? "PRESENT (bug)" : "correctly excluded"}`);

  line("5. Dossier — one vendor in full");
  const fallback = ranked.length ? null : (await searchVendors({ limit: 1 }))[0];
  const top = ranked[0] ?? (fallback ? { vendor: fallback } : null);
  if (top) {
    const detail = await getVendorDetail(top.vendor.id);
    if (detail) {
      console.log(`  ${detail.vendor.name}  —  score ${fmt(detail.score.score)}/10`);
      console.log(`  status ${detail.vendor.status} · ${detail.vendor.home_city} · ${detail.vendor.primary_phone}`);
      console.log(`  capabilities ${detail.capabilities.length} · jobs shown ${detail.engagements.length} · reviews ${detail.reviews.length}`);
      console.log(`  score breakdown:`);
      for (const [k, v] of Object.entries(detail.score.breakdown)) {
        console.log(`    ${k.padEnd(12)} ${v === null ? "— (no data, dropped from the score)" : v.toFixed(2)}`);
      }
      const open = detail.engagements.filter((e) => e.closed_at === null).length;
      console.log(`  open (unclosed) jobs in view: ${open}`);
    }
  }

  line("6. A vendor with no history — components must be dropped, not faked");
  const fresh = (await searchVendors({ query: "Newleaf", limit: 1 }))[0];
  if (fresh) {
    const d = await getVendorDetail(fresh.id);
    if (d) {
      console.log(`  ${d.vendor.name} → score ${fmt(d.score.score)}`);
      console.log(`  breakdown: ${JSON.stringify(d.score.breakdown)}`);
      console.log(`  reasons: ${d.score.reasons.join(" | ")}`);
    }
  }

  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
