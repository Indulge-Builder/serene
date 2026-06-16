import { z } from 'zod';
import { NOTIFICATION_CATEGORY_ENUM } from '@/lib/constants/notification-categories';

/**
 * SetNotificationPrefSchema — the /profile notification-preferences write payload.
 *
 * One save = one category's two channel switches for the calling user. The
 * `notificationKey` is validated against the catalog enum so a row can never be
 * written for a transactional / unknown key (lead_initiation, elaya_reply have no
 * key and can never be muted). The action upserts when either channel is off and
 * DELETEs the row when both are on (back to the implicit-on default — keeps the
 * table sparse).
 *
 * Issue messages are internal codes mapped to formErrors in the action — never
 * shown raw (Q-04).
 */
export const SetNotificationPrefSchema = z.object({
  notificationKey: z.enum(NOTIFICATION_CATEGORY_ENUM, { message: 'invalid_key' }),
  inApp:           z.boolean({ message: 'invalid_channel' }),
  whatsapp:        z.boolean({ message: 'invalid_channel' }),
});

export type SetNotificationPrefInput = z.infer<typeof SetNotificationPrefSchema>;
