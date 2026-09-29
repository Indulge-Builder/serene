/**
 * restore-members.ts — the undo for match-subscription-manager.ts (2026-09-29).
 *
 * Reads ONE backup the clean-up wrote before it changed anything, and that run's step log, so it
 * only ever undoes what that run actually did:
 *   - a REMOVED member: the member row goes back; rows the delete took with it (facts, people,
 *     notes, snapshot, intake cards, vault items with their original seal) are inserted again; rows
 *     that were only unlinked (WhatsApp groups and contacts, Freshdesk contacts and tickets, deals,
 *     the vendor ledger, draft reviews) are linked again, but only where they are still unlinked;
 *     a draft review gets its intake card back.
 *   - a MERGED-AWAY member: the kept member gives back exactly what the merge gave it (the numbers
 *     and identifiers it did not have before, the sources, its merge record; anything added to it
 *     since stays), the member row goes back, and every row the merge moved returns, but only where
 *     it still sits on the kept member. Facts lose their merged_from stamp, vault items return with
 *     their original seal, relations the merge folded or re-pointed are put back as they were.
 *   - a KEPT member (kept although no client matches them): each membership field the run set goes
 *     back to what it was, but only where it still holds what the run set.
 *   - --additions: deletes the members the run added, refusing any that has gained a link since.
 * Append-only logs were never changed, so there is nothing to restore there.
 *
 * Re-running is safe: every step checks what is there first, so a stopped restore is finished by
 * running it again. Several records merged into the SAME member share its before-state, so they are
 * restored together (the script refuses to restore only some of them).
 *
 * Dry run by default. Choose what to restore with --member <id> (repeatable), --all, or --additions.
 *   npx tsx scripts/members/restore-members.ts --target prod --prod-env .env.local.prod-backup \
 *     --backup <backup-prod-….json> --member <id> [--apply]
 *   (local: npx tsx --env-file=.env.local scripts/members/restore-members.ts --target local …)
 */
import { appendFileSync, existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import {
  LINKED, client, fail, fkChildren, flag, flags, has, keyOf, markWritesStarted, openTarget, rowsFor, type Linked, type Member,
} from "./sm-match-lib";

type Row = Record<string, unknown>;
type Backup = {
  target: string; run_log?: string;
  decisions: {
    remove: { id: string; name: string }[];
    merge: { drop: string; drop_name: string; keep: string; sm_client: string }[];
    keep?: { id: string; name: string }[];
  };
  members: Member[];
  linked: Record<string, Row[]>;
};

const APPLY = has("--apply");
const t = openTarget();
const db = client(t);
const backupPath = flag("--backup") ?? fail("Give --backup <the backup file the clean-up wrote>.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const restoreLog = join(dirname(backupPath), `restore-${t.name}-${stamp}.jsonl`);
const notes: string[] = [];
let started = false;

/** One write: printed on a dry run, done (and logged) on --apply; the first failure stops the restore. */
async function write(what: string, run: () => PromiseLike<{ error: { message: string } | null }>) {
  console.log(`    ${APPLY ? "" : "would "}${what}`);
  if (!APPLY) return;
  if (!started) {
    started = true;
    markWritesStarted(`Every completed step is in ${restoreLog}. Re-running the same command finishes the restore.`);
  }
  const { error } = await run();
  appendFileSync(restoreLog, JSON.stringify({ at: new Date().toISOString(), what, ok: !error, error: error?.message }) + "\n");
  if (error) fail(`${what}: ${error.message}`);
}

const tbl = (l: Pick<Linked, "schema" | "table">) => db.schema(l.schema).from(l.table);
const LINK = (name: string) => LINKED.find((l) => `${l.schema}.${l.table}` === name)!;
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const without = (r: Row, cols: string[] = []) => Object.fromEntries(Object.entries(r).filter(([c]) => !cols.includes(c)));

/** The rows of `backupRows` as they are now, by key (a two-column key reads by its first column). */
async function current(l: Linked, backupRows: Row[]): Promise<Map<string, Row>> {
  if (!backupRows.length) return new Map();
  const first = l.pk.split(",")[0];
  const now = await rowsFor(db, l.schema, l.table, [...new Set(backupRows.map((r) => String(r[first])))], l.pk, first, l.optional);
  return new Map(now.map((r) => [keyOf(l, r), r]));
}
const existing = async (id: string) => (await db.schema("member").from("members").select("*").eq("id", id).maybeSingle()).data as Member | null;

/** Insert rows again (in batches, computed columns left out; a vault item whose source is now held elsewhere is left out and said). */
async function reinsert(l: Linked, rows: Row[], who: string) {
  let put = rows;
  if (l.table === "member_vault" && rows.length) {
    const held = await rowsFor(db, "member", "member_vault", rows.map((r) => String(r.source_ref)), "id", "source_ref");
    put = rows.filter((r) => {
      const other = held.find((h) => h.source === r.source && h.source_ref === r.source_ref);
      if (other) notes.push(`${who}: vault item "${String(r.label ?? r.id)}" was not put back: the same item is now on member ${String(other.member_id)}`);
      return !other;
    });
  }
  for (const part of chunks(put, 200)) {
    await write(`${l.schema}.${l.table}: insert ${part.length} row(s) again`, () => tbl(l).insert(part.map((r) => without(r, l.generated))));
  }
}

/**
 * The member row back, with its main phone or app id left off (and said) when another member holds
 * it now. `freed` = values the kept member gives back just before (on a dry run it still holds them).
 */
async function insertMember(row: Member, who: string, freed = new Set<string>()) {
  if (await existing(row.id)) { console.log("    the member row is already back"); return; }
  const r = without(row, ["wa_group_jid"]); // kept by a trigger from sia.wag_groups: set again when its group is linked
  if (r.primary_phone) {
    const { data } = await db.schema("member").from("members").select("id,full_name").eq("primary_phone", r.primary_phone as string).maybeSingle();
    if (data && !freed.has(`primary_phone:${String(r.primary_phone)}`)) {
      notes.push(`${who}: its main phone is now ${data.full_name}'s main phone; restored with no main phone and the number under Other numbers`);
      r.alt_phones = [...new Set([...((r.alt_phones as string[]) ?? []), r.primary_phone as string])];
      r.primary_phone = null;
    }
  }
  if (r.app_member_id) {
    const { data } = await db.schema("member").from("members").select("id,full_name").eq("app_member_id", r.app_member_id as string).maybeSingle();
    if (data && !freed.has(`app_member_id:${String(r.app_member_id)}`)) { notes.push(`${who}: its app member id is now on ${data.full_name}; restored without it`); r.app_member_id = null; }
  }
  await write("insert the member", () => db.schema("member").from("members").insert(r));
}

/** Point rows back at `to`, only where they still point at `from` (null = still unlinked). */
async function moveBack(l: Linked, rows: Row[], from: string | null, to: string, patch: (r: Row) => Row = () => ({})) {
  const first = l.pk.split(",")[0];
  const perRow = rows.some((r) => Object.keys(patch(r)).length);
  if (perRow) {
    for (const r of rows) {
      let q = tbl(l).update({ member_id: to, ...patch(r) });
      for (const c of l.pk.split(",")) q = q.eq(c, r[c] as string);
      await write(`${l.schema}.${l.table} ${keyOf(l, r)}: back to the member`, () => (from ? q.eq("member_id", from) : q.is("member_id", null)));
    }
    return;
  }
  for (const part of chunks([...new Set(rows.map((r) => String(r[first])))], 100)) {
    const q = tbl(l).update({ member_id: to }).in(first, part);
    await write(`${l.schema}.${l.table}: ${part.length} row(s) back to the member`, () => (from ? q.eq("member_id", from) : q.is("member_id", null)));
  }
}

const stripMergedFrom = (drop: string) => (cur: Row | undefined) => {
  const ev = { ...((cur?.evidence as Row) ?? {}) };
  if ((ev.merged_from as Row | undefined)?.member_id === drop) delete ev.merged_from;
  return { evidence: ev };
};

// ─── A removed member ─────────────────────────────────────────────────────────
async function restoreRemoved(b: Backup, id: string, who: string) {
  console.log(`\n${who} (removed):`);
  await insertMember(b.members.find((m) => m.id === id) ?? fail(`The backup holds no row for ${who}.`), who);
  for (const l of LINKED) {
    const mine = (b.linked[`${l.schema}.${l.table}`] ?? []).filter((r) => r.member_id === id);
    const now = await current(l, mine);
    const unlinked = mine.filter((r) => now.get(keyOf(l, r)) && now.get(keyOf(l, r))!.member_id == null);
    const gone = mine.filter((r) => !now.get(keyOf(l, r)));
    for (const r of mine) {
      const n = now.get(keyOf(l, r));
      if (n && n.member_id != null && n.member_id !== id) notes.push(`${who}: ${l.schema}.${l.table} ${keyOf(l, r)} is linked to another member now; left there`);
    }
    if (unlinked.length) await moveBack(l, unlinked, null, id);
    if (gone.length) await reinsert(l, gone, who);
  }
  // A draft review whose intake card went with the member gets its card back.
  const cards = new Set((b.linked["sia.intake_proposals"] ?? []).filter((p) => p.member_id === id).map((p) => String(p.id)));
  const reviews = (b.linked["sia.draft_reviews#proposal"] ?? []).filter((r) => cards.has(String(r.proposal_id)));
  for (const r of reviews) {
    await write(`sia.draft_reviews ${String(r.id)}: its intake card back`, () =>
      db.schema("sia").from("draft_reviews").update({ proposal_id: r.proposal_id }).eq("id", r.id as string).is("proposal_id", null));
  }
}

// ─── The records merged into one kept member ─────────────────────────────────
async function restoreMerged(b: Backup, keepId: string, merges: Backup["decisions"]["merge"]) {
  const keepName = merges[0].sm_client;
  const kb = b.members.find((m) => m.id === keepId) ?? fail(`The backup holds no row for "${keepName}".`);
  const drops = merges.map((m) => b.members.find((x) => x.id === m.drop) ?? fail(`The backup holds no row for "${m.drop_name}".`));
  const dropIds = new Set(drops.map((d) => d.id));
  const cur = await existing(keepId) ?? fail(`"${keepName}" (${keepId}), the member these were merged into, is no longer in Serene.`);
  console.log(`\n${merges.map((m) => m.drop_name).join(", ")} (merged into ${keepName}):`);

  // 1. The kept member gives back exactly what the merges gave it.
  const had = new Set([...(kb.alt_phones ?? []), kb.primary_phone].filter(Boolean) as string[]);
  const given = new Set(drops.flatMap((d) => [d.primary_phone, ...(d.alt_phones ?? [])]).filter((p): p is string => !!p && !had.has(p)));
  const patch: Row = {};
  // The merge sorted these lists: what the keeper had comes back in its own order, anything added since after it.
  const inOrder = (before: string[], now: string[], drop: Set<string>) => [...before.filter((x) => now.includes(x)), ...now.filter((x) => !before.includes(x) && !drop.has(x))];
  const alt = inOrder(kb.alt_phones ?? [], cur.alt_phones ?? [], given);
  if (JSON.stringify(alt) !== JSON.stringify(cur.alt_phones ?? [])) patch.alt_phones = alt;
  for (const c of ["freshdesk_contact_id", "zoho_customer_id", "app_member_id", "wa_invite_link"] as const) {
    if (kb[c] == null && cur[c] != null && drops.some((d) => d[c] === cur[c])) patch[c] = null;
  }
  const givenSources = new Set(drops.flatMap((d) => d.sources ?? []).filter((s) => !(kb.sources ?? []).includes(s)));
  const sources = inOrder(kb.sources ?? [], cur.sources ?? [], givenSources);
  if (JSON.stringify(sources) !== JSON.stringify(cur.sources ?? [])) patch.sources = sources;
  const record = (cur.import_raw?.merged_from as Row[] | undefined) ?? [];
  const left = record.filter((e) => !dropIds.has(String(e.member_id)));
  if (left.length !== record.length) {
    const raw = { ...cur.import_raw };
    if (left.length || kb.import_raw?.merged_from !== undefined) raw.merged_from = left; else delete raw.merged_from;
    patch.import_raw = raw;
  }
  if (Object.keys(patch).length) {
    await write(`"${keepName}": give back ${Object.keys(patch).join(", ")}`, () => db.schema("member").from("members").update(patch).eq("id", keepId));
  } else console.log(`    "${keepName}" holds nothing of theirs any more`);

  // 2. The member rows.
  const freed = APPLY ? new Set<string>() : new Set(Object.entries(patch).filter(([, v]) => v === null).map(([c]) => `${c}:${String(cur[c])}`));
  for (const d of drops) await insertMember(d, d.full_name, freed);

  // 3. Every row the merge moved, back where it still sits on the kept member.
  const keeperRelations = (b.linked["member.member_relations"] ?? []).filter((r) => r.member_id === keepId);
  for (const d of drops) {
    const who = d.full_name;
    for (const l of LINKED) {
      const name = `${l.schema}.${l.table}`;
      const mine = (b.linked[name] ?? []).filter((r) => r.member_id === d.id);
      if (!mine.length) continue;
      if (name === "member.member_snapshot") {
        // The merge deleted the drop's snapshot (the keeper had one) or moved it to the keeper (it had none).
        if ((await current(l, mine)).size) continue;
        if (!(b.linked[name] ?? []).some((r) => r.member_id === keepId)) {
          await write(`"${keepName}": remove the snapshot it took from ${who} (the hourly pulse rebuilds its own)`, () => tbl(l).delete().eq("member_id", keepId));
        }
        await reinsert(l, mine, who);
        continue;
      }
      const now = await current(l, mine);
      const onKeeper = mine.filter((r) => now.get(keyOf(l, r))?.member_id === keepId);
      const gone = mine.filter((r) => !now.get(keyOf(l, r)));
      for (const r of mine) {
        const n = now.get(keyOf(l, r));
        if (n && n.member_id !== keepId && n.member_id !== d.id) notes.push(`${who}: ${name} ${keyOf(l, r)} is linked to another member now; left there`);
      }
      if (name === "member.member_vault") await moveBack(l, onKeeper, keepId, d.id, (r) => ({ ciphertext: r.ciphertext, nonce: r.nonce, key_version: r.key_version }));
      else if (["member.member_facts", "member.member_anticipations", "member.member_health_events"].includes(name)) {
        await moveBack(l, onKeeper, keepId, d.id, (r) => stripMergedFrom(d.id)(now.get(keyOf(l, r))));
      } else await moveBack(l, onKeeper, keepId, d.id);

      if (name === "member.member_relations") {
        // A relation the keeper already held was folded into the keeper's row: the drop's row comes
        // back, and the keeper's row returns to its own values when nothing was added to it since.
        await reinsert(l, gone, who);
        const keeperNow = await current(l, keeperRelations);
        for (const g of gone) {
          const same = (r: Row) => r.entity_kind === g.entity_kind && r.entity_id === g.entity_id && r.relation === g.relation;
          const before = keeperRelations.find(same);
          const now2 = before && keeperNow.get(keyOf(l, before));
          if (!before || !now2) continue;
          if (Number(now2.evidence_count ?? 0) === Number(before.evidence_count ?? 0) + Number(g.evidence_count ?? 0)) {
            await write(`member.member_relations ${String(before.id)}: "${keepName}"'s own values back`, () => tbl(l).update({
              evidence: before.evidence, evidence_count: before.evidence_count, strength: before.strength,
              first_seen_at: before.first_seen_at, last_seen_at: before.last_seen_at,
            }).eq("id", before.id as string));
          } else notes.push(`${who}: "${keepName}"'s ${String(g.relation)} relation gained evidence since the merge; it keeps both records' evidence`);
        }
      } else if (gone.length) notes.push(`${who}: ${gone.length} row(s) of ${name} were deleted after the merge; not re-created`);
    }
  }

  // 4. Relations that named a merged record as a person (entity_kind 'member'): re-pointed at the keeper, or dropped as a repeat.
  const rel = LINK("member.member_relations");
  const named = (b.linked["member.member_relations#entity"] ?? []).filter((r) => r.entity_kind === "member" && dropIds.has(String(r.entity_id)));
  const now = await current(rel, named);
  for (const r of named) {
    const n = now.get(keyOf(rel, r));
    if (n?.entity_id === keepId) {
      await write(`member.member_relations ${String(r.id)}: names its person again`, () => tbl(rel).update({ entity_id: r.entity_id }).eq("id", r.id as string).eq("entity_id", keepId));
    } else if (!n) {
      if (await existing(String(r.member_id))) await reinsert(rel, [r], String(r.member_id));
      else notes.push(`relation ${String(r.id)} was not put back: its member ${String(r.member_id)} is not in Serene`);
    }
  }
}

// ─── A kept member: the membership fields the run set go back ─────────────────
async function restoreKept(id: string, who: string, changed: Record<string, { from: unknown; to: unknown }>) {
  console.log(`\n${who} (kept):`);
  const cur = await existing(id);
  if (!cur) { notes.push(`${who} is no longer in Serene; nothing to give back`); return; }
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const patch: Row = {};
  for (const [c, v] of Object.entries(changed)) {
    if (same(cur[c], v.to)) patch[c] = v.from;
    else if (!same(cur[c], v.from)) notes.push(`${who}: ${c} was changed after the run; left as is`);
  }
  if (!Object.keys(patch).length) { console.log("    already as before the run"); return; }
  await write(`give back ${Object.keys(patch).join(", ")}`, () => db.schema("member").from("members").update(patch).eq("id", id));
}

// ─── The members the run added ────────────────────────────────────────────────
async function removeAdditions(added: { id: string; name: string }[]) {
  const children = await fkChildren(db);
  for (const a of added) {
    if (!(await existing(a.id))) { console.log(`\n${a.name}: already gone`); continue; }
    const holds: string[] = [];
    for (const c of children) {
      const { count } = await db.schema(c.schema_name).from(c.table_name).select("*", { count: "exact", head: true }).eq(c.column_name, a.id);
      if (count) holds.push(`${count} in ${c.schema_name}.${c.table_name}`);
    }
    const { count } = await db.schema("member").from("member_relations").select("*", { count: "exact", head: true }).eq("entity_kind", "member").eq("entity_id", a.id);
    if (count) holds.push(`${count} relation(s) naming them`);
    console.log(`\n${a.name} (added):`);
    if (holds.length) { notes.push(`${a.name} was not deleted: it has gained links since (${holds.join(", ")})`); continue; }
    await write("delete the member", () => db.schema("member").from("members").delete().eq("id", a.id));
  }
}

async function main() {
  const b = JSON.parse(readFileSync(backupPath, "utf8")) as Backup;
  if (b.target !== t.name) fail(`This backup was taken on "${b.target}", not "${t.name}".`);
  if (!b.run_log || !existsSync(b.run_log)) fail(`The run's step log (${b.run_log ?? "not named in the backup"}) is missing, so what the run did cannot be proven. Nothing to restore from this backup.`);
  const steps = readFileSync(b.run_log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Row).filter((s) => s.ok);
  const removed = b.decisions.remove.filter((x) => steps.some((s) => s.step === "remove" && s.id === x.id));
  const merged = b.decisions.merge.filter((x) => steps.some((s) => s.step === "merge" && s.drop === x.drop));
  const added = steps.filter((s) => s.step === "add" && s.id).map((s) => ({ id: String(s.id), name: String(s.name) }));
  const kept = (b.decisions.keep ?? []).flatMap((x) => {
    const s = steps.filter((st) => st.step === "keep" && st.id === x.id).pop();
    return s ? [{ ...x, changed: s.changed as Record<string, { from: unknown; to: unknown }> }] : [];
  });
  console.log(`[${t.name}] this run removed ${removed.length}, merged ${merged.length}, set the membership of ${kept.length} kept, added ${added.length}.`);

  if (has("--additions")) await removeAdditions(added);
  else {
    const wanted = has("--all") ? [...removed.map((x) => x.id), ...merged.map((x) => x.drop), ...kept.map((x) => x.id)] : flags("--member");
    if (!wanted.length) fail("Say what to restore: --member <id> (repeatable), --all, or --additions.");
    const planned = [...b.decisions.remove.map((x) => x.id), ...b.decisions.merge.map((x) => x.drop), ...(b.decisions.keep ?? []).map((x) => x.id)];
    for (const id of wanted) {
      if (!removed.some((x) => x.id === id) && !merged.some((x) => x.drop === id) && !kept.some((x) => x.id === id)) {
        fail(`${id} was not removed, merged or changed by this run${planned.includes(id) ? " (it was planned, but the run stopped before it, or found it already as decided)" : ""}.`);
      }
    }
    const keepers = [...new Set(merged.filter((x) => wanted.includes(x.drop)).map((x) => x.keep))];
    for (const k of keepers) {
      const all = merged.filter((x) => x.keep === k);
      const missing = all.filter((x) => !wanted.includes(x.drop));
      if (missing.length) fail(`${all.map((x) => `"${x.drop_name}"`).join(" and ")} were all merged into "${all[0].sm_client}": restore them together (add --member ${missing.map((x) => x.drop).join(" --member ")}).`);
    }
    for (const x of removed.filter((r) => wanted.includes(r.id))) await restoreRemoved(b, x.id, x.name);
    for (const k of keepers) await restoreMerged(b, k, merged.filter((x) => x.keep === k));
    for (const x of kept.filter((k) => wanted.includes(k.id))) await restoreKept(x.id, x.name, x.changed);
  }

  if (notes.length) { console.log("\nLeft as is (said, not guessed):"); for (const n of notes) console.log(`  - ${n}`); }
  console.log(APPLY ? `\nDone. Every step is in ${restoreLog}.` : "\nDry run only. Add --apply to restore.");
}

main().catch((e) => fail(`Stopped: ${e instanceof Error ? e.message : String(e)}`));
