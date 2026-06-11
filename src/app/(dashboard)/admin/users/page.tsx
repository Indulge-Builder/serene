import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentProfile, getAllProfiles } from "@/lib/services/profiles-service";
import { UsersTable } from "@/components/admin/UsersTable";

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();

  if (!profile || !["admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const users = await getAllProfiles();

  return (
    <main className="flex-1 p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Team<span className="page-title-dot">.</span>
        </h1>

        <Link
          href="/admin/users/new"
          className="eia-pressable eia-icon-rotate-hover"
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
      </div>

      <UsersTable users={users} />
    </main>
  );
}
