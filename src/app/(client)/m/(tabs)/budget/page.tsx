import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getMobileDomains } from '@/lib/constants/mobile-rooms';
import { getMobileBudgetData } from '@/lib/services/mobile-service';
import { BudgetRoom } from '@/components/mobile/rooms/BudgetRoom';

export const metadata = { title: 'Budget' };

/**
 * Budget room (mobile-ops §3). RSC seeds the first swipeable domain;
 * swipes refresh through getMobileBudgetAction (A-06). The tech-team
 * expense tracker is a Coming Soon placeholder by contract (§7).
 */
export default async function MobileBudgetPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const domains = getMobileDomains(profile.role, profile.domain);
  const seed = domains.length > 0 ? await getMobileBudgetData(domains[0]) : null;

  return <BudgetRoom domains={domains} seed={seed} />;
}
