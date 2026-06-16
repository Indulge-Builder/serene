import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getSuggestionsForInbox } from "@/lib/services/suggestions-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { SuggestionInboxClient } from "@/components/suggestions/SuggestionInboxClient";

/**
 * /admin/suggestions — the suggestion / bug-report triage inbox. Admin/founder only.
 *
 * Staff submit reports (message + screenshots) via the "Send feedback" composer
 * (Sidebar / Elaya card). They land here for triage — mark open reports resolved,
 * which notifies the original sender. Screenshots are private-bucket signed URLs
 * minted server-side at read time. RSC seed — the page is role-gated, the service
 * runs on the admin client; the client component is display + thin resolve state.
 */
export default async function AdminSuggestionsPage() {
  const profile = await getCurrentProfile();

  if (!profile || !["admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const suggestions = await getSuggestionsForInbox();

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Suggestions<span className="page-title-dot">.</span>
        </h1>

        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={false}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <SuggestionInboxClient initialSuggestions={suggestions} />
    </main>
  );
}
