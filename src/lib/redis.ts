// Server-only — never import in client components or pages marked 'use client'.
// Same constraint as src/lib/supabase/server.ts.
// Rule 05 pattern applied to Redis: this is the ONLY instantiation point.

import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url)   throw new Error('Missing env var: UPSTASH_REDIS_REST_URL');
    if (!token) throw new Error('Missing env var: UPSTASH_REDIS_REST_TOKEN');
    _redis = Redis.fromEnv();
  }
  return _redis;
}

// Lazy proxy: preserves the `redis.del(...)` / `redis.setex(...)` call shape at every existing
// call site while deferring construction (and the env-var throw) to first method access.
// The throw now fires on first USE, not on import — so the Trigger.dev build scan can import
// any module in the redis dependency chain without the runtime secrets present.
export const redis = new Proxy({} as Redis, {
  get(_t, prop) {
    const r = getRedis();
    const v = (r as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(r) : v;
  },
});
