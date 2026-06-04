import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login");

  const pathname = (await headers()).get('x-pathname') ?? '/';
  if (!canAccessRoute(profile, pathname)) redirect('/dashboard');

  const initialNotifications = await getNotifications(profile.id);

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
      <Sidebar profile={profile} initialNotifications={initialNotifications} />

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
