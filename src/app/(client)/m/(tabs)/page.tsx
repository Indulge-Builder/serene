import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getMobileDomains } from '@/lib/constants/mobile-rooms';
import {
  getMobileDashboardData,
  buildMobileGreeting,
} from '@/lib/services/mobile-service';
import { DashboardRoom } from '@/components/mobile/rooms/DashboardRoom';

export const metadata = { title: 'Home' };

/**
 * Dashboard room (mobile-ops §3). RSC seeds the first swipeable domain;
 * the screen refreshes the rest through getMobileDashboardAction (A-06).
 */
export default async function MobileHomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const domains = getMobileDomains(profile.role, profile.domain);
  const seed =
    domains.length > 0
      ? await getMobileDashboardData(profile.role, profile.domain, domains[0])
      : null;

  return (
    <DashboardRoom
      domains={domains}
      seed={seed}
      greeting={buildMobileGreeting(profile.full_name)}
    />
  );
}
