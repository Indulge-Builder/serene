import { redirect }                   from "next/navigation";
import { getCurrentProfile }          from "@/lib/services/profiles-service";
import { hasManagerPageAccess } from "@/lib/utils/route-access";
import { TOP_BAR_ENABLED }            from "@/lib/constants/feature-flags";
import { PageControls }               from "@/components/layout/PageControls";
import { getAgentRosterByDomain }     from "@/lib/services/agent-routing-service";
import { AgentSettingsTable }         from "@/components/settings/AgentSettingsTable";
import { SettingsLinkCard }           from "@/components/settings/SettingsLinkCard";

export const metadata = { title: "Settings — Serene" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasManagerPageAccess(profile)) redirect("/dashboard");

  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const rosterDomain = isPrivileged ? "*" : profile.domain;

  const roster = await getAgentRosterByDomain(rosterDomain);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Settings<span className="page-title-dot">.</span>
        </h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            isPrivileged={false}
          />
        )}
      </div>

      {/* Team shifts & routing pool — the always-present roster (manager+).
          The config link cards (admin/founder only) render via the table's
          beforeList slot — below the filter bar, above the roster — so the
          filter bar stays directly under the page title (list-page contract). */}
      <AgentSettingsTable
        initialRoster={roster}
        callerRole={profile.role}
        callerDomain={profile.domain}
        beforeList={
          isPrivileged ? (
            <div
              style={{
                display:             "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap:                 "var(--space-4)",
                marginBottom:        "var(--space-8)",
              }}
            >
              <SettingsLinkCard
                href="/settings/follow-up-engine"
                icon="timer"
                title="Follow-up Engine"
                description="SLA timers, cadences, and escalation rules that drive Gia's automatic follow-ups."
                index={0}
              />
              <SettingsLinkCard
                href="/settings/tickets"
                icon="ticket"
                title="Tickets"
                description="Sia's SLA targets and escalation ladders, the status names the team sees, and the tag list."
                index={2}
              />
              <SettingsLinkCard
                href="/settings/teach-elaya"
                icon="book"
                title="Teach Elaya"
                description="Three doors: what she can show customers (Training), how she answers the team (Playbooks), and how well she does (Exam)."
              />
              <SettingsLinkCard
                href="/settings/lead-revival"
                icon="sparkles"
                title="Lead Revival"
                description="Silence thresholds and daily caps for the nightly auto-revival sweep."
                index={1}
              />
            </div>
          ) : null
        }
      />
    </main>
  );
}
