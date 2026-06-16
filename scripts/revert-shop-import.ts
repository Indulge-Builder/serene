/**
 * Revert a shop import — restore the pre-import state from a backup-shop-<ts> dump.
 *
 * What it does:
 *   1. Deletes ALL current domain='shop' leads + their child rows (the imported set).
 *   2. Re-inserts the backed-up rows verbatim, preserving original UUIDs/timestamps:
 *      leads → lead_notes → lead_activities → lead_raw_payloads → lead_sla_timers
 *      then re-attaches whatsapp_notification_logs.lead_id from the backup.
 *
 * Because the backup carries the original primary keys, the restore is exact —
 * slugs, ids, and FKs all line up again.
 *
 * Usage:
 *   npx tsx scripts/revert-shop-import.ts <backup-dir>            # dry run
 *   npx tsx scripts/revert-shop-import.ts <backup-dir> --confirm  # execute
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--confirm");
const CONFIRM = process.argv.includes("--confirm");
const BACKUP_DIR = args[0];

if (!BACKUP_DIR) {
  console.error("Usage: npx tsx scripts/revert-shop-import.ts <backup-dir> [--confirm]");
  process.exit(1);
}
if (!existsSync(join(BACKUP_DIR, "leads.json"))) {
  console.error(`No leads.json found in backup dir: ${BACKUP_DIR}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const DOMAIN = "shop";

// Backups are JSON dumps of the raw rows — read back verbatim (lossless).
function loadBackup(name: string): Record<string, unknown>[] {
  const path = join(BACKUP_DIR, name);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[];
}

async function fetchCurrentShopLeadIds(): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("domain", DOMAIN)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read current shop leads: ${error.message}`);
    out.push(...((data as { id: string }[]) ?? []).map((r) => r.id));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function deleteIn(table: string, col: string, ids: string[]) {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase.from(table).delete().in(col, ids.slice(i, i + CHUNK));
    if (error) throw new Error(`delete ${table}: ${error.message}`);
  }
  console.log(`  deleted from ${table}`);
}

async function insertAll(table: string, rows: object[]) {
  if (rows.length === 0) {
    console.log(`  restore ${table}: 0 rows (skip)`);
    return;
  }
  const BATCH = 200;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH));
    if (error) {
      console.error(`  restore ${table} batch ${Math.floor(i / BATCH) + 1}:`, error.message);
      errors += Math.min(BATCH, rows.length - i);
    }
  }
  console.log(`  restore ${table}: ${rows.length} rows, errors: ${errors}`);
}

async function main() {
  console.log(`\n=== Revert shop import ${CONFIRM ? "(LIVE)" : "(DRY RUN)"} ===`);
  console.log(`Backup dir: ${BACKUP_DIR}`);

  const leads = loadBackup("leads.json");
  const notes = loadBackup("lead_notes.json");
  const activities = loadBackup("lead_activities.json");
  const rawPayloads = loadBackup("lead_raw_payloads.json");
  const slaTimers = loadBackup("lead_sla_timers.json");
  const waLogs = loadBackup("whatsapp_notification_logs.json");

  console.log(
    `Backup contents: ${leads.length} leads, ${notes.length} notes, ${activities.length} activities, ` +
      `${rawPayloads.length} raw_payloads, ${slaTimers.length} sla_timers, ${waLogs.length} wa_logs`,
  );

  const currentIds = await fetchCurrentShopLeadIds();
  console.log(`Current shop leads to remove: ${currentIds.length}`);

  if (!CONFIRM) {
    console.log(
      `\nDRY RUN — would delete ${currentIds.length} current shop leads + children, ` +
        `then restore the backup above. Re-run with --confirm to execute.`,
    );
    return;
  }

  // 1. Remove the current (imported) shop set.
  console.log(`\nRemoving current shop data...`);
  if (currentIds.length) {
    await deleteIn("lead_notes", "lead_id", currentIds);
    await deleteIn("lead_activities", "lead_id", currentIds);
    await deleteIn("lead_raw_payloads", "lead_id", currentIds);
    {
      const CHUNK = 200;
      for (let i = 0; i < currentIds.length; i += CHUNK) {
        await supabase
          .from("whatsapp_notification_logs")
          .update({ lead_id: null })
          .in("lead_id", currentIds.slice(i, i + CHUNK));
      }
    }
    await deleteIn("lead_sla_timers", "lead_id", currentIds);
    await deleteIn("leads", "id", currentIds);
  }

  // 2. Restore the backup, parents first.
  console.log(`\nRestoring backup...`);
  await insertAll("leads", leads);
  await insertAll("lead_notes", notes);
  await insertAll("lead_activities", activities);
  await insertAll("lead_raw_payloads", rawPayloads);
  await insertAll("lead_sla_timers", slaTimers);
  // Re-attach wa logs: the rows still exist (lead_id was SET NULL); update them back.
  {
    let restored = 0;
    for (const row of waLogs) {
      const id = row.id as string | undefined;
      const leadId = row.lead_id as string | null;
      if (!id || !leadId) continue;
      const { error } = await supabase
        .from("whatsapp_notification_logs")
        .update({ lead_id: leadId })
        .eq("id", id);
      if (!error) restored++;
    }
    console.log(`  re-attached whatsapp_notification_logs.lead_id: ${restored}`);
  }

  console.log(`\n=== REVERT DONE ===`);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
