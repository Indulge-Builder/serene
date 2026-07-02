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
