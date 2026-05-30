import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { NewUserClient } from "@/components/admin/NewUserClient";
import { BackButton } from "@/components/ui/BackButton";

export default async function NewUserPage() {
  const profile = await getCurrentProfile();

  if (!profile || !["admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return (
    <main
      style={{
        flex:          1,
        padding:       "var(--space-8)",
        paddingBottom: "var(--space-16)",
        maxWidth:      "1280px",
      }}
    >
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-4)",
          marginBottom: "var(--space-8)",
        }}
      >
        <BackButton href="/admin/users" label="Back to Team" />

        <h1 className="type-page-title" style={{ margin: 0 }}>
          New Member<span className="page-title-dot">.</span>
        </h1>
      </div>

      <NewUserClient />
    </main>
  );
}
