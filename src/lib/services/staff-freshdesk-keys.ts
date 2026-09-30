// staff-freshdesk-keys.ts — THE store of a person's own Freshdesk API key (0250). SERVER ONLY.
//
// Freshdesk records every API change under the agent whose key made it. The company key Serene
// reads the mirror with belongs to one person, so a write with it would carry her name. The
// finance people are Freshdesk agents already; each pastes their own key once on /profile and
// the invoice note and field changes then show under their own name. No new seat.
//
// The key is encrypted with vault-crypto (AES-256-GCM, the profile id as authenticated data) and
// read back ONLY by finance-mutations.ts at the moment of a write. It is never returned to a
// browser, a log line or a model. Admin client: the table has no policy for signed-in users.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFdBudget, getAgentForKey } from "@/lib/services/freshdesk-api";
import { decryptSecret, encryptSecret, vaultConfigured } from "@/lib/utils/vault-crypto";
import type { FreshdeskKeyStatus } from "@/lib/types/finance";

const LOG = "[staff-freshdesk-keys]";

// Not in the generated types until the next regen; one loose handle (the media-readings posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const db = (): Loose => createAdminClient() as unknown as Loose;

type KeyRow = { profile_id: string; ciphertext: string; nonce: string; key_version: number; fd_agent_id: number; fd_agent_name: string; last_four: string; verified_at: string };

export type SaveKeyError = "vault_off" | "invalid_key" | "inactive_agent" | "db";

export async function getFreshdeskKeyStatus(profileId: string): Promise<FreshdeskKeyStatus> {
  const { data, error } = await db().from("staff_freshdesk_keys").select("fd_agent_name, last_four, verified_at").eq("profile_id", profileId).maybeSingle();
  if (error) console.error(`${LOG} status read failed:`, error.message);
  const row = data as Pick<KeyRow, "fd_agent_name" | "last_four" | "verified_at"> | null;
  return row ? { saved: true, agentName: row.fd_agent_name, lastFour: row.last_four, verifiedAt: row.verified_at } : { saved: false, agentName: null, lastFour: null, verifiedAt: null };
}

/** Ask Freshdesk who the key is, then keep it encrypted. A key Freshdesk does not know is never stored. */
export async function saveFreshdeskKey(profileId: string, key: string): Promise<{ ok: true; status: FreshdeskKeyStatus } | { ok: false; error: SaveKeyError }> {
  if (!vaultConfigured()) return { ok: false, error: "vault_off" };
  let agent: Awaited<ReturnType<typeof getAgentForKey>>;
  try {
    agent = await getAgentForKey(key, createFdBudget(2));
  } catch (e) {
    console.error(`${LOG} key check failed:`, e instanceof Error ? e.message : e);
    return { ok: false, error: "invalid_key" };
  }
  if (!agent) return { ok: false, error: "invalid_key" };
  if (!agent.active) return { ok: false, error: "inactive_agent" };
  const enc = encryptSecret(key, profileId);
  const now = new Date().toISOString();
  const { error } = await db().from("staff_freshdesk_keys").upsert({
    profile_id: profileId, ciphertext: enc.ciphertext, nonce: enc.nonce, key_version: enc.key_version,
    fd_agent_id: agent.id, fd_agent_name: agent.name, last_four: key.slice(-4), verified_at: now, updated_at: now,
  }, { onConflict: "profile_id" });
  if (error) { console.error(`${LOG} save failed:`, error.message); return { ok: false, error: "db" }; }
  return { ok: true, status: { saved: true, agentName: agent.name, lastFour: key.slice(-4), verifiedAt: now } };
}

export async function removeFreshdeskKey(profileId: string): Promise<boolean> {
  const { error } = await db().from("staff_freshdesk_keys").delete().eq("profile_id", profileId);
  if (error) { console.error(`${LOG} remove failed:`, error.message); return false; }
  return true;
}

/** The key itself, for a write about to be made. Only finance-mutations.ts calls this. */
export async function readFreshdeskKey(profileId: string): Promise<{ key: string; agentId: number; agentName: string } | null> {
  const { data, error } = await db().from("staff_freshdesk_keys").select("*").eq("profile_id", profileId).maybeSingle();
  if (error) { console.error(`${LOG} read failed:`, error.message); return null; }
  const row = data as KeyRow | null;
  if (!row) return null;
  try {
    return { key: decryptSecret(row, profileId), agentId: row.fd_agent_id, agentName: row.fd_agent_name };
  } catch (e) {
    console.error(`${LOG} decrypt failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}
