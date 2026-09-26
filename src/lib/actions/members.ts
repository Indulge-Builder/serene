"use server";
// actions/members.ts — the Members surface's server actions (migration 0194).
//
// Every action: Zod (parseActionInput) → requireProfile() → the caller's access to THIS member
// (canAccessMember, the SQL twin of member_visible) → the shared core in
// services/member-mutations.ts → revalidatePath → { data, error } (Rule 10). Reads for the
// pickers go through members-service on the session client (RLS).

import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { formErrors } from "@/lib/validations/form-errors";
import { canAccessMember, canUseMemberVault } from "@/lib/elaya/access";
import { CLIENTS_PATH, isCompanyWideSeat } from "@/lib/constants/sia-roles";
import { searchMembersForPicker, memberQueendom } from "@/lib/services/members-service";
import { addVaultItemCore, revealVaultItemCore, deleteVaultItemCore } from "@/lib/services/member-vault";
import { startMemberAssessment } from "@/trigger/member-assessment";
import { AssessMemberSchema } from "@/lib/validations/member-schema";
import {
  addFactCore, addHealthAdjustCore, addObservationCore, addPersonCore, createMemberCore, deletePersonCore,
  linkGroupCore, updateMemberCore, updatePersonCore,
} from "@/lib/services/member-mutations";
import {
  AddMemberFactSchema, AddMemberPersonSchema, CreateMemberSchema, DeleteMemberPersonSchema,
  HealthAdjustSchema, LinkMemberGroupSchema, SearchMembersSchema, UnlinkMemberGroupSchema,
  UpdateMemberPersonSchema, UpdateMemberSchema,
  AddMemberObservationSchema, AddMemberVaultItemSchema, RevealMemberVaultItemSchema, DeleteMemberVaultItemSchema,
} from "@/lib/validations/member-schema";
import type { ActionResult } from "@/lib/types";
import type { MemberFactRow, MemberObservationResult, MemberPersonRow, MemberPickerHit, MemberRow, MemberVaultItem } from "@/lib/types/member";


async function gate(clientId: string) {
  const auth = await requireProfile();
  if (!auth.ok) return { ok: false as const, result: auth.result };
  const q = await memberQueendom(clientId);
  if (!q.exists || !canAccessMember(auth.profile, q.queendom_id)) {
    return { ok: false as const, result: { data: null, error: formErrors.unauthorized } };
  }
  return { ok: true as const, profile: auth.profile };
}

export async function createMemberAction(input: unknown): Promise<ActionResult<MemberRow>> {
  const parsed = parseActionInput(CreateMemberSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  // A new member lands in the caller's queendom unless admin/founder chose one. The Joker head
  // has no queendom of their own, so they must pick one.
  const queendomId = parsed.data.queendom_id ?? auth.profile.queendom_id ?? null;
  if (!queendomId && isCompanyWideSeat(auth.profile)) return { data: null, error: formErrors.memberQueendomRequired };
  if (!canAccessMember(auth.profile, queendomId)) return { data: null, error: formErrors.unauthorized };
  const res = await createMemberCore({ ...parsed.data, queendom_id: queendomId }, actorFromProfile(auth.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(CLIENTS_PATH);
  return { data: res.data, error: null };
}

export async function updateMemberAction(input: unknown): Promise<ActionResult<MemberRow>> {
  const parsed = parseActionInput(UpdateMemberSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  if (parsed.data.queendom_id !== undefined && !canAccessMember(g.profile, parsed.data.queendom_id)) {
    return { data: null, error: formErrors.unauthorized };
  }
  const res = await updateMemberCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(CLIENTS_PATH);
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

export async function addMemberFactAction(input: unknown): Promise<ActionResult<MemberFactRow>> {
  const parsed = parseActionInput(AddMemberFactSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await addFactCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

/** The Observation box: one sentence in, the note + the filed cards out. */
export async function addMemberObservationAction(input: unknown): Promise<ActionResult<MemberObservationResult>> {
  const parsed = parseActionInput(AddMemberObservationSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await addObservationCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

export async function addMemberPersonAction(input: unknown): Promise<ActionResult<MemberPersonRow>> {
  const parsed = parseActionInput(AddMemberPersonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await addPersonCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

export async function updateMemberPersonAction(input: unknown): Promise<ActionResult<MemberPersonRow>> {
  const parsed = parseActionInput(UpdateMemberPersonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await updatePersonCore(parsed.data);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

export async function deleteMemberPersonAction(input: unknown): Promise<ActionResult<{ deleted: true }>> {
  const parsed = parseActionInput(DeleteMemberPersonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await deletePersonCore(parsed.data.person_id, parsed.data.member_id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

export async function linkMemberGroupAction(input: unknown): Promise<ActionResult<{ linked: boolean }>> {
  const parsed = parseActionInput(LinkMemberGroupSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await linkGroupCore(parsed.data.group_jid, parsed.data.member_id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  revalidatePath("/sia");
  return { data: res.data, error: null };
}

export async function unlinkMemberGroupAction(input: unknown): Promise<ActionResult<{ linked: boolean }>> {
  const parsed = parseActionInput(UnlinkMemberGroupSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await linkGroupCore(parsed.data.group_jid, null);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  revalidatePath("/sia");
  return { data: res.data, error: null };
}

export async function adjustMemberHealthAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(HealthAdjustSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  const res = await addHealthAdjustCore(parsed.data.member_id, parsed.data.delta, parsed.data.note, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

/** The member picker (Sia panel "link to a member", and any future search box). RLS-scoped. */
export async function searchMembersAction(input: unknown): Promise<ActionResult<MemberPickerHit[]>> {
  const parsed = parseActionInput(SearchMembersSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  return { data: await searchMembersForPicker(parsed.data.q, parsed.data.limit), error: null };
}

// ─── The vault (0236): card and identity-document details ────────────────────
// The same gate as every member write (the queendom). Every reveal carries a reason and is on
// record; removing is admin and founder. The secret goes back to the browser once, for one look.
// The Joker head sees the list only: no add, no reveal (canUseMemberVault, 2026-09-26).

export async function addMemberVaultItemAction(input: unknown): Promise<ActionResult<MemberVaultItem>> {
  const parsed = parseActionInput(AddMemberVaultItemSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  if (!canUseMemberVault(g.profile)) return { data: null, error: formErrors.unauthorized };
  const res = await addVaultItemCore({ member_id: parsed.data.member_id, kind: parsed.data.kind, label: parsed.data.label, secret: parsed.data.secret, expires_on: parsed.data.expires }, g.profile.id);
  if (res.error !== null) return { data: null, error: res.error === "already stored" ? "That item is already stored." : res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

export async function revealMemberVaultItemAction(input: unknown): Promise<ActionResult<{ secret: string; item: MemberVaultItem }>> {
  const parsed = parseActionInput(RevealMemberVaultItemSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  if (!canUseMemberVault(g.profile)) return { data: null, error: formErrors.unauthorized };
  const res = await revealVaultItemCore(parsed.data.item_id, parsed.data.member_id, g.profile.id, parsed.data.reason);
  if (res.error !== null) return { data: null, error: res.error };
  return { data: res.data, error: null };
}

export async function deleteMemberVaultItemAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(DeleteMemberVaultItemSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  if (g.profile.role !== "admin" && g.profile.role !== "founder") return { data: null, error: formErrors.unauthorized };
  const res = await deleteVaultItemCore(parsed.data.item_id, parsed.data.member_id, g.profile.id, parsed.data.reason);
  if (res.error !== null) return { data: null, error: res.error };
  revalidatePath(`${CLIENTS_PATH}/${parsed.data.member_id}`);
  return { data: res.data, error: null };
}

/** Queue Serene's judgement of one member (0241; Trigger.dev, about a minute). The caller must see the member. */
export async function assessMemberNowAction(input: unknown): Promise<ActionResult<{ queued: true }>> {
  const parsed = parseActionInput(AssessMemberSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gate(parsed.data.member_id);
  if (!g.ok) return g.result;
  try { await startMemberAssessment(parsed.data.member_id); } catch (e) { console.error("[members-action] assessment could not be queued:", e instanceof Error ? e.message : e); return { data: null, error: "Could not start the judgement. Try again in a minute." }; }
  return { data: { queued: true }, error: null };
}
