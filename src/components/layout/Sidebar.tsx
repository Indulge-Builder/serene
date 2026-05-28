"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserRound,
  Shield,
  ChevronRight,
  Bell,
  LogOut,
} from "lucide-react";
import { signOutUser } from "@/lib/actions/profiles";
import { ROLE_LABELS } from "@/lib/constants/roles";
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
  { href: "/leads",     label: "Leads",     icon: UserRound },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "User Management", icon: Shield },
];

// ─── Helpers ──────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return (
    (parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")
  ).toUpperCase();
}

// ─── NavLink ──────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: NavItem & { isActive: boolean }) {
  return (
    <Link
      href={href}
      style={{
        position:       "relative",
        display:        "flex",
        alignItems:     "center",
        gap:            "var(--space-3)",
        padding:        "10px var(--space-3)",
        borderRadius:   "var(--radius-md)",
        color:          isActive ? "var(--theme-sidebar-active)" : "var(--theme-sidebar-text)",
        background:     isActive ? "var(--theme-sidebar-active-bg)" : "transparent",
        border:         isActive
          ? "1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)"
          : "1px solid transparent",
        fontFamily:     "var(--font-sans)",
        fontSize:       "var(--text-sm)",
        fontWeight:     isActive ? "var(--weight-medium)" : "var(--weight-normal)",
        letterSpacing:  "var(--tracking-wide)",
        textDecoration: "none",
        transition:
          "color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--theme-sidebar-hover-bg)";
          e.currentTarget.style.color      = "var(--theme-canvas-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color      = "var(--theme-sidebar-text)";
        }
      }}
    >
      {/* Active left pill */}
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position:     "absolute",
            left:         0,
            top:          "50%",
            transform:    "translateY(-50%)",
            width:        "3px",
            height:       "16px",
            borderRadius: "0 var(--radius-full) var(--radius-full) 0",
            background:   "var(--theme-sidebar-active-pill)",
          }}
        />
      )}

      <Icon style={{ width: "15px", height: "15px", strokeWidth: 1.5, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>

      {isActive && (
        <ChevronRight
          aria-hidden="true"
          style={{ width: "12px", height: "12px", flexShrink: 0, opacity: 0.5 }}
        />
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
          height:     "1px",
          background: "var(--theme-sidebar-border)",
          margin:     "var(--space-4) var(--space-2) var(--space-3)",
        }}
      />
      <span
        className="label-micro"
        style={{
          padding:      "0 var(--space-3)",
          display:      "block",
          marginBottom: "var(--space-2)",
          color:        "color-mix(in srgb, var(--theme-sidebar-text) 40%, transparent)",
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
  const pathname    = usePathname();
  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const isOnProfile  = pathname === "/profile";

  const initials  = getInitials(profile.full_name);
  const roleLabel = ROLE_LABELS[profile.role];

  return (
    <aside
      style={{
        width:         "240px",
        minHeight:     "100dvh",
        background:    "var(--theme-sidebar-bg)",
        boxShadow:     "var(--shadow-sidebar)",
        display:       "flex",
        flexDirection: "column",
        position:      "sticky",
        top:           0,
        flexShrink:    0,
        zIndex:        "var(--z-sidebar)" as React.CSSProperties["zIndex"],
      }}
    >
      {/* ── Logo block ──────────────────────────────── */}
      <div
        style={{
          padding:       "28px var(--space-5) var(--space-5)",
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
        }}
      >
        <img
          src="/logo-light.avif"
          alt="Eia"
          style={{
            width:       "128px",
            height:      "128px",
            objectFit:   "contain",
            filter: `
              drop-shadow(0 0 8px  color-mix(in srgb, var(--theme-accent) 30%, transparent))
              drop-shadow(0 0 20px color-mix(in srgb, var(--theme-accent) 12%, transparent))
            `,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            marginTop:  "var(--space-4)",
            width:      "100%",
            height:     "1px",
            background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--theme-accent) 22%, transparent) 30%, color-mix(in srgb, var(--theme-accent) 22%, transparent) 70%, transparent)",
          }}
        />
      </div>

      {/* ── Nav scroll area ─────────────────────────── */}
      <nav
        className="sidebar-scrollable"
        style={{
          flex:          1,
          padding:       "var(--space-2) var(--space-3)",
          display:       "flex",
          flexDirection: "column",
          gap:           "2px",
          overflowY:     "auto",
        }}
      >
        {MAIN_NAV.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            isActive={pathname === href || pathname.startsWith(href + "/")}
          />
        ))}

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
            height:     "1px",
            background: "var(--theme-sidebar-border)",
            margin:     "0 var(--space-2) var(--space-4)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {/* Notification bell */}
          <button
            type="button"
            aria-label="Notifications"
            style={{
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              width:           "32px",
              height:          "32px",
              borderRadius:    "var(--radius-md)",
              border:          "none",
              background:      "transparent",
              color:           "var(--theme-sidebar-text)",
              cursor:          "pointer",
              flexShrink:      0,
              transition:      "background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--theme-sidebar-hover-bg)";
              e.currentTarget.style.color      = "var(--theme-canvas-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color      = "var(--theme-sidebar-text)";
            }}
          >
            <Bell style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
          </button>

          {/* User info — links to profile settings */}
          <Link
            href="/profile"
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            "var(--space-2)",
              flex:           1,
              minWidth:       0,
              textDecoration: "none",
              borderRadius:   "var(--radius-md)",
              padding:        "var(--space-1)",
              margin:         "calc(-1 * var(--space-1))",
              background:     isOnProfile ? "var(--theme-sidebar-active-bg)" : "transparent",
              border:         isOnProfile ? "1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)" : "1px solid transparent",
              transition:     "background var(--duration-fast) var(--ease-in-out)",
            }}
            onMouseEnter={(e) => {
              if (!isOnProfile) e.currentTarget.style.background = "var(--theme-sidebar-hover-bg)";
            }}
            onMouseLeave={(e) => {
              if (!isOnProfile) e.currentTarget.style.background = "transparent";
            }}
          >
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                style={{
                  width:        "32px",
                  height:       "32px",
                  borderRadius: "var(--radius-sm)",
                  objectFit:    "cover",
                  flexShrink:   0,
                  border:       "1px solid color-mix(in srgb, var(--theme-canvas-text) 10%, transparent)",
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width:          "32px",
                  height:         "32px",
                  borderRadius:   "var(--radius-sm)",
                  background:     "var(--theme-accent-surface)",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                  fontFamily:     "var(--font-sans)",
                  fontSize:       "var(--text-xs)",
                  fontWeight:     "var(--weight-semibold)",
                  color:          isOnProfile ? "var(--theme-sidebar-active)" : "var(--theme-sidebar-active)",
                  border:         "1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)",
                }}
              >
                {initials}
              </div>
            )}

            {/* Name + role */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontFamily:    "var(--font-sans)",
                  fontSize:      "var(--text-sm)",
                  fontWeight:    "var(--weight-medium)",
                  color:         isOnProfile ? "var(--theme-sidebar-active)" : "var(--theme-canvas-text)",
                  margin:        0,
                  overflow:      "hidden",
                  textOverflow:  "ellipsis",
                  whiteSpace:    "nowrap",
                }}
              >
                {profile.full_name}
              </p>
              <p
                style={{
                  fontFamily:    "var(--font-sans)",
                  fontSize:      "var(--text-2xs)",
                  fontWeight:    "var(--weight-normal)",
                  color:         "color-mix(in srgb, var(--theme-sidebar-text) 55%, transparent)",
                  margin:        0,
                  marginTop:     "2px",
                  letterSpacing: "var(--tracking-wide)",
                  overflow:      "hidden",
                  textOverflow:  "ellipsis",
                  whiteSpace:    "nowrap",
                }}
              >
                {roleLabel}
              </p>
            </div>
          </Link>

          {/* Sign-out */}
          <button
            type="button"
            aria-label="Sign out"
            onClick={async () => { await signOutUser(); }}
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              width:          "28px",
              height:         "28px",
              borderRadius:   "var(--radius-md)",
              border:         "none",
              background:     "transparent",
              color:          "color-mix(in srgb, var(--theme-sidebar-text) 50%, transparent)",
              cursor:         "pointer",
              flexShrink:     0,
              transition:     "background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out), transform var(--duration-base) var(--ease-spring)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--theme-sidebar-hover-bg)";
              e.currentTarget.style.color      = "var(--theme-canvas-text)";
              e.currentTarget.style.transform  = "rotate(5deg) scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color      = "color-mix(in srgb, var(--theme-sidebar-text) 50%, transparent)";
              e.currentTarget.style.transform  = "rotate(0deg) scale(1)";
            }}
          >
            <LogOut style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
          </button>
        </div>
      </div>
    </aside>
  );
}
