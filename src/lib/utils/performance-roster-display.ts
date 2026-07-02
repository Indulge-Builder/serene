import { APP_DOMAINS, GIA_DOMAINS, isGiaDomain } from '@/lib/constants/domains';
import type { AgentRosterRow } from '@/lib/types/index';
import type { AppDomain } from '@/lib/types/database';

/** Matches ManagerPerformancePanel — Gia domains first, then platform domains. */
const PERFORMANCE_ROSTER_DOMAIN_ORDER: AppDomain[] = [
  ...GIA_DOMAINS,
  ...APP_DOMAINS.filter((d) => !isGiaDomain(d)),
];

export type PerformanceRosterGroup = {
  domain: AppDomain;
  agents: AgentRosterRow[];
};

/** Build roster groups the same way the performance page sidebar renders them. */
export function buildPerformanceRosterGroups(
  agents: AgentRosterRow[],
  options: { allDomains: boolean; domain: AppDomain },
): PerformanceRosterGroup[] {
  if (options.allDomains) {
    return PERFORMANCE_ROSTER_DOMAIN_ORDER.filter((d) =>
      agents.some((a) => a.domain === d),
    ).map((d) => ({
      domain: d,
      agents: agents
        .filter((a) => a.domain === d)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    }));
  }
  return [
    {
      domain: options.domain,
      agents: [...agents].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    },
  ];
}

