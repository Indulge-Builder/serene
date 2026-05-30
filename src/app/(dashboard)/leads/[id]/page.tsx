import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getLeadById, getLeadNotesFull, getLeadActivitiesFull } from '@/lib/services/leads-service';
import { getAdCreativeForCampaign } from '@/lib/services/ad-creatives-service';
import { LeadInfoCard } from '@/components/leads/LeadInfoCard';
import { StatusActionPanel } from '@/components/leads/StatusActionPanel';
import { DynamicFormResponses } from '@/components/leads/DynamicFormResponses';
import { AgentScratchpad } from '@/components/leads/AgentScratchpad';
import { LeadJourneyTimeline } from '@/components/leads/LeadJourneyTimeline';
import { LeadNotesSection } from '@/components/leads/LeadNotesSection';
import { LeadDossierTasksAsync } from '@/components/leads/LeadDossierTasksAsync';
import { LeadActivityLog } from '@/components/leads/LeadActivityLog';
import { PersonalDetailsCard } from '@/components/leads/PersonalDetailsCard';

type Props = { params: Promise<{ id: string }> };

export default async function LeadDossierPage({ params }: Props) {
  const { id } = await params;

  const [profile, lead] = await Promise.all([
    getCurrentProfile(),
    getLeadById(id),
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

  // Fetch supporting data in parallel
  const [notes, activities, adCreative] = await Promise.all([
    getLeadNotesFull(id),
    getLeadActivitiesFull(id),
    lead.utm_campaign ? getAdCreativeForCampaign(lead.utm_campaign) : Promise.resolve(null),
  ]);

  const canEditScratchpad =
    (profile.role === 'agent' && lead.assigned_to === profile.id) ||
    profile.role === 'admin' ||
    profile.role === 'founder';

  const canEditPersonalDetails =
    (profile.role === 'agent' && lead.assigned_to === profile.id) ||
    (profile.role === 'manager' && lead.domain === profile.domain) ||
    profile.role === 'admin' ||
    profile.role === 'founder';

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  return (
    <>
      <main style={{ flex: 1, padding: 'var(--space-8)', maxWidth: '1280px' }}>
        {/* Back link + title row */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            'var(--space-4)',
            marginBottom:   'var(--space-6)',
          }}
        >
          <Link
            href="/leads"
            className="back-link"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            'var(--space-1)',
              fontSize:       'var(--text-xs)',
              color:          'var(--theme-text-tertiary)',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft style={{ width: '0.75rem', height: '0.75rem' }} />
            All leads
          </Link>
        </div>

        {/* Page heading */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1
            style={{
              fontFamily:    'var(--font-serif)',
              fontSize:      'var(--text-2xl)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tighter)',
              lineHeight:    'var(--leading-tight)',
              color:         'var(--theme-text-primary)',
              margin:        0,
            }}
          >
            {fullName}
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
            <LeadInfoCard lead={lead} assigneeName={lead.assignee?.full_name ?? null} adCreative={adCreative} />
            <PersonalDetailsCard lead={lead} canEdit={canEditPersonalDetails} />
            {lead.form_data && Object.keys(lead.form_data).length > 0 && (
              <DynamicFormResponses formData={lead.form_data} />
            )}
          </div>

          {/* Right column — scratchpad */}
          <div>
            <AgentScratchpad
              leadId={lead.id}
              initialContent={lead.private_scratchpad ?? ''}
              canEdit={canEditScratchpad}
            />
          </div>
        </div>

        {/* Notes timeline — above journey per UX spec */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LeadNotesSection notes={notes} />
        </div>

        {/* Journey progress */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LeadJourneyTimeline lead={lead} activities={activities} />
        </div>

        {/* Chronological activity history */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LeadActivityLog activities={activities} />
        </div>

        {/* Next due task */}
        <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
          <Suspense fallback={null}>
            <LeadDossierTasksAsync leadId={lead.id} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
