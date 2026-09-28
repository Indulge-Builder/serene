import { ActivitySkeleton } from "./ActivitySkeleton";

export default function Loading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div style={{ height: "2.5rem", marginBottom: "var(--space-6)" }} />
      <ActivitySkeleton />
    </main>
  );
}
