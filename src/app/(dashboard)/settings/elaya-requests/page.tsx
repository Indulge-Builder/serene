// /settings/elaya-requests — what the team told Elaya she got wrong about the system (migration
// 0237; admin/founder). Each request carries the question, her answer, the correction and her own
// guess at the cause; the admin decides fixed / declined / playbook with a note Elaya reads on the
// next message. Open requests are folded into every prompt as known issues until then.
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { listImprovementRequestsForPage } from "@/lib/services/elaya-memory-service";
import { BackButton } from "@/components/ui/BackButton";
import { ElayaRequestsPanel } from "@/components/settings/ElayaRequestsPanel";
import { TEACH_ELAYA_PATH } from "@/lib/constants/elaya";

export const metadata = { title: "Elaya requests" };

export default async function ElayaRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/settings");
  const requests = await listImprovementRequestsForPage();
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-3">
        <BackButton href={TEACH_ELAYA_PATH} label="Back to Teach Elaya" />
        <h1 className="type-page-title m-0">
          Elaya Requests<span className="page-title-dot">.</span>
        </h1>
      </div>
      <p style={{ margin: "0 0 var(--space-8) 0", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)", maxWidth: 720 }}>
        When someone tells Elaya she was wrong about the system, she still answers the corrected question and logs it here. Decide what to build or fix; your note is what she reads next.
      </p>
      <ElayaRequestsPanel requests={requests} />
    </main>
  );
}
