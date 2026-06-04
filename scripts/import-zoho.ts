/**
 * Zoho CRM → Eia import script
 *
 * Reads scripts/data/zoho-leads.csv and scripts/data/zoho-notes.csv,
 * inserts all leads then all notes (respecting the FK).
 *
 * Run: npx tsx scripts/import-zoho.ts
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Status / outcome normalisation ──────────────────────────────────────────

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
};

function normaliseStatus(raw: string): string {
  return STATUS_MAP[raw.trim()] ?? "new";
}

function normaliseOutcome(raw: string): string | null {
  if (!raw.trim()) return null;
  return OUTCOME_MAP[raw.trim()] ?? null;
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function nullIfEmpty(v: string): string | null {
  return v.trim() || null;
}

// ─── Load CSVs ───────────────────────────────────────────────────────────────

const dataDir = join(__dirname, "data");

const leadsRaw: Record<string, string>[] = parse(
  readFileSync(join(dataDir, "zoho-leads.csv")),
  { columns: true, skip_empty_lines: true, relax_column_count: true },
);

const notesRaw: Record<string, string>[] = parse(
  readFileSync(join(dataDir, "zoho-notes.csv")),
  { columns: true, skip_empty_lines: true, relax_column_count: true },
);

console.log(`Loaded ${leadsRaw.length} leads, ${notesRaw.length} notes`);

async function main() {

// ─── Insert leads in batches ──────────────────────────────────────────────────

// zoho_id → inserted UUID
const zohoToUuid = new Map<string, string>();

const LEAD_BATCH = 100;
let leadErrors = 0;

for (let i = 0; i < leadsRaw.length; i += LEAD_BATCH) {
  const batch = leadsRaw.slice(i, i + LEAD_BATCH);

  const inserts = batch.map((r) => {
    const formData = parseJson(r.form_data) ?? {};
    // Store the original Zoho ID so we can trace the record
    formData._zoho_id = r.lead_id;

    return {
      first_name:        r.first_name.trim() || "Unknown",
      last_name:         nullIfEmpty(r.last_name),
      phone:             nullIfEmpty(r.phone),
      email:             nullIfEmpty(r.email),
      status:            normaliseStatus(r.status),
      last_call_outcome: normaliseOutcome(r.last_call_outcome),
      assigned_to:       nullIfEmpty(r.assigned_to),
      assigned_at:       nullIfEmpty(r.assigned_to) ? (nullIfEmpty(r.created_at) ?? undefined) : null,
      domain:            r.domain.trim(),
      form_data:         formData,
      utm_campaign:      nullIfEmpty(r.utm_campaign),
      source:            nullIfEmpty(r.source),
      medium:            nullIfEmpty(r.medium),
      call_count:        parseInt(r.call_count, 10) || 0,
      personal_details:  parseJson(r.personal_details),
      city:              nullIfEmpty(r.city),
      created_at:        nullIfEmpty(r.created_at) ?? undefined,
      updated_at:        nullIfEmpty(r.updated_at) ?? undefined,
      last_activity_at:  nullIfEmpty(r.last_activity_at),
    };
  });

  const { data, error } = await supabase
    .from("leads")
    .insert(inserts)
    .select("id, form_data");

  if (error) {
    console.error(`Batch ${i / LEAD_BATCH + 1} error:`, error.message);
    leadErrors += batch.length;
    continue;
  }

  for (const row of data ?? []) {
    const fd = row.form_data as Record<string, unknown> | null;
    if (fd?._zoho_id) {
      zohoToUuid.set(fd._zoho_id as string, row.id);
    }
  }

  process.stdout.write(`\rLeads inserted: ${Math.min(i + LEAD_BATCH, leadsRaw.length)} / ${leadsRaw.length}`);
}

console.log(`\nLead import done. Errors: ${leadErrors}`);
console.log(`UUID map size: ${zohoToUuid.size}`);

// ─── Insert notes in batches ──────────────────────────────────────────────────

const NOTE_BATCH = 200;
let noteErrors = 0;
let noteSkipped = 0;

for (let i = 0; i < notesRaw.length; i += NOTE_BATCH) {
  const batch = notesRaw.slice(i, i + NOTE_BATCH);

  const inserts: {
    author_id: string;
    content: string;
    lead_id: string;
    created_at?: string;
  }[] = [];

  for (const r of batch) {
    const leadUuid = zohoToUuid.get(r.lead_id.trim());
    if (!leadUuid) {
      noteSkipped++;
      continue;
    }
    inserts.push({
      author_id:  r.author_id.trim(),
      content:    r.content.trim() || "(empty)",
      lead_id:    leadUuid,
      created_at: nullIfEmpty(r.created_at) ?? undefined,
    });
  }

  if (inserts.length === 0) continue;

  const { error } = await supabase.from("lead_notes").insert(inserts);

  if (error) {
    console.error(`Notes batch ${i / NOTE_BATCH + 1} error:`, error.message);
    noteErrors += inserts.length;
    continue;
  }

  process.stdout.write(`\rNotes inserted: ${Math.min(i + NOTE_BATCH, notesRaw.length)} / ${notesRaw.length}`);
}

console.log(`\nNotes import done. Skipped (no matching lead): ${noteSkipped}. Errors: ${noteErrors}`);
console.log("Import complete.");

} // end main

main().catch((err) => { console.error(err); process.exit(1); });
