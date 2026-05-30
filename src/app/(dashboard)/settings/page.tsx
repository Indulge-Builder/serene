import { redirect }                   from "next/navigation";
import { getCurrentProfile }          from "@/lib/services/profiles-service";
import { getAgentRosterByDomain }     from "@/lib/services/agent-routing-service";
import { AgentSettingsTable }         from "@/components/settings/AgentSettingsTable";

export const metadata = { title: "Settings — Eia" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const rosterDomain = isPrivileged ? "*" : profile.domain;

  const roster = await getAgentRosterByDomain(rosterDomain);

  return (
    <main className="flex-1 p-8">
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
    </main>
  );
}
