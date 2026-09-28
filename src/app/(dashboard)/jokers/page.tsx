import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasJokersAccess } from "@/lib/utils/route-access";
import { CondensingPageHeader } from "@/components/layout/CondensingPageHeader";
import { JokersHome } from "@/components/jokers/JokersHome";

export const metadata = { title: "Jokers" };

// /jokers — the Jokers module's home (owner, 2026-09-28): two blocks, Recommendations & Engagement
// and Activity, title only. Access: admin, founder, the tech workbench, the joker and joker_head
// seats (hasJokersAccess).
export default async function JokersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasJokersAccess(profile)) redirect("/dashboard");

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <CondensingPageHeader title="Jokers" />
      <JokersHome />
    </main>
  );
}
