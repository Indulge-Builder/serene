import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { SearchParams } from "next/dist/server/request/search-params";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import {
  getSubscriptions,
  getSpendingOverview,
} from "@/lib/services/subscriptions-service";
import { AddSubscriptionButton } from "@/components/subscriptions/AddSubscriptionButton";
import { SubscriptionExportButton } from "@/components/subscriptions/SubscriptionExportButton";
import { SubscriptionViewTabs } from "@/components/subscriptions/SubscriptionViewTabs";
import { SubscriptionFilters } from "@/components/subscriptions/SubscriptionFilters";
import { OverviewFilters } from "@/components/subscriptions/OverviewFilters";
import { SubscriptionsTable } from "@/components/subscriptions/SubscriptionsTable";
import { SubscriptionCalendar } from "@/components/subscriptions/SubscriptionCalendar";
import { SpendingOverview } from "@/components/subscriptions/SpendingOverview";
import { Shimmer, skeletonStagger } from "@/components/ui/PageSkeletons";
import type { AppDomain } from "@/lib/types/database";
import type {
  SubscriptionType,
  SubscriptionStatus,
} from "@/lib/constants/subscription-constants";

function getStr(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;
}
function getMulti<T extends string>(v: string | string[] | undefined): T[] {
  const raw = getStr(v);
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean) as T[];
}

type ContentProps = {
  view: string;
  tab: "active" | "archived";
  departments: AppDomain[];
  types: SubscriptionType[];
  statuses: SubscriptionStatus[];
  search: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

async function SubscriptionContent({
  view,
  tab,
  departments,
  types,
  statuses,
  search,
  dateFrom,
  dateTo,
}: ContentProps) {
  if (view === "overview") {
    const data = await getSpendingOverview({
      departments: departments.length ? departments : undefined,
      from: dateFrom,
      to: dateTo,
    });
    return <SpendingOverview data={data} />;
  }
  if (view === "calendar") {
    const subs = await getSubscriptions({ archived: false });
    return <SubscriptionCalendar subscriptions={subs} />;
  }
  const subs = await getSubscriptions({
    archived: tab === "archived",
    departments: departments.length ? departments : undefined,
    types: types.length ? types : undefined,
    statuses: statuses.length ? statuses : undefined,
    search: search ?? undefined,
  });
  return <SubscriptionsTable subscriptions={subs} archived={tab === "archived"} />;
}

function ContentSkeleton() {
  return (
    <div
      style={{
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-1)",
        background: "var(--theme-paper)",
        padding: "var(--space-4)",
      }}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-3) 0",
            borderBottom: i < 7 ? "1px solid var(--theme-paper-border)" : "none",
          }}
        >
          <Shimmer w={160} h={16} delay={skeletonStagger(i)} />
          <Shimmer w={120} h={16} delay={skeletonStagger(i)} />
          <div style={{ flex: 1 }} />
          <Shimmer w={72} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
        </div>
      ))}
    </div>
  );
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const view = getStr(sp.view) ?? "list";
  const tab = getStr(sp.tab) === "archived" ? "archived" : "active";
  const departments = getMulti<AppDomain>(sp.department);
  const types = getMulti<SubscriptionType>(sp.type);
  const statuses = getMulti<SubscriptionStatus>(sp.status);
  const search = getStr(sp.search);
  const dateFrom = getStr(sp.date_from);
  const dateTo = getStr(sp.date_to);

  const contentKey = JSON.stringify({ view, tab, departments, types, statuses, search, dateFrom, dateTo });

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Header — wraps on a phone, so the two actions drop under the title
          instead of running off the edge. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6">
        <h1 className="type-page-title m-0">
          Subscriptions<span className="page-title-dot">.</span>
        </h1>
        <div className="flex items-center gap-3">
          <SubscriptionExportButton />
          <AddSubscriptionButton />
        </div>
      </div>

      {/* One filter strip for every view: the List / Calendar / Overview switcher
          leads it (never a row of its own), then the view's own filters. The
          calendar has no filters, so its strip is the switcher alone. */}
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        {view === "list" ? (
          <SubscriptionFilters leading={<SubscriptionViewTabs />} />
        ) : view === "overview" ? (
          <OverviewFilters leading={<SubscriptionViewTabs />} />
        ) : (
          <SubscriptionViewTabs />
        )}
      </div>

      <Suspense key={contentKey} fallback={<ContentSkeleton />}>
        <SubscriptionContent
          view={view}
          tab={tab}
          dateFrom={dateFrom}
          dateTo={dateTo}
          departments={departments}
          types={types}
          statuses={statuses}
          search={search}
        />
      </Suspense>
    </main>
  );
}
