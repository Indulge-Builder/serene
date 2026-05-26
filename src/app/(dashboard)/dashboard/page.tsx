import { getCurrentProfile } from "@/lib/services/profiles-service";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { ROLE_LABELS } from "@/lib/constants/roles";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  return (
    <>
      <main
        style={{
          flex:    1,
          padding: "var(--space-8) var(--space-8)",
        }}
      >
        <div
          style={{
            background:   "var(--theme-paper)",
            borderRadius: "var(--radius-lg)",
            padding:      "var(--space-8)",
            boxShadow:    "var(--shadow-paper)",
            maxWidth:     "480px",
          }}
        >
          <p
            style={{
              fontFamily:  "var(--font-serif)",
              fontStyle:   "italic",
              fontSize:    "var(--text-xl)",
              color:       "var(--theme-text-primary)",
              marginBottom: "var(--space-4)",
            }}
          >
            Welcome back{profile ? `, ${profile.full_name.split(" ")[0]}` : ""}.
          </p>
          {profile && (
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <span
                style={{
                  fontFamily:   "var(--font-sans)",
                  fontSize:     "var(--text-xs)",
                  fontWeight:   "var(--weight-semibold)",
                  color:        "var(--theme-accent-fg)",
                  background:   "var(--theme-accent)",
                  borderRadius: "var(--radius-full)",
                  padding:      "2px var(--space-3)",
                }}
              >
                {ROLE_LABELS[profile.role]}
              </span>
              <span
                style={{
                  fontFamily:   "var(--font-sans)",
                  fontSize:     "var(--text-xs)",
                  fontWeight:   "var(--weight-medium)",
                  color:        "var(--theme-text-secondary)",
                  background:   "var(--theme-paper-subtle)",
                  border:       "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-full)",
                  padding:      "2px var(--space-3)",
                }}
              >
                {DOMAIN_LABELS[profile.domain]}
              </span>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
