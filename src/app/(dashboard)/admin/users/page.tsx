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
    <>
      <main style={{ flex: 1, padding: "var(--space-8)" }}>
        {/* Page header */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            "var(--space-4)",
            marginBottom:   "var(--space-6)",
          }}
        >
          <h1 className="type-page-title" style={{ margin: 0 }}>
            Team<span className="page-title-dot">.</span>
          </h1>

          <Link
            href="/admin/users/new"
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
              transition:     "var(--transition-interactive)",
              flexShrink:     0,
            }}
          >
            <Plus style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
            Add Member
          </Link>
        </div>

        <div
          style={{
            background:   "var(--theme-paper)",
            borderRadius: "var(--radius-lg)",
            boxShadow:    "var(--shadow-paper)",
            overflow:     "hidden",
          }}
        >
          {/* Card meta row */}
          <div
            style={{
              padding:      "var(--space-4) var(--space-6)",
              borderBottom: "1px solid var(--theme-paper-border)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-sm)",
                color:      "var(--theme-text-secondary)",
                margin:     0,
              }}
            >
              {users.length} {users.length === 1 ? "member" : "members"} total
            </p>
          </div>

          <UsersTable users={users} />
        </div>
      </main>
    </>
  );
}
