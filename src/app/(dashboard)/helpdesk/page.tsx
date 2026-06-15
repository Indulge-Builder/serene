import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getHelpdeskLibrary } from '@/lib/services/intelligence-service';
import { getNotifications } from '@/lib/services/notifications-service';
import { DEFAULT_GIA_DOMAIN, isGiaDomain } from '@/lib/constants/domains';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
import { HelpdeskSearch } from '@/components/intelligence/HelpdeskSearch';
import { AddSuggestionButton } from '@/components/intelligence/AddSuggestionButton';

// /helpdesk — Call Intelligence Surface B (docs/modules/call-intelligence.md §9).
// Server Component: fetches the FULL library once (Redis 1hr → Supabase) and
// hands it to <HelpdeskSearch> as initialData. All filtering is client-side —
// never add a per-keystroke server search here.
type Props = { searchParams: Promise<Record<string, string>> };

export default async function HelpdeskPage({ searchParams }: Props) {
  const [profile, sp] = await Promise.all([getCurrentProfile(), searchParams]);
  if (!profile) redirect('/login');

  // Library is domain-scoped; non-Gia callers read the default Gia library.
  const domain = isGiaDomain(profile.domain) ? profile.domain : DEFAULT_GIA_DOMAIN;
  const { cases, hooks } = await getHelpdeskLibrary(domain);

  // The write path (upsertServiceCaseAction + service_cases RLS) is admin/founder-
  // only; this drives BOTH the "+ Suggestion" CTA and the in-modal Edit button.
  // Cosmetic only — the server re-checks the role on every save.
  const canEdit = profile.role === 'admin' || profile.role === 'founder';

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Page header — standard list-page contract (title left, CTA right) */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Helpdesk<span className="page-title-dot">.</span>
        </h1>
        <div className="flex items-center gap-3">
          {/* Write path is admin/founder-gated (upsertServiceCaseAction) — hide the CTA for everyone else */}
          {canEdit && <AddSuggestionButton domain={domain} />}
          {TOP_BAR_ENABLED && (
            <PageControls
              userId={profile.id}
              isPrivileged={false}
              notificationsPromise={getNotifications(profile.id)}
            />
          )}
        </div>
      </div>

      <HelpdeskSearch
        initialCases={cases}
        initialHooks={hooks}
        initialCategory={sp.category ?? null}
        canEdit={canEdit}
      />
    </main>
  );
}
