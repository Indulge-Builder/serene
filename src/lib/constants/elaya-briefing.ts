// elaya-briefing.ts — THE vocabulary for Elaya's twice-daily brief (2026-09-24 rewrite).
// The founder's own spec: a 10 am brief covering yesterday 6 pm to 10 am, a 6 pm brief covering
// 10 am to 6 pm, each written from the raw record of that window (Freshdesk, the member groups,
// the profiler's tone, occasions, Zoho) under her four headings: going well, resolution gaps,
// anticipated falls, where service can be better.

export const BRIEFING_SETTING_KEY = 'daily_briefing_enabled';
export const BRIEFING_RUN_KIND = 'briefing';
export const BRIEFING_PROMPT_VERSION = 'briefing-v3';
/** IST hours: the morning brief and the evening brief, and where the overnight window starts. */
export const BRIEFING_MORNING_HOUR = 10;
export const BRIEFING_EVENING_HOUR = 18;
export const BRIEFING_OVERNIGHT_START_HOUR = 18;
/** How much of the window's record the writer reads. */
export const BRIEFING_MESSAGE_ROWS = 4000;
export const BRIEFING_MEMBER_GROUP_LINES = 40;
export const BRIEFING_INTERNAL_GROUP_LINES = 40;
export const BRIEFING_CHARS_BUDGET = 110_000;
export const BRIEFING_TICKET_ROWS = 150;
export const BRIEFING_NOTABLE_TICKETS = 40;
export const BRIEFING_TONE_ROWS = 120;
export const BRIEFING_WAITING_SHOWN = 15;
/** The writer's allowance and patience. */
export const BRIEFING_MAX_TOKENS = 4000;
export const BRIEFING_TIMEOUT_MS = 180_000;
/** A closed WhatsApp window gets a one-line template ping; this is its body cap. */
export const BRIEFING_PING_CHARS = 850;

/**
 * Staff names in the brief are the person's name as the team says it: "Ajith at Indulge" is Ajith.
 * staffShortName() strips the company suffixes a WhatsApp display name carries. A display name that
 * is only the company's ("Indulge Global") is resolved by the sender id (md5 of the WhatsApp jid,
 * the id the elaya_read views expose) through STAFF_SENDER_NAMES, which the founder fills by hand.
 */
export const STAFF_SENDER_NAMES: Record<string, string> = {
  '2979950a46dbd12a4be858c0412f3f6c': 'Charlotte',   // paired phone …6526 "Charlotte Dias At Indulge"
  'bbb8f4906a85b99c09c1f91a12f311f5': 'Shera',       // paired phone …3306 "Shera at Indulge"
  '77fd98be5b65177528c631e74b674f1e': 'Kaniisha',    // linked to Kaniisha Chamarria's Serene account
};

export function staffShortName(display: string | null | undefined, senderId?: string | null): string {
  if (senderId && STAFF_SENDER_NAMES[senderId]) return STAFF_SENDER_NAMES[senderId];
  const raw = (display ?? '').trim();
  if (!raw) return 'Staff';
  const cut = raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')                 // "(Joker)"
    .replace(/\s*@\s*indulge.*$/i, '')                  // "@Indulge"
    .replace(/\s+(at|@)\s+indulge.*$/i, '')             // "at Indulge", "At Indulge Global"
    .replace(/\s+indulge(\s+global)?(\s.*)?$/i, '')     // "Samson Indulge Global", "Kaniisha Chamarria Indulge"
    .replace(/\s+/g, ' ')
    .trim();
  return cut || raw;
}
