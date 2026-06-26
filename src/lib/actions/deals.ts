"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { getAssignableUsers } from "@/lib/services/profiles-service";
import { createNotification } from "@/lib/services/notifications-service";
import { RecordDealSchema, CreateWalkInDealSchema } from "@/lib/validations/deal-schema";
import { formErrors } from "@/lib/validations/form-errors";
import { normalizeToE164 } from "@/lib/utils/phone";
import { recordDealCore, type MutationActor } from "@/lib/services/lead-mutations";
import type { ActionResult } from "@/lib/types/index";
import type { AppDomain } from "@/lib/types/database";
import { isGiaDomain, type GiaDomain } from "@/lib/constants/domains";
import { LEAD_ASSIGNABLE_ROLES } from "@/lib/constants/roles";
import { resolveDealShapeForDomain } from "@/lib/constants/deal-types";

// ─────────────────────────────────────────────
// notifyDealCreated — fan out a 'deal_created' in-app notification to the active
// managers/admins/founders in the deal's domain. Mirrors the lead_won fan-out in
// lead-mutations.ts. Fire-and-forget, non-fatal — a deal write never fails on a
// notification error. Carries notificationKey:'deal_created' so SEAM A honours
// each recipient's per-user mute (migration 0133).
//
// Only the WALK-IN path calls this. The lead→deal path (recordDeal) flips the lead
// to 'won', whose own lead_won notification already reaches the same recipients —
// firing deal_created there too would double-notify the one event.
// ─────────────────────────────────────────────
async function notifyDealCreated(opts: {
  domain:      AppDomain;
  dealId:      string;
  contactName: string;
  amount:      number;
  byName:      string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from("profiles")
    .select("id")
    .eq("domain", opts.domain)
    .in("role", ["manager", "admin", "founder"])
    .eq("is_active", true);

  if (!recipients || recipients.length === 0) return;

  await Promise.all(
    recipients.map((r: { id: string }) =>
      createNotification({
        recipient_id:    r.id,
        type:            "system",
        notificationKey: "deal_created",  // SEAM A — per-user control plane (0133)
        title:           `New deal — ${opts.contactName}`,
        body:            `Recorded by ${opts.byName}`,
        action_url:      `/deals`,
      }),
    ),
  );
}

// ─────────────────────────────────────────────
// Action: recordDeal (lead → deal path)
//
// Called by StatusActionPanel after Won confirmation (WonDealModal).
// Flow: validate → fetch lead + access check → recordDealCore (INSERT deals row +
//       updateLeadStatusCore('won') side-effects) → revalidatePath.
// recordDealCore is the SHARED body Elaya's log_deal tool also runs (R-01). The
// order guarantee (insert before status flip; orphan-safe on flip failure) lives
// in the core.
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

  // Insert the deal + flip the lead to Won via the shared core (R-01) — the SAME
  // body Elaya's log_deal tool runs. The core derives deal_type from the lead's
  // domain, inserts the deal, then calls updateLeadStatusCore('won') (all the Won
  // side-effects: lead_won fan-out, terminal-SLA cancel, cache invalidation). The
  // action keeps Zod → requireProfile → hasAccess → core → revalidatePath.
  const actor: MutationActor = {
    userId:   caller.id,
    role:     caller.role,
    domain:   caller.domain,
    fullName: caller.full_name,
  };
  const core = await recordDealCore(
    actor,
    { leadId, deal_amount, deal_duration, deal_category },
    {
      lead: {
        id:          lead.id,
        status:      lead.status as string | null,
        domain:      lead.domain as string,
        slug:        lead.slug as string | null,
        first_name:  lead.first_name as string | null,
        last_name:   lead.last_name as string | null,
        phone:       lead.phone as string | null,
        email:       lead.email as string | null,
        assigned_to: lead.assigned_to as string | null,
      },
    },
  );
  if (!core.ok) return { data: null, error: core.error };

  // Bust the /deals route cache — the core's updateLeadStatusCore revalidates
  // nothing (revalidatePath is request-context-only and lives in callers), so the
  // just-inserted deal AND the lead's Won flip both need explicit revalidation here.
  // `type: 'page'` on /deals so the param-bearing URL the deals page redirects
  // cold landings to (?date_from=…&date_to=…) is invalidated too — a pathless
  // call leaves that variant stale (see createWalkInDeal for the full rationale).
  revalidatePath("/deals", "page");
  revalidatePath("/leads");
  revalidatePath(`/leads/${(lead.slug as string | null) ?? leadId}`);

  return { data: { leadId }, error: null };
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

  const { data: inserted, error: insertError } = await admin
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

  const dealId = (inserted as { id: string }).id;

  // Bust the /deals route cache so the new row appears on the next load — the
  // server action is the authoritative invalidation, not the modal's
  // router.refresh() (which only covers the case where the user is already on
  // /deals when they add the deal; a later soft nav back would serve the stale
  // prerendered list). The deals service is not Redis-cached, so this is the
  // only cache layer to clear.
  //
  // `type: 'page'` is REQUIRED here: the deals page force-redirects every cold
  // landing to /deals?date_from=…&date_to=… (the "This Month" default), so the
  // entry the user is actually viewing is keyed on the param-bearing URL, not
  // the bare /deals path. A pathless revalidatePath('/deals') only invalidates
  // the exact '/deals' segment and leaves the param variant stale — the new
  // deal then doesn't surface until the Client Router Cache expires (the "long
  // time" bug). The page variant invalidates the route for all its search-param
  // permutations. (The leads list has no such redirect, which is why the same
  // bare-path call works there.)
  revalidatePath("/deals", "page");

  // Notify domain managers/admins/founders — non-fatal. after() keeps the lambda
  // alive past the response so the in-app insert + push fan-out inside
  // createNotification settles on Vercel (A-16); a bare void would be orphaned.
  after(
    notifyDealCreated({
      domain:      finalDomain,
      dealId,
      contactName: data.contact_name,
      amount:      data.deal_amount,
      byName:      caller.full_name,
    }).catch((err) =>
      console.error("[deals] notifyDealCreated failed (non-fatal):", err),
    ),
  );

  return { data: { dealId }, error: null };
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
