// /settings/desks — Elaya on the office tables (0248; desks plan Layers E and F): the switch and
// quiet hours, the announcement box, the speakers and TVs on the allow-list, and the ledger of
// everything that was said.
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { listDeskDevices, listDeskOutbox } from "@/lib/services/desks-service";
import { getDesksSettings } from "@/lib/services/llm-providers-service";
import { getQueendoms } from "@/lib/services/members-service";
import { getAssignableUsers } from "@/lib/services/profiles-service";
import { isDeskSenderConfigured } from "@/lib/services/desk-sender";
import { BackButton } from "@/components/ui/BackButton";
import { DesksSettingsPanel } from "@/components/settings/DesksSettingsPanel";

export const metadata = { title: "Desks settings" };

export default async function DesksSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/settings");
  const [settings, devices, ledger, queendoms, accounts] = await Promise.all([
    getDesksSettings(), listDeskDevices(), listDeskOutbox({ limit: 40 }), getQueendoms(), getAssignableUsers({ domain: "concierge" }),
  ]);
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <BackButton href="/settings" label="Back to Settings" />
        <h1 className="type-page-title m-0">Desks<span className="page-title-dot">.</span></h1>
      </div>
      <DesksSettingsPanel
        initial={settings}
        devices={devices}
        ledger={ledger}
        queendoms={queendoms.map((q) => ({ id: q.id, name: q.name }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.full_name }))}
        senderConfigured={isDeskSenderConfigured()}
      />
    </main>
  );
}
