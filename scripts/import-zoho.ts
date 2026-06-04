/**
 * Full import script — four sources, one run.
 *
 * Order:
 *   1. house-leads   (real UUIDs, timestamps already UTC+00 → passthrough)
 *   2. house-notes   (lead_id = real UUID, timestamps already UTC+00 → passthrough)
 *   3. zoho-leads    (lead_id = zcrm_*, timestamps are bare IST → istToUtc)
 *   4. zoho-notes    (lead_id = zcrm_* → resolved via map built in step 3)
 *
 * Run: npx tsx scripts/import-zoho.ts
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Zoho CSV timestamps are bare IST wall-clock (no offset). Convert to UTC.
function istToUtc(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "+05:30");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// House CSV timestamps already have +00 offset — pass through as-is.
function passUtc(raw: string | undefined): string | null {
  return raw?.trim() || null;
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

async function insertNoteBatches(
  rows: object[],
  label: string,
): Promise<number> {
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

async function insertActivityBatches(
  rows: object[],
  label: string,
): Promise<number> {
  const BATCH = 200;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("lead_activities").insert(batch);
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
  // ── 1. House leads ──────────────────────────────────────────────────────────
  // Exported directly from our DB — UUIDs and timestamps are already correct.

  const houseLeadsRaw = loadCsv("house-leads.csv");
  console.log(`\nLoaded ${houseLeadsRaw.length} house leads`);

  const houseLeadInserts = houseLeadsRaw.map((r) => ({
    id:                r.id,
    first_name:        r.first_name?.trim() || "Unknown",
    last_name:         nullIfEmpty(r.last_name),
    phone:             nullIfEmpty(r.phone),
    email:             nullIfEmpty(r.email),
    domain:            r.domain?.trim(),
    assigned_to:       nullIfEmpty(r.assigned_to),
    assigned_at:       passUtc(r.assigned_at),
    status:            normaliseStatus(r.status),
    lead_intent:       nullIfEmpty(r.lead_intent),
    source:            nullIfEmpty(r.source),
    medium:            nullIfEmpty(r.medium),
    utm_campaign:      nullIfEmpty(r.utm_campaign),
    form_data:         parseJson(r.form_data) ?? {},
    call_count:        parseInt(r.call_count, 10) || 0,
    last_call_outcome: normaliseOutcome(r.last_call_outcome),
    personal_details:  parseJson(r.personal_details),
    status_changed_at: passUtc(r.status_changed_at),
    last_activity_at:  passUtc(r.last_activity_at),
    deal_amount:       nullIfEmpty(r.deal_amount) ? parseFloat(r.deal_amount) : null,
    deal_type:         nullIfEmpty(r.deal_type),
    deal_duration:     nullIfEmpty(r.deal_duration),
    slug:              nullIfEmpty(r.slug),
    resolution_reason: nullIfEmpty(r.resolution_reason),
    attribution:       parseJson(r.attribution),
    city:              nullIfEmpty(r.city),
    created_at:        passUtc(r.created_at),
    updated_at:        passUtc(r.updated_at),
  }));

  await insertLeadBatches(houseLeadInserts, "House leads");

  // ── 2. House notes ──────────────────────────────────────────────────────────
  // lead_id references real UUIDs inserted above. Timestamps already UTC.

  const houseNotesRaw = loadCsv("house-notes.csv");
  console.log(`\nLoaded ${houseNotesRaw.length} house notes`);

  const houseNoteInserts = houseNotesRaw.map((r) => ({
    id:           r.id,
    lead_id:      r.lead_id?.trim(),
    author_id:    r.author_id?.trim(),
    content:      r.content?.trim() || "(empty)",
    call_outcome: normaliseOutcome(r.call_outcome),
    created_at:   passUtc(r.created_at),
  }));

  await insertNoteBatches(houseNoteInserts, "House notes");

  // ── 3. House activities ─────────────────────────────────────────────────────
  // Exported from our DB — UUIDs and timestamps already correct UTC+00.

  const houseActivitiesRaw = loadCsv("house-lead-activites.csv");
  console.log(`\nLoaded ${houseActivitiesRaw.length} house activities`);

  const houseActivityInserts = houseActivitiesRaw.map((r) => ({
    id:          r.id,
    lead_id:     r.lead_id?.trim(),
    actor_id:    r.actor_id?.trim(),
    action_type: r.action_type?.trim(),
    details:     parseJson(r.details) ?? {},
    created_at:  passUtc(r.created_at),
  }));

  await insertActivityBatches(houseActivityInserts, "House activities");

  // ── 5. Zoho leads ───────────────────────────────────────────────────────────
  // lead_id = zcrm_* (not a UUID). Timestamps are bare IST → convert to UTC.
  // assigned_to = agent full name in Zoho → resolve to UUID via profiles.

  const zohoLeadsRaw = loadCsv("zoho-leads.csv");
  console.log(`\nLoaded ${zohoLeadsRaw.length} Zoho leads`);

  // Build name → UUID map from profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name");
  if (profilesError) { console.error("Failed to fetch profiles:", profilesError.message); process.exit(1); }
  const nameToUuid = new Map<string, string>(
    (profiles ?? []).map((p: { id: string; full_name: string }) => [p.full_name.trim(), p.id])
  );

  const zohoToUuid = new Map<string, string>();

  const zohoLeadInserts = zohoLeadsRaw.map((r) => {
    const formData = parseJson(r.form_data) ?? {};
    formData._zoho_id = r.lead_id;
    const assignedName = r.assigned_to?.trim();
    const assignedUuid = assignedName ? (nameToUuid.get(assignedName) ?? null) : null;
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

  await insertLeadBatches(zohoLeadInserts, "Zoho leads", (row) => {
    const fd = row.form_data as Record<string, unknown> | null;
    if (fd?._zoho_id) zohoToUuid.set(fd._zoho_id as string, row.id);
  });

  console.log(`Zoho UUID map size: ${zohoToUuid.size}`);

  // ── 6. Zoho notes ───────────────────────────────────────────────────────────
  // lead_id = zcrm_* → resolve via map. Timestamps bare IST → convert to UTC.

  const zohoNotesRaw = loadCsv("zoho-notes.csv");
  console.log(`\nLoaded ${zohoNotesRaw.length} Zoho notes`);

  let zohoNoteSkipped = 0;
  const zohoNoteInserts: object[] = [];

  for (const r of zohoNotesRaw) {
    const leadUuid = zohoToUuid.get(r.lead_id?.trim());
    if (!leadUuid) { zohoNoteSkipped++; continue; }
    zohoNoteInserts.push({
      author_id:    r.author_id?.trim(),
      content:      r.content?.trim() || "(empty)",
      lead_id:      leadUuid,
      call_outcome: normaliseOutcome(r.call_outcome ?? ''),
      created_at:   istToUtc(r.created_at),
    });
  }

  console.log(`Zoho notes skipped (no matching lead): ${zohoNoteSkipped}`);
  await insertNoteBatches(zohoNoteInserts, "Zoho notes");

  console.log("\nAll imports complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
