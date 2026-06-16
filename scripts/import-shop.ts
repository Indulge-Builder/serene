/**
 * Shop lead import — OVERWRITE the entire `domain='shop'` lead set.
 *
 * Source files (repo root):
 *   shop-leads.csv   — 1 row per lead. Key column `zoho_lead_id` (NOT a UUID).
 *                      `assigned_to` = agent FULL NAME → resolved to profiles.id.
 *                      Timestamps are bare IST wall-clock → converted to UTC.
 *                      `service_interests` = single label → wrapped into text[].
 *                      NO slug / search_text columns — the DB trigger + generated
 *                      column produce those; we never supply them.
 *   shop-notes.csv   — 1 row per note. `zoho_lead_id` links to the lead's
 *                      `zoho_lead_id`. `author_name` = full name → profiles.id.
 *
 * Run order (one transaction-like sequence, guarded):
 *   1. BACKUP  — dump existing shop leads + every child row to scripts/data/backup-shop-<ts>/
 *   2. DELETE  — remove shop child rows then shop leads (FK-safe), domain='shop' ONLY
 *   3. LEADS   — insert new leads, capture zoho_lead_id → new UUID
 *   4. NOTES   — insert new notes, linked via the captured map
 *
 * Usage:
 *   npx tsx scripts/import-shop.ts --dry-run     # validate only, writes NOTHING
 *   npx tsx scripts/import-shop.ts --confirm     # the real destructive run
 *
 * Reverting: scripts/revert-shop-import.ts (restores the backup-shop-<ts> dump).
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");

if (!DRY_RUN && !CONFIRM) {
  console.error(
    "Refusing to run. Pass --dry-run to validate, or --confirm to execute the destructive import.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const ROOT = process.cwd();
const DOMAIN = "shop";

// ─── Value maps ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  new: "new",
  touched: "touched",
  in_discussion: "in_discussion",
  Qualified: "in_discussion",
  Nurturing: "nurturing",
  nurturing: "nurturing",
  won: "won",
  Won: "won",
  Lost: "lost",
  lost: "lost",
  junk: "junk",
  Junk: "junk",
};

const OUTCOME_MAP: Record<string, string> = {
  rnr: "rnr",
  switched_off: "switched_off",
  wrong_number: "wrong_number",
  conversing: "conversing",
  Junk: "junk",
  junk: "junk",
  other: "other",
};

// Note authors in the CSV that don't match a profile full_name 1:1.
// "Admin @ Indulge" → Tech Wizard founder (tech@indulge.global), per the import decision.
const AUTHOR_ALIASES: Record<string, string> = {
  "Admin @ Indulge": "Tech Wizard",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseStatus(raw: string): string {
  const v = (raw ?? "").trim();
  return STATUS_MAP[v] ?? "new";
}

function normaliseOutcome(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  return OUTCOME_MAP[v] ?? null;
}

function parseJson(raw: string | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function nullIfEmpty(v: string | undefined): string | null {
  return v?.trim() || null;
}

// Bare IST wall-clock (no offset) → UTC ISO.
function istToUtc(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "+05:30");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Single service-interest label → text[] (empty → []).
function toInterestArray(raw: string | undefined): string[] {
  const v = (raw ?? "").trim();
  return v ? [v] : [];
}

function loadCsv(filename: string): Record<string, string>[] {
  return parse(readFileSync(join(ROOT, filename)), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
}

async function insertLeadBatches(
  rows: object[],
  onRow: (inserted: { id: string; form_data: unknown }) => void,
): Promise<number> {
  const BATCH = 100;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("leads")
      .insert(batch)
      .select("id, form_data");
    if (error) {
      console.error(`\n  Lead batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      for (const row of data ?? []) onRow(row as { id: string; form_data: unknown });
    }
    process.stdout.write(`\r  Leads: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`\n  Leads done. Errors: ${errors}`);
  return errors;
}

async function insertNoteBatches(rows: object[]): Promise<number> {
  const BATCH = 200;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("lead_notes").insert(batch);
    if (error) {
      console.error(`\n  Note batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    }
    process.stdout.write(`\r  Notes: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`\n  Notes done. Errors: ${errors}`);
  return errors;
}

// ─── Phase 1: Backup ──────────────────────────────────────────────────────────

async function fetchAll(
  table: string,
  filter: (q: any) => any,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(
      supabase.from(table).select("*").range(from, from + PAGE - 1),
    );
    if (error) throw new Error(`backup read ${table}: ${error.message}`);
    out.push(...((data as Record<string, unknown>[]) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Backup as JSON (lossless for jsonb/array/null columns, dependency-free).
// The revert script reads these back verbatim, preserving original PKs.
function writeBackupJson(dir: string, name: string, rows: Record<string, unknown>[]) {
  writeFileSync(join(dir, name), JSON.stringify(rows, null, 2));
  console.log(`  backup ${name}: ${rows.length} rows`);
}

async function backupShop(): Promise<{ dir: string; leadIds: string[] }> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(ROOT, "scripts", "data", `backup-shop-${ts}`);
  mkdirSync(dir, { recursive: true });
  console.log(`\nPhase 1 — BACKUP → ${dir}`);

  const leads = await fetchAll("leads", (q) => q.eq("domain", DOMAIN));
  const leadIds = leads.map((l) => l.id as string);
  writeBackupJson(dir, "leads.json", leads);

  if (leadIds.length === 0) {
    console.log("  (no existing shop leads — nothing else to back up)");
    return { dir, leadIds };
  }

  // Child rows. .in() is chunked to stay under URL limits.
  const inChunks = async (table: string, col: string) => {
    const rows: Record<string, unknown>[] = [];
    const CHUNK = 200;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const ids = leadIds.slice(i, i + CHUNK);
      const { data, error } = await supabase.from(table).select("*").in(col, ids);
      if (error) throw new Error(`backup ${table}: ${error.message}`);
      rows.push(...((data as Record<string, unknown>[]) ?? []));
    }
    return rows;
  };

  writeBackupJson(dir, "lead_notes.json", await inChunks("lead_notes", "lead_id"));
  writeBackupJson(dir, "lead_activities.json", await inChunks("lead_activities", "lead_id"));
  writeBackupJson(dir, "lead_raw_payloads.json", await inChunks("lead_raw_payloads", "lead_id"));
  writeBackupJson(dir, "lead_sla_timers.json", await inChunks("lead_sla_timers", "lead_id"));
  writeBackupJson(
    dir,
    "whatsapp_notification_logs.json",
    await inChunks("whatsapp_notification_logs", "lead_id"),
  );

  return { dir, leadIds };
}

// ─── Phase 2: Delete (guarded) ──────────────────────────────────────────────────

async function countIn(table: string, col: string, ids: string[]): Promise<number> {
  let total = 0;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(col, ids.slice(i, i + CHUNK));
    if (error) throw new Error(`count ${table}: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

async function deleteIn(table: string, col: string, ids: string[]): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase.from(table).delete().in(col, ids.slice(i, i + CHUNK));
    if (error) throw new Error(`delete ${table}: ${error.message}`);
    process.stdout.write(`\r  delete ${table}: ${Math.min(i + CHUNK, ids.length)} / ${ids.length}`);
  }
  console.log(`\r  delete ${table}: done${" ".repeat(20)}`);
}

async function deleteShop(leadIds: string[]): Promise<void> {
  console.log(`\nPhase 2 — DELETE existing shop data (${leadIds.length} leads)`);
  if (leadIds.length === 0) return;

  // GUARD — abort if any child we don't expect / can't safely handle exists.
  const deals = await countIn("deals", "lead_id", leadIds);
  const gia = await countIn("task_gia_meta", "lead_id", leadIds);
  const revival = await countIn("revival_candidates", "lead_id", leadIds);
  const waConvos = await countIn("whatsapp_conversations", "lead_id", leadIds);
  if (deals || gia || revival || waConvos) {
    throw new Error(
      `Aborting delete — unexpected child rows on shop leads: ` +
        `deals=${deals}, task_gia_meta=${gia}, revival_candidates=${revival}, whatsapp_conversations=${waConvos}. ` +
        `These were not present at planning time; resolve manually before re-running.`,
    );
  }

  // Children first (NO ACTION FKs would block the lead delete otherwise).
  await deleteIn("lead_notes", "lead_id", leadIds);
  await deleteIn("lead_activities", "lead_id", leadIds);
  await deleteIn("lead_raw_payloads", "lead_id", leadIds);
  // whatsapp_notification_logs.lead_id is SET NULL on delete, but null it explicitly
  // so the log row clearly detaches from a lead that no longer exists.
  {
    const CHUNK = 200;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const { error } = await supabase
        .from("whatsapp_notification_logs")
        .update({ lead_id: null })
        .in("lead_id", leadIds.slice(i, i + CHUNK));
      if (error) throw new Error(`detach whatsapp_notification_logs: ${error.message}`);
    }
    console.log("  detach whatsapp_notification_logs: done");
  }
  // lead_sla_timers CASCADE on lead delete — but delete explicitly for symmetry.
  await deleteIn("lead_sla_timers", "lead_id", leadIds);

  // Finally the leads.
  await deleteIn("leads", "id", leadIds);
}

// ─── Build lead/note inserts ─────────────────────────────────────────────────

function buildLeadInserts(
  rows: Record<string, string>[],
  nameToUuid: Map<string, string>,
): { inserts: object[]; unmappedAgents: Set<string> } {
  const unmappedAgents = new Set<string>();
  const inserts = rows.map((r) => {
    const formData = parseJson(r.form_data) ?? {};
    // Preserve the Zoho id INSIDE form_data so we can map notes after insert.
    formData._zoho_id = (r.zoho_lead_id ?? "").trim();

    const assignedName = (r.assigned_to ?? "").trim();
    const assignedUuid = assignedName ? nameToUuid.get(assignedName) ?? null : null;
    if (assignedName && !assignedUuid) unmappedAgents.add(assignedName);

    const first = (r.first_name ?? "").trim();
    const last = (r.last_name ?? "").trim();
    // CSV missing first_name → fall back to last_name (and clear last so the name
    // isn't duplicated). Both blank → "Unknown".
    const firstName = first || last || "Unknown";
    const lastName = first ? last || null : null;

    return {
      first_name: firstName,
      last_name: lastName,
      phone: nullIfEmpty(r.phone),
      email: nullIfEmpty(r.email),
      domain: DOMAIN,
      assigned_to: assignedUuid,
      assigned_at: assignedUuid ? istToUtc(r.created_at) : null,
      status: normaliseStatus(r.status),
      source: nullIfEmpty(r.source),
      medium: nullIfEmpty(r.medium),
      utm_campaign: nullIfEmpty(r.utm_campaign),
      form_data: formData,
      call_count: parseInt(r.call_count, 10) || 0,
      last_call_outcome: normaliseOutcome(r.last_call_outcome),
      service_interests: toInterestArray(r.service_interests),
      last_activity_at: istToUtc(r.updated_at) ?? istToUtc(r.created_at),
      status_changed_at: istToUtc(r.updated_at) ?? istToUtc(r.created_at),
      resolution_reason: nullIfEmpty(r.resolution_reason),
      city: nullIfEmpty(r.city),
      created_at: istToUtc(r.created_at),
      updated_at: istToUtc(r.updated_at),
      // slug + search_text: generated by the DB. Never supplied.
    };
  });
  return { inserts, unmappedAgents };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n=== Shop import ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE — destructive)"} ===`,
  );

  // Load + validate CSVs up front.
  const leadsRaw = loadCsv("shop-leads.csv");
  const notesRaw = loadCsv("shop-notes.csv");
  console.log(`Loaded ${leadsRaw.length} lead rows, ${notesRaw.length} note rows`);

  const nonShop = leadsRaw.filter((r) => (r.domain ?? "").trim() !== DOMAIN);
  if (nonShop.length) {
    console.error(`ABORT: ${nonShop.length} lead rows have domain != 'shop'. This import is shop-only.`);
    process.exit(1);
  }

  // Profile name → UUID (+ author aliases).
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name");
  if (profilesError) {
    console.error("Failed to fetch profiles:", profilesError.message);
    process.exit(1);
  }
  const nameToUuid = new Map<string, string>(
    (profiles ?? []).map((p: { id: string; full_name: string }) => [p.full_name.trim(), p.id]),
  );
  for (const [alias, target] of Object.entries(AUTHOR_ALIASES)) {
    const uuid = nameToUuid.get(target);
    if (uuid) nameToUuid.set(alias, uuid);
    else console.warn(`WARNING: author alias target "${target}" not found in profiles`);
  }

  // Build lead inserts + report name mapping.
  const { inserts: leadInserts, unmappedAgents } = buildLeadInserts(leadsRaw, nameToUuid);
  if (unmappedAgents.size) {
    console.warn(`\nUnmapped lead-owner names (will be assigned_to=null):`);
    for (const n of unmappedAgents) console.warn(`  - "${n}"`);
  } else {
    console.log("All lead-owner names resolved to profiles.");
  }

  // Validate note authors + lead linkage BEFORE any write.
  const leadZohoIds = new Set(leadsRaw.map((r) => (r.zoho_lead_id ?? "").trim()));
  const unmappedAuthors = new Set<string>();
  let notesNoLead = 0;
  for (const n of notesRaw) {
    if (!leadZohoIds.has((n.zoho_lead_id ?? "").trim())) notesNoLead++;
    const author = (n.author_name ?? "").trim();
    if (author && !nameToUuid.get(author)) unmappedAuthors.add(author);
  }
  if (unmappedAuthors.size) {
    console.warn(`\nUnmapped note-author names (those notes would be SKIPPED):`);
    for (const n of unmappedAuthors) console.warn(`  - "${n}"`);
  } else {
    console.log("All note-author names resolved to profiles.");
  }
  console.log(`Notes with no matching lead in CSV: ${notesNoLead}`);

  if (DRY_RUN) {
    console.log(`\n--- DRY RUN SUMMARY ---`);
    console.log(`Would delete: all existing domain='shop' leads + their child rows (after backup).`);
    console.log(`Would insert: ${leadInserts.length} leads, up to ${notesRaw.length - notesNoLead} notes.`);
    console.log(`Unmapped agents: ${unmappedAgents.size}, unmapped authors: ${unmappedAuthors.size}.`);
    console.log(`\nNo data was changed. Re-run with --confirm to execute.`);
    return;
  }

  // ── LIVE ──
  const { dir, leadIds } = await backupShop();
  await deleteShop(leadIds);

  console.log(`\nPhase 3 — IMPORT LEADS (${leadInserts.length})`);
  const zohoToUuid = new Map<string, string>();
  const leadErrors = await insertLeadBatches(leadInserts, (row) => {
    const fd = row.form_data as Record<string, unknown> | null;
    const zid = fd?._zoho_id as string | undefined;
    if (zid) zohoToUuid.set(zid, row.id);
  });
  console.log(`  zoho→uuid map size: ${zohoToUuid.size}`);

  console.log(`\nPhase 4 — IMPORT NOTES`);
  let skippedNoLead = 0;
  let skippedNoAuthor = 0;
  const noteInserts: object[] = [];
  for (const n of notesRaw) {
    const leadUuid = zohoToUuid.get((n.zoho_lead_id ?? "").trim());
    if (!leadUuid) {
      skippedNoLead++;
      continue;
    }
    const author = (n.author_name ?? "").trim();
    const authorUuid = author ? nameToUuid.get(author) ?? null : null;
    if (!authorUuid) {
      skippedNoAuthor++;
      continue;
    }
    noteInserts.push({
      lead_id: leadUuid,
      author_id: authorUuid,
      content: (n.content ?? "").trim() || "(empty)",
      call_outcome: null,
      created_at: istToUtc(n.created_at),
    });
  }
  console.log(`  notes skipped (no lead): ${skippedNoLead}, (no author): ${skippedNoAuthor}`);
  const noteErrors = await insertNoteBatches(noteInserts);

  console.log(`\n=== DONE ===`);
  console.log(`Backup dir: ${dir}`);
  console.log(`Lead insert errors: ${leadErrors}, note insert errors: ${noteErrors}`);
  console.log(`To revert: npx tsx scripts/revert-shop-import.ts "${dir}" --confirm`);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
