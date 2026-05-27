import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectAdapter } from '@/lib/leads/adapters';
import { resolveDomainFromCampaign, DEFAULT_LEAD_DOMAIN } from '@/lib/constants/campaign-domain-map';
import { getNextRoundRobinAgent } from '@/lib/services/leads-service';
import type { Database } from '@/lib/types/database';

type LeadInsert = Database['public']['Tables']['leads']['Insert'];

export type IngestionResult =
  | { success: true; leadId: string; rawPayloadId: string }
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
// Main ingestion entry point — called by webhook route
// ─────────────────────────────────────────────
export async function ingestLead(rawPayload: unknown, source: string): Promise<IngestionResult> {
  const supabase = createAdminClient();

  // 1. Log the raw payload verbatim — before any extraction or validation.
  //    lead_id is null here; we backfill it after the lead row is created.
  const { data: rawLog, error: rawLogError } = await supabase
    .from('lead_raw_payloads')
    .insert({
      source,
      payload: rawPayload as Record<string, unknown>,
      lead_id: null,
    })
    .select('id')
    .single();

  if (rawLogError || !rawLog) {
    console.error('[lead-ingestion] Failed to log raw payload:', rawLogError?.message);
    // Non-fatal: we still attempt ingestion. Logging failure should never block a lead.
  }

  const rawPayloadId = rawLog?.id ?? null;

  // 2. Normalize via source adapter
  const normalized = selectAdapter(source)(rawPayload);

  // 2. Validate
  const parsed = leadPayloadSchema.safeParse(normalized);
  if (!parsed.success) {
    console.error('[lead-ingestion] Validation failed:', JSON.stringify(parsed.error.issues));
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
    archived_at:        null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(leadInsert)
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[lead-ingestion] Insert failed:', insertError?.message);
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

  // 8. Log lead_created activity
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

  // 9. Log agent_assigned activity if an agent was found
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

  return { success: true, leadId, rawPayloadId: rawPayloadId ?? '' };
}
