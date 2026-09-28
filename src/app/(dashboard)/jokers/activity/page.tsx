import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getClientActivityBoard } from "@/lib/services/client-activity-service";
import { hasJokersAccess } from "@/lib/utils/route-access";
import { JOKERS_PATH } from "@/lib/constants/joker-engagement";
import { BackButton } from "@/components/ui/BackButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityShell } from "@/components/jokers/activity/ActivityShell";
import { ActivitySkeleton } from "./ActivitySkeleton";

export const metadata = { title: "Activity · Jokers" };

// /jokers/activity — how much the client's side is talking in their groups (migration 0250). One
// read (sia.client_activity_board: every linked member group, and the last 90 days the client's
// side was active); the shell filters and counts in the browser. Recounted every 5 minutes.
export default async function JokersActivityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasJokersAccess(profile)) redirect("/dashboard");

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        <BackButton href={JOKERS_PATH} label="Back to Jokers" />
        <h1 className="type-page-title m-0">
          Activity<span className="page-title-dot">.</span>
        </h1>
      </div>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityAsync />
      </Suspense>
    </main>
  );
}

async function ActivityAsync() {
  const board = await getClientActivityBoard();
  if (!board) {
    return <EmptyState framed title="Activity could not be loaded" description="Refresh the page in a moment. If it keeps happening, tell the tech team." />;
  }
  return <ActivityShell board={board} />;
}
