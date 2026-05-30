import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getDashboardSummary, getLeadVolumeByPeriod } from '@/lib/services/dashboard-service';
import { DashboardCanvas } from '@/components/dashboard/DashboardCanvas';
import type { AppDomain, UserRole } from '@/lib/types/database';

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const role   = profile.role as UserRole;
  const domain = profile.domain as AppDomain;

  // Fetch RPC summary + week volume in parallel — one network round-trip each.
  const [rpcData, weekVolume] = await Promise.all([
    getDashboardSummary(role, domain, profile.id),
    getLeadVolumeByPeriod(role, domain, 'week'),
  ]);

  const initialData = { ...rpcData, lead_volume: weekVolume };

  return (
    <main style={{ flex: 1, padding: 'var(--space-8)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <p
          style={{
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-medium)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color:         'var(--theme-text-tertiary)',
            margin:        0,
            marginBottom:  'var(--space-1)',
          }}
        >
          Overview
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-xl)',
            color:      'var(--theme-text-primary)',
            margin:     0,
          }}
        >
          Welcome back, {profile.full_name.split(' ')[0]}.
        </h1>
      </div>

      <DashboardCanvas
        userId={profile.id}
        role={profile.role}
        domain={profile.domain}
        initialData={initialData}
      />
    </main>
  );
}
