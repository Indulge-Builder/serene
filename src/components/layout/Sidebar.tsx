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
} from "lucide-react";
import { signOutUser } from "@/lib/actions/profiles";
import { ROLE_LABELS } from "@/lib/constants/roles";
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
  { href: "/leads",     label: "Leads",     icon: UserRound       },
  { href: "/deals",     label: "Deals",     icon: Trophy          },
  { href: "/tasks",     label: "Tasks",     icon: CheckSquare     },
  { href: "/whatsapp",  label: "WhatsApp",  icon: MessageCircle   },
];

// Analytics section — Performance for all roles; Campaigns + Budget for manager+
const ANALYTICS_NAV: NavItem[] = [
  { href: "/performance", label: "Performance", icon: BarChart2 },
  { href: "/campaigns", label: "Campaigns", icon: TrendingUp },
  { href: "/budget", label: "Budget", icon: Wallet },
];

// Visible to manager, admin, founder — lead assignment config (+ ad creatives for admin/founder)
function getConfigurationNav(isPrivileged: boolean): NavItem[] {
  const items: NavItem[] = [];
  if (isPrivileged) {
    items.push({
      href: "/admin/ad-creatives",
      label: "Ad Creatives",
      icon: Film,
    });
  }
  items.push({ href: "/settings", label: "Settings", icon: Settings });
  return items;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "User Management", icon: Shield },
];

// Primary nav pages where the floating mobile drawer trigger renders.
// Detail pages (/leads/[id], /tasks/[id], …) are excluded — their
// BackButton occupies the same top-left corner and is the affordance there.
const MOBILE_TRIGGER_PATHS = new Set<string>([
  ...MAIN_NAV.map((i) => i.href),
  ...ANALYTICS_NAV.map((i) => i.href),
  "/admin/ad-creatives",
  "/settings",
  "/admin/users",
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
      // Layout props live in .eia-nav-link (globals.css) so the md icon-rail
      // media query can centre the icon — inline styles would win otherwise.
      className="eia-nav-link"
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
      <span className="eia-sidebar-rail-hide" style={{ flex: 1 }}>{label}</span>

      {isActive && (
        <motion.span
          className="eia-sidebar-rail-hide eia-nav-chevron"
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
        className="label-micro eia-sidebar-section-label"
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
  notificationsPromise: Promise<Notification[]>;
};

export function Sidebar({ profile, notificationsPromise }: SidebarProps) {
  const pathname = usePathname();
  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const isManager = profile.role === "manager" || isPrivileged;
  const isOnProfile = pathname === "/profile";

  // Mobile drawer (< md). On md+ the CSS ignores data-open entirely —
  // the aside is a static rail/full sidebar (globals.css .eia-sidebar).
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
          clears it). Canvas-coloured bubble backdrop (.eia-mobile-trigger).
          Primary nav pages only — detail pages use their BackButton. ── */}
      {MOBILE_TRIGGER_PATHS.has(pathname) && (
        <div className="eia-mobile-topbar">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="eia-mobile-trigger eia-touch eia-pressable"
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
            className="eia-sidebar-backdrop"
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
      className="eia-sidebar"
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
        className="eia-sidebar-logo"
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
          className="eia-sidebar-logo-link"
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
            className="eia-sidebar-logo-img"
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
          className="eia-sidebar-rail-hide"
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
              (item) => (isManager || item.href === "/performance") && canAccessRoute(profile, item.href),
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
        <div
          aria-hidden="true"
          style={{
            height: "1px",
            background: "var(--theme-sidebar-border)",
            margin: "0 var(--space-2) var(--space-4)",
          }}
        />

        <div className="eia-sidebar-footer-row">
          {/* Notification bell — seed streams in without blocking the shell.
              Hidden on the md icon rail (avatar only there). */}
          <span className="eia-sidebar-rail-hide">
            <Suspense fallback={<BellFallback />}>
              <SeededNotificationBell
                userId={profile.id}
                promise={notificationsPromise}
              />
            </Suspense>
          </span>

          {/* User info — links to profile settings. Layout props live in
              .eia-sidebar-profile so the rail can shrink it to the avatar. */}
          <Link
            href="/profile"
            className="eia-sidebar-profile"
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
            <div className="eia-sidebar-rail-hide" style={{ flex: 1, minWidth: 0 }}>
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
            className="eia-sidebar-signout"
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
