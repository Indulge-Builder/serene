import { redirect }              from "next/navigation";
import { getCurrentProfile }     from "@/lib/services/profiles-service";
import { getAllRevivalPolicies } from "@/lib/services/revival-service";
import { RevivalPoliciesPanel }  from "@/components/settings/RevivalPoliciesPanel";
import { BackButton }            from "@/components/ui/BackButton";
import { EmptyState }            from "@/components/ui/EmptyState";

export const metadata = { title: "Lead Revival — Serene" };

export default async function LeadRevivalPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Revival editor is admin/founder only (RLS mirrors this).
  if (profile.role !== "admin" && profile.role !== "founder") redirect("/settings");

  const revivalPolicies = await getAllRevivalPolicies();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <BackButton href="/settings" label="Back to Settings" />
        <h1 className="type-page-title m-0">
          Lead Revival<span className="page-title-dot">.</span>
        </h1>
      </div>

      {revivalPolicies.length > 0 ? (
        <RevivalPoliciesPanel initialPolicies={revivalPolicies} />
      ) : (
        <EmptyState
          title="No revival policies yet"
          description="Revival policies will appear here once they are seeded."
        />
      )}
    </main>
  );
}
