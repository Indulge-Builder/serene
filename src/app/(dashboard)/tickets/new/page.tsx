import { redirect } from 'next/navigation';
import { memberDb } from '@/lib/supabase/schemas';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/ui/BackButton';
import { NewTicketForm } from '@/components/tickets/NewTicketForm';
import { canAccessRoute } from '@/lib/utils/route-access';
import { TICKETS_PATH } from '@/lib/constants/tickets';

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, TICKETS_PATH)) redirect('/dashboard');
  const { member } = await searchParams;
  let initialMember: { id: string; full_name: string; queendom_id: string | null } | null = null;
  if (member && /^[0-9a-f-]{36}$/i.test(member)) {
    const supabase = await createClient();
    const { data } = await memberDb(supabase).from('members').select('id, full_name, queendom_id').eq('id', member).maybeSingle();
    if (data) initialMember = data as { id: string; full_name: string; queendom_id: string | null };
  }
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <BackButton href={TICKETS_PATH} label="Back to Tickets" />
        <h1 className="type-page-title m-0">New ticket<span className="page-title-dot">.</span></h1>
      </div>
      <NewTicketForm initialMember={initialMember} callerQueendomId={profile.queendom_id ?? null} />
    </main>
  );
}
