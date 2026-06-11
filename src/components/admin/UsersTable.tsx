"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { m as motion } from "framer-motion";
import { Pencil, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { Profile } from "@/lib/types/database";
import { ROLE_LABELS, USER_ROLES } from "@/lib/constants/roles";
import { DOMAIN_LABELS, APP_DOMAINS } from "@/lib/constants/domains";
import { SearchBar } from "@/components/ui/SearchBar";
import { Avatar } from "@/components/ui/Avatar";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";

type UsersTableProps = {
  users: Profile[];
};

export function UsersTable({ users }: UsersTableProps) {
  const [search, setSearch]             = useState("");
  const [roleFilter, setRoleFilter]     = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter   !== "all" && u.role   !== roleFilter)   return false;
      if (domainFilter !== "all" && u.domain !== domainFilter) return false;
      if (q) {
        const haystack = `${u.full_name} ${u.email} ${u.job_title ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, domainFilter]);

  const activeCount =
    (search.trim() ? 1 : 0) +
    (roleFilter !== "all" ? 1 : 0) +
    (domainFilter !== "all" ? 1 : 0);

  const emptyState = (
    <div style={{ padding: "var(--space-20) var(--space-8)", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "var(--text-xl)", color: "var(--theme-text-secondary)", margin: "0 0 var(--space-2)" }}>
        {users.length === 0 ? "No team members yet." : "No members match your filters."}
      </p>
      <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--theme-text-tertiary)", margin: 0 }}>
        {users.length === 0 ? "Add the first member to get started." : "Try adjusting your search or filters."}
      </p>
    </div>
  );

  return (
    <div>
      {/* ── Filter bar ────────────────────────────────────────────── */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-3)",
          padding:      "var(--space-4) var(--space-5)",
          marginBottom: "var(--space-4)",
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-md)",
          boxShadow:    "var(--shadow-1)",
          flexWrap:     "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <SlidersHorizontal
            style={{ width: "1rem", height: "1rem", color: "var(--theme-text-tertiary)", strokeWidth: 1.5 }}
          />
          {activeCount > 0 && (
            <span
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                minWidth:       "1.25rem",
                height:         "1.25rem",
                padding:        "0 0.25rem",
                borderRadius:   "var(--radius-full)",
                background:     "var(--theme-accent)",
                color:          "var(--theme-accent-fg)",
                fontSize:       "10px",
                fontWeight:     "var(--weight-medium)",
                lineHeight:     1,
              }}
            >
              {activeCount}
            </span>
          )}
        </div>

        <div style={{ flex: "1 1 200px", minWidth: "160px" }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name or email…"
            size="sm"
          />
        </div>

        <div style={{ position: "relative" }}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="all">All roles</option>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <ChevronDown style={chevronStyle} />
        </div>

        <div style={{ position: "relative" }}>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="all">All domains</option>
            {APP_DOMAINS.map((d) => (
              <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
            ))}
          </select>
          <ChevronDown style={chevronStyle} />
        </div>

        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            whiteSpace: "nowrap",
            marginLeft: "auto",
          }}
        >
          {filtered.length} {filtered.length === 1 ? "member" : "members"}
        </span>
      </div>

      {/* ── Card list ────────────────────────────────────────────── */}
      {filtered.length === 0 ? emptyState : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {filtered.map((user, i) => (
            <UserCard key={user.id} user={user} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// UserCard — animated card with hover presence
// ─────────────────────────────────────────────

function UserCard({ user, index }: { user: Profile; index: number }) {
  const staggerDelay = Math.min(index * 80, 320);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay:    staggerDelay / 1000,
        ease:     EASE_OUT_EXPO,
      }}
      style={{
        display:      "flex",
        flexWrap:     "wrap",
        alignItems:   "center",
        gap:          "var(--space-3) var(--space-4)",
        padding:      "var(--space-4) var(--space-5)",
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow:    "var(--shadow-1)",
        transition:   "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-2)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-1)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Avatar + name + job title */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "1 1 220px", minWidth: 0 }}>
        <Avatar src={user.avatar_url} name={user.full_name} size="md" />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily:   "var(--font-sans)",
            fontWeight:   "var(--weight-semibold)",
            fontSize:     "var(--text-sm)",
            color:        "var(--theme-text-primary)",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {user.full_name}
          </div>
          {user.job_title && (
            <div style={{
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-xs)",
              color:        "var(--theme-text-tertiary)",
              marginTop:    "1px",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}>
              {user.job_title}
            </div>
          )}
        </div>
      </div>

      {/* Email */}
      <div style={{ flex: "2 1 200px", minWidth: 0 }}>
        <span style={{
          fontFamily:   "var(--font-sans)",
          fontSize:     "var(--text-sm)",
          color:        "var(--theme-text-secondary)",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          display:      "block",
        }}>
          {user.email}
        </span>
      </div>

      {/* Role pill */}
      <div style={{ flex: "0 0 auto" }}>
        <span style={{
          display:      "inline-flex",
          alignItems:   "center",
          padding:      "3px var(--space-3)",
          borderRadius: "var(--radius-full)",
          fontSize:     "var(--text-xs)",
          fontWeight:   "var(--weight-semibold)",
          ...getRolePillStyle(user.role),
        }}>
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      {/* Domain */}
      <div style={{ flex: "0 0 auto", minWidth: "100px" }}>
        <span style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-xs)",
          color:      "var(--theme-text-secondary)",
          whiteSpace: "nowrap",
        }}>
          {DOMAIN_LABELS[user.domain]}
        </span>
      </div>

      {/* Status dot + label */}
      <div style={{ flex: "0 0 80px" }}>
        <span style={{
          display:    "inline-flex",
          alignItems: "center",
          gap:        "var(--space-1)",
          fontSize:   "var(--text-xs)",
          fontWeight: "var(--weight-medium)",
          color:      user.is_active ? "var(--color-success-text)" : "var(--theme-text-tertiary)",
        }}>
          <span style={{
            width:        "6px",
            height:       "6px",
            borderRadius: "var(--radius-full)",
            background:   user.is_active ? "var(--color-success)" : "var(--theme-text-tertiary)",
            flexShrink:   0,
          }} />
          {user.is_active ? (user.is_on_leave ? "On leave" : "Active") : "Inactive"}
        </span>
      </div>

      {/* Edit link */}
      <div style={{ flex: "0 0 auto" }}>
        <Link
          href={`/admin/users/${user.id}`}
          className="eia-touch"
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "var(--space-1)",
            padding:        "var(--space-1) var(--space-3)",
            background:     "transparent",
            border:         "1px solid var(--theme-paper-border)",
            borderRadius:   "var(--radius-sm)",
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-xs)",
            fontWeight:     "var(--weight-medium)",
            color:          "var(--theme-text-secondary)",
            textDecoration: "none",
            cursor:         "pointer",
            transition:     "var(--transition-interactive)",
            whiteSpace:     "nowrap",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--theme-accent-muted)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--theme-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--theme-paper-border)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--theme-text-secondary)";
          }}
        >
          <Pencil style={{ width: "12px", height: "12px", strokeWidth: 1.5 }} />
          Edit
        </Link>
      </div>
    </motion.div>
  );
}

function getRolePillStyle(role: Profile["role"]): React.CSSProperties {
  switch (role) {
    case "founder":
    case "admin":
      return {
        background: "var(--theme-accent-surface)",
        color:      "var(--theme-accent)",
        border:     "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
      };
    case "manager":
      return {
        background: "var(--color-info-light)",
        color:      "var(--color-info-text)",
        border:     "1px solid color-mix(in srgb, var(--color-info) 25%, transparent)",
      };
    case "agent":
      return {
        background: "var(--theme-paper-subtle)",
        color:      "var(--theme-text-secondary)",
        border:     "1px solid var(--theme-paper-border)",
      };
    default:
      return {
        background: "var(--theme-paper-subtle)",
        color:      "var(--theme-text-tertiary)",
        border:     "1px solid var(--theme-paper-border)",
      };
  }
}

const filterSelectStyle: React.CSSProperties = {
  padding:          "var(--space-2) var(--space-3)",
  paddingRight:     "var(--space-8)",
  background:       "var(--theme-paper-subtle)",
  border:           "1px solid var(--theme-paper-border)",
  borderRadius:     "var(--radius-sm)",
  fontFamily:       "var(--font-sans)",
  fontSize:         "var(--text-sm)",
  color:            "var(--theme-text-primary)",
  cursor:           "pointer",
  outline:          "none",
  appearance:       "none",
  WebkitAppearance: "none",
};

const chevronStyle: React.CSSProperties = {
  position:      "absolute",
  right:         "var(--space-3)",
  top:           "50%",
  transform:     "translateY(-50%)",
  width:         "12px",
  height:        "12px",
  strokeWidth:   1.5,
  color:         "var(--theme-text-tertiary)",
  pointerEvents: "none",
};
