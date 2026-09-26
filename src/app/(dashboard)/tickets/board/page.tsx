// /tickets/board — the live board: a column per status, cards you drag between them, one
// queendom or all (admin/founder). The same filter bar as the list; Realtime keeps it current.

import Link from 'next/link';
import { BackButton } from '@/components/ui/BackButton';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { List, Plus } from 'lucide-react';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getQueendoms } from '@/lib/services/members-service';
import { listBoardTickets, listQueendomStaff, getTicketSettings } from '@/lib/services/tickets-service';
import { canAccessRoute } from '@/lib/utils/route-access';
import { TicketsFilters } from '@/components/tickets/TicketsFilters';
import { TicketBoard } from '@/components/tickets/TicketBoard';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
import { TICKETS_PATH } from '@/lib/constants/tickets';
import { isCompanyWideSeat } from '@/lib/constants/sia-roles';

export const metadata = { title: 'Ticket board' };

const BTN: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap' };

export default async function TicketBoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, TICKETS_PATH)) redirect('/dashboard');
  const sp = await searchParams;
  // Admin, founder and the Joker head (0244) pick a queendom or see them all; a seat sees its own.
  const everyQueendom = profile.role === 'admin' || profile.role === 'founder' || isCompanyWideSeat(profile);
  const picked = typeof sp.queendom === 'string' && /^[0-9a-f-]{36}$/i.test(sp.queendom) ? sp.queendom : null;
  const queendomId = everyQueendom ? picked : (profile.queendom_id ?? null);

  const [queendoms, staff, settings, tickets] = await Promise.all([
    getQueendoms(), listQueendomStaff(everyQueendom ? null : (profile.queendom_id ?? null)), getTicketSettings(), listBoardTickets(queendomId),
  ]);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <BackButton href={TICKETS_PATH} label="Back to Tickets" />
          <h1 className="type-page-title m-0">Board<span className="page-title-dot">.</span></h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href={TICKETS_PATH} className="serene-btn-secondary serene-pressable" style={BTN}><List style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} /><span className="max-md:sr-only">List</span></Link>
          <Link href={`${TICKETS_PATH}/new`} className="serene-btn-primary serene-pressable" style={BTN}><Plus style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} /><span className="max-md:sr-only">New ticket</span></Link>
          {TOP_BAR_ENABLED && <PageControls isPrivileged={false} />}
        </div>
      </div>
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"><TicketsFilters queendoms={everyQueendom ? queendoms : queendoms.filter((q) => q.id === profile.queendom_id)} staff={staff} tags={settings.tags} labels={settings.statusLabels} /></div>
      <TicketBoard initial={tickets} queendomId={queendomId} labels={settings.statusLabels} />
    </main>
  );
}
