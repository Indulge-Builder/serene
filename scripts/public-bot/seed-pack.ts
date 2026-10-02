/**
 * Seeds the public bot's library with the launch content (launch-pack.ts) as DRAFT rows of
 * public.elaya_training_assets (0252). A founder reads each one on /admin/elaya-training, approves
 * it, then presses Publish. Idempotent on (kind, title): an existing row is left alone. Dry run by
 * default; --apply writes.
 *
 *   npx tsx --env-file=.env.local --tsconfig /tmp/<shim>/tsconfig.json scripts/public-bot/seed-pack.ts
 *   ... --apply
 *
 * Needs migration 0252 applied (the status / when_to_send / attachments columns).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { LAUNCH_ITEMS } from './launch-pack';

const apply = process.argv.includes('--apply');

async function main() {
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from('elaya_training_assets').select('id, kind, title');
  if (error) throw new Error(`read failed: ${error.message}`);
  const key = (k: string, t: string) => `${k}::${t.trim().toLowerCase()}`;
  const have = new Map(((existing ?? []) as { id: string; kind: string; title: string }[]).map((r) => [key(r.kind, r.title), r.id]));

  const toInsert = LAUNCH_ITEMS.filter((i) => !have.has(key(i.kind, i.title)) && !i.attachTitles);
  const messages = LAUNCH_ITEMS.filter((i) => !have.has(key(i.kind, i.title)) && i.attachTitles);
  console.log(`${LAUNCH_ITEMS.length} launch items; ${have.size} rows already in the library; ${toInsert.length + messages.length} to add.`);
  for (const i of [...toInsert, ...messages]) console.log(`  + ${i.kind.padEnd(13)} ${i.title}`);
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to file these as drafts.');
    return;
  }

  let order = 0;
  for (const i of toInsert) {
    const { data, error: e } = await admin
      .from('elaya_training_assets')
      .insert({ kind: i.kind, title: i.title, description: i.description || null, url: i.url ?? null, tags: i.tags ?? [], when_to_send: i.whenToSend ?? null, send_order: order++, status: 'draft', active: true })
      .select('id')
      .single();
    if (e || !data) throw new Error(`insert ${i.title} failed: ${e?.message}`);
    have.set(key(i.kind, i.title), (data as { id: string }).id);
  }
  for (const i of messages) {
    const attachments = (i.attachTitles ?? []).map((t) => [...have.entries()].find(([k]) => k.endsWith(`::${t.toLowerCase()}`))?.[1]).filter((x): x is string => !!x);
    const { error: e } = await admin
      .from('elaya_training_assets')
      .insert({ kind: i.kind, title: i.title, description: i.description, tags: i.tags ?? [], when_to_send: i.whenToSend ?? null, attachments, send_order: order++, status: 'draft', active: true });
    if (e) throw new Error(`insert ${i.title} failed: ${e.message}`);
  }
  console.log('\nFiled as drafts. Approve them on /admin/elaya-training, then Publish.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
