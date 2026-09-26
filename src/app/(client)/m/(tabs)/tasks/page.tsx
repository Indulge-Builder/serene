import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getMobileDomains } from '@/lib/constants/mobile-rooms';
import { mobileMonthRange } from '@/lib/services/mobile-service';
import { getDomainTaskSummary } from '@/lib/services/tasks-service';
import { TasksRoom } from '@/components/mobile/rooms/TasksRoom';

export const metadata = { title: 'Tasks' };

/**
 * Tasks room (mobile-ops §3). RSC seeds the first swipeable domain via
 * the get_domain_task_summary RPC (migration 0160); swipes refresh
 * through getDomainTaskSummaryAction (A-06).
 */
export default async function MobileTasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const domains = getMobileDomains(profile.role, profile.domain);
  const { from, to } = mobileMonthRange();
  const seed =
    domains.length > 0 ? await getDomainTaskSummary(domains[0], from, to) : null;

  return <TasksRoom domains={domains} seed={seed} />;
}
