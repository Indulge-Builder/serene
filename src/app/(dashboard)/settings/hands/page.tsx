// /settings/hands — the founder configures the line to the outside agent without a deploy
// (0245; hands plan Layer F): the switch, the trust level per category, the caps, the allowlist,
// and (2026-10-01) the editable rulebook + Elaya's guide with their versions.
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { getHandsConnectorStatus, listAllowedContacts } from "@/lib/services/hands-service";
import { getHandsGuides, getHandsSettings } from "@/lib/services/llm-providers-service";
import { listAgentVendors } from "@/lib/services/vendors-service";
import { BackButton } from "@/components/ui/BackButton";
import { HandsSettingsPanel } from "@/components/settings/HandsSettingsPanel";

export const metadata = { title: "Hands settings" };

export default async function HandsSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/settings");
  const [settings, contacts, connector, vendors, guides] = await Promise.all([getHandsSettings(), listAllowedContacts(), getHandsConnectorStatus(), listAgentVendors(), getHandsGuides()]);
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <BackButton href="/settings" label="Back to Settings" />
        <h1 className="type-page-title m-0">Hands<span className="page-title-dot">.</span></h1>
      </div>
      <HandsSettingsPanel initial={settings} contacts={contacts} connector={connector} vendors={vendors} guides={guides} />
    </main>
  );
}
