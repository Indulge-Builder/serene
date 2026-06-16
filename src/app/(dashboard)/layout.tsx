import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { canAccessRoute } from "@/lib/utils/route-access";
import { DEFAULT_THEME, isThemeKey } from "@/lib/constants/themes";
import { DEFAULT_ICON, isIconKey } from "@/lib/constants/app-icons";
import { Sidebar } from "@/components/layout/Sidebar";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { ThemeInitializer } from "@/components/layout/ThemeInitializer";
import { IconInitializer } from "@/components/layout/IconInitializer";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ElayaWidget } from "@/components/elaya/ElayaWidget";
import { UsagePresence } from "@/components/layout/UsagePresence";
import { SuggestionFeedbackProvider } from "@/components/suggestions/SuggestionFeedbackProvider";

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

  // The notification bell lives in the page title row (PageControls) when
  // TOP_BAR_ENABLED — each page starts its own un-awaited getNotifications seed
  // there. Only the OFF-path Sidebar footer bell needs the layout-level promise,
  // so we create it ONLY when the flag is off (no wasted query when it's on).
  // Deliberately NOT awaited — it streams into the bell's Suspense boundary.
  const notificationsPromise = TOP_BAR_ENABLED
    ? undefined
    : getNotifications(profile.id);

  const safeTheme = isThemeKey(profile.theme) ? profile.theme : DEFAULT_THEME;
  const safeIcon  = isIconKey(profile.app_icon) ? profile.app_icon : DEFAULT_ICON;

  return (
    <>
      {/* The root layout already SSRs data-theme from the serene-theme cookie;
          this corrects a missing/stale cookie against the DB truth and
          re-writes it for the next request. */}
      <ThemeInitializer theme={safeTheme} />
      {/* Same corrective sync for the app-icon cookie → next-request manifest link. */}
      <IconInitializer icon={safeIcon} />
    {/* Responsive frame (.serene-shell* in globals.css — audit D-3): row with
        gutter+paper on md+, column with mobile top strip + full-bleed paper
        below md. The Sidebar renders its own three modes (full/rail/drawer).
        The SuggestionFeedbackProvider wraps the whole shell so the Sidebar
        "Send feedback" button AND the mobile Elaya-card trigger share one
        composer instance (mounted once inside the provider). */}
    <SuggestionFeedbackProvider userId={profile.id}>
    <div className="layout-shell serene-shell">
      <Sidebar profile={profile} notificationsPromise={notificationsPromise} />

      {/* Toast stack — portal-like, sits at root of dashboard shell, outside scroll */}
      <ToastProvider />

      {/* Floating Elaya presence — bottom-right circular button → modal with the
          SAME ElayaChatShell as /elaya (it portals to document.body and hides
          itself on /elaya, so it's safe to mount once for every dashboard route). */}
      <ElayaWidget />

      {/* Active-time heartbeat (adoption tracking) — renders nothing; beats
          every 60s ONLY while the tab is visible AND recently interacted with.
          Mounted once here so it covers every authenticated page. */}
      <UsagePresence />

      {/* Flat canvas gutter (matches sidebar) — paper fills the padded area.
          The global controls (domain selector + notification bell) live in each
          page's title row via <PageControls> (TOP_BAR_ENABLED) — no separate
          bar; they read as part of the page. */}
      <div className="serene-shell-gutter">
        <div className="serene-shell-paper">
          {children}
        </div>
      </div>
    </div>
    </SuggestionFeedbackProvider>
    </>
  );
}
