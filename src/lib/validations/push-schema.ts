import { z } from "zod";

/**
 * Web Push subscription schemas (migration 0120). The browser's
 * PushSubscription.toJSON() yields `{ endpoint, keys: { p256dh, auth } }` — this
 * schema mirrors that shape exactly. Issue messages are internal codes mapped to
 * formErrors in the action — never shown raw (Q-04).
 */

export const SavePushSubscriptionSchema = z.object({
  endpoint: z.string().url({ message: "bad_endpoint" }).max(2000, "bad_endpoint"),
  p256dh:   z.string().min(1, "bad_keys").max(500, "bad_keys"),
  auth:     z.string().min(1, "bad_keys").max(500, "bad_keys"),
  // navigator.userAgent — diagnostic only, never used for routing. Bounded + optional.
  userAgent: z.string().max(500).optional(),
});
export type SavePushSubscriptionInput = z.infer<typeof SavePushSubscriptionSchema>;

export const RemovePushSubscriptionSchema = z.object({
  endpoint: z.string().url({ message: "bad_endpoint" }).max(2000, "bad_endpoint"),
});
export type RemovePushSubscriptionInput = z.infer<typeof RemovePushSubscriptionSchema>;
