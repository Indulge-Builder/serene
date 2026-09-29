/**
 * match-subscription-manager.ts — THE one-time clean-up that makes Serene's member list match the
 * Subscription Manager (owner, 2026-09-29): one member per Subscription Manager client, plus the
 * few members the owner keeps who are not clients (the founders, as Celebrity members).
 *
 * WHAT IT DOES, from the owner's decisions (a JSON of Serene member ids, kept OUTSIDE the repo
 * because it sits next to names) and a FRESH Subscription Manager Clients export:
 *   1. merge   — folds each record into the member it belongs to (a duplicate of the same client,
 *                or a second person listed on someone else's membership) through
 *                member.merge_members() (migration 0252), one transaction per merge: links, facts
 *                (stamped with whose they were), WhatsApp and Freshdesk links move to the kept
 *                member; its phone joins the kept member's "Other numbers"; its vault items are
 *                re-sealed for the kept member (they are sealed to the member id: MEMBER_VAULT_KEY).
 *   2. remove  — deletes team members, test accounts and people who are not Subscription Manager
 *                clients. Their WhatsApp groups and Freshdesk tickets are NOT deleted: those links
 *                are simply cleared. Serene's own data on the member (facts, notes, snapshot) goes
 *                with it. A member holding vault items is refused unless --allow-vault-delete; one
 *                that a table refuses to let go of (a Sia ticket) is a stop in the plan.
 *   3. keep    — a member the owner keeps although no client matches them: everything they hold
 *                stays (links, facts, vault items), and their membership is set as decided
 *                (queendom by name, membership type, status, amount, dates; the tier follows the
 *                membership type, as for every imported member). Checked by the app's own
 *                UpdateMemberSchema.
 *   4. add     — creates a member for every Subscription Manager client with none (new clients,
 *                and a client that shares a phone with another client, which gets its own record
 *                with the shared number under "Other numbers": the main phone is unique). Checked
 *                by the app's own CreateMemberSchema.
 *   5. verify  — re-reads everything: the member count must equal the export's client count plus
 *                the kept members, every client must match exactly one member, every member one
 *                client (the kept members none), the kept members must hold what was decided, and
 *                every member not touched must be unchanged.
 *
 * SAFETY
 *   - Dry run by default: reads only, prints the plan, writes plan-….json to --out. The dry run
 *     already proves the result (a full simulation), that the backup covers every table the
 *     database says points at a member, that no removal is blocked, and that the vault key opens
 *     every item it must re-seal.
 *   - --apply first writes a full backup (the affected members, every row pointing at them, every
 *     log row about them, and every member before the run) to --out, then logs each step to
 *     run-….jsonl the moment it completes, and stops at the first failure. Re-running the same
 *     command finishes the job: a step counts as done only when an earlier run's log (or, for a
 *     merge, the kept member's own merge record) proves it; a kept member already holding what was
 *     decided is left alone. restore-members.ts undoes any of it.
 *   - Refuses to apply when the export is more than 24 hours old (--allow-old-export overrides:
 *     the age is the file's, so download it again on the day) or when --out is inside the repo.
 *   - Ask the team not to edit members or link WhatsApp groups while it runs: an edit during the
 *     run shows up in the verification as a changed member.
 *
 * RUN (from the repo root)
 *   Rehearsal on the local database:
 *     npx tsx --env-file=.env.local scripts/members/match-subscription-manager.ts --target local \
 *       --sm-csv <export.csv> --decisions <decisions.json> --out <folder outside the repo> [--apply]
 *   Production (dry run; add --apply only on the owner's go-ahead):
 *     npx tsx scripts/members/match-subscription-manager.ts --target prod --prod-env .env.local.prod-backup \
 *       --sm-csv <export.csv> --decisions <decisions.json> --out <folder outside the repo>
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { normalizeToE164 } from "../../src/lib/utils/phone";
import { sanitizeText } from "../../src/lib/utils/sanitize";
import { tierFromLabel } from "../../src/lib/constants/member-facets";
import { CreateMemberSchema, UpdateMemberSchema } from "../../src/lib/validations/member-schema";
import {
  LINKED, LOGS, better, client, fail, fkChildren, flag, has, logLine, markWritesStarted, memberKeys, oneToOne,
  openTarget, outDir, rank, readAll, readDecisions, readLogs, readMembers, readSmCsv, rowsFor, useTargetVaultKey,
  matchRows, type KeepSet, type Member, type SmRow,
} from "./sm-match-lib";

const APPLY = has("--apply");
const t = openTarget();
const db = client(t);
const OUT = outDir();
mkdirSync(OUT, { recursive: true });
const csvPath = flag("--sm-csv") ?? fail("Give --sm-csv <the Subscription Manager Clients export>.");
const decPath = flag("--decisions") ?? fail("Give --decisions <decisions.json>.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const runLog = join(OUT, `run-${t.name}-${stamp}.jsonl`);

// ─── Values for a new member, from its Subscription Manager row ─────────────
function toIsoDate(dmy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
}
function toAmount(s: string): number | null {
  const v = s.trim().replace(/^\D*/, "").replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}
/** A number as E.164 (Rule 06); an international number typed without its "+" gets one; unparseable → null. */
function toE164(raw: string): string | null {
  const s = raw.replace(/[‎‏‪-‮]/g, "").trim();
  for (const candidate of [s, `+${s.replace(/\D/g, "")}`]) {
    try { return normalizeToE164(candidate); } catch { /* next */ }
  }
  return null;
}
/** The app's own message for the first thing its schema refused. */
const firstIssue = (e: { issues: { path: PropertyKey[]; message: string }[] }) => `${e.issues[0]?.path.join(".") || "value"}: ${e.issues[0]?.message}`;

async function main() {
  // ─── 1. Read ───────────────────────────────────────────────────────────────
  const { rows, ageHours } = readSmCsv(csvPath);
  const dec = readDecisions(decPath);
  const members = await readMembers(db);
  const queendoms = await readAll<{ id: string; name: string }>(db, "sia", "queendoms", "id,name", "name");
  const qdByName = new Map(queendoms.map((q) => [q.name.trim().toLowerCase(), q.id]));
  const byId = new Map(members.map((m) => [m.id, m]));
  console.log(`[${t.name}] ${members.length} members in Serene, ${rows.length} clients in the Subscription Manager export (${ageHours.toFixed(1)} h old).`);

  // ─── 2. The decisions against what is there now ────────────────────────────
  // A decision whose member is gone counts as done only with proof: an earlier run's log in --out
  // says it was done, or (a merge) the kept member's own merge record names it.
  const problems: string[] = [];
  const earlier = readLogs(OUT, t.name);
  const removedBefore = new Set(earlier.flatMap((s) => (s.step === "remove" && s.ok ? [s.id] : [])));
  const mergedInto = (keep: Member | undefined, drop: string) =>
    Array.isArray(keep?.import_raw?.merged_from) && (keep!.import_raw.merged_from as { member_id?: string }[]).some((e) => e.member_id === drop);
  const alreadyDone: string[] = [];
  dec.remove = dec.remove.filter((x) => {
    if (byId.has(x.id)) return true;
    if (removedBefore.has(x.id)) { alreadyDone.push(x.name); return false; }
    problems.push(`"${x.name}" (${x.id}) is not in Serene and no earlier run in --out removed it`);
    return false;
  });
  dec.merge = dec.merge.filter((x) => {
    if (!byId.has(x.keep)) { problems.push(`the member to keep for "${x.drop_name}" (${x.keep}) is not in Serene`); return false; }
    if (byId.has(x.drop)) return true;
    if (mergedInto(byId.get(x.keep), x.drop)) { alreadyDone.push(x.drop_name); return false; }
    problems.push(`"${x.drop_name}" (${x.drop}) is not in Serene and "${x.sm_client}" holds no record of merging it`);
    return false;
  });
  if (alreadyDone.length) console.log(`Already done in an earlier run: ${alreadyDone.length} (${alreadyDone.slice(0, 5).join(", ")}${alreadyDone.length > 5 ? ", …" : ""}).`);
  const removeIds = dec.remove.map((x) => x.id);
  const dropIds = dec.merge.map((x) => x.drop);
  const touched = new Set([...removeIds, ...dropIds]);
  if (touched.size !== removeIds.length + dropIds.length) problems.push("a member appears twice in the decisions");
  for (const m of dec.merge) if (touched.has(m.keep)) problems.push(`the kept member for "${m.drop_name}" is itself being removed or merged`);

  // ─── 3. The members the owner keeps: what each becomes, checked by the app's own schema ─────
  const keptIds = new Set(dec.keep.map((k) => k.id));
  if (keptIds.size !== dec.keep.length) problems.push("a kept member appears twice in the decisions");
  const keepPlan = dec.keep.flatMap((k) => {
    const cur = byId.get(k.id);
    if (!cur) { problems.push(`"${k.name}" (${k.id}), a member to keep, is not in Serene (restore it first with restore-members.ts)`); return []; }
    if (touched.has(k.id)) { problems.push(`"${k.name}" is both kept and removed or merged away`); return []; }
    const s: KeepSet = k.set;
    const target: Record<string, unknown> = {};
    if ("queendom" in s) {
      const q = s.queendom == null ? null : qdByName.get(String(s.queendom).trim().toLowerCase());
      if (s.queendom != null && !q) problems.push(`"${k.name}": no queendom is named "${s.queendom}"`);
      target.queendom_id = q ?? null;
    }
    if ("membership_type" in s) {
      const tier = s.membership_type == null ? null : tierFromLabel(String(s.membership_type));
      if (s.membership_type != null && !tier) problems.push(`"${k.name}": "${s.membership_type}" is not a membership type Serene knows`);
      target.membership_type = s.membership_type == null ? null : String(s.membership_type).trim();
      target.tier = tier;
    }
    for (const c of ["membership_status", "membership_amount_inr", "membership_start", "membership_end"] as const) if (c in s) target[c] = s[c];
    const check = UpdateMemberSchema.safeParse({ member_id: k.id, ...Object.fromEntries(Object.entries(target).filter(([c]) => c !== "membership_type")) });
    if (!check.success) problems.push(`"${k.name}": ${firstIssue(check.error)}`);
    else for (const [c, v] of Object.entries(check.data)) if (c !== "member_id" && v !== undefined) target[c] = v;
    const changed = Object.fromEntries(Object.entries(target).filter(([c, v]) => JSON.stringify(cur[c] ?? null) !== JSON.stringify(v)).map(([c, v]) => [c, { from: cur[c] ?? null, to: v }]));
    return [{ ...k, target, changed }];
  });

  // ─── 4. Project the result ─────────────────────────────────────────────────
  const remaining = members.filter((m) => !touched.has(m.id));
  const extraKeys = new Map<string, Set<string>>();
  for (const m of dec.merge) {
    const drop = byId.get(m.drop);
    if (drop) extraKeys.set(m.keep, new Set([...(extraKeys.get(m.keep) ?? []), ...memberKeys(drop)]));
  }
  const matches = matchRows(rows, remaining.filter((m) => !keptIds.has(m.id)), extraKeys);
  const rowsByMember = new Map<string, number[]>();
  for (const x of matches) if (x.memberId) rowsByMember.set(x.memberId, [...(rowsByMember.get(x.memberId) ?? []), x.row]);

  // A member claimed by several clients keeps the client whose name ranks best; the others get their own member.
  const addRows: { row: number; why: string }[] = matches.filter((x) => !x.memberId).map((x) => ({ row: x.row, why: `new: ${x.how}` }));
  for (const [mid, rs] of rowsByMember) {
    if (rs.length < 2) continue;
    const m = byId.get(mid)!;
    const keepRow = rs.reduce((a, b) => (better(rank(rows[b]["Client Name"], m), rank(rows[a]["Client Name"], m)) ? b : a));
    for (const r of rs) if (r !== keepRow) addRows.push({ row: r, why: `separate client sharing a phone with "${m.full_name}"` });
  }

  // ─── 5. New members, built from their rows, checked by the app's own schema ─────
  const takenMain = new Set(remaining.map((m) => m.primary_phone).filter(Boolean) as string[]);
  const newMembers = addRows.map(({ row, why }) => {
    const r = rows[row] as SmRow;
    const name = r["Client Name"];
    const numbers = r["Phone Number"].split(/[/,;]/).map((p) => p.trim()).filter((p) => p.replace(/\D/g, "").length >= 7);
    const e164 = numbers.map(toE164);
    for (let i = 0; i < numbers.length; i++) if (!e164[i]) problems.push(`"${name}": the number "${numbers[i]}" is not a valid phone`);
    let main = e164[0] ?? null;
    let others = e164.slice(1).filter(Boolean) as string[];
    if (main && takenMain.has(main)) { others = [main, ...others]; main = null; }
    if (main) takenMain.add(main);
    const group = r.Group.trim();
    const queendom = group && group !== "Unassigned" ? qdByName.get(group.toLowerCase()) ?? null : null;
    if (group && group !== "Unassigned" && !queendom) problems.push(`"${name}": no Serene queendom is named "${group}"`);
    const start = toIsoDate(r["Start Date"]), end = toIsoDate(r["End Date"]), amount = toAmount(r["Amount (INR)"]);
    if (r["Start Date"].trim() && !start) problems.push(`"${name}": the start date "${r["Start Date"]}" is not DD/MM/YYYY`);
    if (r["End Date"].trim() && !end) problems.push(`"${name}": the end date "${r["End Date"]}" is not DD/MM/YYYY`);
    if (r["Amount (INR)"].trim() && amount === null) problems.push(`"${name}": the amount "${r["Amount (INR)"]}" is not a number`);
    const type = r["Membership Type"].trim() || null;
    const tier = tierFromLabel(type);
    if (type && !tier) problems.push(`"${name}": "${type}" is not a membership type Serene knows`);
    const check = CreateMemberSchema.safeParse({
      full_name: name, primary_phone: main, queendom_id: queendom, tier,
      membership_status: r.Status.trim() || null, membership_start: start, membership_end: end, membership_amount_inr: amount,
    });
    if (!check.success) problems.push(`"${name}": ${firstIssue(check.error)}`);
    const v = check.success ? check.data : null;
    return {
      why,
      row: {
        full_name: v?.full_name ?? sanitizeText(name),
        primary_phone: main,
        alt_phones: [...new Set(others)],
        queendom_id: queendom,
        tier,
        membership_type: type,
        membership_status: v?.membership_status ?? (r.Status.trim() || null),
        membership_amount_inr: amount,
        membership_start: start,
        membership_end: end,
        sources: ["subscription_export"],
        import_raw: { subscription_export: [r], added_by: "scripts/members/match-subscription-manager.ts", added_on: stamp },
      },
    };
  });

  // The full simulation: the result must be one member per client (the kept members none), by the same test the verification uses.
  const projected: Member[] = [
    ...remaining.map((m) => ({ ...m, alt_phones: [...(m.alt_phones ?? []), ...(extraKeys.get(m.id) ?? [])] })),
    ...newMembers.map((n, i) => ({ id: `new-${i}`, ...n.row } as unknown as Member)),
  ];
  const expected = rows.length + keptIds.size;
  const sim = oneToOne(rows, projected, undefined, keptIds);
  if (projected.length !== expected) problems.push(`the result would be ${projected.length} members, not ${expected} (${rows.length} clients + ${keptIds.size} kept)`);
  for (const n of sim.unmatched) problems.push(`after the clean-up, client "${n}" would match no member`);
  for (const n of sim.shared) problems.push(`after the clean-up, member "${n}" would match several clients`);
  for (const n of sim.orphans) problems.push(`after the clean-up, member "${n}" would match no client`);
  for (const n of sim.keptButMatched) problems.push(`"${n}" is on the keep list but matches a Subscription Manager client: it is a client, not a kept member`);

  // ─── 6. The database's own list of linked tables; what blocks or carries ───
  const children = await fkChildren(db);
  const listed = new Set(LINKED.map((l) => `${l.schema}.${l.table}`));
  for (const c of children) {
    if (!listed.has(`${c.schema_name}.${c.table_name}`)) problems.push(`${c.schema_name}.${c.table_name} points at members but is not in the backup list (LINKED in sm-match-lib.ts): add it first`);
    if (["restrict", "no action"].includes(c.on_delete) && removeIds.length) {
      const blocking = await rowsFor(db, c.schema_name, c.table_name, removeIds, c.column_name, c.column_name);
      for (const id of new Set(blocking.map((b) => b[c.column_name] as string))) {
        problems.push(`"${dec.remove.find((x) => x.id === id)?.name}" has ${blocking.filter((b) => b[c.column_name] === id).length} row(s) in ${c.schema_name}.${c.table_name}, which does not allow the member to be deleted: merge it into its client instead, or move those rows first`);
      }
    }
  }
  const present = new Set(children.map((c) => `${c.schema_name}.${c.table_name}`));
  if (removeIds.length && present.has("sia.joker_openings")) {
    const jo = await rowsFor(db, "sia", "joker_openings", removeIds, "id");
    for (const id of new Set(jo.map((j) => j.member_id as string))) problems.push(`"${dec.remove.find((x) => x.id === id)?.name}" has Jokers items; removing the member deletes them (their messages and replies are not in the backup): merge instead, or decide first`);
  }
  const vault = await rowsFor(db, "member", "member_vault", [...touched, ...keptIds], "id");
  const vaultOf = (id: string) => vault.filter((v) => v.member_id === id);
  const removeWithVault = dec.remove.filter((x) => vaultOf(x.id).length);
  const mergeWithVault = dec.merge.filter((x) => vaultOf(x.drop).length);
  if (removeWithVault.length && !has("--allow-vault-delete")) {
    problems.push(`${removeWithVault.length} member(s) to remove hold vault items (${removeWithVault.map((x) => `${x.name}: ${vaultOf(x.id).length}`).join(", ")}); removing them deletes Serene's copy (the backup keeps it). Decide, then pass --allow-vault-delete`);
  }
  useTargetVaultKey(t);
  const { decryptSecret, encryptSecret } = await import("../../src/lib/utils/vault-crypto");
  for (const x of mergeWithVault) {
    for (const v of vaultOf(x.drop)) {
      try { decryptSecret(v as { ciphertext: string; nonce: string; key_version: number }, x.drop); }
      catch { problems.push(`vault item ${v.id} of "${x.drop_name}" does not open with this vault key (MEMBER_VAULT_KEY in the ${t.name === "prod" ? "--prod-env file" : "local env"}); it cannot be re-sealed for "${x.sm_client}"`); }
    }
  }
  if (APPLY && t.name === "prod" && ageHours > 24 && !has("--allow-old-export")) {
    problems.push(`the export file is ${ageHours.toFixed(0)} h old; download the Clients CSV again today (or pass --allow-old-export)`);
  }

  // ─── 7. The plan ───────────────────────────────────────────────────────────
  const keeperIdConflicts = dec.merge.flatMap((x) => {
    const k = byId.get(x.keep)!, d = byId.get(x.drop)!;
    return (["freshdesk_contact_id", "zoho_customer_id", "app_member_id"] as const)
      .filter((c) => k[c] && d[c] && k[c] !== d[c])
      .map((c) => `${x.drop_name} → ${x.sm_client}: both have a ${c}; the kept member keeps its own, the other is recorded in its merge record`);
  });
  const plan = {
    target: t.name, members_now: members.length, clients_in_export: rows.length, already_done: alreadyDone,
    remove: dec.remove.map((x) => ({ ...x, vault_items: vaultOf(x.id).length })),
    merge: dec.merge.map((x) => ({ ...x, keep_name: byId.get(x.keep)?.full_name, vault_items: vaultOf(x.drop).length })),
    keep: keepPlan.map((k) => ({ id: k.id, name: k.name, why: k.why, changes: k.changed, vault_items: vaultOf(k.id).length })),
    add: newMembers.map((n) => ({ name: n.row.full_name, why: n.why })),
    identifier_notes: keeperIdConflicts, members_after: projected.length, problems,
  };
  writeFileSync(join(OUT, `plan-${t.name}-${stamp}.json`), JSON.stringify(plan, null, 1));
  console.log(`\nPlan: remove ${dec.remove.length}, merge ${dec.merge.length}, keep ${keepPlan.length}, add ${newMembers.length} → ${projected.length} members (the export has ${rows.length} clients; ${keptIds.size} kept).`);
  for (const k of keepPlan) {
    const ch = Object.entries(k.changed).map(([c, v]) => `${c} ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`);
    console.log(`  keep: ${k.name} (${vaultOf(k.id).length} vault item(s) stay) — ${ch.length ? ch.join(", ") : "already as decided"}`);
  }
  for (const n of newMembers) console.log(`  add: ${n.row.full_name} — ${n.why}`);
  if (removeWithVault.length) console.log(`  vault items on members to remove: ${removeWithVault.map((x) => `${x.name} (${vaultOf(x.id).length})`).join(", ")}`);
  if (mergeWithVault.length) console.log(`  vault items re-sealed on merge: ${mergeWithVault.map((x) => `${x.drop_name} → ${x.sm_client} (${vaultOf(x.drop).length})`).join(", ")}`);
  for (const n of keeperIdConflicts) console.log(`  note: ${n}`);
  if (problems.length) {
    console.log(`\nNOT READY (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
    if (APPLY) fail("Refusing to apply until every problem above is resolved.");
  } else console.log(`\nReady: one member per Subscription Manager client${keptIds.size ? `, plus ${keptIds.size} kept` : ""}.`);
  if (!APPLY) { console.log(`\nDry run only. Plan written to ${OUT}.`); return; }

  // ─── 8. Backup (before any write) ──────────────────────────────────────────
  const affected = [...new Set([...touched, ...dec.merge.map((x) => x.keep), ...keptIds])];
  const linked: Record<string, unknown[]> = {};
  for (const l of LINKED) linked[`${l.schema}.${l.table}`] = await rowsFor(db, l.schema, l.table, affected, l.pk, "member_id", l.optional);
  linked["member.member_relations#entity"] = await rowsFor(db, "member", "member_relations", affected, "id", "entity_id");
  const intakeIds = (linked["sia.intake_proposals"] as { id: string }[]).map((p) => p.id);
  linked["sia.draft_reviews#proposal"] = intakeIds.length ? await rowsFor(db, "sia", "draft_reviews", intakeIds, "id", "proposal_id") : [];
  const logs: Record<string, unknown[]> = {};
  for (const l of LOGS) logs[`${l.schema}.${l.table}`] = await rowsFor(db, l.schema, l.table, affected, "id");
  const backupFile = join(OUT, `backup-${t.name}-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify({ taken_at: new Date().toISOString(), target: t.name, run_log: runLog, decisions: dec, members: members.filter((m) => affected.includes(m.id)), linked, logs }));
  writeFileSync(join(OUT, `members-before-${t.name}-${stamp}.json`), JSON.stringify(members));
  console.log(`\nBackup written: ${backupFile}`);
  markWritesStarted(`Every completed step is in ${runLog}. Re-running the same command finishes the job; restore-members.ts --backup ${backupFile} undoes what was done.`);

  // ─── 9. Merges: one transaction each, vault items re-sealed inside it ──────
  for (const m of dec.merge) {
    const p_vault = vaultOf(m.drop).map((v) => ({ id: v.id, ...encryptSecret(decryptSecret(v as { ciphertext: string; nonce: string; key_version: number }, m.drop), m.keep) }));
    const { data, error } = await db.schema("member").rpc("merge_members", { p_keep: m.keep, p_drop: m.drop, p_vault });
    logLine(runLog, { step: "merge", drop: m.drop, keep: m.keep, ok: !error, error: error?.message, result: data ?? undefined });
    if (error) fail(`Merging "${m.drop_name}" into "${m.sm_client}" failed: ${error.message}`);
    console.log(`  merged ${m.drop_name} → ${m.sm_client}`);
  }
  // ─── 10. Removals ──────────────────────────────────────────────────────────
  for (const x of dec.remove) {
    const { error } = await db.schema("member").from("members").delete().eq("id", x.id);
    logLine(runLog, { step: "remove", id: x.id, ok: !error, error: error?.message });
    if (error) fail(`Removing "${x.name}" failed: ${error.message}`);
    console.log(`  removed ${x.name}`);
  }
  // ─── 11. Kept members: only the fields that differ from what was decided ───
  for (const k of keepPlan) {
    if (!Object.keys(k.changed).length) { console.log(`  kept ${k.name} (already as decided)`); continue; }
    const patch = { ...Object.fromEntries(Object.entries(k.changed).map(([c, v]) => [c, v.to])), updated_at: new Date().toISOString() };
    const { error } = await db.schema("member").from("members").update(patch).eq("id", k.id);
    logLine(runLog, { step: "keep", id: k.id, ok: !error, changed: k.changed, error: error?.message });
    if (error) fail(`Setting the membership of "${k.name}" failed: ${error.message}`);
    console.log(`  kept ${k.name}: ${Object.keys(k.changed).join(", ")}`);
  }
  // ─── 12. Additions ─────────────────────────────────────────────────────────
  for (const n of newMembers) {
    const { data, error } = await db.schema("member").from("members").insert(n.row).select("id").single();
    logLine(runLog, { step: "add", name: n.row.full_name, ok: !error, id: data?.id, error: error?.message });
    if (error) fail(`Adding "${n.row.full_name}" failed: ${error.message}`);
    console.log(`  added ${n.row.full_name}`);
  }

  // ─── 13. Verify ────────────────────────────────────────────────────────────
  const after = await readMembers(db);
  const check = oneToOne(rows, after, undefined, keptIds);
  const afterById = new Map(after.map((m) => [m.id, m]));
  const changedUntouched = members
    .filter((m) => !affected.includes(m.id))
    .flatMap((m) => {
      const a = afterById.get(m.id);
      if (!a) return [`${m.full_name}: missing`];
      const cols = Object.keys(m).filter((c) => JSON.stringify(m[c]) !== JSON.stringify(a[c]));
      return cols.length ? [`${m.full_name}: ${cols.join(", ")}`] : [];
    });
  const keptWrong = keepPlan.flatMap((k) => {
    const a = afterById.get(k.id);
    if (!a) return [`${k.name}: missing`];
    const cols = Object.entries(k.target).filter(([c, v]) => JSON.stringify(a[c] ?? null) !== JSON.stringify(v)).map(([c]) => c);
    return cols.length ? [`${k.name}: ${cols.join(", ")}`] : [];
  });
  const ok = after.length === expected && !check.unmatched.length && !check.shared.length && !check.orphans.length
    && !check.keptButMatched.length && !keptWrong.length && !changedUntouched.length;
  const result = {
    members_after: after.length, clients: rows.length, kept: keptIds.size, clients_without_member: check.unmatched,
    members_shared_by_clients: check.shared, members_without_client: check.orphans, kept_but_matched: check.keptButMatched,
    kept_not_as_decided: keptWrong, untouched_members_changed: changedUntouched, ok,
  };
  writeFileSync(join(OUT, `result-${t.name}-${stamp}.json`), JSON.stringify(result, null, 1));
  console.log(`\nResult: ${JSON.stringify(result)}`);
  if (!ok) fail(`The result does not verify (see result-${t.name}-${stamp}.json). A changed member may just be someone's edit during the run; restore-members.ts can put records back from ${backupFile}.`);
  console.log(`\nVerified: one member per Subscription Manager client${keptIds.size ? `, ${keptIds.size} kept as decided` : ""}, and every other member unchanged.`);
}

main().catch((e) => fail(`Stopped: ${e instanceof Error ? e.message : String(e)}`));
