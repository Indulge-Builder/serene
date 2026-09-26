import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getMobileDomains } from '@/lib/constants/mobile-rooms';
import { getActivityFeed } from '@/lib/services/activity-service';
import { ActivityRoom } from '@/components/mobile/rooms/ActivityRoom';

export const metadata = { title: 'Activity' };

/**
 * Activity room (mobile-ops §3/§8). RSC seeds the first domain's feed
 * from activity_events (migration 0159); the screen paginates through
 * getActivityFeedAction and subscribes to the domain's Realtime channel.
 */
export default async function MobileActivityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const domains = getMobileDomains(profile.role, profile.domain);
  const seed = domains.length > 0 ? await getActivityFeed(domains[0]) : null;

  return <ActivityRoom domains={domains} seed={seed} />;
}
