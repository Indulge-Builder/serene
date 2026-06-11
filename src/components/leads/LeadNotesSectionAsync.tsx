import { getLeadNotesFull } from '@/lib/services/leads-service';
import { LeadNotesSection } from '@/components/leads/LeadNotesSection';

type Props = {
  leadId: string;
};

/** Async server component — direct child of <Suspense>. Only place that calls getLeadNotesFull on the dossier. */
export async function LeadNotesSectionAsync({ leadId }: Props) {
  const notes = await getLeadNotesFull(leadId);
  return <LeadNotesSection notes={notes} />;
}
