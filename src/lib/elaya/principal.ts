// Elaya principal resolver — identity → role + persona + permitted toolset.
//
// Every tool execution carries an ElayaPrincipal derived from the VERIFIED
// session profile (requireProfile / getCurrentProfile — A-01), never from
// model output or request payloads. Tools execute as this principal: identity
// args (userId/role/domain) passed to services are always principal-derived;
// the model only ever supplies filter values. Authorization is enforced in the
// tool layer + RLS — NEVER prompt-only.

import type { Profile, UserRole, AppDomain } from '@/lib/types';
import type { ElayaToolName } from '@/lib/elaya/tools/registry';
import { TOOLSET_BY_ROLE } from '@/lib/elaya/tools/registry';

export type ElayaPersona = 'staff' | 'customer';

export type ElayaPrincipal = {
  kind: 'staff';
  persona: 'staff';
  userId: string;
  role: UserRole;
  domain: AppDomain;
  displayName: string;
  toolset: readonly ElayaToolName[];
};

/** Staff persona — the only persona in the foundation phase. */
export function resolveStaffPrincipal(profile: Profile): ElayaPrincipal {
  return {
    kind: 'staff',
    persona: 'staff',
    userId: profile.id,
    role: profile.role,
    domain: profile.domain,
    displayName: profile.full_name,
    toolset: TOOLSET_BY_ROLE[profile.role],
  };
}

/**
 * Customer persona — STUB. The WhatsApp customer channel (later phase) resolves
 * a customer identity to a narrow, lead-scoped toolset here. Deliberately
 * throws so no code path can accidentally run a customer turn today.
 */
export function resolveCustomerPrincipal(): never {
  throw new Error('[elaya-principal] customer persona is not implemented yet');
}
