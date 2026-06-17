import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectAdapter } from '@/lib/leads/adapters';
import { resolveDomainFromCampaign, DEFAULT_LEAD_DOMAIN } from '@/lib/constants/campaign-domain-map';
import { isGiaDomain, DEFAULT_GIA_DOMAIN } from '@/lib/constants/domains';
import { getNextRoundRobinAgent } from '@/lib/services/leads-service';
import { LEAD_SOURCE_ENUM, type LeadSource } from '@/lib/constants/lead-sources';
import { getDomainInterests } from '@/lib/constants/interests';
import { canonicalizePhone } from '@/lib/utils/phone';
import { invalidateLeadCaches } from '@/lib/services/lead-cache';
import type { Database, AppDomain, JsonValue } from '@/lib/types/database';

// PostgreSQL unique-violation — thrown by the active-phone partial UNIQUE index
// (migration 0137) when a concurrent insert races dedup. Caught so the loser of
// the race returns the existing active lead instead of erroring (audit #1/#2).
const PG_UNIQUE_VIOLATION = '23505';

type LeadInsert = Database['public']['Tables']['leads']['Insert'];

// Keys inside Pabbly multi-step envelopes that must never be persisted.
// res2 from Meta payloads contains a live Facebook page access token.
const SENSITIVE_ENVELOPE_KEYS: ReadonlySet<string> = new Set(['res2']);

export function sanitizeRawPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const cleaned = { ...(payload as Record<string, unknown>) };

  // Strip at top level
  for (const key of SENSITIVE_ENVELOPE_KEYS) {
    if (key in cleaned) delete cleaned[key];
  }

  // Strip inside raw_data (Pabbly wraps the full Meta envelope here)
  if (cleaned.raw_data && typeof cleaned.raw_data === 'object' && !Array.isArray(cleaned.raw_data)) {
    const inner = { ...(cleaned.raw_data as Record<string, unknown>) };
    for (const key of SENSITIVE_ENVELOPE_KEYS) {
      if (key in inner) delete inner[key];
    }
    cleaned.raw_data = inner;
  }

  return cleaned;
}

// ─────────────────────────────────────────────
// Service interests — best-effort parse from form_data (call-intelligence §5).
// NEVER throws and never blocks an ingest: a garbage interest string yields []
// and the lead INSERT proceeds untouched. Unknown values are dropped, not
// rejected, against the DOMAIN_INTERESTS vocabulary for the lead's domain.
// Writes text[] — never the service_category enum.
// ─────────────────────────────────────────────
export function extractServiceInterests(
  formData: Record<string, unknown> | null | undefined,
  domain: string,
): string[] {
  try {
    const raw =
      formData?.['interest'] ?? formData?.['interests'] ?? formData?.['service_interest'] ?? '';
    const candidates =
      typeof raw === 'string'
        ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        : Array.isArray(raw)
          ? raw.map(String).map((s) => s.trim().toLowerCase()).filter(Boolean)
          : [];

    const valid = getDomainInterests(domain);
    return [...new Set(candidates.filter((c) => valid.includes(c)))];
  } catch {
    return [];
  }
}

export type IngestionResult =
  | { success: true; leadId: string; rawPayloadId: string; assigned_to: string | null; agent_name: string | null; domain: string; lead_name: string; lead_phone: string; is_duplicate: boolean }
  | { success: false; error: string; status: 400 | 401 | 422 | 500 };

// ─────────────────────────────────────────────
// Normalized payload schema — all fields optional; passthrough preserves extras.
// Adapters guarantee field presence; this schema is a safety net.
// ─────────────────────────────────────────────
// source is validated at the webhook route before this is called — use hard enum, not .catch(null).
const leadPayloadSchema = z.object({
  first_name:   z.string().default('Unknown'),
  last_name:    z.string().nullable().optional(),
  email:        z.string().nullable().optional(),
  phone:        z.string().default(''),
  source:       z.enum(LEAD_SOURCE_ENUM),
  medium:       z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
  domain:       z.string().nullable().optional(),
  attribution:  z.record(z.string(), z.unknown()).nullable().optional(),
  form_data:    z.record(z.string(), z.unknown()).default({}),
}).passthrough();

// ─────────────────────────────────────────────
// Mark a raw payload log row as failed.
// Called whenever ingestion errors after the row was already inserted.
// Non-throwing — a logging update failure must never mask the real error.
// ─────────────────────────────────────────────
async function markIngestionError(rawPayloadId: string | null, reason: string): Promise<void> {
  if (!rawPayloadId) return;
  try {
    const supabase = createAdminClient();
    await supabase
      .from('lead_raw_payloads')
      .update({ ingestion_error: reason })
      .eq('id', rawPayloadId);
  } catch {
    console.error('[lead-ingestion] Failed to mark ingestion_error:', reason);
  }
}

// ─────────────────────────────────────────────
// Main ingestion entry point — called by webhook route.
// rawPayloadId is the id of the already-logged lead_raw_payloads row.
// The webhook route is responsible for logging before calling this.
// ─────────────────────────────────────────────
export async function ingestLead(
  rawPayload: unknown,
  source: LeadSource,
  rawPayloadId: string | null,
): Promise<IngestionResult> {
  const supabase = createAdminClient();

  // 1. Normalize via source adapter (adapter never sets source — it comes from the URL param)
  const normalized = selectAdapter(source)(rawPayload);

  // 2. Validate — inject the pre-validated source so the schema can enforce the enum
  const parsed = leadPayloadSchema.safeParse({ ...normalized, source });
  if (!parsed.success) {
    console.error('[lead-ingestion] Validation failed:', JSON.stringify(parsed.error.issues));
    await markIngestionError(rawPayloadId, 'validation_failed');
    return { success: false, error: 'Invalid payload', status: 422 };
  }

  const data = parsed.data;

  // 3. Domain: explicit payload value takes precedence over campaign mapping.
  //    data.domain is untrusted free-form text (raw form field) and the campaign
  //    map can resolve to a non-Gia domain (e.g. b2b) the leads pipeline does not
  //    handle. Coerce any non-Gia result to DEFAULT_GIA_DOMAIN so both ingestion
  //    paths agree on the Gia-only valid-domain set (audit #12/#13 — manual
  //    creation already enforces GIA_DOMAIN_ENUM). The leads.domain app_domain
  //    CHECK is the backstop on the INSERT.
  const resolvedDomain = data.domain ?? resolveDomainFromCampaign(data.utm_campaign ?? null);
  const domain: AppDomain = isGiaDomain(resolvedDomain) ? resolvedDomain : DEFAULT_GIA_DOMAIN;

  if (domain === DEFAULT_LEAD_DOMAIN && data.utm_campaign && !isGiaDomain(resolvedDomain)) {
    console.warn(
      `[lead-ingestion] Non-Gia domain "${resolvedDomain}" from campaign "${data.utm_campaign}" — coerced to ${DEFAULT_GIA_DOMAIN}`,
    );
  } else if (domain === DEFAULT_LEAD_DOMAIN && data.utm_campaign) {
    console.warn(`[lead-ingestion] Unknown campaign prefix: ${data.utm_campaign}`);
  }

  // 4. Dedup check — phone is the identity key (migration 0008)
  //    Active statuses: new | touched | in_discussion | nurturing → log duplicate_submission, no insert
  //    Terminal statuses: lost | junk | won → allow new lead with previous_lead_id chain
  //
  //    canonicalizePhone makes the stored value consistent across paths (E.164
  //    when parseable, else digits-only) so dedup and the 0137 unique index can
  //    never miss a format variant (audit #3/#7). An empty phone is NOT a valid
  //    lead identity (phone is the required dedup key) — reject rather than insert
  //    a blank-phone lead that dedup would forever miss (audit #4/#7).
  const phone = canonicalizePhone(data.phone);
  if (!phone) {
    console.error('[lead-ingestion] Empty/unusable phone after canonicalization');
    await markIngestionError(rawPayloadId, 'empty_phone');
    return { success: false, error: 'Lead has no usable phone number', status: 422 };
  }
  let previousLeadId: string | null = null;

  if (phone) {
    const { data: existingLeads } = await supabase.rpc('get_active_lead_by_phone', {
      p_phone: phone,
    });

    if (existingLeads && existingLeads.length > 0) {
      const existing = existingLeads[0];
      const activeStatuses = ['new', 'touched', 'in_discussion', 'nurturing'];

      if (activeStatuses.includes(existing.status)) {
        // Log a duplicate_submission activity on the existing lead — non-fatal,
        // but surface failures so a silently-missing re-enquiry is detectable (audit #25).
        const { error: dupActivityError } = await supabase.from('lead_activities').insert({
          lead_id:     existing.id,
          actor_id:    null,
          action_type: 'duplicate_submission',
          details: {
            source:         source,
            utm_campaign:   data.utm_campaign ?? null,
            domain,
            raw_payload_id: rawPayloadId,
          },
        });
        if (dupActivityError) {
          console.error('[lead-ingestion] duplicate_submission activity insert failed:', dupActivityError.message);
        }

        if (rawPayloadId) {
          await supabase
            .from('lead_raw_payloads')
            .update({ lead_id: existing.id })
            .eq('id', rawPayloadId);
        }

        return {
          success:      true,
          leadId:       existing.id,
          rawPayloadId: rawPayloadId ?? '',
          assigned_to:  existing.assigned_to,
          agent_name:   null,
          domain,
          lead_name:    data.last_name ? `${data.first_name} ${data.last_name}` : data.first_name,
          lead_phone:   phone,
          is_duplicate: true,
        };
      }

      // Terminal lead exists — new lead is a returning prospect; link the chain
      previousLeadId = existing.id;
    }
  }

  // 5. Round-robin agent assignment
  const assignedTo = await getNextRoundRobinAgent(domain);

  // Fetch agent name for notifications — one query, non-fatal if absent
  let assignedAgentName: string | null = null;
  if (assignedTo) {
    const { data: agentProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', assignedTo)
      .single();
    assignedAgentName = agentProfile?.full_name ?? null;
  }

  // 6. Insert lead via admin (service role — bypasses RLS)
  //    Extract city from form_data if present (Meta forms sometimes include it).
  //    Remove it from form_data so it isn't duplicated in both places.
  const formDataRaw = { ...(data.form_data ?? {}) };
  const cityFromForm = typeof formDataRaw.city === 'string' && formDataRaw.city.trim()
    ? formDataRaw.city.trim()
    : null;
  if (cityFromForm) delete formDataRaw.city;

  // attribution: full UTM/platform snapshot, written exactly once at INSERT and
  // never updated (see COMMENT on public.leads.attribution, migration 0096).
  // Built only from fields present on NormalizedLeadPayload — the adapter-built
  // `attribution` object (platform, campaign_id, ad_name, adset_name) plus the
  // top-level UTM columns the payload carries (utm_medium via `medium`,
  // utm_campaign). Absent fields are stored as null, not omitted, so the JSONB
  // shape is consistent across every source. Minimum value is {} — never SQL NULL.
  const attributionSnapshot: Record<string, unknown> = {
    ...(data.attribution ?? {}),
    utm_medium:   data.medium ?? null,
    utm_campaign: data.utm_campaign ?? null,
  };

  // Best-effort interest capture — can never fail or delay the INSERT.
  // The interest key stays in form_data (immutable-after-insert convention).
  const serviceInterests = extractServiceInterests(formDataRaw, domain);

  const leadInsert: LeadInsert = {
    first_name:         data.first_name,
    last_name:          data.last_name ?? null,
    email:              data.email ?? null,
    phone,
    previous_lead_id:   previousLeadId,
    domain,
    assigned_to:        assignedTo ?? null,
    assigned_at:        assignedTo ? new Date().toISOString() : null,
    status:             'new',
    lead_intent:        null,
    source:             data.source ?? null,
    medium:             data.medium ?? null,
    utm_campaign:       data.utm_campaign ?? null,
    attribution:        attributionSnapshot as JsonValue,
    city:               cityFromForm,
    service_interests:  serviceInterests,
    form_data:          formDataRaw as JsonValue,
    last_call_outcome:  null,
    personal_details:   null,
    archived_at:        null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(leadInsert)
    .select('id')
    .single();

  if (insertError || !inserted) {
    // 23505 = the active-phone unique index (0137) rejected a concurrent insert
    // that raced past dedup (audit #1). The other submission won — re-read and
    // return its lead as a duplicate rather than failing this request.
    if (insertError?.code === PG_UNIQUE_VIOLATION) {
      console.warn('[lead-ingestion] active-phone race lost (23505) — returning existing lead');
      const { data: raced } = await supabase.rpc('get_active_lead_by_phone', { p_phone: phone });
      if (raced && raced.length > 0) {
        const existing = raced[0];
        if (rawPayloadId) {
          await supabase.from('lead_raw_payloads').update({ lead_id: existing.id }).eq('id', rawPayloadId);
        }
        return {
          success:      true,
          leadId:       existing.id,
          rawPayloadId: rawPayloadId ?? '',
          assigned_to:  existing.assigned_to,
          agent_name:   null,
          domain,
          lead_name:    data.last_name ? `${data.first_name} ${data.last_name}` : data.first_name,
          lead_phone:   phone,
          is_duplicate: true,
        };
      }
    }
    console.error('[lead-ingestion] Insert failed:', insertError?.message);
    await markIngestionError(rawPayloadId, `db_insert_failed: ${insertError?.message ?? 'unknown'}`);
    return { success: false, error: 'Failed to create lead', status: 500 };
  }

  const leadId = inserted.id;

  // 7. Backfill lead_id on the raw payload log now that the lead row exists
  if (rawPayloadId) {
    await supabase
      .from('lead_raw_payloads')
      .update({ lead_id: leadId })
      .eq('id', rawPayloadId);
  }

  // 8. Log lead_created activity — error-checked so a missing creation event in
  //    the dossier timeline is surfaced, not silent (audit #9/#10/#11). Non-fatal:
  //    the lead row is the source of truth and must stand even if the log fails.
  const { error: createdActivityError } = await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    null,
    action_type: 'lead_created',
    details: {
      source,
      campaign:       data.utm_campaign ?? null,
      domain,
      raw_payload_id: rawPayloadId,
    },
  });
  if (createdActivityError) {
    console.error('[lead-ingestion] lead_created activity insert failed:', createdActivityError.message);
    await markIngestionError(rawPayloadId, `activity_insert_failed: ${createdActivityError.message}`);
  }

  // 9. Log agent_assigned activity if an agent was found
  if (assignedTo) {
    const { error: assignedActivityError } = await supabase.from('lead_activities').insert({
      lead_id:     leadId,
      actor_id:    null,
      action_type: 'agent_assigned',
      details: {
        assigned_to: assignedTo,
        method:      'round_robin',
      },
    });
    if (assignedActivityError) {
      console.error('[lead-ingestion] agent_assigned activity insert failed:', assignedActivityError.message);
    }
  }

  // 10. Invalidate the leads list + dashboard caches so the assigned agent sees
  //     the new lead immediately instead of after the 30s list TTL (audit #8 —
  //     previously only the manual path did this). Awaited inside the webhook
  //     route's lifecycle; Redis failure is non-fatal (the helper warns).
  await invalidateLeadCaches(
    'ingestLead',
    { leadId, domain },
    { lists: true, dashboard: true },
  );

  const ingestionLeadName = data.last_name
    ? `${data.first_name} ${data.last_name}`
    : data.first_name;

  return {
    success:      true,
    leadId,
    rawPayloadId: rawPayloadId ?? '',
    assigned_to:  assignedTo ?? null,
    agent_name:   assignedAgentName,
    domain,
    lead_name:    ingestionLeadName,
    lead_phone:   phone,
    is_duplicate: false,
  };
}

// ─────────────────────────────────────────────
// WhatsApp lead creation
// Called by whatsapp-ingestion.ts when an inbound message arrives from an unknown number.
//
// DOMAIN DECISION (2026-06-05, intentional): all WhatsApp leads are hardcoded to
// DEFAULT_LEAD_DOMAIN ("onboarding"). WhatsApp messages carry no UTM/campaign data,
// so campaign-based domain resolution (resolveDomainFromCampaign) is impossible here.
// If multi-domain WhatsApp routing is ever needed, extend this function to accept a
// domain parameter and update the webhook routing logic in whatsapp-ingestion.ts.
//
// Dedup is the caller's responsibility (resolveLeadByPhone runs first), but two
// distinct first-messages from the same new number can race past that read and
// both reach here (audit #2). The active-phone UNIQUE index (0137) is the
// backstop: the loser gets 23505, which we catch and resolve to the existing
// active lead — and we flag it via `alreadyExisted` so the caller skips the
// duplicate assignment notification.
// ─────────────────────────────────────────────
export async function createLeadFromWhatsApp(
  waId:        string,
  phone:       string,
  senderName?: string | null,
): Promise<{ leadId: string; assignedTo: string | null; assignedAt: string | null; domain: string; alreadyExisted: boolean }> {
  const supabase = createAdminClient();
  const domain   = DEFAULT_LEAD_DOMAIN;

  // Canonicalize so the stored value matches the manual/webhook paths and the
  // 0137 unique index keys consistently. The caller already normalizes via
  // normalizeWaPhone; this is idempotent on an E.164 value.
  const canonicalPhone = canonicalizePhone(phone);

  const assignedTo = await getNextRoundRobinAgent(domain);
  const assignedAt = assignedTo ? new Date().toISOString() : null;

  const nameParts  = senderName?.split(' ') ?? [];
  // first_name must never be empty (a blank sender name yields ['']) — fall back
  // to the phone so slug generation and the dossier header always have a value (audit #22).
  const first_name = (nameParts[0]?.trim() || canonicalPhone || phone);
  const last_name  = nameParts.slice(1).join(' ').trim() || null;

  const { data: inserted, error } = await supabase
    .from('leads')
    .insert({
      first_name,
      last_name,
      email:              null,
      phone:              canonicalPhone,
      domain,
      assigned_to:        assignedTo ?? null,
      assigned_at:        assignedAt,
      status:             'new',
      lead_intent:        null,
      source:             'whatsapp',
      medium:             null,
      utm_campaign:       null,
      attribution:        { platform: 'whatsapp' },
      city:               null,
      // WhatsApp messages carry no form data — same best-effort path, always [].
      service_interests:  extractServiceInterests({}, domain),
      form_data:          {},
      last_call_outcome:  null,
      personal_details:   null,
      archived_at:        null,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    // Lost the active-phone race — resolve to the existing active lead instead
    // of throwing and losing the inbound message (audit #2/#12).
    if (error?.code === PG_UNIQUE_VIOLATION) {
      const { data: raced } = await supabase.rpc('get_active_lead_by_phone', { p_phone: canonicalPhone });
      if (raced && raced.length > 0) {
        return { leadId: raced[0].id, assignedTo: raced[0].assigned_to, assignedAt: null, domain, alreadyExisted: true };
      }
    }
    throw new Error(`[createLeadFromWhatsApp] Insert failed: ${error?.message ?? 'unknown'}`);
  }

  const leadId = inserted.id;

  const { error: createdActivityError } = await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    null,
    action_type: 'lead_created',
    details:     { source: 'whatsapp', domain, wa_id: waId },
  });
  if (createdActivityError) {
    console.error('[createLeadFromWhatsApp] lead_created activity insert failed:', createdActivityError.message);
  }

  if (assignedTo) {
    const { error: assignedActivityError } = await supabase.from('lead_activities').insert({
      lead_id:     leadId,
      actor_id:    null,
      action_type: 'agent_assigned',
      details:     { assigned_to: assignedTo, method: 'round_robin' },
    });
    if (assignedActivityError) {
      console.error('[createLeadFromWhatsApp] agent_assigned activity insert failed:', assignedActivityError.message);
    }
  }

  return { leadId, assignedTo, assignedAt, domain, alreadyExisted: false };
}
