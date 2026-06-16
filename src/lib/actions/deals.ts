"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { getAssignableUsers } from "@/lib/services/profiles-service";
import { RecordDealSchema, CreateWalkInDealSchema } from "@/lib/validations/deal-schema";
import { formErrors } from "@/lib/validations/form-errors";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { updateLeadStatus } from "@/lib/actions/leads";
import type { ActionResult } from "@/lib/types/index";
import type { AppDomain } from "@/lib/types/database";
import { isGiaDomain, type GiaDomain } from "@/lib/constants/domains";
import { LEAD_ASSIGNABLE_ROLES } from "@/lib/constants/roles";
import {
  DOMAIN_DEAL_CONFIG,
  type DealType,
  type DealCategory,
  type DealDuration,
} from "@/lib/constants/deal-types";

// ─────────────────────────────────────────────
// resolveDealShapeForDomain — THE domain → {type, category, duration} resolver.
//
// deal_type is DERIVED from the domain (DOMAIN_DEAL_CONFIG), never trusted from
// the client. Given the resolved domain plus the form's type-dependent extras
// (membership duration, retail category), this returns the exact triplet to
// write — or an error string when the extras don't match the domain's type:
//   - membership  → duration required, category must be null
//   - retail      → category required (and valid for the domain), duration null
//   - sale        → both null
// Shared by recordDeal (domain from the lead) and createWalkInDeal (domain from
// the form). The DB CHECKs (migration 0122) are the backstop; this is the
// user-facing gate that returns clean copy instead of a raw constraint error.
// ─────────────────────────────────────────────
type DealShapeInput = {
  deal_duration?: DealDuration | null;
  deal_category?: DealCategory | null;
};
type DealShape = {
  deal_type:     DealType;
  deal_duration: DealDuration | null;
  deal_category: DealCategory | null;
};

function resolveDealShapeForDomain(
  domain: GiaDomain,
  input:  DealShapeInput,
): { ok: true; shape: DealShape } | { ok: false; error: string } {
  const config   = DOMAIN_DEAL_CONFIG[domain];
  const dealType = config.type;

  if (dealType === "membership") {
    if (!input.deal_duration) {
      return { ok: false, error: "Please select a membership duration." };
    }
    return {
      ok: true,
      shape: { deal_type: dealType, deal_duration: input.deal_duration, deal_category: null },
    };
  }

  if (dealType === "retail") {
    if (!input.deal_category) {
      return { ok: false, error: "Please select a product category." };
    }
    if (!config.categories?.includes(input.deal_category)) {
      return { ok: false, error: "That product category is not valid for this domain." };
    }
    return {
      ok: true,
      shape: { deal_type: dealType, deal_duration: null, deal_category: input.deal_category },
    };
  }

  // sale (house / legacy) — no duration, no category
  return {
    ok: true,
    shape: { deal_type: dealType, deal_duration: null, deal_category: null },
  };
}

// ─────────────────────────────────────────────
// Action: recordDeal (lead → deal path)
//
// Called by StatusActionPanel after Won confirmation (WonDealModal).
// Flow: validate → fetch lead + access check → INSERT deals row (admin client) →
//       updateLeadStatus('won') which handles all side-effects.
// Order guarantee: deal insert must succeed before status flip. If insert fails,
// status is NOT flipped. If status flip fails, the orphaned deal row is harmless
// (no lead is marked won, so it won't appear on /deals via the role-scoped query).
// ─────────────────────────────────────────────
export async function recordDeal(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  // S-01: Zod validation first line
  const parsed = RecordDealSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { data: null, error: first?.message ?? formErrors.generic };
  }

  const { leadId, deal_duration, deal_category, deal_amount } = parsed.data;

  // S-06: auth + access check
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const admin = createAdminClient();

  // Fetch lead for access check + contact data
  const { data: lead } = await admin
    .from("leads")
    .select("id, status, assigned_to, domain, first_name, last_name, phone, email, slug")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // deal_type is DERIVED from the lead's domain — never client-supplied.
  if (!isGiaDomain(lead.domain as string)) {
    return { data: null, error: "Deals can only be recorded for Gia-domain leads." };
  }
  const resolved = resolveDealShapeForDomain(lead.domain as GiaDomain, {
    deal_duration,
    deal_category,
  });
  if (!resolved.ok) return { data: null, error: resolved.error };

  // S-02: sanitise free text; S-03: phone is already E.164 on the lead row
  const contactName = sanitizeText(
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Unknown",
  );

  // Step 1: Insert deals row (must succeed before status flip)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (admin as any).from("deals").insert({
    lead_id:       leadId,
    contact_name:  contactName,
    contact_phone: lead.phone ?? "",
    contact_email: lead.email ?? null,
    domain:        lead.domain as AppDomain,
    deal_amount,
    deal_type:     resolved.shape.deal_type,
    deal_duration: resolved.shape.deal_duration,
    deal_category: resolved.shape.deal_category,
    assigned_to:   lead.assigned_to ?? null,
    won_at:        new Date().toISOString(),
  });

  if (insertError) return { data: null, error: formErrors.generic };

  // Step 2: Flip lead to won — delegates all side-effects (notifications, SLA, Redis, revalidation)
  return updateLeadStatus({ leadId, status: "won" });
}

// ─────────────────────────────────────────────
// Action: createWalkInDeal (no lead — direct / walk-in sales)
//
// Creates a standalone deals row with lead_id = null.
// Agent: domain + assigned_to always forced to caller's own values (server-side, like createManualLead).
// Manager+: may pick domain (within Gia domains) and assignee.
// ─────────────────────────────────────────────
export async function createWalkInDeal(
  input: unknown,
): Promise<ActionResult<{ dealId: string }>> {
  // S-01: Zod validation first line
  const parsed = CreateWalkInDealSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { data: null, error: first?.message ?? formErrors.generic };
  }

  const data = parsed.data;

  // S-06: auth
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // Domain + assignee enforcement (mirrors createManualLead rule)
  let finalDomain     = data.domain as AppDomain;
  let finalAssignedTo = data.assigned_to ?? null;

  if (caller.role === "agent") {
    // Agent: always locked to own domain and assigned to self
    finalDomain     = caller.domain;
    finalAssignedTo = caller.id;
  } else if (caller.role === "manager") {
    // Manager: domain locked to their own domain
    finalDomain = caller.domain;
    // assigned_to may be any lead-carrier (agent or manager) in their domain — verify
    if (finalAssignedTo) {
      const assignees = await getAssignableUsers({ domain: caller.domain, roles: LEAD_ASSIGNABLE_ROLES });
      if (!assignees.some((a) => a.id === finalAssignedTo)) {
        return { data: null, error: "Selected assignee is not in your domain." };
      }
    }
  } else {
    // Admin/founder: validate domain is a Gia domain
    if (!isGiaDomain(finalDomain)) {
      return { data: null, error: "Invalid domain." };
    }
    // Verify assignee is in the chosen domain if provided
    if (finalAssignedTo) {
      const assignees = await getAssignableUsers({ domain: finalDomain, roles: LEAD_ASSIGNABLE_ROLES });
      if (!assignees.some((a) => a.id === finalAssignedTo)) {
        return { data: null, error: "Selected assignee is not in the chosen domain." };
      }
    }
  }

  // deal_type is DERIVED from the (server-resolved) domain — never client-supplied.
  // Admin/founder were validated above; defensively re-assert Gia for agent/manager
  // (caller.domain is AppDomain — a non-Gia manager has no deal config).
  if (!isGiaDomain(finalDomain)) {
    return { data: null, error: "Deals can only be recorded for Gia domains." };
  }
  const resolved = resolveDealShapeForDomain(finalDomain as GiaDomain, {
    deal_duration: data.deal_duration,
    deal_category: data.deal_category,
  });
  if (!resolved.ok) return { data: null, error: resolved.error };

  // S-03: normalise phone to E.164
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeToE164(data.contact_phone);
  } catch {
    return { data: null, error: "Please enter a valid phone number in international format." };
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (admin as any)
    .from("deals")
    .insert({
      lead_id:       null,
      client_id:     null,
      contact_name:  data.contact_name,
      contact_phone: normalizedPhone,
      contact_email: data.contact_email ?? null,
      domain:        finalDomain,
      source:        data.source ?? null,
      deal_amount:   data.deal_amount,
      deal_type:     resolved.shape.deal_type,
      deal_duration: resolved.shape.deal_duration,
      deal_category: resolved.shape.deal_category,
      assigned_to:   finalAssignedTo,
      won_at:        data.won_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) return { data: null, error: formErrors.generic };

  return { data: { dealId: (inserted as { id: string }).id }, error: null };
}

// ─────────────────────────────────────────────
// Read action: list active agents for a domain (for NewDealModal assignee picker)
// Thin wrapper — client components import the action, never the service (A-15).
// ─────────────────────────────────────────────
export async function listAgentsForDealDomain(
  domain: string,
): Promise<ActionResult<{ id: string; full_name: string }[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  if (!isGiaDomain(domain as AppDomain)) {
    return { data: null, error: "Invalid domain." };
  }

  // Agent: may only see their own domain's agents
  if (caller.role === "agent" && domain !== caller.domain) {
    return { data: null, error: formErrors.unauthorized };
  }

  // Manager: may only see their own domain's agents
  if (caller.role === "manager" && domain !== caller.domain) {
    return { data: null, error: formErrors.unauthorized };
  }

  const agents = await getAssignableUsers({ domain: domain as AppDomain, roles: LEAD_ASSIGNABLE_ROLES });
  return { data: agents, error: null };
}
