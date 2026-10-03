// elaya-teammate.ts — THE vocabulary of Elaya's proactive half (migration 0257, 2026-10-03;
// docs/architecture/elaya-behaviour-contract.md "The operating teammate"). The rules here are TYPED
// data: which signal, how far ahead, which checklist labels prove it, who owns the next move, the
// ladder, the words (the founder's Tone review, section by section). The sweep in
// services/elaya-teammate.ts reads them; no model writes a nudge. Numbers live here, never inline.

export const ELAYA_TEAMMATE_PATH = '/settings/elaya-teammate';
export const TEAMMATE_SETTING_KEYS = { mode: 'elaya_teammate_mode', queendoms: 'elaya_teammate_queendoms' } as const;
export const TEAMMATE_MODES = ['off', 'shadow', 'live'] as const;
export type TeammateMode = (typeof TEAMMATE_MODES)[number];

export const INTERVENTION_KINDS = ['action_needed', 'watch', 'last_mile', 'recovery', 'opportunity', 'recognition'] as const;
export type InterventionKind = (typeof INTERVENTION_KINDS)[number];
export const INTERVENTION_STATES = ['proposed', 'delivered', 'acknowledged', 'snoozed', 'resolved', 'dismissed', 'superseded'] as const;
export type InterventionState = (typeof INTERVENTION_STATES)[number];
export const INTERVENTION_KIND_LABELS: Record<InterventionKind, string> = {
  action_needed: 'Needs a move', watch: 'Watch this', last_mile: 'Last mile', recovery: 'Win the heart back', opportunity: 'Insider note', recognition: 'Indulge Worthy',
};
export const INTERVENTION_STATE_LABELS: Record<InterventionState, string> = {
  proposed: 'Would send', delivered: 'Sent', acknowledged: 'Seen', snoozed: 'Snoozed', resolved: 'Resolved', dismissed: 'Dismissed', superseded: 'Superseded',
};
/** What a person on the page may set a row to (the sweep owns the rest). */
export const INTERVENTION_PERSON_STATES = ['acknowledged', 'snoozed', 'resolved', 'dismissed'] as const;

// ── The ladder (Tone review 25 and 26: three nudges of increasing clarity, then pull the Queen in) ──
/** After a step is delivered, the sweep looks again this long later; unacknowledged = the next step. */
export const ESCALATION_LADDER: readonly { step: number; to: 'owner' | 'bishop' | 'queen'; afterHours: number; prefix: string }[] = [
  { step: 0, to: 'owner', afterHours: 2, prefix: '' },
  { step: 1, to: 'owner', afterHours: 4, prefix: 'Bringing this back. Silence shouldn\'t make the decision for us. ' },
  { step: 2, to: 'bishop', afterHours: 12, prefix: '🚨 Still open. Either close it or pull your Queen in; don\'t leave it floating. ' },
  { step: 3, to: 'queen', afterHours: 0, prefix: '🚨 This has moved beyond follow-up. ' },
];
/** A snooze from a reply or the page lasts this long. */
export const INTERVENTION_SNOOZE_HOURS = 2;
/** A delivered row is matched to a reply only this long after it went out. */
export const INTERVENTION_REPLY_WINDOW_HOURS = 48;
/** The sweep's own budget and the rows it looks at per run. */
export const TEAMMATE_RUN_BUDGET_MS = 200_000;
export const TEAMMATE_SWEEP_LIMIT = 300;

// ── Rules: last mile on a ticket (Tone review 12 to 18: booked is not delivered) ──
export type LastMileRule = {
  id: string;
  category: string;
  /** Sub-categories the rule is for; empty = the whole category (a more specific rule wins). */
  subCategories: readonly string[];
  /** How many hours before `requested_for` the check is owed. */
  hoursBefore: number;
  /** The checklist labels that PROVE it; all ticked = nothing owed. Empty = only a person's reply can prove it. */
  labels: readonly string[];
  title: string;
  /** {member} {ticket} {when} are filled in. */
  body: string;
};
export const LAST_MILE_RULES: readonly LastMileRule[] = [
  { id: 'driver_reached', category: 'travel', subCategories: ['car_transfer', 'airport_assistance'], hoursBefore: 3, labels: [],
    title: '🚨 Last mile.', body: "{member}'s pickup is {when} ({ticket}). Cab says confirmed: has the driver actually reached, right terminal, right name board? Reply done when you have checked." },
  { id: 'ticket_issued', category: 'travel', subCategories: ['flight'], hoursBefore: 24, labels: ['Booking made', 'Confirmation sent to the member'],
    title: '🚨 Booked ≠ ticketed.', body: "{member} flies {when} ({ticket}) and the booking is not marked made and sent. One sweep now: passport name, date, sector, terminal, seat, baggage. Panic early, not at the airport." },
  { id: 'room_held', category: 'travel', subCategories: ['hotel_booking'], hoursBefore: 24, labels: ['Booking made', 'Confirmation sent to the member'],
    title: '🏨 Reservation done?', body: "{member} checks in {when} ({ticket}) and the booking is not marked made and sent. Has the front desk actually seen the preferences? Late arrival held? Call a human, don't trust the note in the system alone." },
  { id: 'travel_confirmed', category: 'travel', subCategories: [], hoursBefore: 24, labels: ['Booking made', 'Confirmation sent to the member'],
    title: '🚨 Last mile.', body: "{member}'s {ticket} is {when} and the booking is not marked made and sent to them. Confirmation is not completion: check reality now." },
  { id: 'kitchen_told', category: 'dining', subCategories: [], hoursBefore: 4, labels: ['Table or order confirmed', 'Dietary needs passed on'],
    title: '🚨 Last mile.', body: "{member}'s table is {when} ({ticket}). The reservation is not the job: has the restaurant confirmed the table AND the dietary note with the kitchen? One call now, zero embarrassment later." },
  { id: 'tickets_in_hand', category: 'events', subCategories: [], hoursBefore: 48, labels: ['Proof of tickets received', 'Names on tickets confirmed'],
    title: '🎟️ Two days out.', body: "{member}'s event is {when} ({ticket}). Do we have the actual tickets, or just a confirmation? Names right, QR opens? Event day should feel boring; the panic belongs now." },
  { id: 'gift_photographed', category: 'retail', subCategories: ['gifting'], hoursBefore: 24, labels: ['Delivery arranged'],
    title: '🎁 No blind dispatches.', body: "{member}'s gift goes {when} ({ticket}) and delivery is not marked arranged. Photo of the gift, the wrapping and the note before it leaves. Would we proudly send that picture to the member?" },
  { id: 'delivery_checked', category: 'retail', subCategories: [], hoursBefore: 24, labels: ['Delivery arranged'],
    title: '🚨 Last mile.', body: "{member}'s delivery is {when} ({ticket}) and it is not marked arranged. Box, papers, warranty checked, slot confirmed, someone home to receive it?" },
  { id: 'request_delivered', category: 'special_request', subCategories: [], hoursBefore: 24, labels: ['Delivered'],
    title: '🚨 Last mile.', body: "{member}'s request ({ticket}) is due {when}. Have we checked reality, not just the plan? Name the one thing that could still go wrong and close it." },
];
/** How far ahead the sweep reads tickets for the rules above (the largest hoursBefore). */
export const LAST_MILE_LOOKAHEAD_HOURS = 48;
/** A last-mile row stops escalating this long after the service time (the moment has passed). */
export const LAST_MILE_EXPIRE_AFTER_HOURS = 2;

// ── Rule: silence after options (Tone review 10) ──
export const SILENCE_AFTER_OPTIONS_HOURS = 48;
export const SILENCE_TITLE = '👀 Silence after options.';
export const SILENCE_BODY = "{member} hasn't answered on {ticket} for {days} days. Don't assume busy; maybe the curation didn't land. Call and check what didn't land, or ask your Queen to pressure-test the options.";

// ── Rule: a request on no ticket (Tone review 9 and 25) ──
export const UNTRACKED_REQUEST_HOURS = 6;
export const UNTRACKED_TITLE = '🚨 Still open.';
export const UNTRACKED_BODY = "{member} asked for this {hours} hours ago and it is on no ticket yet: \"{summary}\". Create the ticket or dismiss the card; don't leave it floating.";

// ── Rule: the occasions ahead, as one digest per queendom (Tone review 11 and 29) ──
export const OCCASIONS_DIGEST_DAYS = 7;
export const OCCASIONS_DIGEST_HOUR_IST = 9;
export const OCCASIONS_DIGEST_MAX_LINES = 12;
export const OCCASIONS_TITLE = '👀 Insider notes for the week.';

// ── Replies (the staff WhatsApp gate reads them before the brain) ──
export type InterventionReply = 'ack' | 'done' | 'snooze';
const ACK_WORDS = /^(ok(ay)?|noted|on it|got it|seen|checking|will do|sure|haan|ha|theek( hai)?|thik( hai)?|dekh (raha|rahi) hu|yes|yup|k|👍|👌|🙏)[.! ]*$/i;
const DONE_WORDS = /^(done|sorted|closed|confirmed|handled|checked|called|resolved|ho gaya|ho gya|kar diya|kar diya hai|done ✅|✅|✔️)[.! ]*$/i;
const SNOOZE_WORDS = /^(later|snooze|baad mein|bad me|in a bit|after some time|thodi der mein|not now)[.! ]*$/i;
/** A short reply that answers a nudge, or null when it is a real message for the brain. Pure. */
export function classifyInterventionReply(text: string): InterventionReply | null {
  const t = text.trim();
  if (!t || t.split(/\s+/).length > 5) return null;
  if (DONE_WORDS.test(t)) return 'done';
  if (SNOOZE_WORDS.test(t)) return 'snooze';
  if (ACK_WORDS.test(t)) return 'ack';
  return null;
}
export const REPLY_LINES: Record<InterventionReply, string> = {
  ack: '👍 Noted. I will not bring it back unless it is still open in a while.',
  done: '⚡ Closed. Checked before the member had to ask; that is the stuff.',
  snooze: "Fine, parked for two hours. I'll bring it back then.",
};
