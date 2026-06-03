import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { BackButton } from '@/components/ui/BackButton';

import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getLeadBySlug, getLeadById, getLeadNotesFull, getLeadActivitiesFull, getAgentsForDomain } from '@/lib/services/leads-service';
import { getAdCreativesForCampaign } from '@/lib/services/ad-creatives-service';
import { getConversationByLeadId, getMessages } from '@/lib/services/whatsapp-service';
import { LeadInfoCard } from '@/components/leads/LeadInfoCard';
import { StatusActionPanel } from '@/components/leads/StatusActionPanel';
import { DynamicFormResponses } from '@/components/leads/DynamicFormResponses';
import { LeadNotesInput } from '@/components/leads/LeadNotesInput';
import { LeadJourneyTimeline } from '@/components/leads/LeadJourneyTimeline';
import { LeadNotesSection } from '@/components/leads/LeadNotesSection';
import { LeadTasksAsync } from '@/components/leads/LeadTasksAsync';
import { LeadTasksCardSkeleton } from '@/components/leads/LeadTasksCardSkeleton';
import { LeadActivityLog } from '@/components/leads/LeadActivityLog';
import { PersonalDetailsCard } from '@/components/leads/PersonalDetailsCard';
import { LeadWhatsAppCard } from '@/components/leads/LeadWhatsAppCard';

type Props = { params: Promise<{ id: string }> };

export default async function LeadDossierPage({ params }: Props) {
  const { id } = await params;

  // Try slug first; fall back to UUID for any un-slugged rows (backfill window)
  const [profile, lead] = await Promise.all([
    getCurrentProfile(),
    getLeadBySlug(id).then((r) => r ?? getLeadById(id)),
  ]);

  if (!profile) redirect('/login');
  if (!lead) notFound();

  // Access check — mirrors the action-level check
  const hasAccess =
    (profile.role === 'agent' && lead.assigned_to === profile.id) ||
    (profile.role === 'manager' && lead.domain === profile.domain) ||
    profile.role === 'admin' ||
    profile.role === 'founder';

  if (!hasAccess) redirect('/leads');

  const canReassign =
    profile.role === 'manager' ||
    profile.role === 'admin' ||
    profile.role === 'founder';

  // Fetch supporting data in parallel
  const [notes, activities, adCreatives, agents, initialConversation] = await Promise.all([
    getLeadNotesFull(lead.id),
    getLeadActivitiesFull(lead.id),
    lead.utm_campaign ? getAdCreativesForCampaign(lead.utm_campaign) : Promise.resolve([]),
    canReassign ? getAgentsForDomain(lead.domain) : Promise.resolve([]),
    getConversationByLeadId(lead.id),
  ]);

  const initialMessages = initialConversation
    ? await getMessages(initialConversation.id, { limit: 30 })
    : [];

  const canEditLeadFields =
    (profile.role === 'agent' && lead.assigned_to === profile.id) ||
    (profile.role === 'manager' && lead.domain === profile.domain) ||
    profile.role === 'admin' ||
    profile.role === 'founder';

  const canEditDomain = canEditLeadFields && profile.role !== 'agent';

  const canEditPersonalDetails =
    (profile.role === 'agent' && lead.assigned_to === profile.id) ||
    (profile.role === 'manager' && lead.domain === profile.domain) ||
    profile.role === 'admin' ||
    profile.role === 'founder';

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  return (
    <>
      <main style={{ flex: 1, padding: 'var(--space-8)', maxWidth: '1280px' }}>
        {/* Page header — back button + Playfair title */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <BackButton href="/leads" label="Back to Leads" />

          <div style={{ minWidth: 0 }}>
            <h1
              className="type-page-title"
              style={{ margin: 0 }}
            >
              {fullName}<span className="page-title-dot">.</span>
            </h1>
            {lead.phone && (
              <p
                style={{
                  marginTop:  'var(--space-1)',
                  fontFamily: 'var(--font-mono)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-secondary)',
                }}
              >
                {lead.phone}
              </p>
            )}
          </div>
        </div>

        {/* Status action panel */}
        <StatusActionPanel lead={lead} callerProfile={profile} />

        {/* Two-column layout */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 320px',
            gap:                 'var(--space-6)',
            marginTop:           'var(--space-6)',
          }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <LeadInfoCard
              lead={lead}
              assigneeName={lead.assignee?.full_name ?? null}
              adCreatives={adCreatives}
              canEdit={canEditLeadFields}
              canEditDomain={canEditDomain}
              canReassign={canReassign}
              agents={agents}
            />
            <PersonalDetailsCard lead={lead} canEdit={canEditPersonalDetails} />
            {lead.form_data && Object.keys(lead.form_data).length > 0 && (
              <DynamicFormResponses formData={lead.form_data} />
            )}
          </div>

          {/* Right column — stretches to match left column height */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', alignSelf: 'stretch' }}>
            <Suspense fallback={<LeadTasksCardSkeleton />}>
              <LeadTasksAsync leadId={lead.id} />
            </Suspense>
            <LeadNotesInput
              leadId={lead.id}
              canAdd={canEditPersonalDetails}
            />
          </div>
        </div>

        {/* Notes timeline — above journey per UX spec */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LeadNotesSection notes={notes} />
        </div>

        {/* WhatsApp chat card — same visual weight as LeadNotesSection */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LeadWhatsAppCard
            leadId={lead.id}
            leadPhone={lead.phone}
            leadName={fullName}
            callerProfile={{ id: profile.id, role: profile.role }}
            initialConversation={initialConversation}
            initialMessages={initialMessages}
          />
        </div>

        {/* Journey progress */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LeadJourneyTimeline lead={lead} activities={activities} />
        </div>

        {/* Chronological activity history */}
        <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
          <LeadActivityLog activities={activities} />
        </div>
      </main>
    </>
  );
}
