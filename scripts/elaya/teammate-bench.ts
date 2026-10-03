/**
 * The operating teammate's rule bench (0255). Free: no model, no database. Every rule that decides a
 * nudge is pure, so it is proven here on fixture rows: which last-mile rule a ticket gets, when a
 * candidate fires and when it stays quiet, how a row resolves on evidence, and which short replies
 * count as seen / done / later. Run after touching constants/elaya-teammate.ts or the sweep:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/elaya/teammate-bench.ts
 */
import { classifyInterventionReply } from '@/lib/constants/elaya-teammate';
import { lastMileCandidates, occasionsDigestCandidate, pickLastMileRule, resolveVerdict, silenceCandidates, untrackedCandidates, type InterventionRow, type TicketLite } from '@/lib/services/elaya-teammate';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed += 1; };

const now = new Date('2026-10-03T06:00:00Z'); // 11:30 IST
const seats = () => ({ queen: 'queen-1', bishops: ['bishop-1'], joker: null, genies: ['genie-1'] });
const name = () => 'Riya Kapoor';
const ticket = (over: Partial<TicketLite>): TicketLite => ({
  id: 't1', ticket_no: 'T-000123', member_id: 'm1', queendom_id: 'q1', group_jid: null, category: 'travel', sub_category: 'car_transfer', title: 'Airport pickup',
  checklist: [], status: 'in_delivery', requested_for: new Date(now.getTime() + 2 * 3_600_000).toISOString(), updated_at: now.toISOString(), last_member_update_at: null,
  assignee_id: 'genie-1', bishop_id: null, ...over,
});

// Which rule
check('car transfer → driver_reached', pickLastMileRule('travel', 'car_transfer')?.id === 'driver_reached');
check('flight → ticket_issued', pickLastMileRule('travel', 'flight')?.id === 'ticket_issued');
check('travel with an unknown sub-category → the category rule', pickLastMileRule('travel', 'experiences')?.id === 'travel_confirmed');
check('dining → kitchen_told', pickLastMileRule('dining', 'reservation')?.id === 'kitchen_told');
check('gifting → gift_photographed', pickLastMileRule('retail', 'gifting')?.id === 'gift_photographed');
check('a bag → delivery_checked', pickLastMileRule('retail', 'bag')?.id === 'delivery_checked');
check('an itinerary has no last-mile rule', pickLastMileRule('itinerary', null) === null);

// When it fires
const pickup = lastMileCandidates([ticket({})], name, seats, now);
check('a pickup in 2 hours fires driver_reached to the genie', pickup.length === 1 && pickup[0].checkpoint === 'driver_reached' && pickup[0].owner_id === 'genie-1', JSON.stringify(pickup[0]?.body ?? ''));
check('the words carry the member, the ticket and the time', (pickup[0]?.body ?? '').includes('Riya Kapoor') && (pickup[0]?.body ?? '').includes('T-000123'));
check('a pickup in 9 hours is quiet (3-hour window)', lastMileCandidates([ticket({ requested_for: new Date(now.getTime() + 9 * 3_600_000).toISOString() })], name, seats, now).length === 0);
check('a pickup 3 hours ago is quiet (moment passed)', lastMileCandidates([ticket({ requested_for: new Date(now.getTime() - 3 * 3_600_000).toISOString() })], name, seats, now).length === 0);
check('a resolved ticket is quiet', lastMileCandidates([ticket({ status: 'resolved' })], name, seats, now).length === 0);
const flightTicked = ticket({ sub_category: 'flight', requested_for: new Date(now.getTime() + 20 * 3_600_000).toISOString(), checklist: [{ label: 'Booking made', done_at: now.toISOString(), done_by: 'g' }, { label: 'Confirmation sent to the member', done_at: now.toISOString(), done_by: 'g' }] });
check('a flight with the proof ticked is quiet', lastMileCandidates([flightTicked], name, seats, now).length === 0);
const flightOpen = ticket({ sub_category: 'flight', requested_for: new Date(now.getTime() + 20 * 3_600_000).toISOString(), checklist: [{ label: 'Booking made', done_at: now.toISOString(), done_by: 'g' }, { label: 'Confirmation sent to the member', done_at: null, done_by: null }] });
const fo = lastMileCandidates([flightOpen], name, seats, now);
check('a flight with one proof missing fires and names it', fo.length === 1 && (fo[0].evidence.open_labels as string[]).join() === 'Confirmation sent to the member');
check('no assignee → the bishop, then the queen', lastMileCandidates([ticket({ assignee_id: null })], name, seats, now)[0]?.owner_id === 'bishop-1');

// Silence after options
check('awaiting the member for 3 days fires', silenceCandidates([ticket({ status: 'awaiting_member', updated_at: new Date(now.getTime() - 72 * 3_600_000).toISOString() })], name, seats, now).length === 1);
check('awaiting the member for 10 hours is quiet', silenceCandidates([ticket({ status: 'awaiting_member', updated_at: new Date(now.getTime() - 10 * 3_600_000).toISOString() })], name, seats, now).length === 0);
check('a member who wrote yesterday is quiet', silenceCandidates([ticket({ status: 'awaiting_member', updated_at: new Date(now.getTime() - 72 * 3_600_000).toISOString(), last_member_update_at: new Date(now.getTime() - 20 * 3_600_000).toISOString() })], name, seats, now).length === 0);

// Untracked requests
const card = (hoursAgo: number) => ({ id: 'c1', member_id: 'm1', member_name: 'Riya Kapoor', queendom_id: 'q1', group_jid: null, summary: 'Two tickets for the Nadal match', confidence: 0.9, tone: null, first_message_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(), last_message_at: now.toISOString(), created_at: now.toISOString() });
check('a request on no ticket for 8 hours fires to the bishop', untrackedCandidates([card(8)], seats, now)[0]?.owner_id === 'bishop-1');
check('a request 2 hours old is quiet', untrackedCandidates([card(2)], seats, now).length === 0);

// Resolve on evidence
const row = (over: Partial<InterventionRow>): InterventionRow => ({
  id: 'i1', created_at: new Date(now.getTime() - 3_600_000).toISOString(), updated_at: now.toISOString(), kind: 'last_mile', subject_kind: 'ticket', subject_id: 't1', checkpoint: 'ticket_issued', dedupe_key: 'k',
  ticket_id: 't1', member_id: 'm1', group_jid: null, queendom_id: 'q1', priority: 1, title: '', body: '', observation: '', next_step: null, evidence: {}, state: 'delivered', delivery_mode: 'immediate',
  recipient_id: 'genie-1', recipient_role: 'genie', escalation_step: 0, next_check_at: null, delivery: [], acknowledged_at: null, acknowledged_by: null, snoozed_until: null, resolved_at: null, resolution: null, policy_version: null, ...over,
});
const m = new Map<string, TicketLite>([['t1', flightTicked]]);
check('the proof ticked resolves it', resolveVerdict(row({}), m, null, now)?.resolution === 'evidence:checklist');
check('a pickup whose time passed is superseded', resolveVerdict(row({ checkpoint: 'driver_reached' }), new Map([['t1', ticket({ requested_for: new Date(now.getTime() - 3 * 3_600_000).toISOString() })]]), null, now)?.resolution === 'time_passed');
check('a pickup still ahead stays open', resolveVerdict(row({ checkpoint: 'driver_reached' }), new Map([['t1', ticket({})]]), null, now) === null);
check('a member reply resolves silence', resolveVerdict(row({ kind: 'watch', checkpoint: 'silence_after_options' }), new Map([['t1', ticket({ status: 'awaiting_member', last_member_update_at: now.toISOString() })]]), null, now)?.resolution === 'evidence:member_replied');
check('a closed card resolves the untracked nudge', resolveVerdict(row({ kind: 'action_needed', subject_kind: 'intake_proposal', subject_id: 'c1', ticket_id: null }), new Map(), new Set(), now)?.resolution === 'evidence:card_closed');

// Replies
check('"done" is done', classifyInterventionReply('Done') === 'done');
check('"ho gaya" is done', classifyInterventionReply('ho gaya') === 'done');
check('"ok" is seen', classifyInterventionReply('ok') === 'ack');
check('a thumbs-up is seen', classifyInterventionReply('👍') === 'ack');
check('"later" is a snooze', classifyInterventionReply('later') === 'snooze');
check('a real question is for the brain', classifyInterventionReply('who is waiting today?') === null);
check('"done with the report, now show my tasks" is for the brain', classifyInterventionReply('done with the report, now show my tasks') === null);

// The digest
const digest = occasionsDigestCandidate('q1', 'Anishqa', seats(), '2026-10-03', [{ member: 'Riya Kapoor', kind: 'birthday', date: '2026-10-05', days_away: 2, detail: 'turns 40' }]);
check('the digest goes to the queen and reads as insider notes', digest?.owner_id === 'queen-1' && (digest?.body ?? '').includes('Riya Kapoor: birthday in 2 days'));
check('no occasions, no digest', occasionsDigestCandidate('q1', 'Anishqa', seats(), '2026-10-03', []) === null);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
