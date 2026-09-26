// THE schema names and the schema-scoped query helpers (schema restructure, 2026-09-17;
// docs/architecture/schema-restructure-plan.md). A table that lives outside `public`
// is addressed through the helper for its schema, never through an inline
// `.schema('…')` string in a service (R-01). `freshdeskDb()` in freshdesk-sync.ts is
// the same idea bound to the admin client; these take the client so the session
// client (RLS) and the admin client both work.
//
//   const supabase = await createClient();
//   const { data } = await giaDb(supabase).from('leads').select('id');
//
// Lint (eslint.config.mjs) refuses an unscoped `.from('<moved table>')` in src/.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { HandsDatabase } from "@/lib/types/hands";

export const GIA_SCHEMA = "gia" as const;

/** Every table that moved `public` → `gia` (migration 0210). The lint rule reads this list. */
export const GIA_TABLES = [
  "leads",
  "lead_activities",
  "lead_notes",
  "lead_raw_payloads",
  "lead_sla_timers",
  "lead_product_enquiries",
  "deals",
  "sla_policies",
  "agent_routing_config",
  "revival_candidates",
  "revival_policies",
  "domain_targets",
  "ad_creatives",
  "ad_spend_daily",
  "ad_account_recharges",
  "task_gia_meta",
  "whatsapp_conversations",
  "whatsapp_messages",
  "whatsapp_conversation_reads",
  "whatsapp_notification_logs",
  "service_cases",
  "conversation_hooks",
] as const;

/** The Gia schema view of a client. Works for the session client and the admin client. */
export function giaDb(client: SupabaseClient<Database>) {
  return client.schema(GIA_SCHEMA);
}

export const MEMBER_SCHEMA = "member" as const;

/** Every table that moved `public` → `member` (migration 0211). The lint rule reads this list. */
export const MEMBER_TABLES = [
  "members",
  "member_access_log",
  "member_anticipations",
  "member_chunks",
  "member_documents",
  "member_events",
  "member_facts",
  "member_health_events",
  "member_health_policy",
  "member_people",
  "member_relations",
  "member_snapshot",
  "members_list",
] as const;

/** The member schema view of a client. Works for the session client and the admin client. */
export function memberDb(client: SupabaseClient<Database>) {
  return client.schema(MEMBER_SCHEMA);
}

export const HANDS_SCHEMA = "hands" as const;

/** The hands schema (0245): the second WhatsApp number's threads, messages, outbox and allowlist. Admin client
 *  only; the caller gates. Cast onto the hand-declared HandsDatabase until database.ts is regenerated (the
 *  TicketingDatabase posture). */
export function handsDb(client: SupabaseClient<Database>) {
  return (client as unknown as SupabaseClient<HandsDatabase, "hands">).schema(HANDS_SCHEMA);
}

