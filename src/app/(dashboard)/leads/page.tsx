import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getLeadsByRole } from '@/lib/services/leads-service';
import { TopBar } from '@/components/layout/TopBar';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsTableSkeleton } from '@/components/leads/LeadsTableSkeleton';

export default async function LeadsPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');

  // Guests have no access to leads
  if (profile.role === 'guest') redirect('/dashboard');

  const leads = await getLeadsByRole(profile.role, profile.id, profile.domain);

  return (
    <>
      <TopBar profile={profile} title="Leads" />
      <main style={{ flex: 1, padding: 'var(--space-8)' }}>
        {/* Page header */}
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
            {profile.role === 'agent'
              ? 'Your Assignments'
              : profile.role === 'manager'
                ? 'All leads in your domain'
                : 'All leads across all domains'}
          </h1>
        </div>

        {/* Table */}
        <Suspense fallback={<LeadsTableSkeleton />}>
          <LeadsTable leads={leads} />
        </Suspense>
      </main>
    </>
  );
}
