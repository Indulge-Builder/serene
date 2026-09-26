// lib/elaya/rate-gate.ts — THE shared "slow down" gate for batch jobs that call the model side
// by side (the deep read since 0235, the media reader since 0246; never a second copy).
//
// The provider's 429 (rate limit) or 529 / 503 (overloaded) pauses EVERY worker, not just the one
// that heard it, for the provider's retry-after or a doubling pause; a good reply halves the pause
// back. A rate limit never fails a call on its own: the worker waits and asks again, inside its
// run's deadline. Live Elaya chats share the account, so a job that kept hammering would take the
// founders' own replies down with it.

export type RateGate = {
  /** Wait out any pause in force, never past the deadline. */
  wait(deadline: number): Promise<void>;
  /** The provider said slow down: pause everyone (retry-after when given, else the doubling pause). */
  hit(retryAfterMs?: number): void;
  /** A good reply: relax the pause towards the floor. */
  ok(): void;
  readonly hits: number;
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function createRateGate(opts: { pauseMs: number; pauseMaxMs: number }): RateGate {
  let pausedUntil = 0;
  let pauseMs = opts.pauseMs;
  let hits = 0;
  return {
    async wait(deadline: number) {
      const d = Math.min(pausedUntil, deadline) - Date.now();
      if (d > 0) await sleep(d);
    },
    hit(retryAfterMs?: number) {
      const ms = Math.max(retryAfterMs ?? 0, pauseMs);
      pausedUntil = Math.max(pausedUntil, Date.now() + ms);
      pauseMs = Math.min(pauseMs * 2, opts.pauseMaxMs);
      hits++;
    },
    ok() { pauseMs = Math.max(opts.pauseMs, Math.floor(pauseMs / 2)); },
    get hits() { return hits; },
  };
}

function errStatus(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
}

/** Was this the provider asking us to slow down (as opposed to this call being wrong)? */
export function isRateLimited(e: unknown): boolean {
  const s = errStatus(e);
  if (s === 429 || s === 529 || s === 503) return true;
  return /rate.?limit|overloaded|too many requests/i.test(e instanceof Error ? e.message : String(e));
}

/** The provider's retry-after header as milliseconds, when it sent one. */
export function retryAfterMs(e: unknown): number | undefined {
  const h = (e as { headers?: unknown } | null)?.headers;
  let v: unknown;
  if (h && typeof (h as { get?: unknown }).get === 'function') v = (h as { get: (k: string) => string | null }).get('retry-after');
  else if (h && typeof h === 'object') v = (h as Record<string, unknown>)['retry-after'];
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x * 1000 : undefined;
}
