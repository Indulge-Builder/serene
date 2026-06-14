"use server";

/**
 * push.ts — server actions for Web Push device subscriptions (migration 0120).
 *
 * The browser subscribes via pushManager.subscribe() (after a user gesture, and
 * on iOS only inside the installed PWA — see usePushSubscription) and persists
 * the resulting endpoint here. One row per device; the unique key is `endpoint`,
 * so a re-subscribe on the same device upserts the existing row and re-binds it
 * to the current owner.
 *
 * Rules: Zod first (Rule 02) → requireProfile (Rule 09 / A-18) → no raw Supabase
 * in components (Rule 03 — these are the write path). Returns { data, error };
 * never throws (Rule 10).
 *
 * The save/delete run on the SESSION client so the owner-only RLS double-enforces
 * (profile_id = auth.uid()) — no admin client needed here. dispatchPush (the
 * cross-user read + dead-endpoint prune) is the only push path that needs
 * service-role.
 */

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/actions/_auth";
import {
  SavePushSubscriptionSchema,
  RemovePushSubscriptionSchema,
  type SavePushSubscriptionInput,
} from "@/lib/validations/push-schema";
import { formErrors } from "@/lib/validations/form-errors";
import type { ActionResult } from "@/lib/types/index";

/**
 * Persist (or refresh) the calling user's push subscription for one device.
 * Upsert on `endpoint` — idempotent: re-subscribing the same device touches one
 * row and re-binds it to the caller. Two devices = two rows.
 */
export async function savePushSubscriptionAction(
  input: SavePushSubscriptionInput,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = SavePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: profile.id,
        endpoint:   parsed.data.endpoint,
        p256dh:     parsed.data.p256dh,
        auth:       parsed.data.auth,
        user_agent: parsed.data.userAgent ?? null,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    console.error("[push-action] savePushSubscription failed:", error);
    return { data: null, error: formErrors.generic };
  }

  return { data: { saved: true }, error: null };
}

/**
 * Remove the calling user's subscription for one device (unsubscribe). Scoped to
 * the caller in code AND by RLS (owner-only delete). Idempotent — deleting an
 * already-gone endpoint is a no-op success.
 */
export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<ActionResult<{ removed: true }>> {
  const parsed = RemovePushSubscriptionSchema.safeParse({ endpoint });
  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("profile_id", profile.id); // two-layer guard (RLS also enforces this)

  if (error) {
    console.error("[push-action] removePushSubscription failed:", error);
    return { data: null, error: formErrors.generic };
  }

  return { data: { removed: true }, error: null };
}
