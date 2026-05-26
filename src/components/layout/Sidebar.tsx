"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutDashboard, Shield, UserRound } from "lucide-react";

type NavItem = {
  href:  string;
  label: string;
  icon:  React.ElementType;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads",     label: "Leads",     icon: UserRound },
];

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
        position:      "relative",
        display:       "flex",
        alignItems:    "center",
        gap:           "var(--space-3)",
        padding:       "var(--space-2) var(--space-3)",
        borderRadius:  "var(--radius-sm)",
        marginBottom:  "var(--space-px)",
        color:         isActive
          ? "var(--theme-sidebar-active)"
          : "var(--theme-sidebar-text)",
        background:    isActive
          ? "var(--theme-sidebar-active-bg)"
          : "transparent",
        fontFamily:    "var(--font-sans)",
        fontSize:      "var(--text-sm)",
        fontWeight:    isActive
          ? "var(--weight-semibold)"
          : "var(--weight-normal)",
        textDecoration: "none",
        transition:    "var(--transition-hover)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background =
            "var(--theme-sidebar-hover-bg)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
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
      <Icon
        style={{
          width:       "15px",
          height:      "15px",
          strokeWidth: 1.5,
          flexShrink:  0,
        }}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width:         "220px",
        minHeight:     "100vh",
        background:    "var(--theme-sidebar-bg)",
        borderRight:   "1px solid var(--theme-sidebar-border)",
        boxShadow:     "var(--shadow-sidebar)",
        display:       "flex",
        flexDirection: "column",
        position:      "sticky",
        top:           0,
        zIndex:        "var(--z-sidebar)",
      }}
    >
      {/* Logo / wordmark */}
      <div
        style={{
          padding:      "var(--space-6) var(--space-5)",
          borderBottom: "1px solid var(--theme-sidebar-border)",
        }}
      >
        <span
          style={{
            fontFamily:    "var(--font-serif)",
            fontSize:      "var(--text-xl)",
            fontWeight:    "var(--weight-semibold)",
            color:         "var(--theme-sidebar-active)",
            letterSpacing: "var(--tracking-tight)",
          }}
        >
          Eia
        </span>
        <span
          style={{
            display:       "block",
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-medium)",
            color:         "var(--theme-sidebar-text)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            marginTop:     "var(--space-px)",
          }}
        >
          Indulge OS
        </span>
      </div>

      {/* Nav */}
      <nav
        className="sidebar-scrollable"
        style={{
          flex:    1,
          padding: "var(--space-3) var(--space-3)",
        }}
      >
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              isActive={isActive}
            />
          );
        })}

        {/* Section divider */}
        <div
          style={{
            margin:    "var(--space-4) var(--space-3) var(--space-2)",
            borderTop: "1px solid var(--theme-sidebar-border)",
          }}
        />
        <span
          className="label-micro"
          style={{
            padding:      "0 var(--space-3)",
            display:      "block",
            marginBottom: "var(--space-2)",
          }}
        >
          Admin
        </span>

        {/* Admin nav item — inline since it has its own active check */}
        {(() => {
          const isActive = pathname.startsWith("/admin");
          return (
            <Link
              href="/admin/users"
              style={{
                position:      "relative",
                display:       "flex",
                alignItems:    "center",
                gap:           "var(--space-3)",
                padding:       "var(--space-2) var(--space-3)",
                borderRadius:  "var(--radius-sm)",
                color:         isActive
                  ? "var(--theme-sidebar-active)"
                  : "var(--theme-sidebar-text)",
                background:    isActive
                  ? "var(--theme-sidebar-active-bg)"
                  : "transparent",
                fontFamily:    "var(--font-sans)",
                fontSize:      "var(--text-sm)",
                fontWeight:    isActive
                  ? "var(--weight-semibold)"
                  : "var(--weight-normal)",
                textDecoration: "none",
                transition:    "var(--transition-hover)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "var(--theme-sidebar-hover-bg)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }
              }}
            >
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
              <Shield style={{ width: "15px", height: "15px", strokeWidth: 1.5, flexShrink: 0 }} />
              User Management
            </Link>
          );
        })()}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding:   "var(--space-4) var(--space-5)",
          borderTop: "1px solid var(--theme-sidebar-border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-2xs)",
            color:      "var(--theme-sidebar-text)",
          }}
        >
          Indulge Global
        </span>
      </div>
    </aside>
  );
}
