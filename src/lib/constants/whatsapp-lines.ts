// THE WhatsApp line vocabulary (0252, docs/architecture/indulge-bot-plan.md section 6).
//
// Serene runs two Gupshup numbers. `staff` is the original one: staff talk to Elaya on it and
// Serene's alerts to agents leave from it. `public` is the Indulge number anyone may message,
// answered by the public bot. A conversation belongs to the line it arrived on, and every reply,
// file or template on that conversation leaves from the same line. An agent never picks a number.
//
// Each line reads its own Gupshup app from the environment. The staff line keeps the names it
// has always had; the public line's are new. The public line's API key falls back to the staff
// one, because both apps normally live on the same Gupshup account.

export const WHATSAPP_LINES = ['staff', 'public'] as const;
export type WhatsAppLine = (typeof WHATSAPP_LINES)[number];

export const DEFAULT_WHATSAPP_LINE: WhatsAppLine = 'staff';

export function isWhatsAppLine(value: unknown): value is WhatsAppLine {
  return typeof value === 'string' && (WHATSAPP_LINES as readonly string[]).includes(value);
}

/** The chip on an inbox conversation. */
export const WHATSAPP_LINE_LABELS: Record<WhatsAppLine, string> = {
  staff: 'Serene line',
  public: 'Indulge line',
};

/** The env var NAMES each line reads (values are read at send time, never at import). */
export const WHATSAPP_LINE_ENV: Record<
  WhatsAppLine,
  { apiKey: string; appName: string; number: string; webhookSecret: string; apiKeyFallback?: string }
> = {
  staff: {
    apiKey: 'GUPSHUP_API_KEY',
    appName: 'GUPSHUP_APP_NAME',
    number: 'GUPSHUP_PARTNER_NUMBER',
    webhookSecret: 'GUPSHUP_WEBHOOK_SECRET',
  },
  public: {
    apiKey: 'GUPSHUP_PUBLIC_API_KEY',
    apiKeyFallback: 'GUPSHUP_API_KEY',
    appName: 'GUPSHUP_PUBLIC_APP_NAME',
    number: 'GUPSHUP_PUBLIC_NUMBER',
    webhookSecret: 'GUPSHUP_PUBLIC_WEBHOOK_SECRET',
  },
};
