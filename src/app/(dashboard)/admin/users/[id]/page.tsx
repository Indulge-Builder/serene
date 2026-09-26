import { notFound, redirect } from "next/navigation";
import { getCurrentProfile, getProfileById } from "@/lib/services/profiles-service";
import { hasManagerPageAccess } from "@/lib/utils/route-access";
import { getAgentRoutingConfig } from "@/lib/services/agent-routing-service";
import { getQueendoms } from "@/lib/services/members-service";
import { SIA_ROLES, isSiaRole } from "@/lib/constants/sia-roles";
import { EditProfileForm } from "@/components/admin/EditProfileForm";
import { EditAuthorizationForm } from "@/components/admin/EditAuthorizationForm";
import { UserStatusControls } from "@/components/admin/UserStatusControls";
import { Avatar } from "@/components/ui/Avatar";
import { SectionCard } from "@/components/ui/SectionCard";
import { StaffWhatsAppCard } from "@/components/admin/StaffWhatsAppCard";
import { getStaffWhatsAppLinks } from "@/lib/services/sia-staff-link";
import { listUserMemoryForPage } from "@/lib/services/elaya-memory-service";
import { ElayaMemoryCard } from "@/components/profile/ElayaMemoryCard";
import { BackButton } from "@/components/ui/BackButton";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { DOMAIN_LABELS } from "@/lib/constants/domains";

export const metadata = { title: "Team member" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function UserDetailPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // Back returns to the Team view the teammate was opened from (its filters ride in
  // ?from=, already decoded by Next), and only ever to the Team page.
  const backHref = typeof sp.from === "string" && sp.from.startsWith("/admin/users") ? sp.from : "/admin/users";

  const [caller, user] = await Promise.all([
    getCurrentProfile(),
    getProfileById(id),
  ]);

  if (!caller || !hasManagerPageAccess(caller)) {
    redirect("/dashboard");
  }

  if (!user) notFound();

  const isPrivileged     = ["admin", "founder"].includes(caller.role);
  const canToggleRouting = ["manager", "admin", "founder"].includes(caller.role);

  const [waLinks, elayaMemory] = await Promise.all([getStaffWhatsAppLinks(user.id), listUserMemoryForPage(user.id)]);
  const [routingConfig, queendoms] = await Promise.all([
    user.role === "agent" && canToggleRouting ? getAgentRoutingConfig(user.id) : Promise.resolve(null),
    isPrivileged ? getQueendoms() : Promise.resolve([]),
  ]);
  const seat = isSiaRole(user.sia_role) ? SIA_ROLES.labels[user.sia_role] : null;
  const queendomName = queendoms.find((q) => q.id === user.queendom_id)?.name ?? null;

  return (
    <main
      className="flex-1 p-4 sm:p-6 lg:p-8"
      style={{ paddingBottom: "var(--space-16)", maxWidth: "1280px" }}
    >
      {/* Page header — back button + Playfair title */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-4)",
          marginBottom: "var(--space-8)",
        }}
      >
        <BackButton href={backHref} label="Back to Team" />

        <h1 className="type-page-title" style={{ margin: 0 }}>
          {user.full_name}<span className="page-title-dot">.</span>
        </h1>
      </div>

      {/* Two-column wide layout — forms left, identity right; single column below lg */}
      <div
        className="serene-dossier-grid serene-dossier-grid--340"
        style={{ alignItems: "start" }}
      >
        {/* Left column — editable forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <SectionCard
            title="Profile Details"
            description="Name, contact info, and username."
          >
            <EditProfileForm user={user} />
          </SectionCard>

          {isPrivileged && (
            <SectionCard
              title="Authorization"
              description="Domain, role and Concierge seat. Changes are audited."
            >
              <EditAuthorizationForm user={user} queendoms={queendoms} />
            </SectionCard>
          )}

          <StaffWhatsAppCard profileId={user.id} phone={user.phone} links={waLinks} canLink={isPrivileged} />

          {isPrivileged && (
            <SectionCard
              title="What Elaya has learned about them"
              description="Her living memory of how this person wants things. It grows from their chats with her; every answer to them goes through it first."
            >
              <ElayaMemoryCard entries={elayaMemory} userId={user.id} own={caller.id === user.id} />
            </SectionCard>
          )}
        </div>

        {/* Right column — identity sidebar, sticky on scroll */}
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
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                textAlign:     "center",
                gap:           "var(--space-3)",
                padding:       "var(--space-6)",
              }}
            >
              <Avatar src={user.avatar_url} name={user.full_name} size="xl" />

              <div style={{ minWidth: 0, width: "100%" }}>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-base)",
                    fontWeight: "var(--weight-semibold)",
                    color:      "var(--theme-text-primary)",
                    margin:     0,
                    lineHeight: "var(--leading-tight)",
                    overflow:   "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user.full_name}
                </p>
                <p
                  style={{
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-sm)",
                    color:        "var(--theme-text-secondary)",
                    margin:       "2px 0 0",
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}
                >
                  {user.email}
                </p>
                {user.job_title && (
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize:   "var(--text-xs)",
                      color:      "var(--theme-text-tertiary)",
                      margin:     "var(--space-1) 0 0",
                    }}
                  >
                    {user.job_title}
                  </p>
                )}
              </div>

              <div
                style={{
                  display:        "flex",
                  gap:            "var(--space-2)",
                  flexWrap:       "wrap",
                  justifyContent: "center",
                  marginTop:      "var(--space-1)",
                }}
              >
                <span className="status-pill status-pill--neutral">{ROLE_LABELS[user.role]}</span>
                <span className="status-pill status-pill--neutral">{DOMAIN_LABELS[user.domain]}</span>
                {seat && (
                  <span className="status-pill status-pill--accent">{seat}{queendomName ? ` · ${queendomName}` : ""}</span>
                )}
              </div>
            </div>

            {/* Status toggles */}
            <div style={{ borderTop: "1px solid var(--theme-paper-border)" }}>
              <UserStatusControls
                user={user}
                routingConfig={routingConfig}
                isPrivileged={isPrivileged}
                canToggleRouting={canToggleRouting}
              />
            </div>
          </SectionCard>
        </aside>
      </div>
    </main>
  );
}
