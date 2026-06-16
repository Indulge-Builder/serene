import type { UserRole } from "@/lib/types/database";

export const USER_ROLES: UserRole[] = [
  'founder',
  'admin',
  'manager',
  'agent',
  'guest',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  founder: 'Founder',
  admin:   'Admin',
  manager: 'Manager',
  agent:   'Agent',
  guest:   'Guest',
};

/** Roles that can create users */
export const ROLES_CAN_CREATE_USER: UserRole[] = ['founder', 'admin'];

/** Roles with full cross-domain access */
export const ROLES_GLOBAL_ACCESS: UserRole[] = ['founder', 'admin'];

/**
 * Roles a lead or deal may be assigned to (the lead/deal worklist pool).
 * Managers carry and call leads alongside agents, so they belong in every
 * "Assign to" picker. Admins/founders are not lead-carriers and stay out.
 * THE single source for the lead/deal assignment role set — never hardcode
 * `['agent', 'manager']` at a call site; pass this to getAssignableUsers({ roles }).
 *
 * This is ALSO the round-robin routing pool — managers receive auto-assigned
 * leads in the same fair queue as agents (`getNextRoundRobinAgent`,
 * `get_next_round_robin_agent` SQL, the `agent_routing_config` auto-create
 * trigger, and the Settings roster all gate on this exact set). `ROUTING_POOL_ROLES`
 * is the routing-context alias; both point at the same list by design — never
 * fork a second pool set (R-01).
 */
export const LEAD_ASSIGNABLE_ROLES: UserRole[] = ['agent', 'manager'];

/**
 * The round-robin / shift-config routing pool roles. Alias of
 * {@link LEAD_ASSIGNABLE_ROLES} — same membership (agents + managers), named
 * for the routing/settings call sites so intent reads clearly. The SQL function
 * + trigger mirror this literal list (`role IN ('agent','manager')`); keep them
 * in sync if this ever changes.
 */
export const ROUTING_POOL_ROLES = LEAD_ASSIGNABLE_ROLES;
