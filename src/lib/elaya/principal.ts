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
import { CUSTOMER_TOOLSET, type ElayaCustomerToolName } from '@/lib/elaya/tools/customer-registry';
import type { GiaDomain } from '@/lib/constants/domains';

export type ElayaPersona = 'staff' | 'customer';

// ─────────────────────────────────────────────────────────────────────────
// ElayaPrincipal — a discriminated union. STAFF carries a verified profile +
// the role-gated read∪write toolset. CUSTOMER carries the LEAD identity (not a
// profile) + a HARD-CAPPED customer toolset (KB-send + interest-capture only,
// NO staff/CRM tools). The Golden Rule lives here in CODE: a customer's data
// scope + abilities come from this object, before the model runs — never from
// the prompt or any content the model reads (docs/architecture/elaya-jarvis-
// architecture.md, docs/modules/customer-welcome-blast.md).
// ─────────────────────────────────────────────────────────────────────────

export type StaffPrincipal = {
  kind: 'staff';
  persona: 'staff';
  userId: string;
  role: UserRole;
  domain: AppDomain;
  displayName: string;
  toolset: readonly ElayaToolName[];
};

export type CustomerPrincipal = {
  kind: 'customer';
  persona: 'customer';
  /** The lead row id — the ONLY record a customer turn may touch (its own lead). */
  leadId: string;
  /** The lead's Gia domain — scopes which training assets the customer toolset reads. */
  domain: GiaDomain;
  /** The customer's display name (first name), for a warm greeting. Never staff PII. */
  displayName: string;
  /** Hard-capped: send-company-material + capture-interest. NEVER a staff tool. */
  toolset: readonly ElayaCustomerToolName[];
};

export type ElayaPrincipal = StaffPrincipal | CustomerPrincipal;

/** Staff persona — verified profile → role + the role-gated toolset. */
export function resolveStaffPrincipal(profile: Profile): StaffPrincipal {
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
 * Customer persona (FEATURE 2 — the WhatsApp customer channel). Identity is the
 * LEAD, never a profile. The toolset is the CUSTOMER_TOOLSET constant — a tiny,
 * fixed set that can NEVER read leads/deals/tasks/performance or any staff data
 * (those tools are not in it; the dispatch gate refuses anything outside it).
 * No prompt, no training content, no customer message can widen this — that is
 * the Golden Rule, enforced in code here.
 */
export function resolveCustomerPrincipal(lead: {
  id: string;
  domain: GiaDomain;
  first_name: string | null;
  last_name: string | null;
}): CustomerPrincipal {
  const displayName = (lead.first_name ?? '').trim() || 'there';
  return {
    kind: 'customer',
    persona: 'customer',
    leadId: lead.id,
    domain: lead.domain,
    displayName,
    toolset: CUSTOMER_TOOLSET,
  };
}
