// Postgres-backed Baileys auth state — the production replacement for
// useMultiFileAuthState (whose own source says: "Would recommend writing an
// auth state for use with a proper SQL or No-SQL DB").
//
// One row per Baileys key in sia.wag_auth_state: 'creds' plus '<type>-<id>'
// signal keys ('pre-key-1', 'session-…', 'app-state-sync-key-…'). Values are
// BufferJSON-serialized (Buffers ↔ {type:'Buffer', data:base64}) exactly like
// the file store, so the payloads are format-compatible. Wins over files/EFS:
// atomic writes, batched round trips, one-query inspection, one-DELETE reset —
// and the "half-written volume" failure class (2026-08-27 incident) cannot exist.
//
// OPERATIONAL LAW: exactly ONE runner may use this session at a time. Running a
// local connector while the Fargate task runs = two sockets on one session =
// WhatsApp conflict loop. Scale the AWS service to 0 before running locally.

import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "baileys";
import { db as watcherDb } from "./db.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// The watcher's own session rows. connector-hands passes ITS table + client (hands.auth_state):
// two numbers never share a Signal session.
const DEFAULT_TABLE = "wag_auth_state";
let TABLE = DEFAULT_TABLE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: SupabaseClient<any, any, any> = watcherDb;

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function revive<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

// Reads must be as loud as writes: a transient error that silently returns null
// is CATASTROPHIC at boot — the connector would init a fresh identity and its
// first creds.update would overwrite the live session. Retry, then THROW; the
// crash-only supervisor restarts clean and the real creds are still in Postgres.
async function readKey<T>(key: string): Promise<T | null> {
  return withRetry(`read ${key}`, async () => {
    const { data, error } = await db.from(TABLE).select("value").eq("key", key).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ? revive<T>(data[0].value) : null;
  });
}

// Key writes must NEVER fail silently: Baileys' signal transactions assume a
// completed set() persisted — a swallowed failure silently loses sender keys
// and poisons decryption for whole chains (observed as "No session found to
// decrypt" after a laptop network blip, 2026-08-29). Retry transient errors,
// then THROW so the transaction aborts loudly and crash-only restarts clean.
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.warn(`[auth] ${what} attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

async function writeKeys(rows: { key: string; value: unknown }[]): Promise<void> {
  if (rows.length === 0) return;
  await withRetry("write", async () => {
    const { error } = await db.from(TABLE).upsert(
      rows.map((r) => ({ key: r.key, value: serialize(r.value), updated_at: new Date().toISOString() })),
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
  });
}

async function deleteKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await withRetry("delete", async () => {
    const { error } = await db.from(TABLE).delete().in("key", keys);
    if (error) throw new Error(error.message);
  });
}

export async function usePostgresAuthState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: { table?: string; client?: SupabaseClient<any, any, any> } = {},
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  TABLE = opts.table ?? DEFAULT_TABLE;
  db = opts.client ?? watcherDb;
  const creds: AuthenticationCreds = (await readKey<AuthenticationCreds>("creds")) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          if (ids.length === 0) return data;
          // Same loud-failure law as writes: an empty result on a transient DB
          // error looks like "no session" to Signal and poisons decrypt chains.
          const rows = await withRetry(`get ${type}`, async () => {
            const { data: r, error } = await db
              .from(TABLE)
              .select("key, value")
              .in("key", ids.map((id) => `${type}-${id}`));
            if (error) throw new Error(error.message);
            return r ?? [];
          });
          for (const row of rows as { key: string; value: unknown }[]) {
            const id = row.key.slice(type.length + 1);
            let value = revive<SignalDataTypeMap[T]>(row.value);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as Record<string, unknown>,
              ) as unknown as SignalDataTypeMap[T];
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const upserts: { key: string; value: unknown }[] = [];
          const removals: string[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap];
            for (const id in entries) {
              const value = entries[id];
              const key = `${category}-${id}`;
              if (value) upserts.push({ key, value });
              else removals.push(key);
            }
          }
          await Promise.all([writeKeys(upserts), deleteKeys(removals)]);
        },
      },
    },
    saveCreds: async () => writeKeys([{ key: "creds", value: creds }]),
  };
}

/**
 * loggedOut recovery (audit P0-3): WhatsApp has rejected this session for good.
 * Log what died, delete every row, exit-path clean — the next boot finds empty
 * state and arms a fresh pairing instead of hammering a dead login forever.
 */
export async function wipeAuthState(reason: string): Promise<void> {
  // Logging-only read — a throw here must never block the wipe itself.
  const creds = await readKey<AuthenticationCreds>("creds").catch(() => null);
  const { count } = await db.from(TABLE).select("key", { count: "exact", head: true });
  console.error(
    `[auth] wiping session (${reason}): was ${creds?.me?.id ?? "unpaired"}, ${count ?? "?"} keys — next boot will pair fresh`,
  );
  const { error } = await db.from(TABLE).delete().neq("key", "");
  if (error) console.error("[auth] wipe failed:", error.message);
}
