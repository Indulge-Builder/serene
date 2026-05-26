"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Pencil, ChevronDown } from "lucide-react";
import type { Profile } from "@/lib/types/database";
import { ROLE_LABELS, USER_ROLES } from "@/lib/constants/roles";
import { DOMAIN_LABELS, APP_DOMAINS } from "@/lib/constants/domains";

type UsersTableProps = {
  users: Profile[];
};

export function UsersTable({ users }: UsersTableProps) {
  const [search, setSearch]         = useState("");
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

  return (
    <div>
      {/* Filter bar */}
      <div
        style={{
          display:       "flex",
          alignItems:    "center",
          gap:           "var(--space-3)",
          padding:       "var(--space-4) var(--space-6)",
          borderBottom:  "1px solid var(--theme-paper-border)",
          flexWrap:      "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: "160px" }}>
          <Search
            style={{
              position:    "absolute",
              left:        "var(--space-3)",
              top:         "50%",
              transform:   "translateY(-50%)",
              width:       "14px",
              height:      "14px",
              strokeWidth: 1.5,
              color:       "var(--theme-text-tertiary)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width:        "100%",
              padding:      "var(--space-2) var(--space-3) var(--space-2) var(--space-8)",
              background:   "var(--theme-paper-subtle)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-sm)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              color:        "var(--theme-text-primary)",
              outline:      "none",
              boxSizing:    "border-box",
            }}
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

        {/* Result count */}
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

      {/* Table or empty state */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding:   "var(--space-20) var(--space-8)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-xl)",
              color:      "var(--theme-text-secondary)",
              margin:     "0 0 var(--space-2)",
            }}
          >
            {users.length === 0
              ? "No team members yet."
              : "No members match your filters."}
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
            }}
          >
            {users.length === 0
              ? "Add the first member to get started."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width:          "100%",
              borderCollapse: "collapse",
              fontFamily:     "var(--font-sans)",
              fontSize:       "var(--text-sm)",
            }}
          >
            <thead>
              <tr>
                {["Name", "Email", "Role", "Domain", "Status", ""].map((col, i) => (
                  <th
                    key={i}
                    style={{
                      padding:       "var(--space-3) var(--space-4)",
                      textAlign:     col === "" ? "right" : "left",
                      fontFamily:    "var(--font-sans)",
                      fontSize:      "var(--text-2xs)",
                      fontWeight:    "var(--weight-semibold)",
                      letterSpacing: "var(--tracking-widest)",
                      textTransform: "uppercase",
                      color:         "var(--theme-text-tertiary)",
                      borderBottom:  "1px solid var(--theme-paper-border)",
                      background:    "var(--theme-paper-subtle)",
                      whiteSpace:    "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, idx) => (
                <tr
                  key={user.id}
                  style={{
                    background:   idx % 2 === 0 ? "var(--theme-paper)" : "var(--theme-paper-subtle)",
                    borderBottom: "1px solid var(--theme-paper-border)",
                  }}
                >
                  {/* Name + avatar */}
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <div
                        style={{
                          width:          "32px",
                          height:         "32px",
                          borderRadius:   "var(--radius-full)",
                          background:     "var(--theme-accent-surface)",
                          border:         "1px solid var(--theme-paper-border)",
                          display:        "flex",
                          alignItems:     "center",
                          justifyContent: "center",
                          fontSize:       "var(--text-xs)",
                          fontWeight:     "var(--weight-semibold)",
                          color:          "var(--theme-accent)",
                          flexShrink:     0,
                        }}
                      >
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div
                          style={{
                            fontWeight: "var(--weight-medium)",
                            color:      "var(--theme-text-primary)",
                          }}
                        >
                          {user.full_name}
                        </div>
                        {user.job_title && (
                          <div
                            style={{
                              fontSize:  "var(--text-xs)",
                              color:     "var(--theme-text-tertiary)",
                              marginTop: "1px",
                            }}
                          >
                            {user.job_title}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      color:   "var(--theme-text-secondary)",
                    }}
                  >
                    {user.email}
                  </td>

                  {/* Role badge */}
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>
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
                  </td>

                  {/* Domain */}
                  <td
                    style={{
                      padding:    "var(--space-3) var(--space-4)",
                      color:      "var(--theme-text-secondary)",
                      fontSize:   "var(--text-xs)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {DOMAIN_LABELS[user.domain]}
                  </td>

                  {/* Status */}
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                    <span
                      style={{
                        display:    "inline-flex",
                        alignItems: "center",
                        gap:        "var(--space-1)",
                        fontSize:   "var(--text-xs)",
                        fontWeight: "var(--weight-medium)",
                        color:      user.is_active
                          ? "var(--color-success-text)"
                          : "var(--theme-text-tertiary)",
                      }}
                    >
                      <span
                        style={{
                          width:        "6px",
                          height:       "6px",
                          borderRadius: "var(--radius-full)",
                          background:   user.is_active
                            ? "var(--color-success)"
                            : "var(--theme-text-tertiary)",
                          flexShrink:   0,
                        }}
                      />
                      {user.is_active ? (user.is_on_leave ? "On leave" : "Active") : "Inactive"}
                    </span>
                  </td>

                  {/* Edit action */}
                  <td
                    style={{
                      padding:   "var(--space-3) var(--space-4)",
                      textAlign: "right",
                    }}
                  >
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
