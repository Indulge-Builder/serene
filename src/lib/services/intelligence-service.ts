// Call Intelligence — service_cases + conversation_hooks queries.
// Spec: docs/modules/call-intelligence.md §6–§7.
//
// Two read shapes, two cache strategies:
//
// 1. getHelpdeskLibrary(domain) — the FULL library for /helpdesk, loaded once
//    per page mount and filtered entirely client-side (zero server round-trips
//    per keystroke). Redis cache-aside: one { cases, hooks } envelope per
//    domain under REDIS_KEYS.helpdeskCases(domain), 1-hour TTL, explicitly
//    invalidated by the admin write actions in lib/actions/intelligence.ts.
//    Redis failure degrades to a live Supabase read — never a user error.
//
// 2. getCasesForLead / getHooksForCategories — the dossier interest card.
//    Deliberately NOT Redis-cached: a ≤6-row indexed lookup, lead-specific,
//    rendered server-side inside the dossier's own streaming boundary.

import { createClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';
import { REDIS_KEYS, REDIS_TTL } from '@/lib/constants/redis-keys';
import type { AppDomain, Database } from '@/lib/types/database';

type ServiceCaseRow      = Database['public']['Tables']['service_cases']['Row'];
type ConversationHookRow = Database['public']['Tables']['conversation_hooks']['Row'];

/** UI shape — excludes search_vector/embedding (server-side concerns). */
export type ServiceCase = Pick<
  ServiceCaseRow,
  | 'id' | 'domain' | 'category' | 'tags' | 'title' | 'summary'
  | 'outcome_note' | 'city' | 'country' | 'is_featured' | 'sort_order'
>;

export type ConversationHook = Pick<
  ConversationHookRow,
  'id' | 'domain' | 'category' | 'hook' | 'context' | 'sort_order'
>;

export type HelpdeskLibrary = {
  cases: ServiceCase[];
  hooks: ConversationHook[];
};

const CASE_COLUMNS =
  'id, domain, category, tags, title, summary, outcome_note, city, country, is_featured, sort_order';
const HOOK_COLUMNS = 'id, domain, category, hook, context, sort_order';

/** Values interpolated into PostgREST .or() strings must stay slug-safe. */
const SLUG_SAFE = /^[a-z0-9_ -]+$/;

// ─────────────────────────────────────────────
// Helpdesk: full library per domain (Redis 1hr → Supabase fallthrough)
// ─────────────────────────────────────────────
export async function getHelpdeskLibrary(domain: AppDomain): Promise<HelpdeskLibrary> {
  const key = REDIS_KEYS.helpdeskCases(domain);
  try {
    const cached = await redis.get<HelpdeskLibrary>(key);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();
  const [casesRes, hooksRes] = await Promise.all([
    supabase
      .from('service_cases')
      .select(CASE_COLUMNS)
      .eq('domain', domain)
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('conversation_hooks')
      .select(HOOK_COLUMNS)
      .eq('domain', domain)
      .order('sort_order', { ascending: true }),
  ]);

  if (casesRes.error) {
    console.error('[intelligence-service] cases query failed:', casesRes.error.message);
  }
  if (hooksRes.error) {
    console.error('[intelligence-service] hooks query failed:', hooksRes.error.message);
  }

  const result: HelpdeskLibrary = {
    cases: (casesRes.data ?? []) as ServiceCase[],
    hooks: (hooksRes.data ?? []) as ConversationHook[],
  };

  // Only cache complete reads — a partial envelope would serve for an hour.
  if (!casesRes.error && !hooksRes.error) {
    try {
      await redis.setex(key, REDIS_TTL.HELPDESK_CASES, result);
    } catch {
      /* non-fatal */
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Dossier card: ≤6 cases matched on interests OR city tag (no Redis)
// ─────────────────────────────────────────────
export async function getCasesForLead(
  interests: string[],
  city: string | null,
  domain: AppDomain,
): Promise<ServiceCase[]> {
  const safeInterests = interests.filter((i) => SLUG_SAFE.test(i));
  const citySlug = city?.trim().toLowerCase() ?? '';
  const hasCity = citySlug.length > 0 && SLUG_SAFE.test(citySlug);

  if (safeInterests.length === 0 && !hasCity) return [];

  const supabase = await createClient();
  let query = supabase
    .from('service_cases')
    .select(CASE_COLUMNS)
    .eq('domain', domain);

  if (safeInterests.length > 0 && hasCity) {
    query = query.or(
      `category.in.(${safeInterests.join(',')}),tags.cs.{"${citySlug}"}`,
    );
  } else if (safeInterests.length > 0) {
    query = query.in('category', safeInterests);
  } else {
    query = query.contains('tags', [citySlug]);
  }

  const { data, error } = await query
    .order('is_featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(6);

  if (error) {
    console.error('[intelligence-service] getCasesForLead failed:', error.message);
    return [];
  }
  return (data ?? []) as ServiceCase[];
}

// ─────────────────────────────────────────────
// Dossier card: 3–5 hooks for the matched categories (no Redis)
// ─────────────────────────────────────────────
export async function getHooksForCategories(
  categories: string[],
  domain: AppDomain,
  limit = 5,
): Promise<ConversationHook[]> {
  const safe = categories.filter((c) => SLUG_SAFE.test(c));
  if (safe.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversation_hooks')
    .select(HOOK_COLUMNS)
    .eq('domain', domain)
    .in('category', safe)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[intelligence-service] getHooksForCategories failed:', error.message);
    return [];
  }
  return (data ?? []) as ConversationHook[];
}
