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
