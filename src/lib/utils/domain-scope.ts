import "server-only";

import type { cookies } from "next/headers";
import type { SearchParams } from "next/dist/server/request/search-params";
import {
  DOMAIN_COOKIE,
  parseGiaDomainParam,
  type GiaDomain,
} from "@/lib/constants/domains";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** Read the raw `domain` value out of resolved searchParams (string | string[]). */
function readDomainSearchParam(searchParams: Awaited<SearchParams>): string | null {
  const v = searchParams.domain;
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
}

/**
 * resolveDomainParam — THE single domain-scope resolver for the domain-aware
 * pages (leads / deals / campaigns). Replaces the per-page inline
 * `parseGiaDomainParam(getString('domain'))` + admin/founder branch + cookie
 * fallback. Cookie logic lives ONLY here — never inline a `serene-domain` read
 * in a page again.
 *
 * Returns:
 *   - admin / founder → the chosen Gia domain: `?domain=` param first, then the
 *     `serene-domain` cookie (the TopBar selector's cross-page memory), else
 *     `null` ("All" scope). The cookie is consulted only when TOP_BAR_ENABLED.
 *   - manager / agent → ALWAYS `null` — manager is force-scoped to `callerDomain`
 *     by the service, agent has no domain filter. Neither the param nor the
 *     cookie is ever read for them.
 *
 * NOT a security boundary: the page parsers + service role-gates remain the
 * authority. A crafted `?domain=` or cookie can never widen a manager/agent's
 * scope because this returns `null` for them regardless of input.
 *
 * Synchronous: the caller passes the already-awaited searchParams + cookieStore
 * (`await cookies()`), so this does no awaiting itself.
 */
export function resolveDomainParam(
  searchParams: Awaited<SearchParams>,
  cookieStore: CookieStore,
  role: string,
): GiaDomain | null {
  // Manager/agent: scope is server-forced — param and cookie are both ignored.
  if (role !== "admin" && role !== "founder") return null;

  const fromParam = parseGiaDomainParam(readDomainSearchParam(searchParams));
  if (fromParam) return fromParam;

  if (!TOP_BAR_ENABLED) return null;
  return parseGiaDomainParam(cookieStore.get(DOMAIN_COOKIE)?.value);
}
