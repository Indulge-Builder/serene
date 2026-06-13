import { redirect }                   from "next/navigation";
import { getCurrentProfile }          from "@/lib/services/profiles-service";
import { getAgentRosterByDomain }     from "@/lib/services/agent-routing-service";
import { getAllSlaPolicies }          from "@/lib/services/sla-service";
import { AgentSettingsTable }         from "@/components/settings/AgentSettingsTable";
import { SlaPoliciesPanel }           from "@/components/settings/SlaPoliciesPanel";

export const metadata = { title: "Settings — Serene" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const rosterDomain = isPrivileged ? "*" : profile.domain;

  // Follow-up engine panel is admin/founder only (0111 RLS mirrors this)
  const [roster, slaPolicies] = await Promise.all([
    getAgentRosterByDomain(rosterDomain),
    isPrivileged ? getAllSlaPolicies() : Promise.resolve([]),
  ]);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Settings<span className="page-title-dot">.</span>
        </h1>
      </div>

      <AgentSettingsTable
        initialRoster={roster}
        callerRole={profile.role}
        callerDomain={profile.domain}
      />

      {isPrivileged && slaPolicies.length > 0 && (
        <div className="mt-6">
          <SlaPoliciesPanel initialPolicies={slaPolicies} />
        </div>
      )}
    </main>
  );

}
