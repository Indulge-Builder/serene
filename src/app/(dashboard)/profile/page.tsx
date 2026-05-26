import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { signOutUser } from "@/lib/actions/profiles";
import { ProfileAvatarSection } from "@/components/profile/ProfileAvatarSection";
import { ProfileDetailsForm }   from "@/components/profile/ProfileDetailsForm";
import { ThemeSelector }         from "@/components/profile/ThemeSelector";
import { PasswordChangeForm }    from "@/components/profile/PasswordChangeForm";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";

export const metadata = { title: "Profile Settings — Indulge OS" };

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div
      style={{
        padding:    "var(--space-8)",
        maxWidth:   "672px",
        margin:     "0 auto",
        paddingBottom: "var(--space-16)",
      }}
    >
      {/* ── Page header ──────────────────────────────── */}
      <div style={{ marginBottom: "var(--space-8)" }}>
        <p
          className="label-micro"
          style={{ marginBottom: "var(--space-2)", color: "var(--theme-text-tertiary)" }}
        >
          Account
        </p>
        <h1
          style={{
            fontFamily:    "var(--font-serif)",
            fontSize:      "var(--text-2xl)",
            fontWeight:    "var(--weight-light)",
            letterSpacing: "var(--tracking-tighter)",
            lineHeight:    "var(--leading-tight)",
            color:         "var(--theme-text-primary)",
            margin:        0,
          }}
        >
          Profile Settings
        </h1>
      </div>

      {/* ── Sections ─────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

        {/* Identity */}
        <ProfileSection title="Identity">
          <ProfileAvatarSection profile={profile} />
        </ProfileSection>

        {/* Personal Details */}
        <ProfileSection title="Personal Details">
          <ProfileDetailsForm profile={profile} />
        </ProfileSection>

        {/* Appearance */}
        <ProfileSection title="Appearance">
          <ThemeSelector currentTheme={profile.theme} profileId={profile.id} />
        </ProfileSection>

        {/* Security */}
        <ProfileSection title="Security">
          <PasswordChangeForm />
        </ProfileSection>

        {/* Notifications */}
        <ProfileSection title="Notifications">
          <NotificationPreferences />
        </ProfileSection>

        {/* Session */}
        <div
          style={{
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "space-between",
            padding:         "var(--space-5) var(--space-6)",
            background:      "var(--theme-paper)",
            border:          "1px solid var(--theme-paper-border)",
            borderRadius:    "var(--radius-lg)",
            boxShadow:       "var(--shadow-1)",
          }}
        >
          <div>
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
              End your current session on this device.
            </p>
          </div>
          <form action={signOutUser}>
            <button
              type="submit"
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          "var(--space-2)",
                padding:      "var(--space-2) var(--space-4)",
                background:   "transparent",
                color:        "var(--theme-text-secondary)",
                border:       "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-sm)",
                fontFamily:   "var(--font-sans)",
                fontSize:     "var(--text-sm)",
                fontWeight:   "var(--weight-medium)",
                cursor:       "pointer",
                transition:   "var(--transition-hover)",
              }}
            >
              <LogOut style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
              Sign out
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

// ─── ProfileSection card shell ────────────────────────────

function ProfileSection({
  title,
  children,
}: {
  title:    string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background:    "var(--theme-paper)",
        border:        "1px solid var(--theme-paper-border)",
        borderRadius:  "var(--radius-lg)",
        boxShadow:     "var(--shadow-1)",
        overflow:      "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding:      "var(--space-4) var(--space-6)",
          background:   "var(--theme-paper-subtle)",
          borderBottom: "1px solid var(--theme-paper-border)",
        }}
      >
        <h2 className="label-micro" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {/* Card body */}
      <div style={{ padding: "var(--space-6)" }}>
        {children}
      </div>
    </div>
  );
}
