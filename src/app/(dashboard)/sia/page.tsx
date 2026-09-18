import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getQueendomGroupJids, getSiaViewerScope } from "@/lib/services/sia-access";
import { getSiaGroups } from "@/lib/services/sia-service";
import { SiaWorkspace } from "@/components/sia/SiaWorkspace";
import { SIA_GROUP_PARAM } from "@/lib/constants/sia-roles";

// /sia — the Sia group monitor: every watched WhatsApp group + its live message
// stream (migrations 0169–0173, the Baileys watcher's data). Admin/founder, plus a seated
// concierge teammate for their own queendom (2026-09-18, plan decision 6) —
// client conversations are the most sensitive data Indulge holds. The role redirect
// here IS the authorization boundary (/sia is deliberately NOT in
// ALWAYS_ALLOWED_PREFIXES and not in the domain route map — like /admin/*). The
// service read uses the admin client (the sanctioned Q-13 boundary; wag_ RLS is
// deny-by-default). The page header lives inside SiaWorkspace (the TasksShell
// precedent) so the console gear + modal share the client state.
export default async function SiaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Who may be here, and what they may see, is one answer from one place (sia-access.ts):
  // admin/founder everything; a seated concierge teammate only their own queendom's groups,
  // read only; everyone else goes home. The actions apply the same scope per group.
  const scope = await getSiaViewerScope(profile);
  if (!scope) redirect("/dashboard");

  const [allGroups, params, mine] = await Promise.all([
    getSiaGroups(),
    searchParams,
    scope.kind === "queendom" ? getQueendomGroupJids(scope.queendomId) : Promise.resolve(null),
  ]);
  const groups = mine ? allGroups.filter((g) => mine.has(g.group_jid)) : allGroups;

  // Deep link (?group=<jid>, built by siaGroupHref): open that group's chat on arrival. Only a
  // jid that is really in the list is honoured, so a stale or hand-typed value lands on the list.
  const wanted = params[SIA_GROUP_PARAM];
  const wantedJid = typeof wanted === "string" ? wanted : null;
  const initialGroupJid = wantedJid && groups.some((g) => g.group_jid === wantedJid) ? wantedJid : null;

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <SiaWorkspace canManage={scope.kind === "all"} groups={groups} initialGroupJid={initialGroupJid} />
    </main>
  );
}
