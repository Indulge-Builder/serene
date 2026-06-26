"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, m as motion, useReducedMotion } from "framer-motion";
import { SPRING_CONFIG, BASE_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import {
  LayoutDashboard,
  UserRound,
  Shield,
  ChevronRight,
  LogOut,
  BarChart2,
  TrendingUp,
  Trophy,
  CheckSquare,
  Settings,
  MessageCircle,
  Film,
  Bell,
  Wallet,
  BookOpen,
  AlertTriangle,
  Sparkles,
  Activity,
  MessageSquarePlus,
  Telescope,
  GraduationCap,
  NotebookPen,
} from "lucide-react";
import { signOutUser } from "@/lib/actions/profiles";
import { useSuggestionFeedback } from "@/components/suggestions/SuggestionFeedbackProvider";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { canAccessRoute } from "@/lib/utils/route-access";
import { getInitials } from "@/lib/utils/strings";
import { lockBodyScroll } from "@/lib/utils/scroll";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { Profile, Notification } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

// ─── Nav configuration ────────────────────────────────────

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/elaya",     label: "Elaya",     icon: Sparkles        },
  { href: "/leads",     label: "Leads",     icon: UserRound       },
  { href: "/deals",     label: "Deals",     icon: Trophy          },
  { href: "/tasks",     label: "Tasks",     icon: CheckSquare     },
  { href: "/whatsapp",  label: "WhatsApp",  icon: MessageCircle   },
  { href: "/helpdesk",  label: "Helpdesk",  icon: BookOpen        },
  { href: "/notes",     label: "Notes",     icon: NotebookPen     },
];

// Analytics section — Performance + Escalations for all roles (agents get a
// self-scoped Escalations view); Oversight + Campaigns for manager+ (the shared
// isManager gate below; Escalations stays Gia-domain-only via canAccessRoute). Budget is
// admin/founder ONLY — it rides the same isManager gate but is gated down to
// admin/founder by canAccessRoute (it's absent from DOMAIN_ROUTE_MAP, and only
// admin/founder bypass that map). Oversight sits directly below Performance and
// is manager+ only (it rides the isManager gate, unlike Performance which is the
// all-roles special-case in the filter below).
const ANALYTICS_NAV: NavItem[] = [
  { href: "/performance", label: "Performance", icon: BarChart2 },
  { href: "/oversight", label: "Oversight", icon: Telescope },
  { href: "/campaigns", label: "Campaigns", icon: TrendingUp },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/escalations", label: "Escalations", icon: AlertTriangle },
];

// Visible to manager, admin, founder — lead assignment config (+ ad creatives for
// admin/founder). Elaya Training is manager+ (managers curate their domain's library);
// it's added unconditionally here and self-gates through the canAccessRoute filter at
// the render site — Gia-domain managers + admin/founder pass, others are filtered out.
function getConfigurationNav(isPrivileged: boolean): NavItem[] {
  const items: NavItem[] = [];
  if (isPrivileged) {
    items.push({
      href: "/admin/ad-creatives",
      label: "Ad Creatives",
      icon: Film,
    });
  }
  items.push({ href: "/admin/elaya-training", label: "Elaya Training", icon: GraduationCap });
  items.push({ href: "/settings", label: "Settings", icon: Settings });
  return items;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "User Management", icon: Shield },
  { href: "/admin/usage", label: "Usage", icon: Activity },
  { href: "/admin/suggestions", label: "Suggestions", icon: MessageSquarePlus },
];

// Primary nav pages where the floating mobile drawer trigger renders.
// Detail pages (/leads/[id], /tasks/[id], …) are excluded — their
// BackButton occupies the same top-left corner and is the affordance there.
const MOBILE_TRIGGER_PATHS = new Set<string>([
  ...MAIN_NAV.map((i) => i.href),
  ...ANALYTICS_NAV.map((i) => i.href),
  "/admin/ad-creatives",
  "/admin/elaya-training",
  "/settings",
  "/admin/users",
  "/admin/usage",
  "/admin/suggestions",
  "/profile",
]);

// ─── NavLink ──────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: NavItem & { isActive: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <Link
      href={href}
      // Layout props live in .serene-nav-link (globals.css) so the md icon-rail
      // media query can centre the icon — inline styles would win otherwise.
      className="serene-nav-link"
      title={label}
      style={{
        color: isActive
          ? "var(--theme-sidebar-active)"
          : "var(--theme-sidebar-text)",
        background: isActive ? "var(--theme-sidebar-active-bg)" : "transparent",
        border: isActive
          ? "1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)"
          : "1px solid transparent",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: isActive ? "var(--weight-medium)" : "var(--weight-normal)",
        letterSpacing: "var(--tracking-wide)",
        transition:
          "color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out), transform var(--duration-base) var(--ease-spring)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--theme-sidebar-hover-bg)";
          e.currentTarget.style.color = "var(--theme-canvas-text)";
          // design-dna §6.3 — nav item hover nudge, x: 2
          if (!reduceMotion) e.currentTarget.style.transform = "translateX(2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--theme-sidebar-text)";
          e.currentTarget.style.transform = "translateX(0)";
        }
      }}
    >
      {/* Active left pill — design-dna §5.99 #01: it does not toggle, it travels.
          top is offset-positioned (not translateY) so Framer owns transform. */}
      {isActive && (
        <motion.span
          layoutId="sidebar-active-pill"
          aria-hidden="true"
          transition={reduceMotion ? { duration: 0 } : SPRING_CONFIG}
          style={{
            position: "absolute",
            left: 0,
            top: "calc(50% - 8px)",
            width: "3px",
            height: "16px",
            borderRadius: "0 var(--radius-full) var(--radius-full) 0",
            background: "var(--theme-sidebar-active-pill)",
          }}
        />
      )}

      <Icon
        style={{
          width: "15px",
          height: "15px",
          strokeWidth: 1.5,
          flexShrink: 0,
        }}
      />
      {/* Hidden on the md icon rail — the title attr carries the label there */}
      <span className="serene-sidebar-rail-hide" style={{ flex: 1 }}>{label}</span>

      {isActive && (
        <motion.span
          className="serene-sidebar-rail-hide serene-nav-chevron"
          aria-hidden="true"
          initial={reduceMotion ? false : { opacity: 0, x: -4 }}
          animate={{ opacity: 0.5, x: 0 }}
          transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
        >
          <ChevronRight style={{ width: "12px", height: "12px" }} />
        </motion.span>
      )}
    </Link>
  );
}

// ─── Section hairline + label ─────────────────────────────

function NavSection({ label }: { label: string }) {
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          height: "1px",
          background: "var(--theme-sidebar-border)",
          margin: "var(--space-4) var(--space-2) var(--space-3)",
        }}
      />
      <span
        className="label-micro serene-sidebar-section-label"
        style={{
          padding: "0 var(--space-3)",
          marginBottom: "var(--space-2)",
          color:
            "color-mix(in srgb, var(--theme-sidebar-text) 40%, transparent)",
        }}
      >
        {label}
      </span>
    </>
  );
}

// ─── Notification bell seed (streamed) ────────────────────

// The layout starts getNotifications() without awaiting and passes the
// promise down — the shell paints immediately and the seed streams into
// this Suspense boundary. getNotifications never rejects (returns [] on
// error), so use() here cannot throw.
function SeededNotificationBell({
  userId,
  promise,
}: {
  userId: string;
  promise: Promise<Notification[]>;
}) {
  const initialData = use(promise);
  return (
    <NotificationBell userId={userId} initialData={initialData} variant="sidebar" />
  );
}

// Static, same-size stand-in while the seed streams — no layout shift.
function BellFallback() {
  return (
    <div
      aria-hidden="true"
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          "32px",
        height:         "32px",
        color:          "var(--theme-sidebar-text)",
        flexShrink:     0,
      }}
    >
      <Bell style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────

type SidebarProps = {
  profile: Profile;
  // Only present (and only consumed) when TOP_BAR_ENABLED is off — the OFF-path
  // footer bell. When on, the bell lives in PageControls and this is undefined.
  notificationsPromise?: Promise<Notification[]>;
};

export function Sidebar({ profile, notificationsPromise }: SidebarProps) {
  const pathname = usePathname();
  const { openComposer } = useSuggestionFeedback();
  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const isManager = profile.role === "manager" || isPrivileged;
  const isOnProfile = pathname === "/profile";

  // Mobile drawer (< md). On md+ the CSS ignores data-open entirely —
  // the aside is a static rail/full sidebar (globals.css .serene-sidebar).
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Navigating closes the drawer (nav links push a new pathname).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // While open: Escape closes, body scroll locked (DNA §9.3).
  useEffect(() => {
    if (!drawerOpen) return;
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const initials = getInitials(profile.full_name);
  const roleLabel = ROLE_LABELS[profile.role];

  return (
    <>
      {/* ── Mobile drawer trigger (< md only) — floats over the paper on
          the page-title line (the .type-page-title indent in globals.css
          clears it). Canvas-coloured bubble backdrop (.serene-mobile-trigger).
          Primary nav pages only — detail pages use their BackButton. ── */}
      {MOBILE_TRIGGER_PATHS.has(pathname) && (
        <div className="serene-mobile-topbar">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="serene-mobile-trigger serene-touch serene-pressable"
            onClick={() => setDrawerOpen(true)}
          >
            <img
              src="/logo.webp"
              alt=""
              aria-hidden="true"
              style={{ width: "34px", height: "34px", objectFit: "contain" }}
            />
          </button>
        </div>
      )}

      {/* ── Drawer backdrop — sanctioned blur surface (V-06) ── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="serene-sidebar-backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

    <aside
      className="serene-sidebar"
      data-open={drawerOpen ? "true" : "false"}
      style={{
        height: "100dvh",
        background: "var(--theme-sidebar-bg)",
        boxShadow: "var(--shadow-sidebar)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        zIndex: "var(--z-sidebar)" as React.CSSProperties["zIndex"],
      }}
    >
      {/* ── Logo block ──────────────────────────────── */}
      <div
        className="serene-sidebar-logo"
        style={{
          padding: "28px var(--space-5) var(--space-5)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className="serene-sidebar-logo-link"
          style={{
            display: "block",
            lineHeight: 0,
            borderRadius: "var(--radius-md)",
            transition: "opacity var(--duration-fast) var(--ease-in-out)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          <img
            src="/logo-light.avif"
            alt=""
            aria-hidden="true"
            className="serene-sidebar-logo-img"
            style={{
              objectFit: "contain",
              filter: `
                drop-shadow(0 0 8px  color-mix(in srgb, var(--theme-accent) 30%, transparent))
                drop-shadow(0 0 20px color-mix(in srgb, var(--theme-accent) 12%, transparent))
              `,
            }}
          />
        </Link>
        <div
          className="serene-sidebar-rail-hide"
          aria-hidden="true"
          style={{
            marginTop: "var(--space-4)",
            width: "100%",
            height: "1px",
            background:
              "linear-gradient(to right, transparent, color-mix(in srgb, var(--theme-accent) 22%, transparent) 30%, color-mix(in srgb, var(--theme-accent) 22%, transparent) 70%, transparent)",
          }}
        />
      </div>

      {/* ── Nav scroll area ─────────────────────────── */}
      <nav
        className="sidebar-scrollable"
        style={{
          flex: 1,
          padding: "var(--space-2) var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          overflowY: "auto",
        }}
      >
        {MAIN_NAV.filter((item) => canAccessRoute(profile, item.href)).map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            isActive={pathname === href || pathname.startsWith(href + "/")}
          />
        ))}

        {profile.role !== "guest" && (
          <>
            <NavSection label="Analytics" />
            {ANALYTICS_NAV.filter(
              // Performance + Escalations are all-roles (agents get a self-scoped
              // view); canAccessRoute still keeps Escalations Gia-domain-only.
              (item) =>
                (isManager || item.href === "/performance" || item.href === "/escalations") &&
                canAccessRoute(profile, item.href),
            ).map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                isActive={pathname === href || pathname.startsWith(href + "/")}
              />
            ))}
          </>
        )}

        {isManager && (
          <>
            <NavSection label="Configuration" />
            {getConfigurationNav(isPrivileged).filter((item) => canAccessRoute(profile, item.href)).map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                isActive={pathname === href || pathname.startsWith(href + "/")}
              />
            ))}
          </>
        )}

        {isPrivileged && (
          <>
            <NavSection label="Admin" />
            {ADMIN_NAV.map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                isActive={pathname === href || pathname.startsWith(href + "/")}
              />
            ))}
          </>
        )}
      </nav>

      {/* ── Footer ──────────────────────────────────── */}
      <div style={{ padding: "var(--space-3) var(--space-3) var(--space-5)" }}>
        {/* Send feedback — opens the shared suggestion / bug-report composer
            (all roles). A button, not a nav link: it opens a modal, no route.
            Closes the mobile drawer first so the composer isn't hidden behind it.
            Styled like a nav link; on the md icon rail only the icon shows. */}
        <button
          type="button"
          className="serene-nav-link serene-pressable"
          title="Send feedback"
          onClick={() => {
            setDrawerOpen(false);
            openComposer();
          }}
          style={{
            width: "100%",
            color: "var(--theme-sidebar-text)",
            background: "transparent",
            border: "1px solid transparent",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-normal)",
            letterSpacing: "var(--tracking-wide)",
            cursor: "pointer",
            transition:
              "color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--theme-sidebar-hover-bg)";
            e.currentTarget.style.color = "var(--theme-canvas-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--theme-sidebar-text)";
          }}
        >
          <MessageSquarePlus
            style={{ width: "15px", height: "15px", strokeWidth: 1.5, flexShrink: 0 }}
          />
          <span className="serene-sidebar-rail-hide" style={{ flex: 1, textAlign: "left" }}>
            Send feedback
          </span>
        </button>

        <div
          aria-hidden="true"
          style={{
            height: "1px",
            background: "var(--theme-sidebar-border)",
            margin: "var(--space-3) var(--space-2) var(--space-4)",
          }}
        />

        <div className="serene-sidebar-footer-row">
          {/* Notification bell — seed streams in without blocking the shell.
              Hidden on the md icon rail (avatar only there).
              TOP_BAR_ENABLED relocates the bell to the TopBar: the footer mount
              is removed entirely (not CSS-hidden) so exactly one NotificationBell
              is alive — a second mount would open a duplicate Realtime channel
              (`notifications:${userId}`, no mount suffix) and double the state. */}
          {!TOP_BAR_ENABLED && notificationsPromise && (
            <span className="serene-sidebar-rail-hide">
              <Suspense fallback={<BellFallback />}>
                <SeededNotificationBell
                  userId={profile.id}
                  promise={notificationsPromise}
                />
              </Suspense>
            </span>
          )}

          {/* User info — links to profile settings. Layout props live in
              .serene-sidebar-profile so the rail can shrink it to the avatar. */}
          <Link
            href="/profile"
            className="serene-sidebar-profile"
            style={{
              background: isOnProfile
                ? "var(--theme-sidebar-active-bg)"
                : "transparent",
              border: isOnProfile
                ? "1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)"
                : "1px solid transparent",
              transition: "background var(--duration-fast) var(--ease-in-out)",
            }}
            onMouseEnter={(e) => {
              if (!isOnProfile)
                e.currentTarget.style.background =
                  "var(--theme-sidebar-hover-bg)";
            }}
            onMouseLeave={(e) => {
              if (!isOnProfile)
                e.currentTarget.style.background = "transparent";
            }}
          >
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  objectFit: "cover",
                  flexShrink: 0,
                  border:
                    "1px solid color-mix(in srgb, var(--theme-canvas-text) 10%, transparent)",
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--theme-accent-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--weight-semibold)",
                  color: isOnProfile
                    ? "var(--theme-sidebar-active)"
                    : "var(--theme-sidebar-active)",
                  border:
                    "1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)",
                }}
              >
                {initials}
              </div>
            )}

            {/* Name + role — hidden on the md icon rail */}
            <div className="serene-sidebar-rail-hide" style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--weight-medium)",
                  color: isOnProfile
                    ? "var(--theme-sidebar-active)"
                    : "var(--theme-canvas-text)",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {profile.full_name}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-2xs)",
                  fontWeight: "var(--weight-normal)",
                  color:
                    "color-mix(in srgb, var(--theme-sidebar-text) 55%, transparent)",
                  margin: 0,
                  marginTop: "2px",
                  letterSpacing: "var(--tracking-wide)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {roleLabel}
              </p>
            </div>
          </Link>

          {/* Sign-out — hidden on the md icon rail (use the drawer/full modes) */}
          <button
            type="button"
            aria-label="Sign out"
            className="serene-sidebar-signout"
            onClick={async () => {
              await signOutUser();
            }}
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "transparent",
              color:
                "color-mix(in srgb, var(--theme-sidebar-text) 50%, transparent)",
              cursor: "pointer",
              flexShrink: 0,
              transition:
                "background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out), transform var(--duration-base) var(--ease-spring)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "var(--theme-sidebar-hover-bg)";
              e.currentTarget.style.color = "var(--theme-canvas-text)";
              e.currentTarget.style.transform = "rotate(5deg) scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color =
                "color-mix(in srgb, var(--theme-sidebar-text) 50%, transparent)";
              e.currentTarget.style.transform = "rotate(0deg) scale(1)";
            }}
          >
            <LogOut
              style={{ width: "14px", height: "14px", strokeWidth: 1.5 }}
            />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
