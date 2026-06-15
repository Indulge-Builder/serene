import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getNotifications } from '@/lib/services/notifications-service';
import { resolveElayaChatSeed } from '@/lib/services/elaya-service';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
import { ElayaChatShell } from '@/components/elaya/ElayaChatShell';

// /elaya — Elaya's chat surface (all roles; '/elaya' is in ALWAYS_ALLOWED_PREFIXES).
// Server Component: resolves the conversation + transcript + greeting + budget via
// the shared resolveElayaChatSeed (the SAME seed the floating widget's server action
// uses — never re-inline that seeding here). Streaming happens client-side against
// POST /api/elaya/chat.
export default async function ElayaPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const seed = await resolveElayaChatSeed(profile);

  return (
    // flex column + min-h-0 so ElayaChatShell can flex-fill the remaining
    // paper height exactly — no dvh offset math, no bottom gap.
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Elaya<span className="page-title-dot">.</span>
        </h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={false}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <ElayaChatShell
        conversationId={seed.conversationId}
        initialMessages={seed.initialMessages}
        greeting={seed.greeting}
        remainingToday={seed.remainingToday}
      />
    </main>
  );
}
