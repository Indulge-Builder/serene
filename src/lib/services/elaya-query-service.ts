// elaya-query-service.ts — THE "ask the database" seam (migration 0223). SERVER ONLY.
//
// The model writes a SELECT; this file is the ONLY thing that runs one. It never touches a real
// table: public.elaya_run_query() executes the text as the login-less role `elaya_reader`, which
// can see only the cleaned views of schema `elaya_read`, inside a READ ONLY transaction, as a
// wrapped sub-select, row-capped (the four locks are described in the migration). The caller is
// the trust boundary (Q-13): elaya-data.ts admits founder and admin only. Every query, good or
// refused, is appended to public.elaya_query_log (Rule 08: never updated or deleted).

import { createAdminClient } from '@/lib/supabase/admin';

export type ElayaQueryResult =
  | { ok: true; rows: Record<string, unknown>[]; row_count: number; truncated: boolean; row_cap: number; duration_ms: number }
  | { ok: false; error: string; duration_ms: number };

export type ElayaQueryLogInput = {
  userId: string;
  channel: string;
  purpose: string | null;
  sql: string;
  result: ElayaQueryResult;
};

// 0223's function and table are not in the generated types until the next regen; one loose handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { rpc: (f: string, a: Record<string, unknown>) => any; from: (t: string) => any };
const admin = (): Loose => createAdminClient() as unknown as Loose;

export const ELAYA_QUERY_DEFAULT_ROWS = 100;
export const ELAYA_QUERY_MAX_ROWS = 300;
/** The MCP connector's export_rows cap (0231 raised the SQL clamp to match). Founder/admin, logged. */
export const ELAYA_EXPORT_MAX_ROWS = 5000;

/** Run ONE read-only SELECT over the elaya_read views. Never throws: a refused or broken query is a result.
 *  `hardCap` is the chat tool's 300 unless the export path passes ELAYA_EXPORT_MAX_ROWS. */
export async function runElayaQuery(sql: string, maxRows = ELAYA_QUERY_DEFAULT_ROWS, hardCap = ELAYA_QUERY_MAX_ROWS): Promise<ElayaQueryResult> {
  const started = Date.now();
  const cap = Math.min(Math.max(Math.trunc(maxRows) || ELAYA_QUERY_DEFAULT_ROWS, 1), hardCap);
  try {
    const { data, error } = await admin().rpc('elaya_run_query', { p_sql: sql, p_max_rows: cap });
    const duration_ms = Date.now() - started;
    if (error) return { ok: false, error: String(error.message ?? 'query failed').slice(0, 400), duration_ms };
    const d = (data ?? {}) as { rows?: Record<string, unknown>[]; row_count?: number; truncated?: boolean; row_cap?: number };
    return { ok: true, rows: d.rows ?? [], row_count: Number(d.row_count ?? 0), truncated: Boolean(d.truncated), row_cap: Number(d.row_cap ?? cap), duration_ms };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 400) : 'query failed', duration_ms: Date.now() - started };
  }
}

/** Append one row to the query log. Best effort: a log failure never fails the answer, but it is loud. */
export async function logElayaQuery(input: ElayaQueryLogInput): Promise<void> {
  const r = input.result;
  const { error } = await admin().from('elaya_query_log').insert({
    user_id: input.userId,
    channel: input.channel,
    purpose: input.purpose,
    sql: input.sql.slice(0, 8000),
    ok: r.ok,
    error: r.ok ? null : r.error,
    row_count: r.ok ? r.row_count : null,
    truncated: r.ok ? r.truncated : null,
    duration_ms: r.duration_ms,
  });
  if (error) console.error('[elaya-query-service] query log insert failed:', error.message);
}

export type ElayaCatalogView = { view: string; about: string | null; columns: string };

/** The catalog the model reads before writing SQL: every view, what it is, its columns and types. */
export async function getElayaCatalog(): Promise<ElayaCatalogView[] | null> {
  const r = await runElayaQuery(
    // Compact on purpose (the tool result cap is 12,000 chars): a text column is just its name,
    // other types are shortened. ts = timestamp with time zone (UTC).
    "select view_name, max(about) as about, string_agg(case when data_type = 'text' then column_name else column_name || ':' || " +
      "replace(replace(replace(replace(replace(data_type, 'timestamp with time zone', 'ts'), 'boolean', 'bool'), 'integer', 'int'), 'character varying', 'text'), 'double precision', 'float') end, " +
      "', ' order by position) as columns from data_dictionary group by view_name order by view_name",
    ELAYA_QUERY_MAX_ROWS,
  );
  if (!r.ok) {
    console.error('[elaya-query-service] catalog read failed:', r.error);
    return null;
  }
  return r.rows.map((row) => ({ view: String(row.view_name), about: (row.about as string | null) ?? null, columns: String(row.columns) }));
}
