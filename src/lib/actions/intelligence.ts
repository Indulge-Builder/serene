'use server';

// Call Intelligence actions.
// getHelpdeskLibraryAction — client-callable read of the full helpdesk
// library (the /helpdesk page itself seeds via RSC; this exists for future
// client refresh paths). upsertServiceCaseAction / upsertConversationHookAction
// — admin/founder writes that own the Redis invalidation contract: every
// service_cases/conversation_hooks write awaits the helpdesk key del
// (try/catch-warn, P-08 convention) before revalidatePath('/helpdesk').

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/actions/_auth';
import { createClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';
import { REDIS_KEYS } from '@/lib/constants/redis-keys';
import { DEFAULT_GIA_DOMAIN, GIA_DOMAIN_ENUM, isGiaDomain } from '@/lib/constants/domains';
import { sanitizeText } from '@/lib/utils/sanitize';
import { formErrors } from '@/lib/validations/form-errors';
import {
  ServiceCaseSchema,
  ConversationHookSchema,
} from '@/lib/validations/intelligence-schemas';
import {
  getHelpdeskLibrary,
  type HelpdeskLibrary,
  type ServiceCase,
  type ConversationHook,
} from '@/lib/services/intelligence-service';
import type { ActionResult } from '@/lib/types';
import type { AppDomain } from '@/lib/types/database';

/** The helpdesk library is domain-scoped; non-Gia callers read the default Gia domain. */
function resolveHelpdeskDomain(domain: AppDomain): AppDomain {
  return isGiaDomain(domain) ? domain : DEFAULT_GIA_DOMAIN;
}

// Optional target domain (the dossier card searches the LEAD's library, which
// may differ from the caller's domain). Harmless to accept from the client:
// the 0110 read RLS is all-authenticated — this only picks which Gia shelf to
// read, never widens access.
const HelpdeskDomainSchema = z.enum(GIA_DOMAIN_ENUM).optional();

export async function getHelpdeskLibraryAction(
  targetDomain?: AppDomain,
): Promise<ActionResult<HelpdeskLibrary>> {
  const parsed = HelpdeskDomainSchema.safeParse(targetDomain);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const library = await getHelpdeskLibrary(
    resolveHelpdeskDomain((parsed.data ?? auth.profile.domain) as AppDomain),
  );
  return { data: library, error: null };
}

async function invalidateHelpdeskCache(domain: string): Promise<void> {
  try {
    await redis.del(REDIS_KEYS.helpdeskCases(domain));
  } catch (e) {
    console.warn('[intelligence-action] redis del failed on helpdesk write', e);
  }
}

export async function upsertServiceCaseAction(
  input: unknown,
): Promise<ActionResult<ServiceCase>> {
  const parsed = ServiceCaseSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const v = parsed.data;
  const row = {
    domain:       v.domain,
    category:     v.category,
    title:        sanitizeText(v.title),
    summary:      sanitizeText(v.summary),
    outcome_note: v.outcome_note ? sanitizeText(v.outcome_note) : null,
    city:         v.city ? sanitizeText(v.city) : null,
    country:      v.country ? sanitizeText(v.country) : null,
    tags:         v.tags,
    is_featured:  v.is_featured,
    sort_order:   v.sort_order,
  };

  // Session client — the admin/founder write RLS on service_cases enforces
  // the same gate as requireProfile (defence in depth, Rule 07).
  const supabase = await createClient();
  const query = v.id
    ? supabase.from('service_cases').update(row).eq('id', v.id)
    : supabase.from('service_cases').insert({ ...row, created_by: auth.profile.id });

  const { data, error } = await query
    .select('id, domain, category, tags, title, summary, outcome_note, city, country, is_featured, sort_order')
    .single();

  if (error || !data) {
    console.error('[intelligence-action] case upsert failed:', error?.message);
    return { data: null, error: formErrors.generic };
  }

  await invalidateHelpdeskCache(v.domain);
  revalidatePath('/helpdesk');
  return { data: data as ServiceCase, error: null };
}

export async function upsertConversationHookAction(
  input: unknown,
): Promise<ActionResult<ConversationHook>> {
  const parsed = ConversationHookSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const v = parsed.data;
  const row = {
    domain:     v.domain,
    category:   v.category,
    hook:       sanitizeText(v.hook),
    context:    v.context ? sanitizeText(v.context) : null,
    sort_order: v.sort_order,
  };

  const supabase = await createClient();
  const query = v.id
    ? supabase.from('conversation_hooks').update(row).eq('id', v.id)
    : supabase.from('conversation_hooks').insert(row);

  const { data, error } = await query
    .select('id, domain, category, hook, context, sort_order')
    .single();

  if (error || !data) {
    console.error('[intelligence-action] hook upsert failed:', error?.message);
    return { data: null, error: formErrors.generic };
  }

  await invalidateHelpdeskCache(v.domain);
  revalidatePath('/helpdesk');
  return { data: data as ConversationHook, error: null };
}
