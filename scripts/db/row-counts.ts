/**
 * Row counts for every table in every schema — the before/after proof for a schema move
 * (docs/architecture/schema-restructure-plan.md §5). Reads the table list from the
 * generated types so it never goes stale, then asks PostgREST for an exact count per
 * table with the service key (HEAD request, no rows transferred).
 *
 *   npx tsx scripts/db/row-counts.ts > before.txt
 *   npx tsx scripts/db/row-counts.ts --compare before.txt after.txt
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (production), or override with
 * SUPABASE_URL + SUPABASE_SERVICE_KEY for the local rehearsal stack.
 *
 * Output: one line per table, `schema<TAB>table<TAB>count`, sorted. `--compare` matches by
 * bare table name so a table that changed schema still lines up; a `--rename old=new`
 * pair (repeatable) maps a renamed table. Exit 1 on any mismatch.
 *
 * `--profile typed=actual` (repeatable): ask PostgREST for tables the TYPES place in schema
 * `typed` on profile `actual` instead — the "before" printout of a schema move, taken while
 * the code already says `member` but production still has the tables in `public`:
 *   npx tsx scripts/db/row-counts.ts --profile member=public > before.txt
 */
import { readFileSync } from "fs";
import { join } from "path";

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function tablesBySchema(): Record<string, string[]> {
  const src = readFileSync(join(process.cwd(), "src/lib/types/database.ts"), "utf8").split("\n");
  const out: Record<string, string[]> = {};
  let schema: string | null = null;
  let section: string | null = null;
  for (const line of src) {
    const s = /^  (\w+): \{$/.exec(line);
    if (s) { schema = s[1]; section = null; continue; }
    const sec = /^    (Tables|Views|Functions|Enums|CompositeTypes): /.exec(line);
    if (sec) { section = sec[1]; continue; }
    const t = /^      (\w+): \{$/.exec(line);
    if (t && schema && section === "Tables" && schema !== "__InternalSupabase" && schema !== "graphql_public") {
      // PostgREST does not expose partition children (member_events_2025_05, wag_messages_default…);
      // the parent's count already includes every slice.
      if (/_\d{4}_\d{2}$/.test(t[1]) || /_default$/.test(t[1])) continue;
      (out[schema] ??= []).push(t[1]);
    }
  }
  return out;
}

async function count(schema: string, table: string): Promise<number | string> {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
    method: "HEAD",
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "Accept-Profile": schema,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const cr = res.headers.get("content-range");
  // 406 = PostgREST does not expose this schema. During a schema move that means the
  // migration is not pushed yet: take the "before" printout with --profile <typed>=public.
  if (res.status === 406) return `ERR 406 schema '${schema}' not exposed — migration not pushed?`;
  if (res.status === 404) return `ERR 404 no table '${table}' in schema '${schema}'`;
  if (!res.ok || !cr) return `ERR ${res.status}`;
  return Number(cr.split("/")[1]);
}

function parseFile(path: string): Map<string, { schema: string; count: string }> {
  const m = new Map<string, { schema: string; count: string }>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const [schema, table, c] = line.split("\t");
    m.set(table, { schema, count: c });
  }
  return m;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--compare") {
    const [, a, b, ...rest] = args;
    const renames = new Map<string, string>();
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--rename") { const [o, n] = rest[++i].split("="); renames.set(o, n); }
    }
    const before = parseFile(a);
    const after = parseFile(b);
    const unexposed = new Set<string>();
    let bad = 0;
    for (const [table, row] of before) {
      const target = renames.get(table) ?? table;
      const other = after.get(target);
      if (!other) { console.log(`MISSING  ${row.schema}.${table} (${row.count}) — not in after`); bad++; continue; }
      if (other.count !== row.count) { console.log(`DIFF     ${table}: ${row.count} → ${other.count}`); bad++; }
      if (String(other.count).startsWith("ERR 406")) unexposed.add(other.schema);
      after.delete(target);
    }
    for (const [table, row] of after) { console.log(`NEW      ${row.schema}.${table} (${row.count}) — not in before`); bad++; }
    console.log(bad === 0 ? `OK — ${before.size} tables match` : `${bad} problem(s)`);
    for (const schema of unexposed) {
      console.log(
        `\nNOTE: schema '${schema}' is not exposed by PostgREST, so every table the types place ` +
        `there reported ERR 406.\n      That is what a not-yet-pushed schema move looks like — ` +
        `push the migration first, or take the\n      baseline with --profile ${schema}=public.`,
      );
    }
    process.exit(bad === 0 ? 0 : 1);
  }
  if (!URL_ || !KEY) { console.error("Missing SUPABASE url/key env"); process.exit(2); }
  const profile = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile") { const [t, a] = args[++i].split("="); profile.set(t, a); }
  }
  const by = tablesBySchema();
  const lines: string[] = [];
  for (const schema of Object.keys(by).sort()) {
    for (const table of by[schema].sort()) {
      lines.push(`${schema}\t${table}\t${await count(profile.get(schema) ?? schema, table)}`);
    }
  }
  console.log(lines.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(2); });
