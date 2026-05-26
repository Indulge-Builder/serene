import { createAdminClient } from '@/lib/supabase/admin';
import { LeadWebhookSchema } from '@/lib/validations/lead-schema';
import { resolveDomainFromCampaign, DEFAULT_LEAD_DOMAIN } from '@/lib/constants/campaign-domain-map';
import { getNextRoundRobinAgent } from '@/lib/services/leads-service';
import type { Database } from '@/lib/types/database';

type LeadInsert = Database['public']['Tables']['leads']['Insert'];


export type IngestionResult =
  | { success: true; leadId: string }
  | { success: false; error: string; status: 400 | 401 | 422 | 500 };

// ─────────────────────────────────────────────
// Main ingestion entry point — called by webhook route
// ─────────────────────────────────────────────
export async function ingestLead(rawPayload: unknown): Promise<IngestionResult> {
  // 1. Validate and sanitize
  const parsed = LeadWebhookSchema.safeParse(rawPayload);
  if (!parsed.success) {
    console.error('[lead-ingestion] Validation failed:', JSON.stringify(parsed.error.issues));
    return { success: false, error: 'Invalid payload', status: 422 };
  }

  const data = parsed.data;

  // 2. Full name split: "Priya Sharma" with no last_name → split on first space
  let firstName = data.first_name;
  let lastName = data.last_name;
  if (!lastName && firstName.includes(' ')) {
    const spaceIdx = firstName.indexOf(' ');
    lastName = firstName.slice(spaceIdx + 1);
    firstName = firstName.slice(0, spaceIdx);
  }

  // 3. Domain resolution from campaign prefix
  const domain = resolveDomainFromCampaign(data.utm_campaign ?? null);

  // Log unmatched campaigns (warn — not throw)
  if (domain === DEFAULT_LEAD_DOMAIN && data.utm_campaign) {
    console.warn(`[lead-ingestion] Unknown campaign prefix: ${data.utm_campaign}`);
  }

  // 4. Round-robin agent assignment
  const assignedTo = await getNextRoundRobinAgent(domain);

  // 5. Insert lead via admin (service role — bypasses RLS)
  const supabase = createAdminClient();

  const leadInsert: LeadInsert = {
    first_name:         firstName,
    last_name:          lastName ?? null,
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
    form_data:          data.form_data as Record<string, unknown>,
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

  // 6. Log lead_created activity
  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    null,
    action_type: 'lead_created',
    details: {
      source:   data.platform ?? 'unknown',
      campaign: data.utm_campaign ?? null,
      domain,
    },
  });

  // 7. Log agent_assigned activity if an agent was found
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

  return { success: true, leadId };
}
