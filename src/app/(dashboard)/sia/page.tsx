import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { getSiaGroups } from "@/lib/services/sia-service";
import { SiaWorkspace } from "@/components/sia/SiaWorkspace";
import { SIA_GROUP_PARAM } from "@/lib/constants/sia-roles";

// /sia — the Sia group monitor: every watched WhatsApp group + its live message
// stream (migrations 0169–0173, the Baileys watcher's data). Admin/founder ONLY —
// client conversations are the most sensitive data Indulge holds. The role redirect
// here IS the authorization boundary (/sia is deliberately NOT in
// ALWAYS_ALLOWED_PREFIXES and not in the domain route map — like /admin/*). The
// service read uses the admin client (the sanctioned Q-13 boundary; wag_ RLS is
// deny-by-default). The page header lives inside SiaWorkspace (the TasksShell
// precedent) so the console gear + modal share the client state.
export default async function SiaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/dashboard");

  const [groups, params] = await Promise.all([getSiaGroups(), searchParams]);

  // Deep link (?group=<jid>, built by siaGroupHref): open that group's chat on arrival. Only a
  // jid that is really in the list is honoured, so a stale or hand-typed value lands on the list.
  const wanted = params[SIA_GROUP_PARAM];
  const wantedJid = typeof wanted === "string" ? wanted : null;
  const initialGroupJid = wantedJid && groups.some((g) => g.group_jid === wantedJid) ? wantedJid : null;

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <SiaWorkspace groups={groups} initialGroupJid={initialGroupJid} />
    </main>
  );
}
