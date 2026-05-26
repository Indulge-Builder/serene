import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default async function NewUserPage() {
  const profile = await getCurrentProfile();

  if (!profile || !["admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return (
    <>
      <main style={{ flex: 1, padding: "var(--space-8)" }}>
        {/* Back link */}
        <Link
          href="/admin/users"
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            "var(--space-1)",
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-sm)",
            color:          "var(--theme-canvas-text)",
            textDecoration: "none",
            marginBottom:   "var(--space-6)",
            opacity:        0.7,
          }}
        >
          <ChevronLeft style={{ width: "16px", height: "16px", strokeWidth: 1.5 }} />
          Back to Users
        </Link>

        <div
          style={{
            background:   "var(--theme-paper)",
            borderRadius: "var(--radius-lg)",
            boxShadow:    "var(--shadow-paper)",
            maxWidth:     "560px",
            overflow:     "hidden",
          }}
        >
          {/* Form header */}
          <div
            style={{
              padding:      "var(--space-6) var(--space-8)",
              borderBottom: "1px solid var(--theme-paper-border)",
            }}
          >
            <h2
              style={{
                fontFamily:  "var(--font-sans)",
                fontSize:    "var(--text-lg)",
                fontWeight:  "var(--weight-semibold)",
                color:       "var(--theme-text-primary)",
                margin:      0,
              }}
            >
              New Team Member
            </h2>
            <p
              style={{
                fontFamily:  "var(--font-sans)",
                fontSize:    "var(--text-sm)",
                color:       "var(--theme-text-secondary)",
                margin:      "var(--space-1) 0 0",
              }}
            >
              Create with a password or send a magic-link invite.
            </p>
          </div>

          <CreateUserForm />
        </div>
      </main>
    </>
  );
}
