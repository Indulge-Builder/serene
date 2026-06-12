/**
 * Seed Call Intelligence content — service_cases + conversation_hooks.
 *
 * Source: scripts/data/call-intelligence-seed.json
 *   (Freshdesk ticket export Jan 2023 – Jun 2026, 37,225 resolved tickets,
 *    curated to 150 cases + 30 hooks by the team — this IS the verified
 *    content the worksheet gate in docs/modules/call-intelligence.md asked for.)
 *
 * Safety:
 *  - Aborts if the target domain already has rows in either table.
 *    Pass --force to delete the domain's existing rows and reseed.
 *  - Validates every row against the migration-0110 contract before any write.
 *  - Deletes the helpdesk Redis envelope (helpdesk:cases:<domain>) after the
 *    insert so /helpdesk never serves a stale empty library for up to 1 hour.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-call-intelligence.ts [--force]
 */

import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const FORCE = process.argv.includes("--force");

// ─── Load + validate ──────────────────────────────────────────────────────────

type SeedCase = {
  id: string;
  domain: string;
  category: string;
  title: string;
  summary: string;
  outcome_note: string | null;
  city: string | null;
  country: string | null;
  tags: string[];
  is_featured: boolean;
  sort_order: number;
};

type SeedHook = {
  id: string;
  domain: string;
  category: string;
  hook: string;
  context: string | null;
  sort_order: number;
};

type SeedFile = {
  meta: { domain: string; categories: string[]; case_count: number; hook_count: number };
  serviceCases: SeedCase[];
  conversationHooks: SeedHook[];
};

const raw: SeedFile = JSON.parse(
  readFileSync(join(__dirname, "data", "call-intelligence-seed.json"), "utf8"),
);

const { meta, serviceCases, conversationHooks } = raw;
const DOMAIN = meta.domain;
const CATEGORIES = new Set(meta.categories);

const errors: string[] = [];

if (serviceCases.length !== meta.case_count)
  errors.push(`case_count mismatch: meta says ${meta.case_count}, file has ${serviceCases.length}`);
if (conversationHooks.length !== meta.hook_count)
  errors.push(`hook_count mismatch: meta says ${meta.hook_count}, file has ${conversationHooks.length}`);

for (const c of serviceCases) {
  const where = `case ${c.id}`;
  if (c.domain !== DOMAIN) errors.push(`${where}: domain '${c.domain}' != meta domain '${DOMAIN}'`);
  if (!CATEGORIES.has(c.category)) errors.push(`${where}: unknown category '${c.category}'`);
  if (!c.title?.trim()) errors.push(`${where}: empty title`);
  if (!c.summary?.trim()) errors.push(`${where}: empty summary`);
  if (!Array.isArray(c.tags) || c.tags.length === 0) errors.push(`${where}: no tags`);
  // Migration 0110 contract: every case with a city carries it as a lowercase
  // slug tag — the dossier city match depends on it.
  if (c.city) {
    const slug = c.city.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!c.tags.includes(slug))
      errors.push(`${where}: city '${c.city}' has no matching slug tag '${slug}'`);
  }
}

for (const h of conversationHooks) {
  const where = `hook ${h.id}`;
  if (h.domain !== DOMAIN) errors.push(`${where}: domain '${h.domain}' != meta domain '${DOMAIN}'`);
  if (!CATEGORIES.has(h.category)) errors.push(`${where}: unknown category '${h.category}'`);
  if (!h.hook?.trim()) errors.push(`${where}: empty hook`);
}

if (errors.length) {
  console.error(`Validation failed (${errors.length}):`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}

console.log(
  `Validated ${serviceCases.length} cases + ${conversationHooks.length} hooks for domain '${DOMAIN}'.`,
);

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  // Idempotency guard — never double-seed.
  const [{ count: caseCount, error: ce }, { count: hookCount, error: he }] = await Promise.all([
    supabase.from("service_cases").select("id", { count: "exact", head: true }).eq("domain", DOMAIN),
    supabase.from("conversation_hooks").select("id", { count: "exact", head: true }).eq("domain", DOMAIN),
  ]);
  if (ce || he) throw ce ?? he;

  if ((caseCount ?? 0) > 0 || (hookCount ?? 0) > 0) {
    if (!FORCE) {
      console.error(
        `Domain '${DOMAIN}' already has ${caseCount} cases and ${hookCount} hooks. ` +
          "Re-run with --force to delete and reseed.",
      );
      process.exit(1);
    }
    console.log(`--force: deleting ${caseCount} cases and ${hookCount} hooks for '${DOMAIN}'…`);
    const [dc, dh] = await Promise.all([
      supabase.from("service_cases").delete().eq("domain", DOMAIN),
      supabase.from("conversation_hooks").delete().eq("domain", DOMAIN),
    ]);
    if (dc.error || dh.error) throw dc.error ?? dh.error;
  }

  // JSON ids ("case-travel-001") are worksheet references, not uuids — the DB
  // generates its own primary keys.
  const caseRows = serviceCases.map(({ id: _id, ...rest }) => rest);
  const hookRows = conversationHooks.map(({ id: _id, ...rest }) => rest);

  for (let i = 0; i < caseRows.length; i += 50) {
    const batch = caseRows.slice(i, i + 50);
    const { error } = await supabase.from("service_cases").insert(batch);
    if (error) throw new Error(`service_cases batch at ${i}: ${error.message}`);
    console.log(`  service_cases: inserted ${Math.min(i + 50, caseRows.length)}/${caseRows.length}`);
  }

  const { error: hookErr } = await supabase.from("conversation_hooks").insert(hookRows);
  if (hookErr) throw new Error(`conversation_hooks insert: ${hookErr.message}`);
  console.log(`  conversation_hooks: inserted ${hookRows.length}/${hookRows.length}`);

  // Invalidate the helpdesk envelope so /helpdesk picks the library up now,
  // not after the 1-hour TTL. Key shape from src/lib/constants/redis-keys.ts.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      await Redis.fromEnv().del(`helpdesk:cases:${DOMAIN}`);
      console.log(`  redis: deleted helpdesk:cases:${DOMAIN}`);
    } catch (e) {
      console.warn("  redis del failed (non-fatal — 1hr TTL will expire it):", e);
    }
  } else {
    console.warn("  redis env vars absent — skipped invalidation (1hr TTL applies)");
  }

  // Verify.
  const [{ count: fc }, { count: fh }] = await Promise.all([
    supabase.from("service_cases").select("id", { count: "exact", head: true }).eq("domain", DOMAIN),
    supabase.from("conversation_hooks").select("id", { count: "exact", head: true }).eq("domain", DOMAIN),
  ]);
  console.log(`Done. DB now holds ${fc} cases and ${fh} hooks for '${DOMAIN}'.`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
