import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { getAllAdCreatives } from "@/lib/services/ad-creatives-service";
import { getCampaignMetrics } from "@/lib/services/leads-service";
import { AdCreativesManager } from "@/components/admin/AdCreativesManager";
import type { CampaignFilters } from "@/lib/types/database";

export const metadata = { title: "Ad creatives" };

const EMPTY_FILTERS: CampaignFilters = {
  domain:    null,
  search:    null,
  date_from: null,
  date_to:   null,
};

export default async function AdCreativesPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/dashboard");

  const [creatives, campaigns] = await Promise.all([
    getAllAdCreatives(),
    getCampaignMetrics(profile.role, profile.domain, EMPTY_FILTERS),
  ]);

  const campaignKeys = Array.from(
    new Set(campaigns.map((c) => c.campaign_name.toLowerCase().trim()).filter(Boolean))
  ).sort();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <AdCreativesManager initialCreatives={creatives} campaignKeys={campaignKeys} />
    </main>
  );
}
