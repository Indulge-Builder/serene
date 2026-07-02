// THE Redis cache-aside envelope (dry-audit 2026-06-20 D1). Wraps the
// get→null-check→catch → fetch → setex→catch boilerplate once. Redis failure is
// non-fatal on both sides (warn, fall through to live). `normalize` re-shapes a
// cached hit (e.g. bigint coercion) so stale envelopes can never leak raw shapes.
import { redis } from '@/lib/redis';

export async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  normalize?: (raw: T) => T,
): Promise<T> {
  try {
    const hit = await redis.get<T>(key);
    if (hit !== null) return normalize ? normalize(hit) : hit;
  } catch (e) {
    console.error('[cache] get failed', key, e);
  }
  const fresh = await fetchFn();
  try {
    await redis.setex(key, ttlSeconds, fresh);
  } catch (e) {
    console.error('[cache] setex failed', key, e);
  }
  return fresh;
}
