// /settings/tickets — the founder edits Sia's ticketing without a deploy (admin/founder):
// the SLA policies the sentinel walks, the status names the team sees, the tag list.

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getQueendoms } from "@/lib/services/clients-service";
import { getTicketSettings, listTicketSlaPolicies } from "@/lib/services/tickets-service";
import { BackButton } from "@/components/ui/BackButton";
import { TicketSlaPoliciesPanel } from "@/components/settings/TicketSlaPoliciesPanel";
import { TicketLabelsPanel } from "@/components/settings/TicketLabelsPanel";

export const metadata = { title: "Ticket settings — Serene" };

export default async function TicketSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && profile.role !== "founder") redirect("/settings");

  const [policies, settings, queendoms] = await Promise.all([listTicketSlaPolicies(), getTicketSettings(), getQueendoms()]);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <BackButton href="/settings" label="Back to Settings" />
        <h1 className="type-page-title m-0">
          Tickets<span className="page-title-dot">.</span>
        </h1>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <TicketSlaPoliciesPanel initialPolicies={policies} queendoms={queendoms} />
        <TicketLabelsPanel statusOverrides={settings.statusOverrides} tags={settings.tags} />
      </div>
    </main>
  );
}
