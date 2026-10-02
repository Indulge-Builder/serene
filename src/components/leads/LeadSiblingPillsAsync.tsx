import { getLeadSiblings, type LeadViewer } from '@/lib/services/lead-identity';
import { LeadSiblingPills } from '@/components/leads/LeadSiblingPills';
import type { AppDomain } from '@/lib/types/database';

type Props = {
  leadId: string;
  ownRef: string;
  ownDomain: AppDomain;
  viewer: LeadViewer;
};

/** Async server component — direct child of <Suspense>. The only dossier call of getLeadSiblings. */
export async function LeadSiblingPillsAsync({ leadId, ownRef, ownDomain, viewer }: Props) {
  const siblings = await getLeadSiblings(viewer, leadId);
  return <LeadSiblingPills ownRef={ownRef} ownDomain={ownDomain} siblings={siblings} />;
}
