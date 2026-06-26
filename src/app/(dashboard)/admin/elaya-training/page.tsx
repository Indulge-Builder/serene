import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getAllTrainingAssets } from "@/lib/services/elaya-training-service";
import { ElayaTrainingManager } from "@/components/admin/ElayaTrainingManager";

// /admin/elaya-training — manager / admin / founder (the locked write decision; managers
// curate their domain's library). Agents bounce here (the server-side role gate IS the
// authorization boundary; route reachability for Gia-domain managers is granted in
// DOMAIN_ROUTE_MAP). Data read goes through the service (Rule 03). The <h1> + page-title
// dot + filter bar live inside <ElayaTrainingManager> (primary nav page → gets the dot).
export default async function ElayaTrainingPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!["manager", "admin", "founder"].includes(profile.role)) redirect("/dashboard");

  const assets = await getAllTrainingAssets();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <ElayaTrainingManager initialAssets={assets} />
    </main>
  );
}
