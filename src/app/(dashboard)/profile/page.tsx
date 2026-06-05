import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { signOutUser } from "@/lib/actions/profiles";
import { ProfileAvatarSection } from "@/components/profile/ProfileAvatarSection";
import { ProfileDetailsForm }   from "@/components/profile/ProfileDetailsForm";
import { ThemeSelector }         from "@/components/profile/ThemeSelector";
import { PasswordChangeForm }    from "@/components/profile/PasswordChangeForm";
import { SectionCard } from "@/components/ui/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { formatDate } from "@/lib/utils/dates";

export const metadata = { title: "Profile Settings — Indulge OS" };

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const memberSince = formatDate(profile.created_at, "MMM yyyy");

  return (
    <main
      style={{
        flex:          1,
        padding:       "var(--space-8)",
        paddingBottom: "var(--space-16)",
        maxWidth:      "1280px",
      }}
    >
      {/* ── Page header ──────────────────────────────── */}
      <div style={{ marginBottom: "var(--space-8)" }}>
        <p
          className="type-eyebrow"
          style={{ marginBottom: "var(--space-2)" }}
        >
          Account
        </p>
        <h1 className="type-page-title" style={{ margin: 0 }}>
          Profile Settings<span className="page-title-dot">.</span>
        </h1>
      </div>

      {/* ── Wide two-column layout ────────────────────── */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap:                 "var(--space-6)",
          alignItems:          "start",
        }}
      >
        {/* Left column — editable sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <SectionCard title="Personal Details">
            <ProfileDetailsForm profile={profile} />
          </SectionCard>

          <SectionCard
            title="Appearance"
            description="Choose the visual theme for your workspace."
          >
            <ThemeSelector currentTheme={profile.theme} profileId={profile.id} />
          </SectionCard>

          <SectionCard title="Security">
            <PasswordChangeForm />
          </SectionCard>
        </div>

        {/* Right column — identity sidebar, sticky */}
        <aside
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "var(--space-5)",
            position:      "sticky",
            top:           "var(--space-6)",
          }}
        >
          <SectionCard title="Identity" bodyPadding={false}>
            {/* Avatar + identity text — upload happens here */}
            <div style={{ padding: "var(--space-6)" }}>
              <div
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                  textAlign:     "center",
                  gap:           "var(--space-4)",
                }}
              >
                <ProfileAvatarSection profile={profile} />
              </div>

              <div
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                  textAlign:     "center",
                  gap:           "var(--space-1)",
                  marginTop:     "var(--space-4)",
                  minWidth:      0,
                  width:         "100%",
                }}
              >
                <p
                  style={{
                    fontFamily:    "var(--font-sans)",
                    fontSize:      "var(--text-base)",
                    fontWeight:    "var(--weight-semibold)",
                    color:         "var(--theme-text-primary)",
                    margin:        0,
                    lineHeight:    "var(--leading-tight)",
                    overflow:      "hidden",
                    textOverflow:  "ellipsis",
                    whiteSpace:    "nowrap",
                    maxWidth:      "100%",
                  }}
                >
                  {profile.full_name}
                </p>
                <p
                  style={{
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-sm)",
                    color:        "var(--theme-text-secondary)",
                    margin:       0,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                    maxWidth:     "100%",
                  }}
                >
                  {profile.email}
                </p>
                {profile.job_title && (
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize:   "var(--text-xs)",
                      color:      "var(--theme-text-tertiary)",
                      margin:     "var(--space-1) 0 0",
                    }}
                  >
                    {profile.job_title}
                  </p>
                )}
              </div>

              <div
                style={{
                  display:        "flex",
                  gap:            "var(--space-2)",
                  flexWrap:       "wrap",
                  justifyContent: "center",
                  marginTop:      "var(--space-4)",
                }}
              >
                <span className="status-pill status-pill--accent">
                  {ROLE_LABELS[profile.role]}
                </span>
                <span className="status-pill status-pill--neutral">
                  {DOMAIN_LABELS[profile.domain]}
                </span>
              </div>
            </div>

            {/* Meta strip — member since */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "var(--space-4) var(--space-6)",
                borderTop:      "1px solid var(--theme-paper-border)",
                background:     "var(--theme-paper-subtle)",
              }}
            >
              <span
                className="label-micro"
                style={{ color: "var(--theme-text-tertiary)" }}
              >
                Member since
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize:   "var(--text-xs)",
                  color:      "var(--theme-text-secondary)",
                }}
              >
                {memberSince}
              </span>
            </div>
          </SectionCard>

          {/* Session — sign out */}
          <SectionCard title="Session" bodyPadding={false}>
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                gap:            "var(--space-4)",
                padding:        "var(--space-5) var(--space-6)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-sm)",
                    fontWeight: "var(--weight-medium)",
                    color:      "var(--theme-text-primary)",
                    margin:     0,
                  }}
                >
                  Sign out
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-text-tertiary)",
                    margin:     "var(--space-1) 0 0",
                  }}
                >
                  End your session on this device.
                </p>
              </div>
              <form action={signOutUser}>
                <Button type="submit" variant="secondary" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </SectionCard>
        </aside>
      </div>
    </main>
  );
}
