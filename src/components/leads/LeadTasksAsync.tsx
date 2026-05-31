import { getAllLeadTasks } from '@/lib/services/tasks-service';
import { LeadTasksCard } from '@/components/leads/LeadTasksCard';

type Props = {
  leadId: string;
};

/** Async server component — direct child of <Suspense>. Only place that touches the service. */
export async function LeadTasksAsync({ leadId }: Props) {
  const tasks = await getAllLeadTasks(leadId);
  return <LeadTasksCard leadId={leadId} initialTasks={tasks} />;
}
