// /settings/elaya-playbooks — the founder teaches Elaya how a KIND of question is answered
// (migration 0234; admin/founder). Example questions + plain instructions; the router picks the
// matching playbook per turn, so a save is live on the next message. The Try-it box runs a
// question through the real brain and shows what fired.
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { listElayaPlaybooks } from "@/lib/services/elaya-playbooks-service";
import { resolveElayaChatSeed } from "@/lib/services/elaya-service";
import { BackButton } from "@/components/ui/BackButton";
import { ElayaPlaybooksPanel } from "@/components/settings/ElayaPlaybooksPanel";

export const metadata = { title: "Elaya playbooks — Serene" };

export default async function ElayaPlaybooksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/settings");
  const [playbooks, seed] = await Promise.all([listElayaPlaybooks(), resolveElayaChatSeed(profile)]);
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <BackButton href="/settings" label="Back to Settings" />
        <h1 className="type-page-title m-0">
          Elaya Playbooks<span className="page-title-dot">.</span>
        </h1>
      </div>
      <ElayaPlaybooksPanel initialPlaybooks={playbooks} conversationId={seed.conversationId} />
    </main>
  );
}
