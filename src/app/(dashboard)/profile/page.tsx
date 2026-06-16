import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getMyNotificationPrefs } from "@/lib/services/notification-prefs-service";
import { signOutUser } from "@/lib/actions/profiles";
import { ProfileAvatarSection } from "@/components/profile/ProfileAvatarSection";
import { ProfileDetailsForm }   from "@/components/profile/ProfileDetailsForm";
import { ThemeSelector }         from "@/components/profile/ThemeSelector";
import { IconSelector }           from "@/components/profile/IconSelector";
import { InstallPrompt }          from "@/components/profile/InstallPrompt";
import { PasswordChangeForm }    from "@/components/profile/PasswordChangeForm";
import { PushNotificationSettings } from "@/components/profile/PushNotificationSettings";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { formatDate } from "@/lib/utils/dates";

export const metadata = { title: "Profile — Serene" };

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Seed the per-user notification matrix (migration 0133) — owner-scoped read.
  const notificationPrefs = await getMyNotificationPrefs();

  const memberSince = formatDate(profile.created_at, "MMM yyyy");

  return (
    <main
      className="flex-1 p-4 sm:p-6 lg:p-8"
      style={{ paddingBottom: "var(--space-16)", maxWidth: "1280px" }}
    >
      {/* ── Page header ──────────────────────────────── */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        {/* m-0 as a class (not inline style) — the mobile-trigger title
            indent in globals.css must be able to override the margin. */}
        <h1 className="type-page-title m-0">
          Profile<span className="page-title-dot">.</span>
        </h1>
      </div>

      {/* ── Wide two-column layout — single column below lg ── */}
      <div
        className="serene-dossier-grid serene-dossier-grid--340"
        style={{ alignItems: "start" }}
      >
        {/* Left column — editable sections.
            order-2 below lg pushes it under the identity card on mobile;
            lg:order-none restores source order so the grid columns line up. */}
        <div
          className="order-2 lg:order-0"
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}
        >
          <ProfileDetailsForm profile={profile} />

          <SectionCard
            title="Appearance"
            description="Choose the visual theme for your workspace."
          >
            <ThemeSelector currentTheme={profile.theme} profileId={profile.id} />

            {/* Home-screen icon picker — separated by a full-width rule
                (the labelled-datum-group convention). */}
            <div
              style={{
                marginTop:  "var(--space-5)",
                paddingTop: "var(--space-5)",
                borderTop:  "1px solid var(--theme-paper-border)",
              }}
            >
              <IconSelector currentIcon={profile.app_icon} profileId={profile.id} />
            </div>
          </SectionCard>

          <SectionCard
            title="Add to Home Screen"
            description="Install Serene as an app. It uses the icon you picked above."
          >
            <InstallPrompt profileId={profile.id} currentIcon={profile.app_icon} />
          </SectionCard>

          <SectionCard
            title="Notifications"
            description="Choose which alerts reach you, and on which channels."
          >
            <NotificationPreferences role={profile.role} initialPrefs={notificationPrefs} />

            {/* Web Push device subscription — separated by a full-width rule
                (the labelled-datum-group convention). */}
            <div
              style={{
                marginTop:  "var(--space-5)",
                paddingTop: "var(--space-5)",
                borderTop:  "1px solid var(--theme-paper-border)",
              }}
            >
              <PushNotificationSettings />
            </div>
          </SectionCard>

          <PasswordChangeForm />
        </div>

        {/* Right column — identity sidebar, sticky.
            order-1 below lg lifts it above the editable sections on mobile;
            lg:order-0 restores source order (right column) on desktop. */}
        <aside
          className="order-1 lg:order-0"
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
