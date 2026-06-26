import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getMyNotes } from "@/lib/services/elaya-notes-service";
import { NotesManager } from "@/components/notes/NotesManager";

// /notes — the per-user Notes section (Elaya Jarvis, Feature 3 / Block 4). All signed-in
// staff: notes are personal, every user has their own (no role gate — only a session
// gate). Data read goes through the service (Rule 03); owner-only RLS scopes it to the
// caller. The <h1> + page-title dot + filter bar live inside <NotesManager> (primary nav
// page → gets the dot). What Elaya does with these notes is CONTEXT, never permission.
export default async function NotesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const notes = await getMyNotes();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <NotesManager initialNotes={notes} />
    </main>
  );
}
