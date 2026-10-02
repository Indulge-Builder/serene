import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasManagerPageAccess } from "@/lib/utils/route-access";
import { getAllTrainingAssets } from "@/lib/services/elaya-training-service";
import { ElayaTrainingManager } from "@/components/admin/ElayaTrainingManager";
import { PublicBotPackCard } from "@/components/admin/PublicBotPackCard";
import { BotCorrectionsCard } from "@/components/admin/BotCorrectionsCard";
import { listPackVersions, previewPack } from "@/lib/services/bot-knowledge-service";
import { listOpenBotCorrections } from "@/lib/services/public-bot-handover";
import type { PackOverview } from "@/lib/actions/public-bot";

export const metadata = { title: "Elaya training" };

// /admin/elaya-training — manager / admin / founder (the locked write decision; managers
// curate their domain's library). Agents bounce here (the server-side role gate IS the
// authorization boundary; route reachability for Gia-domain managers is granted in
// DOMAIN_ROUTE_MAP). Data read goes through the service (Rule 03). The <h1> + page-title
// dot + filter bar live inside <ElayaTrainingManager> (primary nav page → gets the dot).
export default async function ElayaTrainingPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!hasManagerPageAccess(profile)) redirect("/dashboard");

  const canApprove = profile.role === "admin" || profile.role === "founder";
  // The pack card's first paint (0252): what is live, what a publish would contain, the leak
  // check. A failed read renders the card empty; it re-reads on "Check again".
  const [assets, overview, corrections] = await Promise.all([
    getAllTrainingAssets(),
    Promise.all([listPackVersions(10), previewPack()])
      .then(([versions, preview]): PackOverview => ({ versions, draft: { itemCount: preview.itemCount, chars: preview.text.length, hits: preview.hits } }))
      .catch(() => null),
    listOpenBotCorrections().catch(() => []),
  ]);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <ElayaTrainingManager
        initialAssets={assets}
        canApprove={canApprove}
        header={
          <>
            <PublicBotPackCard initial={overview} canPublish={canApprove} />
            <BotCorrectionsCard initial={corrections} canResolve={canApprove} />
          </>
        }
      />
    </main>
  );
}
