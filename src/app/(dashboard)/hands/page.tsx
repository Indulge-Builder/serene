import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasVendorAccess, hasElevatedPageAccess } from "@/lib/utils/route-access";
import { getSiaViewerScope } from "@/lib/services/sia-access";
import { getHandsConnectorStatus, listAllowedContacts, listHandsThreads } from "@/lib/services/hands-service";
import { getHandsSettings } from "@/lib/services/llm-providers-service";
import { HandsWorkspace } from "@/components/hands/HandsWorkspace";

export const metadata = { title: "Hands" };

// /hands — the line to the outside agent (0245; hands plan Layer E). The vendor audience (admin,
// founder, the concierge floor, the tech workbench for reading) and the Sia viewer scope: a seated
// teammate sees their own queendom's jobs, the Joker head every queendom's, admin and founder all.
// The role redirect here IS the authorization boundary (the reads use the admin client, Q-13).
export default async function HandsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasVendorAccess(profile)) redirect("/dashboard");
  const scope = await getSiaViewerScope(profile);
  if (!scope) redirect("/dashboard");
  const handsScope = { queendomIds: scope.kind === "all" ? null : scope.queendomIds };

  const [threads, contacts, connector, settings, params] = await Promise.all([
    listHandsThreads(handsScope, { status: "open", limit: 200 }),
    listAllowedContacts(),
    getHandsConnectorStatus(),
    getHandsSettings(),
    searchParams,
  ]);
  const wanted = params.thread;
  const initialThreadId = typeof wanted === "string" && threads.some((t) => t.id === wanted) ? wanted : null;
  const senior = profile.role === "admin" || profile.role === "founder" || profile.role === "manager" || profile.sia_role === "bishop" || profile.sia_role === "queen";

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <HandsWorkspace
        initialThreads={threads}
        contacts={contacts}
        connector={connector}
        canConfigure={hasElevatedPageAccess(profile)}
        initialThreadId={initialThreadId}
        perJobCapInr={settings.perJobCapInr}
        viewerCanPayAbove={senior}
      />
    </main>
  );
}
