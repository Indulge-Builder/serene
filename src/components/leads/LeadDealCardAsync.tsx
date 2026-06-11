import { getLeadDeal } from '@/lib/services/deals-service';
import { LeadDealCard } from '@/components/leads/LeadDealCard';

type Props = {
  leadId: string;
};

/**
 * Async server component — direct child of <Suspense fallback={null}>.
 * Most leads have no deal, so the fallback is null (no skeleton, no
 * reserved space); won leads stream the card in with its own top margin.
 */
export async function LeadDealCardAsync({ leadId }: Props) {
  const deal = await getLeadDeal(leadId);
  if (!deal) return null;

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <LeadDealCard deal={deal} />
    </div>
  );
}
