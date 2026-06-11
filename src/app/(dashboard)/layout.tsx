import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { canAccessRoute } from "@/lib/utils/route-access";
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

  const safeTheme = ["earth", "air", "water", "fire", "cosmos"].includes(profile.theme)
    ? profile.theme
    : "earth";

  return (
    <>
      {/* Sets data-theme on <html> before the browser paints — no flash. */}
      <ThemeInitializer theme={safeTheme} />
    <div
      className="layout-shell flex"
      style={{
        gap:      "var(--space-3)",
        height:   "100dvh",
        overflow: "hidden",
      }}
    >
      <Sidebar profile={profile} notificationsPromise={notificationsPromise} />

      {/* Toast stack — portal-like, sits at root of dashboard shell, outside scroll */}
      <ToastProvider />

      {/* Flat canvas gutter (matches sidebar) — paper fills the padded area */}
      <div
        style={{
          flex:           1,
          minWidth:       0,
          height:         "100dvh",
          display:        "flex",
          flexDirection:  "column",
          padding:        "12px 12px 12px 0",
          background:     "var(--theme-canvas)",
        }}
      >
        <div
          style={{
            flex:           1,
            minHeight:      0,
            display:        "flex",
            flexDirection:  "column",
            background:     "var(--theme-paper)",
            borderRadius:   "var(--radius-xl)",
            boxShadow:      "var(--shadow-paper)",
            overflowY:      "auto",
            overflowX:      "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
    </>
  );
}
