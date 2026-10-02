// /settings/elaya-chats — every person's chats with Elaya, on every channel (2026-09-29; a door on
// Teach Elaya). Admin and founder only: these are the team's private conversations, so the gate is
// the two top roles by name, not the elevated-page helper (which also admits the tech workbench).
// The Sia / WhatsApp layout: the people in the rail, one person's history in the pane, and "Correct"
// on any reply files it in the Requests queue.
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { listElayaChatPeople } from "@/lib/services/elaya-chats-service";
import { BackButton } from "@/components/ui/BackButton";
import { ElayaChatsWorkspace } from "@/components/settings/ElayaChatsWorkspace";
import { ELAYA_CHATS_PERSON_PARAM, TEACH_ELAYA_PATH } from "@/lib/constants/elaya";

export const metadata = { title: "Elaya chats" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ElayaChatsPage({ searchParams }: PageProps) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && profile.role !== "founder") redirect("/settings");

  const [people, params] = await Promise.all([listElayaChatPeople(), searchParams]);
  // A deep link opens its person only when they are in the list (never trust the raw param).
  const asked = params[ELAYA_CHATS_PERSON_PARAM];
  const initialUserId = typeof asked === "string" && people.some((p) => p.userId === asked) ? asked : null;

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-3 shrink-0">
        <BackButton href={TEACH_ELAYA_PATH} label="Back to Teach Elaya" />
        <h1 className="type-page-title m-0">
          Elaya Chats<span className="page-title-dot">.</span>
        </h1>
      </div>
      <p className="shrink-0" style={{ margin: "0 0 var(--space-6) 0", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)", maxWidth: 720 }}>
        Everything the team has said to Elaya and everything she said back, on WhatsApp, in the app and on calls. When a reply is wrong, correct it: it goes to Requests, and she reads it on the next message.
      </p>
      <ElayaChatsWorkspace people={people} initialUserId={initialUserId} />
    </main>
  );
}
