import { getCasesForLead, getHooksForCategories } from '@/lib/services/intelligence-service';
import { ServiceInterestCard } from '@/components/leads/ServiceInterestCard';
import type { AppDomain, Lead } from '@/lib/types/database';

type Props = {
  lead: Pick<Lead, 'service_interests' | 'city' | 'domain'>;
};

/**
 * Async server component — direct child of <Suspense> on the dossier page
 * (Call Intelligence Surface A). Only dossier call site for
 * getCasesForLead/getHooksForCategories; both fetches run in one Promise.all —
 * never a sequential await (the page-level waterfall is the failure mode the
 * spec calls out). ALWAYS renders the card (2026-06-12): leads with no
 * interests/matches get the search-first view — the card owns the library
 * search, so an empty curated set is a starting point, not a dead end.
 */
export async function ServiceInterestCardAsync({ lead }: Props) {
  const interests = lead.service_interests ?? [];
  // leads.Row.domain is `string` in the hand-maintained database.ts (the DB
  // column is app_domain since migration 0041) — narrow once at this boundary.
  const domain = lead.domain as AppDomain;

  const [cases, hooks] = await Promise.all([
    // getCasesForLead returns [] itself when interests AND city are both empty.
    getCasesForLead(interests, lead.city, domain),
    // Hooks are scoped to the lead's stated interest categories; a city-only
    // tag match shows cases but no hooks (no category to scope to).
    interests.length > 0
      ? getHooksForCategories(interests, domain)
      : Promise.resolve([]),
  ]);

  return <ServiceInterestCard interests={interests} cases={cases} hooks={hooks} domain={domain} />;
}
