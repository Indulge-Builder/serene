import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentProfile, getProfileById } from "@/lib/services/profiles-service";
import { getAgentRoutingConfig } from "@/lib/services/agent-routing-service";
import { TopBar } from "@/components/layout/TopBar";
import { EditProfileForm } from "@/components/admin/EditProfileForm";
import { EditAuthorizationForm } from "@/components/admin/EditAuthorizationForm";
import { UserStatusControls } from "@/components/admin/UserStatusControls";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { DOMAIN_LABELS } from "@/lib/constants/domains";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params;

  const [caller, user] = await Promise.all([
    getCurrentProfile(),
    getProfileById(id),
  ]);

  if (!caller || !["admin", "founder", "manager"].includes(caller.role)) {
    redirect("/dashboard");
  }

  if (!user) notFound();

  const isPrivileged = ["admin", "founder"].includes(caller.role);
  const canToggleRouting = ["manager", "admin", "founder"].includes(caller.role);

  // Fetch routing config only if user is an agent
  const routingConfig = user.role === "agent" && canToggleRouting
    ? await getAgentRoutingConfig(user.id)
    : null;

  return (
    <>
      <TopBar profile={caller} title={user.full_name} />
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
            display:       "flex",
            flexDirection: "column",
            gap:           "var(--space-6)",
            maxWidth:      "640px",
          }}
        >
          {/* Identity card */}
          <div
            style={{
              background:   "var(--theme-paper)",
              borderRadius: "var(--radius-lg)",
              boxShadow:    "var(--shadow-paper)",
              overflow:     "hidden",
            }}
          >
            <div
              style={{
                padding:      "var(--space-6) var(--space-8)",
                borderBottom: "1px solid var(--theme-paper-border)",
                display:      "flex",
                alignItems:   "center",
                gap:          "var(--space-4)",
              }}
            >
              <div
                style={{
                  width:          "48px",
                  height:         "48px",
                  borderRadius:   "var(--radius-full)",
                  background:     "var(--theme-accent-surface)",
                  border:         "1px solid var(--theme-paper-border)",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       "var(--text-lg)",
                  fontWeight:     "var(--weight-semibold)",
                  color:          "var(--theme-accent)",
                  flexShrink:     0,
                }}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
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
                  {user.full_name}
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-sm)",
                    color:      "var(--theme-text-secondary)",
                    margin:     "2px 0 0",
                  }}
                >
                  {user.email}
                  {user.job_title && (
                    <span style={{ color: "var(--theme-text-tertiary)" }}>
                      {" "}· {user.job_title}
                    </span>
                  )}
                </p>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
                <span
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    padding:      "2px var(--space-3)",
                    borderRadius: "var(--radius-full)",
                    fontSize:     "var(--text-xs)",
                    fontWeight:   "var(--weight-semibold)",
                    background:   "var(--theme-paper-subtle)",
                    color:        "var(--theme-text-secondary)",
                    border:       "1px solid var(--theme-paper-border)",
                  }}
                >
                  {ROLE_LABELS[user.role]}
                </span>
                <span
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    padding:      "2px var(--space-3)",
                    borderRadius: "var(--radius-full)",
                    fontSize:     "var(--text-xs)",
                    fontWeight:   "var(--weight-medium)",
                    background:   "var(--theme-paper-subtle)",
                    color:        "var(--theme-text-tertiary)",
                    border:       "1px solid var(--theme-paper-border)",
                  }}
                >
                  {DOMAIN_LABELS[user.domain]}
                </span>
              </div>
            </div>

            {/* Status controls — is_active + routing toggle */}
            <UserStatusControls
              user={user}
              routingConfig={routingConfig}
              isPrivileged={isPrivileged}
              canToggleRouting={canToggleRouting}
            />
          </div>

          {/* Edit profile fields */}
          <div
            style={{
              background:   "var(--theme-paper)",
              borderRadius: "var(--radius-lg)",
              boxShadow:    "var(--shadow-paper)",
              overflow:     "hidden",
            }}
          >
            <div
              style={{
                padding:      "var(--space-5) var(--space-8)",
                borderBottom: "1px solid var(--theme-paper-border)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-base)",
                  fontWeight: "var(--weight-semibold)",
                  color:      "var(--theme-text-primary)",
                  margin:     0,
                }}
              >
                Profile Details
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-sm)",
                  color:      "var(--theme-text-secondary)",
                  margin:     "var(--space-1) 0 0",
                }}
              >
                Name, contact info, and preferences.
              </p>
            </div>
            <EditProfileForm user={user} />
          </div>

          {/* Authorization — admin/founder only */}
          {isPrivileged && (
            <div
              style={{
                background:   "var(--theme-paper)",
                borderRadius: "var(--radius-lg)",
                boxShadow:    "var(--shadow-paper)",
                overflow:     "hidden",
              }}
            >
              <div
                style={{
                  padding:      "var(--space-5) var(--space-8)",
                  borderBottom: "1px solid var(--theme-paper-border)",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-base)",
                    fontWeight: "var(--weight-semibold)",
                    color:      "var(--theme-text-primary)",
                    margin:     0,
                  }}
                >
                  Authorization
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-sm)",
                    color:      "var(--theme-text-secondary)",
                    margin:     "var(--space-1) 0 0",
                  }}
                >
                  Role and domain assignment. Changes are audited.
                </p>
              </div>
              <EditAuthorizationForm user={user} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
