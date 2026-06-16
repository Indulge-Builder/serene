/**
 * notification-prefs-service.ts — the per-user notification control gate
 * (migration 0133). SERVER ONLY — never import in a client component.
 *
 * THE MODEL: absence = ON. A `notification_preferences` row exists only when a
 * user has muted a channel for a category; no row → both channels on. Every read
 * here FAILS OPEN — a missing row, a malformed value, or a thrown query resolves
 * to "send". A missed lead/SLA notification is operationally worse than an extra
 * one; a half-applied migration or a transient DB error must never silence the org.
 * (This is the inverse of the daily-cap, which fails closed — opposite concern.)
 *
 * THE GATE keys on the SEMANTIC CATEGORY (notification-categories.ts), not the raw
 * notifications.type / whatsapp log type — one event reaches both channels under
 * one category key, so one mute controls both coherently. The two transactional
 * sends (lead_initiation, elaya_reply) have NO category key and never reach here.
 *
 * Reads run on the ADMIN client: the gate fires at notification FAN-OUT time and
 * must read OTHER users' prefs (a manager fanning out to founders), which owner-only
 * RLS would scope to the caller. Same posture as dispatchPush reading every
 * recipient's push_subscriptions. The owner edits go through the session client in
 * actions/notification-prefs.ts (owner-only RLS double-enforces there).
 *
 * PERFORMANCE: getNotificationPrefs is React cache()-memoised per request, so a
 * fan-out that touches one user twice is one read; filterRecipientsByPref does the
 * whole recipient list in ONE `.in('user_id', ids)` query, never N point reads.
 */

import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  isNotificationCategoryKey,
  type NotificationChannel,
} from '@/lib/constants/notification-categories';
import type { NotificationPreferenceRow } from '@/lib/types/database';

export interface ResolvedChannels {
  in_app:   boolean;
  whatsapp: boolean;
}

/** Implicit default for any (user, key) with no stored row — both channels on. */
const DEFAULT_ON: ResolvedChannels = { in_app: true, whatsapp: true };

/**
 * All of a user's mute rows as a Map<key, {in_app, whatsapp}>. React cache()
 * dedups repeat reads within one request/job. Fails open: on error returns an
 * empty map (→ every category resolves to DEFAULT_ON).
 */
export const getNotificationPrefs = cache(
  async (userId: string): Promise<Map<string, ResolvedChannels>> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notification_preferences')
      .select('notification_key, in_app, whatsapp')
      .eq('user_id', userId);

    if (error) {
      console.warn('[notification-prefs-service] getNotificationPrefs failed (fail-open):', error);
      return new Map();
    }

    const map = new Map<string, ResolvedChannels>();
    for (const row of (data ?? []) as Pick<
      NotificationPreferenceRow,
      'notification_key' | 'in_app' | 'whatsapp'
    >[]) {
      map.set(row.notification_key, { in_app: row.in_app, whatsapp: row.whatsapp });
    }
    return map;
  },
);

/**
 * Resolve a single (user, category) → channel switches. Fails open. A transactional
 * / unknown key (not in the catalog) is always fully on — it is never muteable.
 */
export async function resolveChannels(
  userId: string,
  key: string,
): Promise<ResolvedChannels> {
  // Transactional / unknown keys are never gated — hard-allow.
  if (!isNotificationCategoryKey(key)) return DEFAULT_ON;
  const prefs = await getNotificationPrefs(userId);
  return prefs.get(key) ?? DEFAULT_ON;
}

/** True when this user wants `key` on `channel`. Fails open (→ true). */
export async function isChannelEnabled(
  userId: string,
  key: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const resolved = await resolveChannels(userId, key);
  return resolved[channel];
}

/**
 * Filter a recipient-id list to those who want `key` on `channel`. ONE batched
 * `.in('user_id', ids)` query for the whole fan-out (never N point reads). Fails
 * OPEN: on error returns the input list unchanged (everyone still notified).
 *
 * Used at the founder/manager WhatsApp + in-app fan-outs so each person opts out
 * individually — the founder who muted new_lead_founder_alert drops out, the rest
 * still receive it.
 */
export async function filterRecipientsByPref(
  recipientIds: string[],
  key: string,
  channel: NotificationChannel,
): Promise<string[]> {
  if (recipientIds.length === 0) return [];
  // Transactional / unknown keys are never gated — everyone through.
  if (!isNotificationCategoryKey(key)) return recipientIds;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notification_preferences')
    .select('user_id, in_app, whatsapp')
    .eq('notification_key', key)
    .eq(channel, false) // only rows that OPTED OUT of this channel
    .in('user_id', recipientIds);

  if (error) {
    console.warn('[notification-prefs-service] filterRecipientsByPref failed (fail-open):', error);
    return recipientIds; // fail open — notify everyone
  }

  const optedOut = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
  return recipientIds.filter((id) => !optedOut.has(id));
}

/**
 * The current user's own mute rows for the /profile panel SEED. SESSION client —
 * owner-only RLS scopes it to the caller (this is a self-read, not a fan-out read).
 * Returns the raw rows; absence of a row for a category = both channels on (the UI
 * applies that default). Never throws — returns [] on error.
 */
export async function getMyNotificationPrefs(): Promise<
  Pick<NotificationPreferenceRow, 'notification_key' | 'in_app' | 'whatsapp'>[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_key, in_app, whatsapp');

  if (error) {
    console.error('[notification-prefs-service] getMyNotificationPrefs error:', error);
    return [];
  }
  return (data ?? []) as Pick<
    NotificationPreferenceRow,
    'notification_key' | 'in_app' | 'whatsapp'
  >[];
}
