import { redirect } from 'next/navigation';
import { getCurrentProfile, getProfileById } from '@/lib/services/profiles-service';
import { getPersonalTasks } from '@/lib/services/tasks-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentTasksQuerySchema } from '@/lib/validations/mobile-schema';
import { AgentTasksScreen } from '@/components/mobile/screens/AgentTasksScreen';

export const metadata = { title: 'Tasks' };

/**
 * Agent task detail (mobile-ops §7 Tasks room): light route reusing the
 * existing getPersonalTasks read (admin client — the caller is not the
 * assignee, and this page is the manager+ trust boundary: manager only
 * inside their own domain, admin/founder anywhere).
 */
export default async function MobileAgentTasksPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const parsed = AgentTasksQuerySchema.safeParse({ agentId });
  if (!parsed.success) redirect('/m/tasks');

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!['manager', 'admin', 'founder'].includes(profile.role)) redirect('/m');

  const agent = await getProfileById(parsed.data.agentId);
  if (!agent) redirect('/m/tasks');
  if (profile.role === 'manager' && agent.domain !== profile.domain) redirect('/m/tasks');

  const result = await getPersonalTasks(
    agent.id,
    { status: ['to_do', 'in_progress', 'in_review'], limit: 40 },
    createAdminClient(),
  );

  return <AgentTasksScreen agentName={agent.full_name} tasks={result.tasks} />;
}
