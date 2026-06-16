import { getAdCreativesForCampaign } from '@/lib/services/ad-creatives-service';
import { getAssignableUsers } from '@/lib/services/profiles-service';
import { LEAD_ASSIGNABLE_ROLES } from '@/lib/constants/roles';
import type { LeadWithAssignee } from '@/lib/services/leads-service';
import { LeadInfoCard } from '@/components/leads/LeadInfoCard';

type Props = {
  lead:          LeadWithAssignee;
  canEdit:       boolean;
  canEditDomain: boolean;
  canReassign:   boolean;
};

/** Async server component — direct child of <Suspense>. Only place that fetches ad creatives + the reassign agent pool. */
export async function LeadInfoCardAsync({ lead, canEdit, canEditDomain, canReassign }: Props) {
  const [adCreatives, agents] = await Promise.all([
    lead.utm_campaign ? getAdCreativesForCampaign(lead.utm_campaign) : Promise.resolve([]),
    canReassign ? getAssignableUsers({ domain: lead.domain, roles: LEAD_ASSIGNABLE_ROLES }) : Promise.resolve([]),
  ]);

  return (
    <LeadInfoCard
      lead={lead}
      assigneeName={lead.assignee?.full_name ?? null}
      adCreatives={adCreatives}
      canEdit={canEdit}
      canEditDomain={canEditDomain}
      canReassign={canReassign}
      agents={agents}
    />
  );
}
