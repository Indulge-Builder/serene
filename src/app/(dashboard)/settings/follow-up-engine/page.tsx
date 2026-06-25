import { redirect }            from "next/navigation";
import { getCurrentProfile }   from "@/lib/services/profiles-service";
import { getAllSlaPolicies }   from "@/lib/services/sla-service";
import { SlaPoliciesPanel }    from "@/components/settings/SlaPoliciesPanel";
import { BackButton }          from "@/components/ui/BackButton";
import { EmptyState }          from "@/components/ui/EmptyState";

export const metadata = { title: "Follow-up Engine — Serene" };

export default async function FollowUpEnginePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Follow-up engine editor is admin/founder only (RLS mirrors this).
  if (profile.role !== "admin" && profile.role !== "founder") redirect("/settings");

  const slaPolicies = await getAllSlaPolicies();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <BackButton href="/settings" label="Back to Settings" />
        <h1 className="type-page-title m-0">
          Follow-up Engine<span className="page-title-dot">.</span>
        </h1>
      </div>

      {slaPolicies.length > 0 ? (
        <SlaPoliciesPanel initialPolicies={slaPolicies} />
      ) : (
        <EmptyState
          title="No follow-up rules yet"
          description="Follow-up rules will appear here once the engine is seeded."
        />
      )}
    </main>
  );
}
