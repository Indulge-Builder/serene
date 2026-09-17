"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, m as motion, useReducedMotion } from "framer-motion";
import { BASE_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import {
  LayoutDashboard,
  UserRound,
  Shield,
  LogOut,
  BarChart2,
  TrendingUp,
  Trophy,
  CheckSquare,
  Settings,
  MessageCircle,
  Film,
  Wallet,
  BookOpen,
  Landmark,
  AlertTriangle,
  Sparkles,
  Activity,
  MessageSquarePlus,
  Telescope,
  GraduationCap,
  NotebookPen,
  Building2,
  Receipt,
  MessagesSquare,
  Ticket,
  ClipboardList,
  Users,
} from "lucide-react";
import { signOutUser } from "@/lib/actions/profiles";
import { useSuggestionFeedback } from "@/components/suggestions/SuggestionFeedbackProvider";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { hasElevatedPageAccess, hasManagerPageAccess, isNavVisible } from "@/lib/utils/route-access";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import { lockBodyScroll } from "@/lib/utils/scroll";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { Profile } from "@/lib/types/database";

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
  { href: "/members",   label: "Members",   icon: Users           },
  { href: "/tickets",   label: "Tickets",   icon: ClipboardList   },
  { href: "/leads",     label: "Leads",     icon: UserRound       },
  { href: "/deals",     label: "Deals",     icon: Trophy          },
  { href: "/tasks",     label: "Tasks",     icon: CheckSquare     },
  { href: "/vendors",   label: "Vendors",   icon: Building2       },
  { href: "/subscriptions", label: "Subscriptions", icon: Receipt },
  { href: "/whatsapp",  label: "WhatsApp",  icon: MessageCircle   },
  { href: "/helpdesk",  label: "Helpdesk",  icon: BookOpen        },
  { href: "/notes",     label: "Notes",     icon: NotebookPen     },
];

// Analytics section — Performance + Escalations for all roles (agents get a
// self-scoped Escalations view); Oversight + Campaigns for manager+ (the shared
// isManager gate below; Escalations stays Gia-domain-only via canAccessRoute). Budget is
// manager+ — it rides the same isManager gate and, since /budget is now in the
// Gia-domain DOMAIN_ROUTE_MAP, a Gia-domain manager passes canAccessRoute (a
// non-Gia manager still doesn't). A manager sees only their own domain's SPEND
// (server-pinned); admin/founder bypass the map and see all domains + recharges.
// Oversight sits directly below Performance and is manager+ only (it rides the
// isManager gate, unlike Performance which is the all-roles special-case below).
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
  { href: "/sia", label: "Sia", icon: MessagesSquare },
  { href: "/freshdesk", label: "Freshdesk", icon: Ticket },
  { href: "/books", label: "Books", icon: Landmark },
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
  "/sia",
  "/freshdesk",
  "/books",
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
  // Hover feedback is the ICON colour fill (accent) — no background wash
  // (removed 2026-07-03); tracked as state so the icon tile can react.
  const [hovered, setHovered] = useState(false);
  // md icon rail (md..lg) hides labels — the charcoal Tooltip (right side)
  // carries them there; full sidebar / mobile drawer show the label inline,
  // so the pill is disabled (never tooltip a visible label).
  const tabletDown = useMediaQuery(MQ.tabletDown);
  const mobile = useMediaQuery(MQ.mobile);
  const isRail = tabletDown && !mobile;
  return (
    <Tooltip label={label} side="right" wrap="block" disabled={!isRail}>
    <Link
      href={href}
      // Layout props live in .serene-nav-link (globals.css) so the md icon-rail
      // media query can centre the icon — inline styles would win otherwise.
      className="serene-nav-link"
      // Active nav item stays CLEAN (2026-07-03): no background wash, no
      // border/shadow chip, no left pill — the accent icon tile below is the
      // one active indicator. Label just firms up (active colour + medium).
      style={{
        color: isActive
          ? "var(--theme-sidebar-active)"
          : "var(--theme-sidebar-text)",
        background: "transparent",
        border: "1px solid transparent",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: isActive ? "var(--weight-medium)" : "var(--weight-normal)",
        letterSpacing: "var(--tracking-wide)",
        transition:
          "color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out), transform var(--duration-base) var(--ease-spring)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          setHovered(true);
          // design-dna §6.3 — nav item hover nudge, x: 2
          if (!reduceMotion) e.currentTarget.style.transform = "translateX(2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          setHovered(false);
          e.currentTarget.style.transform = "translateX(0)";
        }
      }}
    >
      {/* Icon tile — THE active indicator: the current page's icon sits on a
          small accent-gradient tile; inactive icons stay bare. (The left
          travelling pill + active background wash were removed 2026-07-03.)
          Hover on an inactive item fills the ICON with the theme accent —
          no row background (removed 2026-07-03). */}
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "26px",
          height: "26px",
          borderRadius: "9px",
          flexShrink: 0,
          margin: "-4px 0",
          background: isActive ? "var(--neu-accent-gradient)" : "transparent",
          boxShadow: isActive ? "var(--neu-shadow-knob)" : "none",
          // Hover fill uses the DEEP accent (the pastel --theme-accent is too
          // faint on the cream rail) + a heavier stroke — bold and unmissable.
          color: isActive
            ? "var(--theme-accent-fg)"
            : hovered
              ? "var(--neu-accent-deep)"
              : "inherit",
          transition:
            "background var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)",
        }}
      >
        <Icon
          style={{
            width: "15px",
            height: "15px",
            strokeWidth: hovered && !isActive ? 2.2 : 1.5,
            flexShrink: 0,
            transition: "stroke-width var(--duration-fast) var(--ease-in-out)",
          }}
        />
      </span>
      {/* Hidden on the md icon rail — the title attr carries the label there */}
      <span className="serene-sidebar-rail-hide" style={{ flex: 1 }}>{label}</span>
    </Link>
    </Tooltip>
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

// ─── Sidebar ──────────────────────────────────────────────

type SidebarProps = {
  profile: Profile;
};

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const { openComposer } = useSuggestionFeedback();
  // Page-access flags (route-access.ts): admin/founder — plus every member of a
  // workbench domain (tech, 2026-09-16) while the team builds the platform.
  const isPrivileged = hasElevatedPageAccess(profile);
  const isManager = hasManagerPageAccess(profile);
  // What each section LISTS. isNavVisible = canAccessRoute (reachability) + the
  // founder's curated FOUNDER_NAV_PREFIXES (visibility). A section with nothing
  // left to list is not rendered at all — no orphan header.
  const mainNav = MAIN_NAV.filter((item) => isNavVisible(profile, item.href));
  const analyticsNav =
    profile.role === "guest"
      ? []
      : ANALYTICS_NAV.filter(
          // Performance + Escalations are all-roles (agents get a self-scoped
          // view); isNavVisible still keeps Escalations Gia-domain-only.
          (item) =>
            (isManager || item.href === "/performance" || item.href === "/escalations") &&
            isNavVisible(profile, item.href),
        );
  const configurationNav = isManager
    ? getConfigurationNav(isPrivileged).filter((item) => isNavVisible(profile, item.href))
    : [];
  const adminNav = isPrivileged ? ADMIN_NAV.filter((item) => isNavVisible(profile, item.href)) : [];
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
      // Cream raised rail (neumorphic Sidebar specimen): the dark shell
      // retires — the rail floats on the canvas with the paired shadow +
      // hairline edge. Height/margin/radius live in .serene-sidebar
      // (globals.css) so the mobile drawer + md icon-rail modes can differ.
      style={{
        background: "var(--theme-sidebar-bg)",
        border: "1px solid var(--neu-edge)",
        boxShadow: "var(--neu-shadow-raised)",
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
            // Dark-ink logo variant — the light-on-dark logo washes out on the
            // cream rail (same asset the mobile trigger bubble uses).
            src="/logo.webp"
            alt=""
            aria-hidden="true"
            className="serene-sidebar-logo-img"
            style={{
              objectFit: "contain",
              filter:
                "drop-shadow(0 0 12px color-mix(in srgb, var(--theme-accent) 18%, transparent))",
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
        {mainNav.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            isActive={pathname === href || pathname.startsWith(href + "/")}
          />
        ))}

        {analyticsNav.length > 0 && (
          <>
            <NavSection label="Analytics" />
            {analyticsNav.map(({ href, label, icon }) => (
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

        {configurationNav.length > 0 && (
          <>
            <NavSection label="Configuration" />
            {configurationNav.map(({ href, label, icon }) => (
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

        {adminNav.length > 0 && (
          <>
            <NavSection label="Admin" />
            {adminNav.map(({ href, label, icon }) => (
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
            // No hover background (2026-07-03) — the icon takes the deep accent fill.
            e.currentTarget.style.color = "var(--neu-accent-deep)";
          }}
          onMouseLeave={(e) => {
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
          {/* Notification bell — reads inbox state from <NotificationsProvider>
              (mounted once in the dashboard layout) via context; no seed prop.
              Hidden on the md icon rail (avatar only there).
              TOP_BAR_ENABLED relocates the bell to PageControls: the footer mount
              is removed entirely (not CSS-hidden) so exactly one NotificationBell
              is rendered (the bell state itself lives in the provider regardless). */}
          {!TOP_BAR_ENABLED && (
            <span className="serene-sidebar-rail-hide">
              <NotificationBell variant="sidebar" />
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
            // No hover background (2026-07-03) — the sidebar hover vocabulary
            // is icon accent fill only; the avatar row keeps just the cursor.
          >
            {/* Avatar */}
            <Avatar
              src={profile.avatar_url}
              name={profile.full_name}
              alt={profile.full_name}
              size="sm"
              style={{
                borderRadius: "var(--radius-sm)",
                border:
                  "1px solid color-mix(in srgb, var(--theme-canvas-text) 10%, transparent)",
              }}
            />

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
              // No hover background (2026-07-03) — deep-accent icon fill only.
              e.currentTarget.style.color = "var(--neu-accent-deep)";
              e.currentTarget.style.transform = "rotate(5deg) scale(1.05)";
            }}
            onMouseLeave={(e) => {
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
