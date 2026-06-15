import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentProfile, getAllProfiles } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { UsersTable } from "@/components/admin/UsersTable";

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();

  if (!profile || !["admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const users = await getAllProfiles();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Team<span className="page-title-dot">.</span>
        </h1>

        <div className="flex items-center gap-3">
        <Link
          href="/admin/users/new"
          className="serene-pressable serene-icon-rotate-hover"
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            "var(--space-2)",
            padding:        "0 var(--space-4)",
            height:         36,
            background:     "var(--theme-accent)",
            color:          "var(--theme-accent-fg)",
            borderRadius:   "var(--radius-sm)",
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-sm)",
            fontWeight:     "var(--weight-semibold)",
            textDecoration: "none",
            flexShrink:     0,
          }}
        >
          <Plus style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
          Add Member
        </Link>
          {TOP_BAR_ENABLED && (
            <PageControls
              userId={profile.id}
              isPrivileged={false}
              notificationsPromise={getNotifications(profile.id)}
            />
          )}
        </div>
      </div>

      <UsersTable users={users} />
    </main>
  );
}
