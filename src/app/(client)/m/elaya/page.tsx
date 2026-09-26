import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { hasElayaAccess } from '@/lib/utils/route-access';
import { resolveElayaChatSeed } from '@/lib/services/elaya-service';
import { ElayaChatScreen } from '@/components/mobile/screens/ElayaChatScreen';

export const metadata = { title: 'Elaya' };

/**
 * The Elaya knob (mobile-ops §10) — the REAL brain. RSC resolves the same
 * seed the /elaya page and the floating widget use (resolveElayaChatSeed —
 * one active 24h session per user across channels); the screen streams
 * from /api/elaya/chat through the shared elaya-stream transport.
 */
export default async function MobileElayaPage() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect('/login');
  if (!hasElayaAccess(profile)) redirect('/m');

  const seed = await resolveElayaChatSeed(profile);

  return (
    <ElayaChatScreen
      conversationId={seed.conversationId}
      initialMessages={seed.initialMessages}
      greeting={seed.greeting}
      remainingToday={seed.remainingToday}
    />
  );
}
