"use client";

/**
 * DomainSelector — the global admin/founder domain scope picker (TopBar).
 *
 * Drives the SAME `?domain=` URL param every domain-aware page already reads
 * (leads/deals/campaigns), via the SAME `useUrlFilters` mechanism DealsFilters
 * uses — so a pick re-scopes the current page immediately. It ALSO writes the
 * `serene-domain` cookie so the choice survives navigation to a page reached
 * without the param (pages resolve `domain = param ?? cookie ?? null` for
 * admin/founder server-side).
 *
 * Rendered ONLY for admin/founder — the caller (TopBar) gates the mount. Never
 * trusted as a security boundary: pages ignore the param + cookie for
 * manager/agent regardless of what this writes.
 *
 * A per-page filter-bar domain change (DealsFilters/LeadsFilters) overrides the
 * URL param for that page only; this selector re-reads the param on every
 * render, so it reflects whatever the page currently shows.
 */

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import {
  GIA_DOMAIN_FILTER_ITEMS,
  DOMAIN_LABELS,
  parseGiaDomainParam,
  persistDomainCookie,
  readDomainCookie,
} from "@/lib/constants/domains";

// "All" is a first-class menu choice (clears the param + cookie), not just the
// footer Clear — a sentinel id that never collides with a real Gia domain key.
const ALL_DOMAINS_ID = "__all__";

const DOMAIN_ITEMS = [
  { id: ALL_DOMAINS_ID, label: "All domains" },
  ...GIA_DOMAIN_FILTER_ITEMS,
];

export function DomainSelector() {
  // resetKeys: ['page'] mirrors DealsFilters/LeadsFilters — switching scope
  // must drop pagination so the new domain starts on page 1.
  const { params, push } = useUrlFilters({ resetKeys: ["page"] });

  // The selector must show what the PAGE renders. The page resolves
  // `domain = param ?? cookie` for admin/founder; the URL often has no ?domain=
  // (e.g. after navigating from /leads to /deals), so the selector reads the
  // SAME fallback. Cookie is client-only, so it lands post-mount: SSR/first
  // paint use the param alone (matches the server), then `mounted` flips and the
  // cookie fallback fills in — no hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fromParam = parseGiaDomainParam(params.get("domain"));
  const active = fromParam ?? (mounted ? readDomainCookie() : null);

  function onChange(next: string[]) {
    const picked = next[0] ?? null;
    const domain = picked === ALL_DOMAINS_ID ? null : parseGiaDomainParam(picked);
    // Cookie first so the next navigation has it even if the push transition
    // is still settling; then the param re-scopes the current page.
    persistDomainCookie(domain);
    push({ domain });
  }

  // When scoped, the trigger shows the domain's own label + active (accent)
  // chrome. When "All", selection is empty so the trigger reads as unset (no
  // count badge, no accent) and the label says "All domains".
  return (
    <FilterDropdown
      label={active ? DOMAIN_LABELS[active] : "All domains"}
      icon={Globe}
      items={DOMAIN_ITEMS}
      selected={active ? [active] : []}
      onChange={onChange}
      menuPortal
    />
  );
}
