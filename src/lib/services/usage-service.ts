// Usage / active-time tracking — SERVER ONLY.
//
// THE access layer for the adoption-tracking subsystem (migration 0126). Three
// surfaces, three clients:
//   • recordPresence(...)        — the HOT PATH. One Redis SET, NO DB write.
//                                  Called from the heartbeat server action.
//   • listLivePresence()         — snapshot job: read all live presence:* keys.
//   • insertUsageHeartbeats(...) — snapshot job: append ticks (admin client).
//   • rollupUsageForDays(...)    — rollup job: idempotent UPSERT into usage_daily.
//   • pruneOldHeartbeats(days)   — rollup job: drop raw ticks older than N days.
//   • getAgentUsage(...)         — the dashboard read. Admin-client RPC, gated
//                                  founder/admin in THIS layer (not the RPC).
//
// "Active" is decided entirely by the client gate (visibility + interaction)
// before a heartbeat ever fires — this layer only stores/aggregates the ticks
// that gate admitted. No login span is ever counted.

import "server-only";
import { redis } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { mapRows } from "@/lib/utils/rows";
import {
  REDIS_KEYS,
  REDIS_TTL,
  PRESENCE_KEY_PATTERN,
} from "@/lib/constants/redis-keys";
import { toISTMidnight, IST_OFFSET_MS } from "@/lib/utils/ist";
import type {
  AgentUsageReport,
  AgentUsageToday,
  AgentUsageHistoryPoint,
  PresenceEntry,
} from "@/lib/types/usage";
import type { AppDomain, UserRole } from "@/lib/types/database";

// ─────────────────────────────────────────────────────────────────────────
// HOT PATH — Redis only, no DB write. One SET per active heartbeat.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Record one active-presence heartbeat for a user. ONE Redis SET, EX
 * REDIS_TTL.PRESENCE — never a DB write (a per-beat insert would be a write
 * storm at scale). The snapshot job is the only thing that turns presence into
 * a DB row. Identity (userId/domain/role) comes from the caller's verified
 * profile in the action — never client-supplied. Fails open: a Redis error is
 * swallowed (a dropped beat just means one missing tick, not a broken request).
 */
export async function recordPresence(
  userId: string,
  entry: PresenceEntry,
): Promise<void> {
  try {
    // setex (the codebase's set-with-expiry convention) — Upstash JSON-serialises
    // the object value, read back via redis.mget<PresenceEntry[]> in the snapshot job.
    await redis.setex(REDIS_KEYS.presence(userId), REDIS_TTL.PRESENCE, entry);
  } catch (e) {
    console.warn("[usage-service] recordPresence redis set failed (non-fatal)", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SNAPSHOT JOB — read live presence keys → append heartbeat rows.
// ─────────────────────────────────────────────────────────────────────────

/** One live presence entry plus the userId decoded from its key. */
export type LivePresence = { userId: string } & PresenceEntry;

/**
 * Enumerate all live presence:* keys and return their decoded entries. Uses
 * Upstash SCAN (cursor-paged, non-blocking — never KEYS). Stale/expired keys
 * simply aren't returned; a key whose value MGET-reads null (raced expiry) is
 * skipped. The snapshot job calls this once per minute.
 */
export async function listLivePresence(): Promise<LivePresence[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    // Upstash returns [nextCursor, keys]. count is a hint, not a limit.
    const [next, batch] = await redis.scan(cursor, {
      match: PRESENCE_KEY_PATTERN,
      count: 500,
    });
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");

  if (keys.length === 0) return [];

  const values = await redis.mget<PresenceEntry[]>(...keys);
  const out: LivePresence[] = [];
  keys.forEach((key, i) => {
    const entry = values[i];
    if (!entry) return; // raced expiry between SCAN and MGET — skip
    out.push({
      userId: key.slice("presence:".length),
      domain: entry.domain,
      role: entry.role,
      ts: entry.ts,
    });
  });
  return out;
}

/** One row to append to usage_heartbeats. */
export type HeartbeatInsert = { user_id: string; domain: AppDomain };

/**
 * Append one raw tick per active user (admin client — the snapshot job has no
 * session; usage_heartbeats is deny-by-default RLS). captured_at defaults to
 * now() in the DB. Append-only (A-11) — INSERT only, ever.
 */
export async function insertUsageHeartbeats(rows: HeartbeatInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const admin = createAdminClient();
  // usage_heartbeats is not in the generated Database type until 0126 is applied
  // + types regenerated — same interim admin-client cast convention as
  // revival-service / elaya-actions-service.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("usage_heartbeats").insert(rows);
  if (error) {
    console.error("[usage-service] insertUsageHeartbeats failed:", error.message);
    return 0;
  }
  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────
// ROLLUP JOB — recompute distinct minute-ticks per (IST day, user, domain),
// UPSERT into usage_daily (idempotent — overwrite, never accumulate), prune
// old raw ticks.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Recompute usage_daily for the given IST calendar days from the raw ticks and
 * UPSERT the results. Idempotent by PK (day, user_id, domain): re-rolling a day
 * OVERWRITES its rows, never increments — active_minutes is always the freshly
 * counted distinct-minute total, so running the today-rollup twice yields
 * identical rows.
 *
 * active_minutes = COUNT(DISTINCT date_trunc('minute', captured_at)) per
 * (user, domain), bucketed by the IST calendar day of captured_at. The snapshot
 * job writes at most one row per user per minute, so distinct minute buckets =
 * active minutes.
 *
 * `days` are IST calendar dates (ISO 'YYYY-MM-DD'). Returns the number of
 * usage_daily rows written.
 */
export async function rollupUsageForDays(days: string[]): Promise<number> {
  if (days.length === 0) return 0;
  const admin = createAdminClient();

  let written = 0;
  for (const day of days) {
    // The IST window [midnight, next midnight) for this calendar day. We pass
    // explicit UTC bounds rather than computing IST in SQL (never re-fork IST
    // math — root CLAUDE.md). `day` is an IST date; anchor it at IST noon to
    // avoid any zone drift, then take the IST midnight of that instant.
    const istNoon = new Date(`${day}T12:00:00+05:30`);
    const dayStart = toISTMidnight(istNoon);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Pull the raw ticks for the window and aggregate in Node — the distinct
    // minute-bucket count per (user, domain). Volume is tiny (≤1 row/user/min).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("usage_heartbeats")
      .select("user_id, domain, captured_at")
      .gte("captured_at", dayStart.toISOString())
      .lt("captured_at", dayEnd.toISOString());

    if (error) {
      console.error(`[usage-service] rollup read failed for ${day}:`, error.message);
      continue;
    }

    type Row = { user_id: string; domain: AppDomain; captured_at: string };
    const rows = mapRows<Row, Row>(data ?? [], (r) => r);

    // (user_id|domain) → Set of distinct minute buckets (epoch-minute ints).
    const buckets = new Map<string, Set<number>>();
    for (const r of rows) {
      const key = `${r.user_id}|${r.domain}`;
      const minute = Math.floor(new Date(r.captured_at).getTime() / 60_000);
      let set = buckets.get(key);
      if (!set) {
        set = new Set<number>();
        buckets.set(key, set);
      }
      set.add(minute);
    }

    const upsertRows = Array.from(buckets.entries()).map(([key, set]) => {
      const [user_id, domain] = key.split("|");
      return { day, user_id, domain: domain as AppDomain, active_minutes: set.size };
    });

    if (upsertRows.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (admin as any)
      .from("usage_daily")
      .upsert(upsertRows, { onConflict: "day,user_id,domain" });

    if (upErr) {
      console.error(`[usage-service] rollup upsert failed for ${day}:`, upErr.message);
      continue;
    }
    written += upsertRows.length;
  }
  return written;
}

/**
 * Drop raw usage_heartbeats rows older than `days` days (default 30). The
 * rollup has already captured them into usage_daily, which is never pruned.
 * Admin client (deny-by-default RLS); this is system maintenance, not a user
 * mutation, so it does not violate the append-only A-11 contract.
 */
export async function pruneOldHeartbeats(days = 30): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("usage_heartbeats")
    .delete()
    .lt("captured_at", cutoff);
  if (error) {
    console.error("[usage-service] pruneOldHeartbeats failed:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD READ — founder/admin only (gated HERE, in the service layer, not
// in the RPC). Reads usage_daily for history + recomputes today live.
// ─────────────────────────────────────────────────────────────────────────

const USAGE_VIEWER_ROLES: readonly UserRole[] = ["admin", "founder"];

/**
 * The usage report for the dashboard: today's active minutes per agent+domain
 * (recomputed live from raw ticks, ≤1 snapshot stale) + `historyDays` of daily
 * history per agent+domain from usage_daily.
 *
 * Founder/admin gate lives HERE (spec): re-reads the caller's profile via
 * getCurrentProfile() and rejects any non-admin/founder caller server-side,
 * regardless of how the action was reached. The RPC itself takes NO role param
 * and never trusts a caller-supplied role (Q-13) — it is admin-client-only.
 * Returns null on rejection or RPC error (the action maps null → empty/UI copy).
 */
export async function getAgentUsage(historyDays = 30): Promise<AgentUsageReport | null> {
  const profile = await getCurrentProfile();
  if (!profile || !USAGE_VIEWER_ROLES.includes(profile.role)) {
    return null;
  }

  const now = new Date();
  const todayStart = toISTMidnight(now); // UTC instant of IST midnight today
  // History lower bound: an IST calendar date `historyDays` days back.
  const historyFromMs = todayStart.getTime() - (historyDays - 1) * 24 * 60 * 60 * 1000;
  const historyFrom = istDateString(new Date(historyFromMs));

  const admin = createAdminClient();
  // get_agent_usage is not in the generated Database type until 0126 is applied
  // + types regenerated — interim admin-client cast (same convention as above).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("get_agent_usage", {
    p_today_start: todayStart.toISOString(),
    p_history_from: historyFrom,
  });

  if (error || !data) {
    if (error) console.error("[usage-service] getAgentUsage RPC failed:", error.message);
    return null;
  }

  // The RPC already returns active_minutes as ::int, but coerce defensively at
  // the JSON boundary (Q-09 — never let an uncast bigint reach the client).
  const raw = data as { today?: unknown[]; history?: unknown[] };
  const today: AgentUsageToday[] = mapRows<Record<string, unknown>, AgentUsageToday>(
    (raw.today ?? []) as Record<string, unknown>[],
    (r) => ({
      user_id: r.user_id as string,
      full_name: (r.full_name as string | null) ?? null,
      domain: r.domain as AppDomain,
      active_minutes: Number(r.active_minutes ?? 0),
    }),
  );
  const history: AgentUsageHistoryPoint[] = mapRows<Record<string, unknown>, AgentUsageHistoryPoint>(
    (raw.history ?? []) as Record<string, unknown>[],
    (r) => ({
      day: r.day as string,
      user_id: r.user_id as string,
      full_name: (r.full_name as string | null) ?? null,
      domain: r.domain as AppDomain,
      active_minutes: Number(r.active_minutes ?? 0),
    }),
  );

  return { today, history };
}

/**
 * ISO 'YYYY-MM-DD' of a UTC instant in the IST calendar. Exported so the rollup
 * job derives "today"/"yesterday" IST dates from this one place — never
 * re-forking the +5:30 math (uses the canonical IST_OFFSET_MS from lib/utils/ist).
 */
export function istDateString(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}
