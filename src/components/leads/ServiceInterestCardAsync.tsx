import { getCasesForLead, getHooksForCategories } from '@/lib/services/intelligence-service';
import { ServiceInterestCard } from '@/components/leads/ServiceInterestCard';
import type { AppDomain, Lead } from '@/lib/types/database';

type Props = {
  lead: Pick<Lead, 'service_interests' | 'city' | 'domain'>;
};

/**
 * Async server component — direct child of <Suspense fallback={null}> on the
 * dossier page (Call Intelligence Surface A). Only dossier call site for
 * getCasesForLead/getHooksForCategories; both fetches run in one Promise.all —
 * never a sequential await (the page-level waterfall is the failure mode the
 * spec calls out). Renders nothing when the lead gives us nothing to match —
 * no placeholder, no DOM node.
 */
export async function ServiceInterestCardAsync({ lead }: Props) {
  const interests = lead.service_interests ?? [];
  // leads.Row.domain is `string` in the hand-maintained database.ts (the DB
  // column is app_domain since migration 0041) — narrow once at this boundary.
  const domain = lead.domain as AppDomain;

  const [cases, hooks] = await Promise.all([
    getCasesForLead(interests, lead.city, domain),
    // Hooks are scoped to the lead's stated interest categories; a city-only
    // tag match shows cases but no hooks (no category to scope to).
    interests.length > 0
      ? getHooksForCategories(interests, domain)
      : Promise.resolve([]),
  ]);

  // Empty interests AND no city-tag matches → the section does not exist.
  if (interests.length === 0 && cases.length === 0) return null;

  return <ServiceInterestCard interests={interests} cases={cases} hooks={hooks} />;
}
