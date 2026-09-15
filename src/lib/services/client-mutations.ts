// client-mutations.ts — THE context-free client write cores (migration 0194).
//
// actions/clients.ts AND the future Elaya write tools call the SAME core (R-01). Every core
// takes a MutationActor (reused from lead-mutations.ts), runs on the admin client, and returns
// { data, error } shaped results the action passes through. Access is checked by the CALLER
// with canAccessClient() before a core runs: the cores trust the actor.
//
// Truth stores are append only here too: a fact correction inserts the new row and stamps
// superseded_by on the old one; nothing else is ever updated on client_facts.

import { createAdminClient } from "@/lib/supabase/admin";
import { updateSiaGroupMapping } from "@/lib/services/sia-service";
import type { MutationActor } from "@/lib/services/lead-mutations";
import { readClientObservation, OBSERVATION_PROMPT_VERSION } from "@/lib/services/client-observation-reader";
import type { ClientFactRow, ClientObservationResult, ClientPersonRow, ClientRow } from "@/lib/types/client";
import type { Database } from "@/lib/types/database";

type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];
type PersonUpdate = Database["public"]["Tables"]["client_people"]["Update"];
import type {
  AddClientFactInput,
  AddClientObservationInput,
  AddClientPersonInput,
  CreateClientInput,
  UpdateClientInput,
  UpdateClientPersonInput,
} from "@/lib/validations/client-schema";

export type ClientMutationResult<T> = { data: T; error: null } | { data: null; error: string };

const fail = <T,>(msg: string, e?: { message: string } | null): ClientMutationResult<T> => {
  if (e) console.error(`[client-mutations] ${msg}:`, e.message);
  return { data: null, error: msg };
};

// ─── The spine ───────────────────────────────────────────────────────────────

export async function createClientCore(input: CreateClientInput, actor: MutationActor): Promise<ClientMutationResult<ClientRow>> {
  const admin = createAdminClient();
  if (input.primary_phone) {
    const { data: dup } = await admin.from("clients").select("id, full_name").eq("primary_phone", input.primary_phone).maybeSingle();
    if (dup) return { data: null, error: `That number already belongs to ${(dup as { full_name: string }).full_name}.` };
  }
  const { data, error } = await admin
    .from("clients")
    .insert({
      full_name: input.full_name,
      primary_phone: input.primary_phone,
      queendom_id: input.queendom_id,
      tier: input.tier,
      membership_type: input.tier,
      membership_status: input.membership_status,
      membership_start: input.membership_start,
      membership_end: input.membership_end,
      membership_amount_inr: input.membership_amount_inr,
      sources: ["manual"],
      import_raw: { created_by: actor.userId, created_at: new Date().toISOString() },
    })
    .select("*")
    .single();
  if (error || !data) return fail("Could not create the client.", error);
  const client = data as ClientRow;
  // The email and the city are facts, not spine columns (plan 5.2).
  const seed: Omit<AddClientFactInput, "supersedes_id">[] = [];
  if (input.email) seed.push({ client_id: client.id, facet: "identity", key: "email", value: input.email, polarity: "neutral" });
  if (input.city) seed.push({ client_id: client.id, facet: "identity", key: "primary_city", value: input.city, polarity: "neutral" });
  for (const f of seed) await addFactCore({ ...f, supersedes_id: null }, actor);
  return { data: client, error: null };
}

export async function updateClientCore(input: UpdateClientInput, actor: MutationActor): Promise<ClientMutationResult<ClientRow>> {
  const admin = createAdminClient();
  const { client_id, ...rest } = input;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
  if (typeof patch.tier === "string" || patch.tier === null) patch.membership_type = patch.tier as string | null;
  if (Object.keys(patch).length === 0) return fail("Nothing to change.");
  if (typeof patch.primary_phone === "string") {
    const { data: dup } = await admin.from("clients").select("id").eq("primary_phone", patch.primary_phone).neq("id", client_id).maybeSingle();
    if (dup) return { data: null, error: "That number already belongs to another client." };
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await admin.from("clients").update(patch as ClientUpdate).eq("id", client_id).select("*").single();
  if (error || !data) return fail("Could not save the client.", error);
  void actor;
  return { data: data as ClientRow, error: null };
}

// ─── Facts (append only) ─────────────────────────────────────────────────────

export async function addFactCore(input: AddClientFactInput, actor: MutationActor): Promise<ClientMutationResult<ClientFactRow>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_facts")
    .insert({
      client_id: input.client_id,
      facet: input.facet,
      key: input.key,
      value: input.value,
      polarity: input.polarity,
      source: "agent_note",
      confidence: 1,
      evidence: { by: actor.userId, name: actor.fullName },
      observed_at: new Date().toISOString(),
      created_by: actor.userId,
    })
    .select("*")
    .single();
  if (error || !data) return fail("Could not save that.", error);
  const row = data as ClientFactRow;
  if (input.supersedes_id) {
    // The old row stays; it just stops being current. Only the service role may do this.
    // Every other current row saying the same thing (a second source agreeing) retires with
    // it, or the corrected value would come straight back from the duplicate.
    const { data: old } = await admin.from("client_facts").select("facet, key, value")
      .eq("id", input.supersedes_id).eq("client_id", input.client_id).maybeSingle();
    let q = admin.from("client_facts").update({ superseded_by: row.id }).eq("client_id", input.client_id).is("superseded_by", null).neq("id", row.id);
    if (old) {
      const o = old as { facet: string; key: string; value: string };
      q = q.eq("facet", o.facet).eq("key", o.key).ilike("value", o.value.trim());
    } else {
      q = q.eq("id", input.supersedes_id);
    }
    const { error: supErr } = await q;
    if (supErr) console.warn("[client-mutations] supersede failed", supErr.message);
  }
  return { data: row, error: null };
}

// ─── The Observation box ─────────────────────────────────────────────────────

/**
 * One free-form observation → the note (verbatim words kept in evidence, corrected text as
 * the value) + the facts the reader filed (source agent_note, confidence 0.9, run_id set,
 * each pointing at the note) + brand/person/place/interest relations. Every model call is a
 * sia.extraction_runs row. A reader failure still saves the note.
 */
export async function addObservationCore(input: AddClientObservationInput, actor: MutationActor): Promise<ClientMutationResult<ClientObservationResult>> {
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs")
    .insert({ kind: "observation", client_id: input.client_id, prompt_version: OBSERVATION_PROMPT_VERSION, input_ref: { by: actor.userId, chars: input.text.length }, started_at: startedAt })
    .select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;

  const reading = await readClientObservation(input.text);
  if (runId) {
    await admin.schema("sia").from("extraction_runs").update({
      finished_at: new Date().toISOString(), ok: Boolean(reading), model: reading?.model ?? null,
      tokens_in: reading?.usage.inputTokens ?? null, tokens_out: reading?.usage.outputTokens ?? null,
      error: reading ? null : "reader returned null",
      output: reading ? { facts: reading.facts, relations: reading.relations, corrected: reading.text !== input.text } : {},
    }).eq("id", runId);
  }

  // 1. The note itself, always. The person's exact words stay in evidence.
  const noteValue = reading?.text ?? input.text;
  const { data: noteData, error: noteErr } = await admin.from("client_facts").insert({
    client_id: input.client_id, facet: "note", key: "", value: noteValue, polarity: "neutral",
    source: "agent_note", confidence: 1,
    evidence: { by: actor.userId, name: actor.fullName, raw: input.text, run_id: runId, kind: "observation" },
    observed_at: startedAt, created_by: actor.userId,
  }).select("*").single();
  if (noteErr || !noteData) return fail("Could not save that observation.", noteErr);
  const note = noteData as ClientFactRow;
  if (!reading) return { data: { note, facts: [], relations: [], read: false, corrected: false }, error: null };

  // 2. The cards, skipping any the twin already holds word for word.
  const { data: existing } = await admin.from("client_facts").select("facet, key, value").eq("client_id", input.client_id).is("superseded_by", null).limit(2000);
  const have = new Set(((existing ?? []) as { facet: string; key: string; value: string }[]).map((f) => `${f.facet}|${f.key}|${f.value.trim().toLowerCase()}`));
  const rows = reading.facts
    .filter((f) => !have.has(`${f.facet}|${f.key}|${f.value.toLowerCase()}`))
    .map((f) => ({
      client_id: input.client_id, facet: f.facet, key: f.key, value: f.value, polarity: f.polarity,
      source: "agent_note" as const, confidence: 0.9, run_id: runId,
      evidence: { by: actor.userId, name: actor.fullName, note_id: note.id, kind: "observation" },
      observed_at: startedAt, created_by: actor.userId,
    }));
  let facts: ClientFactRow[] = [];
  if (rows.length) {
    const { data: factData, error: factErr } = await admin.from("client_facts").insert(rows).select("*");
    if (factErr) console.warn("[client-mutations] observation facts insert failed", factErr.message);
    facts = (factData ?? []) as ClientFactRow[];
  }

  // 3. Relations: one row per (kind, label, relation); a repeat bumps the evidence count.
  for (const r of reading.relations) {
    const entityId = `${r.kind}:${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
    const { data: cur } = await admin.from("client_relations").select("id, evidence_count, strength")
      .eq("client_id", input.client_id).eq("entity_kind", r.kind).eq("entity_id", entityId).eq("relation", r.relation).maybeSingle();
    if (cur) {
      const c = cur as { id: string; evidence_count: number; strength: number };
      await admin.from("client_relations").update({ evidence_count: c.evidence_count + 1, strength: Math.min(1, Number(c.strength) + 0.1), last_seen_at: startedAt }).eq("id", c.id);
    } else {
      await admin.from("client_relations").insert({
        client_id: input.client_id, entity_kind: r.kind, entity_id: entityId, entity_label: r.label, relation: r.relation,
        strength: 0.6, evidence: [{ note_id: note.id, by: actor.userId }],
      });
    }
  }

  return { data: { note, facts, relations: reading.relations, read: true, corrected: reading.text !== input.text }, error: null };
}

// ─── People ──────────────────────────────────────────────────────────────────

export async function addPersonCore(input: AddClientPersonInput, actor: MutationActor): Promise<ClientMutationResult<ClientPersonRow>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("client_people").insert({
    client_id: input.client_id, name: input.name, relation: input.relation, phone_e164: input.phone_e164,
    email: input.email, can_request: input.can_request, note: input.note, created_by: actor.userId,
  }).select("*").single();
  if (error || !data) return fail("Could not add that person.", error);
  return { data: data as ClientPersonRow, error: null };
}

export async function updatePersonCore(input: UpdateClientPersonInput): Promise<ClientMutationResult<ClientPersonRow>> {
  const admin = createAdminClient();
  const { person_id, client_id, ...rest } = input;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
  const { data, error } = await admin.from("client_people").update(patch as PersonUpdate).eq("id", person_id).eq("client_id", client_id).select("*").single();
  if (error || !data) return fail("Could not save that person.", error);
  return { data: data as ClientPersonRow, error: null };
}

export async function deletePersonCore(personId: string, clientId: string): Promise<ClientMutationResult<{ deleted: true }>> {
  const admin = createAdminClient();
  const { error } = await admin.from("client_people").delete().eq("id", personId).eq("client_id", clientId);
  if (error) return fail("Could not remove that person.", error);
  return { data: { deleted: true }, error: null };
}

// ─── The WhatsApp link ───────────────────────────────────────────────────────

/** Link a group to a client (or unlink with null). One group per client for now: a second
 *  link moves the group; the previous group of this client, if any, is left as it is. */
export async function linkGroupCore(groupJid: string, clientId: string | null): Promise<ClientMutationResult<{ linked: boolean }>> {
  const ok = await updateSiaGroupMapping(groupJid, { client_id: clientId });
  if (!ok) return fail("Could not update the group link.");
  return { data: { linked: clientId != null }, error: null };
}

// ─── Health, by hand ─────────────────────────────────────────────────────────

export async function addHealthAdjustCore(clientId: string, delta: number, note: string, actor: MutationActor): Promise<ClientMutationResult<{ id: string }>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("client_health_events").insert({
    client_id: clientId, signal: "manual_adjust", delta, note, evidence: { by: actor.userId }, created_by: actor.userId,
  }).select("id").single();
  if (error || !data) return fail("Could not record that.", error);
  return { data: { id: (data as { id: string }).id }, error: null };
}

// ─── The access trail ────────────────────────────────────────────────────────

/** Best-effort, never throws: a card open is recorded, a failure is logged. */
export async function logClientAccess(clientId: string, actorId: string, surface: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("client_access_log").insert({ client_id: clientId, actor_id: actorId, surface });
  if (error) console.warn("[client-mutations] access log failed", error.message);
}
