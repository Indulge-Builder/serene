"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Pencil, ChevronDown } from "lucide-react";
import type { Profile } from "@/lib/types/database";
import { ROLE_LABELS, USER_ROLES } from "@/lib/constants/roles";
import { DOMAIN_LABELS, APP_DOMAINS } from "@/lib/constants/domains";
import { SearchBar } from "@/components/ui/SearchBar";
import { Avatar } from "@/components/ui/Avatar";
import { Table, type TableColumn } from "@/components/ui/Table";

type UsersTableProps = {
  users: Profile[];
};

export function UsersTable({ users }: UsersTableProps) {
  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState<string>("all");
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

  const columns: TableColumn<Profile>[] = [
    {
      id:     "name",
      header: "Name",
      cell:   (user) => (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Avatar
            src={user.avatar_url}
            name={user.full_name}
            size="sm"
          />
          <div>
            <div style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
              {user.full_name}
            </div>
            {user.job_title && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", marginTop: "1px" }}>
                {user.job_title}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id:     "email",
      header: "Email",
      cell:   (user) => (
        <span style={{ color: "var(--theme-text-secondary)" }}>{user.email}</span>
      ),
    },
    {
      id:     "role",
      header: "Role",
      cell:   (user) => (
        <span
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            padding:      "2px var(--space-3)",
            borderRadius: "var(--radius-full)",
            fontSize:     "var(--text-xs)",
            fontWeight:   "var(--weight-semibold)",
            ...getRolePillStyle(user.role),
          }}
        >
          {ROLE_LABELS[user.role]}
        </span>
      ),
    },
    {
      id:     "domain",
      header: "Domain",
      cell:   (user) => (
        <span style={{ color: "var(--theme-text-secondary)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
          {DOMAIN_LABELS[user.domain]}
        </span>
      ),
    },
    {
      id:     "status",
      header: "Status",
      cell:   (user) => (
        <span
          style={{
            display:    "inline-flex",
            alignItems: "center",
            gap:        "var(--space-1)",
            fontSize:   "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color:      user.is_active ? "var(--color-success-text)" : "var(--theme-text-tertiary)",
          }}
        >
          <span
            style={{
              width:        "6px",
              height:       "6px",
              borderRadius: "var(--radius-full)",
              background:   user.is_active ? "var(--color-success)" : "var(--theme-text-tertiary)",
              flexShrink:   0,
            }}
          />
          {user.is_active ? (user.is_on_leave ? "On leave" : "Active") : "Inactive"}
        </span>
      ),
    },
    {
      id:     "edit",
      header: "",
      align:  "right",
      cell:   (user) => (
        <Link
          href={`/admin/users/${user.id}`}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
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
        >
          <Pencil style={{ width: "12px", height: "12px", strokeWidth: 1.5 }} />
          Edit
        </Link>
      ),
    },
  ];

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
      {/* Filter bar */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-3)",
          padding:      "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--theme-paper-border)",
          flexWrap:     "wrap",
        }}
      >
        <div style={{ flex: "1 1 200px", minWidth: "160px" }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name or email…"
            size="sm"
          />
        </div>

        {/* Role filter */}
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

        {/* Domain filter */}
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
          {filtered.length} {filtered.length === 1 ? "result" : "results"}
        </span>
      </div>

      <Table<Profile>
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        emptyState={emptyState}
        stickyHeader
      />
    </div>
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
