"use client";

/**
 * AssigneePickerModal — domain-scoped user picker for subtask creation.
 *
 * Opens as a nested modal (z-index: --z-modal-overlay / --z-modal-nested, above TaskModal).
 * Domain selector at top (tabs/segmented control).
 * Search filters user list client-side — max 100 users, no server round-trip.
 * User list: avatar + full name + role badge. Single select.
 * Confirm button fires onConfirm(userId).
 *
 * Props:
 *   open             — controls visibility
 *   onClose          — called on Escape, backdrop, or Cancel
 *   onConfirm        — called with selected userId on Confirm
 *   users            — all users, pre-fetched by the parent (max 100)
 *   initialDomain    — domain to pre-select (caller's domain)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";
import { DOMAIN_LABELS, GIA_DOMAINS } from "@/lib/constants/domains";
import { ROLE_LABELS } from "@/lib/constants/roles";
import type { Profile, AppDomain } from "@/lib/types/database";
import { EASE_OUT_EXPO } from '@/lib/constants/motion';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssignableUser = Pick<Profile, "id" | "full_name" | "avatar_url" | "role" | "domain">;

interface AssigneePickerModalProps {
  open:          boolean;
  onClose:       () => void;
  onConfirm:     (userId: string, user: AssignableUser) => void;
  users:         AssignableUser[];
  initialDomain: AppDomain;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ROLE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  founder: { bg: "var(--color-warning)",      text: "var(--color-warning-text)" },
  admin:   { bg: "var(--color-info)",          text: "var(--color-info-text)" },
  manager: { bg: "var(--theme-accent-surface)", text: "var(--theme-accent)" },
  agent:   { bg: "var(--theme-paper-border)",  text: "var(--theme-text-secondary)" },
  guest:   { bg: "var(--theme-paper-border)",  text: "var(--theme-text-tertiary)" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AssigneePickerModal({
  open,
  onClose,
  onConfirm,
  users,
  initialDomain,
}: AssigneePickerModalProps) {
  const [selectedDomain, setSelectedDomain] = useState<AppDomain>(initialDomain);
  const [search,         setSearch]         = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setSelectedDomain(initialDomain);
      setSearch("");
      setSelectedUserId(null);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, initialDomain]);

  // Keyboard dismiss
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // ── Filter users by domain + search ──────────────────────────────────────

  const domainUsers = useMemo(
    () => users.filter((u) => u.domain === selectedDomain),
    [users, selectedDomain],
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domainUsers;
    return domainUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q),
    );
  }, [domainUsers, search]);

  // Only show domains that have at least one user
  const domainsWithUsers = useMemo(
    () => GIA_DOMAINS.filter((d) => users.some((u) => u.domain === d)),
    [users],
  );

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  function handleConfirm() {
    if (!selectedUserId || !selectedUser) return;
    onConfirm(selectedUserId, selectedUser);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — on top of TaskModal */}
          <motion.div
            key="assignee-picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position:   "fixed",
              inset:      0,
              background: "var(--overlay-bg-light)",
              zIndex:     "var(--z-modal-overlay)" as React.CSSProperties["zIndex"],
            }}
          />

          {/* Centering shell — flex only; motion y/scale on inner panel (never overwrites translate). */}
          <div
            style={{
              position:        "fixed",
              inset:             0,
              zIndex:            "var(--z-modal-nested)" as React.CSSProperties["zIndex"],
              display:           "flex",
              alignItems:        "center",
              justifyContent:    "center",
              padding:           "var(--space-4)",
              pointerEvents:     "none",
            }}
          >
          <motion.div
            key="assignee-picker-container"
            role="dialog"
            aria-modal="true"
            aria-label="Pick an assignee"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            style={{
              pointerEvents: "auto",
              width:         "min(520px, 100%)",
              maxHeight:     "100%",
              background:    "var(--theme-paper)",
              borderRadius:  "var(--radius-lg)",
              boxShadow:     "var(--shadow-4)",
              overflow:      "hidden",
              display:       "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "var(--space-4) var(--space-5)",
                background:     "var(--theme-paper-subtle)",
                borderBottom:   "1px solid var(--theme-paper-border)",
                flexShrink:     0,
              }}
            >
              <h2
                style={{
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-sm)",
                  fontWeight:  "var(--weight-semibold)",
                  color:       "var(--theme-text-primary)",
                  margin:      0,
                }}
              >
                Assign to
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  width:          "28px",
                  height:         "28px",
                  borderRadius:   "var(--radius-sm)",
                  border:         "1px solid var(--theme-paper-border)",
                  background:     "transparent",
                  color:          "var(--theme-text-tertiary)",
                  cursor:         "pointer",
                  transition:     "var(--transition-hover)",
                }}
              >
                <X style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
              </button>
            </div>

            {/* Domain tabs */}
            <div
              style={{
                display:          "flex",
                overflowX:        "auto",
                padding:          "var(--space-3) var(--space-5) 0",
                gap:              "var(--space-1)",
                borderBottom:     "1px solid var(--theme-paper-border)",
                flexShrink:       0,
                scrollbarWidth:   "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {domainsWithUsers.map((domain) => {
                const active = domain === selectedDomain;
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => {
                      setSelectedDomain(domain);
                      setSearch("");
                      setSelectedUserId(null);
                    }}
                    style={{
                      padding:       "var(--space-2) var(--space-3)",
                      borderRadius:  "var(--radius-sm) var(--radius-sm) 0 0",
                      border:        "none",
                      borderBottom:  active
                        ? "2px solid var(--theme-accent)"
                        : "2px solid transparent",
                      background:    active ? "var(--theme-accent-surface)" : "transparent",
                      color:         active ? "var(--theme-accent)" : "var(--theme-text-secondary)",
                      fontFamily:    "var(--font-sans)",
                      fontSize:      "var(--text-xs)",
                      fontWeight:    active ? "var(--weight-semibold)" : "var(--weight-normal)",
                      cursor:        "pointer",
                      whiteSpace:    "nowrap",
                      transition:    "var(--transition-hover)",
                      marginBottom:  "-1px",
                    }}
                  >
                    {DOMAIN_LABELS[domain]}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div
              style={{
                padding:    "var(--space-3) var(--space-5)",
                borderBottom: "1px solid var(--theme-paper-border)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position:     "relative",
                  display:      "flex",
                  alignItems:   "center",
                }}
              >
                <Search
                  style={{
                    position:    "absolute",
                    left:        "var(--space-3)",
                    width:       "14px",
                    height:      "14px",
                    strokeWidth: 1.5,
                    color:       "var(--theme-text-tertiary)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or role…"
                  style={{
                    width:        "100%",
                    paddingLeft:  "calc(var(--space-3) + 14px + var(--space-2))",
                    paddingRight: "var(--space-3)",
                    paddingTop:   "var(--space-2)",
                    paddingBottom: "var(--space-2)",
                    border:       "1px solid var(--theme-paper-border)",
                    borderRadius: "var(--radius-sm)",
                    background:   "var(--theme-paper-subtle)",
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-sm)",
                    color:        "var(--theme-text-primary)",
                    outline:      "none",
                    caretColor:   "var(--theme-accent)",
                    transition:   "var(--transition-hover)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--theme-accent)";
                    e.currentTarget.style.boxShadow  = "var(--shadow-accent-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.boxShadow  = "";
                  }}
                />
              </div>
            </div>

            {/* User list */}
            <div
              style={{
                flex:                     1,
                overflowY:                "auto",
                padding:                  "var(--space-2) 0",
                WebkitOverflowScrolling:  "touch",
                overscrollBehavior:       "contain",
              }}
            >
              {filteredUsers.length === 0 ? (
                <div
                  style={{
                    padding:   "var(--space-8) var(--space-5)",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontStyle:  "italic",
                      fontSize:   "var(--text-sm)",
                      color:      "var(--theme-text-tertiary)",
                      margin:     0,
                    }}
                  >
                    {search ? "No matching team members." : "No team members in this domain."}
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const selected   = user.id === selectedUserId;
                  const roleBadge  = ROLE_BADGE_COLORS[user.role] ?? ROLE_BADGE_COLORS.agent;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(selected ? null : user.id)}
                      style={{
                        display:        "flex",
                        alignItems:     "center",
                        gap:            "var(--space-3)",
                        width:          "100%",
                        padding:        "var(--space-2) var(--space-5)",
                        border:         "none",
                        background:     selected
                          ? "var(--theme-accent-surface)"
                          : "transparent",
                        cursor:         "pointer",
                        transition:     "var(--transition-hover)",
                        textAlign:      "left",
                      }}
                      onMouseEnter={(e) => {
                        if (!selected) {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--theme-paper-subtle)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width:          "32px",
                          height:         "32px",
                          borderRadius:   "var(--radius-sm)",
                          background:     selected
                            ? "var(--theme-accent)"
                            : "var(--theme-accent-surface)",
                          border:         selected
                            ? "1px solid var(--theme-accent)"
                            : "1px solid var(--theme-paper-border)",
                          display:        "flex",
                          alignItems:     "center",
                          justifyContent: "center",
                          flexShrink:     0,
                          overflow:       "hidden",
                          transition:     "var(--transition-interactive)",
                        }}
                      >
                        {user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.avatar_url}
                            alt={user.full_name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize:   "var(--text-xs)",
                              fontWeight: "var(--weight-semibold)",
                              color:      selected
                                ? "var(--theme-accent-fg)"
                                : "var(--theme-accent)",
                              lineHeight: 1,
                            }}
                          >
                            {getInitials(user.full_name)}
                          </span>
                        )}
                      </div>

                      {/* Name + role */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily:  "var(--font-sans)",
                            fontSize:    "var(--text-sm)",
                            fontWeight:  selected
                              ? "var(--weight-semibold)"
                              : "var(--weight-normal)",
                            color:       selected
                              ? "var(--theme-accent)"
                              : "var(--theme-text-primary)",
                            whiteSpace:  "nowrap",
                            overflow:    "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {user.full_name}
                        </div>
                      </div>

                      {/* Role badge */}
                      <span
                        style={{
                          padding:      "2px var(--space-2)",
                          borderRadius: "var(--radius-full)",
                          background:   roleBadge.bg,
                          color:        roleBadge.text,
                          fontFamily:   "var(--font-sans)",
                          fontSize:     "var(--text-2xs)",
                          fontWeight:   "var(--weight-semibold)",
                          whiteSpace:   "nowrap",
                          flexShrink:   0,
                        }}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>

                      {/* Selected indicator */}
                      {selected && (
                        <div
                          style={{
                            width:        "6px",
                            height:       "6px",
                            borderRadius: "var(--radius-full)",
                            background:   "var(--theme-accent)",
                            flexShrink:   0,
                          }}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "var(--space-4) var(--space-5)",
                borderTop:      "1px solid var(--theme-paper-border)",
                flexShrink:     0,
                background:     "var(--theme-paper-subtle)",
              }}
            >
              {/* Selected preview */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {selectedUser ? (
                  <span
                    style={{
                      fontFamily:  "var(--font-sans)",
                      fontSize:    "var(--text-xs)",
                      color:       "var(--theme-text-secondary)",
                    }}
                  >
                    Selected:{" "}
                    <strong
                      style={{
                        color:      "var(--theme-text-primary)",
                        fontWeight: "var(--weight-semibold)",
                      }}
                    >
                      {selectedUser.full_name}
                    </strong>
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize:   "var(--text-xs)",
                      color:      "var(--theme-text-tertiary)",
                    }}
                  >
                    No one selected
                  </span>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding:      "var(--space-2) var(--space-4)",
                    borderRadius: "var(--radius-sm)",
                    border:       "1px solid var(--theme-paper-border)",
                    background:   "transparent",
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-sm)",
                    color:        "var(--theme-text-secondary)",
                    cursor:       "pointer",
                    transition:   "var(--transition-hover)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selectedUserId}
                  style={{
                    padding:      "var(--space-2) var(--space-4)",
                    borderRadius: "var(--radius-sm)",
                    border:       "none",
                    background:   selectedUserId
                      ? "var(--theme-accent)"
                      : "var(--theme-paper-border)",
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-sm)",
                    fontWeight:   "var(--weight-semibold)",
                    color:        selectedUserId
                      ? "var(--theme-accent-fg)"
                      : "var(--theme-text-tertiary)",
                    cursor:       selectedUserId ? "pointer" : "not-allowed",
                    transition:   "var(--transition-interactive)",
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
