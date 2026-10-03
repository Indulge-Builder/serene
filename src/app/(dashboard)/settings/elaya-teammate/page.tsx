// /settings/elaya-teammate — Elaya's proactive half (migration 0257; admin/founder): what she
// decided deserved a move, who she told (or would have told, in shadow mode), whether they saw it,
// how it ended; and the switch (off / shadow / live per queendom). Shadow is where the founder reads
// her judgement before anything goes out.
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { listInterventionsForPage } from "@/lib/services/elaya-teammate";
import { getTeammateSettings } from "@/lib/services/llm-providers-service";
import { queendomNames } from "@/lib/services/member-occasions";
import { BackButton } from "@/components/ui/BackButton";
import { ElayaTeammatePanel } from "@/components/settings/ElayaTeammatePanel";
import { TEACH_ELAYA_PATH } from "@/lib/constants/elaya";

export const metadata = { title: "Elaya teammate" };

export default async function ElayaTeammatePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasElevatedPageAccess(profile)) redirect("/settings");
  const [rows, settings, names] = await Promise.all([listInterventionsForPage(), getTeammateSettings(), queendomNames()]);
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-3">
        <BackButton href={TEACH_ELAYA_PATH} label="Back to Teach Elaya" />
        <h1 className="type-page-title m-0">
          Elaya Teammate<span className="page-title-dot">.</span>
        </h1>
      </div>
      <p style={{ margin: "0 0 var(--space-8) 0", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)", maxWidth: 720 }}>
        Every five minutes Elaya looks for a last-mile check a ticket still owes, silence after options, a request on no ticket, and the week&apos;s occasions. In shadow mode she writes what she would send and sends nothing; live sends it to the queendoms you name, waits for a reply, and brings it back up the ladder when nobody answers.
      </p>
      <ElayaTeammatePanel rows={rows} mode={settings.mode} liveQueendomIds={settings.queendomIds} queendoms={[...names.entries()].map(([id, name]) => ({ id, name }))} />
    </main>
  );
}
