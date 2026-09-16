/**
 * mapWithConcurrency — THE bounded-parallel map. Runs `fn` over `items` with at most `limit`
 * in flight, preserving order in the result. A rejection propagates like Promise.all; callers
 * that want per-item failure isolation catch inside `fn`. No dependency, no queue object:
 * `limit` workers each pull the next index until the list is empty.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
