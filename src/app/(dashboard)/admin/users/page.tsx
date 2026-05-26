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
        <div
          style={{
            background:   "var(--theme-paper)",
            borderRadius: "var(--radius-lg)",
            boxShadow:    "var(--shadow-paper)",
            overflow:     "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "var(--space-6) var(--space-6)",
              borderBottom:   "1px solid var(--theme-paper-border)",
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-lg)",
                  fontWeight: "var(--weight-semibold)",
                  color:      "var(--theme-text-primary)",
                  margin:     0,
                }}
              >
                Team Members
              </h2>
              <p
                style={{
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-sm)",
                  color:       "var(--theme-text-secondary)",
                  margin:      "var(--space-1) 0 0",
                }}
              >
                {users.length} {users.length === 1 ? "member" : "members"} total
              </p>
            </div>

            <Link
              href="/admin/users/new"
              style={{
                display:       "inline-flex",
                alignItems:    "center",
                gap:           "var(--space-2)",
                padding:       "var(--space-2) var(--space-4)",
                background:    "var(--theme-accent)",
                color:         "var(--theme-accent-fg)",
                borderRadius:  "var(--radius-sm)",
                fontFamily:    "var(--font-sans)",
                fontSize:      "var(--text-sm)",
                fontWeight:    "var(--weight-semibold)",
                textDecoration: "none",
                transition:    "var(--transition-interactive)",
              }}
            >
              <Plus style={{ width: "var(--space-4)", height: "var(--space-4)", strokeWidth: 1.5 }} />
              Add Member
            </Link>
          </div>

          <UsersTable users={users} />
        </div>
      </main>
    </>
  );
}
