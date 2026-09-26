import { Crown } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { RosterGrid, RosterGroup, RosterTile, type RosterMember } from "@/components/admin/Roster";
import { SIA_ROLES } from "@/lib/constants/sia-roles";
import type { QueendomRoster } from "@/lib/services/profiles-service";

/**
 * QueendomRosterCard — who holds each seat in every queendom, derived from profiles (0201).
 * Server component, display-only: an empty seat is named as empty so it is impossible to miss.
 * The queen and the joker are one seat each; bishops (0242) and genies are many. Above the tiles
 * sits the one company-wide seat, the Joker head (0244), named as empty when nobody holds it.
 * The tile, group and chip anatomy is the shared Roster (DomainRosterCard is its twin).
 */
export function QueendomRosterCard({ roster, jokerHead = null, from }: { roster: QueendomRoster[]; jokerHead?: RosterMember | null; from?: string }) {
  if (roster.length === 0) return null;
  const held = (member: RosterMember | null) => (member ? [member] : []);
  return (
    <SectionCard title="Queendoms" description="Concierge seats, read from each member's profile. Assign a seat from a member's Authorization card.">
      <div style={{ marginBottom: "var(--space-4)" }}>
        <RosterGroup label={`${SIA_ROLES.labels.joker_head} · every queendom`} members={held(jokerHead)} empty="Empty seat" from={from} />
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
