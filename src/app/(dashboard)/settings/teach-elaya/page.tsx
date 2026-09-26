// /settings/teach-elaya — the hub with the three doors to teaching Elaya (manager and above;
// each door's page keeps its own gate: Training is manager+, Playbooks admin/founder).
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasManagerPageAccess } from "@/lib/utils/route-access";
import { BackButton } from "@/components/ui/BackButton";
import { TeachElayaHub } from "@/components/settings/TeachElayaHub";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";

export const metadata = { title: "Teach Elaya" };

export default async function TeachElayaPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasManagerPageAccess(profile)) redirect("/settings");
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-4">
          <BackButton href="/settings" label="Back to Settings" />
          <h1 className="type-page-title m-0">
            Teach Elaya<span className="page-title-dot">.</span>
          </h1>
        </div>
        {TOP_BAR_ENABLED && <PageControls isPrivileged={false} />}
      </div>
      <p style={{ margin: "0 0 var(--space-8) 0", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)", maxWidth: 720 }}>
        Three ways to make Elaya better without a deploy: what she can show customers, how she answers the team, and how well she does.
      </p>
      <TeachElayaHub />
    </main>
  );
}
