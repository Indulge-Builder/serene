// vault-crypto.ts — THE encryption behind member.member_vault (migration 0236). AES-256-GCM with a
// key that lives only in the app's environment, so the database, its backups and its dumps hold
// nothing readable. Node's own crypto; no dependency.
//
// Rotation: MEMBER_VAULT_KEY is the current key (version MEMBER_VAULT_KEY_VERSION, default 1);
// MEMBER_VAULT_KEY_PREVIOUS decrypts rows written under the version before it. Re-encrypt rows
// on read-and-write, then drop the previous key.
//
// The row's member id is the additional authenticated data: a ciphertext moved to another
// member's row does not decrypt. Never log a plaintext, never return one to a model.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALG = "aes-256-gcm";
const NONCE_BYTES = 12;

function keyFor(version: number): Buffer {
  const current = Number(process.env.MEMBER_VAULT_KEY_VERSION ?? "1");
  const raw = version === current ? process.env.MEMBER_VAULT_KEY : version === current - 1 ? process.env.MEMBER_VAULT_KEY_PREVIOUS : undefined;
  if (!raw) throw new Error(`[vault-crypto] no key for version ${version}`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("[vault-crypto] MEMBER_VAULT_KEY must be 32 bytes, base64");
  return key;
}

export function vaultConfigured(): boolean {
  try { keyFor(Number(process.env.MEMBER_VAULT_KEY_VERSION ?? "1")); return true; } catch { return false; }
}

export function encryptSecret(plain: string, memberId: string): { ciphertext: string; nonce: string; key_version: number } {
  const key_version = Number(process.env.MEMBER_VAULT_KEY_VERSION ?? "1");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALG, keyFor(key_version), nonce);
  cipher.setAAD(Buffer.from(memberId, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]).toString("base64"), nonce: nonce.toString("base64"), key_version };
}

export function decryptSecret(row: { ciphertext: string; nonce: string; key_version: number }, memberId: string): string {
  const buf = Buffer.from(row.ciphertext, "base64");
  const body = buf.subarray(0, buf.length - 16), tag = buf.subarray(buf.length - 16);
  const decipher = createDecipheriv(ALG, keyFor(row.key_version), Buffer.from(row.nonce, "base64"));
  decipher.setAAD(Buffer.from(memberId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** The last four digits of the longest digit run in a secret: the only part of a number that may sit in the clear. */
export function lastFourOf(secret: string): string | null {
  const runs = (secret.replace(/[ -]/g, "").match(/\d{6,}/g) ?? []).sort((a, b) => b.length - a.length);
  return runs[0] ? runs[0].slice(-4) : null;
}
