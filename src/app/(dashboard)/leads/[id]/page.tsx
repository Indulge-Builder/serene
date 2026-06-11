import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { BackButton } from '@/components/ui/BackButton';

import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getLeadBySlug, getLeadById } from '@/lib/services/leads-service';
import { StatusActionPanel } from '@/components/leads/StatusActionPanel';
import { DynamicFormResponses } from '@/components/leads/DynamicFormResponses';
import { LeadNotesInput } from '@/components/leads/LeadNotesInput';
import { PersonalDetailsCard } from '@/components/leads/PersonalDetailsCard';
import { LeadInfoCardAsync } from '@/components/leads/LeadInfoCardAsync';
import { LeadDealCardAsync } from '@/components/leads/LeadDealCardAsync';
import { LeadNotesSectionAsync } from '@/components/leads/LeadNotesSectionAsync';
import { LeadActivitiesAsync } from '@/components/leads/LeadActivitiesAsync';
import { LeadWhatsAppCardAsync } from '@/components/leads/LeadWhatsAppCardAsync';
import { LeadTasksAsync } from '@/components/leads/LeadTasksAsync';
import { LeadTasksCardSkeleton } from '@/components/leads/LeadTasksCardSkeleton';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };

// Streaming shape (perf audit 2026-06-11 item B):
// wave 1 (blocking) — profile + lead only; paints header, StatusActionPanel,
// PersonalDetailsCard, form responses, notes input in one round trip.
// Everything else is a self-fetching async child behind its own <Suspense>
// boundary — info card (ad creatives + agents), deal card, tasks, WhatsApp
// (conversation → messages serial hop stays inside the boundary), notes
// timeline, journey + activity log.
export default async function LeadDossierPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const rawFrom = sp.from ? decodeURIComponent(sp.from) : null;
  const backHref = rawFrom?.startsWith('/leads') ? rawFrom : '/leads';

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
          <BackButton href={backHref} label="Back to Leads" />

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

        {/* Closed-deal summary — only when the lead has a linked deal (won).
            null fallback: most leads have no deal, a skeleton here would flash
            and shift layout for nothing. */}
        <Suspense fallback={null}>
          <LeadDealCardAsync leadId={lead.id} />
        </Suspense>

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
            <Suspense fallback={<DossierCardSkeleton headerWidth={140} rows={5} />}>
              <LeadInfoCardAsync
                lead={lead}
                canEdit={canEditLeadFields}
                canEditDomain={canEditDomain}
                canReassign={canReassign}
              />
            </Suspense>
            {lead.form_data && Object.keys(lead.form_data).length > 0 && (
              <DynamicFormResponses formData={lead.form_data} />
            )}
            <PersonalDetailsCard lead={lead} canEdit={canEditPersonalDetails} />
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
            <Suspense fallback={<DossierCardSkeleton headerWidth={100} rows={3} />}>
              <LeadWhatsAppCardAsync
                leadId={lead.id}
                leadPhone={lead.phone}
                leadName={fullName}
                callerProfile={{ id: profile.id, role: profile.role }}
              />
            </Suspense>
          </div>
        </div>

        {/* Notes timeline — above journey per UX spec */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Suspense fallback={<DossierCardSkeleton headerWidth={110} rows={3} />}>
            <LeadNotesSectionAsync leadId={lead.id} />
          </Suspense>
        </div>

        {/* Journey progress + chronological activity history — one fetch,
            margins owned by LeadActivitiesAsync; fallback mirrors them */}
        <Suspense
          fallback={
            <>
              <div style={{ marginTop: 'var(--space-6)' }}>
                <DossierCardSkeleton headerWidth={130} rows={2} />
              </div>
              <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
                <DossierCardSkeleton headerWidth={130} rows={4} />
              </div>
            </>
          }
        >
          <LeadActivitiesAsync lead={lead} />
        </Suspense>
      </main>
    </>
  );
}
