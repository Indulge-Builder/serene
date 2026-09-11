// THE admin-client RPC boundary (dry-audit 2026-06-20 D2): revoked-tier RPCs
// (EXECUTE revoked from authenticated, Q-13) called via createAdminClient with
// session-derived scope args. Owns the eslint-disabled `as any` cast (pending
// database.ts regen), uniform error logging, and the mapRows Q-18 boundary.
import { createAdminClient } from '@/lib/supabase/admin';
import { mapRows } from '@/lib/utils/rows';

export async function callAdminRpc<TRow, TOut>(
  rpc: string,
  params: Record<string, unknown>,
  mapRow: (row: TRow) => TOut,
  logCtx: string,
): Promise<TOut[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(rpc, params);
  if (error || !data) {
    if (error) console.error(`${logCtx} ${rpc} failed:`, error);
    return [];
  }
  return mapRows<TRow, TOut>(data as TRow[], mapRow);
}

/**
 * callAdminRpc for a set-returning RPC whose result may exceed PostgREST's
 * response cap. EVERY response — RPC included — is cut at db-max-rows (1,000
 * on Supabase) with no error: get_vendor_candidates returned 1,000 of 5,957 for
 * `dining` and said nothing. This pages with Range headers until a short page.
 *
 * The RPC MUST end in a deterministic ORDER BY. An OFFSET page over an
 * unordered result is whatever order THAT statement scanned in — the vendor
 * loader met exactly that (22 pages, 13,766 distinct rows of 21,580). A
 * function that cannot promise an order is not a candidate for this helper.
 */
export async function callAdminRpcAll<TRow, TOut>(
  rpc: string,
  params: Record<string, unknown>,
  mapRow: (row: TRow) => TOut,
  logCtx: string,
  pageSize = 1000,
): Promise<TOut[]> {
  const admin = createAdminClient();
  const out: TOut[] = [];
  for (let offset = 0; ; offset += pageSize) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).rpc(rpc, params).range(offset, offset + pageSize - 1);
    if (error || !data) {
      if (error) console.error(`${logCtx} ${rpc} (page at ${offset}) failed:`, error);
      break;
    }
    out.push(...mapRows<TRow, TOut>(data as TRow[], mapRow));
    if ((data as unknown[]).length < pageSize) break;
  }
  return out;
}
