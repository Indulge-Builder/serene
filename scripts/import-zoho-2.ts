/**
 * Import batch 2 — "zoho - lead 2.csv" + "zoho - notes 2.csv"
 *
 * Differences from the original import-zoho.ts:
 *  - assigned_to in leads = agent full name (same as original)
 *  - author_id in notes   = agent full name (NOT UUID — must resolve)
 *  - "Samson Fernandes" in CSV maps to DB profile "Samson"
 *  - Timestamps are bare IST wall-clock → convert to UTC
 *
 * Run: npx tsx scripts/import-zoho-2.ts
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  new:           "new",
  touched:       "touched",
  in_discussion: "in_discussion",
  Qualified:     "in_discussion",
  Nurturing:     "nurturing",
  nurturing:     "nurturing",
  won:           "won",
  lost:          "lost",
  junk:          "junk",
};

const OUTCOME_MAP: Record<string, string> = {
  rnr:          "rnr",
  switched_off: "switched_off",
  wrong_number: "wrong_number",
  conversing:   "conversing",
  Junk:         "junk",
  junk:         "junk",
  other:        "other",
};

// Names in Zoho CSVs that differ from the profile full_name in DB
const NAME_ALIASES: Record<string, string> = {
  "Samson Fernandes": "Samson",
};

function normaliseStatus(raw: string): string {
  return STATUS_MAP[raw.trim()] ?? "new";
}

function normaliseOutcome(raw: string): string | null {
  if (!raw.trim()) return null;
  return OUTCOME_MAP[raw.trim()] ?? null;
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function nullIfEmpty(v: string | undefined): string | null {
  return v?.trim() || null;
}

// Zoho timestamps are bare IST wall-clock (no offset). Convert to UTC.
function istToUtc(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "+05:30");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function loadCsv(filename: string): Record<string, string>[] {
  return parse(readFileSync(join(__dirname, "data", filename)), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

async function insertLeadBatches(
  rows: object[],
  label: string,
  onRow?: (inserted: { id: string; form_data: unknown }) => void,
): Promise<number> {
  const BATCH = 100;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase.from("leads").insert(batch).select("id, form_data");
    if (error) {
      console.error(`\n${label} batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      for (const row of data ?? []) onRow?.(row as { id: string; form_data: unknown });
    }
    process.stdout.write(`\r${label}: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`\n${label} done. Errors: ${errors}`);
  return errors;
}

async function insertNoteBatches(rows: object[], label: string): Promise<number> {
  const BATCH = 200;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("lead_notes").insert(batch);
    if (error) {
      console.error(`\n${label} batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    }
    process.stdout.write(`\r${label}: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`\n${label} done. Errors: ${errors}`);
  return errors;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Build name → UUID map from profiles (includes alias resolution)
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name");
  if (profilesError) {
    console.error("Failed to fetch profiles:", profilesError.message);
    process.exit(1);
  }

  const nameToUuid = new Map<string, string>(
    (profiles ?? []).map((p: { id: string; full_name: string }) => [p.full_name.trim(), p.id])
  );

  // Register aliases — Zoho name → canonical DB name → UUID
  for (const [zohoName, dbName] of Object.entries(NAME_ALIASES)) {
    const uuid = nameToUuid.get(dbName);
    if (uuid) {
      nameToUuid.set(zohoName, uuid);
      console.log(`Alias registered: "${zohoName}" → "${dbName}" (${uuid})`);
    } else {
      console.warn(`WARNING: alias target "${dbName}" not found in profiles`);
    }
  }

  console.log(`\nProfile map: ${nameToUuid.size} entries`);

  // ── Zoho leads (batch 2) ──────────────────────────────────────────────────
  const zohoLeadsRaw = loadCsv("zoho - lead 2.csv");
  console.log(`\nLoaded ${zohoLeadsRaw.length} Zoho leads (batch 2)`);

  const zohoToUuid = new Map<string, string>();
  let unmappedAgents = new Set<string>();

  const zohoLeadInserts = zohoLeadsRaw.map((r) => {
    const formData = parseJson(r.form_data) ?? {};
    formData._zoho_id = r.lead_id;

    const assignedName = r.assigned_to?.trim();
    const assignedUuid = assignedName ? (nameToUuid.get(assignedName) ?? null) : null;
    if (assignedName && !assignedUuid) unmappedAgents.add(assignedName);

    return {
      first_name:        r.first_name?.trim() || "Unknown",
      last_name:         nullIfEmpty(r.last_name),
      phone:             nullIfEmpty(r.phone),
      email:             nullIfEmpty(r.email),
      domain:            r.domain?.trim(),
      assigned_to:       assignedUuid,
      assigned_at:       assignedUuid ? istToUtc(r.created_at) : null,
      status:            normaliseStatus(r.status),
      source:            nullIfEmpty(r.source),
      medium:            nullIfEmpty(r.medium),
      utm_campaign:      nullIfEmpty(r.utm_campaign),
      form_data:         formData,
      call_count:        parseInt(r.call_count, 10) || 0,
      last_call_outcome: normaliseOutcome(r.last_call_outcome),
      personal_details:  parseJson(r.personal_details),
      last_activity_at:  istToUtc(r.last_activity_at),
      resolution_reason: nullIfEmpty(r.resolution_reason),
      city:              nullIfEmpty(r.city),
      created_at:        istToUtc(r.created_at),
      updated_at:        istToUtc(r.updated_at),
    };
  });

  if (unmappedAgents.size > 0) {
    console.warn(`\nWARNING: ${unmappedAgents.size} agent name(s) not found in profiles (will be assigned_to=null):`);
    for (const name of unmappedAgents) console.warn(`  - "${name}"`);
  }

  await insertLeadBatches(zohoLeadInserts, "Zoho leads batch 2", (row) => {
    const fd = row.form_data as Record<string, unknown> | null;
    if (fd?._zoho_id) zohoToUuid.set(fd._zoho_id as string, row.id);
  });

  console.log(`Zoho UUID map size: ${zohoToUuid.size}`);

  // ── Zoho notes (batch 2) ──────────────────────────────────────────────────
  // author_id in this file = agent full name (not UUID) — must resolve.
  const zohoNotesRaw = loadCsv("zoho - notes 2.csv");
  console.log(`\nLoaded ${zohoNotesRaw.length} Zoho notes (batch 2)`);

  let noteSkippedNoLead = 0;
  let noteSkippedNoAuthor = 0;
  const zohoNoteInserts: object[] = [];

  for (const r of zohoNotesRaw) {
    const leadUuid = zohoToUuid.get(r.lead_id?.trim());
    if (!leadUuid) {
      noteSkippedNoLead++;
      console.warn(`  Note skipped — no matching lead for zoho_id: ${r.lead_id}`);
      continue;
    }

    const authorName = r.author_id?.trim();
    const authorUuid = authorName ? (nameToUuid.get(authorName) ?? null) : null;
    if (authorName && !authorUuid) {
      noteSkippedNoAuthor++;
      console.warn(`  Note skipped — author "${authorName}" not found in profiles (lead: ${r.lead_id})`);
      continue;
    }

    zohoNoteInserts.push({
      author_id:    authorUuid,
      content:      r.content?.trim() || "(empty)",
      lead_id:      leadUuid,
      call_outcome: normaliseOutcome(r.call_outcome ?? ""),
      created_at:   istToUtc(r.created_at),
    });
  }

  console.log(`Notes skipped (no matching lead):   ${noteSkippedNoLead}`);
  console.log(`Notes skipped (author not in DB):   ${noteSkippedNoAuthor}`);
  await insertNoteBatches(zohoNoteInserts, "Zoho notes batch 2");

  console.log("\nAll imports complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
