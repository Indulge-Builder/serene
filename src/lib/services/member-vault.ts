// member-vault.ts — THE access to member.member_vault (0236): card and identity-document details,
// encrypted in the app, revealed on record. Admin client only, because the table has no policy
// for signed-in users on purpose; the ACTION gates (canAccessMember, the roles) before any call
// here, and every reveal, add and delete writes its own member_vault_access row first.
//
// Free of `server-only`: the contact-notes import runs it from a laptop. Nothing returned here
// may reach a member dossier, a tool result or a model: the vault is not part of any read.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { mapRows } from "@/lib/utils/rows";
import { decryptSecret, encryptSecret, lastFourOf, vaultConfigured } from "@/lib/utils/vault-crypto";
import type { MemberVaultItem, MemberVaultKind } from "@/lib/types/member";

const LOG = "[member-vault]";
const COLS = "id, member_id, kind, label, hint, expires_on, source, created_by, created_at";

type Result<T> = { data: T; error: null } | { data: null; error: string };

async function trail(itemId: string, memberId: string, actorId: string | null, action: "reveal" | "add" | "delete" | "import", reason: string | null): Promise<void> {
  const { error } = await memberDb(createAdminClient()).from("member_vault_access").insert({ item_id: itemId, member_id: memberId, actor_id: actorId, action, reason });
  if (error) console.error(`${LOG} access trail failed`, error.message);
}

/** What the card shows: never the secret. */
export async function listVaultItems(memberId: string): Promise<MemberVaultItem[]> {
  const { data, error } = await memberDb(createAdminClient()).from("member_vault").select(COLS).eq("member_id", memberId).order("created_at", { ascending: false });
  if (error) { console.error(`${LOG} list failed`, error.message); return []; }
  return mapRows<MemberVaultItem, MemberVaultItem>(data, (r) => r);
}

export type AddVaultItemInput = { member_id: string; kind: MemberVaultKind; label: string; secret: string; expires_on?: string | null; source?: "manual" | "freshdesk_note"; source_ref?: string | null };

/** Encrypt and store. `actorId` null = an import; the trail row says which. */
export async function addVaultItemCore(input: AddVaultItemInput, actorId: string | null): Promise<Result<MemberVaultItem>> {
  if (!vaultConfigured()) return { data: null, error: "The vault key is not set on this server." };
  const secret = input.secret.trim();
  if (secret.length < 2) return { data: null, error: "Nothing to store." };
  let enc: ReturnType<typeof encryptSecret>;
  try { enc = encryptSecret(secret, input.member_id); } catch (e) { console.error(`${LOG} encrypt failed`, e instanceof Error ? e.message : e); return { data: null, error: "Could not encrypt that." }; }
  const { data, error } = await memberDb(createAdminClient()).from("member_vault").insert({
    member_id: input.member_id, kind: input.kind, label: input.label.trim().slice(0, 120), hint: lastFourOf(secret), expires_on: input.expires_on ?? null,
    ...enc, source: input.source ?? "manual", source_ref: input.source_ref ?? null, created_by: actorId,
  }).select(COLS).single();
  if (error || !data) {
    if (error?.code === "23505") return { data: null, error: "already stored" };
    console.error(`${LOG} insert failed`, error?.message); return { data: null, error: "Could not store that." };
  }
  const row = data as unknown as MemberVaultItem;
  await trail(row.id, input.member_id, actorId, actorId ? "add" : "import", input.source_ref ? `from Freshdesk note ${input.source_ref}` : null);
  return { data: row, error: null };
}

/** Decrypt one item for one person, for one stated reason. The trail row is written BEFORE the secret leaves. */
export async function revealVaultItemCore(itemId: string, memberId: string, actorId: string, reason: string): Promise<Result<{ item: MemberVaultItem; secret: string }>> {
  const { data, error } = await memberDb(createAdminClient()).from("member_vault").select(`${COLS}, ciphertext, nonce, key_version`).eq("id", itemId).eq("member_id", memberId).maybeSingle();
  if (error || !data) return { data: null, error: "Not found." };
  const row = data as unknown as MemberVaultItem & { ciphertext: string; nonce: string; key_version: number };
  await trail(row.id, memberId, actorId, "reveal", reason.trim().slice(0, 300));
  try {
    const secret = decryptSecret(row, memberId);
    const { ciphertext: _c, nonce: _n, key_version: _k, ...item } = row; void _c; void _n; void _k;
    return { data: { item, secret }, error: null };
  } catch (e) { console.error(`${LOG} decrypt failed for ${itemId}`, e instanceof Error ? e.message : e); return { data: null, error: "Could not open that item on this server." }; }
}

/** A real delete: a member may ask for their details to be gone. The trail keeps that it happened. */
export async function deleteVaultItemCore(itemId: string, memberId: string, actorId: string, reason: string): Promise<Result<{ id: string }>> {
  const { data, error } = await memberDb(createAdminClient()).from("member_vault").delete().eq("id", itemId).eq("member_id", memberId).select("id");
  if (error) return { data: null, error: "Could not remove that." };
  if (!data?.length) return { data: null, error: "Not found." };
  await trail(itemId, memberId, actorId, "delete", reason.trim().slice(0, 300));
  return { data: { id: itemId }, error: null };
}

/** The trail for one member, newest first (admin and founder; the caller gates). */
export async function listVaultAccess(memberId: string, limit = 50): Promise<{ id: number; item_id: string; actor_id: string | null; action: string; reason: string | null; created_at: string }[]> {
  const { data } = await memberDb(createAdminClient()).from("member_vault_access").select("id, item_id, actor_id, action, reason, created_at").eq("member_id", memberId).order("created_at", { ascending: false }).limit(limit);
  return mapRows<{ id: number; item_id: string; actor_id: string | null; action: string; reason: string | null; created_at: string }, { id: number; item_id: string; actor_id: string | null; action: string; reason: string | null; created_at: string }>(data, (r) => r);
}
