/**
 * sm-match-lib.ts — the shared pieces of the Subscription Manager clean-up (2026-09-29):
 * the two database ends, the member ↔ Subscription Manager matcher, the tables that point at a
 * member, and the run log. Used by match-subscription-manager.ts (the clean-up) and
 * restore-members.ts (its undo). Nothing here writes to a database.
 *
 * The matcher is the one the 2026-09-29 reconciliation proved on the live data (573 clients ↔ 622
 * members): a phone match first (the last 10 digits of every number on either side, so
 * "+91 98200 50000", "9820050000" and "98200 50000 / 9812345678" all meet), then, among several
 * candidates, the exact name, the closest name, and a member that came from a Subscription
 * Manager file; with no phone match, a name that matches exactly one member.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "fs";
import { execSync } from "child_process";
import { isAbsolute, join, relative, resolve, sep } from "path";
import { parse } from "csv-parse/sync";

// ─── Arguments and stopping ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
export const flag = (n: string): string | null => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
export const flags = (n: string): string[] => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]] : []));
export const has = (n: string): boolean => argv.includes(n);

let writesStarted: string | null = null;
/** Called just before the first write: from then on a stop says plainly that changes were made, and what to do. */
export function markWritesStarted(whatNext: string) { writesStarted = whatNext; }

export function fail(message: string): never {
  console.error(`\n${message}`);
  console.error(writesStarted ? `CHANGES WERE MADE before this stop. ${writesStarted}` : "Nothing was changed.");
  process.exit(1);
}

// ─── The two ends ────────────────────────────────────────────────────────────
export type Target = { name: "prod" | "local"; url: string; key: string; env: Record<string, string | undefined> };

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };
const isLocalUrl = (u: string) => ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostOf(u));

/**
 * `--target prod` reads the live pair from its own env file (`--prod-env`, default
 * .env.local.prod-backup), never from process.env. `--target local` uses process.env (run with
 * --env-file=.env.local) and refuses anything that is not a local database.
 */
export function openTarget(): Target {
  const name = flag("--target");
  if (name === "prod") {
    const env = readEnvFile(flag("--prod-env") ?? ".env.local.prod-backup");
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "", key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !key) fail("Could not read NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the --prod-env file.");
    if (isLocalUrl(url)) fail("--target prod points at a local database. Use --target local for that.");
    return { name, url, key, env };
  }
  if (name === "local") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!isLocalUrl(url)) fail(`--target local, but NEXT_PUBLIC_SUPABASE_URL points at "${hostOf(url)}". Run with --env-file=.env.local.`);
    return { name, url, key, env: { ...process.env } };
  }
  return fail("Say which database: --target local (the rehearsal) or --target prod.");
}

export function client(t: Target): SupabaseClient {
  return createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The vault key used for re-sealing is exactly the target's: each of the three variables is set from it or cleared. */
export function useTargetVaultKey(t: Target) {
  for (const k of ["MEMBER_VAULT_KEY", "MEMBER_VAULT_KEY_VERSION", "MEMBER_VAULT_KEY_PREVIOUS"]) {
    if (t.env[k]) process.env[k] = t.env[k];
    else delete process.env[k];
  }
}

/** Every output holds names and phones: it must live OUTSIDE the repository. */
export function outDir(): string {
  const dir = flag("--out");
  if (!dir) fail("Give --out <folder outside the repository> (for example Desktop\\serene-backups\\members-2026-09-29).");
  let root = resolve(".");
  try { root = resolve(execSync("git rev-parse --show-toplevel", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); } catch { /* not a git checkout */ }
  const abs = resolve(dir);
  const rel = relative(root, abs);
  const outside = isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`);
  if (!outside) fail(`--out ${abs} is inside the repository (${root}). It holds names and phones; choose a folder outside it.`);
  return abs;
}

// ─── Reading ─────────────────────────────────────────────────────────────────
export const MEMBER_COLS =
  "id,full_name,primary_phone,alt_phones,freshdesk_contact_id,zoho_customer_id,app_member_id,wa_invite_link,wa_group_jid,membership_type,membership_status,membership_amount_inr,membership_start,membership_end,identity_status,sources,import_raw,created_at,updated_at,queendom_id,tier,consent";

export type Member = {
  id: string; full_name: string; primary_phone: string | null; alt_phones: string[]; sources: string[];
  freshdesk_contact_id: string | null; zoho_customer_id: string | null; app_member_id: string | null; wa_invite_link: string | null;
  queendom_id: string | null; import_raw: Record<string, unknown>; [k: string]: unknown;
};

/** PostgREST says a table is absent (not created on this database yet, e.g. the Jokers tables before their PR). */
const isMissingTable = (e: { code?: string; message?: string }) => e.code === "PGRST205" || e.code === "42P01" || /Could not find the table/i.test(e.message ?? "");

/** Every row of a table/filter, paged past PostgREST's 1,000-row response cap on a stable order (`orderBy` = the key, "a,b" for a two-column key). */
export async function readAll<T>(db: SupabaseClient, schema: string, table: string, select: string, orderBy: string,
  filter?: (q: any) => any, optional = false): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.schema(schema).from(table).select(select);
    for (const c of orderBy.split(",")) q = q.order(c);
    q = q.range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) {
      if (optional && isMissingTable(error)) return out;
      throw new Error(`${schema}.${table}: ${error.message}`);
    }
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export const readMembers = (db: SupabaseClient) => readAll<Member>(db, "member", "members", MEMBER_COLS, "id");

export type SmRow = Record<string, string> & { "Client Name": string; "Phone Number": string; Group: string };

/** The Subscription Manager Clients export (the old app's own CSV: BOM, quoted fields). */
export function readSmCsv(path: string): { rows: SmRow[]; ageHours: number } {
  const rows = parse(readFileSync(path, "utf8"), { columns: true, bom: true, skip_empty_lines: true, trim: false }) as SmRow[];
  for (const need of ["Client Name", "Phone Number", "Group", "Membership Type", "Amount (INR)", "Start Date", "End Date", "Status"]) {
    if (!rows.length || !(need in rows[0])) fail(`${path} is not a Subscription Manager Clients export: the "${need}" column is missing.`);
  }
  return { rows, ageHours: (Date.now() - statSync(path).mtimeMs) / 3_600_000 };
}

/**
 * What a kept member becomes (a member who is not a Subscription Manager client but stays, e.g. the
 * founders as Celebrity members). `queendom` is a queendom NAME (ids differ between databases);
 * the tier follows the membership type (tierFromLabel), as it does for every imported member.
 */
export const KEEP_FIELDS = ["queendom", "membership_type", "membership_status", "membership_amount_inr", "membership_start", "membership_end"] as const;
export type KeepSet = Partial<Record<(typeof KEEP_FIELDS)[number], string | number | null>>;

export type Decisions = {
  remove: { id: string; name: string; why: string }[];
  merge: { drop: string; drop_name: string; keep: string; sm_client: string; why: string }[];
  keep: { id: string; name: string; why: string; set: KeepSet }[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The owner's decisions, checked for shape: a mistyped id or key is a stop, never a silent skip. */
export function readDecisions(path: string): Decisions {
  const d = JSON.parse(readFileSync(path, "utf8")) as Decisions;
  d.keep ??= [];
  if (!Array.isArray(d.remove) || !Array.isArray(d.merge) || !Array.isArray(d.keep)) fail(`${path}: expected "remove", "merge" and (optionally) "keep" lists.`);
  for (const x of d.remove) if (!UUID.test(String(x.id)) || !x.name) fail(`${path}: a removal needs a member "id" (uuid) and a "name": ${JSON.stringify(x)}`);
  for (const x of d.merge) if (!UUID.test(String(x.drop)) || !UUID.test(String(x.keep)) || !x.drop_name || !x.sm_client) fail(`${path}: a merge needs "drop" and "keep" (uuids), "drop_name" and "sm_client": ${JSON.stringify(x)}`);
  for (const x of d.keep) {
    if (!UUID.test(String(x.id)) || !x.name || !x.set || typeof x.set !== "object") fail(`${path}: a kept member needs an "id" (uuid), a "name" and a "set" object: ${JSON.stringify(x)}`);
    const unknown = Object.keys(x.set).filter((k) => !(KEEP_FIELDS as readonly string[]).includes(k));
    if (unknown.length) fail(`${path}: "${x.name}" sets ${unknown.join(", ")}; a kept member may set only ${KEEP_FIELDS.join(", ")}.`);
  }
  return d;
}

// ─── Matching ────────────────────────────────────────────────────────────────
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Every number in a cell ("a / b", "a, b"), as a comparable key. */
export function phoneKeys(raw: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const part of (raw ?? "").split(/[/,;]| or /)) {
    const d = digits(part);
    if (d.length >= 10) keys.add(d.slice(-10));
    else if (d.length >= 7) keys.add(d);
  }
  return keys;
}
export const memberKeys = (m: Pick<Member, "primary_phone" | "alt_phones">) =>
  new Set([...phoneKeys(m.primary_phone), ...(m.alt_phones ?? []).flatMap((p) => [...phoneKeys(p)])]);

const HONORIFICS = new Set(["mr", "mrs", "ms", "dr", "miss", "shri", "smt"]);
const FILLER = new Set(["s", "concierge", "and", "the", "private", "personal"]);
export const normName = (s: string) =>
  s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !HONORIFICS.has(w)).join(" ");
const nameTokens = (s: string) => new Set(normName(s).split(" ").filter((w) => w.length > 1 && !FILLER.has(w)));
function nameScore(a: string, b: string): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.size || !tb.size) return 0;
  if (normName(a) === normName(b)) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
const FROM_SM = ["subscription_export", "sheet_subscription"];
/** Exact name first, then the closest name, then a member that came from a Subscription Manager file. */
export function rank(smName: string, m: Pick<Member, "full_name" | "sources">): number[] {
  return [normName(smName) === normName(m.full_name) ? 1 : 0, nameScore(smName, m.full_name), m.sources?.some((s) => FROM_SM.includes(s)) ? 1 : 0];
}
export const better = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

export type Match = { row: number; memberId: string | null; how: string };

/**
 * Match every Subscription Manager row to one of `members`. `extraKeys` adds numbers a member will
 * hold after the clean-up (a merged record's phones), so the projection sees what the result will.
 */
export function matchRows(rows: SmRow[], members: Member[], extraKeys = new Map<string, Set<string>>()): Match[] {
  const byKey = new Map<string, Member[]>();
  for (const m of members) {
    for (const k of new Set([...memberKeys(m), ...(extraKeys.get(m.id) ?? [])])) byKey.set(k, [...(byKey.get(k) ?? []), m]);
  }
  return rows.map((r, row) => {
    const cands = [...new Map([...phoneKeys(r["Phone Number"])].flatMap((k) => byKey.get(k) ?? []).map((m) => [m.id, m])).values()];
    if (cands.length === 1) return { row, memberId: cands[0].id, how: "phone" };
    if (cands.length > 1) {
      const best = cands.reduce((a, b) => (better(rank(r["Client Name"], b), rank(r["Client Name"], a)) ? b : a));
      return { row, memberId: best.id, how: `phone, ${cands.length} members share it, closest name` };
    }
    const exact = members.filter((m) => normName(m.full_name) === normName(r["Client Name"]));
    if (exact.length === 1) return { row, memberId: exact[0].id, how: "exact name (no phone match)" };
    return { row, memberId: null, how: exact.length > 1 ? "several members have this exact name" : "no member" };
  });
}

/**
 * The one-to-one test the plan and the verification both use. `kept` = members who stay without a
 * client (the owner's keep list): they are expected to match no client, and one that does is named.
 */
export function oneToOne(rows: SmRow[], members: Member[], extraKeys?: Map<string, Set<string>>, kept = new Set<string>()) {
  const m = matchRows(rows, members, extraKeys);
  const per = new Map<string, number>();
  for (const x of m) if (x.memberId) per.set(x.memberId, (per.get(x.memberId) ?? 0) + 1);
  return {
    unmatched: m.filter((x) => !x.memberId).map((x) => rows[x.row]["Client Name"]),
    shared: members.filter((mm) => (per.get(mm.id) ?? 0) > 1).map((mm) => mm.full_name),
    orphans: members.filter((mm) => !per.has(mm.id) && !kept.has(mm.id)).map((mm) => mm.full_name),
    keptButMatched: members.filter((mm) => kept.has(mm.id) && per.has(mm.id)).map((mm) => mm.full_name),
  };
}

// ─── Tables that point at a member ───────────────────────────────────────────
export type Linked = { schema: string; table: string; pk: string; optional?: boolean; generated?: string[] };
/**
 * Every table with a foreign key to member.members, with its primary key ("a,b" when it has two
 * columns) for backup and restore. The clean-up checks this list against the database's own
 * (member.member_fk_children) and stops if a table is missing. `optional` = may not exist yet on a
 * database (the Jokers tables before their PR); `generated` = computed columns, never inserted.
 * The order matters to the restore: a row is inserted after the rows it points at (documents
 * before chunks, intake cards before draft reviews).
 */
export const LINKED: Linked[] = [
  { schema: "member", table: "member_facts", pk: "id" },
  { schema: "member", table: "member_people", pk: "id" },
  { schema: "member", table: "member_relations", pk: "id" },
  { schema: "member", table: "member_documents", pk: "id" },
  { schema: "member", table: "member_chunks", pk: "id", generated: ["tsv"] },
  { schema: "member", table: "member_snapshot", pk: "member_id" },
  { schema: "member", table: "member_health_events", pk: "id" },
  { schema: "member", table: "member_anticipations", pk: "id" },
  { schema: "member", table: "member_vault", pk: "id" },
  { schema: "sia", table: "wag_groups", pk: "group_jid" },
  { schema: "sia", table: "wag_contacts", pk: "jid" },
  { schema: "sia", table: "tickets", pk: "id" },
  { schema: "sia", table: "intake_proposals", pk: "id" },
  { schema: "sia", table: "draft_reviews", pk: "id" },
  { schema: "sia", table: "joker_openings", pk: "id", optional: true },
  { schema: "sia", table: "client_activity_daily", pk: "group_jid,day", optional: true },
  { schema: "freshdesk", table: "contacts", pk: "id" },
  { schema: "freshdesk", table: "tickets", pk: "id" },
  { schema: "gia", table: "deals", pk: "id" },
  { schema: "public", table: "vendor_engagements", pk: "id" },
];
/** Append-only logs that carry a member id with no foreign key: backed up, never changed. */
export const LOGS: { schema: string; table: string }[] = [
  { schema: "member", table: "member_events" },
  { schema: "member", table: "member_access_log" },
  { schema: "member", table: "member_vault_access" },
  { schema: "sia", table: "extraction_runs" },
  { schema: "sia", table: "ticket_events" },
  { schema: "public", table: "elaya_alerts" },
];

export type FkChild = { schema_name: string; table_name: string; column_name: string; on_delete: string; single_column_to_id: boolean };
export async function fkChildren(db: SupabaseClient): Promise<FkChild[]> {
  const { data, error } = await db.schema("member").rpc("member_fk_children");
  if (error) fail(`member.member_fk_children() is not readable (${error.message}). Apply migration 0252 first.`);
  return (data ?? []) as FkChild[];
}

/** A row's key in a LINKED table ("a|b" for a two-column key). */
export const keyOf = (l: Pick<Linked, "pk">, r: Record<string, unknown>) => l.pk.split(",").map((c) => String(r[c])).join("|");

/** Rows of one table that belong to any of `ids` (chunked so the URL stays short). */
export async function rowsFor(db: SupabaseClient, schema: string, table: string, ids: string[], order: string,
  column = "member_id", optional = false): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    out.push(...(await readAll<Record<string, unknown>>(db, schema, table, "*", order, (q) => q.in(column, chunk), optional)));
  }
  return out;
}

// ─── The run log (one JSON line per completed step, written as it happens) ───
export type LogStep =
  | { step: "merge"; drop: string; keep: string; ok: boolean; error?: string; result?: unknown }
  | { step: "remove"; id: string; ok: boolean; error?: string }
  | { step: "keep"; id: string; ok: boolean; changed: Record<string, { from: unknown; to: unknown }>; error?: string }
  | { step: "add"; name: string; ok: boolean; id?: string; error?: string };
export const logLine = (file: string, s: LogStep) => appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...s }) + "\n");
/** Every step any earlier run in this folder completed. */
export function readLogs(dir: string, target: string): (LogStep & { at: string })[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`run-${target}-`) && f.endsWith(".jsonl"))
    .flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)));
}
