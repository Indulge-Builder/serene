import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/types/database";

/**
 * Roster — THE team-roster anatomy on /admin/users (2026-09-26): a grid of tiles (a queendom,
 * a domain), each split into labelled groups (a seat, a role), each person a chip that opens
 * their user page. QueendomRosterCard and DomainRosterCard are thin mappers over these pieces;
 * never hand-roll a roster tile or a person chip. Server component, display-only.
 */

export type RosterMember = Pick<Profile, "id" | "full_name" | "avatar_url" | "is_active" | "is_on_leave"> & {
  /** A short tag after the name: a concierge seat on the Domains card. */
  note?: string | null;
};

/** The tile grid inside a SectionCard: as many 240px tiles as fit, one column on a phone. */
export function RosterGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
      {children}
    </div>
  );
}

export function RosterTile({
  icon: Icon,
  iconColor = "var(--neu-accent-deep)",
  title,
  aside,
  children,
}: {
  icon: LucideIcon;
  /** The icon's ink: the theme accent by default, a domain's own colour on the Domains card. */
  iconColor?: string;
  title: string;
  /** Quiet text at the end of the title row (a head count). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
      padding: "var(--space-4)",
      background: "var(--theme-paper-subtle)",
      border: "1px solid var(--theme-paper-border)",
      borderRadius: "var(--radius-md)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <Icon aria-hidden="true" style={{ width: 14, height: 14, strokeWidth: 1.5, color: iconColor, flexShrink: 0 }} />
        <h3 style={{
          margin: 0,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--theme-text-primary)",
        }}>{title}</h3>
        {aside != null && (
          <span style={{
            marginLeft: "auto",
            flexShrink: 0,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-xs)",
            color: "var(--theme-text-tertiary)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}>{aside}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * One labelled group of people. `counted` appends the head count ("Genies · 3"); `empty` names
 * the gap when nobody is in it ("Empty seat"), and without it an empty group renders nothing.
 * Inactive people sort last, keeping the caller's order otherwise. `from` is the Team view the
 * chips return to (the teammate page's Back reads it), filters included.
 */
export function RosterGroup({ label, members, counted = false, empty, from }: {
  label: string;
  members: RosterMember[];
  counted?: boolean;
  empty?: string;
  from?: string;
}) {
  if (members.length === 0 && !empty) return null;
  const ordered = [...members].sort((a, b) => Number(b.is_active) - Number(a.is_active));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <span style={groupLabelStyle}>{counted ? `${label} · ${members.length}` : label}</span>
      {ordered.length === 0 ? (
        <RosterEmpty>{empty}</RosterEmpty>
      ) : (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: 0, padding: 0, listStyle: "none" }}>
          {ordered.map((m) => (
            <li key={m.id} style={{ display: "flex", minWidth: 0, maxWidth: "100%" }}>
              <RosterChip member={m} from={from} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The roster's quiet voice for a gap ("Empty seat", "No one in Finance yet."). */
export function RosterEmpty({ children }: { children: ReactNode }) {
  return (
    <p style={{
      margin: 0,
      fontFamily: "var(--font-serif)",
      fontStyle: "italic",
      fontSize: "var(--text-sm)",
      color: "var(--theme-text-tertiary)",
    }}>{children}</p>
  );
}

function RosterChip({ member, from }: { member: RosterMember; from?: string }) {
  const href = from ? `/admin/users/${member.id}?from=${encodeURIComponent(from)}` : `/admin/users/${member.id}`;
  return (
    <Link href={href} className="serene-roster-chip" style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-2)",
      minWidth: 0,
      maxWidth: "100%",
      textDecoration: "none",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      opacity: member.is_active ? 1 : 0.55,
    }}>
      <Avatar src={member.avatar_url} name={member.full_name} size="xs" />
      {/* Name and tags wrap as one block: in a narrow tile a tag drops under the name,
          the name is never cut. */}
      <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-1) var(--space-2)", minWidth: 0 }}>
        <span style={{ overflowWrap: "anywhere" }}>{member.full_name}</span>
        {member.note && <span className="status-pill status-pill--accent">{member.note}</span>}
        {!member.is_active ? (
          <span className="status-pill status-pill--neutral">Inactive</span>
        ) : member.is_on_leave ? (
          <span className="status-pill status-pill--neutral">On leave</span>
        ) : null}
      </span>
    </Link>
  );
}

const groupLabelStyle: CSSProperties = {
  fontFamily:    "var(--font-sans)",
  fontSize:      "var(--text-2xs)",
  fontWeight:    "var(--weight-semibold)",
  color:         "var(--theme-text-tertiary)",
  letterSpacing: "var(--tracking-widest)",
  textTransform: "uppercase",
};
