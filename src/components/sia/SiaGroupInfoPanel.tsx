"use client";

// The group profile panel — WhatsApp-Web's "Group info", Serene material.
// Slides in over the right edge of the chat pane (a parallel, non-blocking
// panel: no scrim — apple-design §12). Holds the group's identity (avatar,
// subject, description, owner, watching-since), the mapping controls
// (classify + rail visibility — the same actions the console drives), and the
// member roster with automatic identity resolution: members whose phone
// matches a Serene profile wear the Indulge badge (the agent mapping),
// everyone else takes their side from the group's kind.

import { useCallback, useEffect, useMemo, useState } from "react";
import { m as motion } from "framer-motion";
import { ChevronDown, Crown, MessagesSquare, UserRound, Users, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { SearchBar } from "@/components/ui/SearchBar";
import { Toggle } from "@/components/ui/Toggle";
import { InfoRow } from "@/components/ui/InfoRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { CollapseReveal } from "@/components/ui/CollapseReveal";
import { formatDate, formatRelativeTime } from "@/lib/utils/dates";
import { SPRING_CONFIG, FAST_DURATION, EASE_IN_OUT } from "@/lib/constants/motion";
import Link from "next/link";
import { getSiaGroupInfoAction, updateSiaGroupMappingAction } from "@/lib/actions/sia";
import { searchMembersAction } from "@/lib/actions/members";
import { CLIENTS_PATH } from "@/lib/constants/sia-roles";
import type { MemberPickerHit } from "@/lib/types/member";
import { groupTitle, KIND_LABEL, KindPillRow } from "./sia-shared";
import type { SiaGroupInfo, SiaGroupKind, SiaGroupRow, SiaMemberRow } from "@/lib/services/sia-service";

// Session cache — reopening a group's info is instant; refetched after 60s.
const infoCache = new Map<string, { at: number; info: SiaGroupInfo }>();
const INFO_TTL_MS = 60_000;

export function SiaGroupInfoPanel({
  group,
  onClose,
  onPatchGroup,
  canManage = true,
}: {
  group: SiaGroupRow;
  onClose: () => void;
  onPatchGroup: (jid: string, patch: Partial<SiaGroupRow>) => void;
  /** False for a queendom viewer: the linked member is shown, nothing can be re-mapped. */
  canManage?: boolean;
}) {
  const [info, setInfo] = useState<SiaGroupInfo | null>(
    () => {
      const hit = infoCache.get(group.group_jid);
      return hit && Date.now() - hit.at < INFO_TTL_MS ? hit.info : null;
    },
  );
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [formerOpen, setFormerOpen] = useState(false);

  useEffect(() => {
    if (info) return;
    let alive = true;
    getSiaGroupInfoAction(group.group_jid).then((res) => {
      if (!alive) return;
      if (res.data) {
        infoCache.set(group.group_jid, { at: Date.now(), info: res.data });
        setInfo(res.data);
      } else {
        setFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [group.group_jid, info]);

  // Escape closes (parallel panel — never traps focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setKind = useCallback(
    async (kind: SiaGroupKind) => {
      setSaving(true);
      const res = await updateSiaGroupMappingAction(group.group_jid, { group_kind: kind });
      if (res.data) onPatchGroup(group.group_jid, { group_kind: kind });
      setSaving(false);
    },
    [group.group_jid, onPatchGroup],
  );

  const setVisible = useCallback(
    async (next: boolean) => {
      setSaving(true);
      const res = await updateSiaGroupMappingAction(group.group_jid, { is_active: next });
      if (res.data) onPatchGroup(group.group_jid, { is_active: next });
      setSaving(false);
    },
    [group.group_jid, onPatchGroup],
  );

  // The member link (0194): search the spine, pick, and the group becomes that member's.
  const [memberQuery, setMemberQuery] = useState("");
  const [memberHits, setMemberHits] = useState<MemberPickerHit[]>([]);
  useEffect(() => {
    const q = memberQuery.trim();
    if (q.length < 2) { setMemberHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const res = await searchMembersAction({ q, limit: 8 });
      if (alive && res.data) setMemberHits(res.data);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [memberQuery]);

  const setMember = useCallback(
    async (member: { id: string; full_name: string } | null) => {
      setSaving(true);
      const res = await updateSiaGroupMappingAction(group.group_jid, { member_id: member?.id ?? null });
      if (res.data) {
        onPatchGroup(group.group_jid, { group_kind: member ? "member" : "unmapped" });
        setInfo((prev) => (prev ? { ...prev, member } : prev));
        setMemberQuery("");
        setMemberHits([]);
      }
      setSaving(false);
    },
    [group.group_jid, onPatchGroup],
  );

  const filteredMembers = useMemo(() => {
    if (!info) return [];
    const q = memberSearch.trim().toLowerCase();
    if (!q) return info.members;
    return info.members.filter((m) =>
      (m.staff_name ?? m.name ?? m.phone ?? "").toLowerCase().includes(q),
    );
  }, [info, memberSearch]);

  const title = groupTitle(group);

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={SPRING_CONFIG}
      className="absolute inset-y-0 right-0 w-full sm:w-[340px] flex flex-col min-h-0 bg-(--theme-paper) border-l border-(--theme-paper-border)"
      style={{ boxShadow: "var(--shadow-3)", zIndex: "var(--z-raised)" }}
      aria-label="Group info"
    >
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--theme-paper-border) shrink-0">
        <span className="type-body-sm font-(--weight-medium) text-(--theme-text-primary)">Group info</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close group info"
          className="serene-pressable serene-icon-rotate-hover w-7 h-7 rounded-full flex items-center justify-center border-0 bg-transparent text-(--theme-text-secondary)"
          style={{ cursor: "pointer" }}
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* ── Scroll body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Hero */}
        <div className="flex flex-col items-center gap-2 px-5 pt-5 pb-4">
          <Avatar name={title} size="xl" />
          <div className="type-body font-(--weight-medium) text-(--theme-text-primary) text-center" style={{ wordBreak: "break-word" }}>
            {title}
          </div>
          <div className="type-caption text-(--theme-text-tertiary)">
            {KIND_LABEL[group.group_kind]} group · {group.member_count ?? info?.members.length ?? "—"} members
          </div>
        </div>

        {/* Mapping controls */}
        {canManage && (
        <div className="px-5 pb-4 flex flex-col gap-3 border-b border-(--theme-paper-border)">
          <div className="flex justify-center">
            <KindPillRow value={group.group_kind} disabled={saving} onPick={setKind} />
          </div>
          <div className="flex items-center justify-between">
            <span className="type-caption text-(--theme-text-secondary)">Visible in the rail</span>
            <Toggle checked={group.is_active} onChange={setVisible} size="sm" disabled={saving} />
          </div>
          {/* The member link: who this group belongs to (the same link the member page sets). */}
          <div className="flex flex-col gap-2">
            <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>Linked member</span>
            {info?.member ? (
              <div className="flex items-center justify-between gap-2">
                <Link href={`${CLIENTS_PATH}/${info.member.id}`} className="type-body-sm" style={{ color: "var(--neu-accent-deep)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {info.member.full_name}
                </Link>
                <button type="button" onClick={() => setMember(null)} disabled={saving} className="type-caption serene-pressable" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--theme-text-tertiary)" }}>
                  Unlink
                </button>
              </div>
            ) : (
              <>
                <input
                  className="serene-input neu-input"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Search a member to link"
                  disabled={saving || !info}
                />
                {memberHits.length > 0 && (
                  <ul className="m-0 p-0 flex flex-col gap-1" style={{ listStyle: "none" }}>
                    {memberHits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setMember({ id: c.id, full_name: c.full_name })}
                          disabled={saving}
                          className="serene-pressable type-body-sm w-full text-left"
                          style={{ background: "none", border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", cursor: "pointer", color: "var(--theme-text-primary)" }}
                        >
                          {c.full_name}
                          <span className="type-caption" style={{ color: "var(--theme-text-tertiary)", marginLeft: "var(--space-2)" }}>
                            {c.primary_phone ?? ""}{c.queendom_name ? ` · ${c.queendom_name}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
        )}

        {/* A queendom viewer sees who the group belongs to; re-mapping is an admin job. */}
        {!canManage && info?.member && (
          <div className="px-5 pb-4 flex flex-col gap-2 border-b border-(--theme-paper-border)">
            <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>Linked member</span>
            <Link href={`${CLIENTS_PATH}/${info.member.id}`} className="type-body-sm" style={{ color: "var(--neu-accent-deep)" }}>
              {info.member.full_name}
            </Link>
          </div>
        )}

        {failed ? (
          <div className="py-10 px-5">
            <EmptyState variant="inline" title="Couldn't load this group's details" />
          </div>
        ) : !info ? (
          <div className="flex items-center justify-center py-12">
            <LogoSpinner size="md" />
          </div>
        ) : (
          <>
            {/* Description */}
            {info.description && (
              <div className="px-5 py-4 border-b border-(--theme-paper-border)">
                <div className="label-micro mb-1.5" style={{ color: "var(--theme-text-tertiary)" }}>
                  Description
                </div>
                <p
                  className="m-0 type-body-sm text-(--theme-text-primary)"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "var(--leading-relaxed)" }}
                >
                  {info.description}
                </p>
              </div>
            )}

            {/* Meta */}
            <div className="px-5 py-4 border-b border-(--theme-paper-border) flex flex-col gap-3">
              <InfoRow icon={MessagesSquare} label="Messages captured" value={group.message_count.toLocaleString("en-IN")} />
              {info.watcher_joined_at && (
                <InfoRow icon={Users} label="Watching since" value={formatDate(info.watcher_joined_at, "d MMM yyyy")} />
              )}
              {info.owner && (info.owner.name || info.owner.phone) && (
                <InfoRow
                  icon={Crown}
                  label="Created by"
                  value={info.owner.name ?? info.owner.phone ?? "—"}
                />
              )}
            </div>

            {/* Members */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
                  Members · {info.members.length}
                </span>
                {info.staffCount > 0 && (
                  <span
                    className="type-caption rounded-full"
                    style={{
                      padding: "1px 9px",
                      background: "var(--theme-accent-surface)",
                      color: "var(--neu-accent-deep)",
                      fontWeight: "var(--weight-medium)",
                    }}
                  >
                    {info.staffCount} Indulge
                  </span>
                )}
              </div>

              {info.members.length > 12 && (
                <div className="mb-2">
                  <SearchBar
                    value={memberSearch}
                    onChange={setMemberSearch}
                    placeholder="Find a member"
                    size="sm"
                    aria-label="Find a member"
                  />
                </div>
              )}

              {filteredMembers.length === 0 ? (
                <div className="py-6">
                  <EmptyState
                    variant="inline"
                    title={
                      info.members.length === 0
                        ? "Member list syncs as the group talks"
                        : `Nobody matches "${memberSearch.trim()}"`
                    }
                  />
                </div>
              ) : (
                <div className="flex flex-col">
                  {filteredMembers.map((m, i) => (
                    <MemberRow key={m.member_jid} member={m} groupKind={group.group_kind} index={i} />
                  ))}
                </div>
              )}

              {/* Former members */}
              {info.formerCount > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setFormerOpen((v) => !v)}
                    className="serene-pressable w-full flex items-center justify-between border-0 bg-transparent py-1.5 type-caption text-(--theme-text-secondary)"
                    style={{ cursor: "pointer" }}
                  >
                    <span>
                      {info.formerCount} former member{info.formerCount === 1 ? "" : "s"}
                    </span>
                    <ChevronDown
                      className="w-3.5 h-3.5"
                      strokeWidth={1.5}
                      style={{
                        transform: formerOpen ? "rotate(180deg)" : "none",
                        transition: "transform var(--duration-fast) var(--ease-in-out)",
                      }}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {formerOpen && (
                      <CollapseReveal key="sia-former-members">
                        <div className="flex flex-col pt-1" style={{ opacity: 0.7 }}>
                          {info.formerMembers.map((m, i) => (
                            <MemberRow key={m.member_jid} member={m} groupKind={group.group_kind} index={i} former />
                          ))}
                          {info.formerCount > info.formerMembers.length && (
                            <div className="type-caption text-(--theme-text-tertiary) py-1.5">
                              + {info.formerCount - info.formerMembers.length} more
                            </div>
                          )}
                        </div>
                      </CollapseReveal>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.aside>
  );
}

// ─────────────────────────────────────────────
// One member row — identity + badges
// ─────────────────────────────────────────────

const SIDE_LABEL: Record<SiaGroupKind, string | null> = {
  member: "Member",
  vendor: "Vendor",
  internal: "External",
  unmapped: null,
};

function MemberRow({
  member,
  groupKind,
  index,
  former = false,
}: {
  member: SiaMemberRow;
  groupKind: SiaGroupKind;
  index: number;
  former?: boolean;
}) {
  const display = member.staff_name ?? member.name;
  const isStaff = !!member.staff_name;
  const isWaAdmin = member.wa_role !== "member";
  const sideLabel = !isStaff && !former ? SIDE_LABEL[groupKind] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_IN_OUT, delay: Math.min(index * 0.012, 0.18) }}
      className="flex items-center gap-2.5 py-2"
    >
      {display ? (
        <Avatar name={display} size="sm" />
      ) : (
        <span
          className="shrink-0 rounded-(--radius-md) flex items-center justify-center"
          style={{ width: 32, height: 32, background: "var(--theme-paper-subtle)", color: "var(--theme-text-tertiary)" }}
        >
          <UserRound className="w-4 h-4" strokeWidth={1.5} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div
          className="type-body-sm truncate"
          style={{
            color: display ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
            fontStyle: display ? "normal" : "italic",
            fontWeight: display ? "var(--weight-medium)" : "var(--weight-normal)",
          }}
        >
          {display ?? "Not synced yet"}
        </div>
        <div className="type-caption text-(--theme-text-tertiary) truncate" style={{ fontFamily: member.phone ? "var(--font-mono)" : undefined }}>
          {former && member.left_at
            ? `left ${formatRelativeTime(member.left_at)}`
            : (member.phone ?? (member.name && !isStaff ? "number hidden" : "—"))}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isStaff && (
          <span
            title={`${member.staff_name} · ${member.staff_role}`}
            className="type-caption rounded-full"
            style={{
              padding: "1px 9px",
              background: "var(--theme-accent-surface)",
              color: "var(--neu-accent-deep)",
              fontWeight: "var(--weight-medium)",
            }}
          >
            Indulge
          </span>
        )}
        {sideLabel && (
          <span
            className="type-caption rounded-full"
            style={{ padding: "1px 9px", background: "var(--theme-paper-subtle)", color: "var(--theme-text-secondary)" }}
          >
            {sideLabel}
          </span>
        )}
        {isWaAdmin && (
          <span
            className="type-caption rounded-full"
            style={{
              padding: "1px 9px",
              background: "var(--color-info-light)",
              color: "var(--color-info-text)",
              fontWeight: "var(--weight-medium)",
            }}
          >
            Admin
          </span>
        )}
      </div>
    </motion.div>
  );
}
