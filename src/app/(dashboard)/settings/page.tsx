import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getAgentRosterByDomain } from "@/lib/services/agent-routing-service";
import { SettingsShell } from "./SettingsShell";

export const metadata = { title: "Settings — Eia" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const rosterDomain = isPrivileged ? "*" : profile.domain;

  const [roster, params] = await Promise.all([
    getAgentRosterByDomain(rosterDomain),
    searchParams,
  ]);

  const tab = params.tab === "shifts" ? "shifts" : "roster";

  return (
    <div
      style={{
        padding: "var(--space-8) var(--space-8) var(--space-10)",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "var(--space-8)" }}>
        <h1 className="type-page-title">
          Settings<span className="page-title-dot">.</span>
        </h1>
        <p
          style={{
            marginTop: "var(--space-2)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--theme-text-secondary)",
          }}
        >
          Lead assignment configuration for your team.
        </p>
      </div>

      <SettingsShell
        initialTab={tab}
        initialRoster={roster}
        callerRole={profile.role}
        callerDomain={profile.domain}
      />
    </div>
  );
}
