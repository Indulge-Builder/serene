import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { canAccessRoute } from "@/lib/utils/route-access";
import { DEFAULT_THEME, isThemeKey } from "@/lib/constants/themes";
import { DEFAULT_APPEARANCE, isAppearanceKey } from "@/lib/constants/appearance";
import { DEFAULT_ICON, isIconKey } from "@/lib/constants/app-icons";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeInitializer } from "@/components/layout/ThemeInitializer";
import { IconInitializer } from "@/components/layout/IconInitializer";
import { AppBootScreen } from "@/components/layout/AppBootScreen";
import { ToastProvider } from "@/components/ui/toast-provider";
import { CommandPaletteProvider } from "@/components/layout/CommandPaletteProvider";
import { ElayaWidget } from "@/components/elaya/ElayaWidget";
import { hasElayaAccess } from "@/lib/utils/route-access";
import { UsagePresence } from "@/components/layout/UsagePresence";
import { SuggestionFeedbackProvider } from "@/components/suggestions/SuggestionFeedbackProvider";
import { NotificationsProvider } from "@/components/layout/NotificationsProvider";

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

  const safeTheme = isThemeKey(profile.theme) ? profile.theme : DEFAULT_THEME;
  const safeAppearance = isAppearanceKey(profile.appearance)
    ? profile.appearance
    : DEFAULT_APPEARANCE;
  const safeIcon  = isIconKey(profile.app_icon) ? profile.app_icon : DEFAULT_ICON;

  return (
    <>
      {/* The root layout already SSRs data-theme + data-neu from the
          serene-theme / serene-appearance cookies; this corrects missing/stale
          cookies against the DB truth and re-writes them for the next request. */}
      <ThemeInitializer theme={safeTheme} appearance={safeAppearance} />
      {/* Same corrective sync for the app-icon cookie → next-request manifest link. */}
      <IconInitializer icon={safeIcon} />
      {/* Boot sequence (logo-motion handoff) — SSRs with the shell, plays once
          per BROWSER SESSION (the first hard load; later reloads skip it via
          sessionStorage, 2026-09-16), then fades itself out. The layout
          persists across client navigations, so soft navs never replay it. */}
      <AppBootScreen />
      {/* Route transitions rely on each route's loading.tsx skeleton — the
          full-page RouteVeil (spinning-mark cover on every nav) was removed
          2026-07-03; never reintroduce a route-change overlay. */}
    {/* Responsive frame (.serene-shell* in globals.css — audit D-3): row with
        gutter+paper on md+, column with mobile top strip + full-bleed paper
        below md. The Sidebar renders its own three modes (full/rail/drawer).
        The SuggestionFeedbackProvider wraps the whole shell so the Sidebar
        "Send feedback" button AND the mobile Elaya-card trigger share one
        composer instance (mounted once inside the provider). */}
    <SuggestionFeedbackProvider userId={profile.id}>
    {/* Notification inbox state (Realtime + chime + optimistic) is owned by ONE
        provider mounted here so the subscription survives navigation. Both the
        title-row bell (PageControls) and the OFF-path Sidebar footer bell read it
        via context — no per-page seed, no per-navigation channel teardown. */}
    <NotificationsProvider userId={profile.id}>
    <div className="layout-shell serene-shell">
      <Sidebar profile={profile} />

      {/* Toast stack — portal-like, sits at root of dashboard shell, outside scroll */}
      <ToastProvider />

      {/* ⌘K command palette — global listener; panel chunk loads on first open */}
      <CommandPaletteProvider
        profile={{ id: profile.id, role: profile.role, domain: profile.domain }}
      />

      {/* Floating Elaya presence — bottom-right circular button → modal with the
          SAME ElayaChatShell as /elaya (it portals to document.body and hides
          itself on /elaya, so it's safe to mount once for every dashboard route). */}
      {hasElayaAccess(profile) && <ElayaWidget />}

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
    </NotificationsProvider>
    </SuggestionFeedbackProvider>
    </>
  );
}
