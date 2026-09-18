// member-relations.ts — THE one write for member_relations (0194): a relation is one row per
// (member, entity kind, entity id, relation); seeing it again bumps the evidence count and the
// strength instead of adding a second row. The Observation box (member-mutations.ts) and the
// chat profiler (member-profiler.ts) both call this, so the two can never disagree about what
// "the same relation" means.
//
// Deliberately free of `server-only` and of any module that carries it: the profiler runs from
// Trigger.dev and from a laptop script as well as from the app.

import type { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import type { Json } from "@/lib/types/database";

export type MemberRelationInput = { kind: string; label: string; relation: string };

/** A stable id for a named thing: "brand:louis-vuitton". */
export function relationEntityId(kind: string, label: string): string {
  return `${kind}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Insert the relation, or strengthen the one already there. Returns true when it was new. */
export async function upsertMemberRelation(
  admin: ReturnType<typeof createAdminClient>,
  memberId: string,
  r: MemberRelationInput,
  evidence: Record<string, unknown>,
  seenAt: string,
): Promise<boolean> {
  const entityId = relationEntityId(r.kind, r.label);
  const { data: cur } = await memberDb(admin).from("member_relations").select("id, evidence_count, strength")
    .eq("member_id", memberId).eq("entity_kind", r.kind).eq("entity_id", entityId).eq("relation", r.relation).maybeSingle();
  if (cur) {
    const c = cur as { id: string; evidence_count: number; strength: number };
    await memberDb(admin).from("member_relations")
      .update({ evidence_count: c.evidence_count + 1, strength: Math.min(1, Number(c.strength) + 0.1), last_seen_at: seenAt })
      .eq("id", c.id);
    return false;
  }
  await memberDb(admin).from("member_relations").insert({
    member_id: memberId, entity_kind: r.kind, entity_id: entityId, entity_label: r.label, relation: r.relation,
    strength: 0.6, evidence: [evidence] as unknown as Json,
  });
  return true;
}
