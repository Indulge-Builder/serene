import { SectionCard } from "@/components/ui/SectionCard";
import { RosterEmpty, RosterGrid, RosterGroup, RosterTile, type RosterMember } from "@/components/admin/Roster";
import { APP_DOMAINS, DOMAIN_LABELS } from "@/lib/constants/domains";
import { getDomainIcon } from "@/lib/constants/domain-icons";
import { DOMAIN_LINE_COLORS } from "@/lib/constants/domain-colors";
import { ROLE_LABELS, USER_ROLES } from "@/lib/constants/roles";
import { SIA_ROLES, isSiaRole } from "@/lib/constants/sia-roles";
import type { Profile } from "@/lib/types/database";

const OR_LIST = new Intl.ListFormat("en-IN", { type: "disjunction" });

/**
 * DomainRosterCard — the whole team by the domain on each profile, the Queendoms card's twin.
 * A profile has one domain, so everyone appears exactly once: grouped by platform role inside
 * their domain, a concierge seat riding as a tag so the two cards read together. A domain with
 * nobody in it is named in one line under the tiles, never drawn as an empty tile.
 * Server component, display-only: it groups the profiles the page already loaded.
 */
export function DomainRosterCard({ users, from }: { users: Profile[]; from?: string }) {
  const domains = APP_DOMAINS.map((domain) => ({ domain, people: users.filter((u) => u.domain === domain) }));
  const staffed = domains.filter((d) => d.people.length > 0);
  if (staffed.length === 0) return null;
  const unstaffed = domains.filter((d) => d.people.length === 0).map((d) => DOMAIN_LABELS[d.domain]);

  return (
    <SectionCard title="Domains" description="The whole team by domain, read from each member's profile. Change a domain from a member's Authorization card.">
      <RosterGrid>
        {staffed.map(({ domain, people }) => (
          <RosterTile
            key={domain}
            icon={getDomainIcon(domain)}
            iconColor={DOMAIN_LINE_COLORS[domain]}
            title={DOMAIN_LABELS[domain]}
            aside={`${people.length} ${people.length === 1 ? "person" : "people"}`}
          >
            {USER_ROLES.map((role) => (
              <RosterGroup
                key={role}
                label={`${ROLE_LABELS[role]}s`}
                counted
                members={people.filter((p) => p.role === role).map(withSeat)}
                from={from}
              />
            ))}
          </RosterTile>
        ))}
      </RosterGrid>
      {unstaffed.length > 0 && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <RosterEmpty>No one in {OR_LIST.format(unstaffed)} yet.</RosterEmpty>
        </div>
      )}
    </SectionCard>
  );
}

function withSeat(profile: Profile): RosterMember {
  return { ...profile, note: isSiaRole(profile.sia_role) ? SIA_ROLES.labels[profile.sia_role] : null };
}
