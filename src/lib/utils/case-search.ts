// THE service-case query matcher — shared by /helpdesk (HelpdeskSearch) and
// the dossier ServiceInterestCard. Synchronous JS over the in-memory library:
// zero server round-trips per keystroke, no debounce, no FTS (Call
// Intelligence spec §6/§9). At >500 cases, swap includes() for fuse.js here —
// never a server query. Client-safe pure function; type-only service import.

import type { ServiceCase } from '@/lib/services/intelligence-service';

export function caseMatchesQuery(c: ServiceCase, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.title.toLowerCase().includes(q) ||
    c.summary.toLowerCase().includes(q) ||
    (c.city ?? '').toLowerCase().includes(q) ||
    (c.country ?? '').toLowerCase().includes(q) ||
    c.tags.some((t) => t.includes(q))
  );
}
