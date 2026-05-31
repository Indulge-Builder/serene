/** Conversation list period filter — keyed by `last_message_at` on the row. */
export const WHATSAPP_PERIODS = [
  'today',
  'this_week',
  'this_month',
  'custom',
] as const;

export type WhatsAppPeriod = (typeof WHATSAPP_PERIODS)[number];

export const WHATSAPP_PERIOD_LABELS: Record<WhatsAppPeriod, string> = {
  today:      'Today',
  this_week:  'This Week',
  this_month: 'This Month',
  custom:     'Custom',
};

export function isWhatsAppPeriod(value: string | null | undefined): value is WhatsAppPeriod {
  return !!value && (WHATSAPP_PERIODS as readonly string[]).includes(value);
}
