import Link from "next/link";
import { Crown } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { SIA_ROLES, SIA_SINGLE_SEATS } from "@/lib/constants/sia-roles";
import type { QueendomRoster, QueendomRosterMember } from "@/lib/services/profiles-service";

/**
 * QueendomRosterCard — who holds each seat in every queendom, derived from profiles (0201).
 * Server component, display-only: an empty seat is named as empty so it is impossible to miss.
 */
export function QueendomRosterCard({ roster }: { roster: QueendomRoster[] }) {
  if (roster.length === 0) return null;
  return (
    <SectionCard title="Queendoms" description="Concierge seats, read from each member's profile. Assign a seat from a member's Authorization card.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
        {roster.map(({ queendom, seats, genies }) => (
          <div key={queendom.id} style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            background: "var(--theme-paper-subtle)",
            border: "1px solid var(--theme-paper-border)",
            borderRadius: "var(--radius-md)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Crown style={{ width: 14, height: 14, strokeWidth: 1.5, color: "var(--neu-accent-deep)" }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--theme-text-primary)" }}>{queendom.name}</span>
            </div>
            {SIA_SINGLE_SEATS.map((seat) => (
              <Seat key={seat} label={SIA_ROLES.labels[seat]} member={seats[seat]} />
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <span style={seatLabelStyle}>{SIA_ROLES.labels.genie}s · {genies.length}</span>
              {genies.length === 0 ? (
                <span style={emptyStyle}>No genies yet</span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {genies.map((g) => <MemberChip key={g.id} member={g} />)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Seat({ label, member }: { label: string; member: QueendomRosterMember | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <span style={seatLabelStyle}>{label}</span>
      {member ? <MemberChip member={member} /> : <span style={emptyStyle}>Empty seat</span>}
    </div>
  );
}

function MemberChip({ member }: { member: QueendomRosterMember }) {
  return (
    <Link href={`/admin/users/${member.id}`} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-2)",
      textDecoration: "none",
      color: "var(--theme-text-primary)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      opacity: member.is_active ? 1 : 0.55,
    }}>
      <Avatar src={member.avatar_url} name={member.full_name} size="xs" />
      <span>{member.full_name}</span>
      {!member.is_active && <span className="status-pill status-pill--neutral">Inactive</span>}
    </Link>
  );
}

const seatLabelStyle: React.CSSProperties = {
  fontFamily:    "var(--font-sans)",
  fontSize:      "var(--text-2xs)",
  fontWeight:    "var(--weight-semibold)",
  color:         "var(--theme-text-tertiary)",
  letterSpacing: "var(--tracking-widest)",
  textTransform: "uppercase",
};
const emptyStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontStyle:  "italic",
  fontSize:   "var(--text-sm)",
  color:      "var(--theme-text-tertiary)",
};
