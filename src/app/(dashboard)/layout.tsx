import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { canAccessRoute } from "@/lib/utils/route-access";
import { DEFAULT_THEME, isThemeKey } from "@/lib/constants/themes";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeInitializer } from "@/components/layout/ThemeInitializer";
import { ToastProvider } from "@/components/ui/toast-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getCurrentProfile() is cache()-memoised — one auth round trip + one
  // profile SELECT shared across the layout, page, and all Async children.
  // It returns null when there is no session, so no separate getUser() needed.
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login");

  const pathname = (await headers()).get('x-pathname') ?? '/';
  if (!canAccessRoute(profile, pathname)) redirect('/dashboard');

  // Deliberately NOT awaited — the promise streams to the bell's Suspense
  // boundary inside the Sidebar, so the shell + page never block on it.
  const notificationsPromise = getNotifications(profile.id);

  const safeTheme = isThemeKey(profile.theme) ? profile.theme : DEFAULT_THEME;

  return (
    <>
      {/* The root layout already SSRs data-theme from the eia-theme cookie;
          this corrects a missing/stale cookie against the DB truth and
          re-writes it for the next request. */}
      <ThemeInitializer theme={safeTheme} />
    {/* Responsive frame (.eia-shell* in globals.css — audit D-3): row with
        gutter+paper on md+, column with mobile top strip + full-bleed paper
        below md. The Sidebar renders its own three modes (full/rail/drawer). */}
    <div className="layout-shell eia-shell">
      <Sidebar profile={profile} notificationsPromise={notificationsPromise} />

      {/* Toast stack — portal-like, sits at root of dashboard shell, outside scroll */}
      <ToastProvider />

      {/* Flat canvas gutter (matches sidebar) — paper fills the padded area */}
      <div className="eia-shell-gutter">
        <div className="eia-shell-paper">
          {children}
        </div>
      </div>
    </div>
    </>
  );
}
