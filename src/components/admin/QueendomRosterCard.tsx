import { Crown } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { RosterGrid, RosterGroup, RosterTile, type RosterMember } from "@/components/admin/Roster";
import { QUEENDOM_DOMAIN, SIA_ROLES, isSiaRole } from "@/lib/constants/sia-roles";
import { ROLE_LABELS } from "@/lib/constants/roles";
import type { QueendomRoster } from "@/lib/services/profiles-service";
import type { Profile } from "@/lib/types/database";

/**
 * QueendomRosterCard — the whole Concierge team, by seat, derived from profiles (0201).
 * Server component, display-only: an empty seat is named as empty so it is impossible to miss.
 * The queen and the joker are one seat each; bishops (0242) and genies are many. Above the tiles
 * sit the one company-wide seat, the Joker head (0244), and anyone in Concierge who holds no
 * seat (tagged with their role), so every Concierge account appears here exactly once and the
 * Domains card below can leave Concierge out. The tile, group and chip anatomy is the shared
 * Roster (DomainRosterCard is its twin).
 */
export function QueendomRosterCard({ roster, users, from }: { roster: QueendomRoster[]; users: Profile[]; from?: string }) {
  if (roster.length === 0) return null;
  const held = (member: RosterMember | null) => (member ? [member] : []);
  const heads = users.filter((u) => u.sia_role === "joker_head");
  const jokerHead = heads.find((u) => u.is_active) ?? heads[0] ?? null;
  const unseated = users
    .filter((u) => u.domain === QUEENDOM_DOMAIN && !isSiaRole(u.sia_role))
    .map((u): RosterMember => ({ ...u, note: ROLE_LABELS[u.role] }));

  return (
    <SectionCard title="Queendoms" description="The Concierge team by seat, read from each member's profile. Assign a seat from a member's Authorization card.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4) var(--space-8)", marginBottom: "var(--space-4)" }}>
        <RosterGroup label={`${SIA_ROLES.labels.joker_head} · every queendom`} members={held(jokerHead)} empty="Empty seat" from={from} />
        <RosterGroup label="No seat" counted members={unseated} from={from} />
      </div>
      <RosterGrid>
        {roster.map(({ queendom, seats, bishops, genies }) => (
          <RosterTile key={queendom.id} icon={Crown} title={queendom.name}>
            <RosterGroup label={SIA_ROLES.labels.queen} members={held(seats.queen)} empty="Empty seat" from={from} />
            <RosterGroup label={`${SIA_ROLES.labels.bishop}s`} counted members={bishops} empty="No bishops yet" from={from} />
            <RosterGroup label={SIA_ROLES.labels.joker} members={held(seats.joker)} empty="Empty seat" from={from} />
            <RosterGroup label={`${SIA_ROLES.labels.genie}s`} counted members={genies} empty="No genies yet" from={from} />
          </RosterTile>
        ))}
      </RosterGrid>
    </SectionCard>
  );
}
