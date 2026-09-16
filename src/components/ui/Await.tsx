'use client';

import { use, type ReactNode } from 'react';

// <Await promise={p}>{(value) => …}</Await> — THE promise → render-prop
// resolver for client components that receive a Promise from an RSC
// (React 19 `use()`). Mount it INSIDE a <Suspense> at the call site: the
// boundary shows its fallback until the promise settles, then the children
// render with the value. Lets a server page hand a client shell its data
// WITHOUT awaiting it first — the shell paints, the data streams in behind
// the boundary. The promise must never reject (catch → a safe empty shape in
// the RSC); a rejection here would surface as the nearest error boundary.
export function Await<T>({
  promise,
  children,
}: {
  promise: Promise<T>;
  children: (value: T) => ReactNode;
}) {
  return children(use(promise));
}
