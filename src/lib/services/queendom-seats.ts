// queendom-seats.ts — who holds which seat in a queendom, for the jobs that run with no session
// (the ticket sentinel, the intake sweep). The seats live on PROFILES (sia_role + queendom_id,
// migration 0201); the seat columns on sia.queendoms are gone. Reading them there fails quietly,
// which is exactly what the sentinel did until 2026-09-19: its bishop and queen alerts went nowhere.
//
// Free of `server-only`: it runs from Trigger.dev. Pages use getQueendomRoster (profiles-service).

import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";

/** Queen and joker are one seat each; bishops (0242) and genies are many. */
export type QueendomSeats = { queen: string | null; bishops: string[]; joker: string | null; genies: string[] };

export async function getQueendomSeats(queendomId: string | null | undefined): Promise<QueendomSeats> {
  const empty: QueendomSeats = { queen: null, bishops: [], joker: null, genies: [] };
  if (!queendomId) return empty;
  const { data, error } = await createAdminClient().from("profiles").select("id, sia_role").eq("queendom_id", queendomId).eq("is_active", true).not("sia_role", "is", null);
  if (error) { console.error("[queendom-seats] read failed", error.message); return empty; }
  const rows = mapRows<{ id: string; sia_role: string | null }, { id: string; sia_role: string | null }>(data, (r) => r);
  const one = (role: string) => rows.find((r) => r.sia_role === role)?.id ?? null;
  const all = (role: string) => rows.filter((r) => r.sia_role === role).map((r) => r.id);
  return { queen: one("queen"), bishops: all("bishop"), joker: one("joker"), genies: all("genie") };
}
