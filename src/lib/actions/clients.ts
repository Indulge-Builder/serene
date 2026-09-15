"use server";
// actions/clients.ts — the Clients surface's server actions (migration 0194).
//
// Every action: Zod (parseActionInput) → requireProfile() → the caller's access to THIS client
// (canAccessClient, the SQL twin of client_visible) → the shared core in
// services/client-mutations.ts → revalidatePath → { data, error } (Rule 10). Reads for the
// pickers go through clients-service on the session client (RLS).

import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { formErrors } from "@/lib/validations/form-errors";
import { canAccessClient } from "@/lib/elaya/access";
import { CLIENTS_PATH } from "@/lib/constants/sia-roles";
import { searchClientsForPicker, clientQueendom } from "@/lib/services/clients-service";
import {
  addFactCore, addHealthAdjustCore, addObservationCore, addPersonCore, createClientCore, deletePersonCore,
  linkGroupCore, updateClientCore, updatePersonCore,
} from "@/lib/services/client-mutations";
import {
  AddClientFactSchema, AddClientPersonSchema, CreateClientSchema, DeleteClientPersonSchema,
  HealthAdjustSchema, LinkClientGroupSchema, SearchClientsSchema, UnlinkClientGroupSchema,
  UpdateClientPersonSchema, UpdateClientSchema,
  AddClientObservationSchema,
} from "@/lib/validations/client-schema";
import type { ActionResult } from "@/lib/types";
import type { ClientFactRow, ClientObservationResult, ClientPersonRow, ClientPickerHit, ClientRow } from "@/lib/types/client";


async function gate(clientId: string) {
  const auth = await requireProfile();
  if (!auth.ok) return { ok: false as const, result: auth.result };
  const q = await clientQueendom(clientId);
  if (!q.exists || !canAccessClient(auth.profile, q.queendom_id)) {
    return { ok: false as const, result: { data: null, error: formErrors.unauthorized } };
  }
  return { ok: true as const, profile: auth.profile };
}

export async function createClientAction(input: unknown): Promise<ActionResult<ClientRow>> {
  const parsed = parseActionInput(CreateClientSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  // A new client lands in the caller's queendom unless admin/founder chose one.
  const queendomId = parsed.data.queendom_id ?? auth.profile.queendom_id ?? null;
  if (!canAccessClient(auth.profile, queendomId)) return { data: null, error: formErrors.unauthorized };
  const res = await createClientCore({ ...parsed.data, queendom_id: queendomId }, actorFromProfile(auth.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(CLIENTS_PATH);
  return { data: res.data, error: null };
}

export async function updateClientAction(input: unknown): Promise<ActionResult<ClientRow>> {
  const parsed = parseActionInput(UpdateClientSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  if (parsed.data.queendom_id !== undefined && !canAccessClient(g.profile, parsed.data.queendom_id)) {
    return { data: null, error: formErrors.unauthorized };
  }
  const res = await updateClientCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(CLIENTS_PATH);
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

export async function addClientFactAction(input: unknown): Promise<ActionResult<ClientFactRow>> {
  const parsed = parseActionInput(AddClientFactSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await addFactCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

/** The Observation box: one sentence in, the note + the filed cards out. */
export async function addClientObservationAction(input: unknown): Promise<ActionResult<ClientObservationResult>> {
  const parsed = parseActionInput(AddClientObservationSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await addObservationCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

export async function addClientPersonAction(input: unknown): Promise<ActionResult<ClientPersonRow>> {
  const parsed = parseActionInput(AddClientPersonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await addPersonCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

export async function updateClientPersonAction(input: unknown): Promise<ActionResult<ClientPersonRow>> {
  const parsed = parseActionInput(UpdateClientPersonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await updatePersonCore(parsed.data);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

export async function deleteClientPersonAction(input: unknown): Promise<ActionResult<{ deleted: true }>> {
  const parsed = parseActionInput(DeleteClientPersonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await deletePersonCore(parsed.data.person_id, parsed.data.client_id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

export async function linkClientGroupAction(input: unknown): Promise<ActionResult<{ linked: boolean }>> {
  const parsed = parseActionInput(LinkClientGroupSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await linkGroupCore(parsed.data.group_jid, parsed.data.client_id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  revalidatePath("/sia");
  return { data: res.data, error: null };
}

export async function unlinkClientGroupAction(input: unknown): Promise<ActionResult<{ linked: boolean }>> {
  const parsed = parseActionInput(UnlinkClientGroupSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await linkGroupCore(parsed.data.group_jid, null);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  revalidatePath("/sia");
  return { data: res.data, error: null };
}

export async function adjustClientHealthAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(HealthAdjustSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.client_id);
  if (!g.ok) return g.result;
  const res = await addHealthAdjustCore(parsed.data.client_id, parsed.data.delta, parsed.data.note, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.client_id}`);
  return { data: res.data, error: null };
}

/** The client picker (Sia panel "link to a client", and any future search box). RLS-scoped. */
export async function searchClientsAction(input: unknown): Promise<ActionResult<ClientPickerHit[]>> {
  const parsed = parseActionInput(SearchClientsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  return { data: await searchClientsForPicker(parsed.data.q, parsed.data.limit), error: null };
}
