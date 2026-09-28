import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getJokerBoard } from "@/lib/services/joker-board-service";
import { hasJokersAccess } from "@/lib/utils/route-access";
import { JOKERS_PATH } from "@/lib/constants/joker-engagement";
import { BackButton } from "@/components/ui/BackButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { REShell } from "@/components/jokers/re/REShell";
import { ActivitySkeleton } from "../activity/ActivitySkeleton";

export const metadata = { title: "Recommendations & Engagement · Jokers" };

// /jokers/recommendations — what the four jokers sent into the linked member groups and how the
// clients answered (0248/0249; read by sia.joker_board, 0251). One read of the last 90 days; the
// shell filters and counts in the browser. Every joker sees all four jokers (owner, 2026-09-28).
export default async function JokersRecommendationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasJokersAccess(profile)) redirect("/dashboard");

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        <BackButton href={JOKERS_PATH} label="Back to Jokers" />
        <h1 className="type-page-title m-0">
          Recommendations &amp; Engagement<span className="page-title-dot">.</span>
        </h1>
      </div>
      <Suspense fallback={<ActivitySkeleton />}>
        <BoardAsync />
      </Suspense>
    </main>
  );
}

async function BoardAsync() {
  const board = await getJokerBoard();
  if (!board) {
    return <EmptyState framed title="This dashboard could not be loaded" description="Refresh the page in a moment. If it keeps happening, tell the tech team." />;
  }
  return <REShell board={board} />;
}
