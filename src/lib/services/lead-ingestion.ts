import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectAdapter } from '@/lib/leads/adapters';
import { resolveDomainFromCampaign, DEFAULT_LEAD_DOMAIN } from '@/lib/constants/campaign-domain-map';
import { getNextRoundRobinAgent } from '@/lib/services/leads-service';
import type { Database } from '@/lib/types/database';

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

export type IngestionResult =
  | { success: true; leadId: string; rawPayloadId: string; assigned_to: string | null; agent_name: string | null; domain: string; lead_name: string; lead_phone: string }
  | { success: false; error: string; status: 400 | 401 | 422 | 500 };

// ─────────────────────────────────────────────
// Normalized payload schema — all fields optional; passthrough preserves extras.
// Adapters guarantee field presence; this schema is a safety net.
// ─────────────────────────────────────────────
const leadPayloadSchema = z.object({
  first_name:   z.string().default('Unknown'),
  last_name:    z.string().nullable().optional(),
  email:        z.string().nullable().optional(),
  phone:        z.string().default(''),
  platform:     z.enum(['meta', 'google', 'website', 'whatsapp']).optional(),
  campaign_id:  z.string().nullable().optional(),
  ad_name:      z.string().nullable().optional(),
  domain:       z.string().nullable().optional(),
  utm_source:   z.string().nullable().optional(),
  utm_medium:   z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
  utm_content:  z.string().nullable().optional(),
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
  source: string,
  rawPayloadId: string | null,
): Promise<IngestionResult> {
  const supabase = createAdminClient();

  // 1. Normalize via source adapter
  const normalized = selectAdapter(source)(rawPayload);

  // 2. Validate
  const parsed = leadPayloadSchema.safeParse(normalized);
  if (!parsed.success) {
    console.error('[lead-ingestion] Validation failed:', JSON.stringify(parsed.error.issues));
    await markIngestionError(rawPayloadId, 'validation_failed');
    return { success: false, error: 'Invalid payload', status: 422 };
  }

  const data = parsed.data;

  // 3. Domain: explicit payload value takes precedence over campaign mapping
  const domain = data.domain ?? resolveDomainFromCampaign(data.utm_campaign ?? null);

  if (domain === DEFAULT_LEAD_DOMAIN && data.utm_campaign) {
    console.warn(`[lead-ingestion] Unknown campaign prefix: ${data.utm_campaign}`);
  }

  // 4. Round-robin agent assignment
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

  // 5. Insert lead via admin (service role — bypasses RLS)
  const leadInsert: LeadInsert = {
    first_name:         data.first_name,
    last_name:          data.last_name ?? null,
    email:              data.email ?? null,
    phone:              data.phone,
    domain,
    assigned_to:        assignedTo ?? null,
    assigned_at:        assignedTo ? new Date().toISOString() : null,
    status:             'new',
    lead_intent:        null,
    platform:           data.platform ?? null,
    campaign_id:        data.campaign_id ?? null,
    ad_name:            data.ad_name ?? null,
    utm_source:         data.utm_source ?? null,
    utm_medium:         data.utm_medium ?? null,
    utm_campaign:       data.utm_campaign ?? null,
    utm_content:        data.utm_content ?? null,
    form_data:          data.form_data,
    last_call_outcome:  null,
    private_scratchpad: null,
    personal_details:   null,
    archived_at:        null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(leadInsert)
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[lead-ingestion] Insert failed:', insertError?.message);
    await markIngestionError(rawPayloadId, `db_insert_failed: ${insertError?.message ?? 'unknown'}`);
    return { success: false, error: 'Failed to create lead', status: 500 };
  }

  const leadId = inserted.id;

  // 6. Backfill lead_id on the raw payload log now that the lead row exists
  if (rawPayloadId) {
    await supabase
      .from('lead_raw_payloads')
      .update({ lead_id: leadId })
      .eq('id', rawPayloadId);
  }

  // 7. Log lead_created activity
  await supabase.from('lead_activities').insert({
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

  // 8. Log agent_assigned activity if an agent was found
  if (assignedTo) {
    await supabase.from('lead_activities').insert({
      lead_id:     leadId,
      actor_id:    null,
      action_type: 'agent_assigned',
      details: {
        assigned_to: assignedTo,
        method:      'round_robin',
      },
    });
  }

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
    lead_phone:   data.phone,
  };
}

// ─────────────────────────────────────────────
// WhatsApp lead creation
// Called by whatsapp-ingestion.ts when an inbound message arrives from an unknown number.
// Domain defaults to concierge — WhatsApp leads carry no UTM data for campaign resolution.
// Dedup is the caller's responsibility: this function always inserts.
// ─────────────────────────────────────────────
export async function createLeadFromWhatsApp(
  waId:        string,
  phone:       string,
  senderName?: string | null,
): Promise<{ leadId: string; assignedTo: string | null }> {
  const supabase = createAdminClient();
  const domain   = DEFAULT_LEAD_DOMAIN;
  const assignedTo = await getNextRoundRobinAgent(domain);

  const nameParts  = senderName?.split(' ') ?? [];
  const first_name = nameParts[0] ?? phone;
  const last_name  = nameParts.slice(1).join(' ') || null;

  const { data: inserted, error } = await supabase
    .from('leads')
    .insert({
      first_name,
      last_name,
      email:              null,
      phone,
      domain,
      assigned_to:        assignedTo ?? null,
      assigned_at:        assignedTo ? new Date().toISOString() : null,
      status:             'new',
      lead_intent:        null,
      platform:           'whatsapp',
      campaign_id:        null,
      ad_name:            null,
      utm_source:         null,
      utm_medium:         null,
      utm_campaign:       null,
      utm_content:        null,
      form_data:          {},
      last_call_outcome:  null,
      private_scratchpad: null,
      personal_details:   null,
      archived_at:        null,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(`[createLeadFromWhatsApp] Insert failed: ${error?.message ?? 'unknown'}`);
  }

  const leadId = inserted.id;

  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    null,
    action_type: 'lead_created',
    details:     { source: 'whatsapp', domain, wa_id: waId },
  });

  if (assignedTo) {
    await supabase.from('lead_activities').insert({
      lead_id:     leadId,
      actor_id:    null,
      action_type: 'agent_assigned',
      details:     { assigned_to: assignedTo, method: 'round_robin' },
    });
  }

  return { leadId, assignedTo };
}
